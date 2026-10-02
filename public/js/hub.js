'use strict';

document.addEventListener('DOMContentLoaded', async () => {
    const root = document.querySelector('.hub-main');
    const csrf = document.querySelector('meta[name="csrf-token"]')?.content || '';
    const byId = id => document.getElementById(id);
    const format = cents => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(Number(cents || 0) / 100);
    const text = (tag, value, className) => { const node = document.createElement(tag); node.textContent = value; if (className) node.className = className; return node; };
    try {
        const response = await fetch('/api/hub/summary', { headers: { Accept: 'application/json' } });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Could not load financial data.');
        const summary = payload.summary;
        byId('hubBankBalance').textContent = format(summary.bankBalanceCents);
        byId('hubSavings').textContent = format(summary.savingsCents);
        byId('hubInvestments').textContent = format(summary.demoInvestmentsAtCostCents);
        byId('hubIncome').textContent = format(summary.month.incomeCents);
        byId('hubExpenses').textContent = format(summary.month.expenseCents);
        const maxFlow = Math.max(summary.month.incomeCents, summary.month.expenseCents, 1);
        byId('incomeBar').style.width = `${Math.max(1, summary.month.incomeCents / maxFlow * 100)}%`;
        byId('expenseBar').style.width = `${Math.max(1, summary.month.expenseCents / maxFlow * 100)}%`;

        const accounts = byId('hubAccounts'); accounts.replaceChildren();
        if (!summary.accounts.length) accounts.append(text('p', 'No active demo accounts are connected yet.', 'wealth-empty'));
        summary.accounts.forEach(account => {
            const row = document.createElement('a'); row.className = 'hub-account-row'; row.href = `/accounts/${encodeURIComponent(account.id)}`;
            const label = document.createElement('span'); label.append(text('strong', account.nickname || (account.purpose === 'business' ? 'Business checking' : account.account_type === 'savings' ? 'Savings' : 'Checking')), text('small', account.purpose === 'business' ? 'Business · Demo' : 'Personal · Demo'));
            row.append(label, text('strong', format(account.balance))); accounts.append(row);
        });
        const expenses = byId('hubExpenseList'); expenses.replaceChildren();
        if (!summary.topExpenses.length) expenses.append(text('p', 'No completed debits are recorded this month.', 'wealth-empty'));
        summary.topExpenses.forEach(item => {
            const row = document.createElement('div'); row.className = 'hub-expense-row'; row.append(text('span', item.description), text('strong', format(item.amountCents))); expenses.append(row);
        });
        root.setAttribute('aria-busy', 'false');
    } catch (error) {
        byId('hubError').hidden = false; byId('hubError').textContent = error.message; root.setAttribute('aria-busy', 'false');
    }

    async function ask(question) {
        const output = byId('hubAnswer'); output.textContent = 'Checking your Willow demo data…';
        try {
            const response = await fetch('/api/hub/ask', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf, Accept: 'application/json' }, body: JSON.stringify({ question }) });
            const result = await response.json(); if (!response.ok) throw new Error(result.answer || result.error || 'Could not answer this question.');
            output.replaceChildren(text('p', result.answer));
            if (result.data?.length) {
                const list = document.createElement('ul'); result.data.forEach(item => { const entry = document.createElement('li'); entry.textContent = `${item.description}: ${format(item.amountCents)}`; list.append(entry); }); output.append(list);
            }
            const links = document.createElement('div'); links.className = 'hub-answer-links';
            (result.links || []).forEach(item => { const link = document.createElement('a'); link.href = item.href; link.textContent = item.label; links.append(link); });
            output.append(links);
        } catch (error) { output.textContent = error.message; }
    }
    document.querySelectorAll('[data-question]').forEach(button => button.addEventListener('click', () => { byId('hubQuestion').value = button.dataset.question; ask(button.dataset.question); }));
    byId('hubQuestionForm').addEventListener('submit', event => { event.preventDefault(); ask(byId('hubQuestion').value); });
});