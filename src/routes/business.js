const express = require('express');
const { requireAuth } = require('../middleware/auth');
const business = require('../services/business');
const router = express.Router();

const { jsonRoute, validId, noStore } = require('./helpers');

router.use(requireAuth, noStore);
const handle = (status, fn) => jsonRoute(status, fn, 'Business');

router.get('/dashboard', handle(200, req => ({ dashboard: business.getDashboard(req.session.userId) })));
router.put('/profile', handle(200, req => ({ profile: business.saveProfile(req.session.userId, req.body || {}) })));
router.get('/invoices', handle(200, req => ({ invoices: business.listInvoices(req.session.userId) })));
router.post('/invoices', handle(201, req => ({ invoice: business.createInvoice(req.session.userId, req.body || {}), simulated: true })));
router.post('/invoices/:id/pay', validId, handle(200, req => ({ invoice: business.markInvoicePaid(req.session.userId, Number(req.params.id), req.body || {}), simulated: true, message: 'Invoice marked paid. A simulated payment was recorded — no real money moved.' })));
router.post('/invoices/:id/void', validId, handle(200, req => ({ invoices: business.voidInvoice(req.session.userId, Number(req.params.id)) })));
router.get('/expenses', handle(200, req => ({ expenses: business.listExpenses(req.session.userId, req.query || {}) })));
router.post('/expenses', handle(201, req => ({ expense: business.createExpense(req.session.userId, req.body || {}) })));
router.put('/expenses/:id', validId, handle(200, req => ({ expense: business.updateExpense(req.session.userId, Number(req.params.id), req.body || {}) })));
router.delete('/expenses/:id', validId, handle(200, req => { business.deleteExpense(req.session.userId, Number(req.params.id)); return { deleted: true }; }));
router.get('/team', handle(200, req => ({ team: business.listTeam(req.session.userId) })));
router.post('/team', handle(201, req => ({ team: business.inviteMember(req.session.userId, req.body || {}), simulated: true, message: 'Invitation recorded. In this demo, invitees receive no email and no access.' })));
router.delete('/team/:id', validId, handle(200, req => ({ team: business.removeMember(req.session.userId, Number(req.params.id)) })));

module.exports = router;
