/**
 * Admin routes — dashboard, user management, audit logs, adjustments
 */
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { requireAdmin } = require('../middleware/auth');
const { getDb } = require('../database');
const { logAudit, getAuditLogs } = require('../services/audit');
const { getAllTransactions } = require('../services/transaction');
const { validateAmount, toCents, formatCurrency } = require('../middleware/validation');
const { createNotification } = require('../services/notification');
const { formatMoney } = require('../services/currencies');

const router = express.Router();

// Admin dashboard stats
router.get('/stats', requireAdmin, (req, res) => {
    try {
        const db = getDb();
        const totalCustomers = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'customer'").get().count;
        const totalAccounts = db.prepare('SELECT COUNT(*) as count FROM accounts').get().count;
        const totalBalance = db.prepare("SELECT COALESCE(SUM(balance), 0) as total FROM accounts WHERE status = 'active'").get().total;
        const totalTransactions = db.prepare('SELECT COUNT(*) as count FROM transactions').get().count;
        const failedTransactions = db.prepare("SELECT COUNT(*) as count FROM transactions WHERE status = 'failed'").get().count;
        const suspendedAccounts = db.prepare("SELECT COUNT(*) as count FROM users WHERE status = 'suspended'").get().count;
        const recentTransactions = db.prepare(`
      SELECT t.*, a.account_number, u.full_name
      FROM transactions t
      JOIN accounts a ON t.account_id = a.id
      JOIN users u ON a.user_id = u.id
      ORDER BY t.created_at DESC LIMIT 10
    `).all();

        res.json({
            totalCustomers,
            totalAccounts,
            totalBalance,
            totalBalanceFormatted: formatCurrency(totalBalance),
            totalTransactions,
            failedTransactions,
            suspendedAccounts,
            recentTransactions: recentTransactions.map(t => ({
                ...t,
                amountFormatted: formatCurrency(t.amount),
            })),
        });
    } catch (err) {
        console.error('[Admin] Stats error:', err.message);
        res.status(500).json({ error: 'Failed to load statistics.' });
    }
});

// User management
router.get('/users', requireAdmin, (req, res) => {
    try {
        const db = getDb();
        const { search, status, page = 1, limit = 20 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        const conditions = ["role = 'customer'"];
        const params = [];

        if (search) {
            const safeSearch = search.replace(/[%_]/g, '\\$&');
            conditions.push("(full_name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' OR customer_id LIKE ? ESCAPE '\\')");
            params.push(`%${safeSearch}%`, `%${safeSearch}%`, `%${safeSearch}%`);
        }
        if (status) {
            conditions.push('status = ?');
            params.push(status);
        }

        const where = conditions.join(' AND ');
        const total = db.prepare(`SELECT COUNT(*) as count FROM users WHERE ${where}`).get(...params).count;
        const users = db.prepare(`
      SELECT id, email, full_name, phone, role, status, customer_id, created_at
      FROM users WHERE ${where}
      ORDER BY created_at DESC LIMIT ? OFFSET ?
    `).all(...params, parseInt(limit), offset);

        res.json({ users, total, page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)) });
    } catch (err) {
        console.error('[Admin] Users error:', err.message);
        res.status(500).json({ error: 'Failed to load users.' });
    }
});

router.get('/users/:id', requireAdmin, (req, res) => {
    try {
        const db = getDb();
        const user = db.prepare(`
      SELECT id, email, full_name, phone, role, status, customer_id, status_reason, scheduled_deletion_at, created_at, updated_at
      FROM users WHERE id = ? AND role = 'customer'
    `).get(parseInt(req.params.id));

        if (!user) return res.status(404).json({ error: 'User not found.' });

        const accounts = db.prepare('SELECT * FROM accounts WHERE user_id = ?').all(user.id);
        const recentTxns = db.prepare(`
      SELECT t.* FROM transactions t
      JOIN accounts a ON t.account_id = a.id
      WHERE a.user_id = ?
      ORDER BY t.created_at DESC LIMIT 20
    `).all(user.id);

        res.json({
            user,
            accounts: accounts.map(a => ({ ...a, balanceFormatted: formatCurrency(a.balance) })),
            recentTransactions: recentTxns.map(t => ({ ...t, amountFormatted: formatCurrency(t.amount) })),
        });
    } catch (err) {
        console.error('[Admin] User detail error:', err.message);
        res.status(500).json({ error: 'Failed to load user details.' });
    }
});

