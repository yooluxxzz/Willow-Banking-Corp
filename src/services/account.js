/**
 * Account service — retrieval and management
 */
const { getDb } = require('../database');
const { randomInt } = require('crypto');
const { logAudit } = require('./audit');
const { CURRENCIES, isSupportedCurrency, formatMoney } = require('./currencies');

const PRODUCTS = ['checking', 'savings', 'business', 'currency'];

function openAccount(userId, input = {}) {
    const { product, nickname = '', requestKey, demoAcknowledged } = input;
    if (!PRODUCTS.includes(product)) return { error: 'Choose checking, savings, business checking or a currency account.' };
    const currency = product === 'currency' ? input.currency : 'USD';
    if (product === 'currency' && (!isSupportedCurrency(currency) || currency === 'USD')) return { error: 'Choose EUR, GBP, MZN or ZAR for a currency account.' };
    if (typeof nickname !== 'string' || nickname.trim().length > 40 || /[<>\x00-\x1f\x7f]/.test(nickname)) return { error: 'Use an account name of up to 40 characters without markup.' };
    if (demoAcknowledged !== true) return { error: 'Confirm that this is a simulated account.' };
    if (typeof requestKey !== 'string' || !/^[a-f0-9-]{36}$/i.test(requestKey)) return { error: 'Refresh this page before opening an account.' };
    const db = getDb();
    const type = product === 'savings' ? 'savings' : 'checking';
    const purpose = product === 'business' ? 'business' : 'personal';
    return db.transaction(() => {
        const user = db.prepare('SELECT email, status FROM users WHERE id = ?').get(userId);
        if (!user || user.status !== 'active') return { error: 'An active profile is required.' };
        const existing = db.prepare('SELECT * FROM accounts WHERE user_id = ? AND opening_key = ?').get(userId, requestKey);
        if (existing) {
            if (existing.account_type !== type || existing.purpose !== purpose || existing.nickname !== nickname.trim() || existing.currency !== currency) return { error: 'This request has already been used. Refresh to start another account.' };
            return { account: formatAccount(existing), reused: true };
        }
        if (db.prepare('SELECT COUNT(*) AS count FROM accounts WHERE user_id = ?').get(userId).count >= 10) return { error: 'This demo supports up to 10 accounts per profile.' };
        const number = uniqueAccountNumber(db);
        const created = db.prepare('INSERT INTO accounts (user_id, account_number, account_type, purpose, nickname, opening_key, balance, available_balance, currency) VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?)').run(userId, number, type, purpose, nickname.trim(), requestKey, currency);
        logAudit({ actorId: userId, actorEmail: user.email, action: 'account_opened', targetType: 'account', targetId: String(created.lastInsertRowid), metadata: { product, currency, simulated: true } });
        return { account: getAccountById(created.lastInsertRowid, userId), reused: false };
    })();
}

function uniqueAccountNumber(db) {
    let number;
    do { number = '4200' + String(randomInt(1000000000, 10000000000)); }
    while (db.prepare('SELECT id FROM accounts WHERE account_number = ?').get(number));
    return number;
}

function getUserAccounts(userId) {
    const db = getDb();
    const accounts = db.prepare('SELECT * FROM accounts WHERE user_id = ? ORDER BY created_at ASC, id ASC').all(userId);
    return accounts.map(formatAccount);
}

function getAccountById(accountId, userId) {
    const db = getDb();
    const account = db.prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?').get(accountId, userId);
    return account ? formatAccount(account) : null;
}

function getAccountByNumber(accountNumber) {
    const db = getDb();
    const account = db.prepare(`
    SELECT a.*, u.full_name as owner_name, u.email as owner_email, u.status as user_status
    FROM accounts a
    JOIN users u ON a.user_id = u.id
    WHERE a.account_number = ?
  `).get(accountNumber);
    return account || null;
}

/** USD totals plus a per-currency breakdown of active accounts. */
function getTotalBalance(userId) {
    const db = getDb();
    const rows = db.prepare(`
    SELECT currency, COALESCE(SUM(balance), 0) as total, COALESCE(SUM(available_balance), 0) as available, COUNT(*) AS count
    FROM accounts WHERE user_id = ? AND status = 'active' GROUP BY currency ORDER BY currency
  `).all(userId);
    const usd = rows.find(row => row.currency === 'USD') || { total: 0, available: 0, count: 0 };
    const byCurrency = rows.map(row => ({
        currency: row.currency,
        total: row.total,
        available: row.available,
        count: row.count,
        totalFormatted: formatMoney(row.total, row.currency),
        availableFormatted: formatMoney(row.available, row.currency),
    }));
    return {
        total: usd.total,
        available: usd.available,
        totalFormatted: formatMoney(usd.total, 'USD'),
        availableFormatted: formatMoney(usd.available, 'USD'),
        byCurrency,
        foreign: byCurrency.filter(row => row.currency !== 'USD'),
    };
}

function productLabel(account) {
    if (account.purpose === 'business') return 'Business checking';
    if (account.currency && account.currency !== 'USD') return `${account.currency} account`;
    return account.account_type === 'savings' ? 'Savings account' : 'Checking account';
}

function formatAccount(account) {
    const { opening_key, ...publicAccount } = account;
    const label = productLabel(account);
    const currency = account.currency || 'USD';
    return {
        ...publicAccount,
        currency,
        currencyName: CURRENCIES[currency] ? CURRENCIES[currency].name : currency,
        productLabel: label,
        kind: account.purpose === 'business' ? 'business' : currency !== 'USD' ? 'currency' : account.account_type,
        displayName: account.nickname || label,
        balanceFormatted: formatMoney(account.balance, currency),
        availableBalanceFormatted: formatMoney(account.available_balance, currency),
        maskedNumber: '••••' + account.account_number.slice(-4),
    };
}

module.exports = { getUserAccounts, getAccountById, getAccountByNumber, getTotalBalance, formatAccount, openAccount, uniqueAccountNumber, PRODUCTS };
