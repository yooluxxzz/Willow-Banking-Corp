/**
 * Sample activity for Willow Demo profiles.
 *
 * Adds clearly simulated, internally consistent history to a profile so the
 * Hub, insights and charts have something meaningful to show. Every ledger
 * entry is paired with an account balance change; nothing touches real money.
 * Loading is idempotent per profile.
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { getDb } = require('../database');
const config = require('../config');
const { uniqueAccountNumber } = require('./account');
const { logAudit } = require('./audit');
const preferences = require('./preferences');
const marketData = require('./market-data');

const COMMUNITY = [
    { email: 'maria.silva@community.willow.test', name: 'Maria Silva', country: 'Portugal' },
    { email: 'daniel.okafor@community.willow.test', name: 'Daniel Okafor', country: 'United Kingdom' },
    { email: 'priya.raman@community.willow.test', name: 'Priya Raman', country: 'United States' },
    { email: 'lucas.moreau@community.willow.test', name: 'Lucas Moreau', country: 'France' },
    { email: 'amara.nkosi@community.willow.test', name: 'Amara Nkosi', country: 'South Africa' },
];

const SAMPLE_PORTFOLIO = [
    { symbol: 'AAPL', usd: 8200 },
    { symbol: 'MSFT', usd: 7400 },
    { symbol: 'NVDA', usd: 6100 },
    { symbol: 'VTI', usd: 9800 },
    { symbol: 'BTC', usd: 3900 },
    { symbol: 'ETH', usd: 2300 },
];

function rng(seed) {
    let state = seed >>> 0 || 1;
    return () => {
        state ^= state << 13; state >>>= 0;
        state ^= state >>> 17;
        state ^= state << 5; state >>>= 0;
        return state / 4294967296;
    };
}

function sqlTime(date) {
    return date.toISOString().replace('T', ' ').slice(0, 19);
}

function daysAgo(days, hour, minute, now = new Date()) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days, hour, minute, 0));
    return date > now ? new Date(now.getTime() - 60 * 1000) : date;
}

function generateCustomerId(db) {
    let id;
    do { id = `WB${crypto.randomInt(10000000, 100000000)}`; } while (db.prepare('SELECT id FROM users WHERE customer_id = ?').get(id));
    return id;
}

/** Ensures the fictional "Willow community" customers exist so sample payments have real recipients. */
async function ensureCommunity() {
    const db = getDb();
    const missing = COMMUNITY.filter(person => !db.prepare('SELECT id FROM users WHERE email = ?').get(person.email));
    for (const person of missing) {
        const hash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), config.bcryptRounds);
        db.transaction(() => {
            if (db.prepare('SELECT id FROM users WHERE email = ?').get(person.email)) return;
            const user = db.prepare("INSERT INTO users (email, full_name, phone, password_hash, role, status, customer_id, country) VALUES (?, ?, '', ?, 'customer', 'active', ?, ?)").run(person.email, person.name, hash, generateCustomerId(db), person.country);
            db.prepare("INSERT INTO accounts (user_id, account_number, account_type, balance, available_balance, currency, status) VALUES (?, ?, 'checking', 0, 0, 'USD', 'active')").run(user.lastInsertRowid, uniqueAccountNumber(db));
            if (person.country === 'Portugal' || person.country === 'France') {
                db.prepare("INSERT INTO accounts (user_id, account_number, account_type, balance, available_balance, currency, status) VALUES (?, ?, 'checking', 0, 0, 'EUR', 'active')").run(user.lastInsertRowid, uniqueAccountNumber(db));
            }
        })();
    }
    return COMMUNITY.map(person => ({ ...person, ...db.prepare('SELECT id FROM users WHERE email = ?').get(person.email) }));
}

class Ledger {
    constructor(db, userId) {
        this.db = db;
        this.userId = userId;
        this.entries = [];
        this.counter = 0;
    }

    add(accountId, { days, hour = 12, minute = 0, type, direction, amount, description, category = null, cardId = null, related = null, counterparty = null, pairWith = null, currency = 'USD' }) {
        const cents = Math.round(amount * 100);
        if (cents <= 0) return null;
        const entry = { accountId, at: daysAgo(days, hour, minute), type, direction, cents, description, category, cardId, related, counterparty, currency, pairWith };
        this.entries.push(entry);
        return entry;
    }

