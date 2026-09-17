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
            page: parseInt(req.query.page) || 1,
            limit: parseInt(req.query.limit) || 20,
            unreadOnly: req.query.unread === 'true',
        });
        res.json(result);
    } catch (err) {
        console.error('[Notifications] Error:', err.message);
        res.status(500).json({ error: 'Failed to load notifications.' });
    }
});

router.post('/:id/read', requireAuth, (req, res) => {
    try {
        markAsRead(parseInt(req.params.id), req.session.userId);
        res.json({ success: true });
    } catch (err) {
        console.error('[Notifications] Error:', err.message);
        res.status(500).json({ error: 'Failed to mark notification.' });
    }
});

router.post('/read-all', requireAuth, (req, res) => {
    try {
        markAllAsRead(req.session.userId);
        res.json({ success: true });
    } catch (err) {
        console.error('[Notifications] Error:', err.message);
        res.status(500).json({ error: 'Failed to mark notifications.' });
    }
});

module.exports = router;
