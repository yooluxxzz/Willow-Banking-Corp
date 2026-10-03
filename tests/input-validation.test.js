const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const supertest = require('supertest');
const { createTestApp, registerAgent } = require('./setup');

/** Malformed JSON bodies get a clear 400, never a stored oddity or a leaked database error. */
describe('Input validation and error responses', () => {
    let app, db, closeDatabase, user, accountId;
    const send = (method, url, body) => user.agent[method](url).set('X-CSRF-Token', user.csrfToken).set('Accept', 'application/json').send(body);

    before(async () => {
        const env = await createTestApp(); app = env.app; db = env.getDb(); closeDatabase = env.closeDatabase;
        user = await registerAgent(supertest, app, { email: 'validation@example.test', password: 'Password123', fullName: 'Val Idation' });
        accountId = db.prepare("SELECT a.id FROM accounts a JOIN users u ON u.id = a.user_id WHERE u.email = 'validation@example.test'").get().id;
    });
    after(() => closeDatabase());

    it('rejects arrays and other non-strings where a category or kind is expected', async () => {
        const today = new Date().toLocaleDateString('en-CA');
        const expense = await send('post', '/api/business/expenses', { vendor: 'Rent Co', category: ['rent'], amount: '10', spentOn: today });
        assert.equal(expense.status, 400);
        assert.equal(db.prepare('SELECT COUNT(*) AS n FROM business_expenses').get().n, 0, 'nothing stored');
        const debt = await send('post', '/api/debts', { name: 'Card', kind: ['credit_card'], balance: '100' });
        assert.equal(debt.status, 400);
        assert.doesNotMatch(debt.body.error, /constraint|SQLITE/i, 'no database internals in the message');
        assert.equal((await send('post', '/api/budgets', { name: 'Food', period: 'monthly', limit: '50', category: ['groceries'] })).status, 400);
        assert.equal((await send('post', '/api/networth/assets', { name: 'Car', kind: { toString: 'vehicle' }, value: '10' })).status, 400);
    });

    it('accepts only numbers or numeric strings for money', async () => {
        assert.equal((await send('post', '/api/budgets', { name: 'Food', period: 'monthly', limit: true })).status, 400, 'true is not $1.00');
        assert.equal((await send('post', '/api/debts', { name: 'Loan', kind: 'personal', balance: true })).status, 400);
        assert.equal((await send('post', '/api/budgets', { name: 'Food', period: 'monthly', limit: '1e3' })).status, 400);
        assert.equal((await send('post', '/api/budgets', { name: 'Food', period: 'monthly', limit: 25.5 })).status, 201);
    });

    it('checks deposit and withdrawal notes', async () => {
        assert.equal((await send('post', '/api/deposits', { accountId, amount: '5', description: { note: 'x' } })).status, 400);
        assert.equal((await send('post', '/api/deposits', { accountId, amount: '5', description: 'x'.repeat(141) })).status, 400);
        assert.equal((await send('post', '/api/deposits', { accountId, amount: '5', description: 'Pocket money' })).status, 200);
    });

    it('answers unexpected failures with a generic message and keeps the details in the log', () => {
        const { sendError } = require('../src/routes/helpers');
        const { ValidationError } = require('../src/errors');
        const reply = () => { const res = { code: 0, body: null, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } }; return res; };
        const original = console.error;
        const logged = [];
        console.error = (...args) => logged.push(args.join(' '));
        try {
            const internal = sendError(reply(), new Error('CHECK constraint failed: kind IN (...)'), 'Test');
            assert.equal(internal.code, 500);
            assert.doesNotMatch(internal.body.error, /constraint/);
            assert.ok(logged.some(line => line.includes('constraint')), 'the real cause is logged on the server');
            const expected = sendError(reply(), new ValidationError('Choose a category.'), 'Test');
            assert.deepEqual([expected.code, expected.body.error], [400, 'Choose a category.']);
        } finally {
            console.error = original;
        }
    });
});
