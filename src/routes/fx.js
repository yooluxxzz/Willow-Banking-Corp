const express = require('express');
const { requireAuth } = require('../middleware/auth');
const fx = require('../services/fx');
const router = express.Router();

router.use(requireAuth);

router.get('/rates', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
        res.json(await fx.getRates());
    } catch (error) {
        res.status(503).json({ error: 'Exchange rates temporarily unavailable.' });
    }
});

router.get('/quote', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
        res.json(await fx.quote({ from: String(req.query.from || ''), to: String(req.query.to || ''), amount: req.query.amount }));
    } catch (error) {
        res.status(error.status || 503).json({ error: error.status ? error.message : 'Exchange rates temporarily unavailable.' });
    }
});

router.post('/convert', async (req, res) => {
    try {
        const result = await fx.convertBetweenAccounts(req.session.userId, req.body || {});
        res.status(201).json({ success: true, message: 'Simulated conversion recorded. No real currency was exchanged.', conversion: result });
    } catch (error) {
        if (!(error instanceof fx.FxError)) console.error('[FX] Error:', error.message);
        res.status(error.status || 500).json({ error: error instanceof fx.FxError ? error.message : 'Conversion failed. No money moved.', code: error.code });
    }
});

module.exports = router;
