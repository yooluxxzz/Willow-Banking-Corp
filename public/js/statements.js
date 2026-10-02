/* Willow statements — preview and PDF download. */
'use strict';

(function (global) {
    const doc = global.document;
    const W = global.Willow;

    function init() {
        const form = doc.getElementById('statementForm');
        if (!form) return;
        const preset = doc.getElementById('statementPreset');
        const status = doc.getElementById('statementStatus');
        const result = doc.getElementById('stmtResult');
        const download = doc.getElementById('downloadStatement');
        let pending = false;
        const iso = date => date.toISOString().slice(0, 10);

        function setDates() {
            if (preset.value === 'custom') return;
            const now = new Date();
            const y = now.getUTCFullYear();
            const m = now.getUTCMonth();
            const ranges = {
                current: [new Date(Date.UTC(y, m, 1)), now],
                previous: [new Date(Date.UTC(y, m - 1, 1)), new Date(Date.UTC(y, m, 0))],
                quarter: [new Date(Date.UTC(y, m - 2, 1)), now],
                year: [new Date(Date.UTC(y, 0, 1)), now],
            };
            const [from, to] = ranges[preset.value];
            form.elements.dateFrom.value = iso(from);
            form.elements.dateTo.value = iso(to);
        }

        function render(statement) {
            const currency = statement.account.currency || 'USD';
            const rows = statement.transactions.slice().reverse();
            const table = rows.length ? W.el('div', { className: 'table-wrap' }, W.el('table', { className: 'table statement-table', 'aria-label': 'Statement transactions' },
                W.el('thead', null, W.el('tr', null, ['Date', 'Description', 'Reference', 'Amount', 'Balance'].map(label => W.el('th', { scope: 'col', text: label })))),
                W.el('tbody', null, rows.map(txn => W.el('tr', null,
                    W.el('td', { className: 'nowrap', text: W.formatDate(txn.created_at) }),
                    W.el('td', null, W.el('strong', { text: txn.counterparty || txn.description || txn.type }), txn.counterparty && txn.description ? W.el('small', { className: 'muted block', text: txn.description }) : null),
                    W.el('td', { className: 'mono muted', text: txn.reference }),
                    W.el('td', { className: `num right ${txn.direction === 'credit' ? 'positive' : ''}`, 'data-private': '', text: `${txn.direction === 'credit' ? '+' : '−'}${txn.amountFormatted}` }),
                    W.el('td', { className: 'num right', 'data-private': '', text: txn.runningBalanceFormatted }))))))
                : W.empty({ iconName: 'file', title: 'No completed transactions', text: 'Nothing moved in or out of this account during this period.', compact: true });
            result.replaceChildren(W.el('section', { className: 'panel statement-sheet' },
                W.el('div', { className: 'statement-head' },
                    W.el('div', null,
                        W.el('p', { className: 'label', text: 'Statement' }),
                        W.el('h2', { className: 'h4', text: statement.account.displayName }),
                        W.el('p', { className: 'text-sm muted', text: `${statement.account.productLabel} · ${statement.account.maskedNumber} · ${currency}` })),
                    W.el('div', { className: 'statement-period' },
                        W.el('p', { className: 'label', text: 'Period (UTC)' }),
                        W.el('p', { className: 'num', text: `${W.formatDate(statement.period.from)} – ${W.formatDate(statement.period.to)}` }))),
                W.el('div', { className: 'statement-summary' },
                    [['Opening balance', statement.openingBalanceFormatted, ''], ['Money in', statement.totalCreditsFormatted, 'positive'], ['Money out', statement.totalDebitsFormatted, ''], ['Closing balance', statement.closingBalanceFormatted, '']].map(([label, value, tone]) => W.el('div', null,
                        W.el('span', { className: 'label', text: label }),
                        W.el('strong', { className: `figure ${tone}`, 'data-private': '', text: value })))),
                table,
                W.el('p', { className: 'sim-note' }, W.icon('info', 'icon-sm'), 'Simulated statement from a fictional bank. Not valid for any official purpose.')));
        }

        async function request(pdf) {
            if (pending || !form.reportValidity()) return;
            const params = new URLSearchParams(new FormData(form));
            const days = (Date.parse(params.get('dateTo')) - Date.parse(params.get('dateFrom'))) / 86400000;
            if (!Number.isFinite(days) || days < 0 || days > 365) { status.textContent = 'Choose a range of up to 366 days, with the start on or before the end.'; return; }
            pending = true;
            result.setAttribute('aria-busy', 'true');
            const button = pdf ? download : form.querySelector('[type="submit"]');
            button.classList.add('is-loading');
            status.textContent = pdf ? 'Preparing your PDF…' : 'Loading your statement…';
            try {
                if (pdf) {
                    const response = await fetch(`/api/statements/download?${params}`, { headers: { Accept: 'application/pdf, application/json' }, credentials: 'same-origin' });
                    if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || 'Could not prepare the PDF. Please try again.'); }
                    if (!(response.headers.get('content-type') || '').includes('application/pdf')) throw new Error('The PDF wasn’t returned. Please sign in again and retry.');
                    const url = URL.createObjectURL(await response.blob());
                    const link = W.el('a', { href: url, download: `willow-demo-statement-${params.get('dateFrom')}-${params.get('dateTo')}.pdf` });
                    doc.body.append(link);
                    link.click();
                    link.remove();
                    global.setTimeout(() => URL.revokeObjectURL(url), 60000);
                    status.textContent = 'PDF ready — check your downloads.';
                    W.showToast('Statement PDF downloaded.', 'success');
                } else {
                    const data = await W.api(`/api/statements?${params}`);
                    if (!data.statement) throw new Error(data.message || 'No statement was returned.');
                    render(data.statement);
                    status.textContent = `${data.statement.transactions.length} completed transaction${data.statement.transactions.length === 1 ? '' : 's'} in this period.`;
                }
            } catch (error) {
                status.textContent = error.message;
                W.showToast(error.message, 'error');
            } finally {
                pending = false;
                button.classList.remove('is-loading');
                result.setAttribute('aria-busy', 'false');
            }
        }

        preset.addEventListener('change', () => { setDates(); request(false); });
        ['dateFrom', 'dateTo'].forEach(name => form.elements[name].addEventListener('change', () => { preset.value = 'custom'; }));
        form.elements.accountId.addEventListener('change', () => request(false));
        form.addEventListener('submit', event => { event.preventDefault(); request(false); });
        download.addEventListener('click', () => request(true));
        setDates();
        request(false);
    }

    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
    else init();
})(window);
