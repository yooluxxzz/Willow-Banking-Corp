/**
 * Net worth from the customer's own records: Willow account balances, the
 * investing portfolio, and the assets and debts they log themselves. A snapshot
 * is stored per day so the history chart reflects what was true at the time.
 */
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database');
const marketData = require('./market-data');
const portfolio = require('./demo-portfolio');
const { logAudit } = require('./audit');
const { createNotification } = require('./notification');
const { formatCurrency } = require('../middleware/validation');

const ASSET_KINDS = {
    cash: 'Cash outside Willow',
    property: 'Property',
    vehicle: 'Vehicles',
    investment: 'Other investments',
    retirement: 'Retirement',
    business: 'Business ownership',
    other: 'Other assets',
};
const DEBT_KINDS = {
    credit_card: 'Credit card',
    student_loan: 'Student loan',
    mortgage: 'Mortgage',
    auto: 'Car loan',
    personal: 'Personal loan',
    medical: 'Medical',
    other: 'Other debt',
};
const MAX_ITEMS = 100;
const plain = (value, max) => typeof value === 'string' && value.trim().length <= max && !/[<>\x00-\x1f\x7f]/.test(value);
const pad = n => String(n).padStart(2, '0');
const localDay = (date = new Date()) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

function money(value, { min = 0, max = 100000000000, label = 'amount' } = {}) {
    const cents = Math.round(Number(value) * 100);
    if (value === '' || value === null || value === undefined || !Number.isSafeInteger(cents) || cents < min || cents > max) {
        throw new Error(`Enter a valid ${label}.`);
    }
    return cents;
}

// ── Assets ───────────────────────────────────────────────────────────────
function formatAsset(row) {
    return { id: row.id, name: row.name, kind: row.kind, kindLabel: ASSET_KINDS[row.kind] || 'Other', valueCents: row.value_cents, currency: row.currency, note: row.note, updatedAt: row.updated_at };
}

function listAssets(userId) {
    return getDb().prepare('SELECT * FROM assets WHERE user_id = ? ORDER BY value_cents DESC, id').all(userId).map(formatAsset);
}

function validateAsset(input, existing = {}) {
    const name = typeof input.name === 'string' ? input.name.trim() : existing.name;
    if (!name || name.length < 2 || !plain(name, 60)) throw new Error('Name the asset (2–60 characters).');
    const kind = input.kind ?? existing.kind;
    if (!Object.hasOwn(ASSET_KINDS, kind)) throw new Error('Choose what kind of asset it is.');
    const valueCents = input.value !== undefined ? money(input.value, { label: 'value' }) : existing.value_cents;
    if (valueCents === undefined) throw new Error('Enter what it is worth today.');
    const note = typeof input.note === 'string' ? input.note.trim() : (existing.note || '');
    if (!plain(note, 200)) throw new Error('Keep the note under 200 characters.');
    return { name, kind, valueCents, note };
}

function createAsset(userId, input = {}) {
    const db = getDb();
    if (db.prepare('SELECT COUNT(*) AS n FROM assets WHERE user_id = ?').get(userId).n >= MAX_ITEMS) throw new Error(`You can track up to ${MAX_ITEMS} assets.`);
    const { name, kind, valueCents, note } = validateAsset(input);
    const id = db.prepare('INSERT INTO assets (user_id, name, kind, value_cents, note) VALUES (?, ?, ?, ?, ?)').run(userId, name, kind, valueCents, note).lastInsertRowid;
    logAudit({ actorId: userId, action: 'asset_added', targetType: 'asset', targetId: String(id) });
    return formatAsset(db.prepare('SELECT * FROM assets WHERE id = ?').get(id));
}

function updateAsset(userId, id, input = {}) {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM assets WHERE id = ? AND user_id = ?').get(id, userId);
    if (!existing) throw Object.assign(new Error('Asset not found.'), { status: 404 });
    const { name, kind, valueCents, note } = validateAsset(input, existing);
    db.prepare("UPDATE assets SET name = ?, kind = ?, value_cents = ?, note = ?, updated_at = datetime('now') WHERE id = ?").run(name, kind, valueCents, note, existing.id);
    return formatAsset(db.prepare('SELECT * FROM assets WHERE id = ?').get(existing.id));
}

function deleteAsset(userId, id) {
    const result = getDb().prepare('DELETE FROM assets WHERE id = ? AND user_id = ?').run(id, userId);
    if (!result.changes) throw Object.assign(new Error('Asset not found.'), { status: 404 });
}

