'use strict';

document.addEventListener('DOMContentLoaded', () => {
    const csrf = document.querySelector('meta[name="csrf-token"]')?.content || '';
    const names = { '^GSPC': 'S&P 500', '^IXIC': 'NASDAQ', '^DJI': 'Dow Jones' };
    const preferredOrder = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'TSLA', 'GOOGL', 'META', 'SPY', 'BTC', 'ETH'];
    const state = { quotes: [], portfolio: null, watchlist: [], filter: 'all', selected: null, range: '1y', loading: false };
    const byId = id => document.getElementById(id);
    const money = (amount, currency = 'USD') => Number.isFinite(Number(amount)) ? new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: Number(amount) < 1 ? 6 : 2 }).format(amount) : 'Unavailable';
    const safeFetch = async (url, options = {}) => {
        const response = await fetch(url, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.method && options.method !== 'GET' ? { 'X-CSRF-Token': csrf } : {}), ...options.headers } });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || 'Request failed. Please try again.');
        return body;
    };
    const quoteFor = symbol => state.quotes.find(quote => quote.symbol === symbol);

    function renderIndices() {
        const strip = byId('marketIndices');
        strip.replaceChildren();
        ['^GSPC', '^IXIC', '^DJI'].forEach(symbol => {
            const quote = quoteFor(symbol);
            const item = document.createElement('div'); item.className = 'wealth-index';
            const label = document.createElement('div');
            const name = document.createElement('span'); name.textContent = names[symbol];
            const price = document.createElement('strong'); price.textContent = quote && !quote.unavailable ? money(quote.price) : 'Unavailable';
            label.append(name, price);
            const change = document.createElement('strong');
            change.className = quote && quote.change >= 0 ? 'wealth-up' : 'wealth-down';
            change.textContent = quote && !quote.unavailable ? `${quote.change >= 0 ? '+' : ''}${quote.changePercent.toFixed(2)}%` : '—';
            item.append(label, change); strip.append(item);
        });
    }

    function renderAssets() {
        const tbody = byId('assetRows'); tbody.replaceChildren();
        const term = byId('assetSearch').value.trim().toLowerCase();
        const sort = byId('assetSort').value;
        let assets = state.quotes.filter(quote => ['stock', 'etf', 'crypto'].includes(quote.type));
        if (state.filter !== 'all' && state.filter !== 'watchlist') assets = assets.filter(quote => quote.type === state.filter);
        if (state.filter === 'watchlist') assets = assets.filter(quote => state.watchlist.includes(quote.symbol));
        assets = assets.filter(quote => `${quote.name} ${quote.symbol}`.toLowerCase().includes(term));
        assets.sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : sort === 'price' ? (b.price || 0) - (a.price || 0) : sort === 'change' ? (b.changePercent || 0) - (a.changePercent || 0) : preferredOrder.indexOf(a.symbol) - preferredOrder.indexOf(b.symbol));
        if (!assets.length) {
            const row = tbody.insertRow(); const cell = row.insertCell(); cell.colSpan = 4; cell.className = 'wealth-empty';
            cell.textContent = state.filter === 'watchlist' ? 'Your watchlist is empty. Add an asset with the star to follow it here.' : 'No matching assets are available.';
            return;
        }
        assets.forEach(quote => {
            const row = tbody.insertRow();
            const assetCell = row.insertCell();
            const open = document.createElement('button'); open.type = 'button'; open.className = 'wealth-asset-link'; open.addEventListener('click', () => selectAsset(quote.symbol));
            const name = document.createElement('strong'); name.textContent = quote.name;
            const ticker = document.createElement('small'); ticker.textContent = `${quote.symbol} · ${quote.type.toUpperCase()}`;
            open.append(name, ticker); assetCell.append(open);
            const price = row.insertCell(); price.textContent = quote.unavailable ? 'Unavailable' : money(quote.price, quote.currency);
            const change = row.insertCell(); change.className = quote.change >= 0 ? 'wealth-up' : 'wealth-down'; change.textContent = quote.unavailable ? '—' : `${quote.change >= 0 ? '+' : ''}${quote.changePercent.toFixed(2)}%`;
            const watch = row.insertCell(); const button = document.createElement('button'); button.type = 'button'; button.className = 'wealth-star';
            button.textContent = state.watchlist.includes(quote.symbol) ? '★' : '☆'; button.setAttribute('aria-label', `${state.watchlist.includes(quote.symbol) ? 'Remove' : 'Add'} ${quote.name} ${state.watchlist.includes(quote.symbol) ? 'from' : 'to'} watchlist`);
            button.addEventListener('click', () => changeWatchlist(quote.symbol)); watch.append(button);
        });
    }

    function drawChart(history) {
        const target = byId('priceChart'); target.replaceChildren();
        if (!history?.length) { const empty = document.createElement('p'); empty.className = 'wealth-empty'; empty.textContent = 'Historical price data is temporarily unavailable.'; target.append(empty); byId('chartSummary').textContent = 'Try another period or come back later.'; return; }
        const width = 600, height = 190, inset = 12;
        const values = history.map(point => point.close); const low = Math.min(...values), high = Math.max(...values); const span = high - low || Math.max(Math.abs(high) * .01, 1);
        const coords = values.map((value, index) => `${inset + (index / Math.max(values.length - 1, 1)) * (width - inset * 2)},${height - inset - ((value - low) / span) * (height - inset * 2)}`).join(' ');
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', `0 0 ${width} ${height}`); svg.setAttribute('aria-hidden', 'true');
        const line = document.createElementNS(svg.namespaceURI, 'polyline'); line.setAttribute('points', coords); line.setAttribute('fill', 'none'); line.setAttribute('stroke', values.at(-1) >= values[0] ? '#2D6A4F' : '#b44848'); line.setAttribute('stroke-width', '3'); line.setAttribute('stroke-linecap', 'round'); line.setAttribute('stroke-linejoin', 'round'); svg.append(line); target.append(svg);
        byId('chartSummary').textContent = `${history.length} available observations from ${history[0].date} to ${history.at(-1).date}. Range ${money(low, state.selected.currency)} to ${money(high, state.selected.currency)}.`;
    }

    async function selectAsset(symbol, range = state.range) {
        const summary = quoteFor(symbol);
        if (!summary || summary.unavailable) { byId('marketError').hidden = false; return; }
        state.selected = summary; state.range = range;
        byId('assetTitle').textContent = summary.name; byId('assetSymbol').textContent = summary.symbol;
        byId('assetType').textContent = `${summary.type.toUpperCase()} · ${summary.exchange || 'MARKET DATA'}`;
        byId('assetPrice').textContent = money(summary.price, summary.currency);
        byId('assetChange').textContent = `${summary.change >= 0 ? '+' : ''}${money(summary.change, summary.currency)} (${summary.changePercent >= 0 ? '+' : ''}${summary.changePercent.toFixed(2)}%) today`;
        byId('assetChange').className = `wealth-change ${summary.change >= 0 ? 'wealth-up' : 'wealth-down'}`;
        byId('marketCap').textContent = summary.marketCap ? money(summary.marketCap, summary.currency) : 'Unavailable';
        byId('peRatio').textContent = Number.isFinite(summary.peRatio) ? summary.peRatio.toFixed(2) : 'Unavailable';
        byId('high52Week').textContent = Number.isFinite(summary.high52Week) ? money(summary.high52Week, summary.currency) : 'Unavailable';
        byId('low52Week').textContent = Number.isFinite(summary.low52Week) ? money(summary.low52Week, summary.currency) : 'Unavailable';
        byId('marketVolume').textContent = Number.isFinite(summary.volume) ? new Intl.NumberFormat().format(summary.volume) : 'Unavailable';
        byId('exchangeName').textContent = summary.exchange || 'Unavailable';
        byId('quoteTime').textContent = summary.asOf ? new Date(summary.asOf).toLocaleString() : '—';
        byId('quoteFreshness').textContent = summary.stale ? `Showing a cached quote from ${new Date(summary.asOf).toLocaleString()}. New simulated orders are disabled until current market data is available.` : `Market data timestamp: ${summary.asOf ? new Date(summary.asOf).toLocaleString() : 'unavailable'}.`;
        byId('watchSelected').disabled = false; byId('watchSelected').textContent = state.watchlist.includes(symbol) ? '★' : '☆';
        byId('watchSelected').setAttribute('aria-label', `${state.watchlist.includes(symbol) ? 'Remove' : 'Add'} ${summary.name} ${state.watchlist.includes(symbol) ? 'from' : 'to'} watchlist`);
        byId('tradeSubmit').disabled = true;
        try {
            const quote = await safeFetch(`/api/wealth/quotes/${encodeURIComponent(symbol)}?range=${encodeURIComponent(range)}`);
            state.selected = quote; drawChart(quote.history);
            byId('tradeSubmit').disabled = Boolean(quote.stale); updateEstimate();
        } catch (error) { drawChart([]); byId('marketError').hidden = false; }
    }

    async function changeWatchlist(symbol) {
        try {
            const added = !state.watchlist.includes(symbol);
            const result = await safeFetch(added ? '/api/wealth/watchlist' : `/api/wealth/watchlist/${encodeURIComponent(symbol)}`, { method: added ? 'POST' : 'DELETE', ...(added ? { body: JSON.stringify({ symbol }) } : {}) });
            state.watchlist = result.watchlist; renderAssets();
            if (state.selected?.symbol === symbol) selectAsset(symbol);
        } catch (error) { byId('tradeMessage').textContent = error.message; }
    }

    function renderPortfolio() {
        if (!state.portfolio) return;
        const holdings = state.portfolio.holdings;
        const value = holdings.reduce((total, holding) => total + holding.quantity * (quoteFor(holding.symbol)?.price || holding.average_price), 0);
        byId('cashBalance').textContent = money(state.portfolio.cash);
        byId('holdingsValue').textContent = money(value);
        byId('portfolioValue').textContent = money(state.portfolio.cash + value);
        const holdingsRoot = byId('holdingRows'); holdingsRoot.replaceChildren();
        if (!holdings.length) { const empty = document.createElement('p'); empty.className = 'wealth-empty'; empty.textContent = 'Your demo portfolio is ready. Explore an asset to place a simulated order.'; holdingsRoot.append(empty); }
        holdings.forEach(holding => {
            const quote = quoteFor(holding.symbol); const row = document.createElement('div'); row.className = 'wealth-holding-row';
            const label = document.createElement('span'); label.textContent = `${quote?.name || holding.symbol} · ${holding.symbol}`;
            const quantity = document.createElement('span'); quantity.textContent = `${holding.quantity.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')} units`;
            const worth = document.createElement('strong'); worth.textContent = money(holding.quantity * (quote?.price || holding.average_price)); row.append(label, quantity, worth); holdingsRoot.append(row);
        });
        const activityRoot = byId('tradeRows'); activityRoot.replaceChildren();
        if (!state.portfolio.activity.length) { const empty = document.createElement('p'); empty.className = 'wealth-empty'; empty.textContent = 'Your simulated order activity will appear here.'; activityRoot.append(empty); }
        state.portfolio.activity.forEach(trade => {
            const row = document.createElement('div'); row.className = 'wealth-trade-row';
            const action = document.createElement('span'); action.textContent = `${trade.side.toUpperCase()} ${trade.symbol}`;
            const shares = document.createElement('span'); shares.textContent = `${trade.quantity} units`;
            const total = document.createElement('strong'); total.textContent = money(trade.total_cents / 100);
            row.append(action, shares, total); activityRoot.append(row);
        });
    }

    function updateEstimate() {
        const quantity = Number(byId('tradeQuantity').value);
        byId('orderEstimate').textContent = money(quantity > 0 && state.selected ? quantity * state.selected.price : 0, state.selected?.currency || 'USD');
    }

    async function load() {
        try {
            const [markets, userData] = await Promise.all([safeFetch('/api/wealth/markets'), safeFetch('/api/wealth/portfolio')]);
            state.quotes = markets.quotes; state.portfolio = userData.portfolio; state.watchlist = userData.watchlist;
            renderIndices(); renderAssets(); renderPortfolio(); byId('marketError').hidden = !state.quotes.every(quote => quote.unavailable);
            const first = state.quotes.find(quote => quote.symbol === 'AAPL' && !quote.unavailable) || state.quotes.find(quote => !quote.unavailable && ['stock', 'etf', 'crypto'].includes(quote.type));
            if (first) selectAsset(first.symbol); else byId('marketError').hidden = false;
        } catch (error) {
            byId('marketError').hidden = false; byId('marketError').textContent = error.message || 'Market data temporarily unavailable.';
        }
    }

    byId('assetSearch').addEventListener('input', renderAssets); byId('assetSort').addEventListener('change', renderAssets);
    document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
        state.filter = button.dataset.filter; document.querySelectorAll('[data-filter]').forEach(item => { const active = item === button; item.classList.toggle('is-active', active); item.setAttribute('aria-pressed', String(active)); }); renderAssets();
    }));
    document.querySelectorAll('[data-range]').forEach(button => button.addEventListener('click', () => {
        document.querySelectorAll('[data-range]').forEach(item => { const active = item === button; item.classList.toggle('is-active', active); item.setAttribute('aria-pressed', String(active)); });
        if (state.selected) selectAsset(state.selected.symbol, button.dataset.range);
    }));
    byId('watchSelected').addEventListener('click', () => state.selected && changeWatchlist(state.selected.symbol));
    byId('tradeQuantity').addEventListener('input', updateEstimate);
    byId('tradeForm').addEventListener('submit', async event => {
        event.preventDefault(); if (!state.selected) return;
        const submit = byId('tradeSubmit'); submit.disabled = true; byId('tradeMessage').textContent = 'Checking market data and recording the simulation…';
        try {
            const result = await safeFetch('/api/wealth/trades', { method: 'POST', body: JSON.stringify({ symbol: state.selected.symbol, side: byId('tradeSide').value, quantity: byId('tradeQuantity').value }) });
            state.portfolio = result.portfolio; renderPortfolio(); byId('tradeMessage').textContent = result.message;
        } catch (error) { byId('tradeMessage').textContent = error.message; }
        finally { submit.disabled = false; }
    });
    load();
});