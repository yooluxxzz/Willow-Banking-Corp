/** Simulated transfers, using the existing atomic ledger service. */
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { executeTransfer } = require('../services/transfer');
const { getDb } = require('../database');
const { logAudit } = require('../services/audit');
const { toCents, validateAmount, validateEmail, formatCurrency } = require('../middleware/validation');
const config = require('../config');
const router = express.Router();

router.post('/', requireAuth, (req, res) => {
    try {
        const { fromAccountId, toAccountId, recipientEmail, amount, description } = req.body;
        const sourceId = Number(fromAccountId);
        if (!Number.isSafeInteger(sourceId) || sourceId <= 0 || !validateAmount(amount)) {
            return res.status(400).json({ error: 'Choose a source account and a valid positive amount with up to two decimal places.' });
        }
        if (description !== undefined && (typeof description !== 'string' || description.length > 200)) {
            return res.status(400).json({ error: 'Description must be text of up to 200 characters.' });
        }
        const db = getDb();
        const source = db.prepare('SELECT id FROM accounts WHERE id = ? AND user_id = ? AND status = ?').get(sourceId, req.session.userId, 'active');
        if (!source) return res.status(400).json({ error: 'Source account not found or you do not have access.' });

        let recipientAccount;
        if (toAccountId !== undefined && toAccountId !== '') {
            const targetId = Number(toAccountId);
            if (!Number.isSafeInteger(targetId) || targetId <= 0 || recipientEmail) {
                return res.status(400).json({ error: 'Choose one valid destination for your transfer.' });
            }
            recipientAccount = db.prepare('SELECT account_number FROM accounts WHERE id = ? AND user_id = ? AND status = ?').get(targetId, req.session.userId, 'active');
            if (!recipientAccount) return res.status(400).json({ error: 'Destination account not found or you do not have access.' });
        } else {
            if (!validateEmail(recipientEmail)) return res.status(400).json({ error: 'Enter a valid recipient email address.' });
            const recipient = db.prepare('SELECT id, status FROM users WHERE email = ? COLLATE NOCASE').get(recipientEmail.trim());
            if (!recipient) return res.status(400).json({ error: 'No user found with the provided email address.' });
            if (recipient.status !== 'active') return res.status(400).json({ error: 'The recipient account is not active.' });
            recipientAccount = db.prepare("SELECT account_number FROM accounts WHERE user_id = ? AND account_type = 'checking' AND status = 'active' ORDER BY id LIMIT 1").get(recipient.id);
            if (!recipientAccount) return res.status(400).json({ error: 'The recipient does not have an active checking account.' });
        }
        const amountCents = toCents(amount);
        const today = db.prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM transactions WHERE account_id = ? AND type = 'transfer' AND direction = 'debit' AND date(created_at) = date('now')").get(sourceId);
        if (today.total + amountCents > config.limits.dailyTransferCents) {
            return res.status(400).json({ error: 'Daily transfer limit is ' + formatCurrency(config.limits.dailyTransferCents) + '. You can transfer up to ' + formatCurrency(Math.max(0, config.limits.dailyTransferCents - today.total)) + ' more today.' });
        }
        const result = executeTransfer({ fromAccountId: sourceId, toAccountNumber: recipientAccount.account_number, amount, description, userId: req.session.userId });
        if (result.error) return res.status(400).json({ error: result.error });
        logAudit({ actorId: req.session.userId, actorEmail: res.locals.user?.email || 'unknown', action: 'transfer', targetType: 'account', targetId: String(sourceId), metadata: { amountCents, reference: result.reference, destinationType: toAccountId ? 'own-account' : 'customer' } });
        res.json({ success: true, simulated: true, reference: result.reference });
    } catch (err) {
        console.error('[Transfer] Error:', err.message);
        res.status(500).json({ error: 'Transfer failed. Please try again.' });
    }
});
module.exports = router;
