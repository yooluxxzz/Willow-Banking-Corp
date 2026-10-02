/* Willow Hub — your financial picture. */
'use strict';

(function (global) {
    const doc = global.document;
    const W = global.Willow;

    function renderHero(picture) {
        const total = picture.netWorthCents;
        doc.querySelector('[data-net-worth]').textContent = W.formatCents(total);
        doc.querySelector('[data-net-note]').textContent = picture.valuation
            ? `Includes your simulated portfolio at ${picture.valuation.pricing === 'live' || picture.valuation.pricing === 'none-held' ? 'the latest delayed prices' : 'cost basis where prices are unavailable'}.`
            : 'Simulated portfolio shown at cost — market data temporarily unavailable.';
        const items = picture.composition.filter(item => item.cents > 0);
        if (global.WillowCharts && items.length) {
            global.WillowCharts.donut(doc.querySelector('[data-composition-chart]'), items.map(item => ({ label: item.label, value: item.cents / 100, color: item.color })), { size: 168, legend: false, currency: 'USD', centerValue: W.formatCompact(total / 100, 'USD'), centerLabel: 'Net worth', private: true, label: 'Net worth by type' });
        }
        doc.querySelector('[data-composition-list]').replaceChildren(...picture.composition.map(item => W.el('li', null,
            W.el('i', { style: `background:${item.color}` }),
            W.el('span', { className: 'hub-legend-label' }, W.el('strong', { text: item.label }), W.el('small', { text: item.note })),
            W.el('span', { className: 'hub-legend-value' },
                W.el('strong', { 'data-private': '', text: W.formatCents(item.cents) }),
                W.el('small', { text: total ? `${Math.round(item.cents / total * 100)}%` : '0%' })))),
        W.el('li', { className: 'is-muted' }, W.el('i'), W.el('span', { className: 'hub-legend-label' }, W.el('strong', { text: 'Credit & debt' }), W.el('small', { text: 'No credit accounts in the demo' })), W.el('span', { className: 'hub-legend-value' }, W.el('strong', { text: 'Not connected' }))));
        doc.querySelector('[data-fx-banner]').hidden = !picture.fxUnavailable;
    }

    function renderFlow(picture) {
        const month = picture.summary.month;
        const net = month.earnedCents - month.spendingCents;
        doc.querySelector('[data-month-stats]').replaceChildren(
            ...[['In this month', month.earnedCents, 'positive'], ['Out this month', month.spendingCents, ''], ['Net', net, net >= 0 ? 'positive' : 'negative']].map(([label, cents, tone]) => W.el('div', null,
                W.el('p', { className: 'label', text: label }),
                W.el('p', { className: `figure figure-md ${tone}`, 'data-private': '', text: label === 'Net' ? W.formatCents(cents, 'USD', { sign: true }) : W.formatCents(cents) }))));
        const chart = doc.querySelector('[data-cashflow-chart]');
        const groups = picture.cashflow.map(item => ({ label: item.label, values: { income: item.incomeCents / 100, spending: item.spendingCents / 100 } }));
        if (global.WillowCharts && groups.some(group => group.values.income || group.values.spending)) {
            global.WillowCharts.columns(chart, groups, { currency: 'USD', height: 240, label: 'Money in and out by month', keys: [{ key: 'income', label: 'In', color: 'var(--chart-1)' }, { key: 'spending', label: 'Out', color: 'var(--chart-3)' }] });
        } else {
            chart.replaceChildren(W.empty({ iconName: 'chart', title: 'No history yet', text: 'Your monthly money in and out will build up here.', compact: true }));
        }
    }

    function renderCategories(picture) {
        const box = doc.querySelector('[data-category-bars]');
        const categories = picture.summary.categories;
        if (!categories.length || !global.WillowCharts) {
            box.replaceChildren(W.empty({ iconName: 'pie', title: 'No spending yet this month', text: 'Card payments and purchases will be grouped by category here.', compact: true }));
            return;
        }
        global.WillowCharts.bars(box, categories.map(item => ({ label: item.label, value: item.cents / 100, color: item.color })), { currency: 'USD' });
    }

    function renderInvestments(picture) {
        const box = doc.querySelector('[data-investments]');
        const valuation = picture.valuation;
        if (!valuation) {
            box.replaceChildren(W.empty({ iconName: 'chart', title: 'Market data temporarily unavailable.', text: 'Your simulated portfolio will show here when prices are available again.', compact: true, error: true }));
            return;
        }
        const top = valuation.holdings.slice(0, 4);
        box.replaceChildren(
            W.el('div', { className: 'stat-row is-compact' },
                W.el('div', { className: 'stat-tile' }, W.el('span', { className: 'label', text: 'Portfolio value' }), W.el('span', { className: 'figure', 'data-private': '', text: W.formatMoney(valuation.total, 'USD', { digits: 2 }) })),
                W.el('div', { className: 'stat-tile' }, W.el('span', { className: 'label', text: 'Total return' }), W.el('span', { className: `figure ${valuation.totalReturn >= 0 ? 'positive' : 'negative'}`, 'data-private': '', text: W.formatMoney(valuation.totalReturn, 'USD', { digits: 2, sign: true }) }), W.el('small', { text: `${W.formatPercent(valuation.totalReturnPercent)} vs $100,000 start` })),
                W.el('div', { className: 'stat-tile' }, W.el('span', { className: 'label', text: 'Demo cash' }), W.el('span', { className: 'figure', 'data-private': '', text: W.formatMoney(valuation.cash, 'USD', { digits: 2 }) }))),
            top.length ? W.el('ul', { className: 'list-plain mt-4', role: 'list' }, top.map(holding => W.el('li', null, W.el('a', { className: 'list-row', href: holding.type === 'crypto' ? `/crypto/${encodeURIComponent(holding.symbol)}` : `/wealth/stocks/${encodeURIComponent(holding.symbol)}` },
                W.el('span', { className: 'asset-mark', text: holding.symbol.slice(0, 4) }),
                W.el('span', { className: 'list-row-main' }, W.el('span', { className: 'list-row-title', text: holding.name }), W.el('span', { className: 'list-row-sub', text: `${W.formatQuantity(holding.quantity)} · ${Math.round(holding.weight)}% of portfolio` })),
                W.el('span', { className: 'list-row-end' }, W.el('strong', { 'data-private': '', text: W.formatMoney(holding.marketValue, 'USD', { digits: 2 }) }), W.el('small', { className: holding.gain >= 0 ? 'positive' : 'negative', text: W.formatPercent(holding.gainPercent) })))))) : W.el('p', { className: 'muted text-sm mt-4', text: 'No holdings yet — your portfolio is all demo cash.' }));
    }

    function renderInsights(picture) {
        const box = doc.querySelector('[data-insights]');
        if (!picture.insights.length) { box.replaceChildren(W.el('p', { className: 'muted text-sm', text: 'Insights appear once you have some activity this month.' })); return; }
        box.replaceChildren(W.el('div', { className: 'insight-list' }, picture.insights.map(item => W.el('a', { className: 'insight', href: item.href },
            W.el('span', { className: `icon-tile icon-tile-sm${item.tone === 'positive' ? ' is-positive' : ''}` }, W.icon(item.icon)),
            W.el('div', null, W.el('p', { text: item.text }), W.el('small', { 'data-private': '', text: item.detail }))))));
    }

    function renderGoals(picture) {
        const box = doc.querySelector('[data-goals]');
        const goals = picture.summary.goals;
        if (!goals.length) { box.replaceChildren(W.el('p', { className: 'muted text-sm' }, 'No goals yet. ', W.el('a', { className: 'text-link', href: '/goals', text: 'Create one' }))); return; }
        box.replaceChildren(W.el('ul', { className: 'goal-mini-list', role: 'list' }, goals.slice(0, 4).map(goal => {
            const pct = Math.min(100, Math.round(goal.current_cents / goal.target_cents * 100));
            return W.el('li', null,
                W.el('div', { className: 'goal-mini-head' }, W.el('strong', { text: goal.name }), W.el('span', { className: 'num', text: `${pct}%` })),
                W.el('div', { className: 'progress is-accent', role: 'progressbar', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': `${goal.name} progress` }, W.el('span', { style: `--value:${pct}%` })));
        })));
    }

    async function init() {
        if (!doc.querySelector('[data-hub-hero]')) return;
        try {
            const picture = await W.api('/api/hub/picture', { timeout: 25000 });
            renderHero(picture);
            renderFlow(picture);
            renderCategories(picture);
            renderInvestments(picture);
            renderInsights(picture);
            renderGoals(picture);
        } catch (error) {
            doc.querySelector('[data-net-worth]').textContent = '—';
            doc.querySelector('[data-net-note]').textContent = error.message;
            ['[data-cashflow-chart]', '[data-category-bars]', '[data-investments]', '[data-insights]'].forEach(selector => {
                doc.querySelector(selector).replaceChildren(W.empty({ iconName: 'alert', title: 'Couldn’t load this section', text: 'Please refresh the page to try again.', compact: true, error: true }));
            });
        }
    }

    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
    else init();
})(window);
