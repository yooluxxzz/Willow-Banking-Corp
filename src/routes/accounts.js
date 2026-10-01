/**
 * Account routes
 */
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { getUserAccounts, getAccountById, getTotalBalance } = require('../services/account');

const { getDb } = require('../database');
const { logAudit } = require('../services/audit');
const router = express.Router();

router.get('/', requireAuth, (req, res) => {
    try {
        const accounts = getUserAccounts(req.session.userId);
        const totals = getTotalBalance(req.session.userId);
        res.json({ accounts, totals });
    } catch (err) {
        console.error('[Accounts] Error:', err.message);
        res.status(500).json({ error: 'Failed to load accounts.' });
    }
});

router.get('/:id', requireAuth, (req, res) => {
    try {
        if (!/^[1-9]\d*$/.test(req.params.id) || !Number.isSafeInteger(Number(req.params.id))) return res.status(400).json({ error: 'Invalid account ID.' });
        const account = getAccountById(Number(req.params.id), req.session.userId);
        if (!account) {
            return res.status(404).json({ error: 'Account not found.' });
        }
        res.json({ account });
    } catch (err) {
        console.error('[Accounts] Error:', err.message);
        res.status(500).json({ error: 'Failed to load account.' });
    }
});

router.patch('/:id', requireAuth, (req, res) => {
    if (!/^[1-9]\d*$/.test(req.params.id) || !Number.isSafeInteger(Number(req.params.id))) return res.status(400).json({ error: 'Invalid account ID.' });
    const accountId = Number(req.params.id);
    const { nickname } = req.body;
    if (typeof nickname !== 'string' || nickname.trim().length > 40 || /[<>\x00-\x1f\x7f]/.test(nickname)) {
        return res.status(400).json({ error: 'Use up to 40 characters without markup, or leave the name blank.' });
    }
    try {
        const account = getAccountById(accountId, req.session.userId);
        if (!account) return res.status(404).json({ error: 'Account not found.' });
        getDb().transaction(() => {
            getDb().prepare('UPDATE accounts SET nickname = ? WHERE id = ? AND user_id = ?').run(nickname.trim(), accountId, req.session.userId);
            logAudit({ actorId: req.session.userId, actorEmail: res.locals.user.email, action: 'account_renamed', targetType: 'account', targetId: String(accountId) });
        })();
        res.json({ success: true, account: getAccountById(accountId, req.session.userId) });
    } catch (error) { res.status(500).json({ error: 'Could not save the account name. Please try again.' }); }
});

module.exports = router;
