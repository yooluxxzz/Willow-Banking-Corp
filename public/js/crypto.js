'use strict';

document.addEventListener('DOMContentLoaded', () => {
    const csrf = document.querySelector('meta[name="csrf-token"]')?.content || '';
    const holdingsRoot = document.getElementById('cryptoHoldings');
    const historyRoot = document.getElementById('cryptoHistoryRows');
    const form = document.getElementById('cryptoSendForm');
    const review = document.getElementById('cryptoReview');
    const status = document.getElementById('cryptoStatus');
    let wallet = { holdings: [] };
    let demoHandle = '';
    const assetNames = { BTC: 'Bitcoin', ETH: 'Ethereum' };
    const node = (tag, value, className) => { const item = document.createElement(tag); item.textContent = value; if (className) item.className = className; return item; };
    const quantityText = value => Number(value).toFixed(8).replace(/0+$/, '').replace(/\.$/, '') || '0';
    const money = value => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);

    async function request(url, options = {}) {
        const response = await fetch(url, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.method && options.method !== 'GET' ? { 'X-CSRF-Token': csrf } : {}), ...options.headers } });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Could not complete this demo wallet request.');
        return data;
    }

    async function getQuote(symbol) {
        try { return await request(`/api/wealth/quotes/${symbol}`); }
        catch (error) { return null; }
    }

    function renderHoldings(quotes) {
        holdingsRoot.replaceChildren();
        const holdings = wallet.holdings;
        document.getElementById('cryptoHoldingCount').textContent = `${holdings.length} supported asset${holdings.length === 1 ? '' : 's'} · demo wallet`;
        if (!holdings.length) {
            holdingsRoot.append(node('p', 'No demo crypto holdings yet. Explore the simulated market to add BTC or ETH.', 'wealth-empty'));
            const link = node('a', 'Explore demo markets ↗'); link.href = '/wealth'; holdingsRoot.append(link);
            return;
        }
        holdings.forEach(holding => {
            const quote = quotes.get(holding.symbol);
            const row = document.createElement('article'); row.className = 'crypto-holding-row';
            const title = document.createElement('div'); title.append(node('strong', assetNames[holding.symbol] || holding.symbol), node('small', holding.symbol));
            const quantity = document.createElement('div'); quantity.append(node('strong', quantityText(holding.quantity)), node('small', 'demo units'));
            const value = quote ? holding.quantity * quote.price : holding.quantity * holding.average_price;
            const basis = quote ? `Market estimate · cost ${money(holding.quantity * holding.average_price)}` : 'Market data unavailable · cost basis only';
            const valuation = document.createElement('div'); valuation.append(node('strong', money(value)), node('small', basis));
            row.append(title, quantity, valuation); holdingsRoot.append(row);
        });
        updateAvailable();
    }

    function renderHistory(history) {
        historyRoot.replaceChildren();
        if (!history.length) { historyRoot.append(node('p', 'No demo wallet transfers yet.', 'wealth-empty')); return; }
        history.forEach(transfer => {
            const row = document.createElement('div'); row.className = 'crypto-history-row';
            const label = transfer.direction === 'sent' ? `Sent ${transfer.symbol}` : `Received ${transfer.symbol}`;
            const main = document.createElement('span'); main.append(node('strong', label), node('small', `${transfer.counterparty} · ${new Date(transfer.created_at + 'Z').toLocaleString()}`));
            row.append(main, node('strong', `${transfer.direction === 'sent' ? '−' : '+'}${quantityText(transfer.quantity)} ${transfer.symbol}`));
            historyRoot.append(row);
        });
    }

    function updateAvailable() {
        const symbol = document.getElementById('cryptoSymbol').value;
        const holding = wallet.holdings.find(item => item.symbol === symbol);
        document.getElementById('cryptoAvailable').textContent = `Available demo units: ${quantityText(holding?.quantity || 0)} ${symbol}`;
        document.getElementById('cryptoQuantity').max = String(holding?.quantity || 1000000);
    }

    async function load() {
        holdingsRoot.replaceChildren(node('p', 'Loading wallet…', 'wealth-loading'));
        historyRoot.replaceChildren(node('p', 'Loading wallet activity…', 'wealth-loading'));
        try {
            const data = await request('/api/crypto/wallet');
            wallet = data.wallet; demoHandle = data.demoHandle;
            document.getElementById('cryptoDemoHandle').textContent = demoHandle;
            const quotes = new Map(await Promise.all(['BTC', 'ETH'].map(async symbol => [symbol, await getQuote(symbol)])));
            renderHoldings(quotes);
            renderHistory(data.history);
            updateAvailable();
        } catch (error) {
            holdingsRoot.replaceChildren(node('p', error.message, 'wealth-error'));
            historyRoot.replaceChildren();
        }
    }

    document.getElementById('cryptoSymbol').addEventListener('change', updateAvailable);
    form.addEventListener('submit', event => {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(form));
        const holding = wallet.holdings.find(item => item.symbol === data.symbol);
        if (!holding || Number(data.quantity) > holding.quantity) { status.textContent = `Insufficient demo ${data.symbol} units.`; return; }
        document.getElementById('cryptoReviewSummary').textContent = `Send ${quantityText(Number(data.quantity))} ${data.symbol} to ${data.recipientEmail}. This changes only simulated Willow demo holdings.`;
        form.hidden = true; review.hidden = false; review.focus(); status.textContent = '';
    });
    document.getElementById('cryptoEdit').addEventListener('click', () => { review.hidden = true; form.hidden = false; document.getElementById('cryptoRecipient').focus(); });
    document.getElementById('cryptoConfirm').addEventListener('click', async event => {
        const button = event.currentTarget; button.disabled = true; status.textContent = 'Recording demo wallet transfer…';
        try {
            const result = await request('/api/crypto/send', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) });
            status.textContent = result.message;
            form.reset(); form.hidden = false; review.hidden = true; updateAvailable(); await load();
        } catch (error) { status.textContent = error.message; }
        finally { button.disabled = false; }
    });
    document.getElementById('copyCryptoHandle').addEventListener('click', async () => {
        try {
            if (!navigator.clipboard?.writeText) throw new Error('Clipboard access is unavailable in this browser.');
            await navigator.clipboard.writeText(demoHandle);
            document.getElementById('copyCryptoStatus').textContent = 'Demo handle copied.';
        } catch (error) { document.getElementById('copyCryptoStatus').textContent = error.message; }
    });
    load();
});