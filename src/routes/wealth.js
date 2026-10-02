const express = require('express');
const { requireAuth } = require('../middleware/auth');
const marketData = require('../services/market-data');
const portfolio = require('../services/demo-portfolio');
const router = express.Router();

router.use(requireAuth);

router.get('/markets', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
        res.json({ quotes: await marketData.getMarkets() });
    } catch (error) {
        res.status(503).json({ error: 'Market data temporarily unavailable.' });
    }
});

router.get('/fx', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ rates: await marketData.getFxRates(), indicativeOnly: true });
});

router.get('/quotes/:symbol', async (req, res) => {
    const instrument = marketData.getInstrument(req.params.symbol);
    if (!instrument) return res.status(404).json({ error: 'This asset is unavailable.' });
    try {
        res.set('Cache-Control', 'no-store');
        res.json(await marketData.getQuote(instrument.symbol, req.query.range));
    } catch (error) {
        res.status(503).json({ error: 'Market data temporarily unavailable.' });
    }
});

router.get('/portfolio', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ portfolio: portfolio.getPortfolio(req.session.userId), watchlist: portfolio.getWatchlist(req.session.userId) });
});

router.post('/watchlist', (req, res) => {
    try {
        res.json({ watchlist: portfolio.changeWatchlist(req.session.userId, req.body.symbol, true) });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.delete('/watchlist/:symbol', (req, res) => {
    try {
        res.json({ watchlist: portfolio.changeWatchlist(req.session.userId, req.params.symbol, false) });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.post('/trades', async (req, res) => {
    const instrument = marketData.getInstrument(req.body.symbol);
    if (!instrument || !['stock', 'etf', 'crypto'].includes(instrument.type)) return res.status(400).json({ error: 'Choose a supported demo asset.' });
    try {
        const quote = await marketData.getQuote(instrument.symbol);
        if (quote.stale) return res.status(503).json({ error: 'Market data is stale. Orders are unavailable until a fresh quote can be retrieved.' });
        const result = portfolio.executeTrade(req.session.userId, { ...req.body, symbol: instrument.symbol, price: quote.price });
        res.status(201).json({ message: 'Simulated order recorded. No real assets were purchased or sold.', portfolio: result });
    } catch (error) {
        const unavailable = /temporarily unavailable/i.test(error.message);
        res.status(unavailable ? 503 : 400).json({ error: unavailable ? 'Market data temporarily unavailable.' : error.message });
    }
});

module.exports = router;