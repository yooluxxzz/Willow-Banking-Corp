const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { getDb } = require('../database');
const config = require('../config');
const { validateEmail, validatePassword } = require('../middleware/validation');
const { clearAttempts } = require('./auth');

const invalidRecovery = 'Email or recovery code is incorrect, already used, or unavailable.';
const digest = code => crypto.createHash('sha256').update(code).digest('hex');
const normalize = code => typeof code === 'string' && code.length <= 64 ? code.replace(/[\s-]/g, '').toUpperCase() : '';

async function verifyPassword(userId, password) {
    const user = getDb().prepare("SELECT * FROM users WHERE id = ? AND status = 'active'").get(userId);
    if (!user || typeof password !== 'string' || password.length > 128 || !await bcrypt.compare(password, user.password_hash)) return null;
    return user;
}
function isCurrent(user) {
    return getDb().prepare("SELECT id FROM users WHERE id = ? AND password_hash = ? AND auth_version = ? AND status = 'active'").get(user.id, user.password_hash, user.auth_version);
}
async function generateCodes(userId, password) {
    const user = await verifyPassword(userId, password);
    if (!user) return { error: 'Current password is incorrect.' };
    const codes = Array.from({ length: 8 }, () => crypto.randomBytes(16).toString('hex').toUpperCase().match(/.{4}/g).join('-'));
    const db = getDb();
    return db.transaction(() => {
        if (!isCurrent(user)) return { error: 'Account changed. Please sign in again.' };
        db.prepare('DELETE FROM recovery_codes WHERE user_id = ?').run(userId);
        for (const code of codes) db.prepare('INSERT INTO recovery_codes (user_id, code_hash) VALUES (?, ?)').run(userId, digest(normalize(code)));
        return { codes };
    })();
}
async function resetPassword({ email, recoveryCode, newPassword }) {
    const code = normalize(recoveryCode);
    if (!validateEmail(email) || !/^[A-F0-9]{32}$/.test(code)) return { error: invalidRecovery };
    if (!validatePassword(newPassword) || Buffer.byteLength(newPassword, 'utf8') > 72) return { error: 'Use 8 or more characters with uppercase, lowercase and a number, up to 72 bytes.' };
    const db = getDb();
    const user = db.prepare("SELECT u.* FROM users u JOIN recovery_codes r ON r.user_id = u.id WHERE u.email = ? AND r.code_hash = ? AND u.status = 'active'").get(email.trim().toLowerCase(), digest(code));
    if (!user) return { error: invalidRecovery };
    const hash = await bcrypt.hash(newPassword, config.bcryptRounds);
    const result = db.transaction(() => {
        if (!isCurrent(user)) return { error: invalidRecovery };
        const consumed = db.prepare('DELETE FROM recovery_codes WHERE user_id = ? AND code_hash = ?').run(user.id, digest(code));
        if (consumed.changes !== 1) return { error: invalidRecovery };
        db.prepare('UPDATE users SET password_hash = ?, auth_version = auth_version + 1 WHERE id = ?').run(hash, user.id);
        db.prepare("INSERT INTO notifications (user_id, type, title, message) VALUES (?, 'info', 'Password reset', 'Your password was reset with a backup code. All existing sessions have ended.')").run(user.id);
        return { userId: user.id, email: user.email };
    })();
    if (!result.error) clearAttempts(user.email);
    return result;
}
async function revokeOtherSessions(userId, password) {
    const user = await verifyPassword(userId, password);
    if (!user) return { error: 'Current password is incorrect.' };
    const db = getDb();
    const result = db.prepare("UPDATE users SET auth_version = auth_version + 1 WHERE id = ? AND auth_version = ? AND password_hash = ? AND status = 'active'").run(user.id, user.auth_version, user.password_hash);
    return result.changes ? { version: user.auth_version + 1 } : { error: 'Account changed. Please sign in again.' };
}
module.exports = { generateCodes, resetPassword, revokeOtherSessions };
