/**
 * Health endpoint — readiness check. Everyone sees whether Willow and its optional
 * parts (live market data, the local assistant) are up; internals such as record
 * counts, memory and process details are shown only to admins, or to requests from
 * the same machine while developing.
 */
const express = require('express');
const config = require('../config');
const { getDb } = require('../database');

const router = express.Router();
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

router.get('/', (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
        const db = getDb();
        db.prepare('SELECT 1').get();
        const marketData = require('../services/market-data').getStatus();
        const assistant = require('../services/assistant').cachedStatus();
        const body = {
            status: 'healthy',
            service: 'Willow Banking Corp',
            timestamp: new Date().toISOString(),
            features: { liveMarketDataService: Boolean(marketData.serviceAvailable), assistant: Boolean(assistant.available) },
        };
        const isAdmin = Boolean(req.session && req.session.userRole === 'admin');
        if (isAdmin || (config.isDev && LOOPBACK.has(req.ip))) {
            const mem = process.memoryUsage();
            Object.assign(body, {
                uptime: Math.round(process.uptime()),
                database: {
                    connected: true,
                    users: db.prepare('SELECT COUNT(*) AS count FROM users').get().count,
                    transactions: db.prepare('SELECT COUNT(*) AS count FROM transactions').get().count,
                },
                memory: {
                    rss: `${Math.round(mem.rss / 1024 / 1024)}MB`,
                    heapUsed: `${Math.round(mem.heapUsed / 1024 / 1024)}MB`,
                },
                nodeVersion: process.version,
                marketData: { ...marketData, service: require('../services/market-service').status() },
                assistant: { available: assistant.available, model: assistant.model, reason: assistant.reason },
            });
        }
        res.json(body);
    } catch (err) {
        res.status(503).json({ status: 'unhealthy', service: 'Willow Banking Corp', error: 'Database connection failed', timestamp: new Date().toISOString() });
    }
});

module.exports = router;
