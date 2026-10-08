const { pagination } = require('../middleware/validation');
/**
 * Notification routes
 */
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { getUserNotifications, markAsRead, markAllAsRead } = require('../services/notification');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
    try {
        const result = getUserNotifications(req.session.userId, {
            ...pagination(req.query),
            unreadOnly: req.query.unread === 'true',
        });
        res.json(result);
    } catch (err) {
        if (err.status) return res.status(err.status).json({ error: err.message });
        console.error('[Notifications] Error:', err.message);
        res.status(500).json({ error: 'Failed to load notifications.' });
    }
});

router.post('/:id/read', requireAuth, (req, res) => {
    try {
        markAsRead(parseInt(req.params.id), req.session.userId);
        res.json({ success: true });
    } catch (err) {
        if (err.status) return res.status(err.status).json({ error: err.message });
        console.error('[Notifications] Error:', err.message);
        res.status(500).json({ error: 'Failed to mark notification.' });
    }
});

router.post('/read-all', requireAuth, (req, res) => {
    try {
        markAllAsRead(req.session.userId);
        res.json({ success: true });
    } catch (err) {
        if (err.status) return res.status(err.status).json({ error: err.message });
        console.error('[Notifications] Error:', err.message);
        res.status(500).json({ error: 'Failed to mark notifications.' });
    }
});

module.exports = router;
