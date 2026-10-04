const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const supertest = require('supertest');
const { createTestApp } = require('./setup');

/**
 * The opt-in sample profile: a guest with four months of labelled example activity
 * that follows the same ledger rules as everything else.
 */
describe('Sample profile', () => {
    let app, db, close, agent, userId;

    before(async () => {
        const env = await createTestApp(); app = env.app; db = env.getDb(); close = env.closeDatabase;
        agent = supertest.agent(app);
        const page = await agent.get('/login');
        const csrf = page.text.match(/name="csrf-token" content="([^"]+)"/)[1];
        assert.match(page.text, /data-demo-kind="sample"/, 'offered on the sign-in page');
        const created = await agent.post('/auth/sample').set('X-CSRF-Token', csrf).set('Accept', 'application/json').send({});
        assert.equal(created.status, 200);
        assert.equal(created.body.redirect, '/dashboard?welcome=sample');
        userId = db.prepare('SELECT id FROM users WHERE is_sample = 1').get().id;
    });
    after(() => close());

    it('is a guest marked as sample, and every page says so', async () => {
        const user = db.prepare('SELECT is_guest, is_sample FROM users WHERE id = ?').get(userId);
        assert.deepEqual([user.is_guest, user.is_sample], [1, 1]);
        const dashboard = await agent.get('/dashboard?welcome=sample');
        assert.match(dashboard.text, /class="sample-banner"/);
        assert.match(dashboard.text, /Welcome to your sample profile/);
        assert.match((await agent.get('/budgets')).text, /The activity here is example data/);
    });

    it('keeps every balance equal to its ledger rows, with nothing dated in the future', () => {
        const rows = db.prepare(`SELECT a.balance, a.available_balance, COALESCE(SUM(CASE WHEN t.direction = 'credit' THEN t.amount ELSE -t.amount END), 0) AS ledger, COUNT(t.id) AS n
            FROM accounts a LEFT JOIN transactions t ON t.account_id = a.id WHERE a.user_id = ? GROUP BY a.id`).all(userId);
        assert.equal(rows.length, 3, 'checking, savings and business checking');
        rows.forEach(row => { assert.equal(row.balance, row.ledger); assert.equal(row.available_balance, row.ledger); assert.ok(row.balance >= 0); });
        assert.ok(rows.reduce((sum, row) => sum + row.n, 0) > 100, 'months of activity');
        const future = db.prepare("SELECT COUNT(*) AS n FROM transactions t JOIN accounts a ON a.id = t.account_id WHERE a.user_id = ? AND t.created_at > datetime('now', '+1 minute')").get(userId).n;
        assert.equal(future, 0);
        const payments = db.prepare('SELECT COUNT(*) AS n FROM debt_payments p JOIN transactions t ON t.reference = p.transaction_reference WHERE p.user_id = ?').get(userId).n;
        assert.ok(payments >= 4, 'debt payments are matched by ledger rows');
        const expenses = db.prepare('SELECT COUNT(*) AS n FROM business_expenses e JOIN transactions t ON t.reference = e.transaction_reference WHERE e.user_id = ?').get(userId).n;
        assert.ok(expenses >= 4, 'business expenses are matched by ledger rows');
    });

    it('fills in budgets, net worth history, debts, assets, goals and schedules', async () => {
        const count = table => db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`).get(userId).n;
        assert.equal(count('budgets'), 4);
        assert.ok(count('budget_checks') >= 100, 'a month of nightly budget checks');
        assert.ok(count('net_worth_snapshots') >= 100, 'net worth history');
        assert.equal(count('debts'), 2);
        assert.equal(count('assets'), 2);
        assert.equal(count('demo_goals'), 2);
        assert.equal(count('scheduled_transfers'), 2);
        const worth = await agent.get('/api/networth').set('Accept', 'application/json');
        assert.equal(worth.status, 200);
        assert.ok(worth.body.history.length >= 100);
        const ask = await agent.get('/budgets');
        assert.equal(ask.status, 200);
    });

    it('is removed with all its records when unused, like any guest', () => {
        db.prepare("UPDATE users SET created_at = datetime('now', '-10 days') WHERE id = ?").run(userId);
        db.prepare("UPDATE audit_logs SET created_at = datetime('now', '-9 days') WHERE actor_id = ?").run(userId);
        require('../src/services/guests').purgeStaleGuests({ days: 7 });
        assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users WHERE id = ?').get(userId).n, 0);
        for (const table of ['accounts', 'budgets', 'debts', 'debt_payments', 'business_expenses', 'net_worth_snapshots', 'assets']) {
            assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`).get(userId).n, 0, table);
        }
    });
});
