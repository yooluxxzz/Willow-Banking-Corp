/**
 * One definition of spending and income, shared by Home, the Net worth page, budgets
 * and the assistant, so the same money is counted the same way everywhere.
 *
 * Spending is money that went to someone else: payments, withdrawals, debt payments,
 * business expenses paid from an account, and money sent to another customer. Income
 * is money that arrived from outside. Neither includes moves between the customer's
 * own accounts, cash moved into or out of investing, or currency conversions: that
 * money is still theirs. Amounts are US dollars; months follow the server's local
 * calendar, as budgets do.
 */
const { getDb } = require('../database');

const sqlUtc = date => date.toISOString().replace('T', ' ').slice(0, 19);

/** Local calendar month `offset` months from now, as UTC SQL bounds plus a label. */
function monthBounds(offset = 0, now = new Date()) {
    const startDate = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const endDate = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1);
    return {
        start: sqlUtc(startDate),
        end: sqlUtc(endDate),
        startDate,
        endDate,
        label: startDate.toLocaleDateString('en-US', { month: 'short' }),
        key: `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`,
    };
}

/** Completed US-dollar ledger rows between two UTC SQL timestamps, newest first, with who the other side belongs to. */
function ledgerRows(userId, from, to, { purpose = null } = {}) {
    const params = [userId, from, to];
    if (purpose) params.push(purpose);
    return getDb().prepare(`SELECT t.id, t.description, t.type, t.direction, t.amount, t.currency, t.created_at, t.category, t.account_id, t.counterparty, t.reference,
            (SELECT r.user_id FROM accounts r WHERE r.id = t.related_account_id) AS related_owner
        FROM transactions t JOIN accounts a ON a.id = t.account_id
        WHERE a.user_id = ? AND t.status = 'completed' AND COALESCE(t.currency, 'USD') = 'USD'
          AND t.created_at >= ? AND t.created_at < ? ${purpose ? 'AND a.purpose = ?' : ''}
        ORDER BY t.created_at DESC, t.id DESC`).all(...params);
}

/** Money that moved but stayed the customer's own. */
const staysWithCustomer = (row, userId) => row.related_owner === userId || row.category === 'investing' || /^(CNV|INV-IN|INV-OUT)-/.test(row.reference || '');
const isSpending = (row, userId) => row.direction === 'debit' && !staysWithCustomer(row, userId);
const isIncome = (row, userId) => row.direction === 'credit' && !staysWithCustomer(row, userId);
const total = rows => rows.reduce((sum, row) => sum + row.amount, 0);

module.exports = { monthBounds, ledgerRows, isSpending, isIncome, total, sqlUtc };
