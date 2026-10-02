/* Willow Wealth — portfolio dashboard (/wealth). */
'use strict';

(function (global) {
    const doc = global.document;
    const W = global.Willow;
    const WW = global.WillowWealth;
    const root = doc.querySelector('[data-wealth-page="portfolio"]');
    if (!root || !W || !WW) return;

    const $ = selector => root.querySelector(selector);
    const ALLOCATION_COLORS = { stock: 'var(--chart-1)', etf: 'var(--chart-2)', fund: 'var(--chart-4)', crypto: 'var(--chart-3)', cash: 'var(--chart-8)' };
    const state = { valuation: null, range: '6m', firstRender: true, perfToken: 0 };
    const el = W.el;

    // ── Hero ───────────────────────────────────────────────────────────
    function renderHero(valuation) {
        const total = $('[data-portfolio-total]');
        const format = value => W.formatMoney(value, 'USD', { digits: 2 });
        if (state.firstRender && !W.prefersReducedMotion()) {
            total.textContent = format(0);
            W.countUp(total, valuation.total, format, 700);
        } else {
            total.textContent = format(valuation.total);
        }

        const day = $('[data-portfolio-day]');
        if (valuation.pricing === 'none-held') {
            day.replaceChildren(el('span', { className: 'muted', text: 'All in cash. Place a simulated order to start investing.' }));
        } else if (valuation.pricing === 'unavailable') {
            day.replaceChildren(el('span', { className: 'badge badge-warning' }, W.icon('alert'), 'Prices unavailable'), el('span', { className: 'muted', text: ' Holdings valued at cost' }));
        } else {
            const change = WW.delta(valuation.dayChangePercent, { amount: valuation.dayChange, pill: true });
            change.setAttribute('data-private', '');
            day.replaceChildren(change, el('span', { className: 'muted', text: valuation.pricing === 'partial' ? ' today · some prices unavailable' : ' today' }));
        }

        const metric = key => $(`[data-metric="${key}"]`);
        metric('return').replaceChildren(W.formatMoney(valuation.totalReturn, 'USD', { sign: true, digits: 2 }));
        const returnSub = root.querySelector('[data-metric-sub="return"]');
        if (valuation.pricing === 'unavailable') returnSub.replaceChildren('Holdings at cost · vs $100,000 starting cash');
        else returnSub.replaceChildren(WW.delta(valuation.totalReturnPercent), ' vs $100,000 starting cash');
        metric('invested').replaceChildren(W.formatMoney(valuation.marketValue, 'USD', { digits: 2 }));
        const investedSub = root.querySelector('[data-metric-sub="invested"]');
        const count = valuation.holdings.length;
        investedSub.textContent = count ? `${count} holding${count === 1 ? '' : 's'}${valuation.pricing === 'unavailable' ? ' · at cost' : ''}` : 'No holdings yet';
        metric('cash').replaceChildren(W.formatMoney(valuation.cash, 'USD', { digits: 2 }));

        const updated = $('[data-updated]');
        const stale = valuation.holdings.some(holding => holding.stale);
        const badge = valuation.pricing === 'unavailable'
            ? null
            : stale ? el('span', { className: 'badge badge-warning', title: 'Some prices are from the last cached quote.' }, W.icon('clock'), 'Cached')
                : el('span', { className: 'badge badge-outline', title: 'Market data may be delayed.' }, W.icon('clock'), 'Delayed');
        updated.replaceChildren(el('span', { className: 'text-xs muted', text: `Updated ${WW.timeNow()}` }), badge);
    }

    function heroError(message) {
        $('[data-portfolio-total]').replaceChildren(el('span', { className: 'muted wl-hero-dash', text: '—' }));
        $('[data-portfolio-day]').replaceChildren(el('span', { className: 'muted', text: message }));
        root.querySelectorAll('[data-metric]').forEach(node => node.replaceChildren('—'));
    }

    // ── Holdings ───────────────────────────────────────────────────────
    function holdingRow(holding) {
        const href = WW.detailHref(holding.symbol, holding.type);
        const unit = WW.unitWord(holding.type, holding.symbol, holding.quantity);
        const quantityText = `${WW.formatQuantity(holding.quantity, holding.type)} ${unit}`;
        const priceCell = holding.priceAvailable
            ? [el('span', { className: 'wl-cell-strong', text: WW.formatPrice(holding.price) }), el('span', { className: 'wl-cell-sub' }, WW.delta(holding.dayChangePercent), holding.stale ? el('span', { className: 'badge badge-warning wl-mini-badge', text: 'Cached' }) : null)]
            : [el('span', { className: 'badge badge-warning' }, W.icon('alert'), 'Unavailable')];
        const gainPct = () => { const node = WW.delta(holding.gainPercent); node.setAttribute('data-private', ''); return node; };
        return el('tr', null,
            el('td', { className: 'wl-col-asset' },
                el('a', { className: 'wl-asset-cell wl-row-link', href },
                    WW.assetMark(holding.symbol, holding.type),
                    el('span', { className: 'wl-asset-text' },
                        el('span', { className: 'wl-asset-name', text: holding.name }),
                        el('span', { className: 'wl-asset-sub' }, `${WW.displaySymbol(holding.symbol)} · `, el('span', { 'data-private': '', text: quantityText }))))),
            el('td', { className: 'num wl-hide-sm' }, ...priceCell),
            el('td', { className: 'num' },
                el('span', { className: 'wl-cell-strong', 'data-private': '', text: W.formatMoney(holding.marketValue, 'USD', { digits: 2 }) }),
                holding.priceAvailable ? el('span', { className: 'wl-cell-sub wl-show-sm' }, gainPct()) : el('span', { className: 'wl-cell-sub muted', text: 'at cost' })),
            el('td', { className: 'num wl-hide-sm' },
                el('span', { className: 'wl-cell-strong', 'data-private': '', text: holding.priceAvailable ? W.formatMoney(holding.gain, 'USD', { sign: true, digits: 2 }) : '—' }),
                holding.priceAvailable ? el('span', { className: 'wl-cell-sub' }, gainPct()) : null),
            el('td', { className: 'num wl-hide-md' },
                el('span', { className: 'wl-cell-strong', text: `${holding.weight.toFixed(1)}%` }),
                el('span', { className: 'wl-weight', 'aria-hidden': 'true' }, el('span', { style: `--value:${Math.min(100, Math.max(0, holding.weight)).toFixed(2)}%` }))));
    }

    function renderHoldings(valuation) {
        const box = $('[data-holdings]');
        WW.setBusy(box, false);
        if (!valuation.holdings.length) {
            box.replaceChildren(W.empty({
                iconName: 'pie',
                title: 'No holdings yet',
                text: 'Your $100,000 in simulated cash is ready. Explore stocks, ETFs, funds or crypto and place your first simulated order.',
                action: { label: 'Explore markets', href: '/wealth/markets' },
            }));
            return;
        }
        const table = el('table', { className: 'table wl-table' },
            el('caption', { className: 'visually-hidden', text: 'Your simulated holdings' }),
            el('thead', null, el('tr', null,
                el('th', { scope: 'col', text: 'Asset' }),
                el('th', { scope: 'col', className: 'num wl-hide-sm', text: 'Price · today' }),
                el('th', { scope: 'col', className: 'num', text: 'Value' }),
                el('th', { scope: 'col', className: 'num wl-hide-sm', text: 'Total return' }),
                el('th', { scope: 'col', className: 'num wl-hide-md', text: 'Weight' }))),
            el('tbody', null, valuation.holdings.map(holdingRow)));
        box.replaceChildren(el('div', { className: 'table-wrap wl-table-wrap' }, table));
    }

    // ── Activity ───────────────────────────────────────────────────────
    function renderActivity(activity) {
        const box = $('[data-activity]');
        WW.setBusy(box, false);
        if (!activity.length) {
            box.replaceChildren(W.empty({ iconName: 'activity', title: 'No simulated orders yet', text: 'Buys and sells you place with demo cash will appear here.', compact: true }));
            return;
        }
        const list = el('ul', { className: 'list-plain wl-activity', role: 'list' }, activity.slice(0, 8).map(trade => {
            const instrumentType = /^(BTC|ETH|SOL|XRP|ADA|LTC)$/.test(trade.symbol) ? 'crypto' : 'stock';
            const buy = trade.side === 'buy';
            const unit = WW.unitWord(instrumentType, trade.symbol, trade.quantity);
            return el('li', null, el('a', { className: 'list-row wl-list-link', href: WW.detailHref(trade.symbol, instrumentType) },
                el('span', { className: `icon-tile icon-tile-sm${buy ? '' : ' is-accent'}` }, W.icon(buy ? 'plus' : 'minus')),
                el('span', { className: 'list-row-main' },
                    el('span', { className: 'list-row-title', text: `${buy ? 'Bought' : 'Sold'} ${trade.name}` }),
                    el('span', { className: 'list-row-sub', 'data-private': '' }, `${WW.formatQuantity(trade.quantity, instrumentType)} ${unit} at ${WW.formatPrice(trade.price)} · Simulated order`)),
                el('span', { className: 'list-row-end' },
                    el('strong', { 'data-private': '', text: W.formatCents(trade.total_cents) }),
                    el('small', { text: W.relativeDay(trade.created_at) }))));
        }));
        box.replaceChildren(list);
    }

    // ── Allocation ─────────────────────────────────────────────────────
    function renderAllocation(valuation) {
        const box = $('[data-allocation]');
        const series = valuation.allocation.map(item => ({ label: item.label, value: item.value, color: ALLOCATION_COLORS[item.key] }));
        if (!series.length || !global.WillowCharts) {
            box.replaceChildren(el('p', { className: 'muted text-sm', text: 'Allocation appears once your portfolio has a value.' }));
            return;
        }
        global.WillowCharts.donut(box, series, { size: 160, currency: 'USD', private: true, centerLabel: 'Total value', label: 'Portfolio allocation by asset type' });
        if (valuation.pricing === 'unavailable') box.append(el('p', { className: 'text-xs muted mt-3', text: 'Holdings valued at cost while prices are unavailable.' }));
    }

    // ── Watchlist ──────────────────────────────────────────────────────
    async function loadWatchlist(passive = false) {
        const box = $('[data-watchlist]');
        try {
            const data = await W.api('/api/wealth/watchlist', { passive: true, timeout: 20000 });
            WW.setWatchlist(data.watchlist);
            WW.setBusy(box, false);
            if (!data.watchlist.length) {
                box.replaceChildren(W.empty({ iconName: 'star', title: 'Your watchlist is empty', text: 'Star an asset in Markets to follow its price here.', compact: true, action: { label: 'Browse markets', href: '/wealth/markets', primary: false } }));
                return;
            }
            const quotes = new Map((data.quotes || []).filter(Boolean).map(quote => [quote.symbol, quote]));
            const shown = data.watchlist.slice(0, 6);
            const list = el('ul', { className: 'list-plain', role: 'list' }, shown.map(symbol => {
                const quote = quotes.get(symbol) || { symbol, name: symbol, unavailable: true };
                return el('li', null, el('a', { className: 'list-row wl-list-link', href: WW.detailHref(symbol, quote.type) },
                    WW.assetMark(symbol, quote.type, { small: true }),
                    el('span', { className: 'list-row-main' },
                        el('span', { className: 'list-row-title', text: quote.name || symbol }),
                        el('span', { className: 'list-row-sub', text: WW.displaySymbol(symbol) })),
                    el('span', { className: 'list-row-end' },
                        el('strong', { className: WW.isPriced(quote) ? null : 'muted', text: WW.isPriced(quote) ? WW.formatPrice(quote.price, quote.currency) : '—' }),
                        WW.isPriced(quote) ? WW.delta(quote.changePercent) : el('small', { text: 'Unavailable' }))));
            }));
            const nodes = [list];
            if (data.watchlist.length > shown.length) nodes.push(el('a', { className: 'link-arrow text-sm mt-3', href: '/wealth/markets?type=watchlist' }, `View all ${data.watchlist.length}`, W.icon('arrow-right')));
            box.replaceChildren(...nodes);
        } catch (error) {
            if (passive) return;
            WW.setBusy(box, false);
            box.replaceChildren(W.empty({ iconName: 'star', title: 'Watchlist unavailable', text: error.message, error: true, compact: true, action: { label: 'Retry', onClick: () => loadWatchlist(), primary: false } }));
        }
    }

    // ── Performance ────────────────────────────────────────────────────
    async function loadPerformance(range) {
        state.range = range;
        const token = ++state.perfToken;
        const box = $('[data-perf-chart]');
        const note = $('[data-perf-note]');
        box.setAttribute('aria-busy', 'true');
        box.replaceChildren(el('div', { className: 'skeleton skeleton-block wl-chart-skeleton', 'aria-hidden': 'true' }));
        try {
            const data = await W.api(`/api/wealth/performance?range=${encodeURIComponent(range)}`, { passive: true, timeout: 25000 });
            if (token !== state.perfToken) return;
            box.setAttribute('aria-busy', 'false');
            const hasTrades = state.valuation ? state.valuation.activity.length > 0 : true;
            if (data.partial && state.valuation && state.valuation.pricing === 'unavailable') {
                box.replaceChildren(el('div', { className: 'wl-chart-empty' }, W.icon('trend', 'icon-lg'), el('p', { className: 'text-sm', text: 'Performance history needs market prices. It will appear once they can be retrieved.' })));
                note.textContent = 'Portfolio value over time, including cash.';
                return;
            }
            if (!hasTrades || !data.points || data.points.length < 2) {
                box.replaceChildren(el('div', { className: 'wl-chart-empty' },
                    W.icon('trend', 'icon-lg'),
                    el('p', { className: 'text-sm', text: 'Your performance chart starts with your first simulated order.' })));
                note.textContent = 'Portfolio value over time, including cash.';
                return;
            }
            box.replaceChildren();
            global.WillowCharts.line(box, data.points, { range: range === 'all' ? 'max' : range, currency: 'USD', height: 240, baseline: 100000, label: 'Simulated portfolio value' });
            note.textContent = data.partial
                ? 'Some price history couldn’t be loaded; affected holdings use their trade price. Dashed line: $100,000 starting cash.'
                : 'Portfolio value over time, including cash. Dashed line: $100,000 starting cash.';
        } catch (error) {
            if (token !== state.perfToken) return;
            box.setAttribute('aria-busy', 'false');
            box.replaceChildren(WW.unavailableState(() => loadPerformance(state.range), { text: 'Performance history couldn’t be loaded right now.' }));
        }
    }

    // ── Load ───────────────────────────────────────────────────────────
    function showBanner(show, text) {
        const banner = $('[data-market-banner]');
        banner.hidden = !show;
        if (text) banner.querySelector('[data-market-banner-text]').textContent = text;
    }

    async function load({ passive = false } = {}) {
        try {
            const data = await W.api('/api/wealth/portfolio', { passive: true, timeout: 25000 });
            const valuation = data.valuation;
            state.valuation = valuation;
            if (Array.isArray(data.watchlist) && !passive) WW.setWatchlist(data.watchlist);
            renderHero(valuation);
            renderHoldings(valuation);
            renderActivity(valuation.activity || []);
            renderAllocation(valuation);
            if (valuation.pricing === 'unavailable') showBanner(true, 'Holdings are shown at cost until prices can be retrieved.');
            else if (valuation.pricing === 'partial') showBanner(true, 'Some holdings are shown at cost until their prices can be retrieved.');
            else showBanner(false);
            state.firstRender = false;
            return true;
        } catch (error) {
            if (passive) return false;
            heroError(error.message);
            const retry = { label: 'Retry', onClick: () => reload(), primary: false };
            const holdings = $('[data-holdings]');
            WW.setBusy(holdings, false);
            holdings.replaceChildren(W.empty({ iconName: 'pie', title: 'Your demo portfolio couldn’t be loaded', text: error.message, error: true, compact: true, action: retry }));
            const activity = $('[data-activity]');
            WW.setBusy(activity, false);
            activity.replaceChildren();
            $('[data-allocation]').replaceChildren(el('p', { className: 'muted text-sm', text: 'Unavailable right now.' }));
            return false;
        }
    }

    async function reload() {
        const button = $('[data-retry]');
        if (button) button.classList.add('is-loading');
        const ok = await load();
        if (ok) loadPerformance(state.range);
        loadWatchlist();
        if (button) button.classList.remove('is-loading');
    }

    WW.radioGroup($('[data-range-group]'), range => loadPerformance(range));
    $('[data-retry]').addEventListener('click', reload);

    (async () => {
        loadWatchlist();
        await load();
        loadPerformance(state.range);
    })();
    WW.poll(async () => { await load({ passive: true }); await loadWatchlist(true); }, 60000);
})(window);
