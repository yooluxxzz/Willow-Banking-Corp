'use strict';

document.addEventListener('DOMContentLoaded', () => {
    const amount = document.getElementById('loanAmount');
    const term = document.getElementById('loanTerm');
    const rate = document.getElementById('loanRate');
    const currency = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' });
    const update = () => {
        const principal = Number(amount.value);
        const months = Number(term.value);
        const annualRate = Number(rate.value) / 100;
        document.getElementById('loanTermLabel').textContent = `${months} months`;
        if (!Number.isFinite(principal) || principal <= 0 || principal > 100000 || !Number.isFinite(annualRate) || annualRate <= 0 || annualRate > .35) {
            document.getElementById('loanPayment').textContent = '—';
            document.getElementById('loanSummary').textContent = 'Enter an amount and rate within the displayed limits.';
            document.getElementById('loanTotal').textContent = '—';
            document.getElementById('loanInterest').textContent = '—';
            return;
        }
        const monthlyRate = annualRate / 12;
        const payment = principal * monthlyRate / (1 - Math.pow(1 + monthlyRate, -months));
        const total = payment * months;
        document.getElementById('loanPayment').textContent = currency.format(payment);
        document.getElementById('loanSummary').textContent = `${currency.format(principal)} over ${months} months at an illustrative ${Number(rate.value).toFixed(1)}% annual rate.`;
        document.getElementById('loanTotal').textContent = currency.format(total);
        document.getElementById('loanInterest').textContent = currency.format(total - principal);
    };
    [amount, term, rate].forEach(input => input.addEventListener('input', update));
    update();
});