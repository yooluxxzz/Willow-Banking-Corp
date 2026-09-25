/**
 * Admin & authorization integration tests
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const supertest = require('supertest');
const { createTestApp, loginAgent, registerAgent } = require('./setup');

describe('Admin & Authorization', () => {
    let app, getDb, closeDatabase;
    let adminAgent, adminCsrf;
    let customerAgent, customerCsrf;

    before(async () => {
        const env = await createTestApp();
        app = env.app;
        getDb = env.getDb;
        closeDatabase = env.closeDatabase;

        // Register a customer
        await registerAgent(supertest, app, {
            email: 'customer@test.com',
            password: 'Password123',
            fullName: 'Regular Customer',
        });

        // Login as admin
        const adminLogin = await loginAgent(supertest, app, 'admin@willow.test', 'Admin123Test');
        adminAgent = adminLogin.agent;
        adminCsrf = adminLogin.csrfToken;

        // Login as customer
        const custLogin = await loginAgent(supertest, app, 'customer@test.com', 'Password123');
        customerAgent = custLogin.agent;
        customerCsrf = custLogin.csrfToken;
    });

    after(() => {
        try { closeDatabase(); } catch (e) { /* ok */ }
    });

    describe('Admin Access Control', () => {
        it('should allow admin to access stats', async () => {
            const res = await adminAgent.get('/api/admin/stats');
            assert.equal(res.status, 200);
            assert.ok(res.body.totalCustomers !== undefined);
        });

        it('should deny customer access to admin stats', async () => {
            const res = await customerAgent.get('/api/admin/stats');
            assert.equal(res.status, 403);
        });

        it('should allow admin to list users', async () => {
            const res = await adminAgent.get('/api/admin/users');
            assert.equal(res.status, 200);
            assert.ok(Array.isArray(res.body.users));
        });

        it('should deny customer access to user list', async () => {
            const res = await customerAgent.get('/api/admin/users');
            assert.equal(res.status, 403);
        });
    });

    describe('Admin User Management', () => {
        it('should view user details', async () => {
            const db = getDb();
            const customer = db.prepare("SELECT id FROM users WHERE email = 'customer@test.com'").get();

            const res = await adminAgent.get(`/api/admin/users/${customer.id}`);
            assert.equal(res.status, 200);
            assert.ok(res.body.user);
            assert.equal(res.body.user.email, 'customer@test.com');
        });

        it('should prevent admin from modifying own account', async () => {
            const db = getDb();
            const admin = db.prepare("SELECT id FROM users WHERE email = 'admin@willow.test'").get();

            const res = await adminAgent
                .post(`/api/admin/users/${admin.id}/status`)
                .set('X-CSRF-Token', adminCsrf)
                .send({ status: 'suspended', reason: 'test' });

            assert.equal(res.status, 403);
            assert.ok(res.body && res.body.error && res.body.error.includes('own account'));
        });

        it('should suspend a customer account', async () => {
            const db = getDb();
            const customer = db.prepare("SELECT id FROM users WHERE email = 'customer@test.com'").get();

            const res = await adminAgent
                .post(`/api/admin/users/${customer.id}/status`)
                .set('X-CSRF-Token', adminCsrf)
                .send({ status: 'suspended', reason: 'policy violation' });

            assert.equal(res.status, 200);
            assert.ok(res.body.success);
        });
    });

    describe('Unauthenticated Access', () => {
        it('should deny unauthenticated access to accounts', async () => {
            const res = await supertest(app).get('/api/accounts');
            assert.ok([401, 302].includes(res.status));
        });

        it('should deny unauthenticated access to deposits', async () => {
            const res = await supertest(app)
                .post('/api/deposits')
                .send({ accountId: 1, amount: '100' });
            assert.ok([401, 302, 403].includes(res.status));
        });
    });

    describe('Health Endpoint', () => {
        it('should return health status', async () => {
            const res = await supertest(app).get('/health');
            assert.equal(res.status, 200);
            assert.equal(res.body.status, 'healthy');
            assert.ok(res.body.database);
            assert.ok(res.body.memory);
        });
    });
});
