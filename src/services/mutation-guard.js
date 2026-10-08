/** Revalidate request authorization at the synchronous mutation boundary. */
const { AsyncLocalStorage } = require('node:async_hooks');
const { getDb } = require('../database');
const { ValidationError } = require('../errors');
const config = require('../config');
const { scaledLimit } = require('./currencies');
const { formatCurrency } = require('../middleware/validation');
const context = new AsyncLocalStorage();

function requestContext(req, res, next) {
    context.run({ userId: req.session?.userId, authVersion: req.session?.authVersion }, next);
}

function assertUser(userId) {
    const user = getDb().prepare('SELECT status, auth_version FROM users WHERE id = ?').get(userId);
    const expected = context.getStore();
    if (!user || user.status !== 'active' || (expected?.userId === userId && expected.authVersion !== undefined && expected.authVersion !== user.auth_version)) {
        throw new ValidationError('Your authorization changed. Please sign in again.', 401, 'authorization_changed');
    }
    if (expected?.assistant) {
        const permission = getDb().prepare('SELECT assistant_autonomy, assistant_revision FROM user_preferences WHERE user_id = ?').get(userId);
        const mode = permission?.assistant_autonomy || 'confirm';
        if (expected.revision !== undefined && expected.revision !== (permission?.assistant_revision || 0)) throw new ValidationError('Ask Willow permissions changed. Prepare this action again.', 403, 'autonomy_changed');
        if (mode === 'read_only' || (!expected.confirmed && mode !== 'autonomous')) {
            throw new ValidationError('Ask Willow permissions changed. Prepare this action again.', 403, 'autonomy_changed');
        }
    }
    return user;
}

function assistantAction(confirmed, fn, revision) {
    return context.run({ ...context.getStore(), assistant: true, confirmed, revision }, fn);
}

function assertTransferLimit(account, amountCents) {
    const limit = scaledLimit(config.limits.dailyTransferCents, account.currency || 'USD');
    const spent = getDb().prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM transactions WHERE account_id = ? AND type = 'transfer' AND direction = 'debit' AND date(created_at) = date('now')").get(account.id).total;
    if (spent + amountCents > limit) throw new ValidationError('Daily transfer limit is ' + formatCurrency(limit, account.currency || 'USD') + '.', 400, 'limit');
}

module.exports = { requestContext, assertUser, assertTransferLimit, assistantAction };
