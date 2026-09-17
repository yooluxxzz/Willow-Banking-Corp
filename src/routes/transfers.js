/**
 * Transfer routes
 */
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { executeTransfer } = require('../services/transfer');
const { getUserAccounts } = require('../services/account');

const router = express.Router();

router.post('/', requireAuth, (req, res) => {
    try {
        const { fromAccountId, toAccountNumber, amount, description } = req.body;

        if (!fromAccountId || !toAccountNumber || !amount) {
            return res.status(400).json({ error: 'From account, recipient account number, and amount are required.' });
        }

        const result = executeTransfer({
            fromAccountId: parseInt(fromAccountId),
            toAccountNumber: toAccountNumber.trim(),
            amount,
            description,
            userId: req.session.userId,
        });

        if (result.error) {
            return res.status(400).json({ error: result.error });
        }

        res.json({ success: true, reference: result.reference });
    } catch (err) {
        console.error('[Transfer] Error:', err.message);
        res.status(500).json({ error: 'Transfer failed. Please try again.' });
    }
});

module.exports = router;
