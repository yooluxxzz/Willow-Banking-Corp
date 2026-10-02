const { randomUUID } = require('crypto');
const { getDb } = require('../database');
const { toCents, validateAmount } = require('../middleware/validation');
const { createNotification } = require('./notification');
const { logAudit } = require('./audit');
const config = require('../config');

function parseAccountId(value) {
    const text = String(value ?? '');
    return /^[1-9]\d*$/.test(text) && Number.isSafeInteger(Number(text)) ? Number(text) : null;
}

function listScheduledTransfers(userId) {
    return getDb().prepare(`SELECT s.id, s.from_account_id, s.to_account_id, s.amount, s.description, s.scheduled_for,
            s.status, s.result_message, s.created_at, s.executed_at, s.transaction_reference,
            fa.nickname AS from_nickname, fa.account_type AS from_type, substr(fa.account_number, -4) AS from_last_four,
            ta.nickname AS to_nickname, ta.account_type AS to_type, substr(ta.account_number, -4) AS to_last_four
        FROM scheduled_transfers s
        JOIN accounts fa ON fa.id = s.from_account_id
        JOIN accounts ta ON ta.id = s.to_account_id
        WHERE s.user_id = ? ORDER BY CASE WHEN s.status = 'pending' THEN 0 ELSE 1 END, s.scheduled_for, s.id DESC LIMIT 100`).all(userId);
}

function getPendingScheduledTransferCount(userId) {
    return getDb().prepare("SELECT COUNT(*) AS count FROM scheduled_transfers WHERE user_id = ? AND status = 'pending'").get(userId).count;
}

function scheduleTransfer(userId, input = {}) {
    const description = input.description ?? '';
    const fromAccountId = parseAccountId(input.fromAccountId);
    const toAccountId = parseAccountId(input.toAccountId);
    if (!fromAccountId || !toAccountId) throw new Error('Choose valid source and destination accounts.');
    if (fromAccountId === toAccountId) throw new Error('Choose two different accounts.');
    if (!validateAmount(input.amount)) throw new Error('Enter a valid positive amount with up to two decimal places.');
    if (typeof description !== 'string' || description.trim().length > 120 || /[<>\x00-\x1f\x7f]/.test(description)) {
        throw new Error('Use a description up to 120 characters without markup.');
    }
    if (typeof input.scheduledDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.scheduledDate)) {
        throw new Error('Choose a valid scheduled date in UTC.');
    }
    const scheduledAt = new Date(`${input.scheduledDate}T00:00:00.000Z`);
    if (!Number.isFinite(scheduledAt.getTime()) || scheduledAt.toISOString().slice(0, 10) !== input.scheduledDate) {
        throw new Error('Choose a valid scheduled date in UTC.');
    }
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const maxDate = today.getTime() + 366 * 24 * 60 * 60 * 1000;
    if (scheduledAt.getTime() <= today.getTime() || scheduledAt.getTime() > maxDate) {
        throw new Error('Choose a future UTC date within the next year.');
    }
    const amount = toCents(input.amount);
    if (amount > config.limits.dailyTransferCents) throw new Error('This amount exceeds the daily demo transfer limit.');

    const db = getDb();
    const accounts = db.prepare(`SELECT id, status, currency FROM accounts WHERE user_id = ? AND id IN (?, ?)`).all(userId, fromAccountId, toAccountId);
    if (accounts.length !== 2 || accounts.some(account => account.status !== 'active' || account.currency !== 'USD')) {
        throw new Error('Choose two active USD accounts that belong to you.');
    }
    const inserted = db.transaction(() => {
        const result = db.prepare(`INSERT INTO scheduled_transfers
            (user_id, from_account_id, to_account_id, amount, description, scheduled_for)
            VALUES (?, ?, ?, ?, ?, ?)`).run(userId, fromAccountId, toAccountId, amount, description.trim(), scheduledAt.toISOString());
        const owner = db.prepare('SELECT email FROM users WHERE id = ?').get(userId);
        logAudit({ actorId: userId, actorEmail: owner?.email || 'unknown', action: 'scheduled_transfer_created', targetType: 'scheduled_transfer', targetId: String(result.lastInsertRowid), metadata: { amountCents: amount, scheduledDate: input.scheduledDate } });
        return result;
    })();
    return listScheduledTransfers(userId).find(item => item.id === inserted.lastInsertRowid);
}

function cancelScheduledTransfer(userId, id) {
    const scheduleId = parseAccountId(id);
    if (!scheduleId) throw new Error('Invalid scheduled transfer.');
    const db = getDb();
    const result = db.prepare(`UPDATE scheduled_transfers SET status = 'cancelled', result_message = 'Cancelled by customer'
        WHERE id = ? AND user_id = ? AND status = 'pending' AND scheduled_for > ?`).run(scheduleId, userId, new Date().toISOString());
    return result.changes === 1;
}

