const express = require('express');
const rateLimit = require('express-rate-limit');
const { requireAuth } = require('../middleware/auth');
const { generateCodes, resetPassword, revokeOtherSessions } = require('../services/recovery');
const { logAudit } = require('../services/audit');
const config = require('../config');
const router = express.Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: config.rateLimit.authMax, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many recovery attempts. Please try again in 15 minutes.' } });
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
router.post('/recovery-codes', limiter, requireAuth, async (req, res) => {
    try {
        const result = await generateCodes(req.session.userId, req.body.currentPassword);
        if (result.error) return res.status(400).json(result);
        logAudit({ actorId: req.session.userId, actorEmail: res.locals.user.email, action: 'recovery_codes_generated', targetType: 'user', targetId: String(req.session.userId) });
        res.json({ success: true, codes: result.codes });
    } catch (err) { res.status(500).json({ error: 'Could not generate recovery codes. Please try again.' }); }
});
router.post('/reset-password', limiter, async (req, res) => {
    try {
        const result = await resetPassword(req.body);
        if (result.error) return res.status(400).json({ error: result.error });
        logAudit({ actorId: result.userId, actorEmail: result.email, action: 'password_recovered', targetType: 'user', targetId: String(result.userId) });
        req.session.destroy(() => {
            res.clearCookie('willow.sid');
            res.json({ success: true, message: 'Password reset. Sign in with your new password.', redirect: '/login?reset=success' });
        });
    } catch (err) { res.status(500).json({ error: 'Could not reset your password. Please try again.' }); }
});
router.post('/revoke-other-sessions', limiter, requireAuth, async (req, res) => {
    try {
        const result = await revokeOtherSessions(req.session.userId, req.body.currentPassword);
        if (result.error) return res.status(400).json(result);
        req.session.authVersion = result.version;
        logAudit({ actorId: req.session.userId, actorEmail: res.locals.user.email, action: 'other_sessions_revoked', targetType: 'user', targetId: String(req.session.userId) });
        req.session.save(err => err ? res.status(500).json({ error: 'Sessions ended. Please sign in again.' }) : res.json({ success: true, message: 'Other sessions have been signed out. This session stays active.' }));
    } catch (err) { res.status(500).json({ error: 'Could not end other sessions. Please try again.' }); }
});
module.exports = router;