// ── Debts ────────────────────────────────────────────────────────────────
/** Months to repay `balance` at `payment` a month and `apr` percent, with total interest. */
function payoff(balanceCents, aprPercent, paymentCents) {
    if (balanceCents <= 0) return { months: 0, interestCents: 0, payable: true };
    if (paymentCents <= 0) return { months: null, interestCents: null, payable: false };
    const rate = aprPercent / 100 / 12;
    let balance = balanceCents;
    let interest = 0;
    for (let month = 1; month <= 600; month += 1) {
        const charge = Math.round(balance * rate);
        if (paymentCents <= charge) return { months: null, interestCents: null, payable: false };
        interest += charge;
        balance = balance + charge - paymentCents;
        if (balance <= 0) return { months: month, interestCents: interest, payable: true };
    }
    return { months: null, interestCents: null, payable: false };
}

function nextDueDate(dueDay, now = new Date()) {
    if (!dueDay) return null;
    const make = (y, m) => new Date(y, m, Math.min(dueDay, new Date(y, m + 1, 0).getDate()));
    let date = make(now.getFullYear(), now.getMonth());
    if (date < new Date(now.getFullYear(), now.getMonth(), now.getDate())) date = make(now.getFullYear(), now.getMonth() + 1);
    return localDay(date);
}

function formatDebt(row, payments = []) {
    const apr = row.rate_bps / 100;
    const plan = payoff(row.balance_cents, apr, row.minimum_cents);
    const paidCents = Math.max(0, row.original_cents - row.balance_cents);
    return {
        id: row.id,
        name: row.name,
        kind: row.kind,
        kindLabel: DEBT_KINDS[row.kind] || 'Other',
        lender: row.lender,
        balanceCents: row.balance_cents,
        originalCents: row.original_cents,
        paidCents,
        progress: row.original_cents ? Math.round((paidCents / row.original_cents) * 1000) / 10 : 0,
        apr,
        minimumCents: row.minimum_cents,
        dueDay: row.due_day,
        nextDue: row.status === 'open' ? nextDueDate(row.due_day) : null,
        status: row.status,
        monthlyInterestCents: Math.round(row.balance_cents * (apr / 100 / 12)),
        payoffMonths: plan.months,
        payoffInterestCents: plan.interestCents,
        payoffPossible: plan.payable,
        payments,
        updatedAt: row.updated_at,
    };
}

function debtPayments(debtId, limit = 12) {
    return getDb().prepare(`SELECT p.id, p.amount_cents, p.paid_on, p.note, p.transaction_reference, a.nickname, a.account_type, a.account_number
        FROM debt_payments p LEFT JOIN accounts a ON a.id = p.account_id WHERE p.debt_id = ? ORDER BY p.paid_on DESC, p.id DESC LIMIT ?`).all(debtId, limit)
        .map(row => ({ id: row.id, amountCents: row.amount_cents, paidOn: row.paid_on, note: row.note, reference: row.transaction_reference, from: row.transaction_reference ? `${row.nickname || (row.account_type === 'savings' ? 'Savings' : 'Checking')} ··${String(row.account_number || '').slice(-4)}` : 'Paid outside Willow' }));
}

function listDebts(userId) {
    return getDb().prepare("SELECT * FROM debts WHERE user_id = ? ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END, rate_bps DESC, balance_cents DESC").all(userId)
        .map(row => formatDebt(row, debtPayments(row.id)));
}

function validateDebt(input, existing = {}) {
    const name = typeof input.name === 'string' ? input.name.trim() : existing.name;
    if (!name || name.length < 2 || !plain(name, 60)) throw new Error('Name the debt (2–60 characters).');
    const kind = input.kind ?? existing.kind;
    if (!Object.hasOwn(DEBT_KINDS, kind)) throw new Error('Choose what kind of debt it is.');
    const lender = typeof input.lender === 'string' ? input.lender.trim() : (existing.lender || '');
    if (!plain(lender, 60)) throw new Error('Keep the lender under 60 characters.');
    const balanceCents = input.balance !== undefined ? money(input.balance, { label: 'balance' }) : existing.balance_cents;
    if (balanceCents === undefined) throw new Error('Enter what you owe today.');
    let originalCents = input.original !== undefined && input.original !== '' ? money(input.original, { label: 'original amount' }) : (existing.original_cents ?? balanceCents);
    if (originalCents < balanceCents) originalCents = balanceCents;
    const rate = input.rate !== undefined && input.rate !== '' ? Number(input.rate) : (existing.rate_bps !== undefined ? existing.rate_bps / 100 : 0);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw new Error('Enter an interest rate between 0% and 100%.');
    const minimumCents = input.minimum !== undefined && input.minimum !== '' ? money(input.minimum, { label: 'minimum payment' }) : (existing.minimum_cents || 0);
    const dueDay = input.dueDay !== undefined ? (input.dueDay === '' || input.dueDay === null ? null : Number(input.dueDay)) : (existing.due_day ?? null);
    if (dueDay !== null && (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31)) throw new Error('Choose a due day between 1 and 31.');
    return { name, kind, lender, balanceCents, originalCents, rateBps: Math.round(rate * 100), minimumCents, dueDay };
}

