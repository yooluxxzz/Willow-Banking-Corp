const express = require('express');
const { requireAuth } = require('../middleware/auth');
const networth = require('../services/networth');

const handle = (status, fn) => async (req, res) => {
    try {
        res.status(status).json(await fn(req));
    } catch (error) {
        if (!error.status && !/^(Enter|Choose|Name|Keep|You can|The payment|This debt|Not enough|Asset|Debt)/.test(error.message)) console.error('[Net worth] Error:', error.message);
        res.status(error.status || 400).json({ error: error.message });
    }
};
const validId = (req, res, next) => (/^[1-9]\d*$/.test(req.params.id) ? next() : res.status(400).json({ error: 'Invalid identifier.' }));
const noStore = (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); };

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
