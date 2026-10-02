/* Willow international — indicative rates and simulated conversions. */
'use strict';

(function (global) {
    const doc = global.document;
    const W = global.Willow;
    const SYMBOLS = { USD: '$', EUR: '€', GBP: '£', ZAR: 'R', MZN: 'MT' };

    function rateText(rate, from, to) {
        return `1 ${from} = ${W.formatNumber(rate, rate < 1 ? 6 : 4)} ${to}`;
    }

    async function loadRates() {
        const board = doc.querySelector('[data-rates-board]');
        const status = doc.querySelector('[data-rates-status]');
        if (!board) return;
        board.replaceChildren(W.skeletonRows(3));
        try {
            const { rates } = await W.api('/api/fx/rates', { passive: true });
            const rows = rates.filter(rate => rate.currency !== 'USD');
            if (!rows.length || rows.every(rate => rate.unavailable)) throw new Error('unavailable');
            const stale = rows.some(rate => rate.stale);
            status.textContent = stale ? 'Cached · delayed' : 'Delayed';
            board.replaceChildren(W.el('ul', { className: 'list-plain', role: 'list' }, rows.map(rate => W.el('li', { className: 'list-row' },
                W.el('span', { className: 'currency-flag', 'aria-hidden': 'true', text: SYMBOLS[rate.currency] || rate.currency }),
                W.el('span', { className: 'list-row-main' }, W.el('span', { className: 'list-row-title', text: `USD → ${rate.currency}` }), W.el('span', { className: 'list-row-sub', text: rate.name })),
                W.el('span', { className: 'list-row-end' },
                    W.el('strong', { className: 'num', text: rate.unavailable ? 'Unavailable' : W.formatNumber(rate.perUsd, rate.perUsd < 1 ? 6 : 4) }),
                    !rate.unavailable && Number.isFinite(rate.changePercent) ? W.el('small', null, W.el('span', { className: `delta ${rate.changePercent >= 0 ? 'is-up' : 'is-down'}`, text: W.formatPercent(rate.changePercent) })) : null)))));
        } catch (error) {
            status.textContent = 'Unavailable';
            board.replaceChildren(W.empty({ iconName: 'globe', title: 'Exchange rates temporarily unavailable.', text: 'Conversions are paused until a current indicative rate is available. Please try again shortly.', error: true, compact: true, action: { label: 'Try again', onClick: loadRates } }));
        }
    }

    function setupConverter() {
        const form = doc.getElementById('convertForm');
        const dataNode = doc.getElementById('fxData');
        if (!form || !dataNode) return;
        const { accounts } = JSON.parse(dataNode.textContent);
        const from = form.elements.fromAccountId;
        const to = form.elements.toAccountId;
        const amount = form.elements.amount;
        const error = doc.getElementById('convertError');
        const converted = form.querySelector('[data-converted]');
        const rateLine = form.querySelector('[data-rate]');
        const review = form.querySelector('[data-convert-review]');
        const dialog = doc.getElementById('convertReview');
        const byId = id => accounts.find(account => account.id === Number(id));
        let quote = null;
        let timer = null;
        let token = 0;

        const option = account => W.el('option', { value: account.id, text: `${account.name} · ${account.currency}` });
        from.replaceChildren(...accounts.map(option));
        const firstForeign = accounts.find(account => account.currency !== accounts[0].currency);
        function fillTo(preferred) {
            const source = byId(from.value);
            const options = accounts.filter(account => account.currency !== source.currency);
            to.replaceChildren(...options.map(option));
            if (preferred && options.some(account => account.id === preferred)) to.value = String(preferred);
        }
        fillTo(firstForeign && firstForeign.id);

        function sync() {
            const source = byId(from.value);
            form.querySelector('[data-from-symbol]').textContent = SYMBOLS[source.currency] || source.currency;
            form.querySelector('[data-from-available]').textContent = `${W.formatCents(source.available, source.currency)} available`;
        }

        function setError(message) {
            error.textContent = message;
            error.hidden = !message;
            amount.setAttribute('aria-invalid', String(Boolean(message)));
        }

        async function requestQuote() {
            const source = byId(from.value);
            const target = byId(to.value);
            const raw = amount.value.replace(/[,\s]/g, '');
            quote = null;
            review.disabled = true;
            if (!raw) { converted.textContent = '—'; setError(''); return; }
            if (!/^\d+(\.\d{1,2})?$/.test(raw) || Number(raw) <= 0) { setError('Enter a positive amount with up to two decimal places.'); converted.textContent = '—'; return; }
            if (Math.round(Number(raw) * 100) > source.available) { setError(`That’s more than the ${W.formatCents(source.available, source.currency)} available.`); converted.textContent = '—'; return; }
            setError('');
            const current = ++token;
            converted.textContent = '…';
            try {
                const result = await W.api(`/api/fx/quote?from=${source.currency}&to=${target.currency}&amount=${raw}`, { passive: true });
                if (current !== token) return;
                if (result.unavailable || result.converted === null) {
                    converted.textContent = '—';
                    rateLine.replaceChildren(W.icon('alert', 'icon-sm'), ' Exchange rates temporarily unavailable. Conversions are paused.');
                    return;
                }
                quote = { ...result, source, target, raw };
                converted.textContent = W.formatMoney(result.converted, target.currency, { digits: 2 });
                rateLine.replaceChildren(W.icon('clock', 'icon-sm'), ` ${rateText(result.rate, source.currency, target.currency)} · indicative${result.stale ? ' · out of date' : ''}${result.asOf ? ` · ${W.formatDate(result.asOf, 'time')}` : ''}`);
                review.disabled = Boolean(result.stale);
                if (result.stale) setError('Rates are out of date, so conversions are paused until a current rate is available.');
            } catch (err) {
                if (current !== token) return;
                converted.textContent = '—';
                rateLine.replaceChildren(W.icon('alert', 'icon-sm'), ` ${err.message}`);
            }
        }

        const schedule = () => { clearTimeout(timer); timer = setTimeout(requestQuote, 300); };
        from.addEventListener('change', () => { fillTo(Number(to.value)); sync(); schedule(); });
        to.addEventListener('change', schedule);
        amount.addEventListener('input', schedule);
        form.querySelector('[data-swap]').addEventListener('click', () => {
            const previousFrom = Number(from.value);
            const previousTo = Number(to.value);
            from.value = String(previousTo);
            fillTo(previousFrom);
            sync();
            schedule();
        });

        form.addEventListener('submit', event => {
            event.preventDefault();
            if (!quote) return;
            dialog.querySelector('[data-review-from]').textContent = W.formatMoney(Number(quote.raw), quote.source.currency, { digits: 2 });
            dialog.querySelector('[data-review-to]').textContent = W.formatMoney(quote.converted, quote.target.currency, { digits: 2 });
            dialog.querySelector('[data-review-rate]').textContent = `${rateText(quote.rate, quote.source.currency, quote.target.currency)} (indicative)`;
            dialog.querySelector('[data-review-from-account]').textContent = `${quote.source.name} · ${quote.source.masked}`;
            dialog.querySelector('[data-review-to-account]').textContent = `${quote.target.name} · ${quote.target.masked}`;
            dialog.querySelector('[data-review-error]').hidden = true;
            W.openDialog(dialog);
        });

        dialog.querySelector('[data-convert-confirm]').addEventListener('click', async event => {
            const button = event.currentTarget;
            const reviewError = dialog.querySelector('[data-review-error]');
            button.classList.add('is-loading');
            button.disabled = true;
            try {
                const result = await W.api('/api/fx/convert', { method: 'POST', body: { fromAccountId: quote.source.id, toAccountId: quote.target.id, amount: quote.raw } });
                const conversion = result.conversion;
                W.closeDialog(dialog);
                W.showToast(`Converted ${conversion.from.formatted} to ${conversion.to.formatted}. Simulated — no real currency exchanged.`, 'success', 6000);
                global.setTimeout(() => global.location.reload(), 1200);
            } catch (err) {
                reviewError.textContent = err.message;
                reviewError.hidden = false;
            } finally {
                button.classList.remove('is-loading');
                button.disabled = false;
            }
        });

        sync();
    }

    function init() {
        loadRates();
        setupConverter();
    }

    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
    else init();
})(window);
