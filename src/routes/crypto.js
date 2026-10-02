const express = require('express');
const { requireAuth } = require('../middleware/auth');
const cryptoWallet = require('../services/crypto-wallet');
const router = express.Router();

router.use(requireAuth);
router.get('/wallet', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ wallet: cryptoWallet.getCryptoWallet(req.session.userId), history: cryptoWallet.getCryptoHistory(req.session.userId), demoHandle: res.locals.user.email });
});
router.post('/send', (req, res) => {
    try {
        const result = cryptoWallet.sendDemoCrypto(req.session.userId, req.body);
        res.status(201).json({ message: 'Demo crypto transfer recorded. No blockchain transaction or real asset movement occurred.', transfer: result });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

module.exports = router;