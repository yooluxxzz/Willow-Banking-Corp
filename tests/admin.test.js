/**
 * Admin & authorization integration tests
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const supertest = require('supertest');
const { createTestApp, loginAgent, registerAgent, openAccount } = require('./setup');

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

    describe('Balance adjustments', () => {
        it('records an adjustment in the account’s own currency and refuses debits it can’t cover', async () => {
            const owner = await registerAgent(supertest, app, { email: 'adjust@test.com', password: 'Password123', fullName: 'Adjusted Customer' });
            const euros = await openAccount(owner.agent, owner.csrfToken, 'currency', { currency: 'EUR' });
            const send = body => adminAgent.post('/api/admin/balance-adjustment').set('X-CSRF-Token', adminCsrf).set('Accept', 'application/json').send(body);
            assert.equal((await send({ accountId: euros.id, amount: '25', type: 'credit' })).status, 400, 'a reason is required');
            const credit = await send({ accountId: euros.id, amount: '25', type: 'credit', reason: 'Goodwill credit' });
            assert.equal(credit.status, 200);
            const db = getDb();
            const row = db.prepare('SELECT currency, amount, direction FROM transactions WHERE reference = ?').get(credit.body.reference);
            assert.deepEqual(row, { currency: 'EUR', amount: 2500, direction: 'credit' });
            const note = db.prepare("SELECT message FROM notifications WHERE title = 'Balance adjustment' ORDER BY id DESC LIMIT 1").get();
            assert.match(note.message, /€25\.00/);
            const tooMuch = await send({ accountId: euros.id, amount: '26', type: 'debit', reason: 'Correction' });
            assert.equal(tooMuch.status, 400);
            assert.equal(db.prepare('SELECT balance FROM accounts WHERE id = ?').get(euros.id).balance, 2500);
        });
    });

    describe('System panel and audit filters', () => {
        it('runs the daily checks on demand and records it', async () => {
            const system = await adminAgent.get('/api/admin/system');
            assert.equal(system.status, 200);
            assert.ok(system.body.dailyChecks.nightlyTime && system.body.assistant && system.body.marketData);
            assert.ok([401, 403].includes((await customerAgent.post('/api/admin/daily-checks').set('X-CSRF-Token', customerCsrf)).status), 'admins only');
            const run = await adminAgent.post('/api/admin/daily-checks').set('X-CSRF-Token', adminCsrf).set('Accept', 'application/json');
            assert.equal(run.status, 200);
            assert.ok(Array.isArray(run.body.days) && run.body.days.length >= 1);
            const audit = await adminAgent.get('/api/admin/audit-log?action=daily_checks_run');
            assert.equal(audit.body.logs.length, 1);
        });

        it('only offers audit filters for actions Willow really records', () => {
            const fs = require('node:fs');
            const path = require('node:path');
            const view = fs.readFileSync(path.join(__dirname, '../views/admin/dashboard.ejs'), 'utf8');
            const select = view.slice(view.indexOf('id="auditAction"'), view.indexOf('</select>', view.indexOf('id="auditAction"')));
            const values = [...select.matchAll(/<option value="([^"]+)"/g)].flatMap(m => m[1].split(','));
            const source = ['routes', 'services'].flatMap(dir => fs.readdirSync(path.join(__dirname, '../src', dir)).map(file => fs.readFileSync(path.join(__dirname, '../src', dir, file), 'utf8'))).join('\n');
            const missing = values.filter(action => !source.includes(`'${action}'`));
            assert.deepEqual(missing, [], 'every filter matches an action the code logs');
        });
    });

    describe('Health Endpoint', () => {
        it('tells anyone the service is up, but keeps internals for admins', async () => {
            const res = await supertest(app).get('/health');
            assert.equal(res.status, 200);
            assert.equal(res.body.status, 'healthy');
            assert.equal(res.body.memory, undefined, 'no memory, process or user counts in public');
            assert.equal(res.body.database, undefined);
            const detailed = await adminAgent.get('/health');
            assert.equal(detailed.body.status, 'healthy');
            assert.ok(detailed.body.database && detailed.body.memory && detailed.body.marketData, 'admins see the details');
        });
    });
});
