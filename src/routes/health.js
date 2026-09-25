/**
 * Health endpoint — readiness & liveness checks
 */
const express = require('express');
const { getDb } = require('../database');

const router = express.Router();

router.get('/', (req, res) => {
    try {
        const db = getDb();
        db.prepare('SELECT 1').get();

        const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
        const txnCount = db.prepare('SELECT COUNT(*) as count FROM transactions').get().count;
        const mem = process.memoryUsage();

        res.json({
            status: 'healthy',
            service: 'Willow Banking Corp',
            timestamp: new Date().toISOString(),
            uptime: Math.round(process.uptime()),
            database: {
                connected: true,
                users: userCount,
                transactions: txnCount,
            },
            memory: {
                rss: `${Math.round(mem.rss / 1024 / 1024)}MB`,
                heapUsed: `${Math.round(mem.heapUsed / 1024 / 1024)}MB`,
                heapTotal: `${Math.round(mem.heapTotal / 1024 / 1024)}MB`,
            },
            nodeVersion: process.version,
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
