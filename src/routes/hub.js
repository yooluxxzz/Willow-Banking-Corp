const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { getSummary, answerQuestion } = require('../services/hub');
const router = express.Router();

router.use(requireAuth);
router.get('/summary', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ summary: getSummary(req.session.userId) });
});
router.post('/ask', (req, res) => {
    const result = answerQuestion(req.session.userId, req.body.question);
    if (result.answer.startsWith('Enter a question')) return res.status(400).json(result);
    res.set('Cache-Control', 'no-store');
    res.json(result);
});

module.exports = router;