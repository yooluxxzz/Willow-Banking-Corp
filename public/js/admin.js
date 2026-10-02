/* Willow admin overview — customers, audit log and balance adjustments. */
'use strict';

(function (global) {
    const doc = global.document;
    const W = global.Willow;
    const STATUS_TONE = { active: 'is-active', suspended: 'is-pending', deleted: 'is-failed' };

    async function loadStats() {
        try {
            const stats = await W.api('/api/admin/stats');
            doc.querySelectorAll('[data-stat]').forEach(node => {
                const value = stats[node.dataset.stat];
                node.textContent = typeof value === 'number' ? W.formatNumber(value, 0) : value;
            });
            const suspended = doc.querySelector('[data-stat-sub="suspendedAccounts"]');
            if (suspended) suspended.textContent = stats.suspendedAccounts ? `${stats.suspendedAccounts} suspended` : 'None suspended';
            const failed = doc.querySelector('[data-stat-sub="failedTransactions"]');
            if (failed) failed.textContent = `${stats.failedTransactions} failed`;
            const recent = doc.querySelector('[data-recent]');
            recent.replaceChildren(stats.recentTransactions.length
                ? W.el('ul', { className: 'list-plain', role: 'list' }, stats.recentTransactions.slice(0, 8).map(txn => W.el('li', { className: 'list-row' },
                    W.el('span', { className: 'list-row-main' }, W.el('span', { className: 'list-row-title', text: txn.full_name }), W.el('span', { className: 'list-row-sub', text: `${txn.type} · ${W.relativeDay(txn.created_at)} · ${txn.reference}` })),
                    W.el('span', { className: 'list-row-end' }, W.el('strong', { className: txn.direction === 'credit' ? 'positive' : '', text: `${txn.direction === 'credit' ? '+' : '−'}${W.formatCents(txn.amount, txn.currency || 'USD')}` })))))
                : W.el('p', { className: 'muted text-sm', text: 'No transactions yet.' }));
        } catch (error) {
            W.showToast(error.message, 'error');
        }
    }

    let usersPage = 1;
    async function loadUsers(page = 1) {
        usersPage = page;
        const box = doc.querySelector('[data-users]');
        const pages = doc.querySelector('[data-users-pages]');
        box.replaceChildren(W.skeletonRows(4));
        const params = new URLSearchParams({ page, limit: 12 });
        const search = doc.getElementById('userSearch').value.trim();
        const status = doc.getElementById('userStatus').value;
        if (search) params.set('search', search);
        if (status) params.set('status', status);
        try {
            const data = await W.api(`/api/admin/users?${params}`);
            if (!data.users.length) {
                box.replaceChildren(W.empty({ iconName: 'users', title: 'No customers found', text: search || status ? 'Try a different search.' : 'Customers appear here once they register.', compact: true }));
                pages.replaceChildren();
                return;
            }
            box.replaceChildren(W.el('div', { className: 'table-wrap' }, W.el('table', { className: 'table' },
                W.el('thead', null, W.el('tr', null, ['Customer', 'Customer ID', 'Joined', 'Status', ''].map(label => W.el('th', { scope: 'col', text: label })))),
                W.el('tbody', null, data.users.map(user => {
                    const open = W.el('button', { type: 'button', className: 'btn btn-secondary btn-sm', text: 'Manage', 'aria-label': `Manage ${user.full_name}` });
                    open.addEventListener('click', () => openUser(user.id));
                    return W.el('tr', null,
                        W.el('td', null, W.el('strong', { text: user.full_name }), W.el('small', { className: 'muted block', text: user.email })),
                        W.el('td', { className: 'mono', text: user.customer_id }),
                        W.el('td', { className: 'nowrap', text: W.formatDate(user.created_at) }),
                        W.el('td', null, W.el('span', { className: `status-pill ${STATUS_TONE[user.status] || ''}`, text: user.status })),
                        W.el('td', { className: 'text-right' }, open));
                })))));
            pages.replaceChildren();
            if (data.totalPages > 1) {
                const button = (label, target, disabled) => W.el('button', { type: 'button', text: label, disabled: disabled || null, onclick: () => loadUsers(target) });
                pages.append(button('Previous', page - 1, page <= 1), W.el('span', { className: 'muted text-sm', text: `Page ${page} of ${data.totalPages}` }), button('Next', page + 1, page >= data.totalPages));
            }
        } catch (error) {
            box.replaceChildren(W.empty({ iconName: 'alert', title: 'Customers couldn’t load', text: error.message, error: true, compact: true }));
        }
    }

    async function openUser(id) {
        const dialog = doc.getElementById('userDialog');
        const body = dialog.querySelector('[data-user-body]');
        body.replaceChildren(W.skeletonRows(4));
        W.openDialog(dialog);
        try {
            const data = await W.api(`/api/admin/users/${id}`);
            const user = data.user;
            doc.getElementById('userDialogTitle').textContent = user.full_name;
            const reason = W.el('textarea', { className: 'textarea', id: 'statusReason', rows: 2, maxlength: 200, placeholder: 'Reason (required to suspend or delete)' });
            const actions = W.el('div', { className: 'cluster' });
            const act = (label, status, deletionType, tone) => {
                const button = W.el('button', { type: 'button', className: `btn btn-sm ${tone || 'btn-secondary'}`, text: label });
                button.addEventListener('click', () => changeStatus(user, status, deletionType, reason.value.trim()));
                actions.append(button);
            };
            if (user.status === 'active') act('Suspend', 'suspended');
            if (user.status === 'suspended' && !user.scheduled_deletion_at) act('Reactivate', 'active', null, 'btn-primary');
            if (user.status !== 'deleted') { act('Delete after 3 days', 'deleted', 'scheduled'); act('Delete now', 'deleted', 'instant', 'btn-danger'); }
            body.replaceChildren(
                W.el('dl', { className: 'dl-rows' },
                    [['Email', user.email], ['Customer ID', user.customer_id], ['Phone', user.phone || '—'], ['Status', user.status + (user.scheduled_deletion_at ? ` · deletion on ${W.formatDate(user.scheduled_deletion_at)}` : '')], ['Reason', user.status_reason || '—'], ['Joined', W.formatDate(user.created_at)]]
                        .map(([label, value]) => W.el('div', null, W.el('dt', { text: label }), W.el('dd', { text: value })))),
                W.el('h3', { className: 'label mt-6 mb-2', text: 'Accounts' }),
                data.accounts.length ? W.el('ul', { className: 'list-plain', role: 'list' }, data.accounts.map(account => W.el('li', { className: 'list-row' },
                    W.el('span', { className: 'list-row-main' }, W.el('span', { className: 'list-row-title', text: account.nickname || `${account.account_type} account` }), W.el('span', { className: 'list-row-sub', text: `#${account.id} · ${account.account_number} · ${account.currency || 'USD'} · ${account.status}` })),
                    W.el('span', { className: 'list-row-end' }, W.el('strong', { text: W.formatCents(account.balance, account.currency || 'USD') }))))) : W.el('p', { className: 'muted text-sm', text: 'No accounts.' }),
                W.el('h3', { className: 'label mt-6 mb-2', text: 'Account status' }),
                reason,
                W.el('div', { className: 'mt-3' }, actions),
                W.el('p', { className: 'field-error mt-3', 'data-status-error': '', hidden: true }));
        } catch (error) {
            body.replaceChildren(W.empty({ iconName: 'alert', title: 'Couldn’t load this customer', text: error.message, error: true, compact: true }));
        }
    }

    async function changeStatus(user, status, deletionType, reason) {
        const error = doc.querySelector('[data-status-error]');
        if (status !== 'active' && !reason) { error.textContent = 'Enter a reason first.'; error.hidden = false; return; }
        const titles = { suspended: 'Suspend this customer?', active: 'Reactivate this customer?', deleted: deletionType === 'instant' ? 'Delete this customer now?' : 'Schedule deletion?' };
        const text = deletionType === 'instant' ? 'The profile is marked deleted now and can no longer sign in. Its records stay in the database for the audit trail.' : deletionType === 'scheduled' ? 'The profile is suspended now and marked deleted after a 3-day grace period. Records stay in the database for the audit trail.' : status === 'suspended' ? 'They’ll be signed out and unable to sign in.' : 'They’ll be able to sign in again.';
        const ok = await W.showConfirm(text, titles[status], { confirmLabel: 'Confirm', danger: status === 'deleted' });
        if (!ok) return;
        try {
            const body = { status, reason };
            if (deletionType) body.deletionType = deletionType;
            const result = await W.api(`/api/admin/users/${user.id}/status`, { method: 'POST', body });
            W.closeDialog(doc.getElementById('userDialog'));
            W.showToast(result.message || 'Customer updated.', 'success');
            loadUsers(usersPage);
            loadStats();
        } catch (err) {
            error.textContent = err.message;
            error.hidden = false;
        }
    }

    async function loadAudit() {
        const box = doc.querySelector('[data-audit]');
        const action = doc.getElementById('auditAction').value;
        box.replaceChildren(W.skeletonRows(4));
        try {
            const data = await W.api(`/api/admin/audit-log?limit=25${action ? `&action=${encodeURIComponent(action)}` : ''}`);
            const logs = data.logs || data.entries || [];
            box.replaceChildren(logs.length ? W.el('ol', { className: 'timeline', role: 'list' }, logs.map(log => W.el('li', null,
                W.el('span', { className: 'timeline-dot' }, W.icon('activity', 'icon-sm')),
                W.el('div', null, W.el('strong', { text: log.action.replace(/_/g, ' ') }), W.el('small', { text: `${log.actor_email || 'system'} · ${W.formatDate(log.created_at, 'datetime')}${log.target_type ? ` · ${log.target_type} ${log.target_id || ''}` : ''}` })))))
                : W.el('p', { className: 'muted text-sm', text: 'No audit entries for this filter.' }));
        } catch (error) {
            box.replaceChildren(W.empty({ iconName: 'alert', title: 'Audit log unavailable', text: error.message, error: true, compact: true }));
        }
    }

    function setupAdjust() {
        const form = doc.getElementById('adjustForm');
        const status = form.querySelector('[data-adjust-status]');
        form.addEventListener('submit', async event => {
            event.preventDefault();
            const body = Object.fromEntries(new FormData(form));
            body.amount = String(body.amount).trim();
            if (!body.accountId || !body.amount || !body.reason) { status.textContent = 'Fill in the account, amount and reason.'; status.className = 'form-status mt-3 is-error'; status.hidden = false; return; }
            const ok = await W.showConfirm(`${body.type === 'credit' ? 'Credit' : 'Debit'} ${body.amount} on account ${body.accountId}. This is recorded in the audit log and the customer is notified.`, 'Confirm balance adjustment', { confirmLabel: 'Adjust balance', danger: body.type === 'debit' });
            if (!ok) return;
            try {
                const result = await W.api('/api/admin/balance-adjustment', { method: 'POST', body });
                status.textContent = result.message || 'Balance adjusted.';
                status.className = 'form-status mt-3 is-success';
                form.reset();
                loadStats();
                loadAudit();
            } catch (error) {
                status.textContent = error.message;
                status.className = 'form-status mt-3 is-error';
            }
            status.hidden = false;
        });
    }

    function init() {
        if (!doc.querySelector('[data-admin-stats]')) return;
        loadStats();
        loadUsers();
        loadAudit();
        setupAdjust();
        let timer = null;
        doc.getElementById('userSearch').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => loadUsers(1), 300); });
        doc.getElementById('userStatus').addEventListener('change', () => loadUsers(1));
        doc.querySelector('[data-user-search]').addEventListener('submit', event => { event.preventDefault(); loadUsers(1); });
        doc.getElementById('auditAction').addEventListener('change', loadAudit);
    }

    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
    else init();
})(window);