// Suspend/enable/delete user
router.post('/users/:id/status', requireAdmin, (req, res) => {
    try {
        const db = getDb();
        const { status, reason, deletionType } = req.body;
        if (!['active', 'suspended', 'deleted'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status. Must be active, suspended, or deleted.' });
        }
        if ((status === 'suspended' || status === 'deleted') && !reason) {
            return res.status(400).json({ error: 'A reason is required for suspension or deletion.' });
        }

        if (Number(req.params.id) === req.session.userId) {
            return res.status(403).json({ error: 'You cannot modify your own account.' });
        }
        const user = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'customer'").get(parseInt(req.params.id));
        if (!user) return res.status(404).json({ error: 'User not found.' });

        // Prevent admin from modifying their own account
        if (user.id === req.session.userId) {
            return res.status(400).json({ error: 'You cannot modify your own account.' });
        }

        let scheduledDeletion = null;
        let effectiveStatus = status;
        let message = '';

        if (status === 'deleted' && deletionType === 'scheduled') {
            // Schedule deletion for 3 days from now instead of instant
            const deletionDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
            scheduledDeletion = deletionDate.toISOString();
            effectiveStatus = 'suspended'; // Suspend immediately, delete after 3 days
            message = `Account scheduled for deletion on ${deletionDate.toLocaleDateString()}. User is suspended in the meantime.`;
        } else if (status === 'deleted') {
            message = 'User account has been deleted immediately.';
        } else if (status === 'suspended') {
            message = 'User account has been suspended.';
        } else {
            message = 'User account has been reactivated.';
        }

        db.prepare('UPDATE users SET status = ?, status_reason = ?, scheduled_deletion_at = ?, updated_at = datetime(?) WHERE id = ?')
            .run(effectiveStatus, reason || null, scheduledDeletion, new Date().toISOString(), user.id);

        let auditAction = 'user_activated';
        if (status === 'suspended') auditAction = 'user_suspended';
        if (status === 'deleted' && deletionType === 'scheduled') auditAction = 'user_deletion_scheduled';
        if (status === 'deleted' && deletionType !== 'scheduled') auditAction = 'user_deleted';

        logAudit({
            actorId: req.session.userId,
            actorEmail: res.locals.user?.email || 'admin',
            action: auditAction,
            targetType: 'user',
            targetId: String(user.id),
            metadata: { previousStatus: user.status, newStatus: effectiveStatus, reason, deletionType: deletionType || 'instant', scheduledDeletion },
        });

        if (effectiveStatus === 'suspended') {
            const notifMsg = scheduledDeletion
                ? `Your account has been scheduled for deletion. Reason: ${reason}. It will be permanently removed in 3 days.`
                : `Your account has been suspended. Reason: ${reason}. Contact support for assistance.`;
            createNotification(user.id, 'security', 'Account Status Changed', notifMsg);
        } else if (status === 'active') {
            createNotification(user.id, 'security', 'Account Status Changed', 'Your account has been reactivated.');
        }

        res.json({ success: true, message });
    } catch (err) {
        console.error('[Admin] Status change error:', err.message);
        res.status(500).json({ error: 'Failed to update user status.' });
    }
});

// Balance adjustment
// The optional parts of this copy of Willow and the nightly job, for whoever is reviewing it.
router.get('/system', requireAdmin, (req, res) => {
    const config = require('../config');
    const budgets = require('../services/budgets');
    const assistant = require('../services/assistant').cachedStatus();
    res.json({
        marketData: { ...require('../services/market-data').getStatus(), service: require('../services/market-service').status() },
        assistant: { available: assistant.available, model: assistant.model, reason: assistant.reason },
        dailyChecks: {
            nightlyTime: config.jobs.nightlyTime,
            lastCompletedDay: budgets.lastCompletedDay(),
            nextRunAt: new Date(Date.now() + budgets.msUntil(config.jobs.nightlyTime)).toISOString(),
            activeBudgets: getDb().prepare("SELECT COUNT(*) AS n FROM budgets WHERE status = 'active'").get().n,
        },
    });
});

// Runs tonight's budget check and net-worth snapshots now, so the result can be seen without waiting.
router.post('/daily-checks', requireAdmin, async (req, res) => {
    try {
        const result = await require('../services/jobs').runDailyChecks('nightly');
        logAudit({ actorId: req.session.userId, actorEmail: res.locals.user?.email || 'admin', action: 'daily_checks_run', targetType: 'system', targetId: 'budgets', metadata: { days: result.days, checks: result.checks, alerts: result.alerts, snapshots: result.snapshots } });
        res.json(result);
    } catch (error) {
        console.error('[Admin] Daily checks failed:', error.message);
        res.status(500).json({ error: 'The daily checks could not run. See the server log.' });
    }
});

router.post('/balance-adjustment', requireAdmin, (req, res) => {
    try {
        const { accountId, amount, reason, type } = req.body;

        if (!accountId || !amount || typeof reason !== 'string' || !reason.trim()) {
            return res.status(400).json({ error: 'Account, amount, and reason are required.' });
        }
        if (reason.trim().length > 200 || /[<>\x00-\x1f]/.test(reason)) {
            return res.status(400).json({ error: 'Keep the reason under 200 characters of plain text.' });
        }
        if (!validateAmount(amount)) {
            return res.status(400).json({ error: 'Invalid amount.' });
        }
        if (!type || !['credit', 'debit'].includes(type)) {
            return res.status(400).json({ error: 'Type must be credit or debit.' });
        }

        const amountCents = toCents(amount);
        const db = getDb();

        const account = db.prepare(`
      SELECT a.*, u.id as owner_id, u.full_name as owner_name
      FROM accounts a JOIN users u ON a.user_id = u.id
      WHERE a.id = ? OR a.account_number = ?
    `).get(accountId, String(accountId));

        if (!account) return res.status(404).json({ error: 'Account not found.' });

        if (type === 'debit' && account.available_balance < amountCents) {
            return res.status(400).json({ error: 'Insufficient balance for debit adjustment.' });
        }
        const currency = account.currency || 'USD';
        const note = reason.trim();

        const reference = `ADJ-${uuidv4().slice(0, 8).toUpperCase()}`;

        const adjustment = db.transaction(() => {
            if (type === 'credit') {
                db.prepare('UPDATE accounts SET balance = balance + ?, available_balance = available_balance + ? WHERE id = ?')
                    .run(amountCents, amountCents, account.id);
            } else {
                const debit = db.prepare('UPDATE accounts SET balance = balance - ?, available_balance = available_balance - ? WHERE id = ? AND available_balance >= ?')
                    .run(amountCents, amountCents, account.id, amountCents);
                if (debit.changes !== 1) throw Object.assign(new Error('Insufficient balance for debit adjustment.'), { status: 400 });
            }

            // Recorded in the account's own currency.
            db.prepare(`
        INSERT INTO transactions (reference, account_id, type, amount, currency, direction, status, description)
        VALUES (?, ?, 'adjustment', ?, ?, ?, 'completed', ?)
      `).run(reference, account.id, amountCents, currency, type, `Admin adjustment: ${note}`);
        });

        adjustment();

        logAudit({
            actorId: req.session.userId,
            actorEmail: res.locals.user?.email || 'admin',
            action: 'balance_adjustment',
            targetType: 'account',
            targetId: String(account.id),
            metadata: { amount: amountCents, currency, type, reason: note, reference, accountOwner: account.owner_name },
        });

        createNotification(account.owner_id, 'info', 'Balance adjustment',
            `An administrative ${type} of ${formatMoney(amountCents, currency)} was applied. Reason: ${note}`);

        res.json({ success: true, reference });
    } catch (err) {
        if (err.status === 400) return res.status(400).json({ error: err.message });
        console.error('[Admin] Adjustment error:', err.message);
        res.status(500).json({ error: 'Failed to process adjustment.' });
    }
});

// Transactions (admin-level)
router.get('/transactions', requireAdmin, (req, res) => {
    try {
        const result = getAllTransactions({
            page: parseInt(req.query.page) || 1,
            limit: parseInt(req.query.limit) || 20,
            type: req.query.type || undefined,
            status: req.query.status || undefined,
            search: req.query.search || undefined,
            dateFrom: req.query.dateFrom || undefined,
            dateTo: req.query.dateTo || undefined,
            sort: req.query.sort || 'desc',
        });
        res.json(result);
    } catch (err) {
        console.error('[Admin] Transactions error:', err.message);
        res.status(500).json({ error: 'Failed to load transactions.' });
    }
});

// Audit logs
router.get('/audit-log', requireAdmin, (req, res) => {
    try {
        const result = getAuditLogs({
            page: parseInt(req.query.page) || 1,
            limit: parseInt(req.query.limit) || 30,
            action: req.query.action || undefined,
            actorEmail: req.query.actor || undefined,
            dateFrom: req.query.dateFrom || undefined,
            dateTo: req.query.dateTo || undefined,
        });
        res.json(result);
    } catch (err) {
        console.error('[Admin] Audit logs error:', err.message);
        res.status(500).json({ error: 'Failed to load audit logs.' });
    }
});

module.exports = router;
