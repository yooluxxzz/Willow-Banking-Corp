/**
 * Market data service.
 *
 * Browser → Willow API → this service → provider chain:
 *   1. Willow market-data service (Python, yfinance) — quotes, history, profile, news
 *   2. Yahoo Finance chart endpoint — quotes and history only (fallback)
 *   3. Last good cached value, flagged `stale`
 *
 * Every public function resolves to normalised objects or throws a
 * MarketDataError; callers render "Market data temporarily unavailable"
 * instead of failing the page.
 */
const universe = require('../content/instruments');

const DEFAULT_SERVICE_URL = 'http://127.0.0.1:8765';
const RANGES = {
    '1d': { period: '1d', interval: '5m', ttl: 2 * 60 * 1000 },
    '1w': { period: '5d', interval: '30m', ttl: 10 * 60 * 1000 },
    '1m': { period: '1mo', interval: '1d', ttl: 30 * 60 * 1000 },
    '6m': { period: '6mo', interval: '1d', ttl: 30 * 60 * 1000 },
    '1y': { period: '1y', interval: '1d', ttl: 30 * 60 * 1000 },
    '5y': { period: '5y', interval: '1wk', ttl: 6 * 60 * 60 * 1000 },
    max: { period: 'max', interval: '1mo', ttl: 6 * 60 * 60 * 1000 },
};
const QUOTE_TTL = 60 * 1000;
const PROFILE_TTL = 12 * 60 * 60 * 1000;
const NEWS_TTL = 30 * 60 * 1000;
const STALE_WINDOW = 24 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 1500;

class MarketDataError extends Error {
    constructor(message, code = 'unavailable') {
        super(message);
        this.code = code;
    }
}
const unavailable = () => new MarketDataError('Market data temporarily unavailable.', 'unavailable');
const notFound = () => new MarketDataError('This asset is unavailable.', 'not_found');

const cache = new Map();
const inflight = new Map();
const state = { serviceDownUntil: 0, chartCooldownUntil: 0, lastSource: null };

function settings() {
    return {
        mode: (process.env.MARKET_DATA_PROVIDER || 'auto').toLowerCase(),
        serviceUrl: process.env.MARKET_DATA_SERVICE_URL || DEFAULT_SERVICE_URL,
        token: process.env.MARKET_DATA_TOKEN || '',
        timeoutMs: Number(process.env.MARKET_DATA_TIMEOUT_MS) || 12000,
    };
}

function getInstrument(symbol) {
    if (typeof symbol !== 'string') return null;
    const key = symbol.trim().toUpperCase();
    return universe.bySymbol.get(key) || null;
}

function listInstruments(type) {
    return universe.instruments.filter(item => !type || item.type === type);
}

function searchInstruments(query, { tradableOnly = true } = {}) {
    const term = String(query || '').trim().toLowerCase();
    return universe.instruments
        .filter(item => (!tradableOnly || item.tradable))
        .filter(item => !term || `${item.symbol} ${item.name} ${item.legalName || ''} ${item.sector || ''}`.toLowerCase().includes(term))
        .slice(0, 25);
}

// ── Cache ─────────────────────────────────────────────────────────────
function remember(key, value, ttl) {
    if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
    cache.set(key, { value, freshUntil: Date.now() + ttl, staleUntil: Date.now() + ttl + STALE_WINDOW });
    return value;
}

async function cached(key, ttl, loader) {
    const entry = cache.get(key);
    if (entry && entry.freshUntil > Date.now()) return entry.value;
    if (inflight.has(key)) return inflight.get(key);
    const pending = (async () => {
        try {
            return remember(key, await loader(), ttl);
        } catch (error) {
            if (error.code === 'not_found') throw error;
            if (entry && entry.staleUntil > Date.now()) return { ...entry.value, stale: true };
            throw error instanceof MarketDataError ? error : unavailable();
        } finally {
            inflight.delete(key);
        }
    })();
    inflight.set(key, pending);
    return pending;
}