    commit() {
        const db = this.db;
        const ordered = this.entries.sort((a, b) => a.at - b.at);
        const balances = new Map();
        const prefix = crypto.randomBytes(3).toString('hex').toUpperCase();
        ordered.forEach(entry => {
            const before = balances.get(entry.accountId) || 0;
            const after = entry.direction === 'credit' ? before + entry.cents : before - entry.cents;
            if (after < 0) { entry.skipped = true; return; }
            balances.set(entry.accountId, after);
        });
        ordered.filter(entry => !entry.skipped).forEach(entry => {
            this.counter += 1;
            const code = entry.type === 'deposit' ? 'DEP' : entry.type === 'withdrawal' ? 'WDR' : entry.type === 'transfer' ? 'TRF' : 'PAY';
            const reference = `${code}-S${prefix}${String(this.counter).padStart(4, '0')}`;
            db.prepare(`INSERT INTO transactions (reference, account_id, related_account_id, type, amount, currency, direction, status, description, created_at, category, counterparty, card_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?)`).run(reference, entry.accountId, entry.related, entry.type, entry.cents, entry.currency, entry.direction, entry.description, sqlTime(entry.at), entry.category, entry.counterparty, entry.cardId);
        });
        balances.forEach((cents, accountId) => {
            db.prepare('UPDATE accounts SET balance = balance + ?, available_balance = available_balance + ? WHERE id = ?').run(cents, cents, accountId);
        });
        return { entries: ordered.filter(entry => !entry.skipped).length };
    }
}

function ensureAccount(db, userId, { type = 'checking', purpose = 'personal', currency = 'USD', nickname = '' }) {
    const existing = db.prepare('SELECT * FROM accounts WHERE user_id = ? AND account_type = ? AND purpose = ? AND currency = ? AND status = ? ORDER BY id LIMIT 1').get(userId, type, purpose, currency, 'active');
    if (existing) return existing;
    const count = db.prepare('SELECT COUNT(*) AS count FROM accounts WHERE user_id = ?').get(userId).count;
    if (count >= 10) return null;
    const result = db.prepare('INSERT INTO accounts (user_id, account_number, account_type, purpose, nickname, balance, available_balance, currency, status) VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)').run(userId, uniqueAccountNumber(db), type, purpose, nickname, currency, 'active');
    return db.prepare('SELECT * FROM accounts WHERE id = ?').get(result.lastInsertRowid);
}

function ensureCard(db, accountId, { form, nickname, design, holder }) {
    const existing = db.prepare("SELECT id FROM cards WHERE account_id = ? AND form = ? AND status IN ('active', 'frozen') ORDER BY id LIMIT 1").get(accountId, form);
    if (existing) return existing.id;
    const exp = new Date();
    exp.setFullYear(exp.getFullYear() + 3);
    const result = db.prepare(`INSERT INTO cards (account_id, card_type, last_four, expiration_date, status, daily_limit, form, nickname, design, holder_name)
        VALUES (?, 'debit', ?, ?, 'active', 500000, ?, ?, ?, ?)`).run(accountId, String(crypto.randomInt(1000, 10000)), `${String(exp.getMonth() + 1).padStart(2, '0')}/${exp.getFullYear()}`, form, nickname, design, holder);
    return result.lastInsertRowid;
}

