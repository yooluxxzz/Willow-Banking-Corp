/**
 * Auth routes — registration, login, logout
 */
const express = require('express');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const { registerUser, loginUser } = require('../services/auth');
const { logAudit } = require('../services/audit');
const { validatePassword, validatePhone, validateEmail } = require('../middleware/validation');
const { getDb } = require('../database');
const config = require('../config');
const { sessionMetadata } = require('../services/sessions');
const { safeReturnTo } = require('../services/sign-in');
const twoFactor = require('../services/two-factor');
const { consumeCode } = require('../services/recovery');
const { createGuestProfile } = require('../services/guests');
const { createSampleProfile } = require('../services/sample-profile');

const router = express.Router();

// Counts failed attempts only, so people who sign in and out a lot are never locked out.
const authLimiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.authMax,
    skipSuccessfulRequests: true,
    message: { error: 'Too many attempts. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const demoLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: Math.max(5, config.rateLimit.authMax),
    message: { error: 'Too many demo profiles were started from this connection. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

function regenerate(req) {
    return new Promise((resolve, reject) => req.session.regenerate(err => (err ? reject(err) : resolve())));
}

function save(req) {
    return new Promise((resolve, reject) => req.session.save(err => (err ? reject(err) : resolve())));
}

/** Completes sign-in for a verified user: fresh session, audit, safe redirect. */
async function establishSession(req, user, returnTo) {
    await regenerate(req);
    req.session.userId = user.id;
    req.session.userRole = user.role;
    req.session.authVersion = user.authVersion ?? user.auth_version ?? 0;
    req.session.device = sessionMetadata(req);
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
    await save(req);
    return safeReturnTo(returnTo, user.role) || (user.role === 'admin' ? '/admin' : '/dashboard');
}

router.post('/register', authLimiter, async (req, res) => {
    try {
        const { email, password, fullName, phone, country, accountType } = req.body;
        if (accountType !== undefined && !['personal', 'business'].includes(accountType)) {
            return res.status(400).json({ error: 'Choose a personal or business profile.' });
        }
        if (phone !== undefined && phone !== '' && (typeof phone !== 'string' || phone.length > 40 || !validatePhone(phone))) {
            return res.status(400).json({ error: 'Enter a valid phone number, or leave it blank.' });
        }
        const result = await registerUser({ email, password, fullName, phone, country, accountType });

        if (result.error) {
            return res.status(400).json({ error: result.error, code: result.code });
        }

        try {
            await regenerate(req);
            req.session.userId = result.userId;
            req.session.userRole = 'customer';
            req.session.authVersion = getDb().prepare('SELECT auth_version FROM users WHERE id = ?').get(result.userId).auth_version;
            req.session.device = sessionMetadata(req);

            await save(req);
        } catch (err) {
            console.error('[Auth] Session save error after registration:', err.message);
            // Do not retry an authenticated session save while sending this error response.
            req.session = null;
            return res.status(500).json({ error: 'Account created, but sign-in failed. Please sign in.', code: 'account_created', redirect: '/login', customerId: result.customerId });
        }
        res.json({ success: true, redirect: '/dashboard?welcome=1', customerId: result.customerId });
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
            const status = result.code === 'missing' ? 400 : result.code === 'locked' ? 429 : result.code === 'suspended' || result.code === 'closed' ? 403 : 401;
            return res.status(status).json({ error: result.error, code: result.code, attemptsRemaining: result.attemptsRemaining });
        }

        const user = result.user;
        if (twoFactor.isEnabled(user.id)) {
            await regenerate(req);
            req.session.pendingTwoFactor = {
                userId: user.id,
                authVersion: user.authVersion ?? user.auth_version ?? 0,
                expires: Date.now() + 5 * 60 * 1000,
                attempts: 0,
                returnTo: typeof req.body.returnTo === 'string' ? req.body.returnTo : '',
            };
            await save(req);
            return res.json({ success: false, twoFactorRequired: true, message: 'Enter the 6-digit code from your authenticator app.' });
        }

        const redirect = await establishSession(req, user, req.body.returnTo);
        res.json({ success: true, redirect });
    } catch (err) {
        console.error('[Auth] Login error:', err.message);
        res.status(500).json({ error: 'Sign-in is temporarily unavailable. Please try again.', code: 'server_error' });
    }
});

router.post('/2fa', authLimiter, async (req, res) => {
    try {
        const pending = req.session.pendingTwoFactor;
        if (!pending || pending.expires < Date.now()) {
            delete req.session.pendingTwoFactor;
            return res.status(401).json({ error: 'Your sign-in timed out. Please enter your details again.', code: 'session_timeout' });
        }
        pending.attempts += 1;
        if (pending.attempts > 5) {
            delete req.session.pendingTwoFactor;
            return res.status(429).json({ error: 'Too many incorrect codes. Please sign in again.', code: 'locked' });
        }
        const currentUser = getDb().prepare('SELECT status, auth_version FROM users WHERE id = ?').get(pending.userId);
        if (!currentUser || currentUser.status !== 'active' || currentUser.auth_version !== pending.authVersion) {
            delete req.session.pendingTwoFactor;
            return res.status(401).json({ error: 'Your sign-in changed. Please enter your details again.', code: 'authorization_changed' });
        }
        const code = typeof req.body.code === 'string' ? req.body.code.trim() : '';
        const ok = twoFactor.verify(pending.userId, code) || consumeCode(pending.userId, code);
        if (!ok) {
            await save(req);
            return res.status(401).json({ error: 'That code didn’t match. Enter the newest code from your app, or a backup code.', code: 'invalid_code' });
        }
        const user = getDb().prepare("SELECT id, email, role, auth_version, status FROM users WHERE id = ?").get(pending.userId);
        if (!user || user.status !== 'active') {
            delete req.session.pendingTwoFactor;
            return res.status(403).json({ error: 'This profile can’t sign in right now.', code: 'suspended' });
        }
        const redirect = await establishSession(req, { ...user, authVersion: user.auth_version }, pending.returnTo);
        res.json({ success: true, redirect });
    } catch (err) {
        console.error('[Auth] Two-factor error:', err.message);
        res.status(500).json({ error: 'Sign-in is temporarily unavailable. Please try again.' });
    }
});

router.post('/demo', demoLimiter, async (req, res) => {
    try {
        const user = await createGuestProfile();
        const redirect = await establishSession(req, { ...user, authVersion: user.auth_version }, '/dashboard?welcome=demo');
        res.json({ success: true, redirect });
    } catch (err) {
        console.error('[Auth] Demo profile error:', err.message);
        res.status(500).json({ error: 'The demo profile could not be created. Please try again.' });
    }
});

/** A guest profile that already has four months of labelled sample activity. */
router.post('/sample', demoLimiter, async (req, res) => {
    try {
        const user = await createSampleProfile();
        const redirect = await establishSession(req, { ...user, authVersion: user.auth_version }, '/dashboard?welcome=sample');
        res.json({ success: true, redirect });
    } catch (err) {
        console.error('[Auth] Sample profile error:', err.message);
        res.status(500).json({ error: 'The sample profile could not be created. Please try again.' });
    }
});

/** Keeps an active session alive (used by the idle warning) and reports its state. */
router.get('/session', (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!req.session || !req.session.userId) return res.status(401).json({ error: 'You’re signed out.', code: 'signed_out' });
    res.json({ active: true, idleMinutes: Math.round(config.session.idleTimeoutMs / 60000) });
});

