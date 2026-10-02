/* Willow Wealth — crypto overview and demo wallet (/crypto). */
'use strict';

(function (global) {
    const doc = global.document;
    const W = global.Willow;
    const WW = global.WillowWealth;
    const root = doc.querySelector('[data-wealth-page="crypto"]');
    if (!root || !W || !WW) return;

    const el = W.el;
    const $ = selector => root.querySelector(selector);
    const COINS = [
        { symbol: 'BTC', name: 'Bitcoin' }, { symbol: 'ETH', name: 'Ethereum' }, { symbol: 'SOL', name: 'Solana' },
        { symbol: 'XRP', name: 'XRP' }, { symbol: 'ADA', name: 'Cardano' }, { symbol: 'LTC', name: 'Litecoin' },
    ];
    const coinName = symbol => (COINS.find(coin => coin.symbol === symbol) || { name: symbol }).name;
    const state = { quotes: new Map(), valuation: null, wallet: { holdings: [] }, history: [], handle: '', quotesFailed: false };
    const units = (quantity, symbol) => `${WW.formatQuantity(quantity, 'crypto')} ${symbol}`;

    // ── Coins table ────────────────────────────────────────────────────
    function renderCoins() {
        root.querySelectorAll('[data-coin]').forEach(row => {
            const symbol = row.dataset.coin;
            const quote = state.quotes.get(symbol);
            const priceCell = row.querySelector('[data-cell="price"]');
            const changeCell = row.querySelector('[data-cell="change"]');
            if (WW.isPriced(quote)) {
                priceCell.replaceChildren(el('span', { className: 'wl-cell-strong', text: WW.formatPrice(quote.price, quote.currency) }), el('span', { className: 'wl-cell-sub wl-show-sm' }, WW.delta(quote.changePercent)));
                changeCell.replaceChildren(WW.delta(quote.changePercent, { pill: true }));
                if (quote.stale) priceCell.append(el('span', { className: 'wl-cell-sub' }, el('span', { className: 'badge badge-warning', text: 'Cached' })));
            } else if (quote) {
                priceCell.replaceChildren(el('span', { className: 'wl-cell-strong muted', text: 'Unavailable' }));
                changeCell.replaceChildren(el('span', { className: 'muted', text: '—' }));
            }
            const starCell = row.querySelector('[data-cell="star"]');
            if (!starCell.firstChild) starCell.append(WW.starButton(symbol, coinName(symbol)));
        });
        const status = $('[data-coins-status]');
        const priced = COINS.map(coin => state.quotes.get(coin.symbol)).filter(WW.isPriced);
        status.replaceChildren(W.icon('clock', 'icon-sm'), !priced.length ? ' Prices unavailable' : priced.some(quote => quote.stale) ? ' Cached · delayed prices' : ` Delayed · updated ${WW.timeNow()}`);
    }

    async function loadQuotes(passive = false) {
        const results = await Promise.allSettled(COINS.map(coin => W.api(`/api/wealth/quotes/${coin.symbol}?range=1w`, { passive: true, timeout: 25000 })));
        let failures = 0;
        results.forEach((result, index) => {
            const symbol = COINS[index].symbol;
            if (result.status === 'fulfilled') {
                state.quotes.set(symbol, result.value);
                const spark = root.querySelector(`[data-coin="${symbol}"] .wl-coin-spark`);
                const values = (result.value.history || []).map(point => point.close);
                if (spark && global.WillowCharts && values.length > 1) global.WillowCharts.sparkline(spark, values);
            } else {
                failures += 1;
                if (!passive || !state.quotes.has(symbol)) state.quotes.set(symbol, { symbol, unavailable: true });
            }
        });
        state.quotesFailed = failures === COINS.length;
        renderCoins();
    }

    // ── Holdings hero ──────────────────────────────────────────────────
    function renderHoldings() {
        const valuation = state.valuation;
        const total = $('[data-crypto-total]');
        const day = $('[data-crypto-day]');
        const box = $('[data-crypto-holdings]');
        WW.setBusy(box, false);
        if (!valuation) return;
        const holdings = valuation.holdings.filter(holding => holding.type === 'crypto');
        const value = holdings.reduce((sum, holding) => sum + holding.marketValue, 0);
        const change = holdings.reduce((sum, holding) => sum + (holding.priceAvailable ? holding.dayChange : 0), 0);
        const previous = value - change;
        const anyPriced = holdings.some(holding => holding.priceAvailable);
        total.textContent = W.formatMoney(value, 'USD', { digits: 2 });
        const updated = $('[data-updated]');
        updated.replaceChildren(el('span', { className: 'text-xs muted', text: `Updated ${WW.timeNow()}` }));
        if (!holdings.length) {
            day.replaceChildren(el('span', { className: 'muted', text: 'You don’t hold any demo crypto yet.' }));
            box.replaceChildren(el('div', { className: 'wl-crypto-empty' },
                el('p', { className: 'text-sm secondary', text: `Buy a coin with your ${W.formatMoney(valuation.cash, 'USD', { digits: 0 })} of simulated cash to see it here. You can start with as little as $1.` }),
                el('div', { className: 'cluster' },
                    el('a', { className: 'btn btn-primary btn-sm', href: '/crypto/BTC' }, 'Buy Bitcoin'),
                    el('a', { className: 'btn btn-secondary btn-sm', href: '/crypto/ETH' }, 'Buy Ethereum'))));
            return;
        }
        if (anyPriced) {
            const pill = WW.delta(previous ? (change / previous) * 100 : 0, { amount: change, pill: true });
            pill.setAttribute('data-private', '');
            day.replaceChildren(pill, el('span', { className: 'muted', text: ' today' }));
        } else {
            day.replaceChildren(el('span', { className: 'badge badge-warning' }, W.icon('alert'), 'Prices unavailable'), el('span', { className: 'muted', text: ' Valued at cost' }));
        }
        box.replaceChildren(el('ul', { className: 'list-plain wl-rows', role: 'list' }, holdings.map(holding => el('li', null,
            el('a', { className: 'list-row wl-list-link', href: WW.detailHref(holding.symbol, 'crypto') },
                WW.assetMark(holding.symbol, 'crypto'),
                el('span', { className: 'list-row-main' },
                    el('span', { className: 'list-row-title', text: holding.name }),
                    el('span', { className: 'list-row-sub', 'data-private': '', text: units(holding.quantity, holding.symbol) })),
                el('span', { className: 'list-row-end' },
                    el('strong', { 'data-private': '', text: W.formatMoney(holding.marketValue, 'USD', { digits: 2 }) }),
                    holding.priceAvailable ? (() => { const d = WW.delta(holding.gainPercent); d.setAttribute('data-private', ''); return d; })() : el('small', { text: 'at cost' })))))));
    }

    async function loadPortfolio(passive = false) {
        try {
            const data = await W.api('/api/wealth/portfolio', { passive: true, timeout: 25000 });
            state.valuation = data.valuation;
            if (Array.isArray(data.watchlist)) WW.setWatchlist(data.watchlist);
            renderHoldings();
            const unpriced = data.valuation.holdings.some(holding => holding.type === 'crypto' && !holding.priceAvailable);
            $('[data-market-banner]').hidden = !(unpriced || state.quotesFailed);
        } catch (error) {
            if (passive) return;
            $('[data-crypto-total]').textContent = '—';
            $('[data-crypto-day]').replaceChildren(el('span', { className: 'muted', text: error.message }));
            const box = $('[data-crypto-holdings]');
            WW.setBusy(box, false);
            box.replaceChildren(W.empty({ iconName: 'bitcoin', title: 'Your crypto couldn’t be loaded', text: 'Please try again in a moment.', error: true, compact: true, action: { label: 'Retry', primary: false, onClick: () => loadPortfolio() } }));
        }
    }

    // ── Wallet ─────────────────────────────────────────────────────────
    function renderHistory() {
        const box = $('[data-wallet-history]');
        WW.setBusy(box, false);
        if (!state.history.length) {
            box.replaceChildren(W.empty({ iconName: 'transfer', title: 'No wallet activity yet', text: 'Coins you send to or receive from other Willow profiles will appear here.', compact: true }));
            return;
        }
        box.replaceChildren(el('ul', { className: 'list-plain wl-rows', role: 'list' }, state.history.slice(0, 8).map(item => {
            const sent = item.direction === 'sent';
            return el('li', { className: 'list-row' },
                el('span', { className: `icon-tile icon-tile-sm${sent ? ' is-neutral' : ' is-positive'}` }, W.icon(sent ? 'arrow-up-right' : 'arrow-down-left')),
                el('span', { className: 'list-row-main' },
                    el('span', { className: 'list-row-title', text: `${sent ? 'Sent' : 'Received'} ${coinName(item.symbol)}` }),
                    el('span', { className: 'list-row-sub', text: `${sent ? 'To' : 'From'} ${item.counterparty_name || item.counterparty} · ${W.relativeDay(item.created_at)}` })),
                el('span', { className: 'list-row-end' },
                    el('strong', { 'data-private': '', className: sent ? '' : 'positive', text: `${sent ? '−' : '+'}${units(item.quantity, item.symbol)}` }),
                    el('small', { className: 'mono', text: item.reference })));
        })));
    }

    async function loadWallet(passive = false) {
        try {
            const data = await W.api('/api/crypto/wallet', { passive: true, timeout: 20000 });
            state.wallet = data.wallet || { holdings: [] };
            state.history = data.history || [];
            state.handle = data.demoHandle || state.handle;
            if (state.handle) doc.querySelector('[data-handle]').textContent = state.handle;
            renderHistory();
        } catch (error) {
            if (passive) return;
            const box = $('[data-wallet-history]');
            WW.setBusy(box, false);
            box.replaceChildren(W.empty({ iconName: 'transfer', title: 'Wallet activity unavailable', text: error.message, error: true, compact: true, action: { label: 'Retry', primary: false, onClick: () => loadWallet() } }));
        }
    }

    // ── Send dialog ────────────────────────────────────────────────────
    const sendDialog = doc.querySelector('[data-send-dialog]');
    const sendForm = sendDialog.querySelector('[data-step="form"]');
    const assetSelect = sendDialog.querySelector('[data-send-asset]');
    const recipient = sendDialog.querySelector('[data-send-recipient]');
    const quantity = sendDialog.querySelector('[data-send-quantity]');
    const send = { symbol: null, quantity: null, recipient: '' };

    function stepTo(name) {
        sendDialog.querySelectorAll('[data-step]').forEach(step => { step.hidden = step.dataset.step !== name; });
        const heading = sendDialog.querySelector(`[data-step="${name}"] .wl-step-title`);
        if (heading) global.setTimeout(() => heading.focus(), 20);
        sendDialog.scrollTop = 0;
    }

    function fieldError(node, input, message) {
        node.hidden = !message;
        node.replaceChildren(...(message ? [W.icon('alert', 'icon-sm'), el('span', { text: message })] : []));
        input.setAttribute('aria-invalid', message ? 'true' : 'false');
    }

    function selectedHolding() {
        return state.wallet.holdings.find(holding => holding.symbol === assetSelect.value) || null;
    }

    function syncAvailable() {
        const holding = selectedHolding();
        const symbol = assetSelect.value;
        sendDialog.querySelector('[data-send-unit]').textContent = symbol || '';
        const available = sendDialog.querySelector('[data-send-available]');
        const quote = state.quotes.get(symbol);
        const parts = ['Available: ', el('span', { 'data-private': '', text: holding ? units(holding.quantity, symbol) : '—' })];
        if (holding && WW.isPriced(quote)) parts.push(el('span', { 'data-private': '', text: ` ≈ ${W.formatMoney(holding.quantity * quote.price, 'USD', { digits: 2 })}` }));
        available.replaceChildren(...parts);
    }

    function openSend(opener) {
        const holdings = state.wallet.holdings.filter(holding => holding.quantity > 0);
        const emptyBox = sendDialog.querySelector('[data-send-empty]');
        const fields = sendDialog.querySelector('[data-send-fields]');
        const foot = sendDialog.querySelector('[data-send-foot]');
        stepTo('form');
        if (!holdings.length) {
            emptyBox.hidden = false;
            fields.hidden = true;
            foot.hidden = true;
            emptyBox.replaceChildren(W.empty({ iconName: 'bitcoin', title: 'Nothing to send yet', text: 'Buy some demo crypto first. Then you can send it to another Willow profile by email.', compact: true, action: { label: 'Buy Bitcoin', href: '/crypto/BTC' } }));
            WW.openModal(sendDialog, opener);
            return;
        }
        emptyBox.hidden = true;
        fields.hidden = false;
        foot.hidden = false;
        const previous = assetSelect.value;
        assetSelect.replaceChildren(...holdings.map(holding => el('option', { value: holding.symbol, text: `${coinName(holding.symbol)} (${holding.symbol})` })));
        if (holdings.some(holding => holding.symbol === previous)) assetSelect.value = previous;
        fieldError(sendDialog.querySelector('[data-recipient-error]'), recipient, null);
        fieldError(sendDialog.querySelector('[data-quantity-error]'), quantity, null);
        syncAvailable();
        WW.openModal(sendDialog, opener, recipient);
    }

    function validateSend() {
        const holding = selectedHolding();
        const email = recipient.value.trim();
        const raw = quantity.value.replace(/[,\s]/g, '');
        let ok = true;
        let recipientMessage = null;
        let quantityMessage = null;
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) recipientMessage = 'Enter the email address of a Willow demo profile.';
        else if (state.handle && email.toLowerCase() === state.handle.toLowerCase()) recipientMessage = 'That’s your own profile. Choose a different Willow customer.';
        if (!raw) quantityMessage = 'Enter an amount to send.';
        else if (!/^\d+(\.\d{1,8})?$/.test(raw) || Number(raw) <= 0) quantityMessage = 'Enter an amount greater than 0 with up to 8 decimal places.';
        else if (!holding || Number(raw) > holding.quantity + 1e-12) quantityMessage = `You have ${holding ? units(holding.quantity, holding.symbol) : 'none'} available.`;
        fieldError(sendDialog.querySelector('[data-recipient-error]'), recipient, recipientMessage);
        fieldError(sendDialog.querySelector('[data-quantity-error]'), quantity, quantityMessage);
        if (recipientMessage) { recipient.focus(); ok = false; } else if (quantityMessage) { quantity.focus(); ok = false; }
        if (ok) Object.assign(send, { symbol: assetSelect.value, quantity: raw, recipient: email });
        return ok;
    }

    assetSelect.addEventListener('change', () => { syncAvailable(); fieldError(sendDialog.querySelector('[data-quantity-error]'), quantity, null); });
    sendDialog.querySelector('[data-send-max]').addEventListener('click', () => {
        const holding = selectedHolding();
        if (!holding) return;
        quantity.value = Number(holding.quantity).toFixed(8).replace(/0+$/, '').replace(/\.$/, '');
        fieldError(sendDialog.querySelector('[data-quantity-error]'), quantity, null);
        quantity.focus();
    });

    sendForm.addEventListener('submit', event => {
        event.preventDefault();
        if (!validateSend()) return;
        const quote = state.quotes.get(send.symbol);
        const value = WW.isPriced(quote) ? Number(send.quantity) * quote.price : null;
        sendDialog.querySelector('[data-send-review-rows]').replaceChildren(WW.rows([
            ['Coin', `${coinName(send.symbol)} (${send.symbol})`],
            ['Amount', units(Number(send.quantity), send.symbol), { private: true }],
            ['Approximate value', value !== null ? `≈ ${W.formatMoney(value, 'USD', { digits: 2 })}` : null, { private: true }],
            ['To', send.recipient],
            ['Network', 'Willow demo ledger (no blockchain)'],
            ['Fee', 'None — simulated'],
        ], 'wl-review-rows'));
        const confirm = sendDialog.querySelector('[data-send-confirm]');
        confirm.disabled = false;
        sendDialog.querySelector('[data-send-confirm-error]').hidden = true;
        stepTo('review');
    });

    sendDialog.querySelector('[data-send-back]').addEventListener('click', () => { stepTo('form'); recipient.focus(); });

    sendDialog.querySelector('[data-send-confirm]').addEventListener('click', async event => {
        const button = event.currentTarget;
        if (button.classList.contains('is-loading')) return;
        const errorBox = sendDialog.querySelector('[data-send-confirm-error]');
        errorBox.hidden = true;
        button.classList.add('is-loading');
        try {
            const result = await W.api('/api/crypto/send', { method: 'POST', body: { symbol: send.symbol, quantity: send.quantity, recipientEmail: send.recipient } });
            const transfer = result.transfer;
            if (transfer.wallet) state.wallet = transfer.wallet;
            sendDialog.querySelector('[data-send-receipt]').replaceChildren(
                WW.successMark(),
                el('h3', { className: 'wl-step-title', id: 'sendReceiptTitle', tabindex: '-1', text: 'Demo transfer sent' }),
                el('p', { className: 'receipt-amount', 'data-private': '', text: units(transfer.quantity, transfer.symbol) }),
                el('p', { className: 'receipt-to', text: `to ${transfer.recipientEmail}` }),
                el('div', { className: 'receipt-meta' }, WW.rows([
                    ['Coin', `${coinName(transfer.symbol)} (${transfer.symbol})`],
                    ['Recipient', transfer.recipientEmail],
                    ['Date', W.formatDate(new Date(), 'datetime')],
                    ['Reference', el('span', { className: 'mono', text: transfer.reference })],
                ])),
                el('p', { className: 'sim-note' }, W.icon('info', 'icon-sm'), 'Simulated transfer. No blockchain transaction or real asset movement occurred.'));
            stepTo('receipt');
            sendForm.reset();
            loadWallet(true);
            loadPortfolio(true);
        } catch (error) {
            const message = error.message || 'The demo transfer couldn’t be completed. Please try again.';
            if (/recipient|customer|profile/i.test(message)) {
                stepTo('form');
                fieldError(sendDialog.querySelector('[data-recipient-error]'), recipient, message);
                recipient.focus();
            } else if (/Not enough|quantity/i.test(message)) {
                stepTo('form');
                fieldError(sendDialog.querySelector('[data-quantity-error]'), quantity, message);
                quantity.focus();
                loadWallet(true);
            } else {
                errorBox.replaceChildren(W.icon('alert', 'icon-sm'), el('span', { text: message }));
                errorBox.hidden = false;
            }
        } finally {
            button.classList.remove('is-loading');
        }
    });

    doc.querySelectorAll('[data-send-open]').forEach(button => button.addEventListener('click', () => openSend(button)));

    // ── Receive dialog ─────────────────────────────────────────────────
    const receiveDialog = doc.querySelector('[data-receive-dialog]');
    doc.querySelectorAll('[data-receive-open]').forEach(button => button.addEventListener('click', () => {
        receiveDialog.querySelector('[data-copy-status]').textContent = '';
        WW.openModal(receiveDialog, button, receiveDialog.querySelector('[data-copy-handle]'));
    }));
    receiveDialog.querySelector('[data-copy-handle]').addEventListener('click', async () => {
        const status = receiveDialog.querySelector('[data-copy-status]');
        const text = receiveDialog.querySelector('[data-handle]').textContent.trim();
        try {
            if (!global.navigator.clipboard || !global.navigator.clipboard.writeText) throw new Error('unsupported');
            await global.navigator.clipboard.writeText(text);
            status.textContent = 'Email copied.';
        } catch (error) {
            const range = doc.createRange();
            range.selectNodeContents(receiveDialog.querySelector('[data-handle]'));
            const selection = global.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
            status.textContent = 'Copying isn’t available here. The email is selected — copy it manually.';
        }
    });

    // ── Load ───────────────────────────────────────────────────────────
    $('[data-retry]').addEventListener('click', async event => {
        const button = event.currentTarget;
        button.classList.add('is-loading');
        await loadQuotes();
        await loadPortfolio();
        button.classList.remove('is-loading');
        if (state.quotesFailed) W.showToast(WW.UNAVAILABLE, 'warning');
    });

    if (global.location.hash === '#wallet') {
        const wallet = doc.getElementById('wallet');
        if (wallet) global.setTimeout(() => wallet.scrollIntoView({ block: 'start' }), 50);
    }

    (async () => {
        loadWallet();
        await loadQuotes();
        await loadPortfolio();
    })();
    WW.poll(async () => { await loadQuotes(true); await loadPortfolio(true); }, 60000);
})(window);
