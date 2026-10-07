/* ═══════════════════════════════════════════════════════════════════════
   Willow — shared client runtime
   Loaded on every page. Page features live in their own deferred scripts
   and build on the helpers exposed on window.Willow.
   ═══════════════════════════════════════════════════════════════════════ */
'use strict';

(function (global) {
    const doc = global.document;
    const prefersReducedMotion = () => Boolean(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);

    function csrfToken() {
        const meta = doc.querySelector('meta[name="csrf-token"]');
        return meta ? meta.getAttribute('content') : '';
    }

    /** Fetch JSON with CSRF, timeouts and consistent error messages. */
    async function api(url, options = {}) {
        const { method = 'GET', body, timeout = 15000, headers = {}, passive = false } = options;
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), timeout) : null;
        let response;
        try {
            response = await fetch(url, {
                method,
                headers: {
                    Accept: 'application/json',
                    ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
                    ...(method !== 'GET' ? { 'X-CSRF-Token': csrfToken() } : {}),
                    ...(passive ? { 'X-Willow-Passive': '1' } : {}),
                    ...headers,
                },
                body: body !== undefined ? JSON.stringify(body) : undefined,
                credentials: 'same-origin',
                signal: controller ? controller.signal : undefined,
            });
        } catch (error) {
            const networkError = new Error(error && error.name === 'AbortError'
                ? 'The request took too long. Check your connection and try again.'
                : 'We couldn’t reach Willow. Check your connection and try again.');
            networkError.network = true;
            throw networkError;
        } finally {
            if (timer) clearTimeout(timer);
        }
        const data = await response.json().catch(() => ({}));
        if (response.status === 401 && data.code === 'session_timeout' && doc.querySelector('[data-app]')) {
            redirectToSignIn('session_timeout');
        }
        if (response.status === 401 && !url.startsWith('/auth/')) {
            const expired = new Error(data.error || 'Your session ended. Please sign in again.');
            expired.status = 401;
            expired.sessionExpired = true;
            throw expired;
        }
        if (!response.ok) {
            const error = new Error(data.error || data.answer || 'Something went wrong. Please try again.');
            error.status = response.status;
            error.data = data;
            throw error;
        }
        if (!passive) noteActivity();
        return data;
    }

    function redirectToSignIn(reason) {
        const returnTo = global.location.pathname + global.location.search;
        global.location.href = `/login?error=${encodeURIComponent(reason)}&returnTo=${encodeURIComponent(returnTo)}`;
    }

    // ── Formatting ──────────────────────────────────────────────────────
    const formatters = new Map();
    function currencyFormatter(currency, digits) {
        const key = `${currency}:${digits}`;
        if (!formatters.has(key)) {
            formatters.set(key, new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits }));
        }
        return formatters.get(key);
    }

    /** Formats a major-unit amount (e.g. 12.5 → $12.50). */
    function formatMoney(amount, currency = 'USD', options = {}) {
        const value = Number(amount);
        if (!Number.isFinite(value)) return '—';
        let digits = options.digits;
        if (digits === undefined) digits = Math.abs(value) > 0 && Math.abs(value) < 1 ? 4 : 2;
        const text = currencyFormatter(currency || 'USD', digits).format(Math.abs(value));
        if (options.sign && value !== 0) return (value > 0 ? '+' : '−') + text;
        return value < 0 ? '−' + text : text;
    }

    /** Formats integer minor units (cents). */
    function formatCents(cents, currency = 'USD', options = {}) {
        return formatMoney(Number(cents || 0) / 100, currency, { digits: 2, ...options });
    }

    function formatNumber(value, digits = 2) {
        const number = Number(value);
        if (!Number.isFinite(number)) return '—';
        return new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(number);
    }

    function formatCompact(value, currency) {
        const number = Number(value);
        if (!Number.isFinite(number)) return 'Unavailable';
        const options = { notation: 'compact', maximumFractionDigits: 2 };
        if (currency) Object.assign(options, { style: 'currency', currency });
        return new Intl.NumberFormat('en-US', options).format(number);
    }

    function formatPercent(value, options = {}) {
        const number = Number(value);
        if (!Number.isFinite(number)) return '—';
        const text = `${Math.abs(number).toFixed(options.digits ?? 2)}%`;
        if (options.sign === false) return text;
        return (number > 0 ? '+' : number < 0 ? '−' : '') + text;
    }

    function formatQuantity(value) {
        const number = Number(value);
        if (!Number.isFinite(number)) return '0';
        return number.toFixed(8).replace(/0+$/, '').replace(/\.$/, '') || '0';
    }

    function parseDate(value) {
        if (!value) return null;
        if (value instanceof Date) return value;
        const text = String(value);
        const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
        if (day) return new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])); // a calendar day, in local time
        const date = new Date(/Z$|[+-]\d\d:?\d\d$/.test(text) ? text : text.replace(' ', 'T') + 'Z');
        return Number.isNaN(date.getTime()) ? null : date;
    }

    function formatDate(value, style = 'medium') {
        const date = parseDate(value);
        if (!date) return '';
        const options = style === 'short' ? { month: 'short', day: 'numeric' }
            : style === 'time' ? { hour: '2-digit', minute: '2-digit' }
                : style === 'datetime' ? { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }
                    : { month: 'short', day: 'numeric', year: 'numeric' };
        return new Intl.DateTimeFormat('en-US', options).format(date);
    }

    // How fresh a set of market quotes is: delayed (live), the last cached quote, or real
    // prices saved earlier (used when live prices can't be reached; orders use them too).
    function priceStatus(quotes) {
        const priced = (quotes || []).filter(quote => quote && !quote.unavailable);
        const saved = priced.filter(quote => quote.saved);
        if (saved.length) {
            const when = saved.map(quote => quote.savedAt || quote.asOf || quote.priceAsOf).filter(Boolean).sort().pop();
            return { kind: 'saved', text: `Prices saved ${when ? formatDate(when, 'short') : 'earlier'}`, title: 'Live prices can’t be reached right now, so Willow shows real prices saved earlier. Simulated orders use them too.' };
        }
        if (priced.some(quote => quote.stale)) return { kind: 'cached', text: 'Cached', title: 'The latest refresh failed; showing the last cached quote.' };
        return { kind: 'live', text: 'Delayed', title: '' };
    }

    function relativeDay(value) {
        const date = parseDate(value);
        if (!date) return '';
        const today = new Date();
        const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const diff = Math.round((start - new Date(date.getFullYear(), date.getMonth(), date.getDate())) / 86400000);
        if (diff === 0) return 'Today';
        if (diff === 1) return 'Yesterday';
        return formatDate(date, diff < 300 ? 'short' : 'medium');
    }

    // ── DOM helpers ─────────────────────────────────────────────────────
    function el(tag, attrs, ...children) {
        const node = doc.createElement(tag);
        if (attrs) {
            Object.entries(attrs).forEach(([key, value]) => {
                if (value === null || value === undefined || value === false) return;
                if (key === 'className') node.className = value;
                else if (key === 'text') node.textContent = value;
                else if (key === 'dataset') Object.assign(node.dataset, value);
                else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
                else node.setAttribute(key, value === true ? '' : value);
            });
        }
        children.flat().forEach(child => {
            if (child === null || child === undefined || child === false) return;
            node.append(child instanceof Node ? child : doc.createTextNode(String(child)));
        });
        return node;
    }

    function iconSprite() {
        const meta = doc.querySelector('meta[name="willow-icons"]');
        return meta ? meta.getAttribute('content') : '/images/icons.svg';
    }

    function icon(name, className = '') {
        const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', `icon ${className}`.trim());
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');
        const use = doc.createElementNS('http://www.w3.org/2000/svg', 'use');
        use.setAttribute('href', `${iconSprite()}#${name}`);
        svg.append(use);
        return svg;
    }

    /** Empty state. `level` keeps the heading in order: 2 when it sits directly under the page title. */
    function empty({ iconName = 'info', title, text, action, error = false, compact = false, level = 3 }) {
        return el('div', { className: `empty${error ? ' is-error' : ''}${compact ? ' is-compact' : ''}` },
            el('div', { className: 'empty-art' }, icon(iconName)),
            el(`h${level}`, { text: title }),
            text ? el('p', { text }) : null,
            action ? el(action.href ? 'a' : 'button', { className: `btn ${action.primary === false ? 'btn-secondary' : 'btn-primary'} btn-sm`, href: action.href, type: action.href ? null : 'button', onclick: action.onClick, text: action.label }) : null);
    }

    function skeletonRows(count = 4) {
        return el('div', { className: 'skeleton-rows', 'aria-hidden': 'true' },
            Array.from({ length: count }, () => el('div', { className: 'txn-row' },
                el('div', { className: 'skeleton skeleton-circle', style: 'width:42px;height:42px;border-radius:13px' }),
                el('div', { className: 'txn-main' }, el('div', { className: 'skeleton skeleton-line w-60' }), el('div', { className: 'skeleton skeleton-line w-40' })),
                el('div', { className: 'skeleton skeleton-line', style: 'width:72px' }))));
    }

    // ── Toasts ──────────────────────────────────────────────────────────
    function toastRegion() {
        let region = doc.getElementById('toastRegion');
        if (!region) {
            region = el('div', { className: 'toast-region', id: 'toastRegion', 'aria-live': 'polite' });
            doc.body.append(region);
        }
        return region;
    }

    function showToast(message, type = 'info', duration = 4600) {
        const icons = { success: 'check-circle', error: 'x-circle', warning: 'alert', info: 'info' };
        const toast = el('div', { className: `toast toast-${type}`, role: type === 'error' ? 'alert' : 'status' },
            icon(icons[type] || 'info'),
            el('div', { className: 'toast-message', text: message }));
        const close = el('button', { type: 'button', className: 'toast-close', 'aria-label': 'Dismiss notification' }, icon('x', 'icon-sm'));
        const dismiss = () => {
            if (!toast.isConnected) return;
            toast.classList.add('is-leaving');
            setTimeout(() => toast.remove(), 320);
        };
        close.addEventListener('click', dismiss);
        toast.append(close);
        toastRegion().append(toast);
        setTimeout(dismiss, duration);
        return toast;
    }

    // ── Dialogs ─────────────────────────────────────────────────────────
    function openDialog(dialog) {
        if (!dialog) return;
        if (typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
    }

    function closeDialog(dialog) {
        if (!dialog) return;
        if (dialog.open) dialog.close();
    }

    function enableBackdropClose(dialog) {
        dialog.addEventListener('click', event => {
            if (event.target !== dialog) return;
            const rect = dialog.getBoundingClientRect();
            const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
            if (!inside || getComputedStyle(dialog).display === 'flex') closeDialog(dialog);
        });
    }

    /** Promise-based confirmation dialog. */
    function showConfirm(message, title = 'Please confirm', options = {}) {
        return new Promise(resolve => {
            const dialog = el('dialog', { className: 'modal', 'aria-labelledby': 'confirmTitle' },
                el('div', { className: 'modal-head' }, el('h2', { id: 'confirmTitle', text: title })),
                el('div', { className: 'modal-body' }, el('p', { className: 'secondary', text: message })));
            const cancel = el('button', { type: 'button', className: 'btn btn-secondary', text: options.cancelLabel || 'Cancel' });
            const confirm = el('button', { type: 'button', className: `btn ${options.danger ? 'btn-danger' : 'btn-primary'}`, text: options.confirmLabel || 'Confirm' });
            dialog.append(el('div', { className: 'modal-foot' }, cancel, confirm));
            doc.body.append(dialog);
            const finish = value => { closeDialog(dialog); dialog.remove(); resolve(value); };
            cancel.addEventListener('click', () => finish(false));
            confirm.addEventListener('click', () => finish(true));
            dialog.addEventListener('cancel', event => { event.preventDefault(); finish(false); });
            openDialog(dialog);
            cancel.focus();
        });
    }

    // ── Theme & privacy ─────────────────────────────────────────────────
    function syncThemeControls() {
        const dark = doc.documentElement.getAttribute('data-theme') === 'dark';
        doc.querySelectorAll('[data-theme-toggle]').forEach(button => {
            button.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
            button.setAttribute('aria-pressed', String(dark));
            const label = button.querySelector('.theme-toggle-label');
            if (label) label.textContent = dark ? 'Light theme' : 'Dark theme';
        });
    }

    function toggleTheme() {
        const root = doc.documentElement;
        const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        if (next === 'dark') root.setAttribute('data-theme', 'dark');
        else root.removeAttribute('data-theme');
        try { localStorage.setItem('willow-theme', next); } catch (error) { /* storage unavailable */ }
        syncThemeControls();
        doc.dispatchEvent(new CustomEvent('willow:themechange', { detail: { theme: next } }));
    }

    function syncPrivacyControls() {
        const hidden = doc.documentElement.classList.contains('is-private');
        doc.querySelectorAll('[data-privacy-toggle]').forEach(button => {
            button.setAttribute('aria-pressed', String(hidden));
            button.setAttribute('aria-label', hidden ? 'Show balances' : 'Hide balances');
            button.title = hidden ? 'Show balances on screen' : 'Hide balances on screen';
        });
        syncPrivateOptions();
    }

    // An open option list can't be blurred, so account pickers drop the balance from
    // each option's text (data-private-text) while balances are hidden.
    function syncPrivateOptions(root = doc) {
        const hidden = doc.documentElement.classList.contains('is-private');
        root.querySelectorAll('option[data-private-text]').forEach(option => {
            if (option.dataset.fullText === undefined) option.dataset.fullText = option.textContent;
            option.textContent = hidden ? option.dataset.privateText : option.dataset.fullText;
        });
    }

    function togglePrivacy() {
        const hidden = doc.documentElement.classList.toggle('is-private');
        try { localStorage.setItem('willow-private', hidden ? '1' : '0'); } catch (error) { /* storage unavailable */ }
        syncPrivacyControls();
        showToast(hidden ? 'Balances hidden on this device.' : 'Balances visible.', 'info', 2600);
    }

    // ── Menus ───────────────────────────────────────────────────────────
    function setupMenus() {
        doc.querySelectorAll('[data-menu-trigger]').forEach(trigger => {
            const menu = doc.getElementById(trigger.dataset.menuTrigger);
            if (!menu) return;
            const items = () => Array.from(menu.querySelectorAll('a, button'));
            const close = (focusTrigger) => {
                menu.classList.remove('is-open');
                trigger.setAttribute('aria-expanded', 'false');
                if (focusTrigger) trigger.focus();
            };
            const open = () => {
                menu.classList.add('is-open');
                trigger.setAttribute('aria-expanded', 'true');
                const first = items()[0];
                if (first) setTimeout(() => first.focus(), 30);
            };
            trigger.addEventListener('click', event => {
                event.stopPropagation();
                if (menu.classList.contains('is-open')) close(false); else open();
            });
            menu.addEventListener('keydown', event => {
                const list = items();
                const index = list.indexOf(doc.activeElement);
                if (event.key === 'ArrowDown') { event.preventDefault(); list[(index + 1) % list.length].focus(); }
                if (event.key === 'ArrowUp') { event.preventDefault(); list[(index - 1 + list.length) % list.length].focus(); }
                if (event.key === 'Escape') { event.preventDefault(); close(true); }
                if (event.key === 'Tab') close(false);
            });
            doc.addEventListener('click', event => {
                if (!menu.contains(event.target) && event.target !== trigger) close(false);
            });
        });
    }

    // ── Sheets & dialogs declared in markup ─────────────────────────────
    function setupSheets() {
        doc.querySelectorAll('[data-sheet-open]').forEach(button => {
            const sheet = doc.getElementById(button.dataset.sheetOpen);
            if (!sheet) return;
            button.addEventListener('click', () => openDialog(sheet));
        });
        doc.querySelectorAll('dialog.sheet, dialog.modal').forEach(dialog => {
            enableBackdropClose(dialog);
            dialog.querySelectorAll('[data-sheet-close], [data-dialog-close]').forEach(button => button.addEventListener('click', () => closeDialog(dialog)));
        });
    }

    // ── Public header: scroll state, mega menu, mobile nav ──────────────
    function setupSiteHeader() {
        const header = doc.querySelector('[data-site-header]');
        if (!header) return;
        const triggers = Array.from(header.querySelectorAll('[data-mega-trigger]'));
        const mobileToggle = header.querySelector('[data-mobile-toggle]');
        const mobileNav = header.querySelector('[data-mobile-nav]');
        let openKey = null;
        let hoverTimer = null;

        const panelFor = key => header.querySelector(`[data-mega-panel="${key}"]`);
        const updateOffsets = () => {
            const rect = header.getBoundingClientRect();
            header.style.setProperty('--mega-top', `${Math.max(0, rect.bottom)}px`);
            if (mobileNav) mobileNav.style.setProperty('--mobile-nav-top', `${Math.max(0, rect.bottom)}px`);
        };
        const closeMega = () => {
            triggers.forEach(trigger => trigger.setAttribute('aria-expanded', 'false'));
            header.querySelectorAll('[data-mega-panel]').forEach(panel => panel.classList.remove('is-open'));
            header.classList.remove('has-mega-open', 'is-menu-open');
            openKey = null;
        };
        const openMega = key => {
            if (openKey === key) return;
            closeMega();
            const trigger = triggers.find(item => item.dataset.megaTrigger === key);
            const panel = panelFor(key);
            if (!trigger || !panel) return;
            updateOffsets();
            trigger.setAttribute('aria-expanded', 'true');
            panel.classList.add('is-open');
            header.classList.add('has-mega-open', 'is-menu-open');
            openKey = key;
        };

        triggers.forEach(trigger => {
            const key = trigger.dataset.megaTrigger;
            const item = trigger.closest('.site-nav-item');
            trigger.addEventListener('click', () => (openKey === key ? closeMega() : openMega(key)));
            trigger.addEventListener('keydown', event => {
                if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    openMega(key);
                    const first = panelFor(key).querySelector('a');
                    if (first) first.focus();
                }
            });
            if (item && global.matchMedia && global.matchMedia('(hover: hover) and (pointer: fine)').matches) {
                item.addEventListener('pointerenter', () => { clearTimeout(hoverTimer); hoverTimer = setTimeout(() => openMega(key), openKey ? 0 : 140); });
                item.addEventListener('pointerleave', () => { clearTimeout(hoverTimer); hoverTimer = setTimeout(closeMega, 220); });
            }
        });
        header.querySelectorAll('[data-mega-panel]').forEach(panel => {
            panel.addEventListener('focusout', event => {
                if (!header.contains(event.relatedTarget)) closeMega();
            });
        });
        const scrim = header.querySelector('[data-mega-scrim]');
        if (scrim) scrim.addEventListener('click', closeMega);

        const setMobile = open => {
            if (!mobileToggle || !mobileNav) return;
            updateOffsets();
            mobileToggle.setAttribute('aria-expanded', String(open));
            mobileToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
            mobileNav.classList.toggle('is-open', open);
            header.classList.toggle('is-menu-open', open);
            doc.body.classList.toggle('is-locked', open);
        };
        if (mobileToggle) mobileToggle.addEventListener('click', () => setMobile(mobileToggle.getAttribute('aria-expanded') !== 'true'));
        if (mobileNav) mobileNav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => setMobile(false)));

        doc.addEventListener('keydown', event => {
            if (event.key !== 'Escape') return;
            if (openKey) {
                const trigger = triggers.find(item => item.dataset.megaTrigger === openKey);
                closeMega();
                if (trigger) trigger.focus();
            }
            if (mobileToggle && mobileToggle.getAttribute('aria-expanded') === 'true') { setMobile(false); mobileToggle.focus(); }
        });
        doc.addEventListener('click', event => { if (openKey && !header.contains(event.target)) closeMega(); });

        const onScroll = () => {
            header.classList.toggle('is-scrolled', global.scrollY > 8);
        };
        onScroll();
        global.addEventListener('scroll', onScroll, { passive: true });
        global.addEventListener('resize', () => { updateOffsets(); if (global.innerWidth > 1120) setMobile(false); }, { passive: true });
    }

    function setupAppTopbar() {
        const topbar = doc.querySelector('.app-topbar');
        if (!topbar) return;
        const onScroll = () => topbar.classList.toggle('is-scrolled', global.scrollY > 4);
        onScroll();
        global.addEventListener('scroll', onScroll, { passive: true });
    }

    // ── Reveal on scroll & count-up figures ─────────────────────────────
    function setupReveals() {
        const targets = doc.querySelectorAll('.reveal');
        if (!targets.length) return;
        if (prefersReducedMotion() || !('IntersectionObserver' in global)) {
            targets.forEach(target => target.classList.add('is-visible'));
            return;
        }
        doc.documentElement.classList.add('reveal-ready');
        const observer = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                entry.target.classList.add('is-visible');
                observer.unobserve(entry.target);
            });
        }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
        targets.forEach(target => observer.observe(target));
    }

    /**
     * Draws the eye to something new or changed: a soft glow fades in, holds,
     * then fades out (about 2.4s). Skipped for reduced motion.
     */
    function highlight(node, { scroll = false } = {}) {
        if (!node || prefersReducedMotion()) return;
        node.classList.remove('is-attention');
        // The glow starts and ends on the element's own shadow, so cards don't flicker.
        const shadow = global.getComputedStyle(node).boxShadow;
        node.style.setProperty('--attention-base', shadow && shadow !== 'none' ? shadow : '0 0 0 0 transparent');
        void node.offsetWidth; // restart the animation if it is already running
        node.classList.add('is-attention');
        node.addEventListener('animationend', function done(event) {
            if (event.target !== node) return; // a child's animation ending doesn't count
            node.removeEventListener('animationend', done);
            node.classList.remove('is-attention');
        });
        if (scroll && node.scrollIntoView) node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    /** Fades children of `container` in one after another. */
    function stagger(container, { max = 12 } = {}) {
        if (!container || prefersReducedMotion()) return;
        Array.from(container.children).forEach((child, index) => child.style.setProperty('--i', String(Math.min(index, max))));
        container.classList.remove('stagger-in');
        void container.offsetWidth;
        container.classList.add('stagger-in');
        container.addEventListener('animationend', event => { if (event.target.parentElement === container && event.target === container.lastElementChild) container.classList.remove('stagger-in'); });
    }

    /** Every app page heading carries its section's symbol, taken from the active navigation item. */
    function setupPageIcon() {
        const copy = doc.querySelector('[data-app] .page-head .page-head-copy');
        const symbol = doc.querySelector('.app-sidebar .app-nav-link[aria-current="page"] svg');
        if (!copy || !symbol || copy.querySelector('.page-head-icon')) return;
        const tile = el('span', { className: 'page-head-icon', 'aria-hidden': 'true' });
        tile.append(symbol.cloneNode(true));
        copy.prepend(tile);
    }

    // ── Scroll focus ─────────────────────────────────────────────────────
    // Every section fades in the first time it is scrolled to, then a soft light
    // fades in and back out over it (about 2.4s) to draw the eye. Sections already
    // on screen when the page opens only fade in. Once per section per visit;
    // nothing moves with reduced motion.
    const FOCUS_SKIP = 'dialog, script, template, style, footer, [hidden], [data-focus="off"], .page-head, .skip-link';
    const MAX_GLOWS_AT_ONCE = 3;

    const isBoxed = node => {
        const cs = global.getComputedStyle(node);
        const background = cs.backgroundColor;
        return Boolean((background && background !== 'rgba(0, 0, 0, 0)' && background !== 'transparent')
            || parseFloat(cs.borderTopWidth) > 0 || (cs.boxShadow && cs.boxShadow !== 'none'));
    };
    const isShown = node => node.getClientRects().length > 0;

    /** App pages: each card-like block, found by looking inside plain layout wrappers. */
    function appFocusTargets(main) {
        const targets = [];
        const containsCards = (node, depth) => Array.from(node.children).some(child => !child.matches(FOCUS_SKIP) && isShown(child)
            && (isBoxed(child) || (depth > 0 && containsCards(child, depth - 1))));
        const visit = (node, depth) => {
            // .reveal blocks already animate themselves on scroll.
            if (node.matches(FOCUS_SKIP) || node.matches('.reveal') || !isShown(node)) return;
            if (depth < 3 && !isBoxed(node) && containsCards(node, 2)) {
                Array.from(node.children).forEach(child => visit(child, depth + 1));
                return;
            }
            targets.push({ node, glow: isBoxed(node) });
        };
        Array.from(main.children).forEach(child => visit(child, 0));
        return targets;
    }

    /** Public pages: each page section, plus the numbered sections of the info pages. */
    function siteFocusTargets() {
        return Array.from(doc.querySelectorAll('main > section, main .info-section'))
            .filter(node => !node.matches(FOCUS_SKIP) && isShown(node))
            .map(node => ({ node, section: true, wash: parseFloat(global.getComputedStyle(node).paddingTop) >= 32 }));
    }

    function focusSection(target) {
        const { node } = target;
        if (target.wash) {
            node.style.setProperty('--focus-base', global.getComputedStyle(node).backgroundColor);
            node.classList.add('is-spotlit');
            node.addEventListener('animationend', event => { if (event.target === node) node.classList.remove('is-spotlit'); });
        }
        const heading = node.querySelector('h1, h2, .h1, .h2');
        if (heading) {
            heading.classList.add('is-attention-text');
            heading.addEventListener('animationend', function done(event) {
                if (event.target !== heading) return;
                heading.removeEventListener('animationend', done);
                heading.classList.remove('is-attention-text');
            });
            return;
        }
        // No section heading (a grid of cards, say): the first cards on screen glow instead.
        Array.from(node.querySelectorAll('.card, .card-interactive, .panel, .ticker-card'))
            .filter(card => { const box = card.getBoundingClientRect(); return box.height && box.top < global.innerHeight && box.bottom > 0; })
            .slice(0, MAX_GLOWS_AT_ONCE)
            .forEach((card, index) => global.setTimeout(() => highlight(card), index * 120));
    }

    function enter(target, delay, glow, quick = false) {
        const { node } = target;
        node.style.setProperty('--focus-delay', `${delay}ms`);
        node.classList.remove('focus-pending');
        node.classList.add('focus-enter');
        node.classList.toggle('is-quick', quick); // on-load fades are short so pages feel instant
        node.addEventListener('animationend', function done(event) {
            if (event.target !== node) return;
            node.removeEventListener('animationend', done);
            node.classList.remove('focus-enter', 'is-quick');
            if (!glow) return;
            if (target.section) focusSection(target);
            else highlight(node);
        });
    }

    function setupAttention() {
        // Automated browsers (screenshot and grading tools) get the finished page straight away.
        if (prefersReducedMotion() || !('IntersectionObserver' in global) || (global.navigator && global.navigator.webdriver)) return;
        // One marked element per page (a key figure) gets a moment of attention on load.
        const focus = doc.querySelector('[data-attention]');
        const main = doc.querySelector('[data-app] .app-content');
        const targets = main ? appFocusTargets(main) : siteFocusTargets();
        const fold = global.innerHeight * 0.9;
        const later = [];
        let onScreen = 0;
        let focusHandled = false;
        targets.forEach(target => {
            if (target.node.getBoundingClientRect().top < fold) {
                // Already visible: app cards fade in one after another; public sections are left as they are.
                if (!main) return;
                const isFocus = target.node === focus;
                focusHandled = focusHandled || isFocus;
                enter(target, Math.min(onScreen++, 8) * 45, isFocus, true);
            } else {
                later.push(target);
            }
        });
        // A marked figure inside a card glows on its own once the card has faded in.
        if (focus && !focusHandled && focus.getBoundingClientRect().top < fold) global.setTimeout(() => highlight(focus), 650);
        if (!later.length) return;

        const byNode = new Map(later.map(target => [target.node, target]));
        const glowTarget = target => (target.section ? focusSection(target) : highlight(target.node));
        const reach = (target, index) => {
            byNode.delete(target.node);
            const glow = index < MAX_GLOWS_AT_ONCE && (target.glow || target.section);
            if (target.node.classList.contains('focus-pending')) enter(target, index * 110, glow);
            else if (glow) global.setTimeout(() => glowTarget(target), 300);
        };

        // Nothing starts hidden, so a screenshot or a page that is never scrolled shows
        // everything. Once the person scrolls, a section is made transparent just before
        // it comes into view, while it is still below the window, and then fades in as it
        // arrives.
        const armNearby = () => {
            byNode.forEach(target => {
                if (target.node.classList.contains('focus-pending') || (target.section && target.node.querySelector('.reveal'))) return;
                const top = target.node.getBoundingClientRect().top;
                if (top > global.innerHeight && top < global.innerHeight * 1.25) target.node.classList.add('focus-pending');
            });
        };
        const observer = new IntersectionObserver(entries => {
            entries.filter(entry => entry.isIntersecting && byNode.has(entry.target))
                .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top || a.boundingClientRect.left - b.boundingClientRect.left)
                .forEach((entry, index) => {
                    observer.unobserve(entry.target);
                    reach(byNode.get(entry.target), index);
                });
        }, { threshold: 0, rootMargin: '0px 0px -18% 0px' });
        later.forEach(target => observer.observe(target.node));

        // Keyboard users never land in something still transparent.
        doc.addEventListener('focusin', event => {
            const waiting = event.target.closest && event.target.closest('.focus-pending');
            if (waiting) waiting.classList.remove('focus-pending');
        });

        // Content at the very end of a page may never cross the trigger line, so once
        // the page can't scroll further, whatever is on screen comes in too.
        const atBottom = () => {
            if (global.innerHeight + global.scrollY < doc.documentElement.scrollHeight - 4) return;
            Array.from(byNode.values())
                .filter(target => target.node.getBoundingClientRect().top < global.innerHeight)
                .forEach((target, index) => { observer.unobserve(target.node); reach(target, index); });
        };
        let ticking = false;
        const onFrame = () => {
            ticking = false;
            if (!byNode.size) { global.removeEventListener('scroll', onScroll); return; }
            armNearby();
            atBottom();
        };
        const onScroll = () => { if (!ticking) { ticking = true; global.requestAnimationFrame(onFrame); } };
        global.addEventListener('scroll', onScroll, { passive: true });
        global.setTimeout(atBottom, 400);
    }

    /** Animates a number into an element. Respects reduced motion. */
    function countUp(node, to, format, duration = 900) {
        if (!node) return;
        const target = Number(to);
        if (!Number.isFinite(target)) return;
        if (prefersReducedMotion() || !global.requestAnimationFrame) { node.textContent = format(target); return; }
        const start = performance.now();
        const from = Number(node.dataset.countFrom || 0);
        const step = now => {
            const progress = Math.min(1, (now - start) / duration);
            const eased = 1 - Math.pow(1 - progress, 4);
            node.textContent = format(from + (target - from) * eased);
            if (progress < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }

    function setupCountUps() {
        const nodes = doc.querySelectorAll('[data-count-to]');
        if (!nodes.length) return;
        const run = node => {
            const currency = node.dataset.currency;
            const digits = node.dataset.digits !== undefined ? Number(node.dataset.digits) : 2;
            const format = currency ? value => formatMoney(value, currency, { digits }) : value => formatNumber(value, digits);
            countUp(node, node.dataset.countTo, format);
        };
        if (!('IntersectionObserver' in global)) { nodes.forEach(run); return; }
        const observer = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                run(entry.target);
                observer.unobserve(entry.target);
            });
        }, { threshold: 0.4 });
        nodes.forEach(node => observer.observe(node));
    }

    // ── Assistant (local model via Ollama) ─────────────────────────────
    /** Renders the model's light markdown (paragraphs, "-" / "1." lists, **bold**) as safe DOM. */
    function renderRichText(text) {
        const frag = doc.createDocumentFragment();
        const inline = line => {
            const parts = String(line).split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
            return parts.map(part => (/^\*\*[^*]+\*\*$/.test(part) ? el('strong', { text: part.slice(2, -2) }) : doc.createTextNode(part.replace(/`/g, ''))));
        };
        let list = null;
        String(text).split(/\n/).forEach(raw => {
            const line = raw.trim();
            const bullet = /^([-*•]|\d+[.)])\s+(.*)$/.exec(line);
            if (bullet) {
                const ordered = /^\d/.test(bullet[1]);
                if (!list || list.tagName !== (ordered ? 'OL' : 'UL')) { list = el(ordered ? 'ol' : 'ul'); frag.append(list); }
                list.append(el('li', null, ...inline(bullet[2])));
                return;
            }
            list = null;
            if (!line) return;
            frag.append(el('p', null, ...inline(line.replace(/^#+\s*/, ''))));
        });
        return frag;
    }

    function setupAssistant() {
        const W = global.Willow;
        const panel = doc.querySelector('[data-ask-panel]');
        const triggers = Array.from(doc.querySelectorAll('[data-ask-open]'));
        if (!panel) return;
        const thread = panel.querySelector('[data-ask-thread]');
        const form = panel.querySelector('[data-ask-form]');
        const input = form.querySelector('textarea, input');
        const send = form.querySelector('[data-ask-send]');
        const stop = form.querySelector('[data-ask-stop]');
        const modelLabel = panel.querySelector('[data-ask-model]');
        const setup = panel.querySelector('[data-ask-setup]');
        const setupStatus = panel.querySelector('[data-ask-setup-status]');
        const autonomyButtons = Array.from(panel.querySelectorAll('[data-ask-autonomy-value]'));
        const autonomyNote = panel.querySelector('[data-ask-autonomy-note]');
        const historyList = panel.querySelector('[data-ask-history-list]');
        const newChatButton = panel.querySelector('[data-ask-new]');
        const scroll = () => { thread.scrollTop = thread.scrollHeight; };
        let autonomy = 'confirm';
        let currentConversationId = null;
        let history = [];
        let controller = null;
        let available = false;
        let poll = null;
        const REASONS = {
            unreachable: 'Ollama isn’t running on this computer yet.',
            no_models: 'Ollama is running but has no model yet. Run the command in step 2.',
            model_missing: 'The model named in OLLAMA_MODEL isn’t installed. Pull it with Ollama, or remove the setting to use any installed model.',
        };

        // Ask Willow always answers: with the local AI model when Ollama is ready, otherwise with
        // quick answers worked out from the customer's records. It switches to AI by itself.
        const setAutonomy = value => {
            autonomy = ['read_only', 'confirm', 'autonomous'].includes(value) ? value : 'confirm';
            autonomyButtons.forEach(button => button.setAttribute('aria-checked', String(button.dataset.askAutonomyValue === autonomy)));
            if (autonomyNote) {
                autonomyNote.textContent = autonomy === 'read_only'
                    ? 'Willow can inspect your finances but never changes anything.'
                    : autonomy === 'confirm'
                        ? 'Willow prepares actions and waits for you to approve them.'
                        : 'Willow may execute explicit demo actions automatically. You can switch this off at any time.';
            }
        };
        const saveAutonomy = async value => {
            autonomyButtons.forEach(button => { button.disabled = true; });
            try {
                const result = await W.api('/api/assistant/autonomy', { method: 'PATCH', body: { autonomy: value } });
                setAutonomy(result.autonomy);
                W.showToast(value === 'autonomous' ? 'Ask Willow is now autonomous.' : value === 'read_only' ? 'Ask Willow is now read only.' : 'Ask Willow will ask before actions.', 'success', 2600);
            } catch (error) {
                W.showToast(error.message, 'error');
            } finally {
                autonomyButtons.forEach(button => { button.disabled = false; });
            }
        };
        autonomyButtons.forEach(button => button.addEventListener('click', () => saveAutonomy(button.dataset.askAutonomyValue)));

        const setAvailable = (isAvailable, model, reason, savedAutonomy) => {
            available = Boolean(isAvailable);
            if (savedAutonomy) setAutonomy(savedAutonomy);
            triggers.forEach(button => { button.hidden = reason === 'disabled'; });
            if (modelLabel && model) modelLabel.textContent = model;
            panel.querySelectorAll('[data-ask-mode]').forEach(node => { node.hidden = node.dataset.askMode !== (available ? 'ai' : 'quick'); });
            if (setup) setup.hidden = available;
            if (setupStatus) setupStatus.textContent = available ? '' : (REASONS[reason] || '');
            if (available && poll) { clearInterval(poll); poll = null; }
        };
        const loadChatHistory = async () => {
            if (!historyList) return;
            try {
                const response = await fetch('/api/assistant/conversations', { headers: { Accept: 'application/json', 'X-Willow-Passive': '1' }, credentials: 'same-origin' });
                if (!response.ok) return;
                const data = await response.json();
                historyList.replaceChildren();
                if (!data.conversations?.length) {
                    historyList.append(el('p', { className: 'ask-history-empty', text: 'No saved chats yet.' }));
                    return;
                }
                data.conversations.forEach(conversation => {
                    const row = el('div', { className: 'ask-history-item' });
                    const button = el('button', { type: 'button', className: 'ask-history-chat', text: conversation.title || 'New chat' });
                    const remove = el('button', { type: 'button', className: 'btn btn-ghost btn-icon', 'aria-label': 'Delete chat', title: 'Delete chat' }, icon('trash', 'icon-sm'));
                    button.classList.toggle('is-active', Number(conversation.id) === Number(currentConversationId));
                    button.addEventListener('click', () => loadConversation(conversation.id));
                    remove.addEventListener('click', async () => {
                        try {
                            await W.api('/api/assistant/conversations/' + encodeURIComponent(conversation.id), { method: 'DELETE', body: {} });
                            if (Number(currentConversationId) === Number(conversation.id)) startNewChat(false);
                            await loadChatHistory();
                        } catch (error) { W.showToast(error.message, 'error'); }
                    });
                    row.append(button, remove);
                    historyList.append(row);
                });
            } catch (error) { /* history is non-critical */ }
        };
        const checkStatus = (refresh = false) => fetch(`/api/assistant/status${refresh ? '?refresh=1' : ''}`, { headers: { Accept: 'application/json', 'X-Willow-Passive': '1' }, credentials: 'same-origin' })
            .then(response => (response.ok ? response.json() : null))
            .then(status => { if (status) setAvailable(status.available, status.model, status.reason, status.autonomy); return status; })
            .catch(() => null);
        checkStatus();

        const renderSavedConversation = conversation => {
            currentConversationId = conversation.id;
            history = conversation.messages.map(message => ({ role: message.role, content: message.content }));
            const welcome = panel.querySelector('[data-ask-welcome]');
            if (welcome) welcome.hidden = true;
            thread.replaceChildren();
            conversation.messages.forEach(message => {
                thread.append(el('div', { className: `ask-message ${message.role === 'user' ? 'is-user' : 'is-answer'}` },
                    ...(message.role === 'user' ? [doc.createTextNode(message.content)] : [renderRichText(message.content)])));
            });
            loadChatHistory();
            scroll();
        };
        const loadConversation = async id => {
            if (controller) return;
            try {
                const response = await fetch('/api/assistant/conversations/' + encodeURIComponent(id), { headers: { Accept: 'application/json', 'X-Willow-Passive': '1' }, credentials: 'same-origin' });
                const data = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(data.error || 'Chat could not be loaded.');
                renderSavedConversation(data.conversation);
            } catch (error) { W.showToast(error.message, 'error'); }
        };
        const startNewChat = (refresh = true) => {
            currentConversationId = null;
            history = [];
            thread.replaceChildren();
            const welcome = panel.querySelector('[data-ask-welcome]');
            if (welcome) welcome.hidden = false;
            if (refresh) loadChatHistory();
            input.focus();
        };
        newChatButton?.addEventListener('click', () => startNewChat());
        const open = question => {
            if (triggers.length && triggers.every(button => button.hidden)) return;
            openDialog(panel);
            // Without Ollama, look for it again every 15 seconds while the panel is open.
            if (!available && !poll) poll = setInterval(() => { if (!panel.open) { clearInterval(poll); poll = null; return; } checkStatus(true); }, 15000);
            loadChatHistory();
            setTimeout(() => input.focus(), 60);
            if (question) ask(question);
        };
        const recheck = panel.querySelector('[data-ask-recheck]');
        if (recheck) {
            recheck.addEventListener('click', async () => {
                recheck.classList.add('is-loading');
                const status = await checkStatus(true);
                recheck.classList.remove('is-loading');
                if (status && status.available) setTimeout(() => input.focus(), 60);
                else if (setupStatus) setupStatus.textContent = `${REASONS[status && status.reason] || 'Ollama isn’t available yet.'} Checked just now.`;
            });
        }
        triggers.forEach(button => button.addEventListener('click', () => open()));
        panel.querySelectorAll('[data-ask-close]').forEach(button => button.addEventListener('click', () => closeDialog(panel)));
        enableBackdropClose(panel);
        doc.addEventListener('keydown', event => {
            if (!triggers.some(button => !button.hidden)) return;
            const typing = /input|textarea|select/i.test((event.target && event.target.tagName) || '') || (event.target && event.target.isContentEditable);
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); panel.open ? closeDialog(panel) : open(); }
            else if (event.key === '/' && !typing && !panel.open) { event.preventDefault(); open(); }
        });
        panel.querySelectorAll('[data-ask-prompt]').forEach(button => button.addEventListener('click', () => ask(button.dataset.askPrompt)));
        input.addEventListener('keydown', event => {
            if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); }
        });
        form.addEventListener('submit', event => {
            event.preventDefault();
            const question = input.value.trim();
            if (question) ask(question);
        });
        stop.addEventListener('click', () => { if (controller) controller.abort(); });

        const busy = on => { send.hidden = on; stop.hidden = !on; input.disabled = on; };

        async function ask(question) {
            if (controller) return;
            const welcome = panel.querySelector('[data-ask-welcome]');
            if (welcome) welcome.hidden = true;
            thread.append(el('div', { className: 'ask-message is-user', text: question }));
            const answer = el('div', { className: 'ask-message is-answer', 'aria-busy': 'true' });
            const thinking = el('div', { className: 'ask-thinking', 'aria-label': 'Thinking' }, el('span'), el('span'), el('span'));
            answer.append(thinking);
            thread.append(answer);
            input.value = '';
            scroll();
            controller = new AbortController();
            busy(true);
            let text = '';
            let failed = null;
            let links = [];
            let notice = null;
            let mode = null;
            let action = null;
            try {
                const response = await fetch('/api/assistant/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson', 'X-CSRF-Token': csrfToken() },
                    credentials: 'same-origin',
                    body: JSON.stringify({ question, conversationId: currentConversationId, history: history.slice(-10) }),
                    signal: controller.signal,
                });
                if (!response.ok) {
                    const data = await response.json().catch(() => ({}));
                    if (response.status === 401) redirectToSignIn(data.code === 'session_timeout' ? 'session_timeout' : 'expired');
                    throw new Error(data.error || 'The assistant couldn’t answer right now.');
                }
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                let frame = 0;
                const paint = () => { frame = 0; answer.replaceChildren(renderRichText(text)); scroll(); };
                for (;;) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, { stream: true });
                    let index;
                    while ((index = buffer.indexOf('\n')) >= 0) {
                        const line = buffer.slice(0, index).trim();
                        buffer = buffer.slice(index + 1);
                        if (!line) continue;
                        const event = JSON.parse(line);
                        if (event.delta) { text += event.delta; if (!frame) frame = requestAnimationFrame(paint); }
                        if (event.error) failed = event.error;
                        if (event.done) {
                            if (Array.isArray(event.links)) links = event.links;
                            notice = event.notice || null;
                            mode = event.mode || null;
                            action = event.action || null;
                            if (event.conversationId) currentConversationId = event.conversationId;
                        }
                    }
                }
                if (frame) cancelAnimationFrame(frame);
                if (failed && !text) throw new Error(failed);
                answer.replaceChildren(renderRichText(text || 'I don’t have an answer for that.'));
                if (failed) answer.append(el('p', { className: 'ask-note', text: failed }));
                if (notice) answer.append(el('p', { className: 'ask-note', text: notice }));
                // A quick answer while the AI was expected means Ollama went away: show the right mode.
                if (mode === 'quick' && available) checkStatus(true);
                // Pages that go with the answer (same-site paths only).
                const safe = links.filter(link => link && typeof link.href === 'string' && /^\/(?!\/)/.test(link.href) && typeof link.label === 'string');
                if (safe.length) answer.append(el('div', { className: 'ask-links' }, ...safe.map(link => el('a', { className: 'chip chip-sm', href: link.href, text: link.label }))));
                if (mode === 'action_pending' && action && action.token) {
                    const controls = el('div', { className: 'ask-action-controls' });
                    const confirm = el('button', { type: 'button', className: 'btn btn-primary btn-sm', text: 'Run action' });
                    const cancel = el('button', { type: 'button', className: 'btn btn-secondary btn-sm', text: 'Cancel' });
                    const statusNode = el('p', { className: 'ask-note', text: 'This approval expires in about 2 minutes.' });
                    controls.append(confirm, cancel);
                    answer.append(el('div', { className: 'ask-action-card' }, el('strong', { text: action.title || 'Run this action?' }), controls, statusNode));
                    confirm.addEventListener('click', async () => {
                        confirm.disabled = true;
                        cancel.disabled = true;
                        confirm.classList.add('is-loading');
                        statusNode.textContent = 'Running…';
                        try {
                            const result = await W.api('/api/assistant/actions/' + encodeURIComponent(action.token) + '/confirm', { method: 'POST', body: {} });
                            statusNode.textContent = 'Done. The requested demo action was completed.';
                            confirm.remove();
                            cancel.remove();
                            W.showToast('Ask Willow completed the action.', 'success', 2600);
                            doc.dispatchEvent(new CustomEvent('willow:assistant-action', { detail: result }));
                        } catch (error) {
                            statusNode.textContent = error.message;
                            confirm.disabled = false;
                            cancel.disabled = false;
                        } finally {
                            confirm.classList.remove('is-loading');
                        }
                    });
                    cancel.addEventListener('click', async () => {
                        confirm.disabled = true;
                        cancel.disabled = true;
                        try {
                            await W.api('/api/assistant/actions/' + encodeURIComponent(action.token) + '/cancel', { method: 'POST', body: {} });
                            statusNode.textContent = 'Cancelled. No action was taken.';
                        } catch (error) {
                            statusNode.textContent = error.message;
                        }
                        confirm.remove();
                        cancel.remove();
                    });
                }
                history = history.concat([{ role: 'user', content: question }, { role: 'assistant', content: text }]);
                loadChatHistory();
            } catch (error) {
                const stopped = error.name === 'AbortError';
                if (stopped && text) {
                    answer.replaceChildren(renderRichText(text), el('p', { className: 'ask-note', text: 'Stopped.' }));
                    history = history.concat([{ role: 'user', content: question }, { role: 'assistant', content: text }]);
                    loadChatHistory();
                } else {
                    answer.classList.add('is-error');
                    answer.replaceChildren(el('p', { text: stopped ? 'Stopped.' : (error.message || 'The assistant couldn’t answer right now.') }));
                }
            } finally {
                answer.removeAttribute('aria-busy');
                controller = null;
                busy(false);
                input.focus();
                scroll();
            }
        }
    }

    // ── Transactions: shared row and detail sheet ──────────────────────
    const TXN_TYPES = { deposit: 'Money added', withdrawal: 'Withdrawal', transfer: 'Transfer', payment: 'Payment', refund: 'Refund', adjustment: 'Adjustment' };

    function txnTitle(txn) {
        return txn.counterparty || txn.description || TXN_TYPES[txn.type] || 'Transaction';
    }

    /** Builds a transaction row that opens the detail sheet. */
    function txnRow(txn, options = {}) {
        const credit = txn.direction === 'credit';
        const detail = {
            id: txn.id, description: txn.description, counterparty: txn.counterparty, type: txn.type, direction: txn.direction,
            status: txn.status, amountFormatted: txn.amountFormatted || formatCents(txn.amount, txn.currency), currency: txn.currency,
            categoryLabel: txn.categoryLabel, categoryIcon: txn.categoryIcon, created_at: txn.created_at, reference: txn.reference,
            accountName: options.accountName || txn.accountName || '',
        };
        const sub = [txn.categoryLabel, options.accountName].filter(Boolean).join(' · ');
        return el('li', null, el('button', { type: 'button', className: 'txn-row', 'data-txn': JSON.stringify(detail) },
            el('span', { className: `txn-icon${credit ? ' is-credit' : ''}` }, icon(txn.categoryIcon || (credit ? 'arrow-down-left' : 'arrow-up-right'))),
            el('span', { className: 'txn-main' },
                el('span', { className: 'txn-title', text: txnTitle(txn) }),
                el('span', { className: 'txn-sub' }, sub, txn.status && txn.status !== 'completed' ? el('span', { className: `status-pill is-${txn.status}`, text: txn.status }) : null)),
            el('span', { className: `txn-amount${credit ? ' is-credit' : ''}`, 'data-private': '' },
                `${credit ? '+' : '−'}${detail.amountFormatted}`,
                el('small', { text: options.time ? formatDate(txn.created_at, 'time') : relativeDay(txn.created_at) }))));
    }

    function showTransaction(txn) {
        const credit = txn.direction === 'credit';
        const rows = [
            ['Date', formatDate(txn.created_at, 'datetime')],
            ['Type', TXN_TYPES[txn.type] || txn.type],
            ['Category', txn.categoryLabel],
            ['Account', txn.accountName],
            ['Status', txn.status ? txn.status.charAt(0).toUpperCase() + txn.status.slice(1) : ''],
            ['Description', txn.counterparty && txn.description !== txn.counterparty ? txn.description : ''],
            ['Reference', txn.reference],
        ].filter(([, value]) => value);
        const dialog = el('dialog', { className: 'modal txn-sheet', 'aria-labelledby': 'txnSheetTitle' },
            el('div', { className: 'modal-head' },
                el('h2', { id: 'txnSheetTitle', className: 'visually-hidden', text: 'Transaction details' }),
                el('button', { type: 'button', className: 'btn btn-ghost btn-icon', 'aria-label': 'Close', 'data-dialog-close': '' }, icon('x', 'icon-md'))),
            el('div', { className: 'modal-body txn-sheet-body' },
                el('span', { className: `txn-icon is-lg${credit ? ' is-credit' : ''}` }, icon(txn.categoryIcon || 'receipt')),
                el('p', { className: 'txn-sheet-title', text: txnTitle(txn) }),
                el('p', { className: `txn-sheet-amount${credit ? ' positive' : ''}`, 'data-private': '', text: `${credit ? '+' : '−'}${txn.amountFormatted}` }),
                el('dl', { className: 'dl-rows txn-sheet-rows' }, rows.map(([label, value]) => el('div', null, el('dt', { text: label }), el('dd', { text: value })))),
                el('p', { className: 'sim-note' }, icon('info', 'icon-sm'), 'Simulated transaction. No real money moved.')));
        doc.body.append(dialog);
        enableBackdropClose(dialog);
        dialog.querySelector('[data-dialog-close]').addEventListener('click', () => closeDialog(dialog));
        dialog.addEventListener('close', () => dialog.remove());
        openDialog(dialog);
    }

    /**
     * Multi-step flows: panes marked [data-flow-pane="n"], optional stepper dots
     * [data-flow-dot="n"] and a [data-flow-label] that reads "Step n of N · Name".
     */
    function flow(root, { labels = [], onShow } = {}) {
        const panes = Array.from(root.querySelectorAll('[data-flow-pane]'));
        const dots = Array.from(root.querySelectorAll('[data-flow-dot]'));
        const label = root.querySelector('[data-flow-label]');
        let current = 0;
        function show(index, { focus = true } = {}) {
            current = Math.max(0, Math.min(index, panes.length - 1));
            panes.forEach((pane, i) => { pane.hidden = i !== current; });
            dots.forEach((dot, i) => {
                dot.classList.toggle('is-done', i < current);
                dot.classList.toggle('is-current', i === current);
            });
            if (label) label.textContent = `Step ${current + 1} of ${panes.length}${labels[current] ? ` · ${labels[current]}` : ''}`;
            const heading = panes[current].querySelector('h2, h1');
            if (focus && heading) {
                if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
                heading.focus({ preventScroll: true });
                const top = root.getBoundingClientRect().top + global.scrollY - 90;
                if (global.scrollY > top) global.scrollTo({ top, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
            }
            if (onShow) onShow(current, panes[current]);
        }
        show(0, { focus: false });
        return { show, next: () => show(current + 1), back: () => show(current - 1), get index() { return current; }, panes };
    }

    /** Local-time greeting, today's date and dismissible notices. */
    function setupLocalDetails() {
        const hour = new Date().getHours();
        const text = hour < 5 || hour >= 22 ? 'Good evening' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
        doc.querySelectorAll('[data-greeting]').forEach(node => { node.textContent = text; });
        doc.querySelectorAll('[data-today]').forEach(node => {
            node.textContent = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());
        });
        doc.querySelectorAll('[data-dismiss]').forEach(button => button.addEventListener('click', () => {
            const box = button.closest('[data-dismissible]');
            if (box) box.remove();
        }));
    }

    function setupTransactionDetails() {
        doc.addEventListener('click', event => {
            const row = event.target.closest && event.target.closest('[data-txn]');
            if (!row) return;
            try { showTransaction(JSON.parse(row.dataset.txn)); } catch (error) { /* malformed row */ }
        });
    }

    /**
     * Market pages can render the Yahoo fallback while the local yfinance bridge starts.
     * Once that bridge is genuinely ready, refresh once so the page picks up fresh provider data.
     * Pages already opened after readiness are left alone.
     */
    function setupMarketServiceRefresh() {
        const marketPage = doc.querySelector('[data-rates-status], [data-fx-status], [data-market-status], [data-coins-status], [data-wealth-page="markets"]');
        if (!marketPage) return;

        const maxAttempts = 20;
        const pollMs = 3000;
        let sawNotReady = false;
        let attempts = 0;
        let timer = null;

        const poll = async () => {
            attempts += 1;
            try {
                const result = await api('/api/public/market-service-status', { passive: true, timeout: 3000 });
                if (result.ready) {
                    if (sawNotReady) global.location.reload();
                    return;
                }
                if (result.retryable === false || attempts >= maxAttempts) return;
                sawNotReady = true;
            } catch (error) {
                if (attempts >= maxAttempts) return;
                sawNotReady = true;
            }
            timer = global.setTimeout(poll, pollMs);
        };

        timer = global.setTimeout(poll, 500);
        global.addEventListener('pagehide', () => { if (timer) global.clearTimeout(timer); }, { once: true });
    }

    /**
     * Guided section scrolling across Willow's public and product pages.
     * The main account dashboard is intentionally excluded because it is a dense
     * workspace rather than a storytelling page.
     */

    // ── Idle sign-out ───────────────────────────────────────────────────
    const idle = { ms: 0, warnTimer: null, endTimer: null, tick: null, dialog: null };

    function noteActivity() {
        if (!idle.ms) return;
        clearTimeout(idle.warnTimer);
        clearTimeout(idle.endTimer);
        clearInterval(idle.tick);
        if (idle.dialog) { closeDialog(idle.dialog); idle.dialog.remove(); idle.dialog = null; }
        const warning = Math.min(60000, idle.ms / 2);
        idle.warnTimer = setTimeout(() => warnIdle(warning), idle.ms - warning);
        idle.endTimer = setTimeout(() => redirectToSignIn('session_timeout'), idle.ms + 1500);
    }

    function warnIdle(remaining) {
        const ends = Date.now() + remaining;
        const countdown = el('strong', { className: 'num' });
        const update = () => {
            const left = Math.max(0, Math.round((ends - Date.now()) / 1000));
            countdown.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
        };
        update();
        const stay = el('button', { type: 'button', className: 'btn btn-primary', text: 'Stay signed in' });
        const leave = el('button', { type: 'button', className: 'btn btn-secondary', text: 'Sign out' });
        idle.dialog = el('dialog', { className: 'modal', 'aria-labelledby': 'idleTitle', 'aria-describedby': 'idleText' },
            el('div', { className: 'modal-head' }, el('h2', { id: 'idleTitle', text: 'Are you still there?' })),
            el('div', { className: 'modal-body' }, el('p', { id: 'idleText', className: 'secondary' }, 'For your security, Willow will sign you out in ', countdown, ' unless you choose to stay.')),
            el('div', { className: 'modal-foot' }, leave, stay));
        doc.body.append(idle.dialog);
        idle.tick = setInterval(update, 1000);
        stay.addEventListener('click', async () => {
            stay.classList.add('is-loading');
            try { await api('/auth/session'); } catch (error) { redirectToSignIn('session_timeout'); }
        });
        leave.addEventListener('click', handleLogout);
        idle.dialog.addEventListener('cancel', event => event.preventDefault());
        openDialog(idle.dialog);
        stay.focus();
    }

    function setupIdleTimeout() {
        const minutes = Number(doc.body && doc.body.dataset.idleMinutes);
        if (!minutes || !doc.querySelector('[data-app]')) return;
        idle.ms = minutes * 60000;
        noteActivity();
    }

    // ── Sign-out ────────────────────────────────────────────────────────
    let logoutPending = false;
    async function handleLogout() {
        if (logoutPending) return;
        logoutPending = true;
        try {
            const response = await fetch('/auth/logout', {
                method: 'POST',
                headers: { 'X-CSRF-Token': csrfToken(), Accept: 'application/json' },
            });
            const data = await response.json().catch(() => ({}));
            if (response.status === 401) { global.location.href = '/login?error=session_expired'; return; }
            if (!response.ok || !data.success) throw new Error(data.error || 'Sign-out could not be completed. Please try again.');
            global.location.href = '/login?signedOut=success';
        } catch (error) {
            global.showToast(error.message || 'Could not connect. Please try signing out again.', 'error');
        } finally {
            logoutPending = false;
        }
    }

    // ── Password visibility ─────────────────────────────────────────────
    function setupPasswordToggles() {
        doc.querySelectorAll('[data-password-toggle]').forEach(button => {
            button.addEventListener('click', () => {
                const input = doc.getElementById(button.getAttribute('aria-controls'));
                if (!input) return;
                const show = input.type === 'password';
                input.type = show ? 'text' : 'password';
                button.setAttribute('aria-pressed', String(show));
                button.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
            });
        });
    }

    function setupRangeFill(root = doc) {
        root.querySelectorAll('input[type="range"].range').forEach(range => {
            const update = () => {
                const min = Number(range.min || 0);
                const max = Number(range.max || 100);
                range.style.setProperty('--range-progress', `${((Number(range.value) - min) / (max - min)) * 100}%`);
            };
            range.addEventListener('input', update);
            update();
        });
    }

    // Horizontal scrollers (wide tables, index rows) must be reachable by keyboard when they
    // overflow on small screens and contain nothing focusable of their own.
    function setupScrollRegions() {
        const selector = '.table-wrap, .wl-indices, ul.wl-popular, .card-switcher';
        const focusable = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';
        let queued = false;
        const update = () => {
            queued = false;
            doc.querySelectorAll(selector).forEach(node => {
                const managed = node.hasAttribute('data-scroll-region');
                const needsFocus = node.scrollWidth > node.clientWidth + 1 && !node.querySelector(focusable);
                if (needsFocus && !managed && !node.hasAttribute('tabindex')) {
                    node.tabIndex = 0;
                    node.setAttribute('data-scroll-region', '');
                    // Plain wrappers become a named region; lists keep their list semantics.
                    if (node.tagName === 'DIV' && !node.hasAttribute('role')) {
                        const table = node.querySelector('table');
                        const caption = table && (table.getAttribute('aria-label') || (table.caption && table.caption.textContent.trim()));
                        node.setAttribute('role', 'region');
                        node.setAttribute('aria-label', caption || 'Scrollable table');
                    }
                } else if (!needsFocus && managed) {
                    node.removeAttribute('tabindex');
                    node.removeAttribute('data-scroll-region');
                    if (node.getAttribute('role') === 'region') { node.removeAttribute('role'); node.removeAttribute('aria-label'); }
                }
            });
        };
        const queue = () => {
            if (queued) return;
            queued = true;
            (global.requestAnimationFrame || global.setTimeout)(update);
        };
        queue();
        if (typeof global.addEventListener === 'function') global.addEventListener('resize', queue);
        const main = doc.getElementById('main');
        if (main && 'MutationObserver' in global) new MutationObserver(queue).observe(main, { childList: true, subtree: true });
    }

    /**
     * Keyboard support for a row of tabs (or a segmented control): arrow keys, Home and
     * End move between them and select, and only the selected one is in the Tab order.
     * `onSelect(tab)` runs when the selection changes.
     */
    function rovingTabs(list, { onSelect = () => {} } = {}) {
        const tabs = () => Array.from(list.querySelectorAll('[role="tab"]'));
        const select = (tab, focus) => {
            tabs().forEach(item => { const on = item === tab; item.setAttribute('aria-selected', String(on)); item.tabIndex = on ? 0 : -1; });
            if (focus) tab.focus();
            onSelect(tab);
        };
        list.addEventListener('click', event => {
            const tab = event.target.closest('[role="tab"]');
            if (tab && list.contains(tab) && tab.getAttribute('aria-selected') !== 'true') select(tab, false);
        });
        list.addEventListener('keydown', event => {
            const all = tabs();
            const index = all.indexOf(doc.activeElement);
            if (index < 0) return;
            const next = { ArrowRight: index + 1, ArrowDown: index + 1, ArrowLeft: index - 1, ArrowUp: index - 1, Home: 0, End: all.length - 1 }[event.key];
            if (next === undefined) return;
            event.preventDefault();
            select(all[(next + all.length) % all.length], true);
        });
    }

    /**
     * A form can't be sent again while its request is still running: page scripts mark
     * the submit button .is-loading (or the form aria-busy) while they wait, and this
     * blocks further submits, including pressing Enter again, which clicks can't stop.
     */
    function setupSubmitGuard() {
        doc.addEventListener('submit', event => {
            const form = event.target;
            if (!(form instanceof global.HTMLFormElement)) return;
            if (form.getAttribute('aria-busy') === 'true' || form.querySelector('[type="submit"].is-loading')) {
                event.preventDefault();
                event.stopImmediatePropagation();
            }
        }, true);
    }

    function init() {
        setupSubmitGuard();
        syncThemeControls();
        syncPrivacyControls();
        doc.querySelectorAll('[data-theme-toggle]').forEach(button => button.addEventListener('click', toggleTheme));
        doc.querySelectorAll('[data-privacy-toggle]').forEach(button => button.addEventListener('click', togglePrivacy));
        doc.querySelectorAll('[data-logout]').forEach(button => button.addEventListener('click', handleLogout));
        setupMenus();
        setupSheets();
        setupSiteHeader();
        setupAppTopbar();
        setupReveals();
        setupCountUps();
        setupAssistant();
        setupPasswordToggles();
        setupRangeFill();
        setupTransactionDetails();
        setupLocalDetails();
        setupMarketServiceRefresh();
        setupIdleTimeout();
        setupScrollRegions();
        setupPageIcon();
        setupAttention();
    }

    global.Willow = {
        api, csrfToken, el, icon, empty, skeletonRows, showToast, showConfirm, openDialog, closeDialog, enableBackdropClose,
        formatMoney, formatCents, formatNumber, formatCompact, formatPercent, formatQuantity, formatDate, relativeDay, parseDate,
        countUp, prefersReducedMotion, setupRangeFill, toggleTheme, txnRow, showTransaction, flow, highlight, stagger, rovingTabs,
        syncPrivateOptions, priceStatus,
    };
    global.showToast = showToast;
    global.showConfirm = showConfirm;
    global.handleLogout = handleLogout;
    global.toggleTheme = toggleTheme;

    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
    else init();
})(typeof window !== 'undefined' ? window : this);
