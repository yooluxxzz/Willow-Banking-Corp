/* Willow budgets — limits measured against real activity (personal or business scope). */
'use strict';

(function (global) {
    const doc = global.document;
    const W = global.Willow;
    const PERIOD = { daily: 'today', weekly: 'this week', monthly: 'this month' };
    const PERIOD_LABEL = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };

    function init() {
        const root = doc.querySelector('[data-budgets]');
        const dialog = doc.getElementById('budgetDialog');
        const form = doc.getElementById('budgetForm');
        if (!root || !dialog || !form || !W) return;
        const scope = root.dataset.scope === 'business' ? 'business' : 'personal';
        const list = root.querySelector('[data-budget-list]');
        const error = form.querySelector('[data-budget-error]');
        const remove = form.querySelector('[data-budget-delete]');
        const categorySelect = form.querySelector('[data-budget-categories]');
        let budgets = [];
        let categoriesLoaded = false;
        let freshId = null;

        const money = cents => W.formatCents(cents, 'USD', { digits: cents % 100 ? 2 : 0 });

        function summary() {
            const box = root.querySelector('[data-budget-summary]');
            if (!box) return;
            box.hidden = !budgets.length;
            if (!budgets.length) return;
            const count = status => budgets.filter(budget => budget.status === status).length;
            box.querySelector('[data-summary-ok]').textContent = count('under');
            box.querySelector('[data-summary-ok-note]').textContent = `of ${budgets.length} budget${budgets.length === 1 ? '' : 's'}`;
            box.querySelector('[data-summary-near]').textContent = count('near');
            box.querySelector('[data-summary-over]').textContent = count('over');
            box.querySelector('[data-summary-left]').textContent = money(budgets.reduce((sum, budget) => sum + Math.max(0, budget.remainingCents), 0));
        }

        function historyBars(budget) {
            if (!budget.history.length) return W.el('p', { className: 'text-xs muted', text: 'Nightly checks will appear here.' });
            const max = Math.max(...budget.history.map(day => Math.max(day.spentCents, day.limitCents)), 1);
            const bars = W.el('div', { className: 'budget-history', role: 'img', 'aria-label': `Last ${budget.history.length} nightly checks: ${budget.history.filter(day => day.status === 'over').length} over limit` },
                ...budget.history.map(day => W.el('span', { className: `budget-history-bar is-${day.status}`, style: `--h:${Math.max(4, Math.round((day.spentCents / max) * 100))}%`, title: `${W.formatDate(day.day)}: ${money(day.spentCents)} of ${money(day.limitCents)}` })));
            return W.el('div', null, W.el('p', { className: 'text-xs muted mb-2', text: 'Nightly checks' }), bars);
        }

        function card(budget) {
            const pct = Math.min(100, budget.percent);
            const label = budget.status === 'over' ? `${money(-budget.remainingCents)} over` : `${money(budget.remainingCents)} left`;
            const edit = W.el('button', { type: 'button', className: 'btn btn-ghost btn-icon btn-sm', 'aria-label': `Edit ${budget.name}` }, W.icon('settings'));
            edit.addEventListener('click', () => open(budget));
            const badge = W.el('span', { className: `badge ${budget.status === 'over' ? 'badge-negative' : budget.status === 'near' ? 'badge-warning' : 'badge-positive'}`, text: budget.status === 'over' ? 'Over' : budget.status === 'near' ? 'Close' : 'On track' });
            return W.el('article', { className: `panel budget-card is-${budget.status}`, 'data-budget-id': budget.id },
                W.el('div', { className: 'budget-card-head' },
                    W.el('div', null, W.el('h2', { text: budget.name }), W.el('p', { className: 'text-xs muted', text: `${PERIOD_LABEL[budget.period]} · ${budget.categoryLabel}` })),
                    W.el('div', { className: 'cluster' }, badge, edit)),
                W.el('p', { className: 'budget-figure' },
                    W.el('span', { className: 'figure figure-md', 'data-private': '', text: money(budget.spentCents) }),
                    W.el('span', { className: 'muted', 'data-private': '', text: ` of ${money(budget.limitCents)} ${PERIOD[budget.period]}` })),
                W.el('div', { className: `progress${budget.status === 'over' ? ' is-negative' : budget.status === 'near' ? ' is-accent' : ''}`, role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(pct)), 'aria-label': `${Math.round(budget.percent)}% of ${budget.name} used` }, W.el('span', { style: `--value:${pct}%` })),
                W.el('div', { className: 'budget-meta' },
                    W.el('span', { className: budget.status === 'over' ? 'negative' : '', 'data-private': '', text: label }),
                    budget.status !== 'over' && budget.period !== 'daily' ? W.el('span', { className: 'muted', 'data-private': '', text: `≈ ${money(budget.perDayLeftCents)} a day for ${budget.daysLeft} day${budget.daysLeft === 1 ? '' : 's'}` }) : W.el('span', { className: 'muted', text: budget.period === 'daily' ? 'Resets at midnight' : `${budget.daysLeft} day${budget.daysLeft === 1 ? '' : 's'} left` })),
                historyBars(budget));
        }

        function render() {
            summary();
            if (!budgets.length) {
                list.replaceChildren(W.el('div', { className: 'panel budget-empty' }, W.empty({
                    level: scope === 'business' ? 3 : 2,
                    iconName: 'sliders',
                    title: scope === 'business' ? 'No business budgets yet' : 'Set your first budget',
                    text: scope === 'business' ? 'Cap a category — software, marketing, travel — or all business expenses, by day, week or month.' : 'Pick a category or all spending, choose daily, weekly or monthly, and set a limit. Progress updates as you spend.',
                    action: { label: 'Create a budget', onClick: () => open() },
                })));
                return;
            }
            list.replaceChildren(...budgets.map(card));
            if (freshId) {
                W.highlight(list.querySelector(`[data-budget-id="${freshId}"]`), { scroll: true });
                freshId = null;
            } else W.stagger(list);
        }

        async function load() {
            list.replaceChildren(W.el('div', { className: 'panel' }, W.skeletonRows(3)));
            try {
                const data = await W.api(`/api/budgets?scope=${scope}`);
                budgets = data.budgets;
                if (!categoriesLoaded) {
                    data.categories.forEach(option => categorySelect.append(W.el('option', { value: option.key, text: option.label })));
                    categoriesLoaded = true;
                }
                render();
            } catch (err) {
                list.replaceChildren(W.el('div', { className: 'panel' }, W.empty({ level: scope === 'business' ? 3 : 2, iconName: 'alert', title: 'Budgets couldn’t load', text: err.message, error: true, action: { label: 'Try again', onClick: load } })));
            }
        }

        function open(budget) {
            form.reset();
            error.hidden = true;
            form.elements.id.value = budget ? budget.id : '';
            doc.getElementById('budgetDialogTitle').textContent = budget ? 'Edit budget' : 'New budget';
            remove.hidden = !budget;
            if (budget) {
                form.elements.name.value = budget.name;
                categorySelect.value = budget.category || '';
                form.querySelector(`input[name="period"][value="${budget.period}"]`).checked = true;
                form.elements.limit.value = (budget.limitCents / 100).toFixed(2);
            }
            W.openDialog(dialog);
            form.elements.name.focus();
        }

        doc.querySelectorAll('[data-budget-new]').forEach(button => button.addEventListener('click', () => open()));
        categorySelect.addEventListener('change', () => {
            if (!form.elements.id.value && !form.elements.name.value.trim() && categorySelect.value) form.elements.name.value = categorySelect.selectedOptions[0].textContent;
        });
        form.addEventListener('submit', async event => {
            event.preventDefault();
            error.hidden = true;
            const id = form.elements.id.value;
            const body = {
                scope,
                name: form.elements.name.value.trim(),
                category: categorySelect.value || null,
                period: form.querySelector('input[name="period"]:checked').value,
                limit: String(form.elements.limit.value || '').replace(/[,\s$]/g, ''),
            };
            const button = form.querySelector('[type="submit"]');
            button.classList.add('is-loading');
            try {
                const result = await W.api(id ? `/api/budgets/${id}` : '/api/budgets', { method: id ? 'PUT' : 'POST', body });
                freshId = result.budget.id;
                W.closeDialog(dialog);
                W.showToast(id ? 'Budget updated.' : 'Budget created.', 'success');
                load();
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
            const ok = await W.showConfirm('This removes the budget and its nightly history. Your transactions aren’t affected.', 'Delete budget?', { confirmLabel: 'Delete', danger: true });
            if (!ok) return;
            try {
                await W.api(`/api/budgets/${id}`, { method: 'DELETE' });
                W.showToast('Budget deleted.', 'success');
                load();
            } catch (err) { W.showToast(err.message, 'error'); }
        });
        doc.addEventListener('willow:budgets-changed', load);
        load();
    }

    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
    else init();
})(window);
