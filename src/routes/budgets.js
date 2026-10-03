const express = require('express');
const { requireAuth } = require('../middleware/auth');
const budgets = require('../services/budgets');
const router = express.Router();

const { jsonRoute, validId, noStore } = require('./helpers');

router.use(requireAuth, noStore);
const handle = (status, fn) => jsonRoute(status, fn, 'Budgets');
const scope = req => (req.query.scope === 'business' || (req.body && req.body.scope === 'business') ? 'business' : 'personal');

router.get('/', handle(200, req => ({ budgets: budgets.listBudgets(req.session.userId, scope(req)), categories: budgets.categoryOptions(scope(req)), periods: budgets.PERIODS })));
router.post('/', handle(201, req => ({ budget: budgets.createBudget(req.session.userId, { ...(req.body || {}), scope: scope(req) }) })));
router.put('/:id', validId, handle(200, req => ({ budget: budgets.updateBudget(req.session.userId, req.params.id, req.body || {}) })));
router.delete('/:id', validId, handle(200, req => { budgets.deleteBudget(req.session.userId, req.params.id); return { deleted: true }; }));

module.exports = router;
