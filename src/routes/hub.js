const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { getSummary, getPicture, answerQuestion } = require('../services/hub');
const router = express.Router();

router.use(requireAuth);
router.get('/summary', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ summary: getSummary(req.session.userId) });
});
router.get('/picture', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
        res.json(await getPicture(req.session.userId));
    } catch (error) {
        console.error('[Hub] Picture error:', error.message);
        res.status(500).json({ error: 'Your financial picture could not be loaded. Please try again.' });
    }
});
router.post('/ask', async (req, res) => {
    try {
        const result = await answerQuestion(req.session.userId, req.body.question);
        if (result.invalid) return res.status(400).json(result);
        res.set('Cache-Control', 'no-store');
        res.json(result);
    } catch (error) {
        console.error('[Hub] Ask error:', error.message);
        res.status(500).json({ error: 'Willow couldn’t answer right now. Please try again.' });
    }
});

module.exports = router;