router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('[Auth] Logout error:', err.message);
            return res.status(500).json({ error: 'Sign-out could not be completed. Please try again.' });
        }
        res.clearCookie(req.app.get('session cookie'));
        res.set('Cache-Control', 'no-store');
        res.json({ success: true, redirect: '/login?signedOut=success' });
    });
});
router.post('/change-password', authLimiter, async (req, res) => {
    if (!req.session?.userId) {
        return res.status(401).json({ error: 'Authentication required.' });
    }
    try {
        const { currentPassword, newPassword } = req.body;
        if (typeof currentPassword !== 'string' || currentPassword.length > 128 || !currentPassword || !newPassword) {
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
        const updated = db.prepare("UPDATE users SET password_hash = ?, auth_version = auth_version + 1 WHERE id = ? AND password_hash = ? AND status = 'active'").run(newHash, req.session.userId, user.password_hash);
        if (!updated.changes) return res.status(409).json({ error: 'Account changed. Please sign in again.' });
        req.session.authVersion = db.prepare('SELECT auth_version FROM users WHERE id = ?').get(req.session.userId).auth_version;

        logAudit({
            actorId: req.session.userId,
            actorEmail: user.email,
            action: 'password_changed',
            targetType: 'user',
            targetId: String(req.session.userId),
        });

        res.json({ success: true, message: 'Password updated. All other sessions have been signed out.' });
    } catch (err) {
        console.error('[Auth] Password change error:', err.message);
        res.status(500).json({ error: 'Failed to change password.' });
    }
});

/** Turns a guest demo profile into a regular one with the customer's own email and password. */
router.post('/claim-guest', authLimiter, async (req, res) => {
    if (!req.session?.userId) return res.status(401).json({ error: 'Authentication required.' });
    try {
        const db = getDb();
        const user = db.prepare('SELECT id, email, is_guest, password_hash FROM users WHERE id = ?').get(req.session.userId);
        if (!user || !user.is_guest) return res.status(400).json({ error: 'This profile already has its own sign-in details.' });
        const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
        const { newPassword } = req.body;
        if (!validateEmail(email) || /@(demo|community|guest)\.willow\.test$/i.test(email)) return res.status(400).json({ error: 'Enter a valid email address you can sign in with.' });
        if (!validatePassword(newPassword)) return res.status(400).json({ error: 'Password must be at least 8 characters with one uppercase letter, one lowercase letter, and one number.' });
        if (db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, user.id)) return res.status(400).json({ error: 'An account with this email already exists.' });
        const hash = await bcrypt.hash(newPassword, config.bcryptRounds);
        const updated = db.prepare("UPDATE users SET email = ?, password_hash = ?, is_guest = 0, auth_version = auth_version + 1, updated_at = datetime('now') WHERE id = ? AND is_guest = 1 AND password_hash = ?").run(email, hash, user.id, user.password_hash);
        if (!updated.changes) return res.status(409).json({ error: 'Profile changed. Please refresh and try again.' });
        req.session.authVersion = db.prepare('SELECT auth_version FROM users WHERE id = ?').get(user.id).auth_version;
        logAudit({ actorId: user.id, actorEmail: email, action: 'guest_profile_claimed', targetType: 'user', targetId: String(user.id) });
        await save(req);
        res.json({ success: true, message: 'Profile saved. Sign in with this email and password next time.' });
    } catch (err) {
        console.error('[Auth] Guest claim error:', err.message);
        res.status(500).json({ error: 'Could not save your profile. Please try again.' });
    }
});

router.post('/update-profile', async (req, res) => {
    if (!req.session?.userId) {
        return res.status(401).json({ error: 'Authentication required.' });
    }
    try {
        const { fullName, phone } = req.body;
        if (typeof fullName !== 'string' || fullName.trim().length < 2 || fullName.trim().length > 100 || /[<>\x00-\x1f]/.test(fullName)) {
            return res.status(400).json({ error: 'Enter a full name of 2–100 characters without markup.' });
        }

        const db = getDb();
        const user = db.prepare('SELECT email FROM users WHERE id = ?').get(req.session.userId);
        if (!user) return res.status(404).json({ error: 'User not found.' });

        if (phone !== undefined && (typeof phone !== 'string' || phone.length > 40 || !validatePhone(phone))) {
            return res.status(400).json({ error: 'Enter a valid phone number with 7–15 digits, or leave it blank.' });
        }
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

router.use(require('./sessions'));
router.use(require('./recovery'));

module.exports = router;
