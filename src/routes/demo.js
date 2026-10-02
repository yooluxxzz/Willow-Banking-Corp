const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { loadSampleData } = require('../services/demo-data');
const router = express.Router();

router.post('/sample-data', requireAuth, async (req, res) => {
    try {
        const result = await loadSampleData(req.session.userId, { business: req.body && req.body.business === true });
        res.status(201).json({
            success: true,
            simulated: true,
            message: result.portfolio.seeded
                ? 'Sample activity added. Everything is simulated — no real money moved.'
                : 'Sample banking activity added. The demo portfolio was left empty because market data is unavailable right now.',
            portfolioSeeded: result.portfolio.seeded,
        });
    } catch (error) {
        res.status(error.status || 400).json({ error: error.message || 'Sample activity could not be added.' });
    }
});

module.exports = router;
