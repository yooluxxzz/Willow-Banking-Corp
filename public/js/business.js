/* Willow business — charts, invoices, team and business details. */
'use strict';

(function (global) {
    const doc = global.document;
    const W = global.Willow;

    function charts() {
        const node = doc.getElementById('businessData');
        if (!node || !global.WillowCharts) return;
        const data = JSON.parse(node.textContent);
        const chart = doc.querySelector('[data-business-chart]');
        if (chart) {
            if (data.months.some(month => month.values.revenue || month.values.expenses)) {
                global.WillowCharts.columns(chart, data.months, { currency: 'USD', height: 240, private: true, label: 'Business money in and out by month', keys: [{ key: 'revenue', label: 'In', color: 'var(--chart-1)' }, { key: 'expenses', label: 'Out', color: 'var(--chart-3)' }] });
            } else {
                chart.replaceChildren(W.empty({ iconName: 'chart', title: 'No activity yet', text: 'Money in and out of your business accounts will be charted here.', compact: true }));
            }
        }
        const categories = doc.querySelector('[data-business-categories]');
        if (categories && data.categories.length) global.WillowCharts.bars(categories, data.categories, { currency: 'USD' });
    }

    function formDialog(dialogId, formId, errorSelector, submit) {
        const dialog = doc.getElementById(dialogId);
        const form = doc.getElementById(formId);
        if (!dialog || !form) return null;
        const error = form.querySelector(errorSelector);
        form.addEventListener('submit', async event => {
            event.preventDefault();
            error.hidden = true;
            const button = form.querySelector('[type="submit"]');
            button.classList.add('is-loading');
            button.disabled = true;
            try {
                await submit(Object.fromEntries(new FormData(form)));
                W.closeDialog(dialog);
            } catch (err) {
                error.textContent = err.message;
                error.hidden = false;
            } finally {
                button.classList.remove('is-loading');
                button.disabled = false;
            }
        });
        return dialog;
    }

    function setupInvoices() {
        const dialog = formDialog('invoiceDialog', 'invoiceForm', '[data-invoice-error]', async body => {
            body.amount = String(body.amount || '').replace(/[,\s$]/g, '');
            await W.api('/api/business/invoices', { method: 'POST', body });
            W.showToast('Invoice created. It hasn’t been sent to anyone.', 'success');
            global.setTimeout(() => { global.location.href = '/business/invoices'; }, 500);
        });
        doc.querySelectorAll('[data-new-invoice]').forEach(button => button.addEventListener('click', () => { if (dialog) { W.openDialog(dialog); doc.getElementById('invCustomer').focus(); } }));
        doc.querySelectorAll('[data-invoice-pay]').forEach(button => button.addEventListener('click', async () => {
            const ok = await W.showConfirm(`A simulated payment for ${button.dataset.invoiceNumber} will be added to your business account. No real money moves.`, 'Mark invoice as paid?', { confirmLabel: 'Mark paid' });
            if (!ok) return;
            button.classList.add('is-loading');
            try {
                const result = await W.api(`/api/business/invoices/${button.dataset.invoicePay}/pay`, { method: 'POST', body: {} });
                W.showToast(result.message, 'success');
                global.setTimeout(() => global.location.reload(), 700);
            } catch (error) {
                W.showToast(error.message, 'error');
                button.classList.remove('is-loading');
            }
        }));
        doc.querySelectorAll('[data-invoice-void]').forEach(button => button.addEventListener('click', async () => {
            const ok = await W.showConfirm(`${button.dataset.invoiceNumber} will be marked void and can’t be paid.`, 'Void invoice?', { confirmLabel: 'Void invoice', danger: true });
            if (!ok) return;
            try {
                await W.api(`/api/business/invoices/${button.dataset.invoiceVoid}/void`, { method: 'POST', body: {} });
                global.location.reload();
            } catch (error) { W.showToast(error.message, 'error'); }
        }));
    }

    function setupTeam() {
        const form = doc.getElementById('inviteForm');
        if (form) {
            const error = form.querySelector('[data-invite-error]');
            form.addEventListener('submit', async event => {
                event.preventDefault();
                error.hidden = true;
                const button = form.querySelector('[type="submit"]');
                button.classList.add('is-loading');
                try {
                    const result = await W.api('/api/business/team', { method: 'POST', body: Object.fromEntries(new FormData(form)) });
                    W.showToast(result.message, 'success');
                    global.setTimeout(() => global.location.reload(), 700);
                } catch (err) {
                    error.textContent = err.message;
                    error.hidden = false;
                    button.classList.remove('is-loading');
                }
            });
        }
        doc.querySelectorAll('[data-member-remove]').forEach(button => button.addEventListener('click', async () => {
            const ok = await W.showConfirm(`${button.dataset.memberName}’s invitation will be removed.`, 'Remove team member?', { confirmLabel: 'Remove', danger: true });
            if (!ok) return;
            try {
                await W.api(`/api/business/team/${button.dataset.memberRemove}`, { method: 'DELETE' });
                global.location.reload();
            } catch (error) { W.showToast(error.message, 'error'); }
        }));
    }

    function setupProfile() {
        const dialog = formDialog('profileDialog', 'profileForm', '[data-profile-error]', async body => {
            const { profile } = await W.api('/api/business/profile', { method: 'PUT', body });
            doc.querySelector('[data-business-name]').textContent = profile.name;
            W.showToast('Business details saved.', 'success');
        });
        doc.querySelectorAll('[data-edit-profile]').forEach(button => button.addEventListener('click', () => { if (dialog) W.openDialog(dialog); }));
    }

    function init() {
        charts();
        setupInvoices();
        setupTeam();
        setupProfile();
    }

    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
    else init();
})(window);
