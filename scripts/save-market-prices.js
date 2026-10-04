#!/usr/bin/env node
/**
 * Saves a dated snapshot of real, delayed market prices for every instrument Willow
 * lists (src/content/market-snapshot.json).
 *
 *   npm run prices:save
 *
 * Willow uses it only when live prices can't be retrieved (no internet, or Yahoo
 * Finance blocked), and labels every saved price with its date. The GitHub Actions
 * workflow "Refresh saved market prices" runs this script and commits the result.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const universe = require('../src/content/instruments');

const OUTPUT = path.join(__dirname, '..', 'src', 'content', 'market-snapshot.json');
const HOSTS = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'];
const DAY = 86400000;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const round = value => (Number.isFinite(value) ? Number(value.toPrecision(7)) : null);
const day = seconds => Math.floor((seconds * 1000) / DAY); // days since 1 Jan 1970 (UTC)

async function chart(provider, range, interval) {
    let lastError = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
        const host = HOSTS[attempt % HOSTS.length];
        const url = `${host}/v8/finance/chart/${encodeURIComponent(provider)}?range=${range}&interval=${interval}&events=history`;
        try {
            const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Willow demo price snapshot)', Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
            if (response.status === 429) throw new Error('rate limited');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const result = (await response.json())?.chart?.result?.[0];
            if (!result || !result.meta) throw new Error('empty response');
            return result;
        } catch (error) {
            lastError = error;
            await sleep(1500 * (attempt + 1));
        }
    }
    throw lastError;
}

function points(result) {
    const closes = result.indicators?.quote?.[0]?.close || [];
    const seen = new Map();
    (result.timestamp || []).forEach((timestamp, index) => {
        const close = round(closes[index]);
        if (close !== null && close > 0) seen.set(day(timestamp), close); // one close per day, the latest wins
    });
    return [...seen.entries()].sort((a, b) => a[0] - b[0]);
}

async function snapshot(instrument) {
    const yearly = await chart(instrument.provider, '1y', '1d');
    await sleep(250);
    const fiveYears = await chart(instrument.provider, '5y', '1wk');
    const meta = yearly.meta;
    const daily = points(yearly);
    const price = round(meta.regularMarketPrice) || (daily.length ? daily[daily.length - 1][1] : null);
    if (!price) throw new Error('no price');
    const previousClose = daily.length > 1 ? daily[daily.length - 2][1] : null;
    return {
        quote: {
            price,
            previousClose,
            currency: meta.currency || 'USD',
            exchange: meta.fullExchangeName || meta.exchangeName || null,
            dayHigh: round(meta.regularMarketDayHigh),
            dayLow: round(meta.regularMarketDayLow),
            volume: Number.isFinite(meta.regularMarketVolume) ? meta.regularMarketVolume : null,
            high52Week: round(meta.fiftyTwoWeekHigh),
            low52Week: round(meta.fiftyTwoWeekLow),
            asOf: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : new Date().toISOString(),
        },
        daily,
        weekly: points(fiveYears),
    };
}

async function main() {
    const instruments = {};
    const failed = [];
    for (const instrument of universe.instruments) {
        try {
            instruments[instrument.symbol] = await snapshot(instrument);
            process.stdout.write(`  ✔ ${instrument.symbol}\n`);
        } catch (error) {
            failed.push(instrument.symbol);
            process.stdout.write(`  ✘ ${instrument.symbol}: ${error.message}\n`);
        }
        await sleep(250);
    }
    const saved = Object.keys(instruments).length;
    if (saved < universe.instruments.length / 2) {
        console.error(`Only ${saved} of ${universe.instruments.length} instruments could be fetched; the snapshot was not changed.`);
        process.exit(1);
    }
    // One instrument per line keeps the file readable and its diffs reviewable.
    const lines = Object.entries(instruments).map(([symbol, data]) => `    ${JSON.stringify(symbol)}: ${JSON.stringify(data)}`);
    const header = { savedAt: new Date().toISOString(), source: 'Yahoo Finance chart data (delayed)', note: 'Used only when live prices are unavailable. Days are counted from 1 Jan 1970 (UTC).' };
    const body = `{\n${Object.entries(header).map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)},`).join('\n')}\n  "instruments": {\n${lines.join(',\n')}\n  }\n}\n`;
    JSON.parse(body); // never write a file Willow can't read
    fs.writeFileSync(OUTPUT, body);
    console.log(`\nSaved ${saved} instruments to ${path.relative(process.cwd(), OUTPUT)}${failed.length ? ` (missing: ${failed.join(', ')})` : ''}.`);
}

main().catch(error => { console.error(`Could not save prices: ${error.message}`); process.exit(1); });
