/**
 * Account routes
 */
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { getUserAccounts, getAccountById, getTotalBalance } = require('../services/account');

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
        const account = getAccountById(parseInt(req.params.id), req.session.userId);
        if (!account) {
            return res.status(404).json({ error: 'Account not found.' });
        }
        res.json({ account });
    } catch (err) {
        console.error('[Accounts] Error:', err.message);
        res.status(500).json({ error: 'Failed to load account.' });
    }
});

module.exports = router;
