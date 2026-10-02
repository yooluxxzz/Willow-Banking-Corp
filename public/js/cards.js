/* Willow cards — switching, freeze, controls, limits, settings and new cards. */
'use strict';

(function (global) {
    const doc = global.document;
    const W = global.Willow;
    const COPY = {
        frozen: ['Freeze card', 'Payments, withdrawals and online purchases will be declined until you unfreeze it. You can unfreeze any time.'],
        active: ['Unfreeze card', 'The card works again straight away. It still can’t make real payments — it’s a demo card.'],
        reported: ['Report lost or stolen', 'The card is blocked immediately and can’t be reactivated. You can create a replacement afterwards.'],
        replace: ['Replace card', 'This card is cancelled and a new demo card with a different number is created. Nothing is shipped.'],
    };

    function setupSwitcher() {
        const tabs = Array.from(doc.querySelectorAll('[data-card-tab]'));
        const select = tab => {
            tabs.forEach(item => {
                const active = item === tab;
                item.setAttribute('aria-selected', String(active));
                item.tabIndex = active ? 0 : -1;
                doc.getElementById(item.getAttribute('aria-controls')).hidden = !active;
            });
            const url = new URL(global.location.href);
            url.searchParams.set('card', tab.dataset.cardTab);
            url.searchParams.delete('notice');
            global.history.replaceState(null, '', url);
            loadActivity(tab.dataset.cardTab);
        };
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
        const current = tabs.find(tab => tab.getAttribute('aria-selected') === 'true');
        if (current) loadActivity(current.dataset.cardTab);
    }

    const loaded = new Set();
    async function loadActivity(cardId) {
        const box = doc.querySelector(`[data-card-activity="${cardId}"]`);
        if (!box || loaded.has(cardId)) return;
        loaded.add(cardId);
        box.replaceChildren(W.skeletonRows(3));
        try {
            const { transactions } = await W.api(`/api/cards/${cardId}/activity`);
            if (!transactions.length) {
                box.replaceChildren(W.empty({ iconName: 'card', title: 'No card payments yet', text: 'Purchases made with this card will show here.', compact: true }));
                return;
            }
            const currency = doc.querySelector(`[data-card-panel="${cardId}"]`).dataset.currency;
            box.replaceChildren(W.el('ul', { className: 'txn-list', role: 'list' }, transactions.map(txn => W.txnRow({ ...txn, amountFormatted: W.formatCents(txn.amount, txn.currency || currency) }))));
        } catch (error) {
            loaded.delete(cardId);
            box.replaceChildren(W.empty({ iconName: 'alert', title: 'Activity couldn’t load', text: error.message, error: true, compact: true }));
        }
    }

    function setupActions() {
        const dialog = doc.getElementById('cardReview');
        const confirm = doc.getElementById('confirmCardAction');
        const cancel = doc.getElementById('cancelCardAction');
        const error = doc.getElementById('cardActionError');
        if (!dialog) return;
        W.enableBackdropClose(dialog);
        let selected = null;
        let pending = false;
        doc.querySelectorAll('[data-card-action]').forEach(button => button.addEventListener('click', () => {
            selected = button.dataset;
            const [title, text] = COPY[selected.cardAction];
            doc.getElementById('cardReviewTitle').textContent = `${title} •••• ${selected.lastFour}?`;
            doc.getElementById('cardReviewDescription').textContent = text;
            confirm.textContent = title;
            confirm.className = `btn ${selected.cardAction === 'reported' ? 'btn-danger' : 'btn-primary'}`;
            error.hidden = true;
            W.openDialog(dialog);
            cancel.focus();
        }));
        cancel.addEventListener('click', () => W.closeDialog(dialog));
        dialog.addEventListener('cancel', event => { if (pending) event.preventDefault(); });
        confirm.addEventListener('click', async () => {
            if (pending || !selected) return;
            pending = true;
            confirm.classList.add('is-loading');
            confirm.disabled = true;
            cancel.disabled = true;
            try {
                const replacing = selected.cardAction === 'replace';
                const result = await W.api(`/api/cards/${selected.cardId}/${replacing ? 'replace' : 'status'}`, { method: 'POST', body: replacing ? {} : { status: selected.cardAction } });
                if (selected.cardAction === 'frozen' || selected.cardAction === 'active') {
                    applyFreeze(selected.cardId, selected.cardAction === 'frozen');
                    W.closeDialog(dialog);
                    W.showToast(result.message || 'Card updated.', 'success');
                } else {
                    const target = replacing && result.card ? result.card.id : '';
                    global.location.href = `/cards?notice=${replacing ? 'replaced' : 'reported'}${target ? `&card=${target}` : ''}`;
                }
            } catch (err) {
                error.textContent = err.message;
                error.hidden = false;
            } finally {
                pending = false;
                confirm.classList.remove('is-loading');
                confirm.disabled = false;
                cancel.disabled = false;
            }
        });
    }

    function applyFreeze(cardId, frozen) {
        const panel = doc.querySelector(`[data-card-panel="${cardId}"]`);
        const tab = doc.querySelector(`[data-card-tab="${cardId}"]`);
        if (!panel) return;
        panel.dataset.cardStatus = frozen ? 'frozen' : 'active';
        panel.querySelectorAll('.bank-card').forEach(card => card.classList.toggle('is-frozen', frozen));
        if (tab) {
            tab.querySelectorAll('.bank-card').forEach(card => card.classList.toggle('is-frozen', frozen));
            const small = tab.querySelector('.card-switch-label small');
            if (small) small.textContent = small.textContent.replace(/ · Frozen$/, '') + (frozen ? ' · Frozen' : '');
        }
        const button = panel.querySelector('[data-card-action="frozen"], [data-card-action="active"]');
        button.dataset.cardAction = frozen ? 'active' : 'frozen';
        button.setAttribute('aria-pressed', String(frozen));
        button.classList.toggle('is-on', frozen);
        button.querySelector('[data-freeze-label]').textContent = frozen ? 'Unfreeze' : 'Freeze';
    }

    function setupFreezeAll() {
        const button = doc.querySelector('[data-freeze-all]');
        if (!button) return;
        button.addEventListener('click', async () => {
            const ok = await W.showConfirm('Every active card will be frozen straight away. You can unfreeze them one by one.', 'Freeze all cards?', { confirmLabel: 'Freeze all' });
            if (!ok) return;
            button.classList.add('is-loading');
            try {
                const result = await W.api('/api/security/cards/freeze-all', { method: 'POST', body: {} });
                doc.querySelectorAll('[data-card-panel]').forEach(panel => applyFreeze(panel.dataset.cardPanel, true));
                W.showToast(result.frozen ? `${result.frozen} card${result.frozen === 1 ? '' : 's'} frozen.` : 'All cards were already frozen.', 'success');
            } catch (error) {
                W.showToast(error.message, 'error');
            } finally {
                button.classList.remove('is-loading');
            }
        });
    }

    function setupControls() {
        doc.querySelectorAll('[data-control]').forEach(input => input.addEventListener('change', async () => {
            const panel = input.closest('[data-card-panel]');
            const status = panel.querySelector('[data-controls-status]');
            const key = input.dataset.control;
            const body = { [`${key}Enabled`]: input.checked };
            input.disabled = true;
            status.textContent = 'Saving…';
            try {
                await W.api(`/api/cards/${input.dataset.cardId}`, { method: 'PATCH', body });
                status.textContent = 'Saved';
                global.setTimeout(() => { if (status.textContent === 'Saved') status.textContent = ''; }, 1800);
            } catch (error) {
                input.checked = !input.checked;
                status.textContent = '';
                W.showToast(error.message, 'error');
            } finally {
                input.disabled = false;
            }
        }));
    }

    function setupLimits() {
        doc.querySelectorAll('[data-limit-range]').forEach(range => {
            const panel = range.closest('[data-card-panel]');
            const value = panel.querySelector('[data-limit-value]');
            const save = panel.querySelector('[data-limit-save]');
            const currency = panel.dataset.currency;
            const initial = range.value;
            range.addEventListener('input', () => {
                value.textContent = W.formatMoney(Number(range.value), currency, { digits: 0 });
                save.disabled = range.value === range.dataset.saved || (range.dataset.saved === undefined && range.value === initial);
            });
            save.addEventListener('click', async () => {
                save.classList.add('is-loading');
                try {
                    const result = await W.api(`/api/cards/${range.dataset.cardId}`, { method: 'PATCH', body: { dailyLimit: Number(range.value) * 100 } });
                    range.dataset.saved = range.value;
                    value.textContent = result.card.dailyLimitFormatted;
                    save.disabled = true;
                    W.showToast(`Daily limit set to ${result.card.dailyLimitFormatted}.`, 'success');
                } catch (error) {
                    W.showToast(error.message, 'error');
                } finally {
                    save.classList.remove('is-loading');
                }
            });
        });
    }

    function setupSettings() {
        doc.querySelectorAll('[data-card-settings]').forEach(form => {
            const cardId = form.dataset.cardSettings;
            const panel = form.closest('[data-card-panel]');
            const designClass = { forest: '', sage: 'is-sage', copper: 'is-copper', ivory: 'is-virtual', graphite: 'is-business' };
            const preview = design => {
                doc.querySelectorAll(`[data-card-panel="${cardId}"] .bank-card, [data-card-tab="${cardId}"] .bank-card`).forEach(card => {
                    Object.values(designClass).filter(Boolean).forEach(cls => card.classList.remove(cls));
                    if (designClass[design]) card.classList.add(designClass[design]);
                });
            };
            form.querySelectorAll('input[name="design"]').forEach(input => input.addEventListener('change', () => preview(input.value)));
            form.addEventListener('submit', async event => {
                event.preventDefault();
                const status = form.querySelector('[data-settings-status]');
                const button = form.querySelector('[type="submit"]');
                const design = form.querySelector('input[name="design"]:checked');
                button.classList.add('is-loading');
                status.textContent = '';
                try {
                    const { card } = await W.api(`/api/cards/${cardId}`, { method: 'PATCH', body: { nickname: form.elements.nickname.value, design: design ? design.value : undefined } });
                    status.className = 'form-status is-success';
                    status.textContent = 'Saved.';
                    doc.querySelectorAll(`[data-card-tab="${cardId}"] .card-switch-label strong`).forEach(node => { node.textContent = card.displayName; });
                    panel.querySelectorAll('.bank-card-meta strong').forEach(node => { node.textContent = card.holder || card.displayName; });
                } catch (error) {
                    status.className = 'form-status is-error';
                    status.textContent = error.message;
                } finally {
                    button.classList.remove('is-loading');
                }
            });
        });
    }

    function setupReveal() {
        doc.querySelectorAll('[data-reveal-card]').forEach(button => button.addEventListener('click', () => {
            const panel = button.closest('[data-card-panel]');
            const details = panel.querySelector('[data-card-details]');
            const show = details.hidden;
            details.hidden = !show;
            button.setAttribute('aria-pressed', String(show));
            button.classList.toggle('is-on', show);
        }));
    }

    function setupNewCard() {
        const dialog = doc.getElementById('newCardDialog');
        const form = doc.getElementById('newCardForm');
        if (!dialog || !form) return;
        doc.querySelectorAll('[data-new-card]').forEach(button => button.addEventListener('click', () => { W.openDialog(dialog); }));
        form.addEventListener('submit', async event => {
            event.preventDefault();
            const error = form.querySelector('[data-new-card-error]');
            const button = form.querySelector('[type="submit"]');
            error.hidden = true;
            button.classList.add('is-loading');
            button.disabled = true;
            try {
                const formType = form.querySelector('input[name="form"]:checked').value;
                const { card } = await W.api('/api/cards', { method: 'POST', body: { accountId: Number(form.elements.accountId.value), form: formType, nickname: form.elements.nickname.value.trim() } });
                global.location.href = `/cards?card=${card.id}`;
            } catch (err) {
                error.textContent = err.message;
                error.hidden = false;
                button.classList.remove('is-loading');
                button.disabled = false;
            }
        });
    }

    function init() {
        setupSwitcher();
        setupActions();
        setupFreezeAll();
        setupControls();
        setupLimits();
        setupSettings();
        setupReveal();
        setupNewCard();
    }

    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
    else init();
})(window);