function personalActivity(ledger, ids, community, random) {
    const { checking, savings, travel, cardId, virtualCardId } = ids;
    const vary = (base, spread) => Math.round((base + (random() - 0.5) * spread) * 100) / 100;
    // Opening funds and income
    ledger.add(checking.id, { days: 84, hour: 9, type: 'deposit', direction: 'credit', amount: 3200, description: 'Opening demo funds', category: 'income' });
    ledger.add(savings.id, { days: 84, hour: 9, minute: 5, type: 'deposit', direction: 'credit', amount: 6200, description: 'Opening demo savings', category: 'income' });
    for (let days = 80; days >= 0; days -= 15) {
        ledger.add(checking.id, { days, hour: 7, minute: 30, type: 'deposit', direction: 'credit', amount: 2475, description: 'Salary — Northwind Studio', category: 'income', counterparty: 'Northwind Studio' });
    }
    // Housing, bills and subscriptions (monthly)
    [78, 48, 18].forEach(days => {
        ledger.add(checking.id, { days, hour: 9, type: 'payment', direction: 'debit', amount: 1650, description: 'Rent — Riverside Apartments', category: 'housing' });
        ledger.add(checking.id, { days: days - 2, hour: 10, type: 'payment', direction: 'debit', amount: vary(84, 18), description: 'Brightline Electricity', category: 'bills' });
        ledger.add(checking.id, { days: days - 3, hour: 10, type: 'payment', direction: 'debit', amount: 59, description: 'Fibrewave Internet', category: 'bills' });
        ledger.add(checking.id, { days: days - 4, hour: 11, type: 'payment', direction: 'debit', amount: 35, description: 'Telnova mobile plan', category: 'bills' });
        ledger.add(checking.id, { days: days - 5, hour: 20, type: 'payment', direction: 'debit', amount: 15.99, description: 'Streamhouse subscription', category: 'entertainment', cardId: virtualCardId });
        ledger.add(checking.id, { days: days - 1, hour: 18, type: 'payment', direction: 'debit', amount: 49, description: 'Peak Fitness membership', category: 'health', cardId });
        ledger.add(checking.id, { days: days - 1, hour: 8, type: 'payment', direction: 'debit', amount: 90, description: 'Metro transit pass', category: 'transport', cardId });
    });
    // Monthly move to savings (paired ledger entries)
    [76, 46, 16].forEach(days => {
        ledger.add(checking.id, { days, hour: 8, type: 'transfer', direction: 'debit', amount: 500, description: 'Transfer to Savings', category: 'transfers', related: savings.id });
        ledger.add(savings.id, { days, hour: 8, minute: 1, type: 'transfer', direction: 'credit', amount: 500, description: 'Transfer from Checking', category: 'transfers', related: checking.id });
    });
    // Everyday spending
    for (let days = 83; days >= 0; days -= 1) {
        if (days % 7 === 2) ledger.add(checking.id, { days, hour: 17, minute: 40, type: 'payment', direction: 'debit', amount: vary(96, 70), description: days % 14 === 2 ? 'Market Street Grocer' : 'Green Leaf Market', category: 'groceries', cardId });
        if (days % 3 === 0) ledger.add(checking.id, { days, hour: 8, minute: 15, type: 'payment', direction: 'debit', amount: vary(5.4, 2), description: 'Copper Kettle Café', category: 'dining', cardId });
        if (days % 9 === 4) ledger.add(checking.id, { days, hour: 20, minute: 10, type: 'payment', direction: 'debit', amount: vary(62, 40), description: days % 18 === 4 ? 'Bistro Lumière' : 'Sora Sushi Bar', category: 'dining', cardId });
        if (days % 11 === 6) ledger.add(checking.id, { days, hour: 22, minute: 5, type: 'payment', direction: 'debit', amount: vary(19, 12), description: 'City Rides', category: 'transport', cardId });
        if (days % 17 === 8) ledger.add(checking.id, { days, hour: 13, type: 'payment', direction: 'debit', amount: vary(88, 90), description: days % 34 === 8 ? 'Atelier Clothing' : 'Northside Books', category: 'shopping', cardId: days % 34 === 8 ? cardId : virtualCardId });
        if (days % 23 === 10) ledger.add(checking.id, { days, hour: 19, type: 'payment', direction: 'debit', amount: 24, description: 'Orpheum Cinema', category: 'entertainment', cardId });
        if (days % 26 === 12) ledger.add(checking.id, { days, hour: 12, type: 'payment', direction: 'debit', amount: vary(21, 12), description: 'Wellness Pharmacy', category: 'health', cardId });
    }
    ledger.add(checking.id, { days: 33, hour: 16, type: 'withdrawal', direction: 'debit', amount: 120, description: 'ATM withdrawal', category: 'cash', cardId });
    // Money with friends — paired with real community accounts
    const friend = community[0];
    const friendAccount = friend && ledger.db.prepare("SELECT id FROM accounts WHERE user_id = ? AND currency = 'USD' ORDER BY id LIMIT 1").get(friend.id);
    if (friendAccount) {
        ledger.add(checking.id, { days: 12, hour: 21, type: 'transfer', direction: 'debit', amount: 45, description: 'Dinner — Maria Silva', category: 'transfers', related: friendAccount.id, counterparty: 'Maria Silva' });
        ledger.add(friendAccount.id, { days: 12, hour: 21, minute: 1, type: 'transfer', direction: 'credit', amount: 45, description: 'Transfer from Willow customer', category: 'transfers', related: checking.id });
    }
    const second = community[1];
    const secondAccount = second && ledger.db.prepare("SELECT id FROM accounts WHERE user_id = ? AND currency = 'USD' ORDER BY id LIMIT 1").get(second.id);
    if (secondAccount) {
        ledger.add(secondAccount.id, { days: 6, hour: 11, type: 'deposit', direction: 'credit', amount: 60, description: 'Opening demo funds', category: 'income' });
        ledger.add(secondAccount.id, { days: 5, hour: 18, type: 'transfer', direction: 'debit', amount: 60, description: 'Transfer to Willow customer', category: 'transfers', related: checking.id });
        ledger.add(checking.id, { days: 5, hour: 18, minute: 1, type: 'transfer', direction: 'credit', amount: 60, description: 'Concert tickets — Daniel Okafor', category: 'transfers', related: secondAccount.id, counterparty: 'Daniel Okafor' });
    }
    // Travel in euros
    if (travel) {
        ledger.add(travel.id, { days: 40, hour: 10, type: 'deposit', direction: 'credit', amount: 900, description: 'Demo funds added for travel', category: 'income', currency: 'EUR' });
        ledger.add(travel.id, { days: 27, hour: 15, type: 'payment', direction: 'debit', amount: 186, description: 'Hotel Lumen Lisbon', category: 'travel', currency: 'EUR' });
        ledger.add(travel.id, { days: 26, hour: 9, type: 'payment', direction: 'debit', amount: 12.4, description: 'Café Brasileira', category: 'dining', currency: 'EUR' });
        ledger.add(travel.id, { days: 26, hour: 12, type: 'payment', direction: 'debit', amount: 6.8, description: 'Metro Lisboa', category: 'transport', currency: 'EUR' });
        ledger.add(travel.id, { days: 25, hour: 20, type: 'payment', direction: 'debit', amount: 58, description: 'Taberna da Rua', category: 'dining', currency: 'EUR' });
    }
    ledger.add(checking.id, { days: 31, hour: 14, type: 'payment', direction: 'debit', amount: 420, description: 'Skyway Airlines', category: 'travel', cardId });
}

