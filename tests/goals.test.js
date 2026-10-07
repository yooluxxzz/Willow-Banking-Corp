const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const supertest = require('supertest');
const { createTestApp, registerAgent, openAccount } = require('./setup');

describe('Personal planning goals', () => {
    let app, db, close, owner, other;
    before(async () => {
        const env = await createTestApp(); app = env.app; db = env.getDb(); close = env.closeDatabase;
        owner = await registerAgent(supertest, app, { email: 'goal-owner@example.test', password: 'GoalDemo123', fullName: 'Goal Owner' });
        other = await registerAgent(supertest, app, { email: 'goal-other@example.test', password: 'GoalDemo123', fullName: 'Goal Other' });
        owner.savings = await openAccount(owner.agent, owner.csrfToken, 'savings');
    });
    after(() => close());

    it('creates, updates and deletes a user-owned plan without moving account money', async () => {
        assert.equal((await supertest(app).get('/goals')).status, 302);
        const ownerId = db.prepare('SELECT id FROM users WHERE email = ?').get('goal-owner@example.test').id;
        const page = await owner.agent.get('/goals');
        assert.equal(page.status, 200);
        assert.match(page.text, /real personal USD accounts/);

        const denied = await owner.agent.post('/api/goals').send({ name: 'Home', category: 'home', targetAmount: '5000' });
        assert.equal(denied.status, 403);
        const missingAccount = await owner.agent.post('/api/goals').set('X-CSRF-Token', owner.csrfToken)
            .send({ name: 'Home deposit', category: 'home', targetAmount: '5000', currentAmount: '9999' });
        assert.equal(missingAccount.status, 400);
        assert.match(missingAccount.body.error, /account/i);
        const deposit = await owner.agent.post('/api/deposits').set('X-CSRF-Token', owner.csrfToken).send({ accountId: owner.savings.id, amount: '125.50' });
        assert.equal(deposit.status, 200);
        const balanceBeforeGoal = db.prepare('SELECT SUM(balance) AS total FROM accounts WHERE user_id = ?').get(ownerId).total;
        const created = await owner.agent.post('/api/goals').set('X-CSRF-Token', owner.csrfToken)
            .send({ name: 'Home deposit', category: 'home', targetAmount: '5000', accountId: owner.savings.id, currentAmount: '9999' });
        assert.equal(created.status, 201);
        assert.equal(created.body.goal.current_cents, 12550);
        assert.equal(created.body.goal.account_id, owner.savings.id);

        const otherList = await other.agent.get('/api/goals');
        assert.deepEqual(otherList.body.goals, []);
        const foreignUpdate = await other.agent.patch(`/api/goals/${created.body.goal.id}`).set('X-CSRF-Token', other.csrfToken).send({ currentAmount: '200' });
        assert.equal(foreignUpdate.status, 404);

        const updated = await owner.agent.patch(`/api/goals/${created.body.goal.id}`).set('X-CSRF-Token', owner.csrfToken).send({ currentAmount: '750', targetAmount: '5000', accountId: owner.savings.id });
        assert.equal(updated.status, 200);
        assert.equal(updated.body.goal.current_cents, 12550);
        await owner.agent.post('/api/deposits').set('X-CSRF-Token', owner.csrfToken).send({ accountId: owner.savings.id, amount: '100' });
        const refreshed = await owner.agent.get('/api/goals');
        assert.equal(refreshed.body.goals[0].current_cents, 22550);
        assert.equal(db.prepare('SELECT SUM(balance) AS total FROM accounts WHERE user_id = ?').get(ownerId).total, balanceBeforeGoal + 10000);

        const invalid = await owner.agent.patch(`/api/goals/${created.body.goal.id}`).set('X-CSRF-Token', owner.csrfToken).send({ targetAmount: '500' });
        assert.equal(invalid.status, 400);
        const removed = await owner.agent.delete(`/api/goals/${created.body.goal.id}`).set('X-CSRF-Token', owner.csrfToken);
        assert.equal(removed.status, 200);
        assert.deepEqual((await owner.agent.get('/api/goals')).body.goals, []);
    });

    it('rejects unsafe names, unknown categories, malformed currency values and excess progress', async () => {
        const post = value => owner.agent.post('/api/goals').set('X-CSRF-Token', owner.csrfToken).send(value);
        assert.equal((await post({ name: '<b>Bad</b>', category: 'home', targetAmount: '500' })).status, 400);
        assert.equal((await post({ name: 'Test goal', category: 'stocks', targetAmount: '500' })).status, 400);
        assert.equal((await post({ name: 'Test goal', category: 'home', targetAmount: '10.001' })).status, 400);
        const realFunds = await post({ name: 'Actual funds', category: 'home', targetAmount: '10', accountId: owner.savings.id, currentAmount: '999999' });
        assert.equal(realFunds.status, 201);
        assert.equal(realFunds.body.goal.current_cents, 1000);
        assert.equal((await post({ name: 'Test goal', category: 'home', targetAmount: '10', accountId: 999999 })).status, 400);
        await owner.agent.delete(`/api/goals/${realFunds.body.goal.id}`).set('X-CSRF-Token', owner.csrfToken);
    });
});