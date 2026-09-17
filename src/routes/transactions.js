/**
 * Transaction routes
 */
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { getUserAccounts } = require('../services/account');
const { getTransactions, getTransactionById } = require('../services/transaction');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
    try {
        const accounts = getUserAccounts(req.session.userId);
        const accountId = parseInt(req.query.accountId) || accounts[0]?.id;

        if (!accountId) {
            return res.json({ transactions: [], total: 0, page: 1, totalPages: 0 });
        }

        // Verify account belongs to user
        if (!accounts.find(a => a.id === accountId)) {
            return res.status(403).json({ error: 'Access denied.' });
        }

        const result = getTransactions(accountId, {
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
        console.error('[Transactions] Error:', err.message);
        res.status(500).json({ error: 'Failed to load transactions.' });
    }
});

router.get('/:id', requireAuth, (req, res) => {
    try {
        const accounts = getUserAccounts(req.session.userId);
        for (const account of accounts) {
            const txn = getTransactionById(parseInt(req.params.id), account.id);
            if (txn) return res.json({ transaction: txn });
        }
        res.status(404).json({ error: 'Transaction not found.' });
    } catch (err) {
        console.error('[Transactions] Error:', err.message);
        res.status(500).json({ error: 'Failed to load transaction.' });
    }
});

module.exports = router;
