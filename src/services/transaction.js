/**
 * Transaction service — queries, filtering, pagination
 */
const { getDb } = require('../database');
const { formatCurrency, fromCents } = require('../middleware/validation');
const { categorize, categoryMeta } = require('./categories');

function getTransactions(accountId, { page = 1, limit = 20, type, status, search, dateFrom, dateTo, sort = 'desc' } = {}) {
    const db = getDb();
    const offset = (page - 1) * limit;
    const conditions = ['t.account_id = ?'];
    const params = [accountId];

    if (type) {
        conditions.push('t.type = ?');
        params.push(type);
    }
    if (status) {
        conditions.push('t.status = ?');
        params.push(status);
    }
    if (search) {
        conditions.push('(t.description LIKE ? OR t.reference LIKE ?)');
        params.push(`%${search}%`, `%${search}%`);
    }
    if (dateFrom) {
        conditions.push('t.created_at >= ?');
        params.push(dateFrom);
    }
    if (dateTo) {
        conditions.push('t.created_at <= ?');
        params.push(dateTo + ' 23:59:59');
    }

    const where = conditions.join(' AND ');
    const orderDir = sort === 'asc' ? 'ASC' : 'DESC';

    const countResult = db.prepare(`SELECT COUNT(*) as total FROM transactions t WHERE ${where}`).get(...params);
    const total = countResult.total;

    const rows = db.prepare(`
    SELECT t.*, ra.account_number as related_account_number
    FROM transactions t
    LEFT JOIN accounts ra ON t.related_account_id = ra.id
    WHERE ${where}
    ORDER BY t.created_at ${orderDir}, t.id ${orderDir}
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

    return {
        transactions: rows.map(formatTransaction),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
    };
}

function getTransactionById(transactionId, accountId) {
    const db = getDb();
    const txn = db.prepare(`
    SELECT t.*, ra.account_number as related_account_number
    FROM transactions t
    LEFT JOIN accounts ra ON t.related_account_id = ra.id
    WHERE t.id = ? AND t.account_id = ?
  `).get(transactionId, accountId);
    return txn ? formatTransaction(txn) : null;
}

function getRecentTransactions(accountIds, limit = 5) {
    const db = getDb();
    if (!accountIds.length) return [];
    const placeholders = accountIds.map(() => '?').join(',');
    const rows = db.prepare(`
    SELECT t.*, ra.account_number as related_account_number
    FROM transactions t
    LEFT JOIN accounts ra ON t.related_account_id = ra.id
    WHERE t.account_id IN (${placeholders})
    ORDER BY t.created_at DESC, t.id DESC
    LIMIT ?
  `).all(...accountIds, limit);
    return rows.map(formatTransaction);
}

function formatTransaction(txn) {
    return {
        ...txn,
        amountFormatted: formatCurrency(txn.amount, txn.currency || 'USD'),
        amountDollars: fromCents(txn.amount),
        relatedAccountMasked: txn.related_account_number
            ? '••••' + txn.related_account_number.slice(-4) : null,
        categoryKey: categorize(txn),
        categoryLabel: categoryMeta(categorize(txn)).label,
        categoryIcon: categoryMeta(categorize(txn)).icon,
    };
}

module.exports = { getTransactions, getTransactionById, getRecentTransactions };
