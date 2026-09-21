/**
 * Authentication middleware
 */

function requireAuth(req, res, next) {
    if (!req.session || !req.session.userId) {
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        return res.redirect('/login');
    }
    next();
}

function requireAdmin(req, res, next) {
    if (!req.session || !req.session.userId) {
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        return res.redirect('/login');
    }
    if (req.session.userRole !== 'admin') {
        if (req.xhr || req.headers.accept?.includes('application/json')) {
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
        const { getDb } = require('../database');
        const db = getDb();
        const user = db.prepare('SELECT id, email, full_name, role, status, customer_id FROM users WHERE id = ?').get(req.session.userId);
        if (user) {
            if (user.status !== 'active' && user.role !== 'admin') {
                req.session.destroy(() => { });
                if (req.xhr || req.headers.accept?.includes('application/json')) {
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
