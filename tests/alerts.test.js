const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const supertest = require('supertest');
const { createTestApp, registerAgent } = require('./setup');

describe('Alert preferences', () => {
    let app, db, closeDatabase, customer, userId;
    const count = type => db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND type = ?').get(userId, type).n;
    const patch = body => customer.agent.patch('/api/preferences').set('X-CSRF-Token', customer.csrfToken).set('Accept', 'application/json').send(body);

    before(async () => {
        const env = await createTestApp(); app = env.app; db = env.getDb(); closeDatabase = env.closeDatabase;
        customer = await registerAgent(supertest, app, { email: 'alerts@example.test', password: 'Password123', fullName: 'Alert Tester' });
        userId = db.prepare('SELECT id FROM users WHERE email = ?').get('alerts@example.test').id;
    });
    after(() => closeDatabase());

    it('shows only switches that do something', async () => {
        const page = await customer.agent.get('/settings');
        for (const label of ['Payments and transfers', 'Card activity', 'Budgets', 'Security']) assert.match(page.text, new RegExp(label));
        assert.doesNotMatch(page.text, /Willow news|Updates about your portfolio and watchlist/);
    });

    it('stops payment alerts when they are switched off, and starts them again', async () => {
        const account = db.prepare('SELECT id FROM accounts WHERE user_id = ?').get(userId);
        const deposit = () => customer.agent.post('/api/deposits').set('X-CSRF-Token', customer.csrfToken).set('Accept', 'application/json').send({ accountId: account.id, amount: '10' });
        assert.equal((await deposit()).status, 200);
        assert.equal(count('deposit'), 1);
        assert.equal((await patch({ alertTransactions: false })).status, 200);
        assert.equal((await deposit()).status, 200);
        assert.equal(count('deposit'), 1, 'no alert while switched off');
        assert.equal((await patch({ alertTransactions: true })).status, 200);
        assert.equal((await deposit()).status, 200);
        assert.equal(count('deposit'), 2);
    });

    it('applies the Budgets switch to nightly budget alerts', async () => {
        const budgets = require('../src/services/budgets');
        await patch({ alertBudgets: false });
        const budget = budgets.createBudget(userId, { name: 'Tiny', period: 'daily', limit: '1', scope: 'personal' });
        const account = db.prepare('SELECT id FROM accounts WHERE user_id = ?').get(userId);
        db.prepare("INSERT INTO transactions (reference, account_id, type, amount, currency, direction, status, description, category) VALUES ('WDR-ALERT-1', ?, 'withdrawal', 500, 'USD', 'debit', 'completed', 'Lunch', 'dining')").run(account.id);
        budgets.checkBudgetDay(db.prepare('SELECT * FROM budgets WHERE id = ?').get(budget.id), new Date());
        assert.equal(count('budget'), 0, 'switched off: the check is recorded but no alert is shown');
        assert.equal(db.prepare('SELECT status FROM budget_checks WHERE budget_id = ?').get(budget.id).status, 'over');
    });

    it('reports security alerts honestly in the Security center', async () => {
        await patch({ alertSecurity: false });
        const overview = await customer.agent.get('/api/security/overview').set('Accept', 'application/json');
        assert.equal(overview.body.checks.find(check => check.key === 'alerts').done, false);
    });
});
