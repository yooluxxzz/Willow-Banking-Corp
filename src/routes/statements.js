/**
 * Statement routes
 */
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { getUserAccounts } = require('../services/account');
const { getStatement, generateStatementPDF } = require('../services/statement');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
    try {
        const { accountId, dateFrom, dateTo } = req.query;

        if (!accountId || !dateFrom || !dateTo) {
            return res.json({ statement: null, message: 'Select an account and date range to view your statement.' });
        }

        const result = getStatement(parseInt(accountId), req.session.userId, { dateFrom, dateTo });
        if (result.error) {
            return res.status(400).json({ error: result.error });
        }

        res.json({ statement: result });
    } catch (err) {
        console.error('[Statements] Error:', err.message);
        res.status(500).json({ error: 'Failed to generate statement.' });
    }
});

router.get('/download', requireAuth, async (req, res) => {
    try {
        const { accountId, dateFrom, dateTo } = req.query;

        if (!accountId || !dateFrom || !dateTo) {
            return res.status(400).json({ error: 'Account and date range are required.' });
        }

        const statementData = getStatement(parseInt(accountId), req.session.userId, { dateFrom, dateTo });
        if (statementData.error) {
            return res.status(400).json({ error: statementData.error });
        }

        const pdfBuffer = await generateStatementPDF(statementData);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="willow-statement-${dateFrom}-${dateTo}.pdf"`);
        res.send(pdfBuffer);
    } catch (err) {
        console.error('[Statements] PDF Error:', err.message);
        res.status(500).json({ error: 'Failed to generate PDF.' });
    }
});

module.exports = router;
