/**
 * Financial operations integration tests (deposits, withdrawals, transfers)
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const supertest = require('supertest');
const { createTestApp, registerAgent, loginAgent } = require('./setup');

describe('Financial Operations', () => {
    let app, getDb, closeDatabase;
    let userAgent, userCsrf, userAccountId;
    let user2Agent, user2Csrf;

    before(async () => {
        const env = await createTestApp();
        app = env.app;
        getDb = env.getDb;
        closeDatabase = env.closeDatabase;

        // Register user 1
        const { agent: a1, csrfToken: c1 } = await registerAgent(supertest, app, {
            email: 'alice@test.com',
            password: 'Password123',
            fullName: 'Alice Test',
        });
        userAgent = a1;
        userCsrf = c1;

        // Get account ID
        const acctRes = await userAgent.get('/api/accounts');
        userAccountId = acctRes.body.accounts?.[0]?.id;

        // Register user 2
        const { agent: a2, csrfToken: c2 } = await registerAgent(supertest, app, {
            email: 'bob@test.com',
            password: 'Password123',
            fullName: 'Bob Test',
        });
        user2Agent = a2;
        user2Csrf = c2;
    });

    after(() => {
        try { closeDatabase(); } catch (e) { /* ok */ }
    });

    describe('Deposits', () => {
        it('should deposit money successfully', async () => {
            const res = await userAgent
                .post('/api/deposits')
                .set('X-CSRF-Token', userCsrf)
                .send({ accountId: userAccountId, amount: '500.00', description: 'Test deposit' });

            assert.equal(res.status, 200);
            assert.ok(res.body.success);
            assert.ok(res.body.reference.startsWith('DEP-'));
        });

        it('should reject negative deposit', async () => {
            const res = await userAgent
                .post('/api/deposits')
                .set('X-CSRF-Token', userCsrf)
                .send({ accountId: userAccountId, amount: '-100' });

            assert.equal(res.status, 400);
        });

        it('should reject zero deposit', async () => {
            const res = await userAgent
                .post('/api/deposits')
                .set('X-CSRF-Token', userCsrf)
                .send({ accountId: userAccountId, amount: '0' });

            assert.equal(res.status, 400);
        });

        it('should enforce daily deposit limit', async () => {
            // Deposit $9,500 more (total would be $10,000)
            await userAgent
                .post('/api/deposits')
                .set('X-CSRF-Token', userCsrf)
                .send({ accountId: userAccountId, amount: '9500.00' });

            // This $1 should exceed the $10,000 limit
            const res = await userAgent
                .post('/api/deposits')
                .set('X-CSRF-Token', userCsrf)
                .send({ accountId: userAccountId, amount: '1.00' });

            assert.equal(res.status, 400);
            assert.ok(res.body.error.includes('Daily deposit limit'));
        });
    });

    describe('Withdrawals', () => {
        it('should withdraw money successfully', async () => {
            const res = await userAgent
                .post('/api/withdrawals')
                .set('X-CSRF-Token', userCsrf)
                .send({ accountId: userAccountId, amount: '100.00', description: 'ATM' });

            assert.equal(res.status, 200);
            assert.ok(res.body.reference.startsWith('WDR-'));
        });

        it('should reject withdrawal exceeding balance', async () => {
            const res = await userAgent
                .post('/api/withdrawals')
                .set('X-CSRF-Token', userCsrf)
                .send({ accountId: userAccountId, amount: '999999.00' });

            assert.equal(res.status, 400);
            assert.ok(res.body.error.includes('Insufficient'));
        });

        it('should reject invalid amount', async () => {
            const res = await userAgent
                .post('/api/withdrawals')
                .set('X-CSRF-Token', userCsrf)
                .send({ accountId: userAccountId, amount: 'abc' });

            assert.equal(res.status, 400);
        });
    });

    describe('Transfers', () => {
        it('should transfer money to another user', async () => {
            const res = await userAgent
                .post('/api/transfers')
                .set('X-CSRF-Token', userCsrf)
                .send({
                    fromAccountId: userAccountId,
                    recipientEmail: 'bob@test.com',
                    amount: '50.00',
                    description: 'Test transfer',
                });

            assert.equal(res.status, 200);
            assert.ok(res.body.success);
            assert.ok(res.body.reference.startsWith('TRF-'));
        });

        it('should reject transfer to non-existent user', async () => {
            const res = await userAgent
                .post('/api/transfers')
                .set('X-CSRF-Token', userCsrf)
                .send({
                    fromAccountId: userAccountId,
                    recipientEmail: 'nobody@test.com',
                    amount: '50.00',
                });

            assert.equal(res.status, 400);
            assert.ok(res.body.error.includes('No user found'));
        });

        it('should reject transfer with insufficient funds', async () => {
            const res = await userAgent
                .post('/api/transfers')
                .set('X-CSRF-Token', userCsrf)
                .send({
                    fromAccountId: userAccountId,
                    recipientEmail: 'bob@test.com',
                    amount: '999999.00',
                });

            assert.equal(res.status, 400);
        });
    });

    describe('Account Balance', () => {
        it('should reflect correct balance after operations', async () => {
            const res = await userAgent.get('/api/accounts');
            assert.equal(res.status, 200);
            assert.ok(res.body.accounts.length > 0);

            // Deposited $10,000, withdrew $100, transferred $50 = $9,850
            const balance = res.body.accounts[0].balance;
            assert.equal(balance, 985000); // $9,850.00 in cents
        });
    });
});
