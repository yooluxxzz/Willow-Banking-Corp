/**
 * Deposit routes
 */
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { requireAuth } = require('../middleware/auth');
const { getDb } = require('../database');
const { validateAmount, toCents } = require('../middleware/validation');
const { createNotification } = require('../services/notification');

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
            return res.status(400).json({ error: 'Deposit amount must be greater than zero.' });
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

        const reference = `DEP-${uuidv4().slice(0, 8).toUpperCase()}`;
        const desc = description?.trim() || 'Deposit';

        const deposit = db.transaction(() => {
            db.prepare(`
        UPDATE accounts SET balance = balance + ?, available_balance = available_balance + ?
        WHERE id = ?
      `).run(amountCents, amountCents, account.id);

            db.prepare(`
        INSERT INTO transactions (reference, account_id, type, amount, currency, direction, status, description)
        VALUES (?, ?, 'deposit', ?, 'USD', 'credit', 'completed', ?)
      `).run(reference, account.id, amountCents, desc);
        });

        deposit();

        try {
            createNotification(req.session.userId, 'deposit', 'Deposit Received',
                `$${Number(amount).toFixed(2)} has been deposited to your account (Ref: ${reference})`);
        } catch (e) { /* non-critical */ }

        res.json({ success: true, reference });
    } catch (err) {
        console.error('[Deposit] Error:', err.message);
        res.status(500).json({ error: 'Deposit failed. Please try again.' });
    }
});

module.exports = router;
