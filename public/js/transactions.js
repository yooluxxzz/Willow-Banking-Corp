/* Willow transactions — filters, day-grouped list, pagination and CSV export. */
'use strict';

(function (global) {
    const doc = global.document;
    const W = global.Willow;
    const PAGE_SIZE = 20;

    function init() {
        const form = doc.getElementById('transactionFilters');
        if (!form) return;
        const results = doc.getElementById('txnResults');
        const status = doc.getElementById('transactionStatus');
        const pagination = doc.getElementById('transactionPagination');
        const summary = doc.querySelector('[data-txn-summary]');
        const exportButton = doc.querySelector('[data-export-csv]');
        const statementsLink = doc.querySelector('[data-statements-link]');
        const more = form.querySelector('[data-filter-more]');
        const countBadge = form.querySelector('[data-filter-count]');
        let controller = null;
        let lastPage = [];

        const initial = new URLSearchParams(global.location.search);
        ['type', 'status', 'dateFrom', 'dateTo', 'search', 'sort'].forEach(key => { if (initial.has(key)) form.elements[key].value = initial.get(key); });

        const accountName = () => {
            const option = form.elements.accountId.selectedOptions[0];
            return option ? option.textContent.split(' · ')[0] : '';
        };

        function updateFilterCount() {
            const count = ['type', 'status', 'dateFrom', 'dateTo'].filter(key => form.elements[key].value).length + (form.elements.sort.value === 'asc' ? 1 : 0);
            countBadge.hidden = !count;
            countBadge.textContent = String(count);
            if (count) more.open = true;
        }

        function renderList(transactions) {
            const list = W.el('ul', { className: 'txn-list', role: 'list' });
            let day = '';
            transactions.forEach(txn => {
                const label = W.relativeDay(txn.created_at);
                const key = String(txn.created_at).slice(0, 10);
                if (key !== day) {
                    day = key;
                    list.append(W.el('li', { className: 'txn-day', text: label === 'Today' || label === 'Yesterday' ? label : W.formatDate(txn.created_at) }));
                }
                list.append(W.txnRow(txn, { accountName: accountName(), time: true }));
            });
            return list;
        }

        function renderSummary(transactions) {
            if (!transactions.length) { summary.hidden = true; return; }
            const currency = transactions[0].currency || 'USD';
            const sum = direction => transactions.filter(txn => txn.direction === direction && txn.status === 'completed').reduce((total, txn) => total + txn.amount, 0);
            summary.replaceChildren(
                W.el('div', null, W.el('span', { className: 'label', text: 'In on this page' }), W.el('strong', { className: 'positive', 'data-private': '', text: `+${W.formatCents(sum('credit'), currency)}` })),
                W.el('div', null, W.el('span', { className: 'label', text: 'Out on this page' }), W.el('strong', { 'data-private': '', text: `−${W.formatCents(sum('debit'), currency)}` })));
            summary.hidden = false;
        }

        function renderPagination(data, load) {
            pagination.replaceChildren();
            if (data.totalPages <= 1) return;
            const button = (label, page, options = {}) => W.el('button', {
                type: 'button', text: label, disabled: options.disabled, 'aria-current': options.current ? 'page' : null,
                'aria-label': options.aria || null, onclick: () => { load(page); results.scrollIntoView({ block: 'start', behavior: W.prefersReducedMotion() ? 'auto' : 'smooth' }); },
            });
            pagination.append(button('Previous', data.page - 1, { disabled: data.page <= 1 }));
            const pages = new Set([1, data.totalPages, data.page - 1, data.page, data.page + 1].filter(page => page >= 1 && page <= data.totalPages));
            let previous = 0;
            [...pages].sort((a, b) => a - b).forEach(page => {
                if (page - previous > 1) pagination.append(W.el('span', { className: 'muted', text: '…' }));
                pagination.append(button(String(page), page, { current: page === data.page, aria: `Page ${page}` }));
                previous = page;
            });
            pagination.append(button('Next', data.page + 1, { disabled: data.page >= data.totalPages }));
        }

        async function load(page = 1) {
            if (controller) controller.abort = true;
            const request = { abort: false };
            controller = request;
            const params = new URLSearchParams();
            new FormData(form).forEach((value, key) => { if (value && !(key === 'sort' && value === 'desc')) params.set(key, value); });
            if (params.get('dateFrom') && params.get('dateTo') && params.get('dateFrom') > params.get('dateTo')) {
                status.textContent = 'Choose an end date on or after the start date.';
                return;
            }
            updateFilterCount();
            statementsLink.href = `/statements?accountId=${encodeURIComponent(form.elements.accountId.value)}`;
            const url = new URLSearchParams(params);
            if (page > 1) url.set('page', page);
            global.history.replaceState(null, '', `/transactions?${url}`);
            params.set('page', page);
            params.set('limit', PAGE_SIZE);
            results.setAttribute('aria-busy', 'true');
            results.replaceChildren(W.skeletonRows(6));
            status.textContent = 'Loading transactions…';
            try {
                const data = await W.api(`/api/transactions?${params}`);
                if (request.abort) return;
                lastPage = data.transactions;
                exportButton.disabled = !data.transactions.length;
                renderSummary(data.transactions);
                if (!data.transactions.length) {
                    const filtered = ['search', 'type', 'status', 'dateFrom', 'dateTo'].some(key => form.elements[key].value);
                    results.replaceChildren(W.empty({
                        iconName: filtered ? 'search' : 'activity',
                        title: filtered ? 'No matching transactions' : 'No transactions yet',
                        text: filtered ? 'Try different words or a wider date range.' : 'Activity on this account will appear here.',
                        action: filtered ? { label: 'Clear filters', primary: false, onClick: clear } : null,
                    }));
                    status.textContent = filtered ? 'No transactions match these filters.' : 'No transactions on this account yet.';
                    pagination.replaceChildren();
                    return;
                }
                results.replaceChildren(renderList(data.transactions));
                status.textContent = `${data.total} transaction${data.total === 1 ? '' : 's'} · page ${data.page} of ${data.totalPages}`;
                renderPagination(data, load);
            } catch (error) {
                if (request.abort) return;
                results.replaceChildren(W.empty({ iconName: 'alert', title: 'Transactions couldn’t load', text: error.message, error: true, action: { label: 'Try again', onClick: () => load(page) } }));
                status.textContent = error.message;
            } finally {
                if (controller === request) results.setAttribute('aria-busy', 'false');
            }
        }

        function clear() {
            const accountId = form.elements.accountId.value;
            form.reset();
            form.elements.accountId.value = accountId;
            more.open = false;
            load();
        }

        function exportCsv() {
            const rows = [['Date', 'Reference', 'Description', 'Counterparty', 'Category', 'Type', 'Status', 'Direction', 'Amount', 'Currency']];
            lastPage.forEach(txn => rows.push([txn.created_at, txn.reference, txn.description || '', txn.counterparty || '', txn.categoryLabel || '', txn.type, txn.status, txn.direction, (txn.amount / 100).toFixed(2), txn.currency || 'USD']));
            const csv = rows.map(row => row.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
            const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
            const link = W.el('a', { href: url, download: `willow-demo-transactions-${new Date().toISOString().slice(0, 10)}.csv` });
            doc.body.append(link);
            link.click();
            link.remove();
            global.setTimeout(() => URL.revokeObjectURL(url), 30000);
            W.showToast('CSV exported for the transactions on this page.', 'success');
        }

        let searchTimer = null;
        form.elements.search.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => load(), 350); });
        ['accountId', 'type', 'status', 'sort'].forEach(name => form.elements[name].addEventListener('change', () => load()));
        form.addEventListener('submit', event => { event.preventDefault(); load(); });
        doc.getElementById('clearTransactionFilters').addEventListener('click', clear);
        exportButton.addEventListener('click', exportCsv);
        load(Number(initial.get('page')) || 1);
    }

    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
    else init();
})(window);
