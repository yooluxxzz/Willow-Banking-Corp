/**
 * Simulated investing. A separate demo portfolio funded with $100,000 of
 * simulated cash — never connected to bank balances, never executed on a market.
 */
const { getDb } = require('../database');
const marketData = require('./market-data');

const STARTING_CASH_CENTS = 10000000;
const TRADABLE = new Set(['stock', 'etf', 'fund', 'crypto']);
const TYPE_ORDER = ['stock', 'etf', 'fund', 'crypto'];
const TYPE_LABELS = { stock: 'Stocks', etf: 'ETFs', fund: 'Funds', crypto: 'Crypto', cash: 'Cash' };

function ensurePortfolio(userId) {
    const db = getDb();
    db.prepare('INSERT OR IGNORE INTO demo_portfolios (user_id) VALUES (?)').run(userId);
    return db.prepare('SELECT user_id, cash_cents, created_at FROM demo_portfolios WHERE user_id = ?').get(userId);
}

function getPortfolio(userId) {
    const db = getDb();
    const portfolio = ensurePortfolio(userId);
    const holdings = db.prepare('SELECT symbol, quantity, average_price FROM demo_holdings WHERE user_id = ? ORDER BY symbol').all(userId);
    const activity = db.prepare('SELECT symbol, side, quantity, price, total_cents, created_at FROM demo_trades WHERE user_id = ? ORDER BY id DESC LIMIT 20').all(userId);
    return { simulated: true, cashCents: portfolio.cash_cents, cash: portfolio.cash_cents / 100, holdings, activity, createdAt: portfolio.created_at };
}

function roundQuantity(value, type) {
    const decimals = type === 'crypto' ? 8 : 6;
    const factor = 10 ** decimals;
    return Math.floor(value * factor + 1e-9) / factor;
}

function executeTrade(userId, { symbol, side, quantity, amount, price }) {
    const instrument = marketData.getInstrument(symbol);
    const normalizedSide = typeof side === 'string' ? side.toLowerCase() : '';
    const quote = Number(price);
    if (!instrument || !TRADABLE.has(instrument.type)) throw new Error('Choose a supported demo asset.');
    if (!['buy', 'sell'].includes(normalizedSide)) throw new Error('Choose buy or sell.');
    if (!Number.isFinite(quote) || quote <= 0) throw new Error('Enter a valid quantity and market price.');
    let shares = Number(quantity);
    if ((quantity === undefined || quantity === null || quantity === '') && amount !== undefined) {
        const value = Number(amount);
        if (!Number.isFinite(value) || value <= 0 || value > 1000000) throw new Error('Enter an amount between $0.01 and $1,000,000.');
        shares = roundQuantity(value / quote, instrument.type);
    }
    if (!Number.isFinite(shares) || shares <= 0 || shares > 1000000) throw new Error('Enter a valid quantity and market price.');
    const notionalCents = shares * quote * 100;
    if (!Number.isSafeInteger(Math.round(notionalCents)) || notionalCents < 1) throw new Error('Order value is outside the supported demo range.');
    const totalCents = Math.round(notionalCents);

    const db = getDb();
    ensurePortfolio(userId);
    let tradeId;
    const runTrade = db.transaction(() => {
        const portfolio = db.prepare('SELECT cash_cents FROM demo_portfolios WHERE user_id = ?').get(userId);
        const holding = db.prepare('SELECT quantity, average_price FROM demo_holdings WHERE user_id = ? AND symbol = ?').get(userId, instrument.symbol);
        if (normalizedSide === 'buy') {
            if (portfolio.cash_cents < totalCents) throw new Error('Not enough demo cash for this order.');
            const oldQuantity = holding?.quantity || 0;
            const nextQuantity = oldQuantity + shares;
            const averagePrice = ((oldQuantity * (holding?.average_price || 0)) + (shares * quote)) / nextQuantity;
            db.prepare('UPDATE demo_portfolios SET cash_cents = cash_cents - ?, updated_at = datetime(\'now\') WHERE user_id = ?').run(totalCents, userId);
            db.prepare(`INSERT INTO demo_holdings (user_id, symbol, quantity, average_price) VALUES (?, ?, ?, ?)
                ON CONFLICT(user_id, symbol) DO UPDATE SET quantity = excluded.quantity, average_price = excluded.average_price, updated_at = datetime('now')`)
                .run(userId, instrument.symbol, nextQuantity, averagePrice);
        } else {
            if (!holding || holding.quantity + 1e-9 < shares) throw new Error('You do not hold enough demo units to sell.');
            const nextQuantity = holding.quantity - shares;
            db.prepare('UPDATE demo_portfolios SET cash_cents = cash_cents + ?, updated_at = datetime(\'now\') WHERE user_id = ?').run(totalCents, userId);
            if (nextQuantity < 1e-9) db.prepare('DELETE FROM demo_holdings WHERE user_id = ? AND symbol = ?').run(userId, instrument.symbol);
            else db.prepare('UPDATE demo_holdings SET quantity = ?, updated_at = datetime(\'now\') WHERE user_id = ? AND symbol = ?').run(nextQuantity, userId, instrument.symbol);
        }
        tradeId = db.prepare('INSERT INTO demo_trades (user_id, symbol, side, quantity, price, total_cents) VALUES (?, ?, ?, ?, ?, ?)')
            .run(userId, instrument.symbol, normalizedSide, shares, quote, totalCents).lastInsertRowid;
    });
    runTrade();
    const portfolio = getPortfolio(userId);
    portfolio.trade = { id: tradeId, symbol: instrument.symbol, name: instrument.name, side: normalizedSide, quantity: shares, price: quote, totalCents };
    return portfolio;
}

