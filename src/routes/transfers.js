/** Simulated transfers, using the existing atomic ledger service. */
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { executeTransfer } = require('../services/transfer');
const { getDb } = require('../database');
const { toCents, validateAmount, validateEmail, formatCurrency } = require('../middleware/validation');
const payees = require('../services/payees');
const router = express.Router();

router.post('/', requireAuth, (req, res) => {
    try {
        const { fromAccountId, toAccountId, recipientEmail, amount, description, savePayee } = req.body;
        const sourceId = Number(fromAccountId);
        if (!Number.isSafeInteger(sourceId) || sourceId <= 0 || !validateAmount(amount)) {
            return res.status(400).json({ error: 'Choose a source account and a valid positive amount with up to two decimal places.', code: 'invalid_amount' });
        }
        if (description !== undefined && (typeof description !== 'string' || description.length > 200)) {
            return res.status(400).json({ error: 'Description must be text of up to 200 characters.' });
        }
        const db = getDb();
        const source = db.prepare('SELECT id, currency FROM accounts WHERE id = ? AND user_id = ? AND status = ?').get(sourceId, req.session.userId, 'active');
        if (!source) return res.status(400).json({ error: 'Source account not found or you do not have access.' });

        let recipientAccount;
        let recipientUser = null;
        if (toAccountId !== undefined && toAccountId !== '') {
            const targetId = Number(toAccountId);
            if (!Number.isSafeInteger(targetId) || targetId <= 0 || recipientEmail) {
                return res.status(400).json({ error: 'Choose one valid destination for your transfer.' });
            }
            recipientAccount = db.prepare('SELECT account_number, currency FROM accounts WHERE id = ? AND user_id = ? AND status = ?').get(targetId, req.session.userId, 'active');
            if (!recipientAccount) return res.status(400).json({ error: 'Destination account not found or you do not have access.' });
        } else {
            if (!validateEmail(recipientEmail)) return res.status(400).json({ error: 'Enter a valid recipient email address.' });
            recipientUser = db.prepare('SELECT id, status, full_name FROM users WHERE email = ? COLLATE NOCASE').get(recipientEmail.trim());
            if (!recipientUser) return res.status(400).json({ error: 'No user found with the provided email address.', code: 'recipient_not_found' });
            if (recipientUser.id === req.session.userId) return res.status(400).json({ error: 'To move money between your own accounts, choose one of your accounts as the destination.' });
            if (recipientUser.status !== 'active') return res.status(400).json({ error: 'The recipient account is not active.' });
            recipientAccount = db.prepare("SELECT account_number, currency FROM accounts WHERE user_id = ? AND account_type = 'checking' AND status = 'active' AND currency = ? ORDER BY CASE WHEN purpose = 'personal' THEN 0 ELSE 1 END, id LIMIT 1").get(recipientUser.id, source.currency || 'USD');
            if (!recipientAccount) {
                return res.status(400).json({ error: source.currency === 'USD' ? 'The recipient does not have an active checking account.' : `The recipient can’t receive ${source.currency} yet. Send from a USD account instead.`, code: 'recipient_currency' });
            }
        }
        const amountCents = toCents(amount);
        const currency = source.currency || 'USD';
        const result = executeTransfer({ fromAccountId: sourceId, toAccountNumber: recipientAccount.account_number, amount, description, userId: req.session.userId });
        if (result.error) return res.status(400).json({ error: result.error, code: result.code || (/insufficient/i.test(result.error) ? 'insufficient_funds' : 'rejected') });
        if (recipientUser) {
            try {
                if (savePayee === true) payees.addPayee(req.session.userId, { email: recipientEmail });
                payees.markPaid(req.session.userId, recipientUser.id);
            } catch (error) { /* saving a payee never affects the completed transfer */ }
        }
        res.json({
            success: true,
            simulated: true,
            reference: result.reference,
            amountCents,
            currency,
            amountFormatted: formatCurrency(amountCents, currency),
            recipientName: recipientUser ? recipientUser.full_name : null,
            createdAt: new Date().toISOString(),
        });
    } catch (err) {
        console.error('[Transfer] Error:', err.message);
        res.status(500).json({ error: 'Transfer failed. Please try again.' });
    }
});
module.exports = router;
