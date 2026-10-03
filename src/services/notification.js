/**
 * Notification service
 */
const { getDb } = require('../database');

// Which alert switch in Settings controls each kind of notification. Kinds not listed
// (account notices such as an admin adjustment or a password reset) are always shown.
const PREFERENCE_FOR_TYPE = {
    deposit: 'alert_transactions',
    withdrawal: 'alert_transactions',
    transfer: 'alert_transactions',
    card: 'alert_cards',
    security: 'alert_security',
    budget: 'alert_budgets',
};

/** Adds a notification unless the customer switched that kind of alert off. Returns true if added. */
function createNotification(userId, type, title, message) {
    const db = getDb();
    const column = PREFERENCE_FOR_TYPE[type];
    if (column) {
        const prefs = db.prepare(`SELECT ${column} AS enabled FROM user_preferences WHERE user_id = ?`).get(userId);
        if (prefs && !prefs.enabled) return false;
    }
    db.prepare(`
    INSERT INTO notifications (user_id, type, title, message)
    VALUES (?, ?, ?, ?)
  `).run(userId, type, title, message);
    return true;
}

function getUserNotifications(userId, { page = 1, limit = 20, unreadOnly = false } = {}) {
    const db = getDb();
    const offset = (page - 1) * limit;
    let where = 'user_id = ?';
    const params = [userId];

    if (unreadOnly) {
        where += ' AND is_read = 0';
    }

    const total = db.prepare(`SELECT COUNT(*) as count FROM notifications WHERE ${where}`).get(...params).count;
    const rows = db.prepare(`
    SELECT * FROM notifications WHERE ${where}
    ORDER BY created_at DESC LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

    return { notifications: rows, total, page, limit, totalPages: Math.ceil(total / limit) };
}

function markAsRead(notificationId, userId) {
    const db = getDb();
    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(notificationId, userId);
}

function markAllAsRead(userId) {
    const db = getDb();
    db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0').run(userId);
}

function getUnreadCount(userId) {
    const db = getDb();
    const result = db.prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0').get(userId);
    return result.count;
}

module.exports = { createNotification, getUserNotifications, markAsRead, markAllAsRead, getUnreadCount };
