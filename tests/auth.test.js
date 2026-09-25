/**
 * Auth integration tests
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const supertest = require('supertest');
const { createTestApp, loginAgent, registerAgent } = require('./setup');

describe('Auth', () => {
    let app, getDb, closeDatabase;

    before(async () => {
        const env = await createTestApp();
        app = env.app;
        getDb = env.getDb;
        closeDatabase = env.closeDatabase;
    });

    after(() => {
        try { closeDatabase(); } catch (e) { /* ok */ }
    });

    describe('Registration', () => {
        it('should register a new user with valid data', async () => {
            const { regRes } = await registerAgent(supertest, app, {
                email: 'test@example.com',
                password: 'Password123',
                fullName: 'Test User',
                phone: '555-1234',
            });
            assert.equal(regRes.status, 200);
            assert.equal(regRes.body.success, true);
            assert.equal(regRes.body.redirect, '/dashboard');
        });

        it('should reject duplicate email', async () => {
            const { regRes } = await registerAgent(supertest, app, {
                email: 'test@example.com',
                password: 'Password123',
                fullName: 'Test User 2',
                phone: '555-5678',
            });
            assert.equal(regRes.status, 400);
            assert.ok(regRes.body.error);
        });

        it('should reject weak password (no uppercase)', async () => {
            const { regRes } = await registerAgent(supertest, app, {
                email: 'weak1@example.com',
                password: 'password123',
                fullName: 'Weak User',
            });
            assert.equal(regRes.status, 400);
            assert.ok(regRes.body.error.toLowerCase().includes('password'));
        });

        it('should reject weak password (no digit)', async () => {
            const { regRes } = await registerAgent(supertest, app, {
                email: 'weak2@example.com',
                password: 'PasswordOnly',
                fullName: 'Weak User',
            });
            assert.equal(regRes.status, 400);
            assert.ok(regRes.body.error.toLowerCase().includes('password'));
        });

        it('should reject short password', async () => {
            const { regRes } = await registerAgent(supertest, app, {
                email: 'short@example.com',
                password: 'Ab1',
                fullName: 'Short User',
            });
            assert.equal(regRes.status, 400);
        });
    });

    describe('Login', () => {
        it('should login with valid credentials', async () => {
            const { loginRes } = await loginAgent(supertest, app, 'test@example.com', 'Password123');
            assert.equal(loginRes.status, 200);
            assert.equal(loginRes.body.success, true);
        });

        it('should reject wrong password', async () => {
            const agent = supertest.agent(app);
            const page = await agent.get('/login');
            const csrfMatch = page.text.match(/name="_csrf"\s+value="([^"]+)"/);
            const csrfToken = csrfMatch ? csrfMatch[1] : '';

            const res = await agent
                .post('/auth/login')
                .set('X-CSRF-Token', csrfToken)
                .send({ email: 'test@example.com', password: 'WrongPass123' });

            assert.equal(res.status, 401);
            assert.ok(res.body.error);
        });

        it('should login as admin', async () => {
            const { loginRes } = await loginAgent(supertest, app, 'admin@willow.test', 'Admin123Test');
            assert.equal(loginRes.status, 200);
            assert.equal(loginRes.body.redirect, '/admin');
        });
    });

    describe('Logout', () => {
        it('should logout successfully', async () => {
            const { agent, csrfToken } = await loginAgent(supertest, app, 'test@example.com', 'Password123');
            const res = await agent
                .post('/auth/logout')
                .set('X-CSRF-Token', csrfToken)
                .send({});

            assert.equal(res.status, 200);
            assert.equal(res.body.success, true);

            // After logout, dashboard should redirect
            const dashRes = await agent.get('/dashboard');
            assert.ok([302, 401].includes(dashRes.status) || dashRes.text.includes('login'));
        });
    });

    describe('Password Change', () => {
        it('should change password with correct current password', async () => {
            const { agent, csrfToken } = await loginAgent(supertest, app, 'test@example.com', 'Password123');
            const res = await agent
                .post('/auth/change-password')
                .set('X-CSRF-Token', csrfToken)
                .send({ currentPassword: 'Password123', newPassword: 'NewPass456' });

            assert.equal(res.status, 200);
            assert.ok(res.body.success);
        });

        it('should reject password change with wrong current password', async () => {
            // Login with the new password from the previous test
            const { agent, csrfToken } = await loginAgent(supertest, app, 'test@example.com', 'NewPass456');
            const res = await agent
                .post('/auth/change-password')
                .set('X-CSRF-Token', csrfToken)
                .send({ currentPassword: 'WrongCurrent1', newPassword: 'Another789' });

            assert.equal(res.status, 400);
            assert.ok(res.body.error.toLowerCase().includes('incorrect'));
        });
    });

    describe('CSRF Protection', () => {
        it('should reject POST without CSRF token', async () => {
            const res = await supertest(app)
                .post('/auth/login')
                .send({ email: 'test@example.com', password: 'Password123' });

            assert.equal(res.status, 403);
        });
    });
});
