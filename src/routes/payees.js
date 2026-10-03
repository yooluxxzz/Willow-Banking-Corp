const express = require('express');
const { requireAuth } = require('../middleware/auth');
const payees = require('../services/payees');
const { getDb } = require('../database');
const { validateEmail } = require('../middleware/validation');
const { sendError } = require('./helpers');
const router = express.Router();

router.use(requireAuth);
router.get('/', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ payees: payees.listPayees(req.session.userId) });
});
/** Confirmation of payee: shows a short form of the name behind a Willow email before sending. */
router.get('/lookup', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const email = typeof req.query.email === 'string' ? req.query.email.trim() : '';
    if (!validateEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    const person = getDb().prepare('SELECT id, full_name, status FROM users WHERE email = ? COLLATE NOCASE').get(email);
    if (!person || person.status !== 'active' || person.id === req.session.userId) {
        return res.json({ found: false, self: Boolean(person && person.id === req.session.userId) });
    }
    const [first, ...rest] = person.full_name.trim().split(/\s+/);
    res.json({ found: true, name: rest.length ? `${first} ${rest[rest.length - 1].charAt(0)}.` : first, initials: (first.charAt(0) + (rest.length ? rest[rest.length - 1].charAt(0) : '')).toUpperCase() });
});

router.post('/', (req, res) => {
    try {
        res.status(201).json({ payees: payees.addPayee(req.session.userId, req.body) });
    } catch (error) {
        sendError(res, error, 'Payees');
    }
});
router.delete('/:id', (req, res) => {
    if (!/^[1-9]\d*$/.test(req.params.id)) return res.status(400).json({ error: 'Invalid payee.' });
    try {
        res.json({ payees: payees.removePayee(req.session.userId, Number(req.params.id)) });
    } catch (error) {
        sendError(res, error, 'Payees');
    }
});

module.exports = router;
