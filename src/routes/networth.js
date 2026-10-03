const express = require('express');
const { requireAuth } = require('../middleware/auth');
const networth = require('../services/networth');

const { jsonRoute, validId, noStore } = require('./helpers');

const handle = (status, fn) => jsonRoute(status, fn, 'Net worth');

const worth = express.Router();
worth.use(requireAuth, noStore);
worth.get('/', handle(200, req => networth.overview(req.session.userId)));
worth.get('/assets', handle(200, req => ({ assets: networth.listAssets(req.session.userId) })));
worth.post('/assets', handle(201, async req => { const asset = networth.createAsset(req.session.userId, req.body || {}); await networth.recordSnapshot(req.session.userId); return { asset }; }));
worth.put('/assets/:id', validId, handle(200, async req => { const asset = networth.updateAsset(req.session.userId, Number(req.params.id), req.body || {}); await networth.recordSnapshot(req.session.userId); return { asset }; }));
worth.delete('/assets/:id', validId, handle(200, async req => { networth.deleteAsset(req.session.userId, Number(req.params.id)); await networth.recordSnapshot(req.session.userId); return { deleted: true }; }));

const debts = express.Router();
debts.use(requireAuth, noStore);
debts.get('/', handle(200, req => ({ debts: networth.listDebts(req.session.userId), kinds: Object.entries(networth.DEBT_KINDS).map(([key, label]) => ({ key, label })) })));
debts.post('/', handle(201, async req => { const debt = networth.createDebt(req.session.userId, req.body || {}); await networth.recordSnapshot(req.session.userId); return { debt }; }));
debts.put('/:id', validId, handle(200, async req => { const debt = networth.updateDebt(req.session.userId, Number(req.params.id), req.body || {}); await networth.recordSnapshot(req.session.userId); return { debt }; }));
debts.delete('/:id', validId, handle(200, async req => { networth.deleteDebt(req.session.userId, Number(req.params.id)); await networth.recordSnapshot(req.session.userId); return { deleted: true }; }));
debts.post('/:id/payments', validId, handle(201, async req => { const debt = networth.recordPayment(req.session.userId, Number(req.params.id), req.body || {}); await networth.recordSnapshot(req.session.userId); return { debt }; }));

module.exports = { worth, debts };
