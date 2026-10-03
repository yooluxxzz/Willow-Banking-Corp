/* Willow debts — balances the customer records, payoff estimates and payments. */
'use strict';

(function (global) {
    const doc = global.document;
    const W = global.Willow;
    const ICONS = { credit_card: 'card', student_loan: 'graduation', mortgage: 'house', auto: 'map-pin', personal: 'banknote', medical: 'leaf', other: 'receipt' };

    function init() {
        const list = doc.getElementById('debtList');
        const dialog = doc.getElementById('debtDialog');
        const form = doc.getElementById('debtForm');
        const payDialog = doc.getElementById('paymentDialog');
        const payForm = doc.getElementById('paymentForm');
        if (!list || !form || !payForm || !W) return;
        const error = form.querySelector('[data-debt-error]');
        const payError = payForm.querySelector('[data-payment-error]');
        const remove = form.querySelector('[data-debt-delete]');
        let debts = [];
        let freshId = null;
        const money = cents => W.formatCents(cents, 'USD');
        const clean = value => String(value || '').replace(/[,\s$%]/g, '');
        const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

        function payoffText(debt) {
            if (debt.status !== 'open') return 'Paid off';
            if (!debt.minimumCents) return 'Add a minimum payment to see a payoff date';
            if (!debt.payoffPossible) return 'The minimum doesn’t cover the interest — this balance won’t shrink';
            const date = new Date();
            date.setMonth(date.getMonth() + debt.payoffMonths);
            const when = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(date);
            return `Paid off around ${when} at the minimum (${debt.payoffMonths} month${debt.payoffMonths === 1 ? '' : 's'}, ${money(debt.payoffInterestCents)} interest)`;
        }

        function summary() {
            const box = doc.querySelector('[data-debt-summary]');
            box.hidden = !debts.length;
            if (!debts.length) return;
            const open = debts.filter(debt => debt.status === 'open');
            box.querySelector('[data-summary-owed]').textContent = money(open.reduce((sum, debt) => sum + debt.balanceCents, 0));
            box.querySelector('[data-summary-count]').textContent = `${open.length} open debt${open.length === 1 ? '' : 's'}`;
            box.querySelector('[data-summary-minimum]').textContent = money(open.reduce((sum, debt) => sum + debt.minimumCents, 0));
            box.querySelector('[data-summary-interest]').textContent = money(open.reduce((sum, debt) => sum + debt.monthlyInterestCents, 0));
            box.querySelector('[data-summary-paid]').textContent = money(debts.reduce((sum, debt) => sum + debt.paidCents, 0));
        }

        function card(debt) {
            const edit = W.el('button', { type: 'button', className: 'btn btn-ghost btn-icon btn-sm', 'aria-label': `Edit ${debt.name}` }, W.icon('settings'));
            edit.addEventListener('click', () => open(debt));
            const pay = W.el('button', { type: 'button', className: 'btn btn-secondary btn-sm', text: 'Record a payment' });
            pay.addEventListener('click', () => openPayment(debt));
            const facts = [
                ['Interest rate', `${debt.apr}% APR`],
                ['Minimum', debt.minimumCents ? `${money(debt.minimumCents)} / month` : '—'],
                ['Next due', debt.nextDue ? W.formatDate(debt.nextDue) : '—'],
                ['Interest this month', money(debt.monthlyInterestCents)],
            ];
            const payments = debt.payments.length
                ? W.el('details', { className: 'debt-payments' }, W.el('summary', { text: `Payments (${debt.payments.length}${debt.payments.length === 12 ? '+' : ''})` }),
                    W.el('ul', { className: 'debt-payment-list', role: 'list' }, ...debt.payments.map(payment => W.el('li', null,
                        W.el('span', null, W.el('strong', { 'data-private': '', text: money(payment.amountCents) }), W.el('small', { className: 'muted', text: ` · ${payment.from}` })),
                        W.el('span', { className: 'text-xs muted', text: W.formatDate(payment.paidOn) })))))
                : null;
            return W.el('article', { className: `panel debt-card${debt.status === 'open' ? '' : ' is-done'}`, 'data-debt-id': debt.id },
                W.el('div', { className: 'debt-card-head' },
                    W.el('span', { className: 'icon-tile' }, W.icon(ICONS[debt.kind] || 'receipt')),
                    W.el('div', { className: 'debt-card-title' }, W.el('h2', { text: debt.name }), W.el('p', { className: 'text-xs muted', text: [debt.kindLabel, debt.lender].filter(Boolean).join(' · ') })),
                    edit),
                W.el('div', { className: 'debt-balance' },
                    W.el('span', { className: 'figure figure-md', 'data-private': '', text: money(debt.balanceCents) }),
                    W.el('span', { className: 'muted text-sm', 'data-private': '', text: debt.originalCents ? ` of ${money(debt.originalCents)}` : '' })),
                W.el('div', { className: 'progress is-positive', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(debt.progress)), 'aria-label': `${Math.round(debt.progress)}% paid off` }, W.el('span', { style: `--value:${debt.progress}%` })),
                W.el('p', { className: 'text-xs muted mt-2', text: `${Math.round(debt.progress)}% paid off` }),
                W.el('dl', { className: 'debt-facts' }, ...facts.map(([label, value]) => W.el('div', null, W.el('dt', { text: label }), W.el('dd', { 'data-private': '', text: value })))),
                W.el('p', { className: `debt-payoff${debt.status === 'open' && debt.minimumCents && !debt.payoffPossible ? ' is-warning' : ''}` }, W.icon(debt.status === 'open' ? 'calendar' : 'check-circle', 'icon-sm'), payoffText(debt)),
                debt.status === 'open' ? W.el('div', { className: 'cluster' }, pay) : null,
                payments);
        }

        function render() {
            summary();
            if (!debts.length) {
                list.replaceChildren(W.el('div', { className: 'panel' }, W.empty({ level: 2, iconName: 'scale', title: 'No debts recorded', text: 'Add a credit card, loan or mortgage to see what you owe in one place, when it could be paid off, and how it affects your net worth.', action: { label: 'Add a debt', onClick: () => open() } })));
                return;
            }
            list.replaceChildren(...debts.map(card));
            if (freshId) { W.highlight(list.querySelector(`[data-debt-id="${freshId}"]`), { scroll: true }); freshId = null; } else W.stagger(list);
        }

        async function load() {
            list.replaceChildren(W.el('div', { className: 'panel' }, W.skeletonRows(3)));
            try {
                debts = (await W.api('/api/debts')).debts;
                render();
            } catch (err) {
                list.replaceChildren(W.el('div', { className: 'panel' }, W.empty({ level: 2, iconName: 'alert', title: 'Debts couldn’t load', text: err.message, error: true, action: { label: 'Try again', onClick: load } })));
            }
        }

        function open(debt) {
            form.reset();
            error.hidden = true;
            form.elements.id.value = debt ? debt.id : '';
            doc.getElementById('debtDialogTitle').textContent = debt ? 'Edit debt' : 'Add a debt';
            remove.hidden = !debt;
            if (debt) {
                form.elements.name.value = debt.name;
                form.elements.kind.value = debt.kind;
                form.elements.lender.value = debt.lender;
                form.elements.balance.value = (debt.balanceCents / 100).toFixed(2);
                form.elements.original.value = (debt.originalCents / 100).toFixed(2);
                form.elements.rate.value = debt.apr;
                form.elements.minimum.value = debt.minimumCents ? (debt.minimumCents / 100).toFixed(2) : '';
                form.elements.dueDay.value = debt.dueDay || '';
            }
            W.openDialog(dialog);
            form.elements.name.focus();
        }

        function openPayment(debt) {
            payForm.reset();
            payError.hidden = true;
            payForm.elements.debtId.value = debt.id;
            payForm.elements.paidOn.value = today();
            payForm.elements.paidOn.max = today();
            payForm.querySelector('[data-payment-for]').textContent = `${debt.name} · ${money(debt.balanceCents)} owed`;
            const quick = payForm.querySelector('[data-payment-quick]');
            const options = [];
            if (debt.minimumCents && debt.minimumCents < debt.balanceCents) options.push(['Minimum', debt.minimumCents]);
            options.push(['Full balance', debt.balanceCents]);
            quick.replaceChildren(...options.map(([label, cents]) => {
                const chip = W.el('button', { type: 'button', className: 'chip chip-sm', text: `${label} · ${money(cents)}` });
                chip.addEventListener('click', () => { payForm.elements.amount.value = (cents / 100).toFixed(2); });
                return chip;
            }));
            W.openDialog(payDialog);
            payForm.elements.amount.focus();
        }

        doc.querySelectorAll('[data-debt-new]').forEach(button => button.addEventListener('click', () => open()));
        form.addEventListener('submit', async event => {
            event.preventDefault();
            error.hidden = true;
            const id = form.elements.id.value;
            const body = {
                name: form.elements.name.value.trim(),
                kind: form.elements.kind.value,
                lender: form.elements.lender.value.trim(),
                balance: clean(form.elements.balance.value),
                original: clean(form.elements.original.value),
                rate: clean(form.elements.rate.value) || '0',
                minimum: clean(form.elements.minimum.value) || '0',
                dueDay: form.elements.dueDay.value ? Number(form.elements.dueDay.value) : '',
            };
            const button = form.querySelector('[type="submit"]');
            button.classList.add('is-loading');
            try {
                const result = await W.api(id ? `/api/debts/${id}` : '/api/debts', { method: id ? 'PUT' : 'POST', body });
                freshId = result.debt.id;
                W.closeDialog(dialog);
                W.showToast(id ? 'Debt updated.' : 'Debt added.', 'success');
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
            const ok = await W.showConfirm('This removes the debt and its payment list from Willow. Payments already taken from your accounts stay in your account history.', 'Delete debt?', { confirmLabel: 'Delete', danger: true });
            if (!ok) return;
            try {
                await W.api(`/api/debts/${id}`, { method: 'DELETE' });
                W.showToast('Debt deleted.', 'success');
                load();
            } catch (err) { W.showToast(err.message, 'error'); }
        });
        payForm.addEventListener('submit', async event => {
            event.preventDefault();
            payError.hidden = true;
            const id = payForm.elements.debtId.value;
            const button = payForm.querySelector('[type="submit"]');
            button.classList.add('is-loading');
            try {
                const result = await W.api(`/api/debts/${id}/payments`, { method: 'POST', body: { amount: clean(payForm.elements.amount.value), accountId: payForm.elements.accountId.value || null, paidOn: payForm.elements.paidOn.value } });
                freshId = result.debt.id;
                W.closeDialog(payDialog);
                W.showToast(result.debt.status === 'open' ? 'Payment recorded.' : `${result.debt.name} is paid off.`, 'success');
                load();
            } catch (err) {
                payError.textContent = err.message;
                payError.hidden = false;
            } finally {
                button.classList.remove('is-loading');
            }
        });
        load();
    }

    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
    else init();
})(window);
