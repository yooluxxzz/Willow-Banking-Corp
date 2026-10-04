/**
 * Sample profile — an opt-in guest profile that already has about four months
 * of everyday activity, so reviewers can see budgets, net worth, insights,
 * charts and Ask Willow working without entering everything by hand.
 *
 * It is labelled as sample data everywhere (users.is_sample shows a banner on
 * every page) and behaves like any guest: removed after a week unused, or kept
 * by saving sign-in details. Nothing is shared with other customers: payments
 * go to merchants, salary comes from an employer, and no other Willow profile
 * is involved.
 *
 * The activity follows the same rules as real activity: every balance change is
 * a ledger row (salary and opening deposits, card-style payments, transfers to
 * savings, business income and expenses, debt payments, investing cash), and
 * every balance equals the sum of its rows. Amounts vary but are reproducible
 * for a given profile.
 */
const { getDb } = require('../database');
const ids = require('./ids');
const { createGuestProfile } = require('./guests');
const budgets = require('./budgets');
const networth = require('./networth');
const card = require('./card');
const portfolio = require('./demo-portfolio');
const marketData = require('./market-data');
const { createNotification } = require('./notification');
const { logAudit } = require('./audit');

const DAYS = 120;

/** Small seeded random generator, so a profile's activity is reproducible. */
function random(seed) {
    let state = seed >>> 0;
    const next = () => {
        state = (state + 0x6D2B79F5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return { next, cents: (min, max) => Math.round((min + next() * (max - min)) * 100), pick: list => list[Math.floor(next() * list.length)], chance: p => next() < p };
}

const sqlTime = date => date.toISOString().slice(0, 19).replace('T', ' ');
const localDay = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const GROCERS = ['Market Street Grocer', 'Corner Fresh', 'Green Basket', 'Harbor Foods'];
const RESTAURANTS = ['Noodle Bar', 'Little Lisbon Café', 'Taco Stand', 'Pizzeria Uno Mas', 'Sunday Brunch Club'];
const SHOPS = ['Bookshop on Main', 'Outdoor Supply Co.', 'Home Goods Store', 'Online marketplace'];
const CLIENTS = ['Northwind Studio', 'Blue Harbor Cafe', 'Atlas Fitness', 'Juniper Dental'];

/**
 * Builds the activity for a new (empty) guest profile. Ledger, accounts, budgets,
 * debts, assets, goals and schedules are written in one transaction.
 */
function populateLedger(userId, now) {
    const db = getDb();
    const rng = random(userId * 7919 + 17);
    const checking = db.prepare('SELECT id FROM accounts WHERE user_id = ? ORDER BY id LIMIT 1').get(userId).id;
    const newAccount = (type, purpose, nickname) => db.prepare("INSERT INTO accounts (user_id, account_number, account_type, balance, available_balance, currency, status, purpose, nickname) VALUES (?, ?, ?, 0, 0, 'USD', 'active', ?, ?)")
        .run(userId, ids.uniqueAccountNumber(db), type, purpose, nickname).lastInsertRowid;
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - DAYS);
    const savings = newAccount('savings', 'personal', 'Rainy day');
    const business = newAccount('checking', 'business', 'Studio operations');
    const balances = new Map([[checking, 0], [savings, 0], [business, 0]]);
    const history = []; // { day, account, delta } for daily net-worth snapshots
    const insert = db.prepare(`INSERT INTO transactions (reference, account_id, related_account_id, type, amount, currency, direction, status, description, category, counterparty, created_at)
        VALUES (?, ?, ?, ?, ?, 'USD', ?, 'completed', ?, ?, ?, ?)`);

    // One ledger row; returns false (and writes nothing) if it would overdraw the account.
    const book = (when, account, { prefix, type, amount, direction, description, category = null, counterparty = null, related = null, reference = null }) => {
        if (when > now) return false;
        if (direction === 'debit' && balances.get(account) < amount) return false;
        insert.run(reference || ids.reference(prefix), account, related, type, amount, direction, description, category, counterparty, sqlTime(when));
        const delta = direction === 'credit' ? amount : -amount;
        balances.set(account, balances.get(account) + delta);
        history.push({ day: localDay(when), delta });
        return true;
    };
    const move = (when, from, to, amount, description) => {
        if (when > now || balances.get(from) < amount) return false;
        const reference = ids.reference('TRF');
        book(when, from, { reference, type: 'transfer', amount, direction: 'debit', description, related: to });
        book(when, to, { reference: `${reference}-C`, type: 'transfer', amount, direction: 'credit', description, related: from });
        return true;
    };

    // Debts, assets and budgets exist from the start; debt payments follow below.
    const debt = (name, kind, lender, original, balance, rate, minimum, dueDay) => ({
        id: db.prepare('INSERT INTO debts (user_id, name, kind, lender, balance_cents, original_cents, rate_bps, minimum_cents, due_day, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, \'open\', ?)')
            .run(userId, name, kind, lender, balance, original, rate, minimum, dueDay, sqlTime(start)).lastInsertRowid,
        name, lender, balance, minimum, dueDay,
    });
    const debts = [debt('Visa card', 'credit_card', 'Willow Card Services', 240000, 214000, 2290, 6500, 21), debt('Student loan', 'student_loan', 'State Education Loans', 1800000, 1460000, 540, 18500, 10)];
    const debtHistory = []; // { day, delta } (debt balance changes)
    db.prepare("INSERT INTO assets (user_id, name, kind, value_cents, note, created_at) VALUES (?, 'Car', 'vehicle', 1150000, 'Estimated resale value', ?)").run(userId, sqlTime(start));
    db.prepare("INSERT INTO assets (user_id, name, kind, value_cents, note, created_at) VALUES (?, 'Workplace pension', 'retirement', 2430000, '', ?)").run(userId, sqlTime(start));
    const budgetRows = [
        ['personal', 'Groceries', 'groceries', 'monthly', 42000],
        ['personal', 'Eating out', 'dining', 'monthly', 18000],
        ['personal', 'Getting around', 'transport', 'weekly', 4500],
        ['business', 'Software', 'software', 'monthly', 12000],
    ].map(([scope, name, category, period, limit]) => db.prepare('INSERT INTO budgets (user_id, scope, name, category, period, limit_cents, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(userId, scope, name, category, period, limit, sqlTime(start)).lastInsertRowid);

    // Day by day: salary, rent, bills, groceries, eating out, getting around, savings,
    // debt payments and a small design business with its own account.
    const at = (day, hour, minute = 0) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute);
    book(at(start, 9), checking, { prefix: 'DEP', type: 'deposit', amount: 320000, direction: 'credit', description: 'Opening deposit — moved from my previous bank', category: 'income' });
    move(at(start, 9, 30), checking, savings, 150000, 'Starting my savings');
    book(at(start, 10), business, { prefix: 'DEP', type: 'deposit', amount: 90000, direction: 'credit', description: 'Opening deposit — business savings', category: 'income' });
    for (let offset = 0; offset <= DAYS; offset += 1) {
        const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset);
        const date = day.getDate();
        if (date === 1 || date === 15) book(at(day, 8), checking, { prefix: 'DEP', type: 'deposit', amount: 245000, direction: 'credit', description: 'Salary — Northwind Studio', category: 'income', counterparty: 'Northwind Studio' });
        if (date === 1) book(at(day, 10), checking, { prefix: 'WDR', type: 'withdrawal', amount: 125000, direction: 'debit', description: 'Rent', category: 'housing', counterparty: 'Maple Court Apartments' });
        if (date === 5) book(at(day, 12), checking, { prefix: 'WDR', type: 'withdrawal', amount: rng.cents(64, 92), direction: 'debit', description: 'Electricity', category: 'bills', counterparty: 'City Power' });
        if (date === 8) book(at(day, 12), checking, { prefix: 'WDR', type: 'withdrawal', amount: 3500, direction: 'debit', description: 'Phone plan', category: 'bills', counterparty: 'Mobile Co.' });
        if (date === 12) book(at(day, 12), checking, { prefix: 'WDR', type: 'withdrawal', amount: 4500, direction: 'debit', description: 'Internet', category: 'bills', counterparty: 'Fiber Net' });
        if (date === 20) book(at(day, 20), checking, { prefix: 'WDR', type: 'withdrawal', amount: 1299, direction: 'debit', description: 'Streaming subscription', category: 'entertainment', counterparty: 'StreamBox' });
        if (date === 16) move(at(day, 9), checking, savings, 40000, 'Monthly savings');
        if (offset % 4 === 1) { const shop = rng.pick(GROCERS); book(at(day, 18, 15), checking, { prefix: 'WDR', type: 'withdrawal', amount: rng.cents(38, 112), direction: 'debit', description: shop, category: 'groceries', counterparty: shop }); }
        if (rng.chance(0.3)) { const place = rng.pick(RESTAURANTS); book(at(day, 19, 40), checking, { prefix: 'WDR', type: 'withdrawal', amount: rng.cents(14, 46), direction: 'debit', description: place, category: 'dining', counterparty: place }); }
        if (day.getDay() === 1) book(at(day, 8, 30), checking, { prefix: 'WDR', type: 'withdrawal', amount: rng.cents(25, 34), direction: 'debit', description: 'Transit pass top-up', category: 'transport', counterparty: 'Metro Transit' });
        if (rng.chance(0.07)) book(at(day, 17), checking, { prefix: 'WDR', type: 'withdrawal', amount: rng.cents(18, 30), direction: 'debit', description: 'Rideshare', category: 'transport', counterparty: 'RideNow' });
        if (rng.chance(0.08)) { const shop = rng.pick(SHOPS); book(at(day, 15), checking, { prefix: 'WDR', type: 'withdrawal', amount: rng.cents(25, 140), direction: 'debit', description: shop, category: 'shopping', counterparty: shop }); }
        if (rng.chance(0.04)) book(at(day, 11), checking, { prefix: 'WDR', type: 'withdrawal', amount: rng.cents(12, 60), direction: 'debit', description: 'Pharmacy', category: 'health', counterparty: 'Corner Pharmacy' });
        debts.forEach(item => {
            if (date !== item.dueDay) return;
            const amount = item.minimum + (item.name === 'Visa card' ? 5000 : 0);
            const reference = ids.reference('DBT');
            if (!book(at(day, 9, 15), checking, { reference, type: 'payment', amount, direction: 'debit', description: `Payment — ${item.name}`, category: 'debt', counterparty: item.lender })) return;
            item.balance -= amount;
            debtHistory.push({ day: localDay(day), delta: -amount });
            db.prepare('INSERT INTO debt_payments (debt_id, user_id, amount_cents, account_id, transaction_reference, paid_on) VALUES (?, ?, ?, ?, ?, ?)').run(item.id, userId, amount, checking, reference, localDay(day));
        });
        if (date === 3 || date === 18) { const client = rng.pick(CLIENTS); book(at(day, 14), business, { prefix: 'DEP', type: 'deposit', amount: rng.cents(1400, 2900), direction: 'credit', description: `Client payment — ${client}`, category: 'income', counterparty: client }); }
        const expense = (vendor, category, amount, hour) => {
            const reference = ids.reference('EXP');
            if (!book(at(day, hour), business, { reference, type: 'payment', amount, direction: 'debit', description: `${vendor} — ${budgets.BUSINESS_CATEGORIES[category]}`, category: 'business', counterparty: vendor })) return;
            db.prepare('INSERT INTO business_expenses (user_id, spent_on, vendor, category, amount_cents, account_id, transaction_reference, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(userId, localDay(day), vendor, category, amount, business, reference, sqlTime(at(day, hour)));
        };
        if (date === 2) expense('Design Suite', 'software', 4900, 9);
        if (date === 2) expense('Cloud Storage', 'software', 999, 9);
        if (date === 4) expense('Shared Studio Space', 'rent', 18000, 10);
        if (rng.chance(0.05)) expense('Print & Paper Co.', 'supplies', rng.cents(20, 90), 13);
        if (rng.chance(0.025)) expense('Regional rail', 'travel', rng.cents(60, 180), 7);
    }

    // Investing: cash moved in three weeks ago (holdings are bought afterwards at market prices).
    const investDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 21, 12);
    const investReference = ids.reference('INV-IN');
    if (book(investDay, checking, { reference: investReference, type: 'transfer', amount: 180000, direction: 'debit', description: 'To investing cash', category: 'investing' })) {
        db.prepare('INSERT INTO demo_portfolios (user_id, cash_cents) VALUES (?, 180000) ON CONFLICT(user_id) DO UPDATE SET cash_cents = cash_cents + 180000').run(userId);
        db.prepare('INSERT INTO portfolio_transfers (user_id, account_id, direction, amount_cents, reference, created_at) VALUES (?, ?, \'in\', 180000, ?, ?)').run(userId, checking, investReference, sqlTime(investDay));
    }

    // Balances are the sum of their ledger rows.
    balances.forEach((cents, account) => db.prepare('UPDATE accounts SET balance = ?, available_balance = ? WHERE id = ?').run(cents, cents, account));
    debts.forEach(item => db.prepare('UPDATE debts SET balance_cents = ? WHERE id = ?').run(item.balance, item.id));

    // Self-reported goals, upcoming transfers, and cards.
    db.prepare("INSERT INTO demo_goals (user_id, name, category, target_cents, current_cents) VALUES (?, 'Emergency fund', 'savings', 900000, ?)").run(userId, Math.min(900000, balances.get(savings)));
    db.prepare("INSERT INTO demo_goals (user_id, name, category, target_cents, current_cents) VALUES (?, 'Summer trip', 'travel', 240000, 85000)").run(userId);
    const nextSixteenth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + (now.getUTCDate() >= 16 ? 1 : 0), 16));
    const inThreeDays = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 3));
    db.prepare('INSERT INTO scheduled_transfers (user_id, from_account_id, to_account_id, amount, description, scheduled_for) VALUES (?, ?, ?, 40000, \'Monthly savings\', ?)').run(userId, checking, savings, nextSixteenth.toISOString());
    db.prepare('INSERT INTO scheduled_transfers (user_id, from_account_id, to_account_id, amount, description, scheduled_for) VALUES (?, ?, ?, 15000, \'Summer trip\', ?)').run(userId, checking, savings, inThreeDays.toISOString());
    card.createCard(userId, { accountId: checking, form: 'physical', nickname: 'Everyday' });
    card.createCard(userId, { accountId: checking, form: 'virtual', nickname: 'Online shopping', dailyLimit: 50000 });

    // Daily net-worth history up to yesterday (investing at cost, assets at their logged value).
    const assetsCents = 1150000 + 2430000;
    let accountsCents = 0;
    let debtsCents = debts.reduce((sum, item) => sum + item.balance, 0) - debtHistory.reduce((sum, change) => sum + change.delta, 0);
    const byDay = new Map();
    history.forEach(change => byDay.set(change.day, (byDay.get(change.day) || 0) + change.delta));
    const debtByDay = new Map();
    debtHistory.forEach(change => debtByDay.set(change.day, (debtByDay.get(change.day) || 0) + change.delta));
    const snapshot = db.prepare('INSERT OR REPLACE INTO net_worth_snapshots (user_id, day, accounts_cents, investments_cents, assets_cents, debts_cents, net_cents) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (let offset = 0; offset < DAYS; offset += 1) {
        const day = localDay(new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset));
        accountsCents += byDay.get(day) || 0;
        debtsCents += debtByDay.get(day) || 0;
        const investments = day >= localDay(investDay) ? 180000 : 0;
        snapshot.run(userId, day, accountsCents, investments, assetsCents, debtsCents, accountsCents + investments + assetsCents - debtsCents);
    }
    return { checking, savings, business, budgetIds: budgetRows };
}

