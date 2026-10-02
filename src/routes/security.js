/**
 * Security center API — two-step verification, card security and data export.
 */
const express = require('express');
const rateLimit = require('express-rate-limit');
const QRCode = require('qrcode');
const { requireAuth } = require('../middleware/auth');
const { getDb } = require('../database');
const twoFactor = require('../services/two-factor');
const { verifyPassword, consumeCode, remainingCodes } = require('../services/recovery');
const { logAudit } = require('../services/audit');
const { createNotification } = require('../services/notification');
const config = require('../config');

const router = express.Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: config.rateLimit.authMax * 3, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many attempts. Please wait a few minutes and try again.' } });

router.use(requireAuth);
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

router.get('/overview', (req, res) => {
    const db = getDb();
    const userId = req.session.userId;
    const status = twoFactor.getStatus(userId);
    const codes = remainingCodes(userId);
    const frozen = db.prepare("SELECT COUNT(*) AS count FROM cards c JOIN accounts a ON a.id = c.account_id WHERE a.user_id = ? AND c.status = 'frozen'").get(userId).count;
    const activeCards = db.prepare("SELECT COUNT(*) AS count FROM cards c JOIN accounts a ON a.id = c.account_id WHERE a.user_id = ? AND c.status = 'active'").get(userId).count;
    const checks = [
        { key: 'password', label: 'Password set', done: true },
        { key: 'twoFactor', label: 'Two-step verification', done: status.enabled },
        { key: 'recovery', label: 'Backup recovery codes saved', done: codes > 0 },
        { key: 'alerts', label: 'Security alerts on', done: true },
    ];
    res.json({ twoFactor: status, recoveryCodes: codes, cards: { active: activeCards, frozen }, checks, score: Math.round(checks.filter(item => item.done).length / checks.length * 100) });
});

router.post('/2fa/setup', limiter, async (req, res) => {
    try {
        const setup = twoFactor.beginSetup(req.session.userId, res.locals.user.email);
        const qrSvg = await QRCode.toString(setup.otpauthUrl, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0D2219', light: '#FFFFFF' } });
        res.json({ secret: setup.secretGrouped, otpauthUrl: setup.otpauthUrl, qrSvg });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.post('/2fa/confirm', limiter, (req, res) => {
    try {
        const ok = twoFactor.confirmSetup(req.session.userId, String(req.body.code || ''));
        if (!ok) return res.status(400).json({ error: 'That code didn’t match. Check the time on your device and enter the newest code.' });
        logAudit({ actorId: req.session.userId, actorEmail: res.locals.user.email, action: 'two_factor_enabled', targetType: 'user', targetId: String(req.session.userId) });
        try { createNotification(req.session.userId, 'security', 'Two-step verification on', 'Sign-ins now require a code from your authenticator app.'); } catch (error) { /* non-critical */ }
        res.json({ success: true, twoFactor: twoFactor.getStatus(req.session.userId), recoveryCodes: remainingCodes(req.session.userId) });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.post('/2fa/disable', limiter, async (req, res) => {
    const userId = req.session.userId;
    if (!twoFactor.isEnabled(userId)) return res.status(400).json({ error: 'Two-step verification is already off.' });
    const user = await verifyPassword(userId, req.body.currentPassword);
    if (!user) return res.status(400).json({ error: 'Current password is incorrect.' });
    const code = String(req.body.code || '');
    if (!twoFactor.verify(userId, code) && !consumeCode(userId, code)) return res.status(400).json({ error: 'Enter a current authenticator code or an unused backup code.' });
    twoFactor.disable(userId);
    logAudit({ actorId: userId, actorEmail: res.locals.user.email, action: 'two_factor_disabled', targetType: 'user', targetId: String(userId) });
    try { createNotification(userId, 'security', 'Two-step verification off', 'Sign-ins no longer require an authenticator code. Turn it back on in the Security center.'); } catch (error) { /* non-critical */ }
    res.json({ success: true, twoFactor: twoFactor.getStatus(userId) });
});

router.post('/cards/freeze-all', (req, res) => {
    const db = getDb();
    const userId = req.session.userId;
    const result = db.prepare("UPDATE cards SET status = 'frozen' WHERE status = 'active' AND account_id IN (SELECT id FROM accounts WHERE user_id = ?)").run(userId);
    logAudit({ actorId: userId, actorEmail: res.locals.user.email, action: 'cards_frozen_all', targetType: 'user', targetId: String(userId), metadata: { count: result.changes } });
    if (result.changes) {
        try { createNotification(userId, 'card', 'All demo cards frozen', `${result.changes} demo card${result.changes === 1 ? ' was' : 's were'} frozen from the Security center.`); } catch (error) { /* non-critical */ }
    }
    res.json({ success: true, frozen: result.changes });
});

router.get('/export', (req, res) => {
    const db = getDb();
    const userId = req.session.userId;
    const profile = db.prepare('SELECT email, full_name, phone, customer_id, country, created_at FROM users WHERE id = ?').get(userId);
    const accounts = db.prepare('SELECT id, account_number, account_type, purpose, nickname, currency, balance, available_balance, status, created_at FROM accounts WHERE user_id = ?').all(userId);
    const ids = accounts.map(account => account.id);
    const transactions = ids.length
        ? db.prepare(`SELECT reference, account_id, type, amount, currency, direction, status, description, category, created_at FROM transactions WHERE account_id IN (${ids.map(() => '?').join(',')}) ORDER BY created_at`).all(...ids)
        : [];
    const payload = {
        exportedAt: new Date().toISOString(),
        notice: 'Willow is a fictional demonstration platform. All balances, transactions and holdings in this file are simulated.',
        profile,
        accounts,
        transactions,
        cards: db.prepare('SELECT c.id, c.account_id, c.form, c.nickname, c.last_four, c.status, c.daily_limit, c.created_at FROM cards c JOIN accounts a ON a.id = c.account_id WHERE a.user_id = ?').all(userId),
        payees: db.prepare('SELECT u.full_name AS name, u.email, p.nickname, p.created_at FROM payees p JOIN users u ON u.id = p.recipient_user_id WHERE p.user_id = ?').all(userId),
        goals: db.prepare('SELECT name, category, target_cents, current_cents, created_at FROM demo_goals WHERE user_id = ?').all(userId),
        demoPortfolio: {
            cash: db.prepare('SELECT cash_cents, created_at FROM demo_portfolios WHERE user_id = ?').get(userId) || null,
            holdings: db.prepare('SELECT symbol, quantity, average_price FROM demo_holdings WHERE user_id = ?').all(userId),
            trades: db.prepare('SELECT symbol, side, quantity, price, total_cents, created_at FROM demo_trades WHERE user_id = ? ORDER BY id').all(userId),
        },
        loanEstimates: db.prepare('SELECT kind, label, principal_cents, annual_rate_bps, term_months, monthly_payment_cents, created_at FROM loan_estimates WHERE user_id = ?').all(userId),
        signIns: db.prepare("SELECT created_at FROM audit_logs WHERE actor_id = ? AND action = 'login' ORDER BY created_at DESC LIMIT 50").all(userId),
    };
    logAudit({ actorId: userId, actorEmail: res.locals.user.email, action: 'data_exported', targetType: 'user', targetId: String(userId) });
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="willow-demo-data-${new Date().toISOString().slice(0, 10)}.json"`);
    res.send(JSON.stringify(payload, null, 2));
});

module.exports = router;
