'use strict';
(() => {
    const form = document.getElementById('transactionFilters');
    const container = document.getElementById('txnTableContainer');
    const status = document.getElementById('transactionStatus');
    const pagination = document.getElementById('transactionPagination');
    let pending;
    const initial = new URLSearchParams(location.search);
    for (const key of ['type','status','dateFrom','dateTo','search','sort']) {
        if (initial.has(key)) form.elements[key].value = initial.get(key);
    }
    function node(tag, text, className) {
        const element = document.createElement(tag); element.textContent = text;
        if (className) element.className = className;
        return element;
    }
    async function load(page = 1) {
        if (pending) pending.abort();
        const request = new AbortController(); pending = request;
        container.replaceChildren(); pagination.replaceChildren();
        container.setAttribute('aria-busy', 'false');
        if (!form.elements.accountId.value) { status.textContent = 'No accounts available.'; return; }
        const params = new URLSearchParams(new FormData(form));
        if (params.get('dateFrom') && params.get('dateTo') && params.get('dateFrom') > params.get('dateTo')) { status.textContent = 'Choose an end date on or after the start date.'; return; }
        params.set('page', page); params.set('limit', '15');
        status.textContent = 'Loading transactions…'; container.setAttribute('aria-busy', 'true');
        try {
            const response = await fetch('/api/transactions?' + params, { headers: { Accept: 'application/json' }, signal: request.signal });
            const data = await response.json();
            if (request.signal.aborted) return;
            if (!response.ok) throw new Error(data.error || 'Could not load transactions.');
            const urlParams = new URLSearchParams(params); urlParams.delete('limit');
            for (const [key,value] of [...urlParams]) if (!value) urlParams.delete(key);
            history.replaceState(null, '', '/transactions?' + urlParams);
            if (!data.transactions.length) { status.textContent = 'No transactions match these filters. Try a different date range or clear the filters.'; return; }
            status.textContent = `${data.total} matching transactions · Page ${data.page} of ${data.totalPages}`;
            const wrapper = node('div', '', 'table-responsive');
            const table = document.createElement('table'); table.setAttribute('aria-label', 'Transaction history');
            const head = document.createElement('thead'), row = document.createElement('tr');
            for (const label of ['Date','Reference','Description','Type','Status','Amount']) { const th = node('th', label); th.scope = 'col'; row.append(th); }
            head.append(row); table.append(head);
            const body = document.createElement('tbody');
            for (const item of data.transactions) {
                const tr = document.createElement('tr');
                for (const value of [item.created_at.slice(0,10), item.reference, item.description || item.type, item.type, item.status]) tr.append(node('td', value));
                tr.append(node('td', (item.direction === 'credit' ? '+' : '−') + item.amountFormatted, item.direction === 'credit' ? 'amount-credit' : 'amount-debit'));
                body.append(tr);
            }
            table.append(body); wrapper.append(table); container.append(wrapper);
            if (data.totalPages > 1) {
                for (const [label, target, disabled] of [['Previous', data.page - 1, data.page <= 1], ['Next', data.page + 1, data.page >= data.totalPages]]) {
                    const button = node('button', label); button.type = 'button'; button.disabled = disabled; button.addEventListener('click', () => load(target)); pagination.append(button);
                }
            }
        } catch (error) { if (!request.signal.aborted) status.textContent = error.message || 'Connection failed. Please try again.'; }
        finally { if (pending === request) container.setAttribute('aria-busy', 'false'); }
    }
    form.addEventListener('submit', event => { event.preventDefault(); load(); });
    form.elements.accountId.addEventListener('change', () => load());
    document.getElementById('clearTransactionFilters').addEventListener('click', () => {
        const accountId = form.elements.accountId.value; form.reset(); form.elements.accountId.value = accountId; load();
    });
    load(initial.get('page') || 1);
})();