function finite(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

// ── Provider 1: Willow market-data service (yfinance) ────────────────
async function serviceRequest(path, params) {
    const { serviceUrl, token, timeoutMs } = settings();
    if (Date.now() < state.serviceDownUntil) throw unavailable();
    const url = new URL(path, serviceUrl);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    let response;
    try {
        response = await fetch(url, { headers: { Accept: 'application/json', ...(token ? { 'X-Willow-Service-Token': token } : {}) }, signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
        state.serviceDownUntil = Date.now() + 30 * 1000;
        throw unavailable();
    }
    const body = await response.json().catch(() => null);
    if (response.status === 404) throw notFound();
    if (!response.ok || !body || typeof body !== 'object') throw unavailable();
    return body;
}

function normaliseServiceQuote(raw, instrument) {
    const price = finite(raw && raw.price);
    if (!price || price <= 0) return null;
    const previousClose = finite(raw.previousClose);
    const change = finite(raw.change) ?? (previousClose ? price - previousClose : null);
    return baseQuote(instrument, {
        price,
        previousClose,
        change,
        changePercent: finite(raw.changePercent) ?? (previousClose ? (change / previousClose) * 100 : null),
        currency: raw.currency || 'USD',
        exchange: raw.exchange || null,
        dayHigh: finite(raw.dayHigh),
        dayLow: finite(raw.dayLow),
        volume: finite(raw.volume),
        marketCap: finite(raw.marketCap),
        high52Week: finite(raw.fiftyTwoWeekHigh),
        low52Week: finite(raw.fiftyTwoWeekLow),
        asOf: raw.asOf || new Date().toISOString(),
        source: 'yfinance',
        stale: Boolean(raw.stale),
    });
}

async function serviceQuotes(instruments) {
    const results = new Map();
    for (let index = 0; index < instruments.length; index += 40) {
        const batch = instruments.slice(index, index + 40);
        const body = await serviceRequest('/v1/quotes', { symbols: batch.map(item => item.provider).join(',') });
        if (!Array.isArray(body.quotes)) throw unavailable();
        const byProvider = new Map(body.quotes.map(quote => [String(quote.symbol || '').toUpperCase(), quote]));
        batch.forEach(item => {
            const quote = normaliseServiceQuote(byProvider.get(item.provider.toUpperCase()), item);
            if (quote) results.set(item.symbol, quote);
        });
    }
    return results;
}

async function serviceHistory(instrument, range) {
    const body = await serviceRequest('/v1/history', { symbol: instrument.provider, range });
    if (!Array.isArray(body.points)) throw unavailable();
    const points = body.points.map(point => ({ t: point.t, close: finite(point.close) })).filter(point => point.t && point.close !== null);
    if (!points.length) throw notFound();
    return { points, currency: body.currency || 'USD', interval: body.interval || RANGES[range].interval, source: 'yfinance', stale: Boolean(body.stale) };
}

// ── Provider 2: Yahoo Finance chart endpoint ─────────────────────────
async function chartRequest(instrument, range) {
    if (Date.now() < state.chartCooldownUntil) throw unavailable();
    const { period, interval } = RANGES[range];
    const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(instrument.provider)}`);
    url.search = new URLSearchParams({ range: period, interval, events: 'history' }).toString();
    let response;
    try {
        response = await fetch(url, { headers: { 'User-Agent': 'Willow-Demo/2.0', Accept: 'application/json' }, signal: AbortSignal.timeout(settings().timeoutMs) });
    } catch (error) {
        throw unavailable();
    }
    if (response.status === 429) {
        state.chartCooldownUntil = Date.now() + 60 * 1000;
        throw unavailable();
    }
    if (response.status === 404) throw notFound();
    if (!response.ok) throw unavailable();
    const payload = await response.json().catch(() => null);
    const result = payload && payload.chart && payload.chart.result && payload.chart.result[0];
    if (!result || !result.meta) throw unavailable();
    return result;
}

function chartPoints(result) {
    const closes = (result.indicators && result.indicators.quote && result.indicators.quote[0] && result.indicators.quote[0].close) || [];
    return (result.timestamp || [])
        .map((timestamp, index) => ({ t: new Date(timestamp * 1000).toISOString(), close: finite(closes[index]) }))
        .filter(point => point.close !== null);
}

async function chartQuote(instrument) {
    const result = await chartRequest(instrument, '1d');
    const meta = result.meta;
    const price = finite(meta.regularMarketPrice);
    const previousClose = finite(meta.previousClose ?? meta.regularMarketPreviousClose ?? meta.chartPreviousClose);
    if (!price || price <= 0) throw unavailable();
    const change = previousClose ? price - previousClose : null;
    return baseQuote(instrument, {
        price,
        previousClose,
        change,
        changePercent: previousClose ? (change / previousClose) * 100 : null,
        currency: meta.currency || 'USD',
        exchange: meta.fullExchangeName || meta.exchangeName || null,
        dayHigh: finite(meta.regularMarketDayHigh),
        dayLow: finite(meta.regularMarketDayLow),
        volume: finite(meta.regularMarketVolume),
        marketCap: null,
        high52Week: finite(meta.fiftyTwoWeekHigh),
        low52Week: finite(meta.fiftyTwoWeekLow),
        asOf: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : new Date().toISOString(),
        source: 'yahoo-chart',
        stale: false,
    });
}

async function chartHistory(instrument, range) {
    const result = await chartRequest(instrument, range);
    const points = chartPoints(result);
    if (!points.length) throw unavailable();
    return { points, currency: result.meta.currency || 'USD', interval: RANGES[range].interval, source: 'yahoo-chart', stale: false };
}

function baseQuote(instrument, data) {
    return {
        symbol: instrument.symbol,
        name: instrument.name,
        type: instrument.type,
        typeLabel: instrument.typeLabel,
        peRatio: null,
        ...data,
    };
}

function useService() {
    return ['auto', 'yfinance', 'service'].includes(settings().mode);
}

function useChart() {
    return ['auto', 'yahoo-chart', 'chart'].includes(settings().mode);
}

// ── Public API ───────────────────────────────────────────────────────
/** Latest quotes for many symbols. Unavailable symbols are flagged, never thrown. */
async function getQuotes(symbols) {
    const instruments = [...new Set(symbols.map(symbol => getInstrument(symbol)).filter(Boolean))];
    const results = new Map();
    const pending = [];
    for (const instrument of instruments) {
        const entry = cache.get(`quote:${instrument.symbol}`);
        if (entry && entry.freshUntil > Date.now()) results.set(instrument.symbol, entry.value);
        else pending.push(instrument);
    }
    if (pending.length && useService()) {
        try {
            const fetched = await serviceQuotes(pending);
            fetched.forEach((quote, symbol) => results.set(symbol, remember(`quote:${symbol}`, quote, QUOTE_TTL)));
        } catch (error) { /* fall through to the next provider */ }
    }
    const remaining = pending.filter(instrument => !results.has(instrument.symbol));
    await mapLimit(remaining, 6, async instrument => {
        try {
            results.set(instrument.symbol, await cached(`quote:${instrument.symbol}`, QUOTE_TTL, () => {
                if (!useChart()) throw unavailable();
                return chartQuote(instrument);
            }));
        } catch (error) {
            results.set(instrument.symbol, { symbol: instrument.symbol, name: instrument.name, type: instrument.type, typeLabel: instrument.typeLabel, unavailable: true });
        }
    });
    return instruments.map(instrument => results.get(instrument.symbol));
}

async function getLatestQuote(symbol) {
    const instrument = getInstrument(symbol);
    if (!instrument) throw new MarketDataError('Unsupported instrument.', 'unsupported');
    const [quote] = await getQuotes([instrument.symbol]);
    if (!quote || quote.unavailable) throw unavailable();
    return quote;
}

async function getHistory(symbol, range = '1y') {
    const instrument = getInstrument(symbol);
    if (!instrument) throw new MarketDataError('Unsupported instrument.', 'unsupported');
    const period = RANGES[range] ? range : '1y';
    const history = await cached(`history:${instrument.symbol}:${period}`, RANGES[period].ttl, async () => {
        if (useService()) {
            try { return await serviceHistory(instrument, period); } catch (error) { if (!useChart()) throw error; }
        }
        if (useChart()) return chartHistory(instrument, period);
        throw unavailable();
    });
    return { symbol: instrument.symbol, range: period, ...history };
}

/** Quote plus history for a range (kept for detail pages and trading). */
async function getQuote(symbol, range = '1y') {
    const instrument = getInstrument(symbol);
    if (!instrument) throw new MarketDataError('Unsupported instrument.', 'unsupported');
    const quote = await getLatestQuote(instrument.symbol);
    let history = { points: [], stale: false };
    try { history = await getHistory(instrument.symbol, range); } catch (error) { /* chart unavailable is non-fatal */ }
    return {
        ...quote,
        range: RANGES[range] ? range : '1y',
        history: history.points.map(point => ({ t: point.t, date: String(point.t).slice(0, 10), close: point.close })),
        historyStale: Boolean(history.stale),
    };
}

async function getProfile(symbol) {
    const instrument = getInstrument(symbol);
    if (!instrument) throw new MarketDataError('Unsupported instrument.', 'unsupported');
    const local = {
        symbol: instrument.symbol,
        name: instrument.legalName || instrument.name,
        description: instrument.description || null,
        sector: instrument.sector || null,
        industry: null,
        country: instrument.country || null,
        website: null,
        employees: null,
        marketCap: null,
        trailingPE: null,
        forwardPE: null,
        dividendYield: null,
        beta: null,
        averageVolume: null,
        source: 'willow',
    };
    if (!useService() || ['index', 'fx'].includes(instrument.type)) return local;
    try {
        const remote = await cached(`profile:${instrument.symbol}`, PROFILE_TTL, () => serviceRequest('/v1/profile', { symbol: instrument.provider }));
        return {
            ...local,
            name: remote.name || local.name,
            description: remote.description || local.description,
            sector: remote.sector || local.sector,
            industry: remote.industry || null,
            country: remote.country || local.country,
            website: typeof remote.website === 'string' && /^https?:\/\//.test(remote.website) ? remote.website : null,
            employees: finite(remote.employees),
            marketCap: finite(remote.marketCap),
            trailingPE: finite(remote.trailingPE),
            forwardPE: finite(remote.forwardPE),
            dividendYield: finite(remote.dividendYield),
            beta: finite(remote.beta),
            averageVolume: finite(remote.averageVolume),
            source: 'yfinance',
            stale: Boolean(remote.stale),
        };
    } catch (error) {
        return local;
    }
}

async function getNews(symbol, limit = 6) {
    const instrument = getInstrument(symbol);
    if (!instrument) throw new MarketDataError('Unsupported instrument.', 'unsupported');
    if (!useService()) return { items: [], unavailable: true };
    try {
        const body = await cached(`news:${instrument.symbol}`, NEWS_TTL, () => serviceRequest('/v1/news', { symbol: instrument.provider, limit: 10 }));
        const items = (Array.isArray(body.items) ? body.items : [])
            .filter(item => item && typeof item.title === 'string' && /^https?:\/\//.test(item.url || ''))
            .slice(0, limit)
            .map(item => ({ title: item.title.slice(0, 240), publisher: item.publisher ? String(item.publisher).slice(0, 80) : null, url: item.url, publishedAt: item.publishedAt || null, summary: item.summary ? String(item.summary).slice(0, 400) : null }));
        return { items, stale: Boolean(body.stale) };
    } catch (error) {
        return { items: [], unavailable: true };
    }
}

async function getMarkets() {
    const symbols = [...universe.MAIN_INDICES, ...universe.GLOBAL_INDICES, ...universe.instruments.filter(item => item.tradable).map(item => item.symbol)];
    return getQuotes(symbols);
}

async function getMarketOverview() {
    const [indices, global, popular, crypto] = await Promise.all([
        getQuotes(universe.MAIN_INDICES),
        getQuotes(universe.GLOBAL_INDICES),
        getQuotes(universe.POPULAR),
        getQuotes(universe.CRYPTO),
    ]);
    return { indices, global, popular, crypto };
}

/** Indicative FX: perUsd = units of currency for 1 USD. */
async function getFxRates() {
    const quotes = await getQuotes(universe.FX);
    return quotes.map(quote => {
        const instrument = getInstrument(quote.symbol);
        if (quote.unavailable) return { currency: instrument.currencyCode, name: instrument.name, unavailable: true };
        return {
            currency: instrument.currencyCode,
            name: instrument.name,
            perUsd: quote.price,
            usdPer: 1 / quote.price,
            changePercent: quote.changePercent,
            asOf: quote.asOf,
            stale: Boolean(quote.stale),
            source: quote.source,
        };
    });
}

/** Converts between USD and supported currencies with indicative rates. */
function convertAmount(amount, from, to, rates) {
    if (from === to) return amount;
    const rate = code => (code === 'USD' ? 1 : (rates.find(item => item.currency === code && !item.unavailable) || {}).perUsd);
    const fromRate = rate(from);
    const toRate = rate(to);
    if (!fromRate || !toRate) return null;
    return (amount / fromRate) * toRate;
}

function getStatus() {
    return {
        mode: settings().mode,
        serviceAvailable: Date.now() >= state.serviceDownUntil,
        chartCoolingDown: Date.now() < state.chartCooldownUntil,
    };
}

function clearCache() {
    cache.clear();
    inflight.clear();
    state.serviceDownUntil = 0;
    state.chartCooldownUntil = 0;
}

async function mapLimit(items, limit, worker) {
    let index = 0;
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (index < items.length) {
            const current = items[index++];
            await worker(current);
        }
    });
    await Promise.all(runners);
}

module.exports = {
    MarketDataError, RANGES,
    getInstrument, listInstruments, searchInstruments,
    getQuotes, getLatestQuote, getQuote, getHistory, getProfile, getNews,
    getMarkets, getMarketOverview, getFxRates, convertAmount, getStatus, clearCache,
};
