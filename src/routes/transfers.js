/**
 * Transfer routes
 */
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { executeTransfer } = require('../services/transfer');
const { getUserAccounts } = require('../services/account');
const { getDb } = require('../database');
const { logAudit } = require('../services/audit');
const { toCents } = require('../middleware/validation');
const config = require('../config');

const router = express.Router();

const DAILY_TRANSFER_LIMIT_CENTS = config.limits.dailyTransferCents;

router.post('/', requireAuth, (req, res) => {
    try {
        const { fromAccountId, recipientEmail, amount, description } = req.body;

        if (!fromAccountId || !recipientEmail || !amount) {
            return res.status(400).json({ error: 'From account, recipient email, and amount are required.' });
        }

        const db = getDb();
        const recipientUser = db.prepare('SELECT id, status FROM users WHERE email = ? COLLATE NOCASE').get(recipientEmail.trim());
        if (!recipientUser) {
            return res.status(400).json({ error: 'No user found with the provided email address.' });
        }
        if (recipientUser.status !== 'active') {
            return res.status(400).json({ error: 'The recipient account is not active and cannot receive transfers.' });
        }

        const recipientAccount = db.prepare(`SELECT account_number FROM accounts WHERE user_id = ? AND account_type = 'checking' AND status = 'active' ORDER BY id ASC LIMIT 1`).get(recipientUser.id);
        if (!recipientAccount) {
            return res.status(400).json({ error: 'The recipient does not have an active checking account to receive funds.' });
        }

        // Daily transfer limit check
        const { toCents } = require('../middleware/validation');
        const amountCents = toCents(amount);
        const todayTransfers = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM transactions
      WHERE account_id = ? AND type = 'transfer' AND direction = 'debit' AND date(created_at) = date('now')
    `).get(parseInt(fromAccountId));

        if (todayTransfers.total + amountCents > DAILY_TRANSFER_LIMIT_CENTS) {
            const remaining = ((DAILY_TRANSFER_LIMIT_CENTS - todayTransfers.total) / 100).toFixed(2);
            return res.status(400).json({
                error: `Daily transfer limit is $25,000. You can transfer up to $${Math.max(0, remaining)} more today.`
            });
        }

        const result = executeTransfer({
            fromAccountId: parseInt(fromAccountId),
            toAccountNumber: recipientAccount.account_number,
            amount,
            description,
            userId: req.session.userId,
        });

        if (result.error) {
            return res.status(400).json({ error: result.error });
        }

        logAudit({
            actorId: req.session.userId,
            actorEmail: res.locals.user?.email || 'unknown',
            action: 'transfer',
            targetType: 'account',
            targetId: recipientAccount.account_number,
            metadata: { amount, reference: result.reference, recipientEmail: recipientEmail.trim() },
        });

        res.json({ success: true, reference: result.reference });
    } catch (err) {
        console.error('[Transfer] Error:', err.message);
        res.status(500).json({ error: 'Transfer failed. Please try again.' });
    }
});

module.exports = router;