/** Buys a few holdings at current market prices (live or saved); skipped if no price is available. */
async function buyHoldings(userId) {
    const orders = [['SPY', 700], ['AAPL', 450], ['BTC', 250]];
    const quotes = await marketData.getQuotes(orders.map(([symbol]) => symbol));
    for (const [symbol, amount] of orders) {
        const quote = quotes.find(item => item && item.symbol === symbol);
        if (!quote || quote.unavailable || !(quote.price > 0)) continue;
        try { portfolio.executeTrade(userId, { symbol, side: 'buy', amount, price: quote.price }); } catch (error) { /* keep the cash */ }
    }
}

/** Creates a labelled sample profile with its activity and returns the new user. */
async function createSampleProfile(now = new Date()) {
    const user = await createGuestProfile({ sample: true });
    const db = getDb();
    const created = db.transaction(() => populateLedger(user.id, now))();
    await buyHoldings(user.id).catch(() => {});
    // Budget history for the past month, and today's alerts, like the nightly check would leave them.
    const budgetRows = db.prepare('SELECT * FROM budgets WHERE user_id = ?').all(user.id);
    for (let back = 30; back >= 1; back -= 1) {
        const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
        budgetRows.forEach(budget => budgets.checkBudgetDay(budget, day, { now, notifyUser: back === 1 }));
    }
    await networth.recordSnapshot(user.id, now).catch(() => {});
    createNotification(user.id, 'info', 'Welcome to your sample profile', 'This profile comes with four months of example activity so you can explore Willow. It’s sample data: nothing here is real, and it’s removed after a week unused.');
    logAudit({ actorId: user.id, actorEmail: user.email, action: 'sample_profile_created', targetType: 'user', targetId: String(user.id), metadata: { accounts: Object.keys(created).length, simulated: true } });
    return user;
}

module.exports = { createSampleProfile, populateLedger };
