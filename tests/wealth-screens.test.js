const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
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
        assert.match(wealth.text, /SIMULATED ORDERS · NOT A BROKERAGE/);
        assert.match(wealth.text, /Investing cash starts at <strong>\$0<\/strong>/);
        assert.match(wealth.text, /data-cash-open="in"/);
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
    it('shows the markets list a page at a time and resets paging when the filter changes', async () => {
        const { JSDOM } = require('jsdom');
        const html = (await user.agent.get('/wealth/markets')).text;
        const instruments = (await user.agent.get('/api/wealth/instruments')).body;
        const responses = {
            '/api/wealth/instruments': instruments,
            '/api/wealth/markets': { quotes: [], unavailable: true },
            '/api/wealth/watchlist': { watchlist: [] },
        };
        const dom = new JSDOM(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, ''), { url: 'http://localhost/wealth/markets', runScripts: 'outside-only', pretendToBeVisual: true });
        const { window } = dom;
        window.fetch = async url => {
            const body = responses[String(url).split('?')[0]] || {};
            return { ok: true, status: 200, json: async () => body };
        };
        // Close the window even when an assertion fails; its refresh timer would keep the run alive.
        try {
            for (const file of ['app', 'wealth-app', 'wealth-markets']) window.eval(fs.readFileSync(path.join(__dirname, `../public/js/${file}.js`), 'utf8'));
            const doc = window.document;
            const rows = () => doc.querySelectorAll('[data-market-list] tbody tr').length;
            const settle = async () => { for (let i = 0; i < 20 && !rows(); i += 1) await new Promise(resolve => setTimeout(resolve, 10)); };
            await settle();
            const total = instruments.instruments.filter(item => item.tradable).length;
            assert.ok(total > 20, 'the universe is larger than one page');
            assert.equal(rows(), 20);
            const more = () => doc.querySelector('.wl-list-more button');
            assert.match(doc.querySelector('.wl-list-more').textContent, new RegExp(`Showing 20 of ${total}`));
            more().click();
            assert.equal(rows(), Math.min(40, total));
            assert.equal(doc.activeElement, doc.querySelectorAll('[data-market-list] tbody tr .wl-row-link')[20], 'focus moves to the first new row');
            while (more()) more().click();
            assert.equal(rows(), total);
            doc.querySelector('[data-filter="stock"]').click();
            const stocks = instruments.instruments.filter(item => item.tradable && item.type === 'stock').length;
            assert.equal(rows(), Math.min(20, stocks));
        } finally {
            window.close();
        }
    });
});
