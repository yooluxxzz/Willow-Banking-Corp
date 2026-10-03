/* Willow — add or withdraw demo money. */
'use strict';

(function (global) {
    const doc = global.document;
    const W = global.Willow;
    const SYMBOLS = { USD: '$', EUR: '€', GBP: '£', ZAR: 'R', MZN: 'MT' };

    function init() {
        const root = doc.querySelector('[data-money-flow]');
        const form = doc.getElementById('moneyForm');
        if (!root || !form) return;
        const deposit = root.dataset.mode === 'deposit';
        const steps = W.flow(root, { labels: ['Amount', 'Review', 'Done'] });
        const amount = form.elements.amount;
        const amountError = doc.getElementById('amountError');
        const submitError = form.querySelector('[data-submit-error]');
        let pending = false;

        const option = () => form.elements.accountId.selectedOptions[0];
        const currency = () => option().dataset.currency || 'USD';
        const value = () => Number(String(amount.value).replace(/[,\s]/g, ''));

        function syncCurrency() {
            form.querySelectorAll('[data-amount-symbol]').forEach(node => { node.textContent = SYMBOLS[currency()] || currency(); });
        }

        function validate() {
            const raw = String(amount.value).replace(/[,\s]/g, '');
            let message = '';
            if (!raw) message = 'Enter an amount.';
            else if (!/^\d+(\.\d{1,2})?$/.test(raw) || value() <= 0) message = 'Enter a positive amount with up to two decimal places.';
            else if (!deposit && Math.round(value() * 100) > Number(option().dataset.available)) {
                message = doc.documentElement.classList.contains('is-private')
                    ? 'That’s more than this account’s available balance.'
                    : `That’s more than the available balance (${W.formatCents(Number(option().dataset.available), currency())}).`;
            }
            amount.setAttribute('aria-invalid', String(Boolean(message)));
            amountError.textContent = message;
            amountError.hidden = !message;
            return !message;
        }

        form.elements.accountId.addEventListener('change', () => { syncCurrency(); if (amount.value) validate(); });
        amount.addEventListener('input', () => { if (amount.getAttribute('aria-invalid') === 'true') validate(); });
        form.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => { amount.value = button.dataset.preset; validate(); amount.focus(); }));
        form.querySelectorAll('[data-flow-back]').forEach(button => button.addEventListener('click', () => steps.back()));
        form.querySelector('[data-flow-next]').addEventListener('click', () => {
            if (!validate()) { amount.focus(); return; }
            form.querySelector('[data-review-amount]').textContent = W.formatMoney(value(), currency(), { digits: 2 });
            form.querySelector('[data-review-account]').textContent = option().dataset.privateText || option().textContent.split(' · ')[0];
            form.querySelector('[data-review-note]').textContent = form.elements.description.value.trim() || (deposit ? 'Deposit' : 'Withdrawal');
            const reviewCategory = form.querySelector('[data-review-category]');
            if (reviewCategory) reviewCategory.textContent = form.elements.category.value ? form.elements.category.selectedOptions[0].textContent : 'Not set';
            submitError.hidden = true;
            steps.next();
        });
        form.addEventListener('keydown', event => {
            if (event.key === 'Enter' && steps.index === 0 && event.target.tagName === 'INPUT') {
                event.preventDefault();
                form.querySelector('[data-flow-next]').click();
            }
        });

        form.addEventListener('submit', async event => {
            event.preventDefault();
            if (pending || steps.index !== 1) return;
            pending = true;
            const button = form.querySelector('[data-flow-pane="1"] [type="submit"]');
            button.classList.add('is-loading');
            button.disabled = true;
            try {
                const body = { accountId: Number(form.elements.accountId.value), amount: String(amount.value).replace(/[,\s]/g, ''), description: form.elements.description.value.trim() };
                if (!deposit && form.elements.category.value) body.category = form.elements.category.value;
                const data = await W.api(deposit ? '/api/deposits' : '/api/withdrawals', { method: 'POST', body });
                form.querySelector('[data-receipt-amount]').textContent = `${deposit ? '+' : '−'}${W.formatCents(data.amountCents, data.currency)}`;
                form.querySelector('[data-receipt-to]').textContent = `${deposit ? 'To' : 'From'} ${option().textContent.split(' · ')[0]}`;
                form.querySelector('[data-receipt-ref]').textContent = data.reference;
                form.querySelector('[data-receipt-date]').textContent = `Today · ${W.formatDate(new Date(), 'time')}`;
                form.querySelector('[data-receipt-account]').href = `/accounts/${body.accountId}`;
                steps.next();
            } catch (error) {
                submitError.textContent = error.message;
                submitError.hidden = false;
                submitError.focus();
            } finally {
                pending = false;
                button.classList.remove('is-loading');
                button.disabled = false;
            }
        });

        syncCurrency();
    }

    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
    else init();
})(window);
