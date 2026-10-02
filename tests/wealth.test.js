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
        assert.match(page.text, /DEMO · NOT A BROKERAGE/);
        assert.match(page.text, /Simulated order/);
        assert.equal((await supertest(app).get('/loans')).status, 200);
        assert.equal((await supertest(app).get('/help')).status, 200);
    });

    it('keeps simulated cash, holdings and orders isolated from the banking ledger and other users', () => {
        const userId = db.prepare('SELECT id FROM users WHERE email = ?').get('wealth-one@example.test').id;
        const otherUserId = db.prepare('SELECT id FROM users WHERE email = ?').get('wealth-two@example.test').id;
        const accountBalanceBefore = db.prepare('SELECT SUM(balance) AS balance FROM accounts WHERE user_id = ?').get(userId).balance;
        const before = portfolio.getPortfolio(userId);
        assert.equal(before.cashCents, 10000000);
        portfolio.executeTrade(userId, { symbol: 'AAPL', side: 'buy', quantity: 2, price: 100 });
        const after = portfolio.getPortfolio(userId);
        assert.equal(after.cashCents, 9980000);
        assert.deepEqual(after.holdings, [{ symbol: 'AAPL', quantity: 2, average_price: 100 }]);
        assert.equal(after.activity.length, 1);
        assert.equal(db.prepare('SELECT SUM(balance) AS balance FROM accounts WHERE user_id = ?').get(userId).balance, accountBalanceBefore);
        assert.equal(portfolio.getPortfolio(otherUserId).cashCents, 10000000);
        assert.equal(portfolio.getPortfolio(otherUserId).holdings.length, 0);
    });

    it('validates trade sides, available demo cash and sellable units atomically', () => {
        const userId = db.prepare('SELECT id FROM users WHERE email = ?').get('wealth-two@example.test').id;
        assert.throws(() => portfolio.executeTrade(userId, { symbol: 'AAPL', side: 'buy', quantity: 100001, price: 1000 }), /Not enough demo cash/);
        assert.throws(() => portfolio.executeTrade(userId, { symbol: 'AAPL', side: 'sell', quantity: 1, price: 100 }), /do not hold enough/);
        assert.throws(() => portfolio.executeTrade(userId, { symbol: 'AAPL', side: 'withdraw', quantity: 1, price: 100 }), /Choose buy or sell/);
        assert.equal(portfolio.getPortfolio(userId).cashCents, 10000000);
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
            assert.ok(response.body.rates.every(rate => rate.type === 'fx'));
            assert.equal((await first.agent.get('/international')).status, 200);
        } finally {
            global.fetch = originalFetch;
        }
    });
});