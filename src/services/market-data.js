const SYMBOLS = {
    AAPL: { name: 'Apple', type: 'stock' },
    MSFT: { name: 'Microsoft', type: 'stock' },
    NVDA: { name: 'NVIDIA', type: 'stock' },
    AMZN: { name: 'Amazon', type: 'stock' },
    TSLA: { name: 'Tesla', type: 'stock' },
    GOOGL: { name: 'Alphabet', type: 'stock' },
    META: { name: 'Meta Platforms', type: 'stock' },
    SPY: { name: 'SPDR S&P 500 ETF', type: 'etf' },
    BTC: { name: 'Bitcoin', type: 'crypto', providerSymbol: 'BTC-USD' },
    ETH: { name: 'Ethereum', type: 'crypto', providerSymbol: 'ETH-USD' },
    EURUSD: { name: 'EUR / USD', type: 'fx', providerSymbol: 'EURUSD=X', baseCurrency: 'EUR' },
    GBPUSD: { name: 'GBP / USD', type: 'fx', providerSymbol: 'GBPUSD=X', baseCurrency: 'GBP' },
    MZNUSD: { name: 'MZN / USD', type: 'fx', providerSymbol: 'MZNUSD=X', baseCurrency: 'MZN' },
    ZARUSD: { name: 'ZAR / USD', type: 'fx', providerSymbol: 'ZARUSD=X', baseCurrency: 'ZAR' },
    '^GSPC': { name: 'S&P 500', type: 'index' },
    '^IXIC': { name: 'NASDAQ Composite', type: 'index' },
    '^DJI': { name: 'Dow Jones Industrial Average', type: 'index' },
};
const cache = new Map();
const CACHE_MS = 5 * 60 * 1000;

function getInstrument(symbol) {
    if (typeof symbol !== 'string') return null;
    const key = symbol.trim().toUpperCase();
    return Object.hasOwn(SYMBOLS, key) ? { symbol: key, ...SYMBOLS[key] } : null;
}

async function getQuote(symbol, range = '1y') {
    const instrument = getInstrument(symbol);
    const ranges = { '1d': ['1d', '5m'], '1w': ['5d', '30m'], '1m': ['1mo', '1d'], '6m': ['6mo', '1d'], '1y': ['1y', '1d'], '5y': ['5y', '1wk'], max: ['max', '1mo'] };
    const period = ranges[range] ? range : '1y';
    if (!instrument) throw new Error('Unsupported instrument.');
    const cacheKey = `${instrument.symbol}:${period}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    try {
        const providerSymbol = instrument.providerSymbol || instrument.symbol;
        const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(providerSymbol)}`);
        url.search = new URLSearchParams({ range: ranges[period][0], interval: ranges[period][1], events: 'history' }).toString();
        const response = await fetch(url, { headers: { 'User-Agent': 'Willow-Demo/1.0' }, signal: AbortSignal.timeout(8000) });
        if (!response.ok) throw new Error('Market data temporarily unavailable.');
        const payload = await response.json();
        const result = payload?.chart?.result?.[0];
        const meta = result?.meta;
        const price = Number(meta?.regularMarketPrice);
        const previous = Number(meta?.chartPreviousClose ?? meta?.previousClose);
        if (!result || !Number.isFinite(price) || price <= 0 || !Number.isFinite(previous) || previous <= 0) {
            throw new Error('Market data temporarily unavailable.');
        }
        const quote = {
            symbol: instrument.symbol,
            name: instrument.name,
            type: instrument.type,
            currency: meta.currency || 'USD',
            price,
            change: price - previous,
            changePercent: ((price - previous) / previous) * 100,
            marketCap: Number.isFinite(Number(meta.marketCap)) ? Number(meta.marketCap) : null,
            peRatio: Number.isFinite(Number(meta.trailingPE ?? meta.forwardPE)) ? Number(meta.trailingPE ?? meta.forwardPE) : null,
            high52Week: Number.isFinite(Number(meta.fiftyTwoWeekHigh)) ? Number(meta.fiftyTwoWeekHigh) : null,
            low52Week: Number.isFinite(Number(meta.fiftyTwoWeekLow)) ? Number(meta.fiftyTwoWeekLow) : null,
            volume: Number.isFinite(Number(meta.regularMarketVolume)) ? Number(meta.regularMarketVolume) : null,
            exchange: meta.fullExchangeName || meta.exchangeName || null,
            asOf: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : new Date().toISOString(),
            history: (result.timestamp || []).map((timestamp, index) => ({
                date: new Date(timestamp * 1000).toISOString().slice(0, 10),
                close: Number(result.indicators?.quote?.[0]?.close?.[index]),
            })).filter(point => Number.isFinite(point.close)),
        };
        cache.set(cacheKey, { value: quote, expiresAt: Date.now() + CACHE_MS });
        return quote;
    } catch (error) {
        if (cached) return { ...cached.value, stale: true };
        throw new Error('Market data temporarily unavailable.');
    }
}

async function getMarkets() {
    const symbols = ['^GSPC', '^IXIC', '^DJI', 'AAPL', 'MSFT', 'NVDA', 'AMZN', 'TSLA', 'GOOGL', 'META', 'SPY', 'BTC', 'ETH'];
    return Promise.all(symbols.map(async symbol => {
        const instrument = getInstrument(symbol);
        try {
            const quote = await getQuote(instrument.type === 'index' ? symbol : instrument.symbol);
            return quote;
        } catch (error) {
            return { symbol, name: instrument.name, type: instrument.type, unavailable: true };
        }
    }));
}

async function getFxRates() {
    return Promise.all(['EURUSD', 'GBPUSD', 'MZNUSD', 'ZARUSD'].map(async symbol => {
        try {
            return await getQuote(symbol, '1d');
        } catch (error) {
            const instrument = getInstrument(symbol);
            return { symbol, name: instrument.name, type: 'fx', baseCurrency: instrument.baseCurrency, unavailable: true };
        }
    }));
}

module.exports = { getInstrument, getQuote, getMarkets, getFxRates };