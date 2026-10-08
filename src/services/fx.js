/**
 * Simulated currency conversion between a customer's own Willow demo accounts.
 * Uses indicative mid-market rates from the market-data service. Nothing is
 * executed on a real FX market and no fees are modelled.
 */
const ids = require('./ids');
const { getDb } = require('../database');
const marketData = require('./market-data');
const { validateAmount, toCents, formatCurrency } = require('../middleware/validation');
const { isSupportedCurrency } = require('./currencies');
const { logAudit } = require('./audit');
const { createNotification } = require('./notification');
const { assertUser, assertTransferLimit } = require('./mutation-guard');

class FxError extends Error {
    constructor(message, status = 400, code = 'invalid') {
        super(message);
        this.status = status;
        this.code = code;
    }
}

async function getRates() {
    const rates = await marketData.getFxRates();
    return { base: 'USD', indicativeOnly: true, rates: [{ currency: 'USD', name: 'US dollar', perUsd: 1, usdPer: 1 }, ...rates] };
}

/** Indicative quote. Returns null amounts when a rate is unavailable. */
async function quote({ from, to, amount }) {
    if (!isSupportedCurrency(from) || !isSupportedCurrency(to)) throw new FxError('Choose supported currencies.');
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0 || value > 1e9) throw new FxError('Enter an amount greater than zero.');
    const { rates } = await getRates();
    const converted = marketData.convertAmount(value, from, to, rates);
    const rateFor = code => rates.find(item => item.currency === code);
    const stale = [rateFor(from), rateFor(to)].some(item => item && item.stale);
    const saved = [rateFor(from), rateFor(to)].some(item => item && item.saved);
    if (converted === null) return { from, to, amount: value, converted: null, rate: null, unavailable: true };
    return {
        from,
        to,
        amount: value,
        converted,
        rate: converted / value,
        stale,
        saved,
        asOf: [rateFor(from), rateFor(to)].map(item => item && item.asOf).filter(Boolean).sort().pop() || null,
        indicativeOnly: true,
    };
}

async function convertBetweenAccounts(userId, { fromAccountId, toAccountId, amount }) {
    const db = getDb();
    assertUser(userId);
    const fromId = Number(fromAccountId);
    const toId = Number(toAccountId);
    if (!Number.isSafeInteger(fromId) || !Number.isSafeInteger(toId) || fromId <= 0 || toId <= 0 || fromId === toId) throw new FxError('Choose two different accounts.');
    if (!validateAmount(amount)) throw new FxError('Enter a valid amount with up to two decimal places.', 400, 'invalid_amount');
    const source = db.prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?').get(fromId, userId);
    const destination = db.prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?').get(toId, userId);
    if (!source || !destination) throw new FxError('Account not found.', 404);
    if (source.status !== 'active' || destination.status !== 'active') throw new FxError('Both accounts must be active.');
    if (source.currency === destination.currency) throw new FxError('These accounts use the same currency. Use a transfer instead.');
    const amountCents = toCents(amount);
    if (source.available_balance < amountCents) throw new FxError('Insufficient demo funds for this conversion.', 400, 'insufficient_funds');

    let fx;
    try {
        fx = await quote({ from: source.currency, to: destination.currency, amount: amountCents / 100 });
    } catch (error) {
        throw new FxError('Exchange rates are temporarily unavailable. No conversion was made.', 503, 'rates_unavailable');
    }
    if (fx.unavailable) throw new FxError('Exchange rates are temporarily unavailable. No conversion was made.', 503, 'rates_unavailable');
    // Part cents are not credited, so converting back and forth can't create money.
    const creditCents = Math.floor(fx.converted * 100 + 1e-6);
    if (creditCents <= 0) throw new FxError('This amount is too small to convert.');
    const reference = ids.reference('CNV');
    // When live rates can't be reached, the best rate available is used and named in the description.
    const rateKind = fx.saved ? 'saved rate' : fx.stale ? 'cached rate' : 'indicative';
    const rateText = `1 ${source.currency} = ${fx.rate.toFixed(fx.rate < 1 ? 6 : 4)} ${destination.currency}`;

    db.transaction(() => {
        assertUser(userId);
        const active = db.prepare("SELECT id FROM accounts WHERE id IN (?, ?) AND user_id = ? AND status = 'active'").all(source.id, destination.id, userId);
        if (active.length !== 2) throw new FxError('Both accounts must still be active.');
        assertTransferLimit(source, amountCents);
        const debit = db.prepare('UPDATE accounts SET balance = balance - ?, available_balance = available_balance - ? WHERE id = ? AND available_balance >= ?').run(amountCents, amountCents, source.id, amountCents);
        if (debit.changes !== 1) throw new FxError('Insufficient demo funds for this conversion.', 400, 'insufficient_funds');
        db.prepare('UPDATE accounts SET balance = balance + ?, available_balance = available_balance + ? WHERE id = ?').run(creditCents, creditCents, destination.id);
        db.prepare(`INSERT INTO transactions (reference, account_id, related_account_id, type, amount, currency, direction, status, description, category)
            VALUES (?, ?, ?, 'transfer', ?, ?, 'debit', 'completed', ?, 'transfers')`).run(reference, source.id, destination.id, amountCents, source.currency, `Converted to ${destination.currency} · ${rateText} (${rateKind})`);
        db.prepare(`INSERT INTO transactions (reference, account_id, related_account_id, type, amount, currency, direction, status, description, category)
            VALUES (?, ?, ?, 'transfer', ?, ?, 'credit', 'completed', ?, 'transfers')`).run(`${reference}-C`, destination.id, source.id, creditCents, destination.currency, `Converted from ${source.currency} · ${rateText} (${rateKind})`);
        logAudit({ actorId: userId, action: 'demo_fx_conversion', targetType: 'account', targetId: String(source.id), metadata: { reference, from: source.currency, to: destination.currency, amountCents, creditCents, rate: fx.rate, simulated: true } });
    })();
    try {
        createNotification(userId, 'transfer', 'Demo conversion complete', `${formatCurrency(amountCents, source.currency)} converted to ${formatCurrency(creditCents, destination.currency)} at an indicative rate. Simulated — no real currency was exchanged.`);
    } catch (error) { /* non-critical */ }
    return {
        reference,
        simulated: true,
        from: { accountId: source.id, currency: source.currency, amountCents, formatted: formatCurrency(amountCents, source.currency) },
        to: { accountId: destination.id, currency: destination.currency, amountCents: creditCents, formatted: formatCurrency(creditCents, destination.currency) },
        rate: fx.rate,
        rateText,
        asOf: fx.asOf,
        stale: fx.stale,
        saved: fx.saved,
    };
}

module.exports = { getRates, quote, convertBetweenAccounts, FxError };
