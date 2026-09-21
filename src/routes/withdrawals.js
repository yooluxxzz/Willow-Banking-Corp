/**
 * Withdrawal routes
 */
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { requireAuth } = require('../middleware/auth');
const { getDb } = require('../database');
const { validateAmount, toCents } = require('../middleware/validation');
const { createNotification } = require('../services/notification');
const { logAudit } = require('../services/audit');

const router = express.Router();

router.post('/', requireAuth, (req, res) => {
    try {
        const { accountId, amount, description } = req.body;

        if (!accountId || !amount) {
            return res.status(400).json({ error: 'Account and amount are required.' });
        }

        if (!validateAmount(amount)) {
            return res.status(400).json({ error: 'Please enter a valid positive amount (up to 2 decimal places).' });
        }

        const amountCents = toCents(amount);
        if (amountCents <= 0) {
            return res.status(400).json({ error: 'Withdrawal amount must be greater than zero.' });
        }

        const db = getDb();
        const account = db.prepare(`
      SELECT * FROM accounts WHERE id = ? AND user_id = ?
    `).get(parseInt(accountId), req.session.userId);

        if (!account) {
            return res.status(404).json({ error: 'Account not found.' });
        }
        if (account.status !== 'active') {
            return res.status(400).json({ error: 'Account is not active.' });
        }
        if (account.available_balance < amountCents) {
            return res.status(400).json({ error: 'Insufficient funds for this withdrawal.' });
        }

        const reference = `WDR-${uuidv4().slice(0, 8).toUpperCase()}`;
        const desc = description?.trim() || 'Withdrawal';

        const withdrawal = db.transaction(() => {
            db.prepare(`
        UPDATE accounts SET balance = balance - ?, available_balance = available_balance - ?
        WHERE id = ? AND available_balance >= ?
      `).run(amountCents, amountCents, account.id, amountCents);

            const updated = db.prepare('SELECT available_balance FROM accounts WHERE id = ?').get(account.id);
            if (updated.available_balance < 0) {
                throw new Error('Insufficient funds');
            }

            db.prepare(`
        INSERT INTO transactions (reference, account_id, type, amount, currency, direction, status, description)
        VALUES (?, ?, 'withdrawal', ?, 'USD', 'debit', 'completed', ?)
      `).run(reference, account.id, amountCents, desc);
        });

        try {
            withdrawal();
        } catch (err) {
            if (err.message === 'Insufficient funds') {
                return res.status(400).json({ error: 'Insufficient funds for this withdrawal.' });
            }
            throw err;
        }

        try {
            createNotification(req.session.userId, 'withdrawal', 'Withdrawal Processed',
                `$${Number(amount).toFixed(2)} has been withdrawn from your account (Ref: ${reference})`);
        } catch (e) { /* non-critical */ }

        res.json({ success: true, reference });

        logAudit({
            actorId: req.session.userId,
            actorEmail: res.locals.user?.email || 'unknown',
            action: 'withdrawal',
            targetType: 'account',
            targetId: String(account.id),
            metadata: { amount: amountCents, reference },
        });
    } catch (err) {
        console.error('[Withdrawal] Error:', err.message);
        res.status(500).json({ error: 'Withdrawal failed. Please try again.' });
    }
});

module.exports = router;
