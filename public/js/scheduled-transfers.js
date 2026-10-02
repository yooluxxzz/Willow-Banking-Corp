/* Willow scheduled transfers — list, schedule and cancel. */
'use strict';

(function (global) {
    const doc = global.document;
    const W = global.Willow;

    function init() {
        const upcoming = doc.getElementById('scheduledUpcoming');
        const history = doc.getElementById('scheduledHistory');
        const form = doc.getElementById('scheduledForm');
        const dialog = doc.getElementById('scheduleReview');
        if (!upcoming) return;
        let currencyById = new Map();
        if (form && form.elements.fromAccountId) {
            Array.from(form.elements.fromAccountId.options).forEach(option => currencyById.set(Number(option.value), option.dataset.currency));
        }
        const label = (nickname, type, lastFour) => `${nickname || (type === 'savings' ? 'Savings' : 'Checking')} ••${lastFour}`;
        const dateLabel = value => new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(value));

        function row(transfer) {
            const currency = currencyById.get(transfer.from_account_id) || 'USD';
            const pending = transfer.status === 'pending';
            const item = W.el('li', { className: 'list-row' },
                W.el('span', { className: 'icon-tile icon-tile-sm' }, W.icon(pending ? 'calendar' : transfer.status === 'completed' ? 'check-circle' : 'x-circle')),
                W.el('span', { className: 'list-row-main' },
                    W.el('span', { className: 'list-row-title', text: transfer.description || 'Transfer between your accounts' }),
                    W.el('span', { className: 'list-row-sub', text: `${label(transfer.from_nickname, transfer.from_type, transfer.from_last_four)} → ${label(transfer.to_nickname, transfer.to_type, transfer.to_last_four)} · ${dateLabel(transfer.scheduled_for)}` }),
                    transfer.result_message && !pending ? W.el('span', { className: 'list-row-sub', text: transfer.result_message }) : null),
                W.el('span', { className: 'list-row-end' },
                    W.el('strong', { 'data-private': '', text: W.formatCents(transfer.amount, currency) }),
                    W.el('small', null, W.el('span', { className: `status-pill is-${transfer.status}`, text: transfer.status }))));
            if (pending) {
                const cancel = W.el('button', { type: 'button', className: 'btn btn-ghost btn-sm', text: 'Cancel', 'aria-label': `Cancel ${transfer.description || 'scheduled transfer'}` });
                cancel.addEventListener('click', async () => {
                    const ok = await W.showConfirm('This scheduled transfer won’t run. Nothing has moved yet.', 'Cancel scheduled transfer?', { confirmLabel: 'Cancel transfer', cancelLabel: 'Keep it', danger: true });
                    if (!ok) return;
                    cancel.classList.add('is-loading');
                    try {
                        await W.api(`/api/scheduled-transfers/${transfer.id}`, { method: 'DELETE' });
                        W.showToast('Scheduled transfer cancelled.', 'success');
                        load();
                    } catch (error) {
                        W.showToast(error.message, 'error');
                        cancel.classList.remove('is-loading');
                    }
                });
                item.append(cancel);
            }
            return item;
        }

        async function load() {
            upcoming.replaceChildren(W.skeletonRows(2));
            try {
                const { transfers } = await W.api('/api/scheduled-transfers');
                const pending = transfers.filter(item => item.status === 'pending');
                const past = transfers.filter(item => item.status !== 'pending');
                upcoming.replaceChildren(pending.length
                    ? W.el('ul', { className: 'list-plain', role: 'list' }, pending.map(row))
                    : W.empty({ iconName: 'calendar', title: 'Nothing scheduled', text: 'Schedule a transfer for a future date using the form.', compact: true }));
                history.replaceChildren(past.length
                    ? W.el('ul', { className: 'list-plain', role: 'list' }, past.slice(0, 20).map(row))
                    : W.el('p', { className: 'muted text-sm', text: 'Completed, failed and cancelled transfers will appear here.' }));
            } catch (error) {
                upcoming.replaceChildren(W.empty({ iconName: 'alert', title: 'Couldn’t load scheduled transfers', text: error.message, error: true, compact: true, action: { label: 'Try again', onClick: load } }));
            }
        }

        doc.getElementById('refreshSchedules').addEventListener('click', load);

        if (form && form.elements.fromAccountId) {
            const error = doc.getElementById('scheduleError');
            const reviewError = doc.getElementById('scheduleReviewError');
            W.enableBackdropClose(dialog);
            const fail = message => { error.textContent = message; error.hidden = false; };
            form.addEventListener('submit', event => {
                event.preventDefault();
                error.hidden = true;
                const data = Object.fromEntries(new FormData(form));
                const from = form.elements.fromAccountId.selectedOptions[0];
                const to = form.elements.toAccountId.selectedOptions[0];
                if (data.fromAccountId === data.toAccountId) return fail('Choose two different accounts.');
                if (from.dataset.currency !== to.dataset.currency) return fail('Both accounts need the same currency. Use International to convert between currencies.');
                if (!/^\d+(\.\d{1,2})?$/.test(String(data.amount).trim()) || Number(data.amount) <= 0) return fail('Enter a positive amount with up to two decimal places.');
                if (!data.scheduledDate) return fail('Choose a date.');
                doc.getElementById('reviewScheduleAmount').textContent = W.formatMoney(Number(data.amount), from.dataset.currency, { digits: 2 });
                doc.getElementById('reviewScheduleFrom').textContent = from.textContent.split(' · ')[0];
                doc.getElementById('reviewScheduleTo').textContent = to.textContent.split(' · ')[0];
                doc.getElementById('reviewScheduleDate').textContent = `${dateLabel(`${data.scheduledDate}T00:00:00Z`)} (UTC)`;
                reviewError.hidden = true;
                W.openDialog(dialog);
            });
            doc.getElementById('editSchedule').addEventListener('click', () => { W.closeDialog(dialog); form.elements.amount.focus(); });
            doc.getElementById('confirmSchedule').addEventListener('click', async event => {
                const button = event.currentTarget;
                button.classList.add('is-loading');
                button.disabled = true;
                try {
                    const body = Object.fromEntries(new FormData(form));
                    body.amount = String(body.amount).trim();
                    await W.api('/api/scheduled-transfers', { method: 'POST', body });
                    W.closeDialog(dialog);
                    form.elements.amount.value = '';
                    form.elements.description.value = '';
                    W.showToast('Transfer scheduled. Nothing has moved yet.', 'success');
                    load();
                } catch (err) {
                    reviewError.textContent = err.message;
                    reviewError.hidden = false;
                } finally {
                    button.classList.remove('is-loading');
                    button.disabled = false;
                }
            });
        }
        load();
    }

    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
    else init();
})(window);
