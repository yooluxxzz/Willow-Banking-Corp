/**
 * Test setup — initializes a fresh in-memory database for each test file
 * Uses Node.js built-in test runner
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

// Override database path to use in-memory before any imports
process.env.DATABASE_PATH = ':memory:';
process.env.SESSION_SECRET = 'test-secret-key-for-testing';
process.env.NODE_ENV = 'test';
process.env.ADMIN_EMAIL = 'admin@willow.test';
process.env.ADMIN_PASSWORD = 'Admin123Test';

/**
 * Create and initialize a test application instance
 */
async function createTestApp() {
    // Clear module cache for fresh state on each call
    const modKeys = Object.keys(require.cache).filter(k =>
        k.includes('Willow Banking Corp') && !k.includes('node_modules')
    );
    modKeys.forEach(k => delete require.cache[k]);

    const { initializeDatabase, getDb, closeDatabase } = require('../src/database');
    await initializeDatabase();

    const { initializeAdmin } = require('../src/services/auth');
    await initializeAdmin();

    // Build the Express app (re-require to get fresh state)
    const express = require('express');
    const session = require('express-session');
    const config = require('../src/config');
    const { loadUser } = require('../src/middleware/auth');
    const { securityHeaders, csrfProtection, injectCsrfToken } = require('../src/middleware/security');
    const { formatCurrency, fromCents } = require('../src/middleware/validation');

    const app = express();
    app.set('view engine', 'ejs');
    app.set('views', path.resolve(__dirname, '..', 'views'));
    app.use(express.json({ limit: '1mb' }));
    app.use(express.urlencoded({ extended: true, limit: '1mb' }));
    app.use(securityHeaders);

    // In-memory session store for tests
    app.use(session({
        secret: 'test-secret',
        resave: false,
        saveUninitialized: false,
        cookie: { secure: false, httpOnly: true, maxAge: 86400000 },
        name: 'willow.sid.test',
    }));

    app.use(injectCsrfToken);
    app.use(loadUser);
    app.use((req, res, next) => {
        res.locals.formatCurrency = formatCurrency;
        res.locals.fromCents = fromCents;
        res.locals.currentPath = req.path;
        next();
    });
    app.use('/api', csrfProtection);
    app.use('/auth', csrfProtection);

    // Routes
    app.use('/auth', require('../src/routes/auth'));
    app.use('/api/accounts', require('../src/routes/accounts'));
    app.use('/api/transactions', require('../src/routes/transactions'));
    app.use('/api/transfers', require('../src/routes/transfers'));
    app.use('/api/deposits', require('../src/routes/deposits'));
    app.use('/api/withdrawals', require('../src/routes/withdrawals'));
    app.use('/api/cards', require('../src/routes/cards'));
    app.use('/api/notifications', require('../src/routes/notifications'));
    app.use('/api/statements', require('../src/routes/statements'));
    app.use('/api/admin', require('../src/routes/admin'));
    app.use('/health', require('../src/routes/health'));
    app.use('/', require('../src/routes/pages'));

    // Error handler
    app.use((err, req, res, next) => {
        res.status(500).json({ error: 'Internal test error' });
    });

    return { app, getDb, closeDatabase };
}

/**
 * Create an authenticated agent with a CSRF token
 */
async function loginAgent(supertest, app, email, password) {
    const agent = supertest.agent(app);

    // Get CSRF token from a page
    const page = await agent.get('/login');
    const csrfMatch = page.text.match(/name="_csrf"\s+value="([^"]+)"/);
    const csrfToken = csrfMatch ? csrfMatch[1] : '';

    // Login
    const loginRes = await agent
        .post('/auth/login')
        .set('X-CSRF-Token', csrfToken)
        .send({ email, password });

    // Re-fetch CSRF after login (session regenerated)
    const page2 = await agent.get('/settings');
    const csrfMatch2 = page2.text.match(/name="_csrf"\s+value="([^"]+)"/);
    const newCsrf = csrfMatch2 ? csrfMatch2[1] : csrfToken;

    return { agent, csrfToken: newCsrf, loginRes };
}

/**
 * Register a user and return the authenticated agent
 */
async function registerAgent(supertest, app, userData) {
    const agent = supertest.agent(app);

    const page = await agent.get('/register');
    const csrfMatch = page.text.match(/name="_csrf"\s+value="([^"]+)"/);
    const csrfToken = csrfMatch ? csrfMatch[1] : '';

    const regRes = await agent
        .post('/auth/register')
        .set('X-CSRF-Token', csrfToken)
        .send(userData);

    return { agent, csrfToken, regRes };
}

module.exports = { createTestApp, loginAgent, registerAgent };
