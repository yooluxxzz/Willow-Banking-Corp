/**
 * Wealth API — market data (via the market-data service) and the simulated
 * portfolio, funded from the customer's own accounts. Prices for orders are
 * always taken server-side.
 */
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const marketData = require('../services/market-data');
const portfolio = require('../services/demo-portfolio');
const { formatCurrency } = require('../middleware/validation');
const router = express.Router();

router.use(requireAuth);
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

const unavailable = res => res.status(503).json({ error: 'Market data temporarily unavailable.', code: 'market_unavailable' });

router.get('/markets', async (req, res) => {
    try {
        const quotes = await marketData.getMarkets();
        res.json({ quotes, unavailable: quotes.every(quote => quote.unavailable), status: marketData.getStatus() });
    } catch (error) {
        unavailable(res);
    }
});

router.get('/instruments', (req, res) => {
    const type = typeof req.query.type === 'string' ? req.query.type : undefined;
    res.json({ instruments: marketData.listInstruments(type).filter(item => item.tradable || item.type === 'index').map(({ provider, ...item }) => item) });
});

router.get('/quotes/:symbol', async (req, res) => {
    const instrument = marketData.getInstrument(req.params.symbol);
    if (!instrument) return res.status(404).json({ error: 'This asset is unavailable.', code: 'not_found' });
    try {
        res.json(await marketData.getQuote(instrument.symbol, req.query.range));
    } catch (error) {
        unavailable(res);
    }
});

router.get('/history/:symbol', async (req, res) => {
    const instrument = marketData.getInstrument(req.params.symbol);
    if (!instrument) return res.status(404).json({ error: 'This asset is unavailable.', code: 'not_found' });
    try {
        const history = await marketData.getHistory(instrument.symbol, req.query.range);
        res.json({ symbol: instrument.symbol, range: history.range, interval: history.interval, currency: history.currency, points: history.points.map(point => ({ t: point.t, v: point.close })), stale: Boolean(history.stale), source: history.source });
    } catch (error) {
        unavailable(res);
    }
});

router.get('/profile/:symbol', async (req, res) => {
    const instrument = marketData.getInstrument(req.params.symbol);
    if (!instrument) return res.status(404).json({ error: 'This asset is unavailable.', code: 'not_found' });
    res.json({ profile: await marketData.getProfile(instrument.symbol) });
});

router.get('/news/:symbol', async (req, res) => {
    const instrument = marketData.getInstrument(req.params.symbol);
    if (!instrument) return res.status(404).json({ error: 'This asset is unavailable.', code: 'not_found' });
    res.json(await marketData.getNews(instrument.symbol, 6));
});

router.get('/portfolio', async (req, res) => {
    const userId = req.session.userId;
    try {
        res.json({ portfolio: portfolio.getPortfolio(userId), valuation: await portfolio.valuePortfolio(userId), watchlist: portfolio.getWatchlist(userId) });
    } catch (error) {
        console.error('[Wealth] Portfolio error:', error.message);
        res.status(500).json({ error: 'Your demo portfolio could not be loaded. Please try again.' });
    }
});

router.get('/cash', (req, res) => {
    const userId = req.session.userId;
    const { getDb } = require('../database');
    const accounts = getDb().prepare("SELECT id, account_type, nickname, account_number, available_balance, purpose FROM accounts WHERE user_id = ? AND status = 'active' AND currency = 'USD' ORDER BY id").all(userId)
        .map(account => ({ id: account.id, name: `${account.nickname || (account.purpose === 'business' ? 'Business checking' : account.account_type === 'savings' ? 'Savings' : 'Checking')} ··${String(account.account_number).slice(-4)}`, availableCents: account.available_balance }));
    const current = portfolio.getPortfolio(userId);
    res.json({ cashCents: current.cashCents, contributedCents: current.contributedCents, accounts, transfers: portfolio.cashTransfers(userId) });
});

router.post('/cash', (req, res) => {
    try {
        const { accountId, direction, amount } = req.body || {};
        const result = portfolio.moveCash(req.session.userId, { accountId, direction, amount });
        res.status(201).json({ ...result, message: direction === 'in' ? 'Cash added to investing.' : 'Cash moved back to your account.' });
    } catch (error) {
        res.status(error.status || 400).json({ error: error.message });
    }
});

router.get('/performance', async (req, res) => {
    try {
        res.json(await portfolio.performance(req.session.userId, req.query.range));
    } catch (error) {
        unavailable(res);
    }
});

router.get('/watchlist', async (req, res) => {
    const symbols = portfolio.getWatchlist(req.session.userId);
    const quotes = symbols.length ? await marketData.getQuotes(symbols) : [];
    res.json({ watchlist: symbols, quotes });
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
    if (!instrument || !instrument.tradable) return res.status(400).json({ error: 'Choose a supported demo asset.' });
    let quote;
    try {
        quote = await marketData.getLatestQuote(instrument.symbol);
    } catch (error) {
        return unavailable(res);
    }
    if (quote.stale) return res.status(503).json({ error: 'Market data is stale. Orders are unavailable until a fresh quote can be retrieved.', code: 'market_stale' });
    try {
        const { quantity, amount, side } = req.body;
        const result = portfolio.executeTrade(req.session.userId, { symbol: instrument.symbol, side, quantity, amount, price: quote.price });
        const trade = result.trade;
        res.status(201).json({
            message: 'Simulated order recorded. No real assets were purchased or sold.',
            simulated: true,
            receipt: {
                ...trade,
                totalFormatted: formatCurrency(trade.totalCents),
                priceSource: quote.source,
                quoteAsOf: quote.asOf,
                createdAt: new Date().toISOString(),
            },
            portfolio: result,
        });
    } catch (error) {
        const code = /investing cash|Add cash/.test(error.message) ? 'insufficient_cash' : /do not hold enough/.test(error.message) ? 'insufficient_units' : 'invalid_order';
        res.status(400).json({ error: error.message, code });
    }
});

module.exports = router;
