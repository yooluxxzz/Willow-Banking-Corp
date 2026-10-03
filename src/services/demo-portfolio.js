/**
 * Simulated investing. Investing cash starts at $0 and is funded only by moving
 * money in from the customer's own Willow accounts (and back out again). Orders
 * use delayed market prices and are never executed on a market.
 */
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database');
const marketData = require('./market-data');
const { logAudit } = require('./audit');
const TRADABLE = new Set(['stock', 'etf', 'fund', 'crypto']);
const TYPE_ORDER = ['stock', 'etf', 'fund', 'crypto'];
const TYPE_LABELS = { stock: 'Stocks', etf: 'ETFs', fund: 'Funds', crypto: 'Crypto', cash: 'Cash' };

function ensurePortfolio(userId) {
    const db = getDb();
    db.prepare('INSERT OR IGNORE INTO demo_portfolios (user_id, cash_cents) VALUES (?, 0)').run(userId);
    return db.prepare('SELECT user_id, cash_cents, created_at FROM demo_portfolios WHERE user_id = ?').get(userId);
}

function getPortfolio(userId) {
    const db = getDb();
    const portfolio = ensurePortfolio(userId);
    const holdings = db.prepare('SELECT symbol, quantity, average_price FROM demo_holdings WHERE user_id = ? ORDER BY symbol').all(userId);
    const activity = db.prepare('SELECT symbol, side, quantity, price, total_cents, created_at FROM demo_trades WHERE user_id = ? ORDER BY id DESC LIMIT 20').all(userId);
    return { simulated: true, cashCents: portfolio.cash_cents, cash: portfolio.cash_cents / 100, contributedCents: contributedCents(userId), holdings, activity, createdAt: portfolio.created_at };
}

/** Money moved in from Willow accounts minus money moved back out. */
function contributedCents(userId) {
    const row = getDb().prepare("SELECT COALESCE(SUM(CASE WHEN direction = 'in' THEN amount_cents ELSE -amount_cents END), 0) AS net FROM portfolio_transfers WHERE user_id = ?").get(userId);
    return row.net;
}

function cashTransfers(userId, limit = 20) {
    return getDb().prepare(`SELECT p.direction, p.amount_cents, p.reference, p.created_at, a.account_type, a.nickname, a.account_number
        FROM portfolio_transfers p LEFT JOIN accounts a ON a.id = p.account_id WHERE p.user_id = ? ORDER BY p.id DESC LIMIT ?`).all(userId, limit)
        .map(row => ({ direction: row.direction, amountCents: row.amount_cents, reference: row.reference, createdAt: row.created_at, account: row.account_number ? `${row.nickname || (row.account_type === 'savings' ? 'Savings' : 'Checking')} ··${String(row.account_number).slice(-4)}` : 'Closed account' }));
}

/**
 * Moves money between one of the customer's USD accounts and investing cash.
 * direction 'in' debits the account; 'out' credits it. Both sides are recorded
 * in the ledger in one transaction.
 */
