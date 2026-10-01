const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { getDb } = require('../database');
const { ownedSessions } = require('../services/sessions');
const { logAudit } = require('../services/audit');
const router = express.Router();

router.post('/sessions/:id/revoke', requireAuth, async (req, res) => {
    if (!/^[a-f0-9]{64}$/.test(req.params.id)) return res.status(400).json({ error: 'Invalid session.' });
    try {
        const sessions = await ownedSessions(req, res.locals.user.auth_version);
        const target = sessions.find(item => item.id === req.params.id);
        if (!target) return res.status(404).json({ error: 'This session has already ended or is unavailable. Refresh the page.' });
        if (target.current) return res.status(400).json({ error: 'Use Sign out to end your current session.' });
        getDb().transaction(() => {
            getDb().prepare('INSERT OR IGNORE INTO revoked_sessions (session_hash, user_id) VALUES (?, ?)').run(target.id, req.session.userId);
            logAudit({ actorId: req.session.userId, actorEmail: res.locals.user.email, action: 'session_revoked', targetType: 'user', targetId: String(req.session.userId) });
        })();
        // The durable revocation also blocks a stale in-flight request re-saving this session.
        req.sessionStore.destroy(target.sid, err => {
            if (err) console.error('[Sessions] Revoked session cleanup failed:', err.message);
            res.json({ success: true, message: 'Session signed out.' });
        });
    } catch (err) { res.status(500).json({ error: 'Could not end this session. Please try again.' }); }
});

module.exports = router;
