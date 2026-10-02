const { getDb } = require('../database');
const { getInstrument } = require('./market-data');

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
    return { simulated: true, cashCents: portfolio.cash_cents, cash: portfolio.cash_cents / 100, holdings, activity };
}

function executeTrade(userId, { symbol, side, quantity, price }) {
    const instrument = getInstrument(symbol);
    const normalizedSide = typeof side === 'string' ? side.toLowerCase() : '';
    const shares = Number(quantity);
    const quote = Number(price);
    if (!instrument || !['stock', 'etf', 'crypto'].includes(instrument.type)) throw new Error('Choose a supported demo asset.');
    if (!['buy', 'sell'].includes(normalizedSide)) throw new Error('Choose buy or sell.');
    if (!Number.isFinite(shares) || shares <= 0 || shares > 1000000 || !Number.isFinite(quote) || quote <= 0) throw new Error('Enter a valid quantity and market price.');
    const notionalCents = shares * quote * 100;
    if (!Number.isSafeInteger(Math.round(notionalCents)) || notionalCents < 1) throw new Error('Order value is outside the supported demo range.');
    const totalCents = Math.round(notionalCents);

    const db = getDb();
    ensurePortfolio(userId);
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
        db.prepare('INSERT INTO demo_trades (user_id, symbol, side, quantity, price, total_cents) VALUES (?, ?, ?, ?, ?, ?)')
            .run(userId, instrument.symbol, normalizedSide, shares, quote, totalCents);
    });
    runTrade();
    return getPortfolio(userId);
}

function getWatchlist(userId) {
    return getDb().prepare('SELECT symbol FROM demo_watchlist WHERE user_id = ? ORDER BY created_at DESC').all(userId).map(row => row.symbol);
}

function changeWatchlist(userId, symbol, add) {
    const instrument = getInstrument(symbol);
    if (!instrument || !['stock', 'etf', 'crypto'].includes(instrument.type)) throw new Error('Choose a supported demo asset.');
    const db = getDb();
    if (add) db.prepare('INSERT OR IGNORE INTO demo_watchlist (user_id, symbol) VALUES (?, ?)').run(userId, instrument.symbol);
    else db.prepare('DELETE FROM demo_watchlist WHERE user_id = ? AND symbol = ?').run(userId, instrument.symbol);
    return getWatchlist(userId);
}

module.exports = { ensurePortfolio, getPortfolio, executeTrade, getWatchlist, changeWatchlist };