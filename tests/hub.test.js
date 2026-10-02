const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const supertest = require('supertest');
const { createTestApp, registerAgent } = require('./setup');

describe('Grounded financial Hub', () => {
    let app, db, close, owner, other, hub;
    before(async () => {
        const env = await createTestApp(); app = env.app; db = env.getDb(); close = env.closeDatabase;
        owner = await registerAgent(supertest, app, { email: 'hub-owner@example.test', password: 'HubDemo123', fullName: 'Hub Owner' });
        other = await registerAgent(supertest, app, { email: 'hub-other@example.test', password: 'HubDemo123', fullName: 'Hub Other' });
        hub = require('../src/services/hub');
    });
    after(() => close());

    it('renders a protected Hub and derives account and month totals from owned records', async () => {
        assert.equal((await supertest(app).get('/hub')).status, 302);
        const ownerId = db.prepare('SELECT id FROM users WHERE email = ?').get('hub-owner@example.test').id;
        const account = db.prepare('SELECT id FROM accounts WHERE user_id = ? LIMIT 1').get(ownerId);
        db.prepare(`INSERT INTO transactions (reference, account_id, type, amount, currency, direction, status, description, created_at)
            VALUES (?, ?, 'payment', 1234, 'USD', 'debit', 'completed', 'Market groceries', datetime('now'))`).run('hub-expense-1', account.id);
        db.prepare(`INSERT INTO transactions (reference, account_id, type, amount, currency, direction, status, description, created_at)
            VALUES (?, ?, 'deposit', 7500, 'USD', 'credit', 'completed', 'Demo income', datetime('now'))`).run('hub-income-1', account.id);
        const summary = hub.getSummary(ownerId);
        assert.equal(summary.month.expenseCents, 1234);
        assert.equal(summary.month.spendingCents, 1234);
        assert.equal(summary.month.incomeCents, 7500);
        assert.equal(summary.topExpenses[0].description, 'Market groceries');
        const page = await owner.agent.get('/hub');
        assert.equal(page.status, 200);
        assert.match(page.text, /Answers use only your Willow accounts/);
        assert.match(page.text, /Not connected/);
    });

    it('excludes internal transfers from spending totals and expense rankings', () => {
        const ownerId = db.prepare('SELECT id FROM users WHERE email = ?').get('hub-owner@example.test').id;
        const account = db.prepare('SELECT id FROM accounts WHERE user_id = ? LIMIT 1').get(ownerId);
        db.prepare(`INSERT INTO transactions (reference, account_id, type, amount, currency, direction, status, description, created_at)
            VALUES (?, ?, 'transfer', 90000, 'USD', 'debit', 'completed', 'Move to savings', datetime('now'))`).run('hub-transfer-1', account.id);
        const summary = hub.getSummary(ownerId);
        assert.equal(summary.month.expenseCents, 91234);
        assert.equal(summary.month.spendingCents, 1234);
        assert.equal(summary.topExpenses[0].description, 'Market groceries');
    });

    it('answers only from the requesting user’s financial records and rejects missing CSRF', async () => {
        const ownerId = db.prepare('SELECT id FROM users WHERE email = ?').get('hub-owner@example.test').id;
        const otherId = db.prepare('SELECT id FROM users WHERE email = ?').get('hub-other@example.test').id;
        assert.match((await hub.answerQuestion(ownerId, 'How much did I spend this month?')).answer, /\$12\.34/);
        assert.match((await hub.answerQuestion(otherId, 'How much did I spend this month?')).answer, /\$0\.00/);
        const response = await owner.agent.post('/api/hub/ask').send({ question: 'How much did I spend this month?' });
        assert.equal(response.status, 403);
        const unsupported = await hub.answerQuestion(ownerId, 'What will my stocks return?');
        assert.match(unsupported.answer, /can’t predict investment performance/);
        assert.equal(unsupported.kind, 'refusal');
    });
});