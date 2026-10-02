/* Willow — open a demo account (choose → name → review). */
'use strict';

(function (global) {
    const doc = global.document;
    const W = global.Willow;
    const NAMES = { checking: 'Checking account', savings: 'Savings account', business: 'Business checking', currency: 'Currency account' };
    const SUGGESTIONS = { checking: ['Everyday', 'Bills', 'Household'], savings: ['Rainy day', 'Holiday fund', 'New home'], business: ['Operating', 'Studio', 'Taxes'], currency: ['Travel money', 'Abroad', 'Family'] };
    const SYMBOLS = { EUR: '€0.00', GBP: '£0.00', MZN: 'MT 0.00', ZAR: 'R 0.00', USD: '$0.00' };

    function init() {
        const form = doc.getElementById('openAccountForm');
        if (!form) return;
        const steps = W.flow(doc.querySelector('[data-open-account]'), { labels: ['Choose', 'Name', 'Review'] });
        const picker = form.querySelector('[data-currency-picker]');
        const feedback = doc.getElementById('openingFeedback');
        const acknowledged = doc.getElementById('openingAcknowledged');
        const confirm = doc.getElementById('confirmOpening');
        let pending = false;

        const product = () => (form.querySelector('input[name="product"]:checked') || {}).value;
        const currency = () => (product() === 'currency' ? (form.querySelector('input[name="currency"]:checked') || {}).value : 'USD');

        function renderSuggestions() {
            const box = form.querySelector('[data-name-suggestions]');
            box.replaceChildren(...(SUGGESTIONS[product()] || []).map(name => W.el('button', {
                type: 'button', className: 'chip chip-sm', text: name,
                onclick: () => { form.elements.nickname.value = name; form.elements.nickname.focus(); },
            })));
        }

        form.querySelectorAll('input[name="product"]').forEach(input => input.addEventListener('change', () => {
            picker.hidden = product() !== 'currency';
            if (!picker.hidden && !form.querySelector('input[name="currency"]:checked')) form.querySelector('input[name="currency"]').checked = true;
        }));

        form.querySelectorAll('[data-flow-back]').forEach(button => button.addEventListener('click', () => steps.back()));
        form.querySelectorAll('[data-flow-next]').forEach(button => button.addEventListener('click', () => {
            if (steps.index === 0) {
                if (!product()) { W.showToast('Choose an account type to continue.', 'warning'); return; }
                if (product() === 'currency' && !currency()) { W.showToast('Choose a currency.', 'warning'); return; }
                renderSuggestions();
            }
            if (steps.index === 1) {
                const nickname = form.elements.nickname.value.trim();
                const type = product();
                form.querySelector('[data-review="product"]').textContent = type === 'currency' ? `${currency()} account` : NAMES[type];
                form.querySelector('[data-review="name"]').textContent = nickname || NAMES[type];
                form.querySelector('[data-review="currency"]').textContent = currency();
                form.querySelector('[data-review="balance"]').textContent = SYMBOLS[currency()] || '0.00';
                acknowledged.checked = false;
                feedback.hidden = true;
            }
            steps.next();
        }));

        form.addEventListener('keydown', event => {
            if (event.key === 'Enter' && event.target.tagName === 'INPUT' && event.target.type !== 'checkbox' && steps.index < 2) {
                event.preventDefault();
                form.querySelector(`[data-flow-pane="${steps.index}"] [data-flow-next]`).click();
            }
        });

        form.addEventListener('submit', async event => {
            event.preventDefault();
            if (pending) return;
            if (!acknowledged.checked) {
                feedback.textContent = 'Confirm that this is a simulated account before continuing.';
                feedback.hidden = false;
                acknowledged.focus();
                return;
            }
            pending = true;
            confirm.classList.add('is-loading');
            confirm.disabled = true;
            feedback.hidden = true;
            try {
                const body = { product: product(), nickname: form.elements.nickname.value.trim(), requestKey: form.elements.requestKey.value, demoAcknowledged: true };
                if (body.product === 'currency') body.currency = currency();
                const data = await W.api('/api/accounts', { method: 'POST', body });
                W.showToast('Account opened.', 'success');
                global.location.href = data.redirect;
            } catch (error) {
                feedback.textContent = error.message;
                feedback.hidden = false;
                feedback.focus();
                confirm.classList.remove('is-loading');
                confirm.disabled = false;
                pending = false;
            }
        });
    }

    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
    else init();
})(window);
