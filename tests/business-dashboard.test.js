const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('crypto');
const supertest = require('supertest');
const { createTestApp, registerAgent } = require('./setup');

describe('Business demo workspace', () => {
    let app, db, close, owner, accountService;
    before(async () => {
        const env = await createTestApp(); app = env.app; db = env.getDb(); close = env.closeDatabase;
        owner = await registerAgent(supertest, app, { email: 'business-workspace@example.test', password: 'BusinessDemo123', fullName: 'Business Owner' });
        accountService = require('../src/services/account');
    });
    after(() => close());

    it('lets owners without a business account log expenses, and explains what an account adds', async () => {
        assert.equal((await supertest(app).get('/business/dashboard')).status, 302);
        const empty = await owner.agent.get('/business/dashboard');
        assert.equal(empty.status, 200);
        assert.match(empty.text, /No business account yet/);
        assert.match(empty.text, /log expenses and set budgets now/);
        assert.match(empty.text, /href="\/accounts\/new\?type=business"/);
        assert.match(empty.text, /href="\/business\/expense-log"/);
        assert.doesNotMatch(empty.text, /data-new-invoice/, 'invoices need a business account');
    });

    it('lists only the owner’s business checking and its account-specific ledger', async () => {
        const userId = db.prepare('SELECT id FROM users WHERE email = ?').get('business-workspace@example.test').id;
        const created = accountService.openAccount(userId, { product: 'business', nickname: 'Studio operations', requestKey: randomUUID(), demoAcknowledged: true });
        assert.ok(created.account);
        const page = await owner.agent.get('/business/dashboard');
        assert.equal(page.status, 200);
        assert.match(page.text, /Studio operations/);
        assert.match(page.text, /Money in this month/);
        assert.match(page.text, /href="\/business\/invoices"/);
        assert.match(page.text, /aren’t an accounting report/);
        assert.doesNotMatch(page.text, /Personal checking/);
    });
});