function getWatchlist(userId) {
    return getDb().prepare('SELECT symbol FROM demo_watchlist WHERE user_id = ? ORDER BY created_at DESC').all(userId).map(row => row.symbol);
}

function changeWatchlist(userId, symbol, add) {
    const instrument = marketData.getInstrument(symbol);
    if (!instrument || !TRADABLE.has(instrument.type)) throw new Error('Choose a supported demo asset.');
    const db = getDb();
    if (add) {
        if (db.prepare('SELECT COUNT(*) AS count FROM demo_watchlist WHERE user_id = ?').get(userId).count >= 50) throw new Error('Your watchlist can hold up to 50 assets.');
        db.prepare('INSERT OR IGNORE INTO demo_watchlist (user_id, symbol) VALUES (?, ?)').run(userId, instrument.symbol);
    } else db.prepare('DELETE FROM demo_watchlist WHERE user_id = ? AND symbol = ?').run(userId, instrument.symbol);
    return getWatchlist(userId);
}

/** Values holdings with the latest available quotes. Falls back to cost when prices are unavailable. */
async function valuePortfolio(userId) {
    const base = getPortfolio(userId);
    const quotes = base.holdings.length ? await marketData.getQuotes(base.holdings.map(holding => holding.symbol)) : [];
    const bySymbol = new Map(quotes.map(quote => [quote.symbol, quote]));
    let marketValue = 0;
    let costBasis = 0;
    let dayChange = 0;
    let previousValue = 0;
    let priced = 0;
    const holdings = base.holdings.map(holding => {
        const instrument = marketData.getInstrument(holding.symbol) || { name: holding.symbol, type: 'stock' };
        const quote = bySymbol.get(holding.symbol);
        const hasPrice = quote && !quote.unavailable;
        const price = hasPrice ? quote.price : holding.average_price;
        const value = holding.quantity * price;
        const cost = holding.quantity * holding.average_price;
        const change = hasPrice && Number.isFinite(quote.change) ? holding.quantity * quote.change : 0;
        marketValue += value;
        costBasis += cost;
        dayChange += change;
        previousValue += value - change;
        if (hasPrice) priced += 1;
        return {
            symbol: holding.symbol,
            name: instrument.name,
            type: instrument.type,
            quantity: holding.quantity,
            averagePrice: holding.average_price,
            costBasis: cost,
            price,
            priceAvailable: Boolean(hasPrice),
            stale: Boolean(hasPrice && quote.stale),
            marketValue: value,
            dayChange: change,
            dayChangePercent: hasPrice && Number.isFinite(quote.changePercent) ? quote.changePercent : null,
            gain: value - cost,
            gainPercent: cost ? ((value - cost) / cost) * 100 : 0,
        };
    }).sort((a, b) => b.marketValue - a.marketValue);
    const cash = base.cashCents / 100;
    const total = cash + marketValue;
    holdings.forEach(holding => { holding.weight = total ? (holding.marketValue / total) * 100 : 0; });
    const allocation = TYPE_ORDER.map(type => ({ key: type, label: TYPE_LABELS[type], value: holdings.filter(holding => holding.type === type).reduce((sum, holding) => sum + holding.marketValue, 0) }))
        .concat([{ key: 'cash', label: 'Cash', value: cash }])
        .filter(item => item.value > 0);
    return {
        simulated: true,
        startingCash: STARTING_CASH_CENTS / 100,
        cash,
        marketValue,
        total,
        costBasis,
        unrealized: marketValue - costBasis,
        unrealizedPercent: costBasis ? ((marketValue - costBasis) / costBasis) * 100 : 0,
        totalReturn: total - STARTING_CASH_CENTS / 100,
        totalReturnPercent: ((total - STARTING_CASH_CENTS / 100) / (STARTING_CASH_CENTS / 100)) * 100,
        dayChange,
        dayChangePercent: previousValue + cash ? (dayChange / (previousValue + cash)) * 100 : 0,
        holdings,
        allocation,
        activity: base.activity.map(trade => { const instrument = marketData.getInstrument(trade.symbol) || {}; return { ...trade, name: instrument.name || trade.symbol, type: instrument.type || null }; }),
        pricing: !holdings.length ? 'none-held' : priced === holdings.length ? 'live' : priced ? 'partial' : 'unavailable',
        createdAt: base.createdAt,
    };
}

