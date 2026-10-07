/* Willow goals — plans with self-reported progress. */
'use strict';

(function (global) {
    const doc = global.document;
    const W = global.Willow;
    const ICONS = { savings: 'savings', home: 'house', travel: 'plane', business: 'briefcase', investing: 'trend', other: 'target' };
    const LABELS = { savings: 'Safety net', home: 'Home', travel: 'Travel', business: 'Business', investing: 'Investing', other: 'Goal' };

    function init() {
        const list = doc.getElementById('goalList');
        const dialog = doc.getElementById('goalDialog');
        const form = doc.getElementById('goalForm');
        if (!list || !form) return;
        const error = form.querySelector('[data-goal-error]');
        const remove = form.querySelector('[data-goal-delete]');
        let goals = [];
        let accounts = [];

        const money = cents => W.formatCents(cents, 'USD', { digits: 0 });

        function summary() {
            const box = doc.querySelector('[data-goal-summary]');
            box.hidden = !goals.length;
            if (!goals.length) return;
            const saved = goals.reduce((sum, goal) => sum + goal.current_cents, 0);
            const target = goals.reduce((sum, goal) => sum + goal.target_cents, 0);
            box.querySelector('[data-summary-count]').textContent = goals.length;
            box.querySelector('[data-summary-saved]').textContent = money(saved);
            box.querySelector('[data-summary-left]').textContent = money(Math.max(0, target - saved));
            box.querySelector('[data-summary-pct]').textContent = `${target ? Math.round(saved / target * 100) : 0}%`;
        }

        function card(goal) {
            const pct = Math.min(100, Math.round(goal.current_cents / goal.target_cents * 100));
            const done = goal.current_cents >= goal.target_cents;
            const account = accounts.find(item => item.id === goal.account_id);
            const accountLabel = account ? `${account.displayName} · ${account.availableBalanceFormatted} available` : (goal.account_name || 'No funding account');
            const fund = goal.account_id
                ? W.el('a', { className: 'btn btn-secondary btn-sm', href: `/transfers?mode=own&to=${goal.account_id}` }, W.icon('transfer', 'icon-sm'), ' Move money')
                : W.el('button', { type: 'button', className: 'btn btn-secondary btn-sm', text: 'Link account' });
            if (!goal.account_id) fund.addEventListener('click', () => open(goal));
            const edit = W.el('button', { type: 'button', className: 'btn btn-ghost btn-icon btn-sm', 'aria-label': `Edit ${goal.name}` }, W.icon('settings'));
            edit.addEventListener('click', () => open(goal));
            return W.el('article', { className: `goal-card${done ? ' is-done' : ''}` },
                W.el('div', { className: 'goal-card-head' },
                    W.el('span', { className: 'icon-tile' }, W.icon(ICONS[goal.category] || 'target')),
                    W.el('div', { className: 'goal-card-title' }, W.el('h2', { text: goal.name }), W.el('span', { className: 'text-xs muted', text: LABELS[goal.category] || 'Goal' })),
                    edit),
                W.el('div', { className: 'goal-card-body' },
                    W.el('div', { className: 'progress-ring', style: `--value:${pct}`, role: 'img', 'aria-label': `${pct}% of target` }, W.el('span', { text: `${pct}%` })),
                    W.el('div', null,
                        W.el('p', { className: 'figure figure-md', 'data-private': '', text: money(goal.current_cents) }),
                        W.el('p', { className: 'text-sm muted', 'data-private': '', text: `of ${money(goal.target_cents)}` }),
                        W.el('p', { className: 'text-xs muted mt-2', 'data-private': done ? null : '', text: done ? 'Target reached' : `${money(goal.target_cents - goal.current_cents)} to go` }),
                        W.el('p', { className: 'text-xs muted mt-2', text: `Funding account · ${accountLabel}` }))),
                done
                    ? W.el('div', { className: 'goal-card-actions' }, W.el('p', { className: 'goal-done' }, W.icon('check-circle', 'icon-sm'), 'Target reached'), fund)
                    : W.el('div', { className: 'goal-card-actions' }, fund);
        }

        function render() {
            summary();
            if (!goals.length) {
                list.replaceChildren(W.el('div', { className: 'panel goal-empty' }, W.empty({ level: 2, iconName: 'target', title: 'Set your first goal', text: 'A trip, a home, a safety net — name it, set a target and track your progress.', action: { label: 'Create a goal', onClick: () => open() } })));
                return;
            }
            list.replaceChildren(...goals.map(card));
        }

        async function load() {
            list.replaceChildren(W.el('div', { className: 'panel' }, W.skeletonRows(3)));
            try {
                const [goalData, accountData] = await Promise.all([W.api('/api/goals'), W.api('/api/accounts')]);
                goals = goalData.goals;
                accounts = (accountData.accounts || []).filter(account => account.status === 'active' && account.purpose === 'personal' && account.currency === 'USD');
                render();
            } catch (err) {
                list.replaceChildren(W.el('div', { className: 'panel' }, W.empty({ level: 2, iconName: 'alert', title: 'Goals couldn’t load', text: err.message, error: true, action: { label: 'Try again', onClick: load } })));
            }
        }

        function open(goal) {
            form.reset();
            error.hidden = true;
            if (!accounts.length) {
                W.showToast('Open a personal USD checking or savings account before creating a goal.', 'warning');
                return;
            }
            const accountField = form.elements.accountId;
            accountField.replaceChildren(...accounts.map(account => W.el('option', {
                value: account.id,
                text: `${account.displayName} · ${account.availableBalanceFormatted} available`,
            })));
            form.elements.id.value = goal ? goal.id : '';
            doc.getElementById('goalDialogTitle').textContent = goal ? 'Edit goal' : 'New goal';
            remove.hidden = !goal;
            form.querySelector('[data-goal-categories]').hidden = Boolean(goal);
            form.elements.name.disabled = Boolean(goal);
            if (goal) {
                form.elements.name.value = goal.name;
                form.elements.targetAmount.value = (goal.target_cents / 100).toFixed(2);
                accountField.value = goal.account_id ? String(goal.account_id) : '';
            } else {
                form.elements.name.value = '';
                form.elements.targetAmount.value = '';
                accountField.value = String(accounts[0].id);
            }
            W.openDialog(dialog);
            (goal ? form.elements.accountId : form.elements.name).focus();
        }

        doc.querySelectorAll('[data-goal-new]').forEach(button => button.addEventListener('click', () => open()));
        form.addEventListener('submit', async event => {
            event.preventDefault();
            error.hidden = true;
            const id = form.elements.id.value;
            const clean = value => String(value || '').replace(/[,\s$]/g, '');
            const button = form.querySelector('[type="submit"]');
            button.classList.add('is-loading');
            try {
                if (id) {
                    await W.api(`/api/goals/${id}`, { method: 'PATCH', body: { accountId: form.elements.accountId.value, targetAmount: clean(form.elements.targetAmount.value) } });
                } else {
                    await W.api('/api/goals', { method: 'POST', body: { name: form.elements.name.value.trim(), category: form.querySelector('input[name="category"]:checked').value, accountId: form.elements.accountId.value, targetAmount: clean(form.elements.targetAmount.value) } });
                }
                W.closeDialog(dialog);
                W.showToast(id ? 'Goal updated.' : 'Goal created.', 'success');
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
            const ok = await W.showConfirm('This removes the goal and its recorded progress. Your accounts aren’t affected.', 'Delete goal?', { confirmLabel: 'Delete', danger: true });
            if (!ok) return;
            try {
                await W.api(`/api/goals/${id}`, { method: 'DELETE' });
                W.showToast('Goal deleted.', 'success');
                load();
            } catch (err) { W.showToast(err.message, 'error'); }
        });
        load();
    }

    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
    else init();
})(window);
