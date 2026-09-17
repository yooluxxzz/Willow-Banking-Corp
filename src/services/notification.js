/**
 * Notification service
 */
const { getDb } = require('../database');

function createNotification(userId, type, title, message) {
    const db = getDb();
    db.prepare(`
    INSERT INTO notifications (user_id, type, title, message)
    VALUES (?, ?, ?, ?)
  `).run(userId, type, title, message);
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
