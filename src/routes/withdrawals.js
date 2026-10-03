/**
 * Withdrawal routes
 */
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { requireAuth } = require('../middleware/auth');
const { getDb } = require('../database');
const { validateAmount, toCents, formatCurrency, isOptionalText } = require('../middleware/validation');
const { scaledLimit } = require('../services/currencies');
const { createNotification } = require('../services/notification');
const { logAudit } = require('../services/audit');
const config = require('../config');

const router = express.Router();

const DAILY_WITHDRAWAL_LIMIT_CENTS = config.limits.dailyWithdrawalCents;

router.post('/', requireAuth, (req, res) => {
    try {
        const { accountId, amount, description, category } = req.body;
        const SPEND_CATEGORIES = ['groceries', 'dining', 'transport', 'housing', 'bills', 'shopping', 'entertainment', 'health', 'travel', 'cash', 'other'];
        if (category !== undefined && category !== null && category !== '' && !SPEND_CATEGORIES.includes(category)) {
            return res.status(400).json({ error: 'Choose a category from the list.' });
        }

        if (!accountId || !amount) {
            return res.status(400).json({ error: 'Account and amount are required.' });
        }
        if (!isOptionalText(description, 140)) {
            return res.status(400).json({ error: 'Keep the note under 140 characters of plain text.' });
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

        // Daily withdrawal limit check
        const todayWithdrawals = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM transactions
      WHERE account_id = ? AND type = 'withdrawal' AND date(created_at) = date('now')
    `).get(account.id);

        const currency = account.currency || 'USD';
        const dailyLimit = scaledLimit(DAILY_WITHDRAWAL_LIMIT_CENTS, currency);
        if (todayWithdrawals.total + amountCents > dailyLimit) {
            return res.status(400).json({
                error: `Daily withdrawal limit is ${formatCurrency(dailyLimit, currency)}. You can withdraw up to ${formatCurrency(Math.max(0, dailyLimit - todayWithdrawals.total), currency)} more today.`
            });
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
        INSERT INTO transactions (reference, account_id, type, amount, currency, direction, status, description, category)
        VALUES (?, ?, 'withdrawal', ?, ?, 'debit', 'completed', ?, ?)
      `).run(reference, account.id, amountCents, account.currency || 'USD', desc, category || null);
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
            createNotification(req.session.userId, 'withdrawal', 'Demo withdrawal recorded',
                `${formatCurrency(amountCents, currency)} was withdrawn from your demo account (Ref: ${reference}). No cash was dispensed.`);
        } catch (e) { /* non-critical */ }

        logAudit({
            actorId: req.session.userId,
            actorEmail: res.locals.user?.email || 'unknown',
            action: 'withdrawal',
            targetType: 'account',
            targetId: String(account.id),
            metadata: { amount: amountCents, reference },
        });

        res.json({ success: true, simulated: true, reference, amountCents, currency });
    } catch (err) {
        console.error('[Withdrawal] Error:', err.message);
        res.status(500).json({ error: 'Withdrawal failed. Please try again.' });
    }
});

module.exports = router;
