/**
 * Guest profiles: one-click profiles that start empty like any new customer
 * (a single $0 checking account), plus removal of guests nobody has used.
 * Sample profiles (./sample-profile) are guests marked is_sample.
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { getDb } = require('../database');
const config = require('../config');
const { uniqueAccountNumber, uniqueCustomerId } = require('./ids');
const { logAudit } = require('./audit');

const GUEST_NAMES = ['Alex Morgan', 'Sam Rivera', 'Jordan Lee', 'Taylor Brooks', 'Riley Chen'];

/** Creates an empty guest profile and returns the new user. */
async function createGuestProfile({ sample = false } = {}) {
    const db = getDb();
    const name = GUEST_NAMES[crypto.randomInt(0, GUEST_NAMES.length)];
    const email = `guest-${crypto.randomBytes(5).toString('hex')}@guest.willow.test`;
    const hash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), config.bcryptRounds);
    const userId = db.transaction(() => {
        const result = db.prepare("INSERT INTO users (email, full_name, phone, password_hash, role, status, customer_id, is_guest, is_sample) VALUES (?, ?, '', ?, 'customer', 'active', ?, 1, ?)").run(email, name, hash, uniqueCustomerId(db), sample ? 1 : 0);
        db.prepare("INSERT INTO accounts (user_id, account_number, account_type, balance, available_balance, currency, status) VALUES (?, ?, 'checking', 0, 0, 'USD', 'active')").run(result.lastInsertRowid, uniqueAccountNumber(db));
        return result.lastInsertRowid;
    })();
    return db.prepare('SELECT id, email, full_name, role, auth_version, customer_id FROM users WHERE id = ?').get(userId);
}

/**
 * Deletes a user and every record that belongs to them. Other customers keep
 * their own ledger rows; links pointing at the removed accounts are cleared.
 * Must run inside a transaction.
 */
function removeUserRecords(db, userId) {
    const ids = db.prepare('SELECT id FROM accounts WHERE user_id = ?').all(userId).map(row => row.id);
    if (ids.length) {
        const list = ids.map(() => '?').join(',');
        db.prepare(`UPDATE transactions SET related_account_id = NULL WHERE related_account_id IN (${list}) AND account_id NOT IN (${list})`).run(...ids, ...ids);
        db.prepare(`UPDATE business_invoices SET paid_account_id = NULL WHERE paid_account_id IN (${list}) AND user_id != ?`).run(...ids, userId);
        db.prepare(`UPDATE debt_payments SET account_id = NULL WHERE account_id IN (${list}) AND user_id != ?`).run(...ids, userId);
        db.prepare(`UPDATE business_expenses SET account_id = NULL WHERE account_id IN (${list}) AND user_id != ?`).run(...ids, userId);
        db.prepare(`DELETE FROM scheduled_transfers WHERE from_account_id IN (${list}) OR to_account_id IN (${list})`).run(...ids, ...ids);
        db.prepare(`DELETE FROM portfolio_transfers WHERE account_id IN (${list})`).run(...ids);
        db.prepare(`DELETE FROM transactions WHERE account_id IN (${list})`).run(...ids);
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
}

/**
 * Removes guest profiles that nobody has used for `days` days, with all of their
 * records. Claimed guests (is_guest = 0) are never touched.
 */
function purgeStaleGuests({ days = 7, now = new Date() } = {}) {
    const db = getDb();
    const cutoff = new Date(now.getTime() - days * 86400000).toISOString().replace('T', ' ').slice(0, 19);
    const stale = db.prepare(`SELECT u.id FROM users u
        WHERE u.is_guest = 1 AND u.role = 'customer' AND u.created_at < ?
          AND MAX(COALESCE(u.last_active_at, u.created_at), COALESCE((SELECT MAX(created_at) FROM audit_logs WHERE actor_id = u.id), u.created_at)) < ?`).all(cutoff, cutoff);
    for (const guest of stale) {
        db.transaction(() => {
            removeUserRecords(db, guest.id);
            logAudit({ actorId: null, actorEmail: 'system', action: 'guest_profile_purged', targetType: 'user', targetId: String(guest.id), metadata: { inactiveDays: days } });
        })();
    }
    return { purged: stale.length };
}

module.exports = { createGuestProfile, purgeStaleGuests, removeUserRecords };
