/**
 * Test setup — initializes a fresh in-memory database for each test file
 * Uses Node.js built-in test runner
 */
const path = require('path');

// Override database path to use in-memory before any imports
process.env.DATABASE_PATH = ':memory:';
process.env.SESSION_SECRET = 'test-secret-key-for-testing';
process.env.NODE_ENV = 'test';
// Functional tests exercise many logins from one IP; rate limits are tested separately.
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX || '100';
process.env.API_RATE_LIMIT_MAX = process.env.API_RATE_LIMIT_MAX || '100000';
process.env.PUBLIC_API_RATE_LIMIT_MAX = process.env.PUBLIC_API_RATE_LIMIT_MAX || '100000';
process.env.ADMIN_EMAIL = 'admin@willow.test';
process.env.ADMIN_PASSWORD = 'Admin123Test';
// Tests never reach the network: the market-data provider is chosen per test.
process.env.MARKET_DATA_PROVIDER = process.env.MARKET_DATA_PROVIDER || 'yahoo-chart';

/**
 * Create and initialize a test application instance
 */
async function createTestApp() {
    const { initializeDatabase, getDb, closeDatabase } = require('../src/database');
    await initializeDatabase();

    const { initializeAdmin } = require('../src/services/auth');
    await initializeAdmin();

    const session = require('express-session');
    const { createApp } = require('../src/app');
    const sessionStore = new session.MemoryStore();
    const app = createApp({ sessionStore, sessionSecret: 'test-secret', cookieName: 'willow.sid.test', secureCookies: false });
    return { app, getDb, closeDatabase, sessionStore };
}

function csrfFrom(text) {
    const match = text && text.match(/name="_csrf"\s+value="([^"]+)"/);
    if (match) return match[1];
    const meta = text && text.match(/name="csrf-token"\s+content="([^"]+)"/);
    return meta ? meta[1] : '';
}

/**
 * Create an authenticated agent with a CSRF token
 */
async function loginAgent(supertest, app, email, password) {
    const agent = supertest.agent(app);
    const page = await agent.get('/login');
    const csrfToken = csrfFrom(page.text);
    const loginRes = await agent
        .post('/auth/login')
        .set('X-CSRF-Token', csrfToken)
        .send({ email, password });
    const page2 = await agent.get('/settings');
    const newCsrf = csrfFrom(page2.text) || csrfToken;
    return { agent, csrfToken: newCsrf, loginRes };
}

/**
 * Register a user and return the authenticated agent
 */
async function registerAgent(supertest, app, userData) {
    const agent = supertest.agent(app);
    const page = await agent.get('/register');
    const csrfToken = csrfFrom(page.text);
    const regRes = await agent
        .post('/auth/register')
        .set('X-CSRF-Token', csrfToken)
        .send(userData);
    const settings = regRes.status === 200 ? await agent.get('/settings') : null;
    const newCsrf = (settings && csrfFrom(settings.text)) || csrfToken;
    return { agent, csrfToken: newCsrf, regRes };
}

module.exports = { createTestApp, loginAgent, registerAgent, csrfFrom, root: path.resolve(__dirname, '..') };
