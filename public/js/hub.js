/* Willow net worth — your accounts and investing plus the assets and debts you record. */
'use strict';

(function (global) {
    const doc = global.document;
    const W = global.Willow;
    const charts = () => global.WillowCharts;
    const ASSET_ICONS = { cash: 'banknote', property: 'house', vehicle: 'map-pin', investment: 'trend', retirement: 'leaf', business: 'briefcase', other: 'layers' };

    function legend(list, items, total, emptyText) {
        if (!items.length) {
            list.replaceChildren(W.el('li', { className: 'is-muted' }, W.el('i'), W.el('span', { className: 'hub-legend-label' }, W.el('strong', { text: emptyText })), W.el('span', { className: 'hub-legend-value' })));
            return;
        }
        list.replaceChildren(...items.map(item => W.el('li', null,
            W.el('i', { style: `background:${item.color}` }),
            W.el('span', { className: 'hub-legend-label' }, W.el('strong', { text: item.label })),
            W.el('span', { className: 'hub-legend-value' },
                W.el('strong', { 'data-private': '', text: W.formatCents(item.cents) }),
                W.el('small', { text: total ? `${Math.round(item.cents / total * 100)}%` : '0%' })))));
    }

    function donut(container, items, total, centerLabel, label) {
        if (!charts() || !items.length) { container.replaceChildren(); return; }
        charts().donut(container, items.map(item => ({ label: item.label, value: item.cents / 100, color: item.color })), { size: 168, legend: false, currency: 'USD', centerValue: W.formatCompact(total / 100, 'USD'), centerLabel, private: true, label });
    }

    function renderWorth(worth) {
        const net = doc.querySelector('[data-net-worth]');
        net.textContent = W.formatCents(worth.netCents);
        net.classList.toggle('negative', worth.netCents < 0);
        const parts = [];
        if (worth.pricing === 'unavailable' || worth.pricing === 'partial') parts.push('Some investments are shown at cost because market prices are unavailable.');
        if (!worth.assets.length && !worth.debts.length) parts.push('Add what you own outside Willow and any debts to complete the picture.');
        doc.querySelector('[data-net-note]').textContent = parts.join(' ') || 'Includes investing at the latest delayed prices.';
        const set = (selector, text, tone) => { const node = doc.querySelector(selector); node.textContent = text; node.classList.remove('positive', 'negative'); if (tone) node.classList.add(tone); };
        set('[data-stat-assets]', W.formatCents(worth.grossCents));
        set('[data-stat-debts]', W.formatCents(worth.debtsCents));
        if (worth.change30Cents === null) set('[data-stat-change]', 'Building…');
        else set('[data-stat-change]', W.formatCents(worth.change30Cents, 'USD', { sign: true }), worth.change30Cents > 0 ? 'positive' : worth.change30Cents < 0 ? 'negative' : '');
        set('[data-stat-ratio]', worth.debtToAssets === null ? '—' : `${worth.debtToAssets}%`);
        doc.querySelector('[data-fx-banner]').hidden = !worth.fxUnavailable;

        donut(doc.querySelector('[data-own-chart]'), worth.composition, worth.grossCents, 'You own', 'What you own');
        legend(doc.querySelector('[data-own-list]'), worth.composition, worth.grossCents, 'Nothing yet — add money or an asset');
        donut(doc.querySelector('[data-owe-chart]'), worth.liabilities, worth.debtsCents, 'You owe', 'What you owe');
        legend(doc.querySelector('[data-owe-list]'), worth.liabilities, worth.debtsCents, 'No debts recorded');

        const history = doc.querySelector('[data-history-chart]');
        if (charts() && worth.history.length >= 2) {
            charts().line(history, worth.history.map(point => ({ t: point.day, v: point.netCents / 100 })), { currency: 'USD', height: 220, tone: 'brand', label: 'Net worth over time' });
        } else {
            history.replaceChildren(W.empty({ iconName: 'chart', title: 'Your history starts today', text: 'Come back tomorrow to see the first change. Each day Willow runs, it records your net worth here.', compact: true }));
        }
    }

    function renderAssets(worth, open) {
        const box = doc.querySelector('[data-asset-list]');
        if (!worth.assets.length) {
            box.replaceChildren(W.empty({ iconName: 'house', title: 'No assets recorded', text: 'Property, a car, a pension or money in another bank — add them to see your full net worth.', compact: true, action: { label: 'Add an asset', primary: false, onClick: () => open() } }));
            return;
        }
        box.replaceChildren(W.el('ul', { className: 'list-plain', role: 'list' }, ...worth.assets.map(asset => {
            const button = W.el('button', { type: 'button', className: 'list-row list-row-button', 'data-asset-id': asset.id, 'aria-label': `Edit ${asset.name}` },
                W.el('span', { className: 'icon-tile icon-tile-sm' }, W.icon(ASSET_ICONS[asset.kind] || 'layers')),
                W.el('span', { className: 'list-row-main' }, W.el('span', { className: 'list-row-title', text: asset.name }), W.el('span', { className: 'list-row-sub', text: [asset.kindLabel, asset.note].filter(Boolean).join(' · ') })),
                W.el('span', { className: 'list-row-end' }, W.el('strong', { 'data-private': '', text: W.formatCents(asset.valueCents) }), W.el('small', { className: 'muted', text: `Updated ${W.formatDate(asset.updatedAt, 'short')}` })));
            button.addEventListener('click', () => open(asset));
            return W.el('li', null, button);
        })));
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
        if (charts() && groups.some(group => group.values.income || group.values.spending)) {
            charts().columns(chart, groups, { currency: 'USD', height: 240, label: 'Money in and out by month', keys: [{ key: 'income', label: 'In', color: 'var(--chart-1)' }, { key: 'spending', label: 'Out', color: 'var(--chart-3)' }] });
        } else {
            chart.replaceChildren(W.empty({ iconName: 'chart', title: 'No money movement yet', text: 'Add money to an account to start your monthly history.', compact: true, action: { label: 'Add money', primary: false, href: '/deposits' } }));
        }
    }

    function renderCategories(picture) {
        const box = doc.querySelector('[data-category-bars]');
        const categories = picture.summary.categories;
        if (!categories.length || !charts()) {
            box.replaceChildren(W.empty({ iconName: 'pie', title: 'No spending yet this month', text: 'Payments and withdrawals are grouped by category here.', compact: true }));
            return;
        }
        charts().bars(box, categories.map(item => ({ label: item.label, value: item.cents / 100, color: item.color })), { currency: 'USD' });
    }

    function renderInvestments(picture) {
        const box = doc.querySelector('[data-investments]');
        const valuation = picture.valuation;
        if (!valuation) {
            box.replaceChildren(W.empty({ iconName: 'chart', title: 'Market data temporarily unavailable.', text: 'Your portfolio will show here when prices are available again.', compact: true, error: true }));
            return;
        }
        if (!valuation.total && !valuation.contributed) {
            box.replaceChildren(W.el('p', { className: 'muted text-sm' }, 'You haven’t moved money into investing. ', W.el('a', { className: 'text-link', href: '/wealth', text: 'Start investing' })));
            return;
        }
        box.replaceChildren(W.el('dl', { className: 'dl-rows' },
            W.el('div', null, W.el('dt', { text: 'Value' }), W.el('dd', { 'data-private': '', text: W.formatMoney(valuation.total, 'USD', { digits: 2 }) })),
            W.el('div', null, W.el('dt', { text: 'Return' }), W.el('dd', { className: valuation.totalReturn >= 0 ? 'positive' : 'negative', 'data-private': '', text: `${W.formatMoney(valuation.totalReturn, 'USD', { digits: 2, sign: true })} (${W.formatPercent(valuation.totalReturnPercent)})` })),
            W.el('div', null, W.el('dt', { text: 'Uninvested cash' }), W.el('dd', { 'data-private': '', text: W.formatMoney(valuation.cash, 'USD', { digits: 2 }) }))));
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

    function setupAssetDialog(reload) {
        const dialog = doc.getElementById('assetDialog');
        const form = doc.getElementById('assetForm');
        const error = form.querySelector('[data-asset-error]');
        const remove = form.querySelector('[data-asset-delete]');
        const clean = value => String(value || '').replace(/[,\s$]/g, '');
        function open(asset) {
            form.reset();
            error.hidden = true;
            form.elements.id.value = asset ? asset.id : '';
            doc.getElementById('assetDialogTitle').textContent = asset ? 'Edit asset' : 'Add an asset';
            remove.hidden = !asset;
            if (asset) {
                form.elements.name.value = asset.name;
                form.elements.kind.value = asset.kind;
                form.elements.value.value = (asset.valueCents / 100).toFixed(2);
                form.elements.note.value = asset.note;
            }
            W.openDialog(dialog);
            (asset ? form.elements.value : form.elements.name).focus();
        }
        form.addEventListener('submit', async event => {
            event.preventDefault();
            error.hidden = true;
            const id = form.elements.id.value;
            const button = form.querySelector('[type="submit"]');
            button.classList.add('is-loading');
            try {
                const result = await W.api(id ? `/api/networth/assets/${id}` : '/api/networth/assets', { method: id ? 'PUT' : 'POST', body: { name: form.elements.name.value.trim(), kind: form.elements.kind.value, value: clean(form.elements.value.value), note: form.elements.note.value.trim() } });
                W.closeDialog(dialog);
                W.showToast(id ? 'Asset updated.' : 'Asset added.', 'success');
                await reload();
                W.highlight(doc.querySelector(`[data-asset-id="${result.asset.id}"]`), { scroll: true });
                W.highlight(doc.querySelector('[data-net-worth]'));
            } catch (err) {
                error.textContent = err.message;
                error.hidden = false;
            } finally {
                button.classList.remove('is-loading');
            }
        });
        remove.addEventListener('click', async () => {
            const id = form.elements.id.value;
            W.closeDialog(dialog);
            if (!await W.showConfirm('This removes the asset from your net worth. Nothing else changes.', 'Delete asset?', { confirmLabel: 'Delete', danger: true })) return;
            try {
                await W.api(`/api/networth/assets/${id}`, { method: 'DELETE' });
                W.showToast('Asset deleted.', 'success');
                await reload();
                W.highlight(doc.querySelector('[data-net-worth]'));
            } catch (err) { W.showToast(err.message, 'error'); }
        });
        doc.querySelectorAll('[data-asset-new]').forEach(button => button.addEventListener('click', () => open()));
        return open;
    }

    async function init() {
        if (!doc.querySelector('[data-hub-hero]') || !W) return;
        let openAsset = () => {};
        const loadWorth = async () => {
            const worth = await W.api('/api/networth', { timeout: 25000 });
            renderWorth(worth);
            renderAssets(worth, openAsset);
        };
        openAsset = setupAssetDialog(loadWorth);
        const [worthResult, pictureResult] = await Promise.allSettled([loadWorth(), W.api('/api/hub/picture', { timeout: 25000 })]);
        if (worthResult.status === 'rejected') {
            doc.querySelector('[data-net-worth]').textContent = '—';
            doc.querySelector('[data-net-note]').textContent = worthResult.reason.message;
            // Don't leave skeletons spinning: say what failed and offer a retry.
            const retry = { label: 'Try again', primary: false, onClick: () => global.location.reload() };
            doc.querySelector('[data-history-chart]').replaceChildren(W.empty({ iconName: 'alert', title: 'Net worth couldn’t load', text: worthResult.reason.message, compact: true, error: true, action: retry }));
            ['[data-own-list]', '[data-owe-list]', '[data-asset-list]'].forEach(selector => {
                const node = doc.querySelector(selector);
                if (node) node.replaceChildren(W.el('p', { className: 'muted text-sm', text: 'Unavailable right now.' }));
            });
        }
        if (pictureResult.status === 'fulfilled') {
            const picture = pictureResult.value;
            renderFlow(picture);
            renderCategories(picture);
            renderInvestments(picture);
            renderInsights(picture);
            renderGoals(picture);
        } else {
            ['[data-cashflow-chart]', '[data-category-bars]', '[data-investments]', '[data-insights]'].forEach(selector => {
                doc.querySelector(selector).replaceChildren(W.empty({ iconName: 'alert', title: 'Couldn’t load this section', text: 'Please refresh the page to try again.', compact: true, error: true }));
            });
        }
    }

    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
    else init();
})(window);
