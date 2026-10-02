/* Willow — send money: recipient → amount → account → review → done. */
'use strict';

(function (global) {
    const doc = global.document;
    const W = global.Willow;
    const SYMBOLS = { USD: '$', EUR: '€', GBP: '£', ZAR: 'R', MZN: 'MT' };
    const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

    function initials(name) {
        return String(name || '?').trim().split(/\s+/).slice(0, 2).map(part => part.charAt(0).toUpperCase()).join('') || '?';
    }

    function init() {
        const root = doc.querySelector('[data-transfer-flow]');
        const form = doc.getElementById('transferForm');
        const dataNode = doc.getElementById('transferData');
        if (!root || !form || !dataNode) return;
        const data = JSON.parse(dataNode.textContent);
        const steps = W.flow(root, { labels: ['Recipient', 'Amount', 'From', 'Review', 'Done'] });
        const state = { mode: (data.preselect && data.preselect.mode) || 'someone', recipient: null, to: null, from: null, currency: 'USD', amount: 0 };
        const currencies = [...new Set(data.accounts.map(account => account.currency))];
        const pane = index => form.querySelector(`[data-flow-pane="${index}"]`);
        const nextButton = index => pane(index).querySelector('[data-next]');
        const amountInput = doc.getElementById('amount');
        const amountError = doc.getElementById('amountError');
        const emailInput = doc.getElementById('recipientEmail');
        const recipientError = doc.getElementById('recipientError');
        const match = form.querySelector('[data-payee-match]');
        const saveRow = form.querySelector('[data-save-payee-row]');
        let lookupToken = 0;
        let pending = false;

        const recipientLabel = () => (state.mode === 'own' ? state.to && state.to.name : state.recipient && state.recipient.name) || '';

        // ── Step 1: recipient ─────────────────────────────────────────
        function pick({ title, sub, end, avatar, iconName, selected, onSelect, disabled }) {
            const button = W.el('button', { type: 'button', className: 'pick', 'aria-pressed': String(Boolean(selected)), disabled: disabled || null },
                avatar ? W.el('span', { className: 'avatar', text: avatar }) : W.el('span', { className: 'icon-tile icon-tile-sm' }, W.icon(iconName || 'wallet')),
                W.el('span', { className: 'pick-main' }, W.el('strong', { text: title }), sub ? W.el('small', { text: sub }) : null),
                end ? W.el('span', { className: 'pick-end', 'data-private': '', text: end }) : null);
            button.addEventListener('click', () => onSelect(button));
            button.addEventListener('dblclick', () => { if (!nextButton(steps.index).disabled) nextButton(steps.index).click(); });
            return button;
        }

        function markSelected(list, button) {
            list.querySelectorAll('.pick').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
        }

        function renderPayees(filter = '') {
            const list = form.querySelector('[data-payee-list]');
            const query = filter.trim().toLowerCase();
            const items = data.payees.filter(payee => !query || payee.name.toLowerCase().includes(query) || payee.email.toLowerCase().includes(query));
            list.replaceChildren(...items.map(payee => pick({
                title: payee.name,
                sub: payee.lastPaid ? `Last paid ${W.relativeDay(payee.lastPaid)}` : payee.email,
                avatar: initials(payee.fullName || payee.name),
                selected: state.recipient && state.recipient.payeeId === payee.id,
                onSelect: button => {
                    state.recipient = { payeeId: payee.id, name: payee.name, fullName: payee.fullName, email: payee.email, initials: initials(payee.fullName || payee.name) };
                    markSelected(list, button);
                    clearNewRecipient();
                    updateRecipientNext();
                },
            })));
            if (query && !items.length) list.append(W.el('p', { className: 'muted text-sm', text: 'No saved payees match. Add a new recipient below.' }));
        }

        function renderOwn() {
            const list = form.querySelector('[data-own-list]');
            list.replaceChildren(...data.accounts.map(account => pick({
                title: account.name,
                sub: `${account.masked} · ${account.currency}`,
                end: account.balance,
                iconName: account.kind === 'savings' ? 'savings' : account.kind === 'business' ? 'briefcase' : account.kind === 'currency' ? 'globe' : 'wallet',
                selected: state.to && state.to.id === account.id,
                onSelect: button => { state.to = account; markSelected(list, button); updateRecipientNext(); },
            })));
        }

        function clearNewRecipient() {
            emailInput.value = '';
            match.hidden = true;
            saveRow.hidden = true;
            recipientError.hidden = true;
            emailInput.removeAttribute('aria-invalid');
        }

        function updateRecipientNext() {
            nextButton(0).disabled = state.mode === 'own' ? !state.to : !state.recipient;
        }

        function setMode(mode, { focus = false } = {}) {
            state.mode = mode;
            form.querySelectorAll('[data-mode]').forEach(tab => {
                const active = tab.dataset.mode === mode;
                tab.setAttribute('aria-selected', String(active));
                tab.tabIndex = active ? 0 : -1;
                if (active && focus) tab.focus();
            });
            form.querySelectorAll('[data-mode-panel]').forEach(panel => { panel.hidden = panel.dataset.modePanel !== mode; });
            updateRecipientNext();
        }

        form.querySelectorAll('[data-mode]').forEach(tab => {
            tab.addEventListener('click', () => setMode(tab.dataset.mode));
            tab.addEventListener('keydown', event => {
                if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                    event.preventDefault();
                    setMode(state.mode === 'own' ? 'someone' : 'own', { focus: true });
                }
            });
        });

        async function lookup() {
            const email = emailInput.value.trim();
            recipientError.hidden = true;
            match.hidden = true;
            saveRow.hidden = true;
            state.recipient = state.recipient && state.recipient.payeeId ? state.recipient : null;
            if (!EMAIL.test(email)) {
                recipientError.textContent = 'Enter a valid email address.';
                recipientError.hidden = false;
                emailInput.setAttribute('aria-invalid', 'true');
                updateRecipientNext();
                return;
            }
            const token = ++lookupToken;
            const button = form.querySelector('[data-lookup]');
            button.classList.add('is-loading');
            try {
                const result = await W.api(`/api/payees/lookup?email=${encodeURIComponent(email)}`);
                if (token !== lookupToken) return;
                if (!result.found) {
                    recipientError.textContent = result.self ? 'That’s your own email. To move money between your accounts, choose “My accounts”.' : 'We couldn’t find an active Willow customer with that email.';
                    recipientError.hidden = false;
                    emailInput.setAttribute('aria-invalid', 'true');
                } else {
                    emailInput.removeAttribute('aria-invalid');
                    form.querySelectorAll('[data-payee-list] .pick').forEach(item => item.setAttribute('aria-pressed', 'false'));
                    const existing = data.payees.find(payee => payee.email.toLowerCase() === email.toLowerCase());
                    state.recipient = { payeeId: existing ? existing.id : null, name: existing ? existing.name : result.name, fullName: result.name, email, initials: result.initials, isNew: !existing };
                    match.replaceChildren(W.el('span', { className: 'avatar', text: result.initials }),
                        W.el('div', null, W.el('strong', { text: result.name }), W.el('small', { className: 'muted block', text: 'Willow customer · name confirmed' })),
                        W.icon('check-circle', 'positive'));
                    match.hidden = false;
                    saveRow.hidden = Boolean(existing);
                }
            } catch (error) {
                recipientError.textContent = error.message;
                recipientError.hidden = false;
            } finally {
                button.classList.remove('is-loading');
                updateRecipientNext();
            }
        }

        form.querySelector('[data-lookup]').addEventListener('click', lookup);
        emailInput.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); lookup(); } });
        emailInput.addEventListener('input', () => {
            if (state.recipient && !state.recipient.payeeId) { state.recipient = null; match.hidden = true; saveRow.hidden = true; updateRecipientNext(); }
        });
        form.querySelectorAll('[data-suggest]').forEach(button => button.addEventListener('click', () => { emailInput.value = button.dataset.suggest; lookup(); }));
        const search = form.querySelector('[data-payee-search]');
        if (search) search.addEventListener('input', () => renderPayees(search.value));

        // ── Step 2: amount ────────────────────────────────────────────
        function syncCurrency() {
            form.querySelectorAll('[data-amount-symbol]').forEach(node => { node.textContent = SYMBOLS[state.currency] || state.currency; });
        }

        function chooseCurrency() {
            if (state.mode === 'own' && state.to) state.currency = state.to.currency;
            else if (state.from) state.currency = state.from.currency;
            else if (!currencies.includes(state.currency)) state.currency = currencies[0] || 'USD';
            syncCurrency();
            const holder = pane(1).querySelector('[data-currency-switch]');
            if (holder) holder.remove();
            const options = state.mode === 'own' ? [] : currencies;
            if (options.length > 1) {
                const select = W.el('select', { className: 'select select-sm', 'aria-label': 'Currency' }, options.map(code => W.el('option', { value: code, text: code, selected: code === state.currency || null })));
                select.addEventListener('change', () => { state.currency = select.value; state.from = null; syncCurrency(); });
                pane(1).querySelector('.amount-input').after(W.el('div', { className: 'currency-switch', 'data-currency-switch': '' }, W.el('span', { className: 'text-xs muted', text: 'Send in' }), select));
            }
        }

        function validateAmount() {
            const raw = amountInput.value.replace(/[,\s]/g, '');
            let message = '';
            if (!raw) message = 'Enter an amount.';
            else if (!/^\d+(\.\d{1,2})?$/.test(raw) || Number(raw) <= 0) message = 'Enter a positive amount with up to two decimal places.';
            amountInput.setAttribute('aria-invalid', String(Boolean(message)));
            amountError.textContent = message;
            amountError.hidden = !message;
            if (!message) state.amount = Number(raw);
            return !message;
        }

        form.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => { amountInput.value = button.dataset.preset; validateAmount(); amountInput.focus(); }));
        amountInput.addEventListener('input', () => { if (amountInput.getAttribute('aria-invalid') === 'true') validateAmount(); });

        // ── Step 3: source account ────────────────────────────────────
        function renderFrom() {
            const list = form.querySelector('[data-from-list]');
            const error = form.querySelector('[data-from-error]');
            const cents = Math.round(state.amount * 100);
            const options = data.accounts.filter(account => account.currency === state.currency && !(state.mode === 'own' && state.to && state.to.id === account.id));
            if (state.from && !options.some(account => account.id === state.from.id)) state.from = null;
            if (!state.from) {
                const preselected = options.find(account => account.id === data.preselect.from && account.available >= cents);
                state.from = preselected || options.find(account => account.available >= cents) || null;
            }
            list.replaceChildren(...options.map(account => {
                const short = account.available < cents;
                return pick({
                    title: account.name,
                    sub: short ? `${account.masked} · Not enough available` : `${account.masked} · ${account.currency}`,
                    end: account.balance,
                    iconName: account.kind === 'savings' ? 'savings' : account.kind === 'business' ? 'briefcase' : account.kind === 'currency' ? 'globe' : 'wallet',
                    selected: state.from && state.from.id === account.id,
                    disabled: short,
                    onSelect: button => { state.from = account; markSelected(list, button); nextButton(2).disabled = false; },
                });
            }));
            const anyAffordable = options.some(account => account.available >= cents);
            error.hidden = anyAffordable;
            if (!options.length) error.textContent = `You don’t have another ${state.currency} account to pay from.`;
            else if (!anyAffordable) error.replaceChildren(`None of your ${state.currency} accounts has ${W.formatMoney(state.amount, state.currency, { digits: 2 })} available. `, W.el('a', { className: 'text-link', href: '/deposits', text: 'Add money' }));
            nextButton(2).disabled = !state.from;
        }

        // ── Step 4: review ────────────────────────────────────────────
        function fillReview() {
            const name = recipientLabel();
            form.querySelector('[data-review-initials]').textContent = state.mode === 'own' ? '' : (state.recipient.initials || initials(name));
            form.querySelector('[data-review-initials]').hidden = state.mode === 'own';
            form.querySelector('[data-review-amount]').textContent = W.formatMoney(state.amount, state.currency, { digits: 2 });
            form.querySelector('[data-review-to]').textContent = state.mode === 'own' ? `To your ${name} account` : `To ${name}${state.recipient.email ? ` · ${state.recipient.email}` : ''}`;
            form.querySelector('[data-review-from]').textContent = `${state.from.name} · ${state.from.masked}`;
            form.querySelector('[data-review-note]').textContent = doc.getElementById('note').value.trim() || '—';
            form.querySelector('[data-confirm]').textContent = state.mode === 'own' ? 'Move money' : 'Send money';
            form.querySelector('[data-submit-error]').hidden = true;
        }

        // ── Navigation ────────────────────────────────────────────────
        form.querySelectorAll('[data-back]').forEach(button => button.addEventListener('click', () => steps.back()));
        nextButton(0).addEventListener('click', () => {
            if (nextButton(0).disabled) return;
            chooseCurrency();
            pane(1).querySelector('[data-amount-to]').textContent = state.mode === 'own' ? `Moving to ${recipientLabel()}` : `Sending to ${recipientLabel()}`;
            steps.show(1);
            amountInput.focus();
        });
        nextButton(1).addEventListener('click', () => {
            if (!validateAmount()) { amountInput.focus(); return; }
            renderFrom();
            steps.show(2);
        });
        nextButton(2).addEventListener('click', () => {
            if (!state.from) return;
            fillReview();
            steps.show(3);
        });
        form.addEventListener('keydown', event => {
            if (event.key !== 'Enter' || event.target.tagName !== 'INPUT' || event.target === emailInput) return;
            event.preventDefault();
            if (steps.index < 3) nextButton(steps.index).click();
        });

        form.addEventListener('submit', async event => {
            event.preventDefault();
            if (pending || steps.index !== 3) return;
            pending = true;
            const button = form.querySelector('[data-confirm]');
            const error = form.querySelector('[data-submit-error]');
            button.classList.add('is-loading');
            button.disabled = true;
            const body = { fromAccountId: state.from.id, amount: state.amount.toFixed(2), description: doc.getElementById('note').value.trim() };
            if (state.mode === 'own') body.toAccountId = state.to.id;
            else {
                body.recipientEmail = state.recipient.email;
                if (state.recipient.isNew) body.savePayee = doc.getElementById('savePayee').checked;
            }
            try {
                const result = await W.api('/api/transfers', { method: 'POST', body });
                const when = W.parseDate(result.createdAt) || new Date();
                form.querySelector('[data-done-title]').textContent = state.mode === 'own' ? 'Money moved' : 'Money sent';
                form.querySelector('[data-done-amount]').textContent = W.formatCents(result.amountCents, result.currency);
                form.querySelector('[data-done-to]').textContent = state.mode === 'own' ? `To ${recipientLabel()}` : `To ${result.recipientName || recipientLabel()}`;
                form.querySelector('[data-done-when]').textContent = `Today · ${W.formatDate(when, 'time')}`;
                form.querySelector('[data-done-from]').textContent = `${state.from.name} · ${state.from.masked}`;
                form.querySelector('[data-done-ref]').textContent = result.reference;
                state.from.available -= result.amountCents;
                steps.show(4);
            } catch (err) {
                error.textContent = err.message;
                error.hidden = false;
                error.focus();
            } finally {
                pending = false;
                button.classList.remove('is-loading');
                button.disabled = false;
            }
        });

        // ── Initial state ─────────────────────────────────────────────
        renderPayees();
        renderOwn();
        setMode(state.mode);
        const preset = data.preselect || {};
        if (preset.from) {
            const from = data.accounts.find(account => account.id === preset.from);
            if (from) { state.from = from; state.currency = from.currency; }
        }
        if (preset.payee) {
            const payee = data.payees.find(item => item.id === preset.payee);
            if (payee) {
                state.recipient = { payeeId: payee.id, name: payee.name, fullName: payee.fullName, email: payee.email, initials: initials(payee.fullName || payee.name) };
                renderPayees();
                updateRecipientNext();
                nextButton(0).click();
            }
        } else if (preset.to) {
            const to = data.accounts.find(account => account.id === preset.to);
            if (to) {
                setMode('own');
                state.to = to;
                renderOwn();
                updateRecipientNext();
                nextButton(0).click();
            }
        }
    }

    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
    else init();
})(window);
