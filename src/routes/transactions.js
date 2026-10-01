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
        const q = req.query;
        for (const key of ['accountId', 'page', 'limit', 'type', 'status', 'search', 'dateFrom', 'dateTo', 'sort']) {
            if (q[key] !== undefined && typeof q[key] !== 'string') return res.status(400).json({ error: 'Invalid transaction filter.' });
        }
        const positive = value => /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value));
        if (q.accountId !== undefined && !positive(q.accountId)) return res.status(400).json({ error: 'Invalid account ID.' });
        if ((q.page !== undefined && (!positive(q.page) || Number(q.page) > 100000)) || (q.limit !== undefined && (!positive(q.limit) || Number(q.limit) > 100))) return res.status(400).json({ error: 'Invalid page or page size (maximum 100).' });
        if (q.type && !['transfer','deposit','withdrawal','payment','refund','adjustment'].includes(q.type)) return res.status(400).json({ error: 'Invalid transaction type.' });
        if (q.status && !['completed','pending','failed'].includes(q.status)) return res.status(400).json({ error: 'Invalid transaction status.' });
        if (q.sort && !['asc','desc'].includes(q.sort)) return res.status(400).json({ error: 'Invalid sort order.' });
        const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
        if ((q.dateFrom && !validDate(q.dateFrom)) || (q.dateTo && !validDate(q.dateTo)) || (q.dateFrom && q.dateTo && q.dateFrom > q.dateTo)) return res.status(400).json({ error: 'Choose a valid date range with the start on or before the end.' });
        if (q.search && q.search.length > 100) return res.status(400).json({ error: 'Search must be 100 characters or fewer.' });
        const accountId = q.accountId ? Number(q.accountId) : accounts[0]?.id;

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
