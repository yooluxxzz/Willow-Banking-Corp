const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const supertest = require('supertest');
const { createTestApp, registerAgent } = require('./setup');

describe('Net worth page and its financial summary', () => {
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
        assert.match(page.text, /<h1 class="page-head-title">Net worth<\/h1>/);
        assert.match(page.text, /Assets you track/);
        assert.match(page.text, /What you owe/);
    });

    it('counts money sent to other people as spending, but not moves between your own accounts', () => {
        const ownerId = db.prepare('SELECT id FROM users WHERE email = ?').get('hub-owner@example.test').id;
        const otherId = db.prepare('SELECT id FROM users WHERE email = ?').get('hub-other@example.test').id;
        const account = db.prepare('SELECT id FROM accounts WHERE user_id = ? LIMIT 1').get(ownerId);
        const savings = db.prepare("INSERT INTO accounts (user_id, account_number, account_type, balance, available_balance, currency) VALUES (?, '42009999990001', 'savings', 0, 0, 'USD')").run(ownerId).lastInsertRowid;
        const friend = db.prepare('SELECT id FROM accounts WHERE user_id = ? LIMIT 1').get(otherId);
        db.prepare(`INSERT INTO transactions (reference, account_id, related_account_id, type, amount, currency, direction, status, description, created_at)
            VALUES (?, ?, ?, 'transfer', 90000, 'USD', 'debit', 'completed', 'Move to savings', datetime('now'))`).run('hub-transfer-1', account.id, savings);
        const summary = hub.getSummary(ownerId);
        assert.equal(summary.month.expenseCents, 91234, 'every dollar that left the account');
        assert.equal(summary.month.spendingCents, 1234, 'but moving to your own savings is not spending');
        assert.equal(summary.topExpenses[0].description, 'Market groceries');

        db.prepare(`INSERT INTO transactions (reference, account_id, related_account_id, type, amount, currency, direction, status, description, created_at)
            VALUES (?, ?, ?, 'transfer', 2500, 'USD', 'debit', 'completed', 'Dinner split', datetime('now'))`).run('hub-p2p-1', account.id, friend.id);
        const after = hub.getSummary(ownerId);
        assert.equal(after.month.spendingCents, 3734, 'paying someone else is spending, as budgets count it');
        const budgets = require('../src/services/budgets');
        const start = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        assert.equal(budgets.personalSpending(ownerId, start, new Date(Date.now() + 1000)), 3734, 'budgets and the Net worth page agree');
        db.prepare("DELETE FROM transactions WHERE reference = 'hub-p2p-1'").run();
    });

    it('gives the assistant only the requesting user’s records and has retired the old rule-based endpoint', async () => {
        const ownerId = db.prepare('SELECT id FROM users WHERE email = ?').get('hub-owner@example.test').id;
        const otherId = db.prepare('SELECT id FROM users WHERE email = ?').get('hub-other@example.test').id;
        const assistant = require('../src/services/assistant');
        const own = await assistant.buildContext(ownerId);
        assert.match(own, /spending \(payments, withdrawals and money sent to other people; not moves between own accounts, investing cash or conversions\): \$12\.34/);
        assert.match(own, /Market groceries/);
        const others = await assistant.buildContext(otherId);
        assert.doesNotMatch(others, /Market groceries|12\.34/);
        assert.equal((await owner.agent.post('/api/hub/ask').set('X-CSRF-Token', owner.csrfToken).send({ question: 'Spending?' })).status, 404);
    });
});