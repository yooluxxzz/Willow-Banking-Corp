const express = require('express');
const { requireAuth } = require('../middleware/auth');
const budgets = require('../services/budgets');
const router = express.Router();

router.use(requireAuth);
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

const handle = (status, fn) => (req, res) => {
    try {
        res.status(status).json(fn(req));
    } catch (error) {
        res.status(error.status || 400).json({ error: error.message });
    }
};
const validId = (req, res, next) => (/^[1-9]\d*$/.test(req.params.id) ? next() : res.status(400).json({ error: 'Invalid identifier.' }));
const scope = req => (req.query.scope === 'business' || (req.body && req.body.scope === 'business') ? 'business' : 'personal');

router.get('/', handle(200, req => ({ budgets: budgets.listBudgets(req.session.userId, scope(req)), categories: budgets.categoryOptions(scope(req)), periods: budgets.PERIODS })));
router.post('/', handle(201, req => ({ budget: budgets.createBudget(req.session.userId, { ...(req.body || {}), scope: scope(req) }) })));
router.put('/:id', validId, handle(200, req => ({ budget: budgets.updateBudget(req.session.userId, req.params.id, req.body || {}) })));
router.delete('/:id', validId, handle(200, req => { budgets.deleteBudget(req.session.userId, req.params.id); return { deleted: true }; }));

module.exports = router;
