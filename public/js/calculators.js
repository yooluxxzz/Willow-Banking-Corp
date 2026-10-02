/* Willow loan calculators — estimates only, computed in the browser. */
'use strict';

(function (global) {
    const doc = global.document;

    function amortized(principal, ratePct, months) {
        const r = ratePct / 100 / 12;
        if (r === 0) return principal / months;
        return (principal * r) / (1 - Math.pow(1 + r, -months));
    }

    /** Pure estimate function shared by the UI (mirrors the server). */
    function estimate(kind, values) {
        const n = key => Number(values[key]);
        if (kind === 'credit') {
            const balance = n('balance');
            const rate = n('rate');
            const payment = n('payment');
            if (!(balance >= 100 && balance <= 100000)) return { error: 'Enter a balance between $100 and $100,000.' };
            if (!(rate >= 0 && rate <= 40)) return { error: 'Enter an APR between 0% and 40%.' };
            if (!(payment > 0)) return { error: 'Enter a monthly payment.' };
            const monthlyInterest = balance * rate / 100 / 12;
            if (payment <= monthlyInterest + 0.005) return { error: `This payment doesn’t cover the monthly interest of about $${monthlyInterest.toFixed(2)}, so the balance would never be repaid.` };
            let remaining = balance;
            let months = 0;
            let interest = 0;
            while (remaining > 0.005 && months < 600) {
                const charge = remaining * rate / 100 / 12;
                interest += charge;
                remaining = remaining + charge - payment;
                months += 1;
            }
            return { kind, months, interest, principal: balance, payment, total: balance + interest };
        }
        const rate = n('rate');
        const maxRate = kind === 'mortgage' ? 15 : kind === 'business' ? 30 : 36;
        if (!(rate >= 0 && rate <= maxRate)) return { error: `Enter a rate between 0% and ${maxRate}%.` };
        let principal;
        let extras = 0;
        if (kind === 'mortgage') {
            const price = n('homePrice');
            const down = n('downPayment');
            if (!(price >= 20000 && price <= 10000000)) return { error: 'Enter a home price between $20,000 and $10,000,000.' };
            if (!(down >= 0 && down < price)) return { error: 'The down payment must be less than the home price.' };
            principal = price - down;
            extras = (Math.max(0, n('propertyTax') || 0) + Math.max(0, n('insurance') || 0)) / 12;
        } else {
            principal = n('principal');
            const [min, max] = kind === 'business' ? [5000, 500000] : [1000, 100000];
            if (!(principal >= min && principal <= max)) return { error: `Enter an amount between $${min.toLocaleString('en-US')} and $${max.toLocaleString('en-US')}.` };
        }
        const months = Math.round(n('termMonths'));
        if (!(months >= 12)) return { error: 'Choose a term.' };
        const payment = amortized(principal, rate, months);
        const total = payment * months;
        return { kind, principal, months, payment, monthly: payment + extras, extras, total, interest: total - principal };
    }

    function setupCalculator(form) {
        const kind = form.dataset.calc;
        const money = (value, digits = 0) => global.Willow ? global.Willow.formatMoney(value, 'USD', { digits }) : `$${Number(value).toFixed(digits)}`;
        const figure = form.querySelector('[data-calc-figure]');
        const sub = form.querySelector('[data-calc-sub]');
        const details = form.querySelector('[data-calc-details]');
        const error = form.querySelector('[data-calc-error]');
        const split = form.querySelector('[data-calc-split]');
        const field = name => form.elements.namedItem(name);
        const values = () => Object.fromEntries(['principal', 'termMonths', 'rate', 'homePrice', 'downPayment', 'propertyTax', 'insurance', 'balance', 'payment'].filter(name => field(name)).map(name => [name, field(name).value]));

        const link = (input, range, toRange = value => value, fromRange = value => value) => {
            if (!input || !range) return;
            const fill = () => global.Willow && global.Willow.setupRangeFill(range.parentElement);
            input.addEventListener('input', () => { range.value = toRange(Number(input.value)); fill(); });
            range.addEventListener('input', () => { input.value = fromRange(Number(range.value)); render(); });
        };
        link(field('principal'), form.querySelector('[data-calc-amount-range]'));
        link(field('payment'), form.querySelector('[data-calc-payment-range]'));
        const downRange = form.querySelector('[data-calc-down-range]');
        if (downRange) {
            link(field('downPayment'), downRange, value => Math.round(value / Math.max(1, Number(field('homePrice').value)) * 100), pct => Math.round(Number(field('homePrice').value) * pct / 100));
        }
        form.querySelectorAll('[data-calc-term]').forEach(button => button.addEventListener('click', () => {
            form.querySelectorAll('[data-calc-term]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
            field('termMonths').value = button.dataset.calcTerm;
            render();
        }));

        function row(label, value, color) {
            const wrap = doc.createElement('div');
            const dt = doc.createElement('dt');
            if (color) {
                const swatch = doc.createElement('i');
                swatch.style.background = color;
                dt.append(swatch);
            }
            dt.append(label);
            const dd = doc.createElement('dd');
            dd.textContent = value;
            wrap.append(dt, dd);
            return wrap;
        }

        function render() {
            const result = estimate(kind, values());
            const termLabel = form.querySelector('[data-calc-term-label]');
            if (termLabel && field('termMonths')) termLabel.textContent = `${field('termMonths').value} months`;
            const pct = form.querySelector('[data-calc-down-pct]');
            if (pct && field('homePrice')) pct.textContent = `${Math.round(Number(field('downPayment').value) / Math.max(1, Number(field('homePrice').value)) * 100)}%`;
            if (result.error) {
                error.textContent = result.error;
                error.hidden = false;
                figure.textContent = '—';
                sub.textContent = '';
                details.replaceChildren();
                form.dataset.valid = 'false';
                return;
            }
            error.hidden = true;
            form.dataset.valid = 'true';
            const interestShare = result.total ? Math.max(0, Math.min(100, result.interest / result.total * 100)) : 0;
            split.querySelector('.calc-split-principal').style.width = `${100 - interestShare}%`;
            split.querySelector('.calc-split-interest').style.width = `${interestShare}%`;
            if (kind === 'credit') {
                const years = Math.floor(result.months / 12);
                const months = result.months % 12;
                figure.textContent = years ? `${years} yr${years > 1 ? 's' : ''} ${months ? months + ' mo' : ''}`.trim() : `${result.months} months`;
                sub.textContent = `Paying ${money(result.payment)} a month at ${Number(values().rate).toFixed(1)}% APR.`;
                details.replaceChildren(
                    row('Balance', money(result.principal), 'var(--chart-1)'),
                    row('Total interest', money(result.interest), 'var(--chart-3)'),
                    row('Total paid', money(result.total)));
            } else {
                figure.textContent = money(kind === 'mortgage' ? result.monthly : result.payment);
                sub.textContent = kind === 'mortgage'
                    ? `${money(result.payment)} principal & interest + ${money(result.extras)} tax & insurance, over ${result.months / 12} years.`
                    : `${money(result.principal)} over ${result.months} months at an illustrative ${Number(values().rate).toFixed(1)}% rate.`;
                details.replaceChildren(
                    row(kind === 'mortgage' ? 'Loan amount' : 'Principal', money(result.principal), 'var(--chart-1)'),
                    row('Total interest', money(result.interest), 'var(--chart-3)'),
                    row('Total repaid', money(result.total)));
            }
        }

        form.addEventListener('input', render);
        form.addEventListener('submit', async event => {
            event.preventDefault();
            if (form.dataset.valid !== 'true' || !global.Willow) return;
            const button = form.querySelector('.calc-save button');
            if (!button) return;
            button.classList.add('is-loading');
            try {
                const body = { kind, ...Object.fromEntries(Object.entries(values()).map(([key, value]) => [key, Number(value)])), label: field('label') ? field('label').value.trim() : '' };
                const result = await global.Willow.api('/api/loans/estimates', { method: 'POST', body });
                global.Willow.showToast('Estimate saved. This is not a loan offer.', 'success');
                if (field('label')) field('label').value = '';
                doc.dispatchEvent(new CustomEvent('willow:estimates', { detail: result.estimates }));
            } catch (err) {
                global.Willow.showToast(err.message, 'error');
            } finally {
                button.classList.remove('is-loading');
            }
        });
        render();
    }

    global.WillowCalculators = { estimate, amortized, setupCalculator };
    const init = () => doc.querySelectorAll('form[data-calc]').forEach(setupCalculator);
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
    else init();
})(window);
