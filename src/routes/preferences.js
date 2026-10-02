const express = require('express');
const { requireAuth } = require('../middleware/auth');
const preferences = require('../services/preferences');
const router = express.Router();

router.use(requireAuth);
router.get('/', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ preferences: preferences.getPreferences(req.session.userId) });
});
router.patch('/', (req, res) => {
    try {
        res.json({ success: true, preferences: preferences.updatePreferences(req.session.userId, req.body || {}) });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

module.exports = router;
