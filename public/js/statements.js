'use strict';
(() => {
    const form = document.getElementById('statementForm');
    const preset = document.getElementById('statementPreset');
    const status = document.getElementById('statementStatus');
    const result = document.getElementById('stmtResult');
    const download = document.getElementById('downloadStatement');
    let pending = false;
    function setDates() {
        if (preset.value === 'custom') return;
        const now = new Date(), y = now.getUTCFullYear(), m = now.getUTCMonth();
        const from = preset.value === 'year' ? new Date(Date.UTC(y,0,1)) : new Date(Date.UTC(y,m - (preset.value === 'previous' ? 1 : 0),1));
        const to = preset.value === 'previous' ? new Date(Date.UTC(y,m,0)) : now;
        form.elements.dateFrom.value = from.toISOString().slice(0,10); form.elements.dateTo.value = to.toISOString().slice(0,10);
    }
    function invalidate() { result.replaceChildren(); status.textContent = 'Filters changed. View or download a new statement.'; }
    preset.addEventListener('change', () => { setDates(); invalidate(); });
    for (const name of ['dateFrom','dateTo']) form.elements[name].addEventListener('change', () => { preset.value = 'custom'; invalidate(); });
    form.elements.accountId.addEventListener('change', invalidate);
    const element = (tag, text, className) => { const node = document.createElement(tag); node.textContent = text; if(className) node.className = className; return node; };
    function render(statement) {
        result.replaceChildren();
        const card = element('section','', 'card'), body = element('div','', 'card-body');
        body.append(element('h2', statement.account.displayName + ' · ' + statement.account.maskedNumber));
        body.append(element('p', statement.period.from + ' to ' + statement.period.to + ' (UTC)', 'text-muted mb-4'));
        const summary = element('div','', 'statement-summary');
        for (const [label, value] of [['Opening balance',statement.openingBalanceFormatted],['Money in',statement.totalCreditsFormatted],['Money out',statement.totalDebitsFormatted],['Closing balance',statement.closingBalanceFormatted]]) {
            const item = element('div',label); item.append(element('strong',value)); summary.append(item);
        }
        body.append(summary);
        if (!statement.transactions.length) body.append(element('p','No completed transactions in this period.'));
        else {
            const wrapper = element('div','', 'table-responsive'), table = document.createElement('table'); table.setAttribute('aria-label','Account statement');
            const head = document.createElement('thead'), row = document.createElement('tr');
            for (const title of ['Date','Reference','Description','Amount','Balance']) { const th = element('th',title); th.scope = 'col'; row.append(th); }
            head.append(row); table.append(head); const tbody = document.createElement('tbody');
            for (const txn of statement.transactions) {
                const row = document.createElement('tr');
                for (const text of [txn.created_at.slice(0,10), txn.reference, txn.description || txn.type, (txn.direction === 'credit' ? '+' : '−') + txn.amountFormatted, txn.runningBalanceFormatted]) row.append(element('td',text));
                tbody.append(row);
            }
            table.append(tbody); wrapper.append(table); body.append(wrapper);
        }
        card.append(body); result.append(card);
    }
    async function request(pdf) {
        if (pending || !form.reportValidity()) return;
        const params = new URLSearchParams(new FormData(form));
        const days = (Date.parse(params.get('dateTo')) - Date.parse(params.get('dateFrom'))) / 86400000;
        if (!Number.isFinite(days) || days < 0 || days > 365) { status.textContent = 'Choose a valid range of up to 366 days, with the start on or before the end.'; return; }
        pending = true; result.setAttribute('aria-busy','true');
        const controls = Array.from(form.querySelectorAll('input, select, button')); controls.forEach(node => node.disabled = true);
        status.textContent = pdf ? 'Preparing your PDF…' : 'Loading your statement…';
        try {
            const response = await fetch('/api/statements' + (pdf ? '/download' : '') + '?' + params, {headers:{Accept: pdf ? 'application/pdf, application/json' : 'application/json'}});
            if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || 'Could not prepare the statement. Please try again.'); }
            if (pdf) {
                if (!(response.headers.get('content-type') || '').includes('application/pdf')) throw new Error('The PDF was not returned. Please sign in again and retry.');
                const blob = await response.blob(), url = URL.createObjectURL(blob), link = document.createElement('a');
                link.href = url; link.download = 'willow-demo-statement-' + params.get('dateFrom') + '-' + params.get('dateTo') + '.pdf';
                document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
                status.textContent = 'PDF prepared. Check your browser downloads.';
            } else {
                const data = await response.json(); if (!data.statement) throw new Error(data.message || 'No statement returned.');
                render(data.statement); status.textContent = data.statement.transactions.length + ' completed transactions in this statement.';
            }
        } catch (err) { status.textContent = err.message || 'Connection failed. Please try again.'; }
        finally { pending = false; controls.forEach(node => node.disabled = false); result.setAttribute('aria-busy','false'); }
    }
    form.addEventListener('submit', event => { event.preventDefault(); request(false); });
    download.addEventListener('click', () => request(true));
    setDates();
})();
