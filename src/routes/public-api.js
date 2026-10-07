/**
 * Public, read-only market overview for signed-out pages. Cached server-side;
 * no customer data is ever returned here.
 */
const express = require('express');
const rateLimit = require('express-rate-limit');
const marketData = require('../services/market-data');
const marketService = require('../services/market-service');
const config = require('../config');

const router = express.Router();
router.use(rateLimit({ windowMs: 60 * 1000, max: config.rateLimit.publicApiMax, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests. Please slow down.' } }));
router.use((req, res, next) => { res.set('Cache-Control', 'public, max-age=30'); next(); });

const publicQuote = quote => (quote.unavailable
    ? { symbol: quote.symbol, name: quote.name, type: quote.type, unavailable: true }
    : { symbol: quote.symbol, name: quote.name, type: quote.type, price: quote.price, change: quote.change, changePercent: quote.changePercent, currency: quote.currency, asOf: quote.asOf, stale: Boolean(quote.stale) });

router.get('/market-service-status', async (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    const status = marketService.status();
    const enabled = process.env.MARKET_SERVICE_AUTOSTART !== 'false'
        && ['auto', 'service'].includes(marketData.getStatus().mode);
    const terminalErrors = new Set(['python_missing', 'yfinance_missing', 'token_mismatch']);
    if (!enabled) {
        return res.json({ ready: false, enabled: false, retryable: false });
    }
    const ready = await marketService.ready(900);
    return res.json({
        ready,
        enabled: true,
        running: status.running,
        retryable: ready || !terminalErrors.has(status.lastError),
        reason: ready ? null : status.lastError,
    });
});

router.get('/markets', async (req, res) => {
    try {
        const overview = await marketData.getMarketOverview();
        const all = [...overview.indices, ...overview.global, ...overview.popular, ...overview.crypto];
        res.json({
            indices: overview.indices.map(publicQuote),
            global: overview.global.map(publicQuote),
            popular: overview.popular.map(publicQuote),
            crypto: overview.crypto.map(publicQuote),
            unavailable: all.every(quote => quote.unavailable),
            delayed: true,
        });
    } catch (error) {
        res.status(503).json({ error: 'Market data temporarily unavailable.', unavailable: true });
    }
});

router.get('/quotes', async (req, res) => {
    const symbols = String(req.query.symbols || '').split(',').map(symbol => symbol.trim()).filter(Boolean).slice(0, 12);
    const instruments = symbols.map(symbol => marketData.getInstrument(symbol)).filter(item => item && item.tradable);
    if (!instruments.length) return res.status(400).json({ error: 'Choose supported assets.' });
    try {
        const quotes = await marketData.getQuotes(instruments.map(item => item.symbol));
        res.json({ quotes: quotes.map(publicQuote), unavailable: quotes.every(quote => quote.unavailable), delayed: true });
    } catch (error) {
        res.status(503).json({ error: 'Market data temporarily unavailable.', unavailable: true });
    }
});

router.get('/history/:symbol', async (req, res) => {
    const instrument = marketData.getInstrument(req.params.symbol);
    if (!instrument || !['index', 'stock', 'etf', 'crypto', 'fund'].includes(instrument.type)) return res.status(404).json({ error: 'This asset is unavailable.' });
    const range = ['1d', '1w', '1m'].includes(req.query.range) ? req.query.range : '1m';
    try {
        const history = await marketData.getHistory(instrument.symbol, range);
        res.json({ symbol: instrument.symbol, range, points: history.points.map(point => ({ t: point.t, v: point.close })), stale: Boolean(history.stale) });
    } catch (error) {
        res.status(503).json({ error: 'Market data temporarily unavailable.' });
    }
});

router.get('/fx', async (req, res) => {
    try {
        const rates = await marketData.getFxRates();
        res.json({ base: 'USD', rates, indicativeOnly: true, unavailable: rates.every(rate => rate.unavailable) });
    } catch (error) {
        res.status(503).json({ error: 'Exchange rates temporarily unavailable.', unavailable: true });
    }
});

module.exports = router;