function businessActivity(ledger, business, cardId) {
    ledger.add(business.id, { days: 82, hour: 9, type: 'deposit', direction: 'credit', amount: 12000, description: 'Opening business demo funds', category: 'business' });
    [70, 52, 36, 21, 8].forEach((days, index) => {
        ledger.add(business.id, { days, hour: 10, type: 'deposit', direction: 'credit', amount: [4200, 2850, 5600, 3100, 4750][index], description: `Client payment — ${['Harbor & Pine', 'Lumen Health', 'Atlas Freight', 'Fernwood Hotels', 'Kestrel Labs'][index]}`, category: 'income', counterparty: ['Harbor & Pine', 'Lumen Health', 'Atlas Freight', 'Fernwood Hotels', 'Kestrel Labs'][index] });
    });
    [74, 44, 14].forEach(days => {
        ledger.add(business.id, { days, hour: 9, type: 'payment', direction: 'debit', amount: 1800, description: 'Studio rent — Dockside Works', category: 'housing' });
        ledger.add(business.id, { days: days - 1, hour: 9, type: 'payment', direction: 'debit', amount: 129, description: 'Cloudframe software', category: 'business', cardId });
        ledger.add(business.id, { days: days - 2, hour: 11, type: 'payment', direction: 'debit', amount: 2400, description: 'Contractor — Ines Duarte', category: 'business' });
    });
    [60, 30, 4].forEach(days => ledger.add(business.id, { days, hour: 15, type: 'payment', direction: 'debit', amount: 386, description: 'Paper & Ink Supplies', category: 'business', cardId }));
}

