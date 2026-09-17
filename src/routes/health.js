/**
 * Health endpoint
 */
const express = require('express');
const { getDb } = require('../database');

const router = express.Router();

router.get('/', (req, res) => {
    try {
        const db = getDb();
        db.prepare('SELECT 1').get();
        res.json({
            status: 'healthy',
            service: 'Willow Banking Corp',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
        });
    } catch (err) {
        res.status(503).json({
            status: 'unhealthy',
            service: 'Willow Banking Corp',
            error: 'Database connection failed',
            timestamp: new Date().toISOString(),
        });
    }
});

module.exports = router;
