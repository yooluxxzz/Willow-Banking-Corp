const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const supertest = require('supertest');
const { createTestApp, registerAgent } = require('./setup');

describe('Banking experience and transfer boundaries', () => {
    let app, db, closeDatabase, agent, csrf, accounts, otherAccount;
    before(async () => {
        const env = await createTestApp();
        app = env.app; db = env.getDb(); closeDatabase = env.closeDatabase;
        const first = await registerAgent(supertest, app, { email: 'review@test.com', password: 'Password123', fullName: 'Review Customer' });
        agent = first.agent; csrf = first.csrfToken;
        accounts = (await agent.get('/api/accounts')).body.accounts;
        db.prepare('UPDATE accounts SET balance = 100000, available_balance = 100000 WHERE id = ?').run(accounts[0].id);
        const other = await registerAgent(supertest, app, { email: 'other@test.com', password: 'Password123', fullName: 'Other Customer' });
        otherAccount = (await other.agent.get('/api/accounts')).body.accounts[0];
    });
    after(() => closeDatabase());
    const transfer = body => agent.post('/api/transfers').set('Accept', 'application/json').set('X-CSRF-Token', csrf).send(body);
    const balances = () => db.prepare('SELECT id, balance FROM accounts ORDER BY id').all();
    it('renders public pages and clearly labels business as a concept', async () => {
        for (const route of ['/', '/personal', '/business', '/contact', '/login', '/register', '/products/checking', '/products/savings', '/products/debit-cards', '/security-info', '/privacy', '/compliance', '/about']) {
            const response = await supertest(app).get(route);
            assert.equal(response.status, 200, route);
        }
        assert.match((await supertest(app).get('/business')).text, /Business banking is a concept preview/);
    });
    it('creates checking and savings destinations for new demo customers', () => {
        assert.deepEqual(accounts.map(a => a.account_type).sort(), ['checking', 'savings']);
    });
    it('atomically moves funds between owned accounts with matching ledger entries', async () => {
        const result = await transfer({ fromAccountId: accounts[0].id, toAccountId: accounts[1].id, amount: '12.34' });
        assert.equal(result.status, 200);
        assert.equal(result.body.simulated, true);
        assert.equal(db.prepare('SELECT balance FROM accounts WHERE id = ?').get(accounts[0].id).balance, 98766);
        assert.equal(db.prepare('SELECT balance FROM accounts WHERE id = ?').get(accounts[1].id).balance, 1234);
        const entries = db.prepare('SELECT amount, direction FROM transactions WHERE reference IN (?, ?)').all(result.body.reference, result.body.reference + '-C');
        assert.equal(entries.length, 2);
        assert.ok(entries.every(t => t.amount === 1234));
    });
    it('rejects another customer account ID without changing any balances', async () => {
        const before = balances();
        const result = await transfer({ fromAccountId: accounts[0].id, toAccountId: otherAccount.id, amount: '1.00' });
        assert.equal(result.status, 400);
        assert.deepEqual(balances(), before);
    });
    it('rejects an unowned source and a same-account destination', async () => {
        const before = balances();
        for (const body of [
            { fromAccountId: otherAccount.id, toAccountId: accounts[1].id, amount: '1.00' },
            { fromAccountId: accounts[0].id, toAccountId: accounts[0].id, amount: '1.00' },
        ]) assert.equal((await transfer(body)).status, 400);
        assert.deepEqual(balances(), before);
    });
    it('rejects malformed amounts, descriptions and conflicting destinations', async () => {
        const before = balances();
        for (const changes of [{ amount: '1.001' }, { amount: '-1' }, { amount: true }, { amount: [1] }, { amount: '1e-3' }, { description: {} }, { description: 'x'.repeat(201) }, { recipientEmail: {} , toAccountId: undefined }, { recipientEmail: 'other@test.com' }]) {
            assert.equal((await transfer({ fromAccountId: accounts[0].id, toAccountId: accounts[1].id, amount: '1.00', ...changes })).status, 400);
        }
        assert.deepEqual(balances(), before);
    });
    it('enforces CSRF and authentication for new own-account transfers', async () => {
        assert.equal((await agent.post('/api/transfers').set('Accept', 'application/json').send({ fromAccountId: accounts[0].id, toAccountId: accounts[1].id, amount: '1.00' })).status, 403);
        assert.equal((await supertest(app).get('/dashboard')).status, 302);
    });
    it('protects transaction search against access to another customer ledger', async () => {
        const response = await agent.get('/api/transactions?accountId=' + otherAccount.id + '&search=transfer');
        assert.equal(response.status, 403);
    });
});
