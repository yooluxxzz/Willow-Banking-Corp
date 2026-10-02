'use strict';

document.addEventListener('DOMContentLoaded', () => {
    const csrf = document.querySelector('meta[name="csrf-token"]')?.content || '';
    const form = document.getElementById('scheduledForm');
    const review = document.getElementById('scheduleReview');
    const status = document.getElementById('scheduleStatus');
    const list = document.getElementById('scheduledRows');
    const money = cents => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(cents / 100);
    const element = (tag, content, className) => { const node = document.createElement(tag); node.textContent = content; if (className) node.className = className; return node; };

    async function request(url, options = {}) {
        const response = await fetch(url, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.method && options.method !== 'GET' ? { 'X-CSRF-Token': csrf } : {}), ...options.headers } });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Could not complete this request.');
        return result;
    }

    function accountName(select) {
        return select.selectedOptions[0]?.textContent?.trim() || 'Not selected';
    }

    function render(transfers) {
        list.replaceChildren();
        if (!transfers.length) { list.append(element('p', 'No scheduled demo transfers yet.', 'wealth-empty')); return; }
        transfers.forEach(transfer => {
            const row = document.createElement('article'); row.className = 'scheduled-row';
            const details = document.createElement('div'); details.className = 'scheduled-row-details';
            details.append(element('strong', transfer.description || 'Transfer between your accounts'));
            details.append(element('span', `${transfer.from_nickname || (transfer.from_type === 'savings' ? 'Savings' : 'Checking')} ·••••${transfer.from_last_four} → ${transfer.to_nickname || (transfer.to_type === 'savings' ? 'Savings' : 'Checking')} ·••••${transfer.to_last_four}`));
            details.append(element('small', `${new Date(transfer.scheduled_for).toLocaleDateString(undefined, { timeZone: 'UTC', dateStyle: 'medium' })} UTC · ${transfer.status}${transfer.result_message ? ` · ${transfer.result_message}` : ''}`));
            const amount = element('strong', money(transfer.amount), 'scheduled-row-amount');
            row.append(details, amount);
            if (transfer.status === 'pending') {
                const cancel = element('button', 'Cancel'); cancel.type = 'button'; cancel.className = 'scheduled-cancel'; cancel.setAttribute('aria-label', `Cancel scheduled transfer ${transfer.description || transfer.id}`);
                cancel.addEventListener('click', async () => {
                    cancel.disabled = true;
                    try { await request(`/api/scheduled-transfers/${transfer.id}`, { method: 'DELETE' }); status.textContent = 'Scheduled demo transfer cancelled.'; await load(); }
                    catch (error) { status.textContent = error.message; cancel.disabled = false; }
                });
                row.append(cancel);
            }
            list.append(row);
        });
    }

    async function load() {
        list.replaceChildren(element('p', 'Loading scheduled transfers…', 'wealth-loading'));
        try { render((await request('/api/scheduled-transfers')).transfers); }
        catch (error) { list.replaceChildren(element('p', error.message, 'wealth-error')); }
    }

    form.addEventListener('submit', event => {
        event.preventDefault();
        if (document.getElementById('scheduleFrom').value === document.getElementById('scheduleTo').value) {
            status.textContent = 'Choose two different accounts.'; return;
        }
        const data = Object.fromEntries(new FormData(form));
        document.getElementById('reviewScheduleFrom').textContent = accountName(document.getElementById('scheduleFrom'));
        document.getElementById('reviewScheduleTo').textContent = accountName(document.getElementById('scheduleTo'));
        document.getElementById('reviewScheduleAmount').textContent = money(Math.round(Number(data.amount) * 100));
        document.getElementById('reviewScheduleDate').textContent = `${data.scheduledDate} UTC`;
        review.hidden = false; form.hidden = true; review.focus(); status.textContent = '';
    });
    document.getElementById('editSchedule').addEventListener('click', () => { review.hidden = true; form.hidden = false; document.getElementById('scheduleFrom').focus(); });
    document.getElementById('confirmSchedule').addEventListener('click', async event => {
        const button = event.currentTarget; button.disabled = true; status.textContent = 'Saving your scheduled demo transfer…';
        try {
            const transfer = await request('/api/scheduled-transfers', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) });
            review.hidden = true; form.hidden = false; form.reset(); status.textContent = `Transfer scheduled for ${transfer.transfer.scheduled_for.slice(0, 10)} UTC. No funds have moved.`; await load();
        } catch (error) { status.textContent = error.message; }
        finally { button.disabled = false; }
    });
    document.getElementById('refreshSchedules').addEventListener('click', load);
    load();
});