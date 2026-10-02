const express = require('express');
const { requireAuth } = require('../middleware/auth');
const goals = require('../services/goals');
const router = express.Router();

router.use(requireAuth);
router.get('/', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ goals: goals.listGoals(req.session.userId) });
});
router.post('/', (req, res) => {
    try {
        res.status(201).json({ goal: goals.createGoal(req.session.userId, req.body) });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});
router.patch('/:id', (req, res) => {
    try {
        const goal = goals.updateGoal(req.session.userId, req.params.id, req.body);
        if (!goal) return res.status(404).json({ error: 'Goal not found.' });
        res.json({ goal });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});
router.delete('/:id', (req, res) => {
    try {
        if (!goals.deleteGoal(req.session.userId, req.params.id)) return res.status(404).json({ error: 'Goal not found.' });
        res.json({ success: true });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

module.exports = router;