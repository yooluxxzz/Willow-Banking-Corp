const { getDb } = require('../database');
const { ValidationError } = require('../errors');
const { parseCents } = require('../middleware/validation');

const CATEGORIES = new Set(['savings', 'home', 'travel', 'business', 'investing', 'other']);
const MAX_CENTS = 100000000000;

const amountToCents = (value, { allowZero = false } = {}) => parseCents(value, { allowZero, max: MAX_CENTS });

function validateName(name) {
    return typeof name === 'string' && name.trim().length >= 2 && name.trim().length <= 60 && !/[<>\x00-\x1f\x7f]/.test(name);
}

function fundingAccount(userId, accountId) {
    if (!/^[1-9]\d*$/.test(String(accountId)) || !Number.isSafeInteger(Number(accountId))) return null;
    return getDb().prepare("SELECT id, account_type, nickname, currency, status, balance, available_balance, account_number FROM accounts WHERE id = ? AND user_id = ? AND purpose = 'personal' AND currency = 'USD' AND status = 'active'")
        .get(Number(accountId), userId) || null;
}

function accountForGoal(userId, accountId) {
    const account = fundingAccount(userId, accountId);
    if (!account) throw new ValidationError('Choose an active personal USD checking or savings account for this goal.');
    return account;
}

function ensureAccountAvailable(userId, accountId, goalId = null) {
    const existing = getDb().prepare('SELECT id FROM demo_goals WHERE user_id = ? AND account_id = ? AND id != ?').get(userId, accountId, goalId || 0);
    if (existing) throw new ValidationError('That account is already funding another goal. Use another account so each goal has its own real balance.');
}

function formatGoal(row) {
    const currentCents = Math.min(Number(row.target_cents), Math.max(0, Number(row.account_available_balance || 0)));
    return {
        id: row.id,
        name: row.name,
        category: row.category,
        target_cents: row.target_cents,
        current_cents: currentCents,
        account_id: row.account_id,
        account_name: row.account_name || null,
        account_masked: row.account_number ? '••••' + String(row.account_number).slice(-4) : null,
        account_balance: row.account_balance ?? null,
        account_available_balance: row.account_available_balance ?? null,
        account_currency: row.account_currency || null,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}

function listGoals(userId) {
    const rows = getDb().prepare("SELECT g.id, g.name, g.category, g.target_cents, g.account_id, g.created_at, g.updated_at, a.nickname AS account_name, a.account_number, a.balance AS account_balance, a.available_balance AS account_available_balance, a.currency AS account_currency FROM demo_goals g LEFT JOIN accounts a ON a.id = g.account_id AND a.user_id = g.user_id AND a.purpose = 'personal' AND a.currency = 'USD' WHERE g.user_id = ? ORDER BY g.created_at DESC, g.id DESC").all(userId);
    return rows.map(formatGoal);
}

function createGoal(userId, input = {}) {
    if (!validateName(input.name)) throw new ValidationError('Use a goal name from 2 to 60 characters without markup.');
    if (!CATEGORIES.has(input.category)) throw new ValidationError('Choose a supported goal category.');
    const targetCents = amountToCents(input.targetAmount);
    if (targetCents === null) throw new ValidationError('Enter a valid target amount greater than zero.');
    const account = accountForGoal(userId, input.accountId);
    ensureAccountAvailable(userId, account.id);
    const result = getDb().prepare('INSERT INTO demo_goals (user_id, account_id, name, category, target_cents, current_cents) VALUES (?, ?, ?, ?, ?, 0)')
        .run(userId, account.id, input.name.trim(), input.category, targetCents);
    return listGoals(userId).find(goal => goal.id === Number(result.lastInsertRowid));
}

function updateGoal(userId, id, input = {}) {
    if (!/^[1-9]\d*$/.test(String(id)) || !Number.isSafeInteger(Number(id))) throw new ValidationError('Invalid goal.');
    const existing = getDb().prepare('SELECT id, account_id, target_cents FROM demo_goals WHERE id = ? AND user_id = ?').get(Number(id), userId);
    if (!existing) return null;
    const targetCents = input.targetAmount === undefined ? existing.target_cents : amountToCents(input.targetAmount);
    if (targetCents === null) throw new ValidationError('Enter a valid target amount greater than zero.');
    const accountId = input.accountId === undefined ? existing.account_id : Number(input.accountId);
    const account = accountForGoal(userId, accountId);
    ensureAccountAvailable(userId, account.id, Number(id));
    getDb().prepare("UPDATE demo_goals SET account_id = ?, target_cents = ?, current_cents = 0, updated_at = datetime('now') WHERE id = ? AND user_id = ?")
        .run(account.id, targetCents, Number(id), userId);
    return listGoals(userId).find(goal => goal.id === Number(id));
}

function deleteGoal(userId, id) {
    if (!/^[1-9]\d*$/.test(String(id)) || !Number.isSafeInteger(Number(id))) throw new ValidationError('Invalid goal.');
    return getDb().prepare('DELETE FROM demo_goals WHERE id = ? AND user_id = ?').run(Number(id), userId).changes === 1;
}

module.exports = { listGoals, createGoal, updateGoal, deleteGoal };