/**
 * Card routes
 */
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { getUserCards, updateCardStatus, requestReplacement } = require('../services/card');
const { createNotification } = require('../services/notification');
const { logAudit } = require('../services/audit');

const router = express.Router();
router.param('id', (req, res, next, id) => {
    if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) return res.status(400).json({ error: 'Invalid card ID.' });
    next();
});

router.get('/', requireAuth, (req, res) => {
    try {
        const cards = getUserCards(req.session.userId);
        res.json({ cards });
    } catch (err) {
        console.error('[Cards] Error:', err.message);
        res.status(500).json({ error: 'Failed to load cards.' });
    }
});

router.post('/:id/status', requireAuth, (req, res) => {
    try {
        const { status } = req.body;
        if (!['active', 'frozen', 'reported', 'cancelled'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status.' });
        }

        const result = updateCardStatus(Number(req.params.id), req.session.userId, status);
        if (result.error) {
            return res.status(400).json({ error: result.error });
        }

        const statusMessages = {
            frozen: 'Your card has been frozen.',
            active: 'Your card has been unfrozen.',
            reported: 'Your demo card is reported lost and is now inactive.',
            cancelled: 'Your card has been cancelled.',
        };

        try {
            createNotification(req.session.userId, 'card', 'Card Status Updated', statusMessages[status] || `Card status changed to ${status}.`);
        } catch (e) { /* non-critical */ }

        res.json({ success: true, message: statusMessages[status] });

        logAudit({
            actorId: req.session.userId,
            actorEmail: res.locals.user?.email || 'unknown',
            action: 'card_status_change',
            targetType: 'card',
            targetId: String(req.params.id),
            metadata: { newStatus: status },
        });
    } catch (err) {
        console.error('[Cards] Error:', err.message);
        res.status(500).json({ error: 'Failed to update card.' });
    }
});

router.post('/:id/replace', requireAuth, (req, res) => {
    try {
        const result = requestReplacement(Number(req.params.id), req.session.userId);
        if (result.error) {
            return res.status(400).json({ error: result.error });
        }

        try {
            createNotification(req.session.userId, 'card', 'Replacement Card Requested', result.message);
        } catch (e) { /* non-critical */ }

        res.json({ success: true, message: result.message, card: result.card, simulated: true });

        logAudit({
            actorId: req.session.userId,
            actorEmail: res.locals.user?.email || 'unknown',
            action: 'card_replacement',
            targetType: 'card',
            targetId: String(req.params.id),
        });
    } catch (err) {
        console.error('[Cards] Error:', err.message);
        res.status(500).json({ error: 'Failed to request replacement.' });
    }
});

module.exports = router;