function processDueScheduledTransfers(now = new Date().toISOString()) {
    const db = getDb();
    const due = db.prepare(`SELECT id FROM scheduled_transfers WHERE status = 'pending' AND scheduled_for <= ? ORDER BY scheduled_for, id LIMIT 100`).all(now);
    let completed = 0;
    for (const { id } of due) {
        const outcome = db.transaction(() => {
            const schedule = db.prepare(`SELECT * FROM scheduled_transfers WHERE id = ? AND status = 'pending' AND scheduled_for <= ?`).get(id, now);
            if (!schedule) return 'skip';
            const source = db.prepare(`SELECT a.*, u.status AS user_status, u.email AS user_email FROM accounts a
                JOIN users u ON u.id = a.user_id WHERE a.id = ? AND a.user_id = ?`).get(schedule.from_account_id, schedule.user_id);
            const destination = db.prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?').get(schedule.to_account_id, schedule.user_id);
            let failure = null;
            if (!source || !destination || source.status !== 'active' || destination.status !== 'active' || source.user_status !== 'active') {
                failure = 'One of the demo accounts is no longer active.';
            } else if (source.currency !== 'USD' || destination.currency !== 'USD') {
                failure = 'Scheduled demo transfers currently support USD accounts only.';
            } else {
                const daily = db.prepare(`SELECT COALESCE(SUM(amount), 0) AS total FROM transactions
                    WHERE account_id = ? AND type = 'transfer' AND direction = 'debit' AND date(created_at) = date('now')`).get(source.id);
                if (daily.total + schedule.amount > config.limits.dailyTransferCents) failure = 'The daily demo transfer limit would be exceeded.';
                else if (source.available_balance < schedule.amount) failure = 'Insufficient available demo funds on the scheduled date.';
            }
            if (failure) {
                db.prepare(`UPDATE scheduled_transfers SET status = 'failed', result_message = ?, executed_at = ? WHERE id = ?`).run(failure, now, id);
                logAudit({ actorId: schedule.user_id, actorEmail: source?.user_email || 'unknown', action: 'scheduled_transfer_failed', targetType: 'scheduled_transfer', targetId: String(id), metadata: { reason: failure } });
                createNotification(schedule.user_id, 'transfer', 'Scheduled demo transfer not completed', failure);
                return 'failed';
            }

            const debit = db.prepare(`UPDATE accounts SET balance = balance - ?, available_balance = available_balance - ?
                WHERE id = ? AND user_id = ? AND status = 'active' AND available_balance >= ?`).run(schedule.amount, schedule.amount, source.id, schedule.user_id, schedule.amount);
            if (debit.changes !== 1) {
                db.prepare(`UPDATE scheduled_transfers SET status = 'failed', result_message = ?, executed_at = ? WHERE id = ?`).run('Insufficient available demo funds on the scheduled date.', now, id);
                return 'failed';
            }
            db.prepare('UPDATE accounts SET balance = balance + ?, available_balance = available_balance + ? WHERE id = ? AND user_id = ? AND status = ?')
                .run(schedule.amount, schedule.amount, destination.id, schedule.user_id, 'active');
            const reference = `SCH-${randomUUID().slice(0, 8).toUpperCase()}`;
            const description = schedule.description || 'Scheduled demo transfer';
            db.prepare(`INSERT INTO transactions (reference, account_id, related_account_id, type, amount, currency, direction, status, description)
                VALUES (?, ?, ?, 'transfer', ?, 'USD', 'debit', 'completed', ?)`)
                .run(reference, source.id, destination.id, schedule.amount, description);
            db.prepare(`INSERT INTO transactions (reference, account_id, related_account_id, type, amount, currency, direction, status, description)
                VALUES (?, ?, ?, 'transfer', ?, 'USD', 'credit', 'completed', ?)`)
                .run(`${reference}-C`, destination.id, source.id, schedule.amount, `Scheduled transfer from ••••${source.account_number.slice(-4)}`);
            db.prepare(`UPDATE scheduled_transfers SET status = 'completed', transaction_reference = ?, result_message = 'Simulated transfer completed', executed_at = ? WHERE id = ?`)
                .run(reference, now, id);
            logAudit({ actorId: schedule.user_id, actorEmail: source.user_email, action: 'scheduled_transfer_completed', targetType: 'scheduled_transfer', targetId: String(id), metadata: { amountCents: schedule.amount, reference } });
            createNotification(schedule.user_id, 'transfer', 'Scheduled demo transfer completed', `Your scheduled transfer of $${(schedule.amount / 100).toFixed(2)} was simulated. No real money moved.`);
            return 'completed';
        })();
        if (outcome === 'completed') completed += 1;
    }
    return { checked: due.length, completed };
}

module.exports = { listScheduledTransfers, getPendingScheduledTransferCount, scheduleTransfer, cancelScheduledTransfer, processDueScheduledTransfers };