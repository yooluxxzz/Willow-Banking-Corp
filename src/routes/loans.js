const express = require('express');
const { requireAuth } = require('../middleware/auth');
const loans = require('../services/loans');
const { sendError } = require('./helpers');
const router = express.Router();

router.post('/calculate', (req, res) => {
    try {
        res.json({ estimate: loans.calculate(req.body && req.body.kind, req.body || {}), estimateOnly: true });
    } catch (error) {
        sendError(res, error, 'Loans');
    }
});

router.use(requireAuth);
router.get('/estimates', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ estimates: loans.listEstimates(req.session.userId) });
});
router.post('/estimates', (req, res) => {
    try {
        res.status(201).json({ estimates: loans.saveEstimate(req.session.userId, req.body || {}), message: 'Estimate saved to your profile. This is not a loan offer.' });
    } catch (error) {
        sendError(res, error, 'Loans');
    }
});
router.delete('/estimates/:id', (req, res) => {
    if (!/^[1-9]\d*$/.test(req.params.id)) return res.status(400).json({ error: 'Invalid estimate.' });
    try {
        res.json({ estimates: loans.deleteEstimate(req.session.userId, Number(req.params.id)) });
    } catch (error) {
        sendError(res, error, 'Loans');
    }
});

module.exports = router;
