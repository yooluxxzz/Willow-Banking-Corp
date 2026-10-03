/**
 * Saved payees — other Willow demo customers a person sends money to.
 */
const { getDb } = require('../database');
const { validateEmail } = require('../middleware/validation');
const { logAudit } = require('./audit');
const { ValidationError } = require('../errors');

function listPayees(userId) {
    return getDb().prepare(`SELECT p.id, p.nickname, p.last_paid_at, p.created_at, u.full_name AS name, u.email, u.status
        FROM payees p JOIN users u ON u.id = p.recipient_user_id
        WHERE p.user_id = ? ORDER BY COALESCE(p.last_paid_at, p.created_at) DESC, p.id DESC`).all(userId)
        .map(row => ({ ...row, displayName: row.nickname || row.name, active: row.status === 'active' }));
}

function addPayee(userId, { email, nickname = '' } = {}) {
    if (!validateEmail(email)) throw new ValidationError('Enter a valid email address for a Willow customer.');
    if (typeof nickname !== 'string' || nickname.trim().length > 40 || /[<>\x00-\x1f\x7f]/.test(nickname)) throw new ValidationError('Use a nickname of up to 40 characters without markup.');
    const db = getDb();
    const recipient = db.prepare('SELECT id, status, full_name, email FROM users WHERE email = ? COLLATE NOCASE').get(email.trim());
    if (!recipient || recipient.status !== 'active' || recipient.id === userId) {
        throw new ValidationError(recipient && recipient.id === userId ? 'You can’t add yourself as a payee.' : 'No active Willow customer uses that email.');
    }
    const count = db.prepare('SELECT COUNT(*) AS count FROM payees WHERE user_id = ?').get(userId).count;
    const existing = db.prepare('SELECT id FROM payees WHERE user_id = ? AND recipient_user_id = ?').get(userId, recipient.id);
    if (!existing && count >= 50) throw new ValidationError('You can save up to 50 payees.');
    if (existing) {
        if (nickname.trim()) db.prepare('UPDATE payees SET nickname = ? WHERE id = ?').run(nickname.trim(), existing.id);
    } else {
        db.prepare('INSERT INTO payees (user_id, recipient_user_id, nickname) VALUES (?, ?, ?)').run(userId, recipient.id, nickname.trim());
        logAudit({ actorId: userId, action: 'payee_added', targetType: 'user', targetId: String(recipient.id) });
    }
    return listPayees(userId);
}

function removePayee(userId, payeeId) {
    const result = getDb().prepare('DELETE FROM payees WHERE id = ? AND user_id = ?').run(payeeId, userId);
    if (!result.changes) throw new ValidationError('Payee not found.', 404);
    logAudit({ actorId: userId, action: 'payee_removed', targetType: 'payee', targetId: String(payeeId) });
    return listPayees(userId);
}

function markPaid(userId, recipientUserId) {
    getDb().prepare("UPDATE payees SET last_paid_at = datetime('now') WHERE user_id = ? AND recipient_user_id = ?").run(userId, recipientUserId);
}

module.exports = { listPayees, addPayee, removePayee, markPaid };
