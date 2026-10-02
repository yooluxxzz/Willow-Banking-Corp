const { getDb } = require('../database');

const CATEGORIES = new Set(['savings', 'home', 'travel', 'business', 'investing', 'other']);
const MAX_CENTS = 100000000000;

function amountToCents(value, { allowZero = false } = {}) {
    if (!['string', 'number'].includes(typeof value) || !/^\d+(\.\d{1,2})?$/.test(String(value).trim())) return null;
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0 || (!allowZero && amount === 0) || amount > MAX_CENTS / 100) return null;
    const cents = Math.round(amount * 100);
    return Number.isSafeInteger(cents) ? cents : null;
}

function validateName(name) {
    return typeof name === 'string' && name.trim().length >= 2 && name.trim().length <= 60 && !/[<>\x00-\x1f\x7f]/.test(name);
}

function listGoals(userId) {
    return getDb().prepare('SELECT id, name, category, target_cents, current_cents, created_at, updated_at FROM demo_goals WHERE user_id = ? ORDER BY created_at DESC, id DESC').all(userId);
}

function createGoal(userId, input = {}) {
    if (!validateName(input.name)) throw new Error('Use a goal name from 2 to 60 characters without markup.');
    if (!CATEGORIES.has(input.category)) throw new Error('Choose a supported goal category.');
    const targetCents = amountToCents(input.targetAmount);
    const currentCents = amountToCents(input.currentAmount ?? 0, { allowZero: true });
    if (targetCents === null) throw new Error('Enter a valid target amount greater than zero.');
    if (currentCents === null || currentCents > targetCents) throw new Error('Current progress must be valid and cannot exceed the target.');
    const result = getDb().prepare('INSERT INTO demo_goals (user_id, name, category, target_cents, current_cents) VALUES (?, ?, ?, ?, ?)')
        .run(userId, input.name.trim(), input.category, targetCents, currentCents);
    return getDb().prepare('SELECT id, name, category, target_cents, current_cents, created_at, updated_at FROM demo_goals WHERE id = ? AND user_id = ?').get(result.lastInsertRowid, userId);
}

function updateGoal(userId, id, input = {}) {
    if (!/^[1-9]\d*$/.test(String(id)) || !Number.isSafeInteger(Number(id))) throw new Error('Invalid goal.');
    const existing = getDb().prepare('SELECT id, target_cents, current_cents FROM demo_goals WHERE id = ? AND user_id = ?').get(Number(id), userId);
    if (!existing) return null;
    const currentCents = input.currentAmount === undefined ? existing.current_cents : amountToCents(input.currentAmount, { allowZero: true });
    const targetCents = input.targetAmount === undefined ? existing.target_cents : amountToCents(input.targetAmount);
    if (currentCents === null || targetCents === null || currentCents > targetCents) throw new Error('Enter valid progress and target amounts; progress cannot exceed the target.');
    getDb().prepare('UPDATE demo_goals SET current_cents = ?, target_cents = ?, updated_at = datetime(\'now\') WHERE id = ? AND user_id = ?')
        .run(currentCents, targetCents, Number(id), userId);
    return getDb().prepare('SELECT id, name, category, target_cents, current_cents, created_at, updated_at FROM demo_goals WHERE id = ? AND user_id = ?').get(Number(id), userId);
}

function deleteGoal(userId, id) {
    if (!/^[1-9]\d*$/.test(String(id)) || !Number.isSafeInteger(Number(id))) throw new Error('Invalid goal.');
    return getDb().prepare('DELETE FROM demo_goals WHERE id = ? AND user_id = ?').run(Number(id), userId).changes === 1;
}

module.exports = { listGoals, createGoal, updateGoal, deleteGoal };