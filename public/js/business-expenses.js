/* Willow business — the expense log the owner keeps. */
'use strict';

(function (global) {
    const doc = global.document;
    const W = global.Willow;

    function init() {
        const list = doc.querySelector('[data-expense-list]');
        const dialog = doc.getElementById('expenseDialog');
        const form = doc.getElementById('expenseForm');
        if (!list || !dialog || !form || !W) return;
        const error = form.querySelector('[data-expense-error]');
        const remove = form.querySelector('[data-expense-delete]');
        const payField = form.querySelector('[data-expense-pay-field]');
        const monthSelect = doc.querySelector('[data-expense-month]');
        const money = cents => W.formatCents(cents, 'USD');
        const clean = value => String(value || '').replace(/[,\s$]/g, '');
        const pad = n => String(n).padStart(2, '0');
        let expenses = [];
        let freshId = null;

        // Month filter: this month and the previous eleven.
        const now = new Date();
        for (let offset = 0; offset < 12; offset += 1) {
            const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
            const key = `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
            monthSelect.append(W.el('option', { value: key, text: new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(date) }));
        }
        monthSelect.append(W.el('option', { value: 'all', text: 'All expenses' }));

        function range() {
            if (monthSelect.value === 'all') return '';
            const [year, month] = monthSelect.value.split('-').map(Number);
            const last = new Date(year, month, 0).getDate();
            return `?from=${monthSelect.value}-01&to=${monthSelect.value}-${pad(last)}`;
        }

        function totals() {
            const box = doc.querySelector('[data-expense-totals]');
            box.hidden = !expenses.length;
            if (!expenses.length) return;
            const total = expenses.reduce((sum, item) => sum + item.amountCents, 0);
            const byCategory = new Map();
            expenses.forEach(item => byCategory.set(item.categoryLabel, (byCategory.get(item.categoryLabel) || 0) + item.amountCents));
            const [topLabel, topCents] = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0];
            box.querySelector('[data-expense-total]').textContent = money(total);
            box.querySelector('[data-expense-count]').textContent = `${expenses.length} expense${expenses.length === 1 ? '' : 's'}`;
            box.querySelector('[data-expense-top]').textContent = topLabel;
            box.querySelector('[data-expense-top-amount]').textContent = `${money(topCents)} · ${Math.round(topCents / total * 100)}%`;
        }

        function render() {
            totals();
            if (!expenses.length) {
                list.replaceChildren(W.empty({ iconName: 'receipt', title: monthSelect.value === 'all' ? 'No expenses logged yet' : 'No expenses this month', text: 'Log rent, software, supplies or anything else the business pays for. Your dashboard and budgets update straight away.', compact: true, action: { label: 'Log an expense', onClick: () => open() } }));
                return;
            }
            const rows = expenses.map(item => {
                const edit = W.el('button', { type: 'button', className: 'btn btn-ghost btn-sm', text: 'Edit', 'aria-label': `Edit expense to ${item.vendor}` });
                edit.addEventListener('click', () => open(item));
                return W.el('tr', { 'data-expense-id': item.id },
                    W.el('td', { className: 'nowrap', text: W.formatDate(item.spentOn) }),
                    W.el('td', null, W.el('strong', { text: item.vendor }), item.note ? W.el('small', { className: 'muted block', text: item.note }) : null),
                    W.el('td', { text: item.categoryLabel }),
                    W.el('td', { className: 'num', 'data-private': '', text: money(item.amountCents) }),
                    W.el('td', null, item.paidFromAccount ? W.el('span', { className: 'status-pill is-paid', text: 'Paid from account' }) : W.el('span', { className: 'status-pill', text: 'Record' })),
                    W.el('td', { className: 'text-right' }, edit));
            });
            list.replaceChildren(W.el('div', { className: 'table-wrap' }, W.el('table', { className: 'table expense-table' },
                W.el('thead', null, W.el('tr', null, ...['Date', 'Paid to', 'Category'].map(text => W.el('th', { scope: 'col', text })), W.el('th', { scope: 'col', className: 'text-right', text: 'Amount' }), W.el('th', { scope: 'col', text: 'Type' }), W.el('th', { scope: 'col' }, W.el('span', { className: 'visually-hidden', text: 'Actions' })))),
                W.el('tbody', null, ...rows))));
            if (freshId) { W.highlight(list.querySelector(`[data-expense-id="${freshId}"]`), { scroll: true }); freshId = null; }
        }

        async function load() {
            try {
                expenses = (await W.api(`/api/business/expenses${range()}`)).expenses;
                render();
            } catch (err) {
                list.replaceChildren(W.empty({ iconName: 'alert', title: 'Expenses couldn’t load', text: err.message, error: true, compact: true, action: { label: 'Try again', onClick: load } }));
            }
        }

        function open(item) {
            form.reset();
            error.hidden = true;
            form.elements.id.value = item ? item.id : '';
            doc.getElementById('expenseDialogTitle').textContent = item ? 'Edit expense' : 'Log an expense';
            remove.hidden = !item || item.paidFromAccount;
            payField.hidden = Boolean(item);
            form.elements.amount.readOnly = Boolean(item && item.paidFromAccount);
            if (item) {
                form.elements.vendor.value = item.vendor;
                form.elements.category.value = item.category;
                form.elements.amount.value = (item.amountCents / 100).toFixed(2);
                form.elements.spentOn.value = item.spentOn;
                form.elements.note.value = item.note;
            }
            W.openDialog(dialog);
            form.elements.vendor.focus();
        }

        doc.querySelectorAll('[data-expense-new]').forEach(button => button.addEventListener('click', () => open()));
        monthSelect.addEventListener('change', load);
        form.addEventListener('submit', async event => {
            event.preventDefault();
            error.hidden = true;
            const id = form.elements.id.value;
            const body = { vendor: form.elements.vendor.value.trim(), category: form.elements.category.value, amount: clean(form.elements.amount.value), spentOn: form.elements.spentOn.value, note: form.elements.note.value.trim() };
            if (!id && form.elements.payFromAccountId.value) body.payFromAccountId = form.elements.payFromAccountId.value;
            const button = form.querySelector('[type="submit"]');
            button.classList.add('is-loading');
            try {
                const result = await W.api(id ? `/api/business/expenses/${id}` : '/api/business/expenses', { method: id ? 'PUT' : 'POST', body });
                freshId = result.expense.id;
                W.closeDialog(dialog);
                W.showToast(id ? 'Expense updated.' : body.payFromAccountId ? 'Expense paid and logged.' : 'Expense logged.', 'success');
                const spentMonth = result.expense.spentOn.slice(0, 7);
                if (monthSelect.value !== 'all' && monthSelect.value !== spentMonth && [...monthSelect.options].some(option => option.value === spentMonth)) monthSelect.value = spentMonth;
                await load();
                doc.dispatchEvent(new CustomEvent('willow:budgets-changed'));
            } catch (err) {
                error.textContent = err.message;
                error.hidden = false;
            } finally {
                button.classList.remove('is-loading');
            }
        });
        remove.addEventListener('click', async () => {
            const id = form.elements.id.value;
            W.closeDialog(dialog);
            if (!await W.showConfirm('This removes the expense from your log and budgets.', 'Delete expense?', { confirmLabel: 'Delete', danger: true })) return;
            try {
                await W.api(`/api/business/expenses/${id}`, { method: 'DELETE' });
                W.showToast('Expense deleted.', 'success');
                await load();
                doc.dispatchEvent(new CustomEvent('willow:budgets-changed'));
            } catch (err) { W.showToast(err.message, 'error'); }
        });
        load();
        if (global.location.hash === '#new') { global.history.replaceState(null, '', global.location.pathname); open(); }
    }

    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
    else init();
})(window);
