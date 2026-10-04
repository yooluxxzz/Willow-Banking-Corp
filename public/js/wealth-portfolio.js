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
            day.replaceChildren(el('span', { className: 'muted', text: valuation.cash > 0 ? 'All in cash. Place a simulated order to start investing.' : 'Add cash from one of your accounts to start investing.' }));
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
        if (!valuation.contributed) returnSub.replaceChildren('Add cash to start');
        else if (valuation.pricing === 'unavailable') returnSub.replaceChildren(`Holdings at cost · vs ${W.formatMoney(valuation.contributed, 'USD', { digits: 2 })} moved in`);
        else returnSub.replaceChildren(WW.delta(valuation.totalReturnPercent), ` vs ${W.formatMoney(valuation.contributed, 'USD', { digits: 2 })} moved in`);
        metric('invested').replaceChildren(W.formatMoney(valuation.marketValue, 'USD', { digits: 2 }));
        const investedSub = root.querySelector('[data-metric-sub="invested"]');
        const count = valuation.holdings.length;
        investedSub.textContent = count ? `${count} holding${count === 1 ? '' : 's'}${valuation.pricing === 'unavailable' ? ' · at cost' : ''}` : 'No holdings yet';
        metric('cash').replaceChildren(W.formatMoney(valuation.cash, 'USD', { digits: 2 }));

        const updated = $('[data-updated]');
        const fresh = W.priceStatus(valuation.holdings.filter(holding => holding.priceAvailable));
        const badge = valuation.pricing === 'unavailable'
            ? null
            : fresh.kind !== 'live' ? el('span', { className: 'badge badge-warning', title: fresh.kind === 'saved' ? fresh.title : 'Some prices are from the last cached quote.' }, W.icon('clock'), fresh.text)
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
            ? [el('span', { className: 'wl-cell-strong', text: WW.formatPrice(holding.price) }), el('span', { className: 'wl-cell-sub' }, WW.delta(holding.dayChangePercent), holding.stale ? el('span', { className: 'badge badge-warning wl-mini-badge', text: holding.saved ? 'Saved' : 'Cached' }) : null)]
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
            const funded = valuation.cash > 0;
            box.replaceChildren(W.empty({
                iconName: 'pie',
                title: 'No holdings yet',
                text: funded ? 'Your investing cash is ready. Explore stocks, ETFs, funds or crypto and place your first order.' : 'Move money in from one of your Willow accounts, then explore stocks, ETFs, funds or crypto.',
                action: funded ? { label: 'Explore markets', href: '/wealth/markets' } : { label: 'Add cash', onClick: () => openCash('in') },
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
            box.replaceChildren(W.empty({ iconName: 'activity', title: 'No orders yet', text: 'Buys and sells you place will appear here.', compact: true }));
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
                    el('p', { className: 'text-sm', text: 'Your performance chart starts with your first order.' })));
                note.textContent = 'Portfolio value over time, including cash.';
                return;
            }
            box.replaceChildren();
            global.WillowCharts.line(box, data.points, { range: range === 'all' ? 'max' : range, currency: 'USD', height: 240, baseline: data.contributed || undefined, label: 'Portfolio value', private: true });
            const baseline = data.contributed ? ` Dashed line: ${W.formatMoney(data.contributed, 'USD', { digits: 2 })} moved in.` : '';
            note.textContent = data.partial
                ? `Some price history couldn’t be loaded; affected holdings use their trade price.${baseline}`
                : `Portfolio value over time, including cash.${baseline}`;
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
            holdings.replaceChildren(W.empty({ iconName: 'pie', title: 'Your portfolio couldn’t be loaded', text: error.message, error: true, compact: true, action: retry }));
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

    // ── Cash in and out ────────────────────────────────────────────────
    const cashDialog = doc.getElementById('cashDialog');
    const cashForm = doc.getElementById('cashForm');
    let cashInfo = null;

    async function loadCash() {
        const box = doc.querySelector('[data-cash-moves]');
        try {
            cashInfo = await W.api('/api/wealth/cash', { passive: true });
            if (!cashInfo.transfers.length) {
                box.replaceChildren(el('p', { className: 'muted text-sm', text: 'No cash moved yet. Money you add from your accounts, or withdraw back to them, is listed here.' }));
                return;
            }
            box.replaceChildren(el('ul', { className: 'list-plain', role: 'list' }, cashInfo.transfers.slice(0, 6).map(move => el('li', { className: 'list-row' },
                el('span', { className: `icon-tile icon-tile-sm${move.direction === 'in' ? ' is-positive' : ''}` }, W.icon(move.direction === 'in' ? 'arrow-down-left' : 'arrow-up-right')),
                el('span', { className: 'list-row-main' }, el('span', { className: 'list-row-title', text: move.direction === 'in' ? `From ${move.account}` : `To ${move.account}` }), el('span', { className: 'list-row-sub', text: W.formatDate(move.createdAt) })),
                el('span', { className: 'list-row-end' }, el('strong', { className: move.direction === 'in' ? 'positive' : '', 'data-private': '', text: `${move.direction === 'in' ? '+' : '−'}${W.formatCents(move.amountCents)}` }))))));
        } catch (error) {
            cashInfo = null;
            box.replaceChildren(el('p', { className: 'muted text-sm', text: 'Cash movements couldn’t load.' }));
        }
    }

    function syncCashForm() {
        const direction = cashForm.querySelector('input[name="direction"]:checked').value;
        doc.getElementById('cashDialogTitle').textContent = direction === 'in' ? 'Add cash to investing' : 'Withdraw investing cash';
        cashForm.querySelector('[data-cash-account-label]').textContent = direction === 'in' ? 'From' : 'To';
        cashForm.querySelector('[data-cash-submit]').textContent = direction === 'in' ? 'Add cash' : 'Withdraw';
        const select = cashForm.elements.accountId;
        const help = cashForm.querySelector('[data-cash-help]');
        const accounts = cashInfo ? cashInfo.accounts : [];
        const current = select.value;
        select.replaceChildren(...accounts.map(account => el('option', { value: account.id, text: direction === 'in' ? `${account.name} · ${W.formatCents(account.availableCents)} available` : account.name, 'data-private-text': account.name })));
        W.syncPrivateOptions(select);
        if (accounts.some(account => String(account.id) === current)) select.value = current;
        cashForm.querySelector('[data-cash-submit]').disabled = !cashInfo;
        if (!cashInfo) help.textContent = 'Your accounts couldn’t be loaded just now. Close this and try again in a moment.';
        else if (!accounts.length) help.textContent = 'Open a US dollar account first.';
        else if (direction === 'in') {
            const account = accounts.find(item => String(item.id) === select.value) || accounts[0];
            help.textContent = account.availableCents ? `Up to ${W.formatCents(account.availableCents)} from this account.` : 'This account has no money yet — add money to it first.';
        } else help.textContent = `${W.formatCents(cashInfo.cashCents)} of investing cash can be withdrawn. Sell holdings to free up more.`;
    }

    async function openCash(direction) {
        cashForm.reset();
        cashForm.querySelector(`input[name="direction"][value="${direction}"]`).checked = true;
        cashForm.querySelector('[data-cash-error]').hidden = true;
        if (!cashInfo) await loadCash();
        syncCashForm();
        W.openDialog(cashDialog);
        cashForm.elements.amount.focus();
    }

    doc.querySelectorAll('[data-cash-open]').forEach(button => button.addEventListener('click', () => openCash(button.dataset.cashOpen)));
    cashForm.addEventListener('change', event => { if (event.target.name === 'direction' || event.target.name === 'accountId') syncCashForm(); });
    cashForm.addEventListener('submit', async event => {
        event.preventDefault();
        const error = cashForm.querySelector('[data-cash-error]');
        error.hidden = true;
        const button = cashForm.querySelector('[data-cash-submit]');
        button.classList.add('is-loading');
        try {
            const direction = cashForm.querySelector('input[name="direction"]:checked').value;
            const result = await W.api('/api/wealth/cash', { method: 'POST', body: { direction, accountId: cashForm.elements.accountId.value, amount: String(cashForm.elements.amount.value).replace(/[,\s$]/g, '') } });
            W.closeDialog(cashDialog);
            W.showToast(result.message, 'success');
            cashInfo = null;
            await Promise.all([load(), loadCash()]);
            loadPerformance(state.range);
            W.highlight($('[data-metric="cash"]').closest('div'));
        } catch (err) {
            error.textContent = err.message;
            error.hidden = false;
        } finally {
            button.classList.remove('is-loading');
        }
    });

    WW.radioGroup($('[data-range-group]'), range => loadPerformance(range));
    $('[data-retry]').addEventListener('click', reload);

    (async () => {
        loadWatchlist();
        loadCash();
        await load();
        loadPerformance(state.range);
    })();
    WW.poll(async () => { await load({ passive: true }); await loadWatchlist(true); }, 60000);
})(window);
