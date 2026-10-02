/* Willow loans — calculator tabs and saved estimates. */
'use strict';

(function (global) {
    const doc = global.document;
    const W = global.Willow;
    const KIND_LABELS = { personal: 'Personal loan', mortgage: 'Mortgage', business: 'Business loan', credit: 'Card payoff' };

    function setupTabs() {
        const tabs = Array.from(doc.querySelectorAll('[data-calc-tabs] [role="tab"]'));
        const select = tab => tabs.forEach(item => {
            const active = item === tab;
            item.setAttribute('aria-selected', String(active));
            item.tabIndex = active ? 0 : -1;
            doc.getElementById(item.getAttribute('aria-controls')).hidden = !active;
        });
        tabs.forEach((tab, index) => {
            tab.addEventListener('click', () => select(tab));
            tab.addEventListener('keydown', event => {
                const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
                if (!delta) return;
                event.preventDefault();
                const next = tabs[(index + delta + tabs.length) % tabs.length];
                next.focus();
                select(next);
            });
        });
        const hash = global.location.hash.slice(1);
        const initial = tabs.find(tab => tab.id === `tab-${hash}`);
        if (initial) select(initial);
    }

    function renderEstimates(estimates) {
        const box = doc.querySelector('[data-estimates]');
        if (!estimates.length) {
            box.replaceChildren(W.el('p', { className: 'muted text-sm', text: 'Save an estimate from any calculator to compare options here.' }));
            return;
        }
        box.replaceChildren(W.el('ul', { className: 'list-plain', role: 'list' }, estimates.map(item => {
            const remove = W.el('button', { type: 'button', className: 'btn btn-ghost btn-icon btn-sm', 'aria-label': `Remove ${item.label || KIND_LABELS[item.kind]}` }, W.icon('x'));
            remove.addEventListener('click', async () => {
                try {
                    const result = await W.api(`/api/loans/estimates/${item.id}`, { method: 'DELETE' });
                    renderEstimates(result.estimates);
                } catch (error) { W.showToast(error.message, 'error'); }
            });
            const detail = item.kind === 'credit'
                ? `${item.term_months} months to pay off · ${(item.annual_rate_bps / 100).toFixed(2)}% APR`
                : `${W.formatCents(item.principal_cents, 'USD', { digits: 0 })} · ${item.term_months} months · ${(item.annual_rate_bps / 100).toFixed(2)}%`;
            return W.el('li', { className: 'list-row' },
                W.el('span', { className: 'list-row-main' },
                    W.el('span', { className: 'list-row-title', text: item.label || KIND_LABELS[item.kind] || 'Estimate' }),
                    W.el('span', { className: 'list-row-sub', text: detail })),
                W.el('span', { className: 'list-row-end' }, W.el('strong', { 'data-private': '', text: `${W.formatCents(item.monthly_payment_cents)}/mo` }), W.el('small', { text: W.formatDate(item.created_at, 'short') })),
                remove);
        })), W.el('p', { className: 'text-xs muted mt-3', text: 'Estimates only — not offers, approvals or quotes.' }));
    }

    async function loadEstimates() {
        try {
            renderEstimates((await W.api('/api/loans/estimates')).estimates);
        } catch (error) {
            doc.querySelector('[data-estimates]').replaceChildren(W.el('p', { className: 'field-error', text: error.message }));
        }
    }

    function init() {
        setupTabs();
        loadEstimates();
        doc.addEventListener('willow:estimates', event => renderEstimates(event.detail || []));
    }

    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
    else init();
})(window);
