/* Willow Wealth — asset detail (/wealth/stocks/:symbol and /crypto/:symbol) with the simulated trade flow. */
'use strict';

(function (global) {
    const doc = global.document;
    const W = global.Willow;
    const WW = global.WillowWealth;
    const root = doc.querySelector('[data-wealth-page="asset"]');
    const asset = WW && WW.readJson('assetData');
    if (!root || !W || !WW || !asset) return;

    const el = W.el;
    const $ = selector => root.querySelector(selector);
    const isCrypto = asset.type === 'crypto';
    const display = WW.displaySymbol(asset.symbol);
    const unitPlural = isCrypto ? display : 'shares';
    const unitOne = isCrypto ? display : 'share';
    const qtyDigits = isCrypto ? 8 : 6;
    const RANGE_PHRASES = { '1d': 'today', '1w': 'past week', '1m': 'past month', '6m': 'past 6 months', '1y': 'past year', '5y': 'past 5 years', max: 'all time' };
    const EXCHANGES = { NMS: 'NASDAQ', NGM: 'NASDAQ', NCM: 'NASDAQ', NAS: 'NASDAQ', NYQ: 'NYSE', NYS: 'NYSE', PCX: 'NYSE Arca', ASE: 'NYSE American', BTS: 'Cboe BZX', CCC: 'Crypto market', NIM: 'NASDAQ', MUTUALFUND: 'Mutual fund' };
    const chartBox = $('[data-price-chart]');
    const state = {
        quote: null,
        quoteError: null,
        range: chartBox.dataset.defaultRange || '1d',
        history: new Map(),
        holding: asset.holding,
        position: null,
        cash: null,
        chartToken: 0,
        hovering: false,
    };

    const unitsText = quantity => `${WW.formatQuantity(quantity, asset.type)} ${Number(quantity) === 1 ? unitOne : unitPlural}`;

    function relativeTime(value) {
        const date = W.parseDate(value);
        if (!date) return '';
        const minutes = Math.round((Date.now() - date.getTime()) / 60000);
        if (minutes < 1) return 'just now';
        if (minutes < 60) return `${minutes} min ago`;
        const hours = Math.round(minutes / 60);
        if (hours < 24) return `${hours} hr ago`;
        const days = Math.round(hours / 24);
        if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
        return W.formatDate(date);
    }

    // ── Quote header ───────────────────────────────────────────────────
    function renderQuote() {
        const quote = state.quote;
        const price = $('[data-price]');
        const change = $('[data-change]');
        const status = $('[data-quote-status]');
        const banner = $('[data-quote-error]');
        if (!WW.isPriced(quote)) {
            price.replaceChildren(el('span', { className: 'muted', text: '—' }));
            change.replaceChildren(el('span', { className: 'muted', text: 'Price unavailable' }));
            status.replaceChildren(WW.freshness(null));
            banner.hidden = false;
            updateTradeAvailability();
            return;
        }
        banner.hidden = true;
        if (!state.hovering) price.textContent = WW.formatPrice(quote.price, quote.currency);
        change.replaceChildren(WW.delta(quote.changePercent, { amount: quote.change, currency: quote.currency, pill: true }), el('span', { className: 'muted', text: ' today' }));
        status.replaceChildren(WW.freshness(quote), el('span', { className: 'text-xs muted', text: WW.asOfText(quote.asOf) }));
        const exchange = $('[data-exchange]');
        if (exchange && quote.exchange) exchange.textContent = EXCHANGES[quote.exchange] || quote.exchange;
        updateTradeAvailability();
    }

    // ── Chart ──────────────────────────────────────────────────────────
    function rangeSummary(points, range, hoverPoint) {
        const box = $('[data-range-summary]');
        const quote = state.quote;
        if (!points || points.length < 2) { box.replaceChildren(); return; }
        const first = points[0].v;
        if (hoverPoint) {
            const diff = hoverPoint.v - first;
            box.replaceChildren(WW.delta(first ? (diff / first) * 100 : 0, { amount: diff, currency: quote && quote.currency }),
                el('span', { className: 'muted', text: ` · ${W.formatDate(hoverPoint.t, range === '1d' || range === '1w' ? 'datetime' : 'medium')}` }));
            return;
        }
        if (range === '1d' && WW.isPriced(quote)) {
            const close = WW.positive(quote.previousClose);
            box.replaceChildren(close
                ? el('span', { className: 'muted wl-dash-key-row' }, el('span', { className: 'wl-dash-key', 'aria-hidden': 'true' }), `Previous close ${WW.formatPrice(close, quote.currency)}`)
                : el('span', { className: 'muted', text: 'Intraday' }));
            return;
        }
        const last = points[points.length - 1].v;
        const diff = last - first;
        box.replaceChildren(WW.delta(first ? (diff / first) * 100 : 0, { amount: diff, currency: quote && quote.currency }), el('span', { className: 'muted', text: ` ${RANGE_PHRASES[range]}` }));
    }

    function drawChart(range, history) {
        const points = history.points;
        if (!points || points.length < 2) {
            chartBox.classList.remove('chart', 'is-up', 'is-down');
            chartBox.replaceChildren(el('div', { className: 'wl-chart-empty' },
                W.icon('chart', 'icon-lg'),
                el('p', { className: 'text-sm', text: asset.type === 'fund' && range === '1d' ? 'Mutual funds are priced once per trading day, so there is no intraday chart. Try 1M or longer.' : 'Not enough price history for this period. Try a longer range.' })));
            rangeSummary(null, range);
            return;
        }
        const quote = state.quote;
        const baseline = range === '1d' && quote && WW.positive(quote.previousClose) ? Number(quote.previousClose) : undefined;
        chartBox.replaceChildren();
        global.WillowCharts.line(chartBox, points, {
            range,
            currency: (quote && quote.currency) || history.currency || 'USD',
            height: global.innerWidth < 640 ? 220 : 300,
            baseline,
            label: `${asset.name} price, ${RANGE_PHRASES[range]}`,
            onHover: point => {
                const price = $('[data-price]');
                state.hovering = Boolean(point);
                if (point) price.textContent = WW.formatPrice(point.v, quote && quote.currency);
                else if (WW.isPriced(state.quote)) price.textContent = WW.formatPrice(state.quote.price, state.quote.currency);
                rangeSummary(points, range, point);
            },
        });
        rangeSummary(points, range);
        if (history.stale) chartBox.append(el('p', { className: 'wl-chart-flag' }, el('span', { className: 'badge badge-warning' }, W.icon('clock'), history.saved ? 'Saved prices' : 'Cached history')));
    }

    async function loadChart(range) {
        state.range = range;
        const token = ++state.chartToken;
        if (state.history.has(range)) { drawChart(range, state.history.get(range)); return; }
        chartBox.setAttribute('aria-busy', 'true');
        chartBox.classList.remove('is-up', 'is-down');
        chartBox.replaceChildren(el('div', { className: 'skeleton skeleton-block wl-chart-skeleton', 'aria-hidden': 'true' }));
        try {
            const history = await W.api(`/api/wealth/history/${encodeURIComponent(asset.symbol)}?range=${encodeURIComponent(range)}`, { passive: true, timeout: 25000 });
            if (token !== state.chartToken) return;
            state.history.set(range, history);
            drawChart(range, history);
        } catch (error) {
            if (token !== state.chartToken) return;
            chartBox.classList.remove('chart', 'is-up', 'is-down');
            chartBox.replaceChildren(error.status === 404 ? el('div', { className: 'wl-chart-empty' }, W.icon('chart', 'icon-lg'), el('p', { className: 'text-sm', text: 'No price history is available for this period.' }))
                : WW.unavailableState(() => loadChart(state.range), { text: 'Price history couldn’t be loaded right now.' }));
            rangeSummary(null, range);
        } finally {
            chartBox.setAttribute('aria-busy', 'false');
        }
    }

    // ── Statistics & profile ───────────────────────────────────────────
    function statItem(label, value, extra) {
        return el('div', null, el('dt', { text: label }), el('dd', null, value, extra || null));
    }

    function rangeBar(low, high, current) {
        if (!(high > low) || !Number.isFinite(current)) return null;
        const pct = Math.max(0, Math.min(100, ((current - low) / (high - low)) * 100));
        return el('span', { className: 'wl-range-bar', 'aria-hidden': 'true' }, el('span', { style: `--pos:${pct.toFixed(1)}%` }));
    }

    function renderStats(profile) {
        const box = $('[data-stats]');
        const quote = WW.isPriced(state.quote) ? state.quote : {};
        const p = profile || {};
        // The API can report missing figures as 0, so only strictly positive values are shown.
        const pos = WW.positive;
        const items = [];
        const marketCap = pos(p.marketCap) || pos(quote.marketCap);
        if (marketCap) items.push(statItem('Market cap', W.formatCompact(marketCap, 'USD')));
        if (pos(p.trailingPE)) items.push(statItem('P/E ratio (TTM)', W.formatNumber(p.trailingPE, 2)));
        if (pos(p.forwardPE)) items.push(statItem('Forward P/E', W.formatNumber(p.forwardPE, 2)));
        if (pos(p.dividendYield)) items.push(statItem('Dividend yield', `${W.formatNumber(p.dividendYield, 2)}%`));
        if (pos(quote.low52Week) && pos(quote.high52Week)) {
            items.push(statItem('52-week range', `${WW.formatPrice(quote.low52Week, quote.currency)} – ${WW.formatPrice(quote.high52Week, quote.currency)}`, rangeBar(quote.low52Week, quote.high52Week, Number(quote.price))));
        }
        if (pos(quote.dayLow) && pos(quote.dayHigh)) {
            items.push(statItem('Day range', `${WW.formatPrice(quote.dayLow, quote.currency)} – ${WW.formatPrice(quote.dayHigh, quote.currency)}`, rangeBar(quote.dayLow, quote.dayHigh, Number(quote.price))));
        }
        if (pos(quote.previousClose)) items.push(statItem('Previous close', WW.formatPrice(quote.previousClose, quote.currency)));
        if (pos(quote.volume)) items.push(statItem(isCrypto ? 'Volume (24h)' : 'Volume', W.formatCompact(quote.volume)));
        if (pos(p.averageVolume)) items.push(statItem('Average volume', W.formatCompact(p.averageVolume)));
        if (pos(p.beta)) items.push(statItem('Beta', W.formatNumber(p.beta, 2)));
        WW.setBusy(box, false);
        if (!items.length) {
            box.replaceChildren(el('p', { className: 'muted text-sm', text: WW.isPriced(state.quote) ? 'No statistics are available for this asset right now.' : 'Statistics are unavailable while market data can’t be retrieved.' }));
            $('[data-stats-source]').textContent = '';
            return;
        }
        box.replaceChildren(el('dl', { className: 'wl-stats' }, items));
        $('[data-stats-source]').textContent = state.quote && state.quote.saved ? W.priceStatus([state.quote]).text : (state.quote && state.quote.stale) || p.stale ? 'Cached market data' : 'Delayed market data';
    }

    function renderAbout(profile) {
        if (!profile) return;
        const text = $('[data-about-text]');
        if (profile.description) text.textContent = profile.description;
        if (!text.textContent.trim()) text.textContent = 'No description is available for this asset.';
        const facts = $('[data-about-facts]');
        const rows = [];
        if (!isCrypto && profile.name && profile.name !== asset.name) rows.push(['Full name', profile.name]);
        if (profile.sector) rows.push([isCrypto ? 'Category' : 'Sector', profile.sector]);
        if (profile.industry) rows.push(['Industry', profile.industry]);
        if (profile.country) rows.push(['Country', profile.country]);
        if (WW.positive(profile.employees)) rows.push(['Employees', Number(profile.employees).toLocaleString('en-US')]);
        if (profile.website) {
            let host = profile.website;
            try { host = new URL(profile.website).hostname.replace(/^www\./, ''); } catch (error) { /* keep raw */ }
            rows.push(['Website', el('a', { className: 'text-link', href: profile.website, target: '_blank', rel: 'noopener noreferrer' }, host, el('span', { className: 'visually-hidden', text: ' (opens in a new tab)' }))]);
        }
        if (rows.length) facts.replaceChildren(...rows.map(([label, value]) => el('div', null, el('dt', { text: label }), el('dd', null, value))));
        $('[data-about-source]').textContent = profile.source === 'willow' ? 'Summary written by Willow for this demo.' : 'Profile from delayed market data. Informational only, not investment advice.';
    }

    async function loadProfile() {
        try {
            const data = await W.api(`/api/wealth/profile/${encodeURIComponent(asset.symbol)}`, { passive: true, timeout: 20000 });
            state.profile = data.profile;
        } catch (error) {
            state.profile = null;
        }
        renderStats(state.profile);
        renderAbout(state.profile);
    }

    // ── News ───────────────────────────────────────────────────────────
    async function loadNews() {
        const box = $('[data-news]');
        const status = $('[data-news-status]');
        box.setAttribute('aria-busy', 'true');
        try {
            const data = await W.api(`/api/wealth/news/${encodeURIComponent(asset.symbol)}`, { passive: true, timeout: 20000 });
            WW.setBusy(box, false);
            if (data.unavailable) {
                box.replaceChildren(W.empty({ iconName: 'file', title: 'News is unavailable right now', text: 'Headlines couldn’t be retrieved. Please try again later.', compact: true, action: { label: 'Retry', primary: false, onClick: loadNews } }));
                status.textContent = '';
                return;
            }
            if (!data.items.length) {
                box.replaceChildren(W.empty({ iconName: 'file', title: `No recent news for ${display}`, text: 'When there are new headlines about this asset, they’ll appear here.', compact: true }));
                status.textContent = '';
                return;
            }
            status.textContent = data.stale ? 'Cached headlines' : 'From third-party publishers';
            box.replaceChildren(el('ul', { className: 'wl-news', role: 'list' }, data.items.map(item => el('li', null,
                el('a', { className: 'wl-news-item', href: item.url, target: '_blank', rel: 'noopener noreferrer' },
                    el('span', { className: 'wl-news-main' },
                        el('span', { className: 'wl-news-title', text: item.title }),
                        el('span', { className: 'wl-news-meta', text: [item.publisher, relativeTime(item.publishedAt)].filter(Boolean).join(' · ') })),
                    W.icon('external', 'wl-news-icon'),
                    el('span', { className: 'visually-hidden', text: ' (opens in a new tab)' }))))));
        } catch (error) {
            WW.setBusy(box, false);
            box.replaceChildren(W.empty({ iconName: 'file', title: 'News is unavailable right now', text: error.message, compact: true, action: { label: 'Retry', primary: false, onClick: loadNews } }));
        }
    }

    // ── Position & cash ────────────────────────────────────────────────
    function renderPosition() {
        const box = $('[data-position]');
        const holding = state.holding;
        const quote = state.quote;
        const priced = WW.isPriced(quote);
        root.querySelectorAll('[data-trade-open="sell"]').forEach(button => { button.hidden = !holding; });
        if (state.cash !== null) {
            root.querySelector('[data-cash]').textContent = W.formatMoney(state.cash, 'USD', { digits: 2 });
        }
        if (!holding) {
            box.replaceChildren(
                el('p', { className: 'wl-position-empty', text: `You don’t own ${display} yet.` }),
                el('p', { className: 'text-sm muted mt-2', text: 'Buy with your investing cash — as little as $1.' }));
            return;
        }
        const cost = holding.quantity * holding.averagePrice;
        const value = priced ? holding.quantity * quote.price : null;
        const gain = value !== null ? value - cost : null;
        const position = state.position;
        const nodes = [
            el('p', { className: 'label', text: 'Market value' }),
            el('p', { className: 'figure figure-md mt-2', 'data-private': '', text: value !== null ? W.formatMoney(value, 'USD', { digits: 2 }) : '—' }),
        ];
        if (gain !== null) {
            const pill = WW.delta(cost ? (gain / cost) * 100 : 0, { amount: gain, pill: true });
            pill.setAttribute('data-private', '');
            nodes.push(el('p', { className: 'mt-2' }, pill, el('span', { className: 'text-sm muted', text: ' total return' })));
        } else {
            nodes.push(el('p', { className: 'text-sm muted mt-2', text: 'Value unavailable until a price can be retrieved.' }));
        }
        const rows = [
            [isCrypto ? 'Units' : 'Shares', unitsText(holding.quantity), { private: true }],
            ['Average cost', WW.formatPrice(holding.averagePrice), { private: true }],
            ['Cost basis', W.formatMoney(cost, 'USD', { digits: 2 }), { private: true }],
        ];
        if (priced && Number.isFinite(Number(quote.change))) rows.push(["Today’s return", W.formatMoney(holding.quantity * quote.change, 'USD', { sign: true, digits: 2 }), { private: true, className: quote.change >= 0 ? 'positive' : 'negative' }]);
        if (position && Number.isFinite(position.weight)) rows.push(['Portfolio weight', `${position.weight.toFixed(1)}%`]);
        nodes.push(WW.rows(rows, 'mt-4'));
        box.replaceChildren(...nodes);
    }

    async function loadPortfolio() {
        try {
            const data = await W.api('/api/wealth/portfolio', { passive: true, timeout: 25000 });
            state.cash = data.valuation.cash;
            const position = data.valuation.holdings.find(item => item.symbol === asset.symbol) || null;
            state.position = position;
            const raw = data.portfolio.holdings.find(item => item.symbol === asset.symbol);
            state.holding = raw ? { quantity: raw.quantity, averagePrice: raw.average_price } : null;
            if (Array.isArray(data.watchlist)) WW.setWatchlist(data.watchlist);
        } catch (error) {
            root.querySelector('[data-cash]').textContent = 'unavailable';
        }
        renderPosition();
        updateTradeAvailability();
    }

    // ── Watch ──────────────────────────────────────────────────────────
    const watchButton = $('[data-watch]');
    WW.setWatchlist(asset.watching ? [asset.symbol] : []);
    WW.onWatchlistChange(() => watchButton.setAttribute('aria-pressed', String(WW.isWatching(asset.symbol))));
    watchButton.addEventListener('click', async () => {
        if (watchButton.dataset.busy) return;
        watchButton.dataset.busy = '1';
        try { await WW.toggleWatch(asset.symbol, asset.name, !WW.isWatching(asset.symbol)); } catch (error) { /* toast shown */ }
        finally { delete watchButton.dataset.busy; }
    });

    // ── Trade availability ─────────────────────────────────────────────
    function blockReason(short = false) {
        if (!asset.tradable) return 'This asset can’t be traded in the demo.';
        if (!state.quote && !state.quoteError) return 'Loading the latest price…';
        if (!WW.isPriced(state.quote)) return short ? 'Orders are paused until a price can be retrieved.' : 'Market data temporarily unavailable. Orders are paused until a price can be retrieved.';
        return null;
    }

    // Orders still work when the price isn't live; this says which price they will use.
    function priceNotice() {
        if (!WW.isPriced(state.quote) || !state.quote.stale) return null;
        return state.quote.saved
            ? `Live prices can’t be reached right now. Orders use the saved price from ${W.formatDate(state.quote.asOf, 'datetime')}.`
            : 'The latest refresh failed. Orders use the last cached price shown here.';
    }

    function updateTradeAvailability() {
        const reason = blockReason(true);
        const notice = reason ? null : priceNotice();
        const note = $('[data-trade-note]');
        note.hidden = !(reason || notice) || state.quote === null && !state.quoteError;
        note.classList.toggle('notice-warning', Boolean(reason));
        note.classList.toggle('notice-info', !reason);
        if (reason || notice) $('[data-trade-note-text]').textContent = reason || notice;
        root.querySelectorAll('[data-trade-open]').forEach(button => {
            button.disabled = Boolean(reason) && (state.quote !== null || Boolean(state.quoteError));
            if (button.disabled) button.setAttribute('title', reason); else button.removeAttribute('title');
        });
    }

    // ── Trade dialog ───────────────────────────────────────────────────
    const dialog = doc.querySelector('[data-trade-dialog]');
    const form = dialog.querySelector('[data-step="form"]');
    const input = dialog.querySelector('[data-trade-input]');
    const errorBox = dialog.querySelector('[data-trade-error]');
    const trade = { side: 'buy', mode: 'amount', estimate: null };
    const sideGroup = WW.radioGroup(dialog.querySelector('[data-side-group]'), side => { trade.side = side; input.value = ''; syncTradeForm(); input.focus(); });
    const modeGroup = WW.radioGroup(dialog.querySelector('[data-mode-group]'), mode => { trade.mode = mode; input.value = ''; syncTradeForm(); input.focus(); });

    function showStep(name) {
        dialog.querySelectorAll('[data-step]').forEach(step => { step.hidden = step.dataset.step !== name; });
        const heading = dialog.querySelector(`[data-step="${name}"] .wl-step-title`);
        if (heading) global.setTimeout(() => heading.focus(), 20);
        dialog.scrollTop = 0;
    }

    function setError(message) {
        errorBox.hidden = !message;
        errorBox.replaceChildren(...(message ? [W.icon('alert', 'icon-sm'), el('span', { text: message })] : []));
        input.setAttribute('aria-invalid', message ? 'true' : 'false');
    }

    function parseInput() {
        const raw = input.value.replace(/[,\s$]/g, '');
        if (!raw) return null;
        if (!/^\d*\.?\d*$/.test(raw)) return NaN;
        return Number(raw);
    }

    /** Plain decimal text for an input (no grouping, no float noise). */
    function trimQty(value) {
        return Number(value).toFixed(qtyDigits).replace(/0+$/, '').replace(/\.$/, '');
    }

    function floorQty(value) {
        const factor = 10 ** qtyDigits;
        return Math.floor(value * factor + 1e-9) / factor;
    }

    /** Mirrors the server's sizing: amount orders become floor(amount / price) units. */
    function estimate() {
        const value = parseInput();
        const price = WW.isPriced(state.quote) ? Number(state.quote.price) : null;
        const holdingQty = state.holding ? state.holding.quantity : 0;
        const result = { value, price, quantity: null, total: null, error: null, empty: value === null };
        if (value === null || price === null) return result;
        if (!Number.isFinite(value) || value <= 0) { result.error = trade.mode === 'amount' ? 'Enter an amount greater than $0.' : `Enter a number of ${unitPlural} greater than 0.`; return result; }
        if (trade.mode === 'amount') {
            if (value > 1000000) { result.error = 'Simulated orders are limited to $1,000,000.'; return result; }
            result.quantity = floorQty(value / price);
            if (result.quantity <= 0) { result.error = `That amount is too small to ${trade.side} any ${unitPlural} at the current price.`; return result; }
        } else {
            const decimals = (String(input.value).split('.')[1] || '').length;
            if (decimals > qtyDigits) { result.error = `Use up to ${qtyDigits} decimal places.`; return result; }
            result.quantity = value;
        }
        result.total = result.quantity * price;
        if (trade.side === 'buy' && state.cash !== null && Math.round(result.total * 100) > Math.round(state.cash * 100)) {
            result.error = state.cash > 0 ? `Not enough investing cash. You have ${W.formatMoney(state.cash, 'USD', { digits: 2 })} available — add more from your accounts on the Portfolio page.` : 'You have no investing cash yet. Add cash from one of your accounts on the Portfolio page.';
            result.code = 'insufficient_cash';
        }
        if (trade.side === 'sell' && result.quantity > holdingQty + 1e-6) {
            result.error = holdingQty ? `You hold ${unitsText(holdingQty)}. Enter a smaller amount.` : `You don’t hold any ${unitPlural} to sell.`;
            result.code = 'insufficient_units';
        }
        if (trade.mode === 'amount' && result.total > 1000000) result.error = 'Simulated orders are limited to $1,000,000.';
        return result;
    }

    function renderEstimate(showErrors = false) {
        const est = estimate();
        trade.estimate = est;
        const priceText = est.price !== null ? WW.formatPrice(est.price, state.quote.currency) : '—';
        dialog.querySelector('[data-est-price]').textContent = priceText;
        const fresh = dialog.querySelector('[data-est-fresh]');
        fresh.textContent = state.quote && state.quote.saved ? `Saved · ${W.formatDate(state.quote.asOf, 'short')}` : state.quote && state.quote.stale ? 'Cached' : 'Delayed';
        const valueBox = dialog.querySelector('[data-est-value]');
        const afterBox = dialog.querySelector('[data-est-after]');
        dialog.querySelector('[data-est-label]').textContent = trade.mode === 'amount' ? `Estimated ${unitPlural}` : 'Estimated total';
        dialog.querySelector('[data-est-after-label]').textContent = trade.side === 'buy' ? 'Cash after order' : `${isCrypto ? 'Units' : 'Shares'} remaining`;
        if (est.quantity !== null && est.total !== null && !est.error) {
            valueBox.textContent = trade.mode === 'amount' ? `≈ ${unitsText(est.quantity)}` : `≈ ${W.formatMoney(est.total, 'USD', { digits: 2 })}`;
            afterBox.textContent = trade.side === 'buy'
                ? (state.cash !== null ? W.formatMoney(state.cash - est.total, 'USD', { digits: 2 }) : '—')
                : unitsText(Math.max(0, (state.holding ? state.holding.quantity : 0) - est.quantity));
        } else {
            valueBox.textContent = '—';
            afterBox.textContent = trade.side === 'buy' ? (state.cash !== null ? W.formatMoney(state.cash, 'USD', { digits: 2 }) : '—') : unitsText(state.holding ? state.holding.quantity : 0);
        }
        if (showErrors || (est.error && est.code)) setError(est.error);
        else if (!est.error) setError(null);
        return est;
    }

    function quickButtons() {
        const box = dialog.querySelector('[data-quick]');
        const buttons = [];
        if (trade.side === 'buy') {
            if (trade.mode === 'amount') {
                [100, 500, 1000].forEach(amount => buttons.push({ label: W.formatMoney(amount, 'USD', { digits: 0 }), apply: () => { input.value = String(amount); } }));
            }
        } else if (state.holding) {
            const qty = state.holding.quantity;
            [[0.25, '25%'], [0.5, '50%']].forEach(([fraction, label]) => buttons.push({ label, apply: () => { modeGroup.set('quantity'); trade.mode = 'quantity'; syncTradeForm(false); input.value = trimQty(floorQty(qty * fraction)); } }));
            buttons.push({ label: `All ${isCrypto ? 'units' : 'shares'}`, apply: () => { modeGroup.set('quantity'); trade.mode = 'quantity'; syncTradeForm(false); input.value = trimQty(qty); } });
        }
        box.replaceChildren(...buttons.map(item => el('button', { type: 'button', className: 'chip wl-chip-sm', onclick: () => { item.apply(); renderEstimate(true); input.focus(); } }, item.label)));
        box.hidden = !buttons.length;
    }

    function syncTradeForm(resetError = true) {
        const buy = trade.side === 'buy';
        dialog.querySelector('[data-trade-title]').textContent = `${buy ? 'Buy' : 'Sell'} ${asset.name}`;
        const amountMode = trade.mode === 'amount';
        dialog.querySelector('[data-input-prefix]').hidden = !amountMode;
        dialog.querySelector('[data-input-suffix]').hidden = amountMode;
        dialog.querySelector('[data-input-label]').textContent = amountMode ? `Amount in US dollars to ${buy ? 'invest' : 'sell'}` : `Number of ${unitPlural} to ${buy ? 'buy' : 'sell'}`;
        input.placeholder = amountMode ? '0.00' : '0';
        const help = dialog.querySelector('[data-trade-help]');
        if (buy) {
            help.replaceChildren('Cash available: ', el('span', { 'data-private': '', text: state.cash !== null ? W.formatMoney(state.cash, 'USD', { digits: 2 }) : '—' }));
        } else {
            help.replaceChildren('You hold ', el('span', { 'data-private': '', text: state.holding ? unitsText(state.holding.quantity) : `0 ${unitPlural}` }));
        }
        dialog.querySelectorAll('[data-disclaimer]').forEach(node => {
            node.textContent = isCrypto ? `This is a simulated transaction. No real crypto is ${buy ? 'purchased' : 'sold'}.` : `This is a simulated transaction. No real securities are ${buy ? 'purchased' : 'sold'}.`;
        });
        dialog.querySelector('[data-review]').textContent = `Review ${buy ? 'buy' : 'sell'} order`;
        const blocked = dialog.querySelector('[data-trade-blocked]');
        const reason = blockReason();
        blocked.hidden = !reason;
        if (reason) dialog.querySelector('[data-trade-blocked-text]').textContent = reason;
        dialog.querySelector('[data-review]').disabled = Boolean(reason);
        if (resetError) setError(null);
        quickButtons();
        renderEstimate(false);
    }

    function openTrade(side, opener) {
        trade.side = side === 'sell' && state.holding ? 'sell' : 'buy';
        trade.mode = 'amount';
        sideGroup.set(trade.side);
        modeGroup.set('amount');
        dialog.querySelector('[data-side-group] [data-side="sell"]').disabled = !state.holding;
        input.value = '';
        showStep('form');
        syncTradeForm();
        WW.openModal(dialog, opener, input);
    }

    root.querySelectorAll('[data-trade-open]').forEach(button => button.addEventListener('click', () => openTrade(button.dataset.tradeOpen, button)));
    input.addEventListener('input', () => renderEstimate(false));
    input.addEventListener('blur', () => { if (input.value) renderEstimate(true); });

    form.addEventListener('submit', event => {
        event.preventDefault();
        if (blockReason()) return;
        const est = renderEstimate(true);
        if (est.empty) { setError(trade.mode === 'amount' ? 'Enter an amount to continue.' : `Enter the number of ${unitPlural} to continue.`); input.focus(); return; }
        if (est.error) { input.focus(); return; }
        const buy = trade.side === 'buy';
        const rows = [
            ['Order', `${buy ? 'Buy' : 'Sell'} · Market (simulated)`],
            ['Asset', `${asset.name} (${display})`],
            ['Market price', WW.formatPrice(est.price, state.quote.currency)],
            [trade.mode === 'amount' ? `Estimated ${unitPlural}` : (isCrypto ? 'Units' : 'Shares'), `${trade.mode === 'amount' ? '≈ ' : ''}${unitsText(est.quantity)}`, { private: true }],
            ['Estimated total', W.formatMoney(est.total, 'USD', { digits: 2 }), { private: true }],
            buy ? ['Cash after order', W.formatMoney(state.cash - est.total, 'USD', { digits: 2 }), { private: true }] : ['Cash after order', W.formatMoney((state.cash || 0) + est.total, 'USD', { digits: 2 }), { private: true }],
        ];
        dialog.querySelector('[data-review-rows]').replaceChildren(WW.rows(rows, 'wl-review-rows'));
        const confirm = dialog.querySelector('[data-confirm]');
        confirm.textContent = `Confirm simulated ${buy ? 'buy' : 'sell'}`;
        confirm.disabled = false;
        dialog.querySelector('[data-confirm-error]').hidden = true;
        showStep('review');
    });

    dialog.querySelector('[data-back]').addEventListener('click', () => { showStep('form'); input.focus(); });

    dialog.querySelector('[data-confirm]').addEventListener('click', async event => {
        const button = event.currentTarget;
        const est = trade.estimate;
        if (!est || est.error || button.classList.contains('is-loading')) return;
        const confirmError = dialog.querySelector('[data-confirm-error]');
        confirmError.hidden = true;
        button.classList.add('is-loading');
        button.setAttribute('aria-busy', 'true');
        const body = { symbol: asset.symbol, side: trade.side };
        if (trade.mode === 'amount') body.amount = est.value;
        else body.quantity = trade.side === 'sell' && state.holding && Math.abs(est.quantity - state.holding.quantity) < 1e-6 ? state.holding.quantity : est.quantity;
        try {
            const result = await W.api('/api/wealth/trades', { method: 'POST', body, timeout: 25000 });
            const receipt = result.receipt;
            state.cash = result.portfolio.cash;
            const raw = result.portfolio.holdings.find(item => item.symbol === asset.symbol);
            state.holding = raw ? { quantity: raw.quantity, averagePrice: raw.average_price } : null;
            renderReceipt(receipt);
            showStep('receipt');
            renderPosition();
            loadPortfolio();
        } catch (error) {
            const code = error.data && error.data.code;
            if (code === 'insufficient_cash' || code === 'insufficient_units' || code === 'invalid_order') {
                showStep('form');
                setError(error.message);
                input.focus();
                if (code !== 'invalid_order') loadPortfolio();
            } else {
                confirmError.replaceChildren(W.icon('alert', 'icon-sm'), el('span', { text: error.message || 'The simulated order couldn’t be placed. Please try again.' }));
                confirmError.hidden = false;
                if (code === 'market_unavailable' || code === 'market_stale') {
                    button.disabled = true;
                    refreshQuote(true);
                }
            }
        } finally {
            button.classList.remove('is-loading');
            button.removeAttribute('aria-busy');
        }
    });

    function renderReceipt(receipt) {
        const buy = receipt.side === 'buy';
        const total = receipt.totalCents / 100;
        const box = dialog.querySelector('[data-receipt]');
        const asOf = W.parseDate(receipt.quoteAsOf);
        box.replaceChildren(
            WW.successMark(),
            el('h3', { className: 'wl-step-title', id: 'receiptTitle', tabindex: '-1', text: 'Simulated order complete' }),
            el('p', { className: 'receipt-amount', 'data-private': '', text: W.formatMoney(total, 'USD', { digits: 2 }) }),
            el('p', { className: 'receipt-to', 'data-private': '' }, `${buy ? 'Bought' : 'Sold'} ${unitsText(receipt.quantity)} at ${WW.formatPrice(receipt.price)}`),
            el('div', { className: 'receipt-meta' }, WW.rows([
                ['Asset', `${receipt.name} (${WW.displaySymbol(receipt.symbol)})`],
                ['Order', `${buy ? 'Buy' : 'Sell'} · Market (simulated)`],
                ['Executed price', WW.formatPrice(receipt.price)],
                [isCrypto ? 'Units' : 'Shares', unitsText(receipt.quantity), { private: true }],
                ['Total', W.formatMoney(total, 'USD', { digits: 2 }), { private: true }],
                ['Cash available', state.cash !== null ? W.formatMoney(state.cash, 'USD', { digits: 2 }) : null, { private: true }],
                ['Price as of', asOf ? `${receipt.priceNote === 'saved' ? W.formatDate(asOf, 'datetime') : WW.shortTime(asOf)}${receipt.priceNote === 'saved' ? ' (saved price)' : receipt.priceNote === 'cached' ? ' (cached price)' : ''}` : null],
                ['Reference', `SIM-${String(receipt.id).padStart(6, '0')}`],
            ])),
            el('p', { className: 'sim-note' }, W.icon('info', 'icon-sm'), isCrypto ? `This is a simulated transaction. No real crypto is ${buy ? 'purchased' : 'sold'}.` : `This is a simulated transaction. No real securities are ${buy ? 'purchased' : 'sold'}.`));
        global.setTimeout(() => { const title = box.querySelector('#receiptTitle'); if (title) title.focus(); }, 30);
    }

    // ── Load ───────────────────────────────────────────────────────────
    async function refreshQuote(passive = false) {
        try {
            const data = await W.api(`/api/wealth/quotes/${encodeURIComponent(asset.symbol)}?range=1d`, { passive: true, timeout: 25000 });
            state.quote = data;
            state.quoteError = null;
            if (Array.isArray(data.history) && data.history.length) state.history.set('1d', { points: data.history.map(point => ({ t: point.t, v: point.close })), stale: data.historyStale, saved: data.historySaved });
        } catch (error) {
            if (passive && state.quote) return;
            state.quote = null;
            state.quoteError = error;
        }
        renderQuote();
        renderPosition();
        if (dialog.open) syncTradeForm(false);
    }

    async function initialQuote() {
        try {
            const data = await W.api(`/api/wealth/quotes/${encodeURIComponent(asset.symbol)}?range=${encodeURIComponent(state.range)}`, { passive: true, timeout: 25000 });
            state.quote = data;
            if (Array.isArray(data.history) && data.history.length) state.history.set(state.range, { points: data.history.map(point => ({ t: point.t, v: point.close })), stale: data.historyStale, saved: data.historySaved });
        } catch (error) {
            state.quote = null;
            state.quoteError = error;
        }
        renderQuote();
        renderPosition();
        if (dialog.open) syncTradeForm(false);
        // Saved prices have no intraday detail, so open on the past month instead of today.
        const month = $('[data-range-group] [data-range="1m"]');
        if (state.quote && state.quote.saved && state.range === '1d' && month) month.click();
        else if (WW.isPriced(state.quote)) loadChart(state.range);
        else {
            chartBox.classList.remove('chart', 'is-up', 'is-down');
            chartBox.replaceChildren(el('div', { className: 'wl-chart-empty' }, W.icon('chart', 'icon-lg'), el('p', { className: 'text-sm', text: 'The price chart will appear once market data can be retrieved. Willow never draws estimated prices.' })));
            rangeSummary(null, state.range);
        }
    }

    async function retryAll() {
        const button = $('[data-retry]');
        button.classList.add('is-loading');
        state.history.clear();
        await initialQuote();
        loadProfile();
        button.classList.remove('is-loading');
        if (!WW.isPriced(state.quote)) W.showToast(WW.UNAVAILABLE, 'warning');
    }

    // One column on narrower screens: move "Your position" (and the risk note) up
    // under the price in the DOM itself, so keyboard order matches what's shown.
    (function arrangeForWidth() {
        const layout = $('.wl-asset-layout');
        const quote = $('.wl-quote-panel');
        const position = $('.wl-position');
        if (!layout || !quote || !position || !global.matchMedia) return;
        const aside = position.parentElement;
        const risk = $('.wl-risk');
        const query = global.matchMedia('(max-width: 1180px)');
        const place = () => {
            if (query.matches) {
                quote.after(position);
                if (risk) position.after(risk);
            } else {
                aside.prepend(position);
                if (risk) position.after(risk);
            }
        };
        place();
        if (query.addEventListener) query.addEventListener('change', place);
    })();

    WW.radioGroup($('[data-range-group]'), range => loadChart(range));
    $('[data-retry]').addEventListener('click', retryAll);

    (async () => {
        loadNews();
        loadPortfolio();
        await initialQuote();
        loadProfile();
    })();
    WW.poll(() => refreshQuote(true), 60000);
})(window);
