/* ═══════════════════════════════════════════════════════════════════════
   Willow Wealth — shared helpers for the portfolio, markets, asset detail
   and crypto screens. Page scripts (wealth-*.js) build on window.WillowWealth.
   Prices always come from the Willow API; nothing here estimates a price.
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';

(function (global) {
    const doc = global.document;
    const W = global.Willow;
    const UNAVAILABLE = 'Market data temporarily unavailable.';
    const CRYPTO_TONES = { BTC: 1, ETH: 2, SOL: 3, XRP: 6, ADA: 4, LTC: 0 };
    const TYPE_LABELS = { stock: 'Stock', etf: 'ETF', fund: 'Fund', crypto: 'Crypto', index: 'Index' };

    /** Ticker text without index carets or class suffixes, for marks. */
    function displaySymbol(symbol) {
        return String(symbol || '').replace(/^\^/, '');
    }

    /** Deterministic tone 0–7 (mirrored server-side in the EJS views). */
    function tone(symbol, type) {
        const key = String(symbol || '').toUpperCase();
        if (type === 'crypto' && Object.hasOwn(CRYPTO_TONES, key)) return CRYPTO_TONES[key];
        let hash = 7;
        for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) % 9973;
        return hash % 8;
    }

    function assetMark(symbol, type, options = {}) {
        const text = displaySymbol(symbol).replace(/[^A-Z0-9]/gi, '').slice(0, 4);
        const classes = ['asset-mark', `wl-tone-${tone(symbol, type)}`];
        if (type === 'crypto') classes.push('is-round');
        if (options.large) classes.push('asset-mark-lg');
        if (options.small) classes.push('wl-mark-sm');
        return W.el('span', { className: classes.join(' '), 'aria-hidden': 'true', text });
    }

    function detailHref(symbol, type) {
        return type === 'crypto' ? `/crypto/${encodeURIComponent(symbol)}` : `/wealth/stocks/${encodeURIComponent(symbol)}`;
    }

    function typeLabel(type) {
        return TYPE_LABELS[type] || 'Asset';
    }

    /** "shares" for securities, the ticker for crypto. */
    function unitWord(type, symbol, quantity) {
        if (type === 'crypto') return displaySymbol(symbol);
        return Number(quantity) === 1 ? 'share' : 'shares';
    }

    function formatQuantity(value, type) {
        const number = Number(value);
        if (!Number.isFinite(number)) return '—';
        const digits = type === 'crypto' ? 8 : 6;
        const fixed = number.toFixed(digits).replace(/0+$/, '').replace(/\.$/, '');
        const [whole, fraction] = fixed.split('.');
        const grouped = Number(whole).toLocaleString('en-US');
        return fraction ? `${grouped}.${fraction}` : grouped;
    }

    function formatPrice(value, currency = 'USD') {
        const number = Number(value);
        if (!Number.isFinite(number)) return '—';
        return W.formatMoney(number, currency || 'USD', { digits: Math.abs(number) < 1 ? 4 : 2 });
    }

    /** Index levels are points, not money. */
    function formatLevel(value) {
        return W.formatNumber(value, 2);
    }

    function isPriced(quote) {
        return Boolean(quote && !quote.unavailable && Number.isFinite(Number(quote.price)));
    }

    function direction(value) {
        const number = Number(value);
        if (!Number.isFinite(number) || Math.abs(number) < 1e-9) return 'flat';
        return number > 0 ? 'up' : 'down';
    }

    /**
     * Change indicator. options: { amount, currency, pill, suffix, level }.
     * Shows "—" when there is no change figure (never invents one).
     */
    function delta(percent, options = {}) {
        const pct = Number(percent);
        if (percent === null || percent === undefined || !Number.isFinite(pct)) {
            return W.el('span', { className: 'delta is-flat', text: '—' });
        }
        const dir = direction(options.amount !== undefined && Number.isFinite(Number(options.amount)) ? options.amount : pct);
        const parts = [];
        if (options.amount !== undefined && Number.isFinite(Number(options.amount))) {
            const amount = Number(options.amount);
            parts.push(options.level ? `${amount > 0 ? '+' : amount < 0 ? '−' : ''}${W.formatNumber(Math.abs(amount), 2)}` : W.formatMoney(amount, options.currency || 'USD', { sign: true, digits: Math.abs(amount) < 1 && Math.abs(amount) > 0 ? 4 : 2 }));
            parts.push(` (${W.formatPercent(pct)})`);
        } else {
            parts.push(W.formatPercent(pct));
        }
        if (options.suffix) parts.push(` ${options.suffix}`);
        const iconName = dir === 'up' ? 'arrow-up' : dir === 'down' ? 'arrow-down' : null;
        return W.el('span', { className: `delta is-${dir}${options.pill ? ' delta-pill' : ''}` },
            iconName ? W.icon(iconName) : null, parts.join(''));
    }

    /** "Delayed" / "Cached" freshness badge for a quote. */
    function freshness(quote) {
        if (!isPriced(quote)) return W.el('span', { className: 'badge badge-warning' }, W.icon('alert'), 'Unavailable');
        if (quote.stale) return W.el('span', { className: 'badge badge-warning', title: 'The latest refresh failed; showing the last cached quote.' }, W.icon('clock'), 'Cached');
        return W.el('span', { className: 'badge badge-outline', title: 'Market data may be delayed.' }, W.icon('clock'), 'Delayed');
    }

    const timeFormat = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });
    const dateTimeFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

    /** "2:43 PM" today, otherwise "Oct 1, 2:43 PM". */
    function shortTime(value) {
        const date = W.parseDate(value);
        if (!date) return '';
        return new Date().toDateString() === date.toDateString() ? timeFormat.format(date) : dateTimeFormat.format(date);
    }

    function asOfText(asOf) {
        const text = shortTime(asOf);
        return text ? `as of ${text}` : '';
    }

    function timeNow() {
        return timeFormat.format(new Date());
    }

    /** A strictly positive finite number, else null (the API reports some missing figures as 0). */
    function positive(value) {
        if (value === null || value === undefined || value === '') return null;
        const number = Number(value);
        return Number.isFinite(number) && number > 0 ? number : null;
    }

    /** Inline market-unavailable state with a retry button. */
    function unavailableState(onRetry, options = {}) {
        return W.empty({
            iconName: 'chart',
            title: UNAVAILABLE,
            text: options.text || 'Prices couldn’t be retrieved right now. Willow never shows estimated or made-up prices.',
            error: true,
            compact: options.compact !== false,
            action: onRetry ? { label: 'Retry', onClick: onRetry, primary: false } : null,
        });
    }

    function skeletonRows(count = 4, compact = false) {
        const rows = [];
        for (let i = 0; i < count; i++) {
            rows.push(W.el('div', { className: `wl-skel-row${compact ? ' is-compact' : ''}`, 'aria-hidden': 'true' },
                W.el('span', { className: 'skeleton wl-skel-mark' }),
                W.el('span', { className: 'wl-skel-main' }, W.el('span', { className: 'skeleton skeleton-line w-60' }), W.el('span', { className: 'skeleton skeleton-line w-40' })),
                W.el('span', { className: 'skeleton skeleton-line wl-skel-end' })));
        }
        return rows;
    }

    function setBusy(node, busy) {
        if (node) node.setAttribute('aria-busy', busy ? 'true' : 'false');
    }

    // ── Watchlist ──────────────────────────────────────────────────────
    const watchState = { symbols: null, listeners: new Set() };
    const stars = new Set();

    function syncStar(button) {
        const on = isWatching(button.dataset.symbol);
        button.setAttribute('aria-pressed', String(on));
        button.title = on ? 'Remove from watchlist' : 'Add to watchlist';
    }

    function setWatchlist(symbols) {
        watchState.symbols = new Set(symbols || []);
        stars.forEach(button => { if (button.isConnected) syncStar(button); else stars.delete(button); });
        watchState.listeners.forEach(listener => listener(watchState.symbols));
    }

    function isWatching(symbol) {
        return Boolean(watchState.symbols && watchState.symbols.has(symbol));
    }

    function onWatchlistChange(listener) {
        watchState.listeners.add(listener);
        return () => watchState.listeners.delete(listener);
    }

    /** Adds or removes a symbol; resolves to the new watchlist. Rolls back on failure. */
    async function toggleWatch(symbol, name, add) {
        const previous = new Set(watchState.symbols || []);
        const next = new Set(previous);
        if (add) next.add(symbol); else next.delete(symbol);
        setWatchlist([...next]);
        try {
            const result = add
                ? await W.api('/api/wealth/watchlist', { method: 'POST', body: { symbol } })
                : await W.api(`/api/wealth/watchlist/${encodeURIComponent(symbol)}`, { method: 'DELETE' });
            setWatchlist(result.watchlist);
            W.showToast(add ? `${name} added to your watchlist.` : `${name} removed from your watchlist.`, 'success', 2600);
            return result.watchlist;
        } catch (error) {
            setWatchlist([...previous]);
            W.showToast(error.message || 'Your watchlist couldn’t be updated. Please try again.', 'error');
            throw error;
        }
    }

    /** Star toggle (icon button) bound to the shared watchlist state. */
    function starButton(symbol, name, options = {}) {
        const button = W.el('button', {
            type: 'button',
            className: `btn btn-ghost btn-icon btn-sm wl-star${options.className ? ` ${options.className}` : ''}`,
            'aria-label': `Watch ${name}`,
            'aria-pressed': 'false',
            dataset: { symbol },
        }, W.icon('star', 'wl-star-off'), W.icon('star-fill', 'wl-star-on'));
        syncStar(button);
        if (stars.size > 200) stars.forEach(other => { if (!other.isConnected) stars.delete(other); });
        stars.add(button);
        button.addEventListener('click', async event => {
            event.preventDefault();
            event.stopPropagation();
            if (button.dataset.busy) return;
            button.dataset.busy = '1';
            try { await toggleWatch(symbol, name, !isWatching(symbol)); } catch (error) { /* toast already shown */ }
            finally { delete button.dataset.busy; }
        });
        return button;
    }

    // ── Radio groups (segmented range controls) ───────────────────────
    /** Roving-tabindex radiogroup: arrows/Home/End move, Enter/Space/click select. */
    function radioGroup(group, onChange) {
        const items = () => Array.from(group.querySelectorAll('[role="radio"]'));
        const select = (item, { focus = false, notify = true } = {}) => {
            items().forEach(other => {
                const on = other === item;
                other.setAttribute('aria-checked', String(on));
                other.classList.toggle('is-active', on);
                other.tabIndex = on ? 0 : -1;
            });
            if (focus) item.focus();
            if (notify && onChange) onChange(item.dataset.value || item.dataset.range || item.dataset.side || item.dataset.mode, item);
        };
        const current = items().find(item => item.getAttribute('aria-checked') === 'true') || items()[0];
        items().forEach(item => { item.tabIndex = item === current ? 0 : -1; });
        group.addEventListener('click', event => {
            const item = event.target.closest('[role="radio"]');
            if (!item || !group.contains(item) || item.disabled) return;
            if (item.getAttribute('aria-checked') === 'true') return;
            select(item);
        });
        group.addEventListener('keydown', event => {
            const list = items().filter(item => !item.disabled);
            const index = list.indexOf(doc.activeElement);
            if (index < 0) return;
            let next = null;
            if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = list[(index + 1) % list.length];
            else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = list[(index - 1 + list.length) % list.length];
            else if (event.key === 'Home') next = list[0];
            else if (event.key === 'End') next = list[list.length - 1];
            if (!next) return;
            event.preventDefault();
            select(next, { focus: true });
        });
        return {
            set(value, notify = false) {
                const item = items().find(candidate => (candidate.dataset.value || candidate.dataset.range || candidate.dataset.side || candidate.dataset.mode) === value);
                if (item) select(item, { notify });
            },
            get value() {
                const item = items().find(candidate => candidate.getAttribute('aria-checked') === 'true');
                return item ? (item.dataset.value || item.dataset.range || item.dataset.side || item.dataset.mode) : null;
            },
        };
    }

    // ── Polling ────────────────────────────────────────────────────────
    /** Calls fn every `ms` while the tab is visible; refreshes on return to the tab. */
    function poll(fn, ms = 60000) {
        let timer = null;
        let last = Date.now();
        const tick = async () => {
            if (doc.hidden) return;
            last = Date.now();
            try { await fn(); } catch (error) { /* background refresh failures stay quiet */ }
        };
        timer = global.setInterval(tick, ms);
        doc.addEventListener('visibilitychange', () => {
            if (!doc.hidden && Date.now() - last > ms) tick();
        });
        return () => global.clearInterval(timer);
    }

    // ── Dialog helpers ─────────────────────────────────────────────────
    /** Opens a <dialog>, remembers the opener and restores focus on close. */
    function openModal(dialog, opener, focusTarget) {
        dialog.__opener = opener || doc.activeElement;
        if (!dialog.__wired) {
            dialog.__wired = true;
            dialog.addEventListener('close', () => {
                doc.body.classList.remove('has-dialog');
                const back = dialog.__opener;
                if (back && back.isConnected && typeof back.focus === 'function') global.setTimeout(() => back.focus(), 0);
            });
        }
        W.openDialog(dialog);
        if (focusTarget) global.setTimeout(() => focusTarget.focus(), 30);
    }

    function successMark() {
        const ns = 'http://www.w3.org/2000/svg';
        const svg = doc.createElementNS(ns, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2.4');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        svg.setAttribute('aria-hidden', 'true');
        const path = doc.createElementNS(ns, 'path');
        path.setAttribute('d', 'M5 12.5l4.5 4.5L19 7.5');
        svg.append(path);
        return W.el('div', { className: 'success-mark' }, svg);
    }

    /** dl.dl-rows from [label, value, { private }] tuples (falsy values skipped). */
    function rows(entries, className = '') {
        return W.el('dl', { className: `dl-rows ${className}`.trim() }, entries.filter(entry => entry && entry[1] !== null && entry[1] !== undefined && entry[1] !== '').map(([label, value, options = {}]) =>
            W.el('div', null, W.el('dt', { text: label }), W.el('dd', { 'data-private': options.private ? '' : null, className: options.className || null }, value))));
    }

    function readJson(id) {
        const node = doc.getElementById(id);
        if (!node) return null;
        try { return JSON.parse(node.textContent); } catch (error) { return null; }
    }

    global.WillowWealth = {
        UNAVAILABLE, displaySymbol, tone, assetMark, detailHref, typeLabel, unitWord, formatQuantity, formatPrice, formatLevel,
        isPriced, direction, delta, freshness, shortTime, asOfText, timeNow, positive, unavailableState, skeletonRows, setBusy,
        setWatchlist, isWatching, onWatchlistChange, toggleWatch, starButton, radioGroup, poll, openModal, successMark, rows, readJson,
    };
})(window);