function seedGoals(db, userId) {
    if (db.prepare('SELECT COUNT(*) AS count FROM demo_goals WHERE user_id = ?').get(userId).count) return;
    [
        ['Emergency fund', 'savings', 1000000, 720000],
        ['Home deposit', 'home', 6000000, 1850000],
        ['Lisbon in spring', 'travel', 320000, 145000],
        ['Long-term investing', 'investing', 1500000, 620000],
    ].forEach(([name, category, target, current]) => {
        db.prepare('INSERT INTO demo_goals (user_id, name, category, target_cents, current_cents) VALUES (?, ?, ?, ?, ?)').run(userId, name, category, target, current);
    });
}

function seedPayees(db, userId, community) {
    community.slice(0, 4).forEach((person, index) => {
        db.prepare('INSERT OR IGNORE INTO payees (user_id, recipient_user_id, nickname, last_paid_at) VALUES (?, ?, ?, ?)').run(userId, person.id, index === 0 ? 'Maria (flatmate)' : '', index < 2 ? sqlTime(daysAgo(index === 0 ? 12 : 5, 21, 0)) : null);
    });
}

function seedScheduled(db, userId, checking, savings) {
    const exists = db.prepare("SELECT id FROM scheduled_transfers WHERE user_id = ? AND status = 'pending'").get(userId);
    if (exists) return;
    const soon = new Date();
    soon.setUTCDate(soon.getUTCDate() + 3);
    soon.setUTCHours(8, 0, 0, 0);
    db.prepare('INSERT INTO scheduled_transfers (user_id, from_account_id, to_account_id, amount, description, scheduled_for) VALUES (?, ?, ?, ?, ?, ?)').run(userId, checking.id, savings.id, 50000, 'Monthly savings', soon.toISOString());
}

function seedBusiness(db, userId, business, ownerName) {
    db.prepare("INSERT OR IGNORE INTO business_profiles (user_id, name, industry, country) VALUES (?, ?, 'Design studio', 'United States')").run(userId, `${ownerName.split(' ').pop()} & Co. Studio`);
    const today = new Date();
    const date = offset => new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + offset)).toISOString().slice(0, 10);
    const invoices = [
        ['INV-1041', 'Harbor & Pine', 'Brand identity refresh', 420000, -40, -10, 'paid'],
        ['INV-1042', 'Kestrel Labs', 'Product launch campaign', 475000, -20, 5, 'paid'],
        ['INV-1043', 'Fernwood Hotels', 'Website art direction', 365000, -12, 9, 'open'],
        ['INV-1044', 'Orchard Books', 'Catalogue design', 128000, -35, -5, 'open'],
    ];
    invoices.forEach(([number, customer, description, amount, issued, due, status]) => {
        db.prepare(`INSERT OR IGNORE INTO business_invoices (user_id, number, customer_name, customer_email, description, amount, currency, issued_on, due_on, status, paid_at)
            VALUES (?, ?, ?, ?, ?, ?, 'USD', ?, ?, ?, ?)`).run(userId, number, customer, `accounts@${customer.toLowerCase().replace(/[^a-z]+/g, '')}.example`, description, amount, date(issued), date(due), status, status === 'paid' ? sqlTime(daysAgo(Math.abs(due) + 2, 10, 0)) : null);
    });
    [['Ines Duarte', 'ines.duarte@studio.example', 'cardholder'], ['Tom Reyes', 'tom.reyes@studio.example', 'approver']].forEach(([name, email, role]) => {
        db.prepare('INSERT OR IGNORE INTO business_team_members (user_id, name, email, role) VALUES (?, ?, ?, ?)').run(userId, name, email, role);
    });
}

