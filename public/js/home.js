/* Willow homepage — cinematic hero, tabs, live market & FX panels. */
'use strict';

(function (global) {
    const doc = global.document;

    /**
     * Hero scene controller.
     * Autoplays slow crossfades, pauses on hover/focus/interaction and when the
     * page is hidden, and never autoplays when reduced motion is requested.
     */
    function setupHero(hero, options = {}) {
        if (!hero) return null;
        const win = options.window || global;
        const interval = options.interval || 7000;
        const scenes = Array.from(hero.querySelectorAll('[data-hero-scene]'));
        const captions = Array.from(hero.querySelectorAll('[data-hero-caption]'));
        const vignettes = Array.from(hero.querySelectorAll('[data-hero-vignette]'));
        const tabs = Array.from(hero.querySelectorAll('[data-hero-tab]'));
        const toggle = hero.querySelector('[data-hero-toggle]');
        const count = scenes.length;
        if (count < 2) return null;
        const reduced = Boolean(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches);
        const holds = new Set();
        let index = 0;
        let timer = null;
        let userPaused = false;

        hero.style.setProperty('--hero-interval', `${interval}ms`);

        const loadScene = i => {
            const scene = scenes[(i + count) % count];
            const img = scene && scene.querySelector('img[data-src]');
            if (!img) return;
            if (img.dataset.srcset) img.setAttribute('srcset', img.dataset.srcset);
            img.setAttribute('src', img.dataset.src);
            img.removeAttribute('data-src');
            img.removeAttribute('data-srcset');
        };

        const restartProgress = () => {
            hero.classList.remove('is-playing');
            if (timer) {
                void hero.offsetWidth;
                hero.classList.add('is-playing');
            }
        };

        const syncToggle = () => {
            if (!toggle) return;
            const playing = timer !== null;
            toggle.setAttribute('aria-pressed', String(!playing));
            toggle.setAttribute('aria-label', playing ? 'Pause scenes' : 'Play scenes');
            hero.classList.toggle('is-paused', !playing);
        };

        const show = next => {
            index = ((next % count) + count) % count;
            scenes.forEach((scene, i) => scene.classList.toggle('is-active', i === index));
            captions.forEach((caption, i) => {
                caption.classList.toggle('is-active', i === index);
                if (i === index) caption.removeAttribute('aria-hidden');
                else caption.setAttribute('aria-hidden', 'true');
            });
            vignettes.forEach((vignette, i) => vignette.classList.toggle('is-active', i === index));
            tabs.forEach((tab, i) => {
                tab.setAttribute('aria-selected', String(i === index));
                tab.tabIndex = i === index ? 0 : -1;
            });
            hero.dataset.activeScene = String(index);
            loadScene(index);
            loadScene(index + 1);
            restartProgress();
        };

        const stop = () => {
            if (timer !== null) win.clearInterval(timer);
            timer = null;
            hero.classList.remove('is-playing');
            syncToggle();
        };

        const start = () => {
            if (reduced || userPaused || holds.size || timer !== null) return;
            timer = win.setInterval(() => show(index + 1), interval);
            restartProgress();
            syncToggle();
        };

        const hold = reason => { holds.add(reason); stop(); };
        const release = reason => { holds.delete(reason); start(); };

        tabs.forEach((tab, i) => {
            tab.addEventListener('click', () => {
                userPaused = true;
                stop();
                show(i);
            });
            tab.addEventListener('keydown', event => {
                const keys = { ArrowRight: 1, ArrowLeft: -1 };
                let target = null;
                if (event.key in keys) target = index + keys[event.key];
                else if (event.key === 'Home') target = 0;
                else if (event.key === 'End') target = count - 1;
                if (target === null) return;
                event.preventDefault();
                userPaused = true;
                stop();
                show(target);
                tabs[index].focus();
            });
        });

        if (toggle) {
            if (reduced) {
                toggle.disabled = true;
                toggle.setAttribute('aria-label', 'Scenes are paused because reduced motion is on');
            }
            toggle.addEventListener('click', () => {
                if (timer !== null) {
                    userPaused = true;
                    stop();
                } else {
                    userPaused = false;
                    holds.clear();
                    show(index + 1);
                    start();
                }
            });
        }

        const copy = hero.querySelector('.hero-copy') || hero;
        copy.addEventListener('pointerenter', () => hold('hover'));
        copy.addEventListener('pointerleave', () => release('hover'));
        hero.addEventListener('focusin', event => { if (!event.target.closest('[data-hero-toggle], [data-hero-tab]')) hold('focus'); });
        hero.addEventListener('focusout', event => { if (!hero.contains(event.relatedTarget)) release('focus'); });
        if (doc && doc.addEventListener) {
            doc.addEventListener('visibilitychange', () => (doc.hidden ? hold('hidden') : release('hidden')));
        }
        if ('IntersectionObserver' in win) {
            const observer = new win.IntersectionObserver(entries => {
                entries.forEach(entry => (entry.isIntersecting ? release('offscreen') : hold('offscreen')));
            }, { threshold: 0.2 });
            observer.observe(hero);
        }

        show(0);
        if (reduced) {
            hero.classList.add('is-paused');
            syncToggle();
        } else {
            start();
        }

        return {
            show,
            next: () => show(index + 1),
            pause: () => { userPaused = true; stop(); },
            play: () => { userPaused = false; holds.clear(); start(); },
            get index() { return index; },
            get playing() { return timer !== null; },
            get reduced() { return reduced; },
        };
    }

    /** Accessible tabs: roving tabindex, arrow keys, aria-selected + panels. */
    function setupTabs(list, { tabSelector, panelFor, onChange } = {}) {
        if (!list) return;
        const tabs = Array.from(list.querySelectorAll(tabSelector));
        const select = (tab, focus) => {
            tabs.forEach(item => {
                const active = item === tab;
                item.setAttribute('aria-selected', String(active));
                item.tabIndex = active ? 0 : -1;
                const panel = panelFor(item);
                if (panel) panel.hidden = !active;
            });
            if (focus) tab.focus();
            if (onChange) onChange(tab);
        };
        tabs.forEach((tab, i) => {
            tab.tabIndex = tab.getAttribute('aria-selected') === 'true' ? 0 : -1;
            tab.addEventListener('click', () => select(tab));
            tab.addEventListener('keydown', event => {
                const delta = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
                if (delta) {
                    event.preventDefault();
                    select(tabs[(i + delta + tabs.length) % tabs.length], true);
                } else if (event.key === 'Home' || event.key === 'End') {
                    event.preventDefault();
                    select(event.key === 'Home' ? tabs[0] : tabs[tabs.length - 1], true);
                }
            });
        });
    }

    function lazyImages() {
        const images = Array.from(doc.querySelectorAll('img[data-lazy-image]'));
        const load = img => {
            img.addEventListener('load', () => img.classList.add('is-loaded'), { once: true });
            if (img.dataset.srcset) img.srcset = img.dataset.srcset;
            if (img.dataset.src) img.src = img.dataset.src;
        };
        if (!('IntersectionObserver' in global)) { images.forEach(load); return; }
        const observer = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                load(entry.target);
                observer.unobserve(entry.target);
            });
        }, { rootMargin: '400px 0px' });
        images.forEach(img => observer.observe(img));
    }

    async function loadMarketPanel() {
        const panel = doc.querySelector('[data-market-panel]');
        if (!panel || !global.Willow || !global.WillowPublicMarkets) return;
        const { api, el, icon, formatNumber } = global.Willow;
        const { quoteRow, delta, unavailableNotice } = global.WillowPublicMarkets;
        const indicesRoot = panel.querySelector('[data-market-indices]');
        const list = panel.querySelector('[data-market-list]');
        const status = panel.querySelector('[data-market-status]');
        try {
            const data = await api('/api/public/markets');
            if (data.unavailable) throw new Error('unavailable');
            indicesRoot.replaceChildren(...data.indices.map(quote => el('div', { className: 'market-index' },
                el('span', { text: quote.name }),
                el('strong', { text: quote.unavailable ? 'Unavailable' : formatNumber(quote.price, 2) }),
                delta(quote))));
            const rows = [...data.popular.slice(0, 5), ...data.crypto.slice(0, 1)];
            list.replaceChildren(...rows.map(quote => quoteRow(quote)));
            const stale = [...data.indices, ...rows].some(quote => quote.stale);
            status.replaceChildren(icon('clock'), stale ? ' Cached · delayed' : ' Delayed data');
        } catch (error) {
            indicesRoot.replaceChildren();
            list.replaceChildren(unavailableNotice());
            status.replaceChildren(icon('alert'), ' Unavailable');
        }
    }

    function setupDemoStart() {
        doc.querySelectorAll('[data-demo-start]').forEach(button => {
            button.addEventListener('click', async () => {
                const status = doc.querySelector('[data-demo-status]');
                button.classList.add('is-loading');
                button.disabled = true;
                if (status) status.textContent = 'Preparing a demo profile with sample activity…';
                try {
                    const result = await global.Willow.api('/auth/demo', { method: 'POST', body: {} , timeout: 45000 });
                    global.location.href = result.redirect || '/dashboard';
                } catch (error) {
                    if (status) status.textContent = error.message || 'The demo profile could not be created. Please try again.';
                    button.classList.remove('is-loading');
                    button.disabled = false;
                }
            });
        });
    }

    function init() {
        setupHero(doc.querySelector('[data-hero]'));
        setupTabs(doc.querySelector('.grow-tabs'), { tabSelector: '[data-grow-tab]', panelFor: tab => doc.getElementById(tab.getAttribute('aria-controls')) });
        setupTabs(doc.querySelector('.goal-picker'), { tabSelector: '[data-goal-option]', panelFor: tab => doc.getElementById(tab.getAttribute('aria-controls')) });
        lazyImages();
        loadMarketPanel();
        setupDemoStart();
    }

    global.WillowHome = { setupHero, setupTabs };
    if (doc && doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
    else if (doc) init();
})(typeof window !== 'undefined' ? window : this);