const PERFORMANCE_RANGES = { '1m': 31, '6m': 183, '1y': 366, all: 3650 };

/** Replays simulated trades against daily closes to chart portfolio value. */
async function performance(userId, range = '6m') {
    const db = getDb();
    const portfolio = ensurePortfolio(userId);
    const trades = db.prepare('SELECT symbol, side, quantity, price, total_cents, created_at FROM demo_trades WHERE user_id = ? ORDER BY created_at ASC, id ASC').all(userId);
    const now = new Date();
    const windowDays = PERFORMANCE_RANGES[range] || PERFORMANCE_RANGES['6m'];
    const created = new Date(String(portfolio.created_at).replace(' ', 'T') + 'Z');
    const firstTrade = trades.length ? new Date(String(trades[0].created_at).replace(' ', 'T') + 'Z') : now;
    const origin = new Date(Math.min(created.getTime(), firstTrade.getTime()));
    const start = new Date(Math.max(origin.getTime(), now.getTime() - windowDays * 86400000));
    const startCash = STARTING_CASH_CENTS / 100;
    if (!trades.length) {
        return { range, points: [{ t: start.toISOString(), v: startCash }, { t: now.toISOString(), v: startCash }], partial: false, simulated: true };
    }
    const symbols = [...new Set(trades.map(trade => trade.symbol))];
    const spanDays = (now - origin) / 86400000;
    const historyRange = spanDays <= 180 ? '6m' : spanDays <= 365 ? '1y' : '5y';
    const closes = new Map();
    let partial = false;
    await Promise.all(symbols.map(async symbol => {
        try {
            const history = await marketData.getHistory(symbol, historyRange);
            closes.set(symbol, history.points.map(point => ({ day: String(point.t).slice(0, 10), close: point.close })));
        } catch (error) {
            partial = true;
            closes.set(symbol, []);
        }
    }));
    const lastPrice = new Map();
    const quantities = new Map();
    let cash = startCash;
    let tradeIndex = 0;
    const cursors = new Map(symbols.map(symbol => [symbol, 0]));
    const points = [];
    for (let day = new Date(Date.UTC(origin.getUTCFullYear(), origin.getUTCMonth(), origin.getUTCDate())); day <= now; day = new Date(day.getTime() + 86400000)) {
        const key = day.toISOString().slice(0, 10);
        while (tradeIndex < trades.length && String(trades[tradeIndex].created_at).slice(0, 10) <= key) {
            const trade = trades[tradeIndex];
            const signed = trade.side === 'buy' ? 1 : -1;
            quantities.set(trade.symbol, (quantities.get(trade.symbol) || 0) + signed * trade.quantity);
            cash -= signed * trade.total_cents / 100;
            if (!lastPrice.has(trade.symbol)) lastPrice.set(trade.symbol, trade.price);
            tradeIndex += 1;
        }
        symbols.forEach(symbol => {
            const series = closes.get(symbol);
            let cursor = cursors.get(symbol);
            while (cursor < series.length && series[cursor].day <= key) {
                lastPrice.set(symbol, series[cursor].close);
                cursor += 1;
            }
            cursors.set(symbol, cursor);
        });
        if (day >= new Date(start.getTime() - 86400000)) {
            let value = cash;
            quantities.forEach((quantity, symbol) => { if (quantity > 1e-12) value += quantity * (lastPrice.get(symbol) || 0); });
            points.push({ t: key, v: Math.round(value * 100) / 100 });
        }
    }
    return { range, points, partial, simulated: true };
}

module.exports = { ensurePortfolio, getPortfolio, executeTrade, getWatchlist, changeWatchlist, valuePortfolio, performance, STARTING_CASH_CENTS, TYPE_LABELS };
