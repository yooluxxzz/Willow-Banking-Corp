const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const supertest = require('supertest');
const { createTestApp, registerAgent } = require('./setup');

describe('Wealth screens render with required disclosures', () => {
    let close, user;
    let app;
    before(async () => {
        const env = await createTestApp(); app = env.app; close = env.closeDatabase;
        user = await registerAgent(supertest, app, { email: 'render-one@example.test', password: 'RenderDemo123', fullName: 'Render One' });
    });
    after(() => close());
    it('renders portfolio, markets, asset and crypto pages with simulated-order copy and safe query handling', async () => {
        const wealth = await user.agent.get('/wealth');
        assert.equal(wealth.status, 200);
        assert.match(wealth.text, /DEMO · NOT A BROKERAGE/);
        assert.match(wealth.text, /Simulated order/);
        const markets = await user.agent.get('/wealth/markets?type=etf&q=%3Cscript%3E');
        assert.equal(markets.status, 200);
        assert.match(markets.text, /value="&lt;script&gt;"/); assert.doesNotMatch(markets.text, /value="<script>/);
        assert.match(markets.text, /aria-selected="true"[^>]*data-filter="etf"/);
        const bogus = await user.agent.get('/wealth/markets?type=bogus');
        assert.match(bogus.text, /aria-selected="true"[^>]*data-filter="all"/);
        const asset = await user.agent.get('/wealth/stocks/AAPL');
        assert.equal(asset.status, 200);
        assert.match(asset.text, /This is a simulated transaction\. No real securities are purchased\./);
        assert.match(asset.text, /Simulated order/);
        const etf = await user.agent.get('/wealth/stocks/BRK-B');
        assert.equal(etf.status, 200);
        const crypto = await user.agent.get('/crypto');
        assert.equal(crypto.status, 200);
        assert.match(crypto.text, /no public wallet addresses/);
        assert.match(crypto.text, /Send crypto/);
        assert.match(crypto.text, /Higher risk/);
        const btc = await user.agent.get('/crypto/BTC');
        assert.equal(btc.status, 200);
        assert.match(btc.text, /This is a simulated transaction\. No real crypto is purchased\./);
        assert.match(btc.text, /Higher risk/);
        assert.equal((await user.agent.get('/wealth/stocks/BTC')).status, 302);
        assert.equal((await user.agent.get('/crypto/AAPL')).status, 302);
        assert.equal((await user.agent.get('/wealth/stocks/NOPE')).status, 404);
    });
});
