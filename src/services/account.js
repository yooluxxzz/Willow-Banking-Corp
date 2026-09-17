/**
 * Account service — retrieval and management
 */
const { getDb } = require('../database');
const { fromCents, formatCurrency } = require('../middleware/validation');

function getUserAccounts(userId) {
    const db = getDb();
    const accounts = db.prepare(`
    SELECT * FROM accounts WHERE user_id = ? ORDER BY created_at ASC
  `).all(userId);

    return accounts.map(formatAccount);
}

function getAccountById(accountId, userId) {
    const db = getDb();
    const account = db.prepare(`
    SELECT * FROM accounts WHERE id = ? AND user_id = ?
  `).get(accountId, userId);

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

function getTotalBalance(userId) {
    const db = getDb();
    const result = db.prepare(`
    SELECT COALESCE(SUM(balance), 0) as total, COALESCE(SUM(available_balance), 0) as available
    FROM accounts WHERE user_id = ? AND status = 'active'
  `).get(userId);

    return {
        total: result.total,
        available: result.available,
        totalFormatted: formatCurrency(result.total),
        availableFormatted: formatCurrency(result.available),
    };
}

function formatAccount(account) {
    return {
        ...account,
        balanceFormatted: formatCurrency(account.balance),
        availableBalanceFormatted: formatCurrency(account.available_balance),
        maskedNumber: '••••' + account.account_number.slice(-4),
    };
}

module.exports = { getUserAccounts, getAccountById, getAccountByNumber, getTotalBalance, formatAccount };
