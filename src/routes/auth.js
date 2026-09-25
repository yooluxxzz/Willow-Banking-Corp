/**
 * Auth routes — registration, login, logout
 */
const express = require('express');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const { registerUser, loginUser } = require('../services/auth');
const { logAudit } = require('../services/audit');
const { validatePassword } = require('../middleware/validation');
const { getDb } = require('../database');
const config = require('../config');

const router = express.Router();

const authLimiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.authMax,
    message: { error: 'Too many attempts. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

router.post('/register', authLimiter, async (req, res) => {
    try {
        const { email, password, fullName, phone } = req.body;
        const result = await registerUser({ email, password, fullName, phone });

        if (result.error) {
            return res.status(400).json({ error: result.error });
        }

        req.session.userId = result.userId;
        req.session.userRole = 'customer';

        logAudit({
            actorId: result.userId,
            actorEmail: email,
            action: 'register',
            targetType: 'user',
            targetId: String(result.userId),
            metadata: { customerId: result.customerId },
        });

        res.json({ success: true, redirect: '/dashboard' });
    } catch (err) {
        console.error('[Auth] Registration error:', err.message);
        res.status(500).json({ error: 'Registration failed. Please try again.' });
    }
});

router.post('/login', authLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;
        const result = await loginUser({ email, password });

        if (result.error) {
            return res.status(401).json({ error: result.error });
        }

        // Regenerate session to prevent session fixation
        const user = result.user;
        req.session.regenerate((err) => {
            if (err) {
                console.error('[Auth] Session regeneration error:', err.message);
                return res.status(500).json({ error: 'Login failed. Please try again.' });
            }

            req.session.userId = user.id;
            req.session.userRole = user.role;

            logAudit({
                actorId: user.id,
                actorEmail: user.email,
                action: 'login',
                targetType: 'user',
                targetId: String(user.id),
                metadata: {
                    ip: (req.ip || '').replace(/^::ffff:/, '') || '127.0.0.1',
                    userAgent: req.get('User-Agent') || '',
                },
            });

            const redirect = user.role === 'admin' ? '/admin' : '/dashboard';
            res.json({ success: true, redirect });
        });
    } catch (err) {
        console.error('[Auth] Login error:', err.message);
        res.status(500).json({ error: 'Login failed. Please try again.' });
    }
});

router.post('/logout', (req, res) => {
    const userId = req.session?.userId;
    req.session.destroy((err) => {
        if (err) console.error('[Auth] Logout error:', err);
        res.json({ success: true, redirect: '/' });
    });
});
router.post('/change-password', async (req, res) => {
    if (!req.session?.userId) {
        return res.status(401).json({ error: 'Authentication required.' });
    }
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Current and new password are required.' });
        }
        if (!validatePassword(newPassword)) {
            return res.status(400).json({ error: 'New password must be at least 8 characters with one uppercase letter, one lowercase letter, and one number.' });
        }
        const db = getDb();
        const user = db.prepare('SELECT password_hash, email FROM users WHERE id = ?').get(req.session.userId);
        if (!user) return res.status(404).json({ error: 'User not found.' });

        const valid = await bcrypt.compare(currentPassword, user.password_hash);
        if (!valid) return res.status(400).json({ error: 'Current password is incorrect.' });

        const newHash = await bcrypt.hash(newPassword, config.bcryptRounds);
        db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, req.session.userId);

        logAudit({
            actorId: req.session.userId,
            actorEmail: user.email,
            action: 'password_changed',
            targetType: 'user',
            targetId: String(req.session.userId),
        });

        res.json({ success: true, message: 'Password changed successfully.' });
    } catch (err) {
        console.error('[Auth] Password change error:', err.message);
        res.status(500).json({ error: 'Failed to change password.' });
    }
});

router.post('/update-profile', async (req, res) => {
    if (!req.session?.userId) {
        return res.status(401).json({ error: 'Authentication required.' });
    }
    try {
        const { fullName, phone } = req.body;
        if (!fullName || fullName.trim().length < 2) {
            return res.status(400).json({ error: 'Full name must be at least 2 characters.' });
        }

        const db = getDb();
        const user = db.prepare('SELECT email FROM users WHERE id = ?').get(req.session.userId);
        if (!user) return res.status(404).json({ error: 'User not found.' });

        const phoneVal = (phone || '').trim();
        db.prepare('UPDATE users SET full_name = ?, phone = ? WHERE id = ?').run(
            fullName.trim(),
            phoneVal,
            req.session.userId
        );

        logAudit({
            actorId: req.session.userId,
            actorEmail: user.email,
            action: 'profile_updated',
            targetType: 'user',
            targetId: String(req.session.userId),
            metadata: { hasPhone: !!phoneVal }
        });

        res.json({ success: true, message: 'Profile updated successfully.' });
    } catch (err) {
        console.error('[Auth] Profile update error:', err.message);
        res.status(500).json({ error: 'Failed to update profile.' });
    }
});

module.exports = router;
