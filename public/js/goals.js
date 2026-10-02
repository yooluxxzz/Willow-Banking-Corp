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
            const quick = W.el('form', { className: 'goal-quick', 'aria-label': `Update progress for ${goal.name}` },
                W.el('label', { className: 'visually-hidden', for: `goalAdd${goal.id}`, text: 'Add to progress' }),
                W.el('div', { className: 'input-group has-prefix' }, W.el('span', { className: 'input-prefix', text: '$' }), W.el('input', { className: 'input input-sm num', id: `goalAdd${goal.id}`, inputmode: 'decimal', placeholder: 'Add amount' })),
                W.el('button', { type: 'submit', className: 'btn btn-secondary btn-sm', text: 'Add' }));
            quick.addEventListener('submit', async event => {
                event.preventDefault();
                const input = quick.querySelector('input');
                const value = Number(input.value.replace(/[,\s$]/g, ''));
                if (!Number.isFinite(value) || value <= 0) { input.setAttribute('aria-invalid', 'true'); input.focus(); return; }
                const next = Math.min(goal.target_cents, goal.current_cents + Math.round(value * 100));
                try {
                    const result = await W.api(`/api/goals/${goal.id}`, { method: 'PATCH', body: { currentAmount: (next / 100).toFixed(2) } });
                    Object.assign(goal, result.goal);
                    W.showToast(next >= goal.target_cents ? `“${goal.name}” reached its target.` : 'Progress updated.', 'success');
                    render();
                } catch (err) { W.showToast(err.message, 'error'); }
            });
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
                        W.el('p', { className: 'text-xs muted mt-2', text: done ? 'Target reached' : `${money(goal.target_cents - goal.current_cents)} to go` }))),
                done ? W.el('p', { className: 'goal-done' }, W.icon('check-circle', 'icon-sm'), 'Target reached') : quick);
        }

        function render() {
            summary();
            if (!goals.length) {
                list.replaceChildren(W.el('div', { className: 'panel goal-empty' }, W.empty({ iconName: 'target', title: 'Set your first goal', text: 'A trip, a home, a safety net — name it, set a target and track your progress.', action: { label: 'Create a goal', onClick: () => open() } })));
                return;
            }
            list.replaceChildren(...goals.map(card));
        }

        async function load() {
            list.replaceChildren(W.el('div', { className: 'panel' }, W.skeletonRows(3)));
            try {
                goals = (await W.api('/api/goals')).goals;
                render();
            } catch (err) {
                list.replaceChildren(W.el('div', { className: 'panel' }, W.empty({ iconName: 'alert', title: 'Goals couldn’t load', text: err.message, error: true, action: { label: 'Try again', onClick: load } })));
            }
        }

        function open(goal) {
            form.reset();
            error.hidden = true;
            form.elements.id.value = goal ? goal.id : '';
            doc.getElementById('goalDialogTitle').textContent = goal ? 'Edit goal' : 'New goal';
            remove.hidden = !goal;
            form.querySelector('[data-goal-categories]').hidden = Boolean(goal);
            form.elements.name.disabled = Boolean(goal);
            if (goal) {
                form.elements.name.value = goal.name;
                form.elements.targetAmount.value = (goal.target_cents / 100).toFixed(2);
                form.elements.currentAmount.value = (goal.current_cents / 100).toFixed(2);
            }
            W.openDialog(dialog);
            (goal ? form.elements.currentAmount : form.elements.name).focus();
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
                    await W.api(`/api/goals/${id}`, { method: 'PATCH', body: { targetAmount: clean(form.elements.targetAmount.value), currentAmount: clean(form.elements.currentAmount.value) || '0' } });
                } else {
                    await W.api('/api/goals', { method: 'POST', body: { name: form.elements.name.value.trim(), category: form.querySelector('input[name="category"]:checked').value, targetAmount: clean(form.elements.targetAmount.value), currentAmount: clean(form.elements.currentAmount.value) || '0' } });
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
