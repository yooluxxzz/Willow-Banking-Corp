/* Willow Home — charts and the investing teaser. */
'use strict';

(function (global) {
    const doc = global.document;
    const W = global.Willow;

    function readData() {
        const node = doc.getElementById('dashboardData');
        try { return node ? JSON.parse(node.textContent) : {}; } catch (error) { return {}; }
    }

    function renderCharts(data) {
        const charts = global.WillowCharts;
        const category = doc.querySelector('[data-category-chart]');
        if (charts && category && data.categories && data.categories.length) {
            charts.donut(category, data.categories, { size: 148, currency: 'USD', centerLabel: 'Spent', private: true, label: 'Spending by category this month' });
        }
        const cashflow = doc.querySelector('[data-cashflow-chart]');
        if (charts && cashflow && data.cashflow && data.cashflow.some(group => group.values.income || group.values.spending)) {
            charts.columns(cashflow, data.cashflow, {
                currency: 'USD',
                height: 200,
                private: true,
                label: 'Money in and out over six months',
                keys: [{ key: 'income', label: 'In', color: 'var(--chart-1)' }, { key: 'spending', label: 'Out', color: 'var(--chart-3)' }],
            });
        } else if (cashflow) {
            cashflow.replaceChildren(W.el('p', { className: 'muted text-sm', text: 'Your monthly history will build up here.' }));
        }
    }

    async function loadWealthTeaser() {
        const panel = doc.querySelector('[data-wealth-teaser]');
        if (!panel) return;
        const value = panel.querySelector('[data-wealth-value]');
        const sub = panel.querySelector('[data-wealth-sub]');
        try {
            const { valuation } = await W.api('/api/wealth/portfolio', { passive: true, timeout: 20000 });
            value.textContent = W.formatMoney(valuation.total, 'USD');
            if (!valuation.contributed && !valuation.total) {
                sub.replaceChildren('Nothing invested yet. ', W.el('a', { className: 'text-link', href: '/wealth', text: 'Add cash to start' }));
            } else if (valuation.pricing === 'none-held') {
                sub.textContent = 'All in cash so far. Explore markets to place your first order.';
            } else {
                const up = valuation.totalReturn >= 0;
                sub.replaceChildren(
                    W.el('span', { className: `delta ${up ? 'is-up' : 'is-down'}`, 'data-private': '', text: `${W.formatMoney(valuation.totalReturn, 'USD', { sign: true })} (${W.formatPercent(valuation.totalReturnPercent)})` }),
                    ' total return',
                    valuation.pricing !== 'live' ? ' · some prices unavailable' : '');
                try {
                    const perf = await W.api('/api/wealth/performance?range=1m', { passive: true, timeout: 20000 });
                    if (perf.points && perf.points.length > 2 && global.WillowCharts) {
                        global.WillowCharts.sparkline(panel.querySelector('[data-wealth-spark]'), perf.points.map(point => point.v), { height: 44 });
                    }
                } catch (error) { /* chart is optional */ }
            }
        } catch (error) {
            value.textContent = '—';
            sub.textContent = 'Market data temporarily unavailable.';
        }
    }

    function init() {
        renderCharts(readData());
        loadWealthTeaser();
    }

    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
    else init();
})(window);
