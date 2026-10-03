const express = require('express');
const { requireAuth } = require('../middleware/auth');
const schedules = require('../services/scheduled-transfers');
const { sendError } = require('./helpers');
const router = express.Router();

router.use(requireAuth);
router.get('/', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ transfers: schedules.listScheduledTransfers(req.session.userId) });
});
router.post('/', (req, res) => {
    try {
        res.status(201).json({ transfer: schedules.scheduleTransfer(req.session.userId, req.body), simulated: true });
    } catch (error) {
        sendError(res, error, 'Scheduled transfers');
    }
});
router.delete('/:id', (req, res) => {
    try {
        if (!schedules.cancelScheduledTransfer(req.session.userId, req.params.id)) return res.status(404).json({ error: 'A pending scheduled transfer could not be found.' });
        res.json({ success: true, message: 'Scheduled demo transfer cancelled.' });
    } catch (error) {
        sendError(res, error, 'Scheduled transfers');
    }
});

module.exports = router;