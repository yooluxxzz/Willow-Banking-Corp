/* Willow Wealth — markets explorer (/wealth/markets). */
'use strict';

(function (global) {
    const doc = global.document;
    const W = global.Willow;
    const WW = global.WillowWealth;
    const root = doc.querySelector('[data-wealth-page="markets"]');
    if (!root || !W || !WW) return;

    const el = W.el;
    const $ = selector => root.querySelector(selector);
    const POPULAR = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'TSLA', 'GOOGL', 'META'];
    const FILTERS = ['all', 'stock', 'etf', 'fund', 'crypto', 'watchlist'];
    const FILTER_NOUNS = { all: ['asset', 'assets'], stock: ['stock', 'stocks'], etf: ['ETF', 'ETFs'], fund: ['fund', 'funds'], crypto: ['coin', 'coins'] };
    const state = {
        instruments: [],
        quotes: new Map(),
        filter: FILTERS.includes(root.dataset.initialFilter) ? root.dataset.initialFilter : 'all',
        query: (root.dataset.initialQuery || '').slice(0, 40),
        sort: 'featured',
        marketsFailed: false,
        loaded: false,
    };
    const list = $('[data-market-list]');
    const search = $('[data-search]');
    const sortSelect = $('[data-sort]');
    const count = $('[data-result-count]');
    const banner = $('[data-market-banner]');

    // ── URL state ──────────────────────────────────────────────────────
    function syncUrl() {
        const params = new URLSearchParams();
        if (state.filter !== 'all') params.set('type', state.filter);
        if (state.query) params.set('q', state.query);
        const next = `${global.location.pathname}${params.toString() ? `?${params}` : ''}`;
        if (next !== `${global.location.pathname}${global.location.search}`) global.history.replaceState(null, '', next);
    }

    // ── Rows ───────────────────────────────────────────────────────────
    function priceCell(quote) {
        if (!WW.isPriced(quote)) return [el('span', { className: 'wl-cell-strong muted', text: 'Unavailable' })];
        return [
            el('span', { className: 'wl-cell-strong', text: WW.formatPrice(quote.price, quote.currency) }),
            el('span', { className: 'wl-cell-sub wl-show-sm' }, WW.delta(quote.changePercent)),
        ];
    }

    function changeCell(quote) {
        if (!WW.isPriced(quote)) return [el('span', { className: 'muted', text: '—' })];
        return [WW.delta(quote.changePercent, { pill: true })];
    }

    function capCell(quote) {
        return [el('span', { className: 'muted', text: WW.isPriced(quote) && Number.isFinite(Number(quote.marketCap)) && quote.marketCap ? W.formatCompact(quote.marketCap, 'USD') : '—' })];
    }

    function marketRow(item) {
        const quote = state.quotes.get(item.symbol);
        const meta = [WW.displaySymbol(item.symbol), item.typeLabel || WW.typeLabel(item.type)];
        if (item.sector && item.type !== 'crypto') meta.push(item.sector);
        const row = el('tr', { 'data-symbol': item.symbol },
            el('td', { className: 'wl-col-asset' },
                el('a', { className: 'wl-asset-cell wl-row-link', href: WW.detailHref(item.symbol, item.type) },
                    WW.assetMark(item.symbol, item.type),
                    el('span', { className: 'wl-asset-text' },
                        el('span', { className: 'wl-asset-name', text: item.name }),
                        el('span', { className: 'wl-asset-sub', text: meta.join(' · ') })))),
            el('td', { className: 'num', 'data-cell': 'price' }, ...priceCell(quote)),
            el('td', { className: 'num wl-hide-sm', 'data-cell': 'change' }, ...changeCell(quote)),
            el('td', { className: 'num wl-hide-md', 'data-cell': 'cap' }, ...capCell(quote)),
            el('td', { className: 'wl-col-star' }, WW.starButton(item.symbol, item.name)));
        return row;
    }

    function updateRows() {
        list.querySelectorAll('tr[data-symbol]').forEach(row => {
            const quote = state.quotes.get(row.dataset.symbol);
            row.querySelector('[data-cell="price"]').replaceChildren(...priceCell(quote));
            row.querySelector('[data-cell="change"]').replaceChildren(...changeCell(quote));
            row.querySelector('[data-cell="cap"]').replaceChildren(...capCell(quote));
        });
    }

    // ── Filtering & sorting ────────────────────────────────────────────
    function matchScore(item, term) {
        if (!term) return 1;
        const symbol = item.symbol.toLowerCase();
        const name = item.name.toLowerCase();
        const haystack = `${symbol} ${name} ${(item.legalName || '').toLowerCase()} ${(item.sector || '').toLowerCase()} ${(item.typeLabel || '').toLowerCase()}`;
        if (symbol === term || WW.displaySymbol(symbol) === term) return 100;
        if (symbol.startsWith(term)) return 80;
        if (name.startsWith(term)) return 70;
        if (name.split(/\s+/).some(word => word.startsWith(term))) return 50;
        if (haystack.includes(term)) return 20;
        return 0;
    }

    function visibleItems() {
        const term = state.query.trim().toLowerCase();
        const watch = new Set();
        let items = state.instruments.filter(item => item.tradable);
        if (state.filter === 'watchlist') {
            items = items.filter(item => WW.isWatching(item.symbol));
            items.forEach(item => watch.add(item.symbol));
        } else if (state.filter !== 'all') {
            items = items.filter(item => item.type === state.filter);
        }
        const scored = items.map((item, index) => ({ item, index, score: matchScore(item, term) })).filter(entry => entry.score > 0);
        const price = entry => { const quote = state.quotes.get(entry.item.symbol); return WW.isPriced(quote) ? Number(quote.price) : null; };
        const change = entry => { const quote = state.quotes.get(entry.item.symbol); return WW.isPriced(quote) && Number.isFinite(Number(quote.changePercent)) ? Number(quote.changePercent) : null; };
        const nullsLast = (a, b, pick, dir) => {
            const x = pick(a);
            const y = pick(b);
            if (x === null && y === null) return a.index - b.index;
            if (x === null) return 1;
            if (y === null) return -1;
            return dir * (x - y) || a.index - b.index;
        };
        const sorters = {
            featured: (a, b) => (b.score - a.score) || a.index - b.index,
            name: (a, b) => a.item.name.localeCompare(b.item.name),
            'price-desc': (a, b) => nullsLast(a, b, price, -1),
            'price-asc': (a, b) => nullsLast(a, b, price, 1),
            'change-desc': (a, b) => nullsLast(a, b, change, -1),
            'change-asc': (a, b) => nullsLast(a, b, change, 1),
        };
        return scored.sort(sorters[state.sort] || sorters.featured).map(entry => entry.item);
    }

    function render() {
        if (!state.loaded) return;
        list.setAttribute('aria-busy', 'false');
        list.setAttribute('aria-labelledby', `tab-${state.filter}`);
        const items = visibleItems();
        const term = state.query.trim();
        if (!items.length) {
            count.textContent = 'No results';
            if (term) {
                list.replaceChildren(W.empty({
                    iconName: 'search',
                    title: `No ${state.filter === 'watchlist' ? 'watchlist assets' : 'assets'} match “${term}”`,
                    text: 'Try a company name, a ticker such as AAPL, or a sector such as “Semiconductors”.',
                    compact: true,
                    action: { label: 'Clear search', primary: false, onClick: () => { search.value = ''; setQuery(''); search.focus(); } },
                }));
            } else if (state.filter === 'watchlist') {
                list.replaceChildren(W.empty({
                    iconName: 'star',
                    title: 'Your watchlist is empty',
                    text: 'Select the star next to any asset to follow its price here and on your portfolio.',
                    compact: true,
                    action: { label: 'Browse all assets', primary: false, onClick: () => setFilter('all', true) },
                }));
            } else {
                list.replaceChildren(W.empty({ iconName: 'chart', title: 'No assets in this category', compact: true }));
            }
            return;
        }
        count.textContent = state.filter === 'watchlist'
            ? `${items.length} on your watchlist`
            : `${items.length} ${FILTER_NOUNS[state.filter][items.length === 1 ? 0 : 1]}${term ? ' found' : ''}`;
        const table = el('table', { className: 'table wl-table wl-market-table' },
            el('caption', { className: 'visually-hidden', text: 'Assets with delayed prices' }),
            el('thead', null, el('tr', null,
                el('th', { scope: 'col', text: 'Asset' }),
                el('th', { scope: 'col', className: 'num', text: 'Price' }),
                el('th', { scope: 'col', className: 'num wl-hide-sm', text: 'Today' }),
                el('th', { scope: 'col', className: 'num wl-hide-md', text: 'Market cap' }),
                el('th', { scope: 'col', className: 'wl-col-star' }, el('span', { className: 'visually-hidden', text: 'Watchlist' })))),
            el('tbody', null, items.map(marketRow)));
        list.replaceChildren(el('div', { className: 'table-wrap wl-table-wrap' }, table));
    }

    // ── Indices & popular ─────────────────────────────────────────────
    function renderIndices() {
        root.querySelectorAll('[data-index]').forEach(card => {
            const symbol = card.dataset.index;
            const quote = state.quotes.get(symbol);
            const head = card.querySelector('.wl-index-head');
            const name = head.querySelector('.wl-index-name');
            const level = card.querySelector('.wl-index-level');
            card.classList.toggle('is-unavailable', !WW.isPriced(quote));
            if (!WW.isPriced(quote)) {
                head.replaceChildren(name);
                level.replaceChildren(el('span', { className: 'muted', text: '—' }), el('span', { className: 'wl-index-change', text: 'Unavailable' }));
                card.querySelector('.wl-index-spark').replaceChildren();
                return;
            }
            head.replaceChildren(name, WW.delta(quote.changePercent, { pill: true }));
            level.replaceChildren(el('span', { className: 'num', text: WW.formatLevel(quote.price) }),
                el('span', { className: 'wl-index-change' }, Number.isFinite(Number(quote.change)) ? `${quote.change >= 0 ? '+' : '−'}${W.formatNumber(Math.abs(quote.change), 2)}` : ''));
            if (quote.stale) level.append(el('span', { className: 'badge badge-warning', text: 'Cached' }));
        });
    }

    async function loadIndexCharts() {
        await Promise.all(Array.from(root.querySelectorAll('[data-index]')).map(async card => {
            const symbol = card.dataset.index;
            const spark = card.querySelector('.wl-index-spark');
            if (!WW.isPriced(state.quotes.get(symbol)) || !global.WillowCharts) return;
            try {
                const history = await W.api(`/api/wealth/history/${encodeURIComponent(symbol)}?range=1m`, { passive: true, timeout: 20000 });
                const name = card.querySelector('.wl-index-name').textContent;
                if (history.points.length >= 2) global.WillowCharts.line(spark, history.points, { compact: true, height: 56, label: `${name}, past month`, animate: false });
            } catch (error) { spark.replaceChildren(); }
        }));
    }

    function renderPopular() {
        const box = $('[data-popular]');
        const items = POPULAR.map(symbol => state.instruments.find(item => item.symbol === symbol)).filter(Boolean);
        box.replaceChildren(...items.map(item => {
            const quote = state.quotes.get(item.symbol);
            return el('li', null, el('a', { className: 'wl-popular-card', href: WW.detailHref(item.symbol, item.type) },
                el('span', { className: 'wl-popular-top' }, WW.assetMark(item.symbol, item.type, { small: true }), el('span', { className: 'wl-popular-symbol', text: item.symbol })),
                el('span', { className: 'wl-popular-name', text: item.name }),
                el('span', { className: `wl-popular-price${WW.isPriced(quote) ? '' : ' muted'}`, text: WW.isPriced(quote) ? WW.formatPrice(quote.price, quote.currency) : '—' }),
                WW.isPriced(quote) ? WW.delta(quote.changePercent) : el('span', { className: 'delta is-flat', text: 'Unavailable' })));
        }));
    }

    function renderStatus() {
        const status = $('[data-market-status]');
        const priced = [...state.quotes.values()].filter(WW.isPriced);
        const stale = priced.some(quote => quote.stale);
        status.replaceChildren(W.icon('clock', 'icon-sm'), state.marketsFailed || !priced.length ? ' Prices unavailable' : stale ? ' Cached · delayed data' : ` Delayed data · updated ${WW.timeNow()}`);
    }

    // ── Controls ───────────────────────────────────────────────────────
    function setFilter(filter, focusTab = false) {
        state.filter = FILTERS.includes(filter) ? filter : 'all';
        root.querySelectorAll('[data-filter]').forEach(tab => {
            const on = tab.dataset.filter === state.filter;
            tab.setAttribute('aria-selected', String(on));
            tab.tabIndex = on ? 0 : -1;
            if (on && focusTab) tab.focus();
        });
        syncUrl();
        render();
    }

    function setQuery(value) {
        state.query = String(value || '').slice(0, 40);
        syncUrl();
        render();
    }

    const tabs = $('[data-filters]');
    tabs.addEventListener('click', event => {
        const tab = event.target.closest('[data-filter]');
        if (tab) setFilter(tab.dataset.filter);
    });
    tabs.addEventListener('keydown', event => {
        const all = Array.from(tabs.querySelectorAll('[data-filter]'));
        const index = all.indexOf(doc.activeElement);
        if (index < 0) return;
        let next = null;
        if (event.key === 'ArrowRight') next = all[(index + 1) % all.length];
        else if (event.key === 'ArrowLeft') next = all[(index - 1 + all.length) % all.length];
        else if (event.key === 'Home') next = all[0];
        else if (event.key === 'End') next = all[all.length - 1];
        if (!next) return;
        event.preventDefault();
        setFilter(next.dataset.filter, true);
    });

    let debounce = null;
    search.addEventListener('input', () => {
        global.clearTimeout(debounce);
        debounce = global.setTimeout(() => setQuery(search.value.trim()), 220);
    });
    search.addEventListener('keydown', event => {
        if (event.key === 'Escape' && search.value) { search.value = ''; setQuery(''); }
    });
    sortSelect.addEventListener('change', () => { state.sort = sortSelect.value; render(); });

    WW.onWatchlistChange(() => {
        if (state.filter !== 'watchlist' || !state.loaded) return;
        // Removing the focused row's star re-renders the list; keep keyboard focus nearby.
        const stars = Array.from(list.querySelectorAll('.wl-star'));
        const focusedIndex = stars.indexOf(doc.activeElement);
        render();
        if (focusedIndex < 0) return;
        const next = list.querySelectorAll('.wl-star');
        const target = next[Math.min(focusedIndex, next.length - 1)] || list.querySelector('button') || doc.getElementById('tab-watchlist');
        if (target) target.focus();
    });

    // ── Load ───────────────────────────────────────────────────────────
    async function loadQuotes(passive = false) {
        try {
            const data = await W.api('/api/wealth/markets', { passive: true, timeout: 25000 });
            (data.quotes || []).filter(Boolean).forEach(quote => state.quotes.set(quote.symbol, quote));
            state.marketsFailed = Boolean(data.unavailable);
        } catch (error) {
            if (passive) return;
            state.marketsFailed = true;
        }
        banner.hidden = !state.marketsFailed;
    }

    async function load() {
        const [instruments, , watch] = await Promise.allSettled([
            W.api('/api/wealth/instruments', { passive: true }),
            loadQuotes(),
            W.api('/api/wealth/watchlist', { passive: true, timeout: 20000 }),
        ]);
        if (instruments.status === 'fulfilled') state.instruments = instruments.value.instruments || [];
        if (watch.status === 'fulfilled') WW.setWatchlist(watch.value.watchlist);
        else WW.setWatchlist([]);
        if (!state.instruments.length) {
            list.setAttribute('aria-busy', 'false');
            list.replaceChildren(W.empty({ iconName: 'chart', title: 'Markets couldn’t be loaded', text: 'Please check your connection and try again.', error: true, compact: true, action: { label: 'Retry', primary: false, onClick: () => global.location.reload() } }));
            return;
        }
        state.loaded = true;
        renderIndices();
        renderPopular();
        renderStatus();
        render();
        loadIndexCharts();
    }

    $('[data-retry]').addEventListener('click', async event => {
        const button = event.currentTarget;
        button.classList.add('is-loading');
        await loadQuotes();
        button.classList.remove('is-loading');
        renderIndices();
        renderPopular();
        renderStatus();
        updateRows();
        loadIndexCharts();
        if (state.marketsFailed) W.showToast(WW.UNAVAILABLE, 'warning');
    });

    search.value = state.query;
    syncUrl();
    load();
    WW.poll(async () => {
        await loadQuotes(true);
        renderIndices();
        renderPopular();
        renderStatus();
        updateRows();
    }, 60000);
})(window);