function moveCash(userId, { accountId, direction, amount }) {
    const db = getDb();
    if (!['in', 'out'].includes(direction)) throw new Error('Choose whether to add or withdraw cash.');
    const cents = Math.round(Number(amount) * 100);
    if (!Number.isSafeInteger(cents) || cents < 1 || cents > 100000000) throw new Error('Enter an amount between $0.01 and $1,000,000.');
    const account = db.prepare("SELECT * FROM accounts WHERE id = ? AND user_id = ?").get(Number(accountId), userId);
    if (!account) throw Object.assign(new Error('Choose one of your accounts.'), { status: 404 });
    if (account.status !== 'active') throw new Error('That account is not active.');
    if ((account.currency || 'USD') !== 'USD') throw new Error('Investing cash moves to and from US dollar accounts.');
    ensurePortfolio(userId);
    const reference = `INV-${direction === 'in' ? 'IN' : 'OUT'}-${uuidv4().slice(0, 8).toUpperCase()}`;
    db.transaction(() => {
        if (direction === 'in') {
            const updated = db.prepare('UPDATE accounts SET balance = balance - ?, available_balance = available_balance - ? WHERE id = ? AND available_balance >= ?').run(cents, cents, account.id, cents);
            if (updated.changes !== 1) throw new Error('Not enough available money in that account.');
            db.prepare("UPDATE demo_portfolios SET cash_cents = cash_cents + ?, updated_at = datetime('now') WHERE user_id = ?").run(cents, userId);
        } else {
            const updated = db.prepare("UPDATE demo_portfolios SET cash_cents = cash_cents - ?, updated_at = datetime('now') WHERE user_id = ? AND cash_cents >= ?").run(cents, userId, cents);
            if (updated.changes !== 1) throw new Error('Not enough investing cash. Sell holdings first.');
            db.prepare('UPDATE accounts SET balance = balance + ?, available_balance = available_balance + ? WHERE id = ?').run(cents, cents, account.id);
        }
        db.prepare(`INSERT INTO transactions (reference, account_id, type, amount, currency, direction, status, description, category)
            VALUES (?, ?, 'transfer', ?, 'USD', ?, 'completed', ?, 'investing')`).run(reference, account.id, cents, direction === 'in' ? 'debit' : 'credit', direction === 'in' ? 'To investing cash' : 'From investing cash');
        db.prepare('INSERT INTO portfolio_transfers (user_id, account_id, direction, amount_cents, reference) VALUES (?, ?, ?, ?, ?)').run(userId, account.id, direction, cents, reference);
    })();
    logAudit({ actorId: userId, action: direction === 'in' ? 'investing_cash_added' : 'investing_cash_withdrawn', targetType: 'account', targetId: String(account.id), metadata: { amount: cents, reference } });
    return { reference, amountCents: cents, direction, portfolio: getPortfolio(userId) };
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
            if (portfolio.cash_cents < totalCents) throw new Error(portfolio.cash_cents ? 'Not enough investing cash for this order. Add cash from one of your accounts.' : 'Add cash from one of your accounts before buying.');
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
    const contributed = base.contributedCents / 100;
    return {
        simulated: true,
        contributed,
        cash,
        marketValue,
        total,
        costBasis,
        unrealized: marketValue - costBasis,
        unrealizedPercent: costBasis ? ((marketValue - costBasis) / costBasis) * 100 : 0,
        totalReturn: total - contributed,
        totalReturnPercent: contributed > 0 ? ((total - contributed) / contributed) * 100 : 0,
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
    const moves = db.prepare('SELECT direction, amount_cents, created_at FROM portfolio_transfers WHERE user_id = ? ORDER BY created_at ASC, id ASC').all(userId);
    const contributed = contributedCents(userId) / 100;
    const now = new Date();
    const windowDays = PERFORMANCE_RANGES[range] || PERFORMANCE_RANGES['6m'];
    const created = new Date(String(portfolio.created_at).replace(' ', 'T') + 'Z');
    const firstEvent = [trades[0], moves[0]].filter(Boolean).map(row => new Date(String(row.created_at).replace(' ', 'T') + 'Z')).sort((a, b) => a - b)[0] || now;
    const origin = new Date(Math.min(created.getTime(), firstEvent.getTime()));
    const start = new Date(Math.max(origin.getTime(), now.getTime() - windowDays * 86400000));
    if (!trades.length) {
        const cash = portfolio.cash_cents / 100;
        return { range, points: [{ t: start.toISOString(), v: cash }, { t: now.toISOString(), v: cash }], contributed, partial: false, simulated: true };
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
    let cash = 0;
    let tradeIndex = 0;
    let moveIndex = 0;
    const cursors = new Map(symbols.map(symbol => [symbol, 0]));
    const points = [];
    for (let day = new Date(Date.UTC(origin.getUTCFullYear(), origin.getUTCMonth(), origin.getUTCDate())); day <= now; day = new Date(day.getTime() + 86400000)) {
        const key = day.toISOString().slice(0, 10);
        while (moveIndex < moves.length && String(moves[moveIndex].created_at).slice(0, 10) <= key) {
            cash += (moves[moveIndex].direction === 'in' ? 1 : -1) * moves[moveIndex].amount_cents / 100;
            moveIndex += 1;
        }
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
    return { range, points, contributed, partial, simulated: true };
}

module.exports = { ensurePortfolio, getPortfolio, executeTrade, getWatchlist, changeWatchlist, valuePortfolio, performance, moveCash, cashTransfers, contributedCents, TYPE_LABELS };
