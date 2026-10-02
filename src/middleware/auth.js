/**
 * Authentication middleware
 */

const config = require('../config');
const { signInUrl, wantsJson } = require('../services/sign-in');

function requireAuth(req, res, next) {
    if (!req.session || !req.session.userId) {
        if (wantsJson(req)) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        return res.redirect(signInUrl(req));
    }
    next();
}

function requireAdmin(req, res, next) {
    if (!req.session || !req.session.userId) {
        if (wantsJson(req)) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        return res.redirect(signInUrl(req));
    }
    if (req.session.userRole !== 'admin') {
        if (wantsJson(req)) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        return res.status(403).render('error', {
            title: 'Access Denied',
            message: 'You do not have permission to access this page.',
            user: req.session,
        });
    }
    next();
}

function loadUser(req, res, next) {
    if (req.session && req.session.userId) {
        res.set('Cache-Control', 'no-store');
        const { getDb } = require('../database');
        const db = getDb();
        const user = db.prepare('SELECT id, email, full_name, phone, role, status, customer_id, auth_version FROM users WHERE id = ?').get(req.session.userId);
        const { isRevoked } = require('../services/sessions');
        if (!user || (req.session.authVersion || 0) !== user.auth_version || isRevoked(req.sessionID)) {
            req.session.destroy(() => {});
            res.clearCookie('willow.sid');
            if (wantsJson(req)) {
                return res.status(401).json({ error: 'Your session ended. Please sign in again.' });
            }
            return res.redirect(signInUrl(req, 'session_expired'));
        }
        const now = Date.now();
        const idleTimeout = config.session.idleTimeoutMs;
        if (idleTimeout && req.session.lastSeenAt && now - req.session.lastSeenAt > idleTimeout) {
            req.session.destroy(() => {});
            res.clearCookie('willow.sid');
            if (wantsJson(req)) {
                return res.status(401).json({ error: 'You were signed out after a period of inactivity. Please sign in again.', code: 'session_timeout' });
            }
            return res.redirect(signInUrl(req, 'session_timeout'));
        }
        // Background requests (marked by the client) don't count as activity.
        if (!req.get('X-Willow-Passive')) req.session.lastSeenAt = now;
        if (user) {
            if (user.status !== 'active' && user.role !== 'admin') {
                req.session.destroy(() => { });
                if (wantsJson(req)) {
                    return res.status(401).json({ error: 'Account suspended. Please log in again.' });
                }
                return res.redirect('/login?error=account_suspended');
            }
            res.locals.user = user;
            const unreadCount = db.prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0').get(user.id);
            res.locals.unreadNotifications = unreadCount?.count || 0;
        }
    }
    res.locals.user = res.locals.user || null;
    res.locals.unreadNotifications = res.locals.unreadNotifications || 0;
    next();
}

module.exports = { requireAuth, requireAdmin, loadUser };
