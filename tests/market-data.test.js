const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const marketData = require('../src/services/market-data');

describe('Server-side market data adapter', () => {
    it('parses market quotes and only requests supported historical periods', async () => {
        const originalFetch = global.fetch;
        let requestedUrl;
        global.fetch = async url => {
            requestedUrl = new URL(url);
            return {
                ok: true,
                json: async () => ({ chart: { result: [{
                    meta: { currency: 'USD', regularMarketPrice: 110, chartPreviousClose: 100, regularMarketTime: 1700000000, fiftyTwoWeekHigh: 120, fiftyTwoWeekLow: 80, regularMarketVolume: 5000, fullExchangeName: 'NASDAQ' },
                    timestamp: [1700000000, 1700086400],
                    indicators: { quote: [{ close: [105, 110] }] },
                }] } }),
            };
        };
        try {
            const quote = await marketData.getQuote('AAPL', '1w');
            assert.equal(quote.symbol, 'AAPL');
            assert.equal(quote.price, 110);
            assert.equal(quote.change, 10);
            assert.equal(quote.changePercent, 10);
            assert.equal(quote.high52Week, 120);
            assert.equal(quote.volume, 5000);
            assert.equal(quote.history.length, 2);
            assert.equal(requestedUrl.searchParams.get('range'), '5d');
            assert.equal(requestedUrl.searchParams.get('interval'), '30m');
        } finally {
            global.fetch = originalFetch;
        }
    });

    it('serves a marked stale quote when refresh fails and rejects symbols outside the allowlist', async () => {
        const originalFetch = global.fetch;
        const originalNow = Date.now;
        let now = originalNow();
        Date.now = () => now;
        global.fetch = async () => ({
            ok: true,
            json: async () => ({ chart: { result: [{ meta: { currency: 'USD', regularMarketPrice: 55, previousClose: 50, regularMarketTime: 1700000000 }, timestamp: [], indicators: { quote: [{ close: [] }] } }] } }),
        });
        try {
            const first = await marketData.getQuote('MSFT', '6m');
            now += 6 * 60 * 1000;
            global.fetch = async () => { throw new Error('offline'); };
            const stale = await marketData.getQuote('MSFT', '6m');
            assert.equal(first.price, stale.price);
            assert.equal(stale.stale, true);
            await assert.rejects(marketData.getQuote('NOT-A-SYMBOL'), /Unsupported instrument/);
            assert.equal(marketData.getInstrument('NOT-A-SYMBOL'), null);
        } finally {
            global.fetch = originalFetch;
            Date.now = originalNow;
        }
    });
});