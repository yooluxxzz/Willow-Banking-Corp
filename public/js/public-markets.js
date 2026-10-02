/* Willow public market data widgets — live quote lists and indicative FX boards. */
'use strict';

(function (global) {
    const doc = global.document;

    function assetMark(symbol, type) {
        const { el } = global.Willow;
        return el('span', { className: `asset-mark${type === 'crypto' ? ' is-round' : ''}`, text: String(symbol).replace('^', '').slice(0, 4) });
    }

    function delta(quote) {
        const { el, icon, formatPercent } = global.Willow;
        if (!quote || quote.unavailable || !Number.isFinite(quote.changePercent)) return el('span', { className: 'delta is-flat', text: '—' });
        const up = quote.changePercent >= 0;
        return el('span', { className: `delta ${up ? 'is-up' : 'is-down'}` }, icon(up ? 'arrow-up' : 'arrow-down'), formatPercent(quote.changePercent, { sign: false }));
    }

    function quoteRow(quote, options = {}) {
        const { el, formatMoney } = global.Willow;
        const tag = options.href ? 'a' : 'li';
        const row = el(tag, { className: 'market-row', href: options.href || null },
            assetMark(quote.symbol, quote.type),
            el('span', { className: 'market-row-main' }, el('strong', { text: quote.name }), el('small', { text: quote.symbol.replace('^', '') })),
            el('span', { className: 'market-row-end' }, el('strong', { text: quote.unavailable ? 'Unavailable' : formatMoney(quote.price, quote.currency || 'USD', { digits: quote.price < 1 ? 4 : 2 }) }), delta(quote)));
        if (tag === 'a') return el('li', {}, row);
        return row;
    }

    function unavailableNotice(text) {
        const { el, icon } = global.Willow;
        return el('li', { className: 'market-unavailable' }, icon('alert'), el('div', {},
            el('strong', { text: 'Market data temporarily unavailable.' }),
            el('span', { text: text || 'Quotes couldn’t be reached right now. Willow never shows made-up prices — please check back shortly.' })));
    }

    async function loadLiveLists(root = doc) {
        const cards = Array.from(root.querySelectorAll('[data-live-quotes]'));
        await Promise.all(cards.map(async card => {
            const { api, icon } = global.Willow;
            const list = card.querySelector('[data-live-list]');
            const status = card.querySelector('[data-live-status]');
            try {
                const data = await api(`/api/public/quotes?symbols=${encodeURIComponent(card.dataset.liveQuotes)}`);
                if (data.unavailable) throw new Error('unavailable');
                list.replaceChildren(...data.quotes.slice(0, 6).map(quote => quoteRow(quote)));
                if (status) status.replaceChildren(icon('clock'), data.quotes.some(quote => quote.stale) ? ' Cached · delayed' : ' Delayed');
            } catch (error) {
                list.replaceChildren(unavailableNotice());
                if (status) status.replaceChildren(icon('alert'), ' Unavailable');
            }
        }));
    }

    async function loadFxBoards(root = doc) {
        const boards = Array.from(root.querySelectorAll('[data-fx-board]'));
        if (!boards.length) return;
        const { api, icon } = global.Willow;
        let data = null;
        try { data = await api('/api/public/fx'); } catch (error) { data = null; }
        boards.forEach(board => {
            const status = board.querySelector('[data-fx-status]');
            const setRow = (code, text, sub) => {
                const cell = board.querySelector(`[data-fx-row="${code}"] [data-fx-rate]`);
                if (!cell) return;
                cell.replaceChildren(doc.createTextNode(text));
                if (sub) {
                    const small = doc.createElement('small');
                    small.textContent = sub;
                    cell.append(small);
                }
            };
            if (!data) {
                ['EUR', 'GBP', 'ZAR', 'MZN'].forEach(code => setRow(code, 'Unavailable'));
                if (status) status.replaceChildren(icon('alert'), ' Rates unavailable');
                return;
            }
            data.rates.forEach(rate => {
                if (rate.unavailable) return setRow(rate.currency, 'Unavailable');
                const digits = rate.perUsd >= 10 ? 2 : 4;
                setRow(rate.currency, rate.perUsd.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }), Number.isFinite(rate.changePercent) ? `${rate.changePercent >= 0 ? '+' : '−'}${Math.abs(rate.changePercent).toFixed(2)}% today` : '');
            });
            if (status) status.replaceChildren(icon(data.unavailable ? 'alert' : 'clock'), data.unavailable ? ' Rates unavailable' : ' Indicative · delayed');
        });
    }

    global.WillowPublicMarkets = { assetMark, delta, quoteRow, unavailableNotice, loadLiveLists, loadFxBoards };

    const init = () => { loadLiveLists(); loadFxBoards(); };
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
    else init();
})(window);
