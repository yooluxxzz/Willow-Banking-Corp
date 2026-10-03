const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const supertest = require('supertest');
const { createTestApp, registerAgent } = require('./setup');

describe('Demo wealth platform', () => {
    let app, db, close, first, second, portfolio;
    before(async () => {
        const env = await createTestApp(); app = env.app; db = env.getDb(); close = env.closeDatabase;
        first = await registerAgent(supertest, app, { email: 'wealth-one@example.test', password: 'WealthDemo123', fullName: 'Wealth One' });
        second = await registerAgent(supertest, app, { email: 'wealth-two@example.test', password: 'WealthDemo123', fullName: 'Wealth Two' });
        portfolio = require('../src/services/demo-portfolio');
    });
    after(() => close());

    it('renders the protected Wealth screen and public loan/help entry points', async () => {
        assert.equal((await supertest(app).get('/wealth')).status, 302);
        const page = await first.agent.get('/wealth');
        assert.equal(page.status, 200);
        assert.match(page.text, /NOT A BROKERAGE/);
        assert.doesNotMatch(page.text, /100,000/);
        assert.match(page.text, /Simulated order/);
        const loans = await supertest(app).get('/loans');
        assert.equal(loans.status, 302);
        assert.equal(loans.headers.location, '/borrow/personal-loans');
        assert.equal((await supertest(app).get('/borrow/personal-loans')).status, 200);
        assert.equal((await first.agent.get('/loans')).status, 200);
        assert.equal((await supertest(app).get('/help')).status, 200);
    });

    it('starts investing at $0 and funds it only from the customer’s own deposited money', async () => {
        const userId = db.prepare('SELECT id FROM users WHERE email = ?').get('wealth-one@example.test').id;
        const otherUserId = db.prepare('SELECT id FROM users WHERE email = ?').get('wealth-two@example.test').id;
        const checking = db.prepare('SELECT id FROM accounts WHERE user_id = ?').get(userId);
        assert.equal(portfolio.getPortfolio(userId).cashCents, 0);
        assert.throws(() => portfolio.executeTrade(userId, { symbol: 'AAPL', side: 'buy', quantity: 1, price: 100 }), /Add cash/);
        assert.throws(() => portfolio.moveCash(userId, { accountId: checking.id, direction: 'in', amount: '50' }), /Not enough available money/);

        // Deposit, then move part of it into investing through the API.
        assert.equal((await first.agent.post('/api/deposits').set('X-CSRF-Token', first.csrfToken).send({ accountId: checking.id, amount: '1000' })).status, 200);
        assert.equal((await first.agent.post('/api/wealth/cash').send({ accountId: checking.id, direction: 'in', amount: '500' })).status, 403, 'CSRF required');
        const moved = await first.agent.post('/api/wealth/cash').set('X-CSRF-Token', first.csrfToken).send({ accountId: checking.id, direction: 'in', amount: '500' });
        assert.equal(moved.status, 201);
        assert.equal(db.prepare('SELECT balance FROM accounts WHERE id = ?').get(checking.id).balance, 50000);
        const ledger = db.prepare("SELECT direction, amount, category FROM transactions WHERE reference = ?").get(moved.body.reference);
        assert.deepEqual(ledger, { direction: 'debit', amount: 50000, category: 'investing' });
        assert.equal(portfolio.getPortfolio(userId).cashCents, 50000);
        assert.equal(portfolio.getPortfolio(userId).contributedCents, 50000);

        portfolio.executeTrade(userId, { symbol: 'AAPL', side: 'buy', quantity: 2, price: 100 });
        const after = portfolio.getPortfolio(userId);
        assert.equal(after.cashCents, 30000);
        assert.deepEqual(after.holdings, [{ symbol: 'AAPL', quantity: 2, average_price: 100 }]);
        assert.equal(db.prepare('SELECT balance FROM accounts WHERE id = ?').get(checking.id).balance, 50000, 'orders don’t touch bank balances');

        // Withdraw back to the account; can't take out more than the uninvested cash.
        assert.throws(() => portfolio.moveCash(userId, { accountId: checking.id, direction: 'out', amount: '301' }), /Not enough investing cash/);
        portfolio.moveCash(userId, { accountId: checking.id, direction: 'out', amount: '100' });
        assert.equal(db.prepare('SELECT balance FROM accounts WHERE id = ?').get(checking.id).balance, 60000);
        assert.equal(portfolio.getPortfolio(userId).contributedCents, 40000);
        const otherChecking = db.prepare('SELECT id FROM accounts WHERE user_id = ?').get(otherUserId);
        assert.throws(() => portfolio.moveCash(userId, { accountId: otherChecking.id, direction: 'in', amount: '1' }), /Choose one of your accounts/);
        assert.equal(portfolio.getPortfolio(otherUserId).cashCents, 0);
        assert.equal(portfolio.getPortfolio(otherUserId).holdings.length, 0);
    });

    it('measures total return against money moved in, not a starting balance', async () => {
        const userId = db.prepare('SELECT id FROM users WHERE email = ?').get('wealth-one@example.test').id;
        const originalFetch = global.fetch;
        global.fetch = async () => ({ ok: true, json: async () => ({ chart: { result: [{ meta: { currency: 'USD', regularMarketPrice: 150, chartPreviousClose: 140 }, timestamp: [], indicators: { quote: [{ close: [] }] } }] } }) });
        try {
            const valuation = await portfolio.valuePortfolio(userId);
            assert.equal(valuation.contributed, 400);
            assert.equal(valuation.cash, 200);
            assert.equal(valuation.marketValue, 300);
            assert.equal(valuation.totalReturn, 100);
            assert.equal(Math.round(valuation.totalReturnPercent), 25);
        } finally {
            global.fetch = originalFetch;
        }
    });

    it('validates trade sides, available demo cash and sellable units atomically', () => {
        const userId = db.prepare('SELECT id FROM users WHERE email = ?').get('wealth-two@example.test').id;
        assert.throws(() => portfolio.executeTrade(userId, { symbol: 'AAPL', side: 'buy', quantity: 100001, price: 1000 }), /Add cash/);
        assert.throws(() => portfolio.executeTrade(userId, { symbol: 'AAPL', side: 'sell', quantity: 1, price: 100 }), /do not hold enough/);
        assert.throws(() => portfolio.executeTrade(userId, { symbol: 'AAPL', side: 'withdraw', quantity: 1, price: 100 }), /Choose buy or sell/);
        assert.equal(portfolio.getPortfolio(userId).cashCents, 0);
        assert.equal(portfolio.getPortfolio(userId).activity.length, 0);
    });

    it('isolates watchlists and enforces authentication, CSRF and symbol allowlists', async () => {
        const firstId = db.prepare('SELECT id FROM users WHERE email = ?').get('wealth-one@example.test').id;
        const secondId = db.prepare('SELECT id FROM users WHERE email = ?').get('wealth-two@example.test').id;
        portfolio.changeWatchlist(firstId, 'BTC', true);
        assert.deepEqual(portfolio.getWatchlist(firstId), ['BTC']);
        assert.deepEqual(portfolio.getWatchlist(secondId), []);
        assert.throws(() => portfolio.changeWatchlist(firstId, 'FAKE', true), /supported demo asset/);
        assert.equal((await supertest(app).get('/api/wealth/portfolio').set('Accept', 'application/json')).status, 401);
        assert.equal((await first.agent.post('/api/wealth/watchlist').send({ symbol: 'MSFT' })).status, 403);
        const invalidQuote = await first.agent.get('/api/wealth/quotes/FAKE').set('Accept', 'application/json');
        assert.equal(invalidQuote.status, 404);
    });

    it('records authenticated orders using server-side quotes and never accepts a client price', async () => {
        const originalFetch = global.fetch;
        global.fetch = async () => ({
            ok: true,
            json: async () => ({ chart: { result: [{ meta: { currency: 'USD', regularMarketPrice: 40, chartPreviousClose: 38 }, timestamp: [], indicators: { quote: [{ close: [] }] } }] } }),
        });
        try {
            const response = await first.agent.post('/api/wealth/trades')
                .set('X-CSRF-Token', first.csrfToken)
                .send({ symbol: 'MSFT', side: 'buy', quantity: 2, price: 0.01 });
            assert.equal(response.status, 201);
            assert.match(response.body.message, /No real assets were purchased/);
            assert.equal(response.body.portfolio.holdings.find(item => item.symbol === 'MSFT').average_price, 40);
        } finally {
            global.fetch = originalFetch;
        }
    });

    it('returns indicative FX quotes only through the authenticated demo endpoint', async () => {
        const originalFetch = global.fetch;
        global.fetch = async () => ({
            ok: true,
            json: async () => ({ chart: { result: [{ meta: { currency: 'USD', regularMarketPrice: 1.1, previousClose: 1.09 }, timestamp: [], indicators: { quote: [{ close: [] }] } }] } }),
        });
        try {
            assert.equal((await supertest(app).get('/api/wealth/fx').set('Accept', 'application/json')).status, 401);
            const response = await first.agent.get('/api/wealth/fx').set('Accept', 'application/json');
            assert.equal(response.status, 200);
            assert.equal(response.body.indicativeOnly, true);
            assert.equal(response.body.rates.length, 4);
            assert.deepEqual(response.body.rates.map(rate => rate.currency).sort(), ['EUR', 'GBP', 'MZN', 'ZAR']);
            assert.equal((await first.agent.get('/international')).status, 200);
        } finally {
            global.fetch = originalFetch;
        }
    });
});