async function seedPortfolio(db, userId) {
    const existing = db.prepare('SELECT COUNT(*) AS count FROM demo_trades WHERE user_id = ?').get(userId).count;
    if (existing) return { seeded: false, reason: 'existing' };
    const purchases = [];
    for (const item of SAMPLE_PORTFOLIO) {
        try {
            const history = await marketData.getHistory(item.symbol, '6m');
            const target = Date.now() - 92 * 86400000;
            const point = history.points.reduce((best, current) => (Math.abs(new Date(current.t) - target) < Math.abs(new Date(best.t) - target) ? current : best), history.points[0]);
            if (!point || !point.close) continue;
            const decimals = item.symbol === 'BTC' || item.symbol === 'ETH' ? 8 : 4;
            const quantity = Number((item.usd / point.close).toFixed(decimals));
            if (quantity <= 0) continue;
            purchases.push({ symbol: item.symbol, quantity, price: point.close, at: new Date(point.t) });
        } catch (error) { /* market data unavailable for this asset — skip it */ }
    }
    if (!purchases.length) return { seeded: false, reason: 'market_data_unavailable' };
    db.transaction(() => {
        db.prepare('INSERT OR IGNORE INTO demo_portfolios (user_id) VALUES (?)').run(userId);
        db.prepare("UPDATE demo_portfolios SET created_at = ? WHERE user_id = ?").run(sqlTime(new Date(Date.now() - 100 * 86400000)), userId);
        purchases.sort((a, b) => a.at - b.at).forEach(purchase => {
            const totalCents = Math.round(purchase.quantity * purchase.price * 100);
            const portfolio = db.prepare('SELECT cash_cents FROM demo_portfolios WHERE user_id = ?').get(userId);
            if (portfolio.cash_cents < totalCents) return;
            db.prepare('UPDATE demo_portfolios SET cash_cents = cash_cents - ? WHERE user_id = ?').run(totalCents, userId);
            db.prepare(`INSERT INTO demo_holdings (user_id, symbol, quantity, average_price) VALUES (?, ?, ?, ?)
                ON CONFLICT(user_id, symbol) DO UPDATE SET quantity = demo_holdings.quantity + excluded.quantity, average_price = ((demo_holdings.quantity * demo_holdings.average_price) + (excluded.quantity * excluded.average_price)) / (demo_holdings.quantity + excluded.quantity)`)
                .run(userId, purchase.symbol, purchase.quantity, purchase.price);
            db.prepare('INSERT INTO demo_trades (user_id, symbol, side, quantity, price, total_cents, created_at) VALUES (?, ?, \'buy\', ?, ?, ?, ?)').run(userId, purchase.symbol, purchase.quantity, purchase.price, totalCents, sqlTime(purchase.at));
        });
        db.prepare('INSERT OR IGNORE INTO demo_watchlist (user_id, symbol) VALUES (?, ?)').run(userId, 'AMZN');
        db.prepare('INSERT OR IGNORE INTO demo_watchlist (user_id, symbol) VALUES (?, ?)').run(userId, 'SOL');
        db.prepare('INSERT OR IGNORE INTO demo_watchlist (user_id, symbol) VALUES (?, ?)').run(userId, 'QQQ');
    })();
    return { seeded: true, assets: purchases.length };
}

/**
 * Loads sample activity into a profile. Options: { business: boolean }.
 * Returns a summary; throws if already loaded.
 */
async function loadSampleData(userId, options = {}) {
    const db = getDb();
    const prefs = preferences.ensure(userId);
    if (prefs.sample_data_loaded_at) {
        const error = new Error('Sample activity has already been added to this profile.');
        error.status = 409;
        throw error;
    }
    const user = db.prepare('SELECT id, full_name, status FROM users WHERE id = ?').get(userId);
    if (!user || user.status !== 'active') throw new Error('An active profile is required.');
    const community = await ensureCommunity();
    const random = rng(userId * 7919 + 17);

    db.transaction(() => {
        const checking = ensureAccount(db, userId, { type: 'checking' });
        const savings = ensureAccount(db, userId, { type: 'savings' });
        const travel = ensureAccount(db, userId, { type: 'checking', currency: 'EUR', nickname: 'Travel euros' });
        const hasBusiness = options.business || db.prepare("SELECT id FROM accounts WHERE user_id = ? AND purpose = 'business'").get(userId);
        const business = hasBusiness ? ensureAccount(db, userId, { type: 'checking', purpose: 'business', nickname: 'Studio operating' }) : null;
        if (!checking || !savings) throw new Error('Open a checking and savings account first.');
        const cardId = ensureCard(db, checking.id, { form: 'physical', nickname: '', design: 'forest', holder: user.full_name });
        const virtualCardId = ensureCard(db, checking.id, { form: 'virtual', nickname: 'Online shopping', design: 'ivory', holder: user.full_name });
        const ledger = new Ledger(db, userId);
        personalActivity(ledger, { checking, savings, travel, cardId, virtualCardId }, community, random);
        if (business) {
            const businessCard = ensureCard(db, business.id, { form: 'virtual', nickname: 'Studio expenses', design: 'graphite', holder: user.full_name });
            businessActivity(ledger, business, businessCard);
            seedBusiness(db, userId, business, user.full_name);
        }
        ledger.commit();
        seedGoals(db, userId);
        seedPayees(db, userId, community);
        seedScheduled(db, userId, checking, savings);
        [
            ['security', 'Welcome to your Willow demo', 'Sample activity was added so you can explore. Everything here is simulated — no real money moves.'],
            ['card', 'Virtual card ready', 'Your virtual demo card “Online shopping” is ready to manage in Cards.'],
            ['transfer', 'Upcoming scheduled transfer', 'A demo transfer of $500.00 to Savings is scheduled in three days.'],
        ].forEach(([type, title, message]) => db.prepare('INSERT INTO notifications (user_id, type, title, message) VALUES (?, ?, ?, ?)').run(userId, type, title, message));
        db.prepare("UPDATE user_preferences SET sample_data_loaded_at = datetime('now') WHERE user_id = ?").run(userId);
    })();

    let portfolio = { seeded: false };
    try { portfolio = await seedPortfolio(db, userId); } catch (error) { portfolio = { seeded: false, reason: 'market_data_unavailable' }; }
    logAudit({ actorId: userId, action: 'sample_data_loaded', targetType: 'user', targetId: String(userId), metadata: { portfolio: portfolio.seeded, simulated: true } });
    return { loaded: true, portfolio };
}

const GUEST_NAMES = ['Alex Morgan', 'Sam Rivera', 'Jordan Lee', 'Taylor Brooks', 'Riley Chen'];

/** Creates a temporary guest profile with sample activity. Returns the new user. */
async function createGuestProfile() {
    const db = getDb();
    const name = GUEST_NAMES[crypto.randomInt(0, GUEST_NAMES.length)];
    const email = `guest-${crypto.randomBytes(5).toString('hex')}@demo.willow.test`;
    const hash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), config.bcryptRounds);
    const userId = db.transaction(() => {
        const result = db.prepare("INSERT INTO users (email, full_name, phone, password_hash, role, status, customer_id, is_guest) VALUES (?, ?, '', ?, 'customer', 'active', ?, 1)").run(email, name, hash, generateCustomerId(db));
        const id = result.lastInsertRowid;
        db.prepare("INSERT INTO accounts (user_id, account_number, account_type, balance, available_balance, currency, status) VALUES (?, ?, 'checking', 0, 0, 'USD', 'active')").run(id, uniqueAccountNumber(db));
        db.prepare("INSERT INTO accounts (user_id, account_number, account_type, balance, available_balance, currency, status) VALUES (?, ?, 'savings', 0, 0, 'USD', 'active')").run(id, uniqueAccountNumber(db));
        return id;
    })();
    await loadSampleData(userId, { business: true });
    const user = db.prepare('SELECT id, email, full_name, role, auth_version, customer_id FROM users WHERE id = ?').get(userId);
    return user;
}

module.exports = { loadSampleData, createGuestProfile, ensureCommunity, COMMUNITY };
