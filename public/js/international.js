'use strict';

document.addEventListener('DOMContentLoaded', () => {
    const currencies = { EUR: { symbol: 'EURUSD', name: 'Euro' }, GBP: { symbol: 'GBPUSD', name: 'Pound sterling' }, MZN: { symbol: 'MZNUSD', name: 'Mozambican metical' }, ZAR: { symbol: 'ZARUSD', name: 'South African rand' } };
    const state = { rates: new Map() };
    const byId = id => document.getElementById(id);
    const number = (value, currency) => new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: currency === 'MZN' || currency === 'ZAR' ? 2 : 2 }).format(value);
    function render() {
        const currency = byId('fxCurrency').value;
        const quote = state.rates.get(currency);
        const amount = Number(byId('fxAmount').value);
        const direction = byId('fxDirection').value;
        if (!quote || quote.unavailable || !Number.isFinite(amount) || amount <= 0 || amount > 100000000) {
            byId('fxOutput').textContent = quote?.unavailable ? 'Unavailable' : '—';
            byId('fxRateText').textContent = quote?.unavailable ? 'Rate temporarily unavailable. No estimate can be calculated.' : amount > 100000000 ? 'Enter an amount within the supported limit.' : 'Enter a valid amount after a rate loads.';
            return;
        }
        const converted = direction === 'usd-to' ? amount / quote.price : amount * quote.price;
        const inputCurrency = direction === 'usd-to' ? 'USD' : currency;
        const outputCurrency = direction === 'usd-to' ? currency : 'USD';
        byId('fxOutput').textContent = number(converted, outputCurrency);
        byId('fxRateText').textContent = `${quote.stale ? 'Cached stale rate' : 'Indicative rate'}: 1 ${currency} = ${number(quote.price, 'USD')} · Quote timestamp ${new Date(quote.asOf).toLocaleString()}`;
        byId('fxAmount').setAttribute('aria-label', `Amount in ${inputCurrency}`);
    }
    async function load() {
        byId('fxError').hidden = true;
        byId('fxRefresh').disabled = true;
        try {
            const response = await fetch('/api/wealth/fx', { headers: { Accept: 'application/json' } });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || 'Currency data temporarily unavailable.');
            state.rates = new Map(payload.rates.filter(rate => rate.baseCurrency).map(rate => [rate.baseCurrency, rate]));
            const list = byId('fxRateList'); list.replaceChildren();
            Object.entries(currencies).forEach(([currency, info]) => {
                const quote = state.rates.get(currency);
                const row = document.createElement('div'); row.className = 'fx-rate-row';
                const label = document.createElement('span'); label.append(document.createTextNode(currency));
                const name = document.createElement('small'); name.textContent = info.name; label.append(name);
                const price = document.createElement('strong'); price.textContent = quote && !quote.unavailable ? `${number(quote.price, 'USD')}${quote.stale ? ' · Cached' : ''}` : 'Temporarily unavailable';
                row.append(label, price); list.append(row);
            });
            render();
        } catch (error) {
            byId('fxError').textContent = error.message || 'Currency data temporarily unavailable.'; byId('fxError').hidden = false;
            byId('fxRateList').replaceChildren(); byId('fxOutput').textContent = 'Unavailable'; byId('fxRateText').textContent = 'No rate available.';
        } finally { byId('fxRefresh').disabled = false; }
    }
    ['fxAmount', 'fxCurrency', 'fxDirection'].forEach(id => byId(id).addEventListener('input', render));
    byId('fxRefresh').addEventListener('click', load);
    load();
});