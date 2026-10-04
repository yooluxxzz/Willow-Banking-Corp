const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.MARKET_SNAPSHOT_PATH = ''; // saved prices only where a test provides them
const marketData = require('../src/services/market-data');

/** A saved-prices file like the one `npm run prices:save` writes, for one instrument. */
function writeSnapshot(today) {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'willow-prices-')), 'market-snapshot.json');
    fs.writeFileSync(file, JSON.stringify({
        savedAt: '2026-10-02T20:00:00.000Z',
        instruments: {
            NVDA: {
                quote: { price: 120, previousClose: 100, currency: 'USD', exchange: 'NasdaqGS', high52Week: 150, low52Week: 80, asOf: '2026-10-02T20:00:00.000Z' },
                daily: [[today - 40, 90], [today - 20, 100], [today - 1, 110], [today, 120]],
                weekly: [[today - 1500, 40], [today - 700, 70], [today, 120]],
            },
        },
    }));
    return file;
}

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

    it('falls back to saved prices, marked as saved with their date, when every provider fails', async () => {
        const originalFetch = global.fetch;
        const today = Math.floor(Date.now() / 86400000);
        process.env.MARKET_SNAPSHOT_PATH = writeSnapshot(today);
        marketData.clearCache();
        let calls = 0;
        global.fetch = async () => { calls += 1; throw new Error('offline'); };
        try {
            const symbols = ['NVDA', 'AMZN', 'AAPL', 'MSFT', 'GOOGL', 'META', 'TSLA', 'JPM', 'V', 'KO', 'SPY', 'QQQ'].filter(symbol => marketData.getInstrument(symbol));
            const [quote, missing] = await marketData.getQuotes(symbols);
            assert.equal(quote.price, 120);
            assert.equal(quote.changePercent, 20);
            assert.equal(quote.saved, true);
            assert.equal(quote.stale, true);
            assert.equal(quote.source, 'saved');
            assert.equal(quote.asOf, '2026-10-02T20:00:00.000Z');
            assert.equal(missing.unavailable, true, 'instruments without saved prices stay unavailable');
            // One try of the Python service, then at most one parallel batch (6) of chart requests: after
            // a network failure the remaining symbols don't each wait for their own timeout.
            assert.ok(symbols.length > 7 && calls <= 7, `${calls} requests for ${symbols.length} symbols`);

            const month = await marketData.getHistory('NVDA', '1m');
            assert.deepEqual(month.points.map(point => point.close), [100, 110, 120]);
            assert.equal(month.saved, true);
            const fiveYears = await marketData.getHistory('NVDA', '5y');
            assert.equal(fiveYears.interval, '1wk');
            assert.equal(fiveYears.points.length, 3);
            await assert.rejects(marketData.getHistory('NVDA', '1d'), /unavailable/, 'there is no saved intraday data');
            assert.deepEqual(marketData.getStatus().savedPrices, { savedAt: '2026-10-02T20:00:00.000Z', instruments: 1 });
        } finally {
            global.fetch = originalFetch;
            process.env.MARKET_SNAPSHOT_PATH = '';
            marketData.clearCache();
        }
    });
});