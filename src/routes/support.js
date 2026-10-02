/**
 * Help center contact form. Requests are stored for demonstration only —
 * Willow Demo has no staffed support team.
 */
const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { getDb } = require('../database');
const { validateEmail } = require('../middleware/validation');
const config = require('../config');

const router = express.Router();
const TOPICS = ['accounts', 'cards', 'payments', 'transfers', 'investing', 'crypto', 'loans', 'security', 'business', 'other'];
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: Math.max(5, config.rateLimit.authMax), standardHeaders: true, legacyHeaders: false, message: { error: 'Too many messages. Please try again later.' } });

router.post('/', limiter, (req, res) => {
    const { name, email, topic, message } = req.body || {};
    const user = res.locals.user;
    const senderName = user ? user.full_name : name;
    const senderEmail = user ? user.email : email;
    if (typeof senderName !== 'string' || senderName.trim().length < 2 || senderName.length > 100 || /[<>\x00-\x1f]/.test(senderName)) return res.status(400).json({ error: 'Enter your name.' });
    if (!validateEmail(senderEmail)) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (!TOPICS.includes(topic)) return res.status(400).json({ error: 'Choose a topic.' });
    if (typeof message !== 'string' || message.trim().length < 10 || message.length > 2000) return res.status(400).json({ error: 'Write a message of 10 to 2,000 characters.' });
    const reference = `WLW-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    getDb().prepare('INSERT INTO support_requests (user_id, reference, name, email, topic, message) VALUES (?, ?, ?, ?, ?, ?)').run(user ? user.id : null, reference, senderName.trim(), senderEmail.trim().toLowerCase(), topic, message.trim());
    res.status(201).json({ success: true, reference, message: 'Your message was saved with this reference. Willow Demo has no staffed support team, so no one will reply — but you can find most answers in the Help center.' });
});

router.get('/', (req, res) => {
    if (!res.locals.user) return res.status(401).json({ error: 'Authentication required' });
    res.set('Cache-Control', 'no-store');
    res.json({ requests: getDb().prepare('SELECT reference, topic, status, created_at FROM support_requests WHERE user_id = ? ORDER BY id DESC LIMIT 20').all(res.locals.user.id) });
});

module.exports = router;
