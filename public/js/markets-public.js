/* Willow public markets page. */
'use strict';

(function (global) {
    const doc = global.document;

    async function init() {
        const { api, el, icon, formatNumber, formatPercent } = global.Willow;
        const { quoteRow, unavailableNotice, delta } = global.WillowPublicMarkets;
        const status = doc.querySelector('[data-markets-status]');
        const grid = doc.querySelector('[data-index-grid]');
        const globalStrip = doc.querySelector('[data-global-strip]');
        const popular = doc.querySelector('[data-popular-list]');
        const crypto = doc.querySelector('[data-crypto-list]');
        let data;
        try {
            data = await api('/api/public/markets');
            if (data.unavailable) throw new Error('unavailable');
        } catch (error) {
            status.replaceChildren(icon('alert'), ' Market data temporarily unavailable');
            grid.replaceChildren(el('div', { className: 'ticker-card', style: 'grid-column:1/-1' }, global.Willow.empty({ iconName: 'chart', title: 'Market data temporarily unavailable.', text: 'Quotes couldn’t be retrieved right now. Willow never displays estimated or made-up prices. Please try again shortly.', error: true, compact: true })));
            popular.replaceChildren(unavailableNotice());
            crypto.replaceChildren(unavailableNotice());
            return;
        }
        const fresh = global.Willow.priceStatus([...data.indices, ...data.popular]);
        status.replaceChildren(icon('clock'), fresh.kind === 'saved' ? ` ${fresh.text}` : fresh.kind === 'cached' ? ' Cached · delayed data' : ' Delayed data');
        grid.replaceChildren(...data.indices.map(quote => {
            const chart = el('div', { className: 'ticker-spark' });
            const card = el('article', { className: 'ticker-card' },
                el('div', { className: 'ticker-card-head' }, el('span', { className: 'ticker-card-name' }, quote.name, el('small', { text: quote.symbol.replace('^', '') })), delta(quote)),
                el('span', { className: 'ticker-card-price', text: quote.unavailable ? 'Unavailable' : formatNumber(quote.price, 2) }),
                chart);
            if (!quote.unavailable) {
                api(`/api/public/history/${encodeURIComponent(quote.symbol)}?range=1m`).then(history => {
                    global.WillowCharts.line(chart, history.points, { compact: true, height: 64, label: `${quote.name} past month` });
                }).catch(() => chart.replaceChildren(el('small', { className: 'muted', text: 'Chart unavailable' })));
            }
            return card;
        }));
        globalStrip.replaceChildren(...data.global.map(quote => el('div', { className: 'global-chip' },
            el('span', { text: quote.name }),
            el('strong', { className: 'num', text: quote.unavailable ? '—' : formatNumber(quote.price, 2) }),
            quote.unavailable ? el('span', { className: 'muted', text: 'Unavailable' }) : el('span', { className: `delta ${quote.changePercent >= 0 ? 'is-up' : 'is-down'}`, text: formatPercent(quote.changePercent) }))));
        const signedIn = Boolean(doc.querySelector('.site-header a[href="/dashboard"]'));
        popular.replaceChildren(...data.popular.map(quote => quoteRow(quote, signedIn ? { href: `/wealth/stocks/${encodeURIComponent(quote.symbol)}` } : {})));
        crypto.replaceChildren(...data.crypto.slice(0, 4).map(quote => quoteRow(quote, signedIn ? { href: `/crypto/${encodeURIComponent(quote.symbol)}` } : {})));
    }

    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
    else init();
})(window);