function createDebt(userId, input = {}) {
    const db = getDb();
    if (db.prepare('SELECT COUNT(*) AS n FROM debts WHERE user_id = ?').get(userId).n >= MAX_ITEMS) throw new Error(`You can track up to ${MAX_ITEMS} debts.`);
    const v = validateDebt(input);
    const id = db.prepare('INSERT INTO debts (user_id, name, kind, lender, balance_cents, original_cents, rate_bps, minimum_cents, due_day, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(userId, v.name, v.kind, v.lender, v.balanceCents, v.originalCents, v.rateBps, v.minimumCents, v.dueDay, v.balanceCents ? 'open' : 'paid_off').lastInsertRowid;
    logAudit({ actorId: userId, action: 'debt_added', targetType: 'debt', targetId: String(id) });
    return getDebt(userId, id);
}

function getDebt(userId, id) {
    const row = getDb().prepare('SELECT * FROM debts WHERE id = ? AND user_id = ?').get(id, userId);
    if (!row) throw Object.assign(new Error('Debt not found.'), { status: 404 });
    return formatDebt(row, debtPayments(row.id));
}

function updateDebt(userId, id, input = {}) {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM debts WHERE id = ? AND user_id = ?').get(id, userId);
    if (!existing) throw Object.assign(new Error('Debt not found.'), { status: 404 });
    const v = validateDebt(input, existing);
    db.prepare("UPDATE debts SET name = ?, kind = ?, lender = ?, balance_cents = ?, original_cents = ?, rate_bps = ?, minimum_cents = ?, due_day = ?, status = ?, updated_at = datetime('now') WHERE id = ?")
        .run(v.name, v.kind, v.lender, v.balanceCents, v.originalCents, v.rateBps, v.minimumCents, v.dueDay, v.balanceCents ? 'open' : 'paid_off', existing.id);
    return getDebt(userId, existing.id);
}

function deleteDebt(userId, id) {
    const result = getDb().prepare('DELETE FROM debts WHERE id = ? AND user_id = ?').run(id, userId);
    if (!result.changes) throw Object.assign(new Error('Debt not found.'), { status: 404 });
}

/**
 * Records a payment. With accountId the money leaves that Willow account through
 * the ledger; otherwise it records a payment made elsewhere.
 */
function recordPayment(userId, debtId, input = {}) {
    const db = getDb();
    const debt = db.prepare('SELECT * FROM debts WHERE id = ? AND user_id = ?').get(debtId, userId);
    if (!debt) throw Object.assign(new Error('Debt not found.'), { status: 404 });
    if (debt.status !== 'open' || debt.balance_cents <= 0) throw new Error('This debt is already paid off.');
    const amountCents = money(input.amount, { min: 1, max: 100000000000, label: 'payment amount' });
    if (amountCents > debt.balance_cents) throw new Error(`The payment can’t be more than the ${formatCurrency(debt.balance_cents)} you owe.`);
    const paidOn = typeof input.paidOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.paidOn) ? input.paidOn : localDay();
    if (paidOn > localDay()) throw new Error('Choose today or an earlier date.');
    const note = typeof input.note === 'string' ? input.note.trim() : '';
    if (!plain(note, 120)) throw new Error('Keep the note under 120 characters.');
    let account = null;
    if (input.accountId) {
        account = db.prepare("SELECT * FROM accounts WHERE id = ? AND user_id = ? AND status = 'active' AND currency = 'USD'").get(Number(input.accountId), userId);
        if (!account) throw new Error('Choose one of your active US dollar accounts, or record a payment made elsewhere.');
    }
    const reference = account ? `DBT-${uuidv4().slice(0, 8).toUpperCase()}` : null;
    db.transaction(() => {
        if (account) {
            const updated = db.prepare('UPDATE accounts SET balance = balance - ?, available_balance = available_balance - ? WHERE id = ? AND available_balance >= ?').run(amountCents, amountCents, account.id, amountCents);
            if (updated.changes !== 1) throw new Error('Not enough available money in that account.');
            db.prepare(`INSERT INTO transactions (reference, account_id, type, amount, currency, direction, status, description, category, counterparty)
                VALUES (?, ?, 'payment', ?, 'USD', 'debit', 'completed', ?, 'debt', ?)`).run(reference, account.id, amountCents, `Payment — ${debt.name}`, debt.lender || debt.name);
        }
        const remaining = debt.balance_cents - amountCents;
        db.prepare("UPDATE debts SET balance_cents = ?, status = ?, updated_at = datetime('now') WHERE id = ?").run(remaining, remaining ? 'open' : 'paid_off', debt.id);
        db.prepare('INSERT INTO debt_payments (debt_id, user_id, amount_cents, account_id, transaction_reference, paid_on, note) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .run(debt.id, userId, amountCents, account ? account.id : null, reference, paidOn, note);
    })();
    logAudit({ actorId: userId, action: 'debt_payment', targetType: 'debt', targetId: String(debt.id), metadata: { amount: amountCents, reference } });
    if (debt.balance_cents - amountCents === 0) {
        try { createNotification(userId, 'info', 'Debt paid off', `${debt.name} is paid off. Nicely done.`); } catch (error) { /* non-critical */ }
    }
    return getDebt(userId, debt.id);
}

// ── Net worth ────────────────────────────────────────────────────────────
/** Current net worth with composition and liabilities. Market data failures fall back to cost. */
async function computeNetWorth(userId) {
    const db = getDb();
    const accounts = db.prepare("SELECT id, account_type, purpose, currency, balance FROM accounts WHERE user_id = ? AND status = 'active'").all(userId);
    const foreign = accounts.filter(account => account.currency !== 'USD' && account.balance > 0);
    let rates = null;
    if (foreign.length) {
        try { rates = await marketData.getFxRates(); } catch (error) { rates = null; }
    }
    let unconverted = 0;
    const usdCents = account => {
        if (account.currency === 'USD') return account.balance;
        const converted = rates ? marketData.convertAmount(account.balance / 100, account.currency, 'USD', rates) : null;
        if (converted === null || !Number.isFinite(converted)) { unconverted += 1; return 0; }
        return Math.round(converted * 100);
    };
    const sum = (list, pick) => list.reduce((total, item) => total + pick(item), 0);
    const checking = sum(accounts.filter(a => a.purpose === 'personal' && a.account_type !== 'savings'), usdCents);
    const savings = sum(accounts.filter(a => a.purpose === 'personal' && a.account_type === 'savings'), usdCents);
    const business = sum(accounts.filter(a => a.purpose === 'business'), usdCents);
    let investments = 0;
    let crypto = 0;
    let pricing = 'none-held';
    try {
        const valuation = await portfolio.valuePortfolio(userId);
        crypto = Math.round(valuation.holdings.filter(h => h.type === 'crypto').reduce((total, h) => total + h.marketValue, 0) * 100);
        investments = Math.round(valuation.total * 100) - crypto;
        pricing = valuation.pricing;
    } catch (error) {
        const base = portfolio.getPortfolio(userId);
        investments = base.cashCents + Math.round(base.holdings.reduce((total, h) => total + h.quantity * h.average_price, 0) * 100);
        pricing = 'unavailable';
    }
    const assets = listAssets(userId);
    const debts = db.prepare("SELECT kind, balance_cents FROM debts WHERE user_id = ? AND status = 'open'").all(userId);
    const assetGroups = Object.entries(ASSET_KINDS).map(([kind, label]) => ({ key: kind, label, cents: sum(assets.filter(a => a.kind === kind), a => a.valueCents) }));
    const composition = [
        { key: 'checking', label: 'Checking & currency', cents: checking },
        { key: 'savings', label: 'Savings', cents: savings },
        { key: 'business-accounts', label: 'Business accounts', cents: business },
        { key: 'investing', label: 'Investing', cents: investments },
        { key: 'crypto', label: 'Crypto', cents: crypto },
        ...assetGroups,
    ].filter(item => item.cents > 0).map((item, index) => ({ ...item, color: `var(--chart-${(index % 8) + 1})` }));
    const liabilities = Object.entries(DEBT_KINDS).map(([kind, label]) => ({ key: kind, label, cents: sum(debts.filter(d => d.kind === kind), d => d.balance_cents) }))
        .filter(item => item.cents > 0).map((item, index) => ({ ...item, color: `var(--chart-${((index + 3) % 8) + 1})` }));
    const totals = {
        accountsCents: checking + savings + business,
        investmentsCents: investments + crypto,
        assetsCents: sum(assets, a => a.valueCents),
        debtsCents: sum(debts, d => d.balance_cents),
    };
    const grossCents = totals.accountsCents + totals.investmentsCents + totals.assetsCents;
    return {
        ...totals,
        grossCents,
        netCents: grossCents - totals.debtsCents,
        composition,
        liabilities,
        pricing,
        fxUnavailable: unconverted > 0,
        debtToAssets: grossCents ? Math.round((totals.debtsCents / grossCents) * 1000) / 10 : null,
        liquidCents: totals.accountsCents + investments + crypto + sum(assets.filter(a => a.kind === 'cash'), a => a.valueCents),
    };
}

/** Stores today's snapshot and returns it. */
async function recordSnapshot(userId, now = new Date()) {
    const worth = await computeNetWorth(userId);
    getDb().prepare(`INSERT INTO net_worth_snapshots (user_id, day, accounts_cents, investments_cents, assets_cents, debts_cents, net_cents) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, day) DO UPDATE SET accounts_cents = excluded.accounts_cents, investments_cents = excluded.investments_cents, assets_cents = excluded.assets_cents,
            debts_cents = excluded.debts_cents, net_cents = excluded.net_cents, created_at = datetime('now')`)
        .run(userId, localDay(now), worth.accountsCents, worth.investmentsCents, worth.assetsCents, worth.debtsCents, worth.netCents);
    return worth;
}

function history(userId, days = 365) {
    const since = localDay(new Date(Date.now() - days * 86400000));
    return getDb().prepare('SELECT day, net_cents, assets_cents, accounts_cents, investments_cents, debts_cents FROM net_worth_snapshots WHERE user_id = ? AND day >= ? ORDER BY day').all(userId, since)
        .map(row => ({ day: row.day, netCents: row.net_cents, assetsCents: row.accounts_cents + row.investments_cents + row.assets_cents, debtsCents: row.debts_cents }));
}

/** Everything the net worth page needs; records today's snapshot as a side effect. */
async function overview(userId) {
    const worth = await recordSnapshot(userId);
    const points = history(userId);
    const monthAgo = localDay(new Date(Date.now() - 30 * 86400000));
    const baseline = [...points].reverse().find(point => point.day <= monthAgo) || null;
    return {
        ...worth,
        history: points,
        change30Cents: baseline ? worth.netCents - baseline.netCents : null,
        assets: listAssets(userId),
        debts: listDebts(userId),
        assetKinds: Object.entries(ASSET_KINDS).map(([key, label]) => ({ key, label })),
        debtKinds: Object.entries(DEBT_KINDS).map(([key, label]) => ({ key, label })),
    };
}

/** Nightly: snapshot every active customer who has something to measure. */
async function snapshotAll(now = new Date()) {
    const users = getDb().prepare(`SELECT DISTINCT u.id FROM users u WHERE u.role = 'customer' AND u.status = 'active' AND (
        EXISTS (SELECT 1 FROM accounts a WHERE a.user_id = u.id AND a.balance > 0) OR EXISTS (SELECT 1 FROM assets s WHERE s.user_id = u.id)
        OR EXISTS (SELECT 1 FROM debts d WHERE d.user_id = u.id) OR EXISTS (SELECT 1 FROM demo_portfolios p WHERE p.user_id = u.id))`).all();
    let count = 0;
    for (const user of users) {
        try { await recordSnapshot(user.id, now); count += 1; } catch (error) { /* skip this customer */ }
    }
    return count;
}

module.exports = {
    ASSET_KINDS, DEBT_KINDS,
    listAssets, createAsset, updateAsset, deleteAsset,
    listDebts, getDebt, createDebt, updateDebt, deleteDebt, recordPayment, payoff,
    computeNetWorth, recordSnapshot, history, overview, snapshotAll,
};
