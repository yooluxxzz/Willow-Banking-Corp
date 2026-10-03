const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const supertest = require('supertest');
const { createTestApp, registerAgent, openAccount } = require('./setup');

describe('Scheduled demo transfers', () => {
    let app, db, close, owner, other, accounts, schedules;
    const tomorrowUtc = () => {
        const date = new Date();
        date.setUTCHours(0, 0, 0, 0);
        date.setUTCDate(date.getUTCDate() + 1);
        return date.toISOString().slice(0, 10);
    };
    before(async () => {
        const env = await createTestApp(); app = env.app; db = env.getDb(); close = env.closeDatabase;
        owner = await registerAgent(supertest, app, { email: 'schedule-owner@example.test', password: 'ScheduleDemo123', fullName: 'Schedule Owner' });
        other = await registerAgent(supertest, app, { email: 'schedule-other@example.test', password: 'ScheduleDemo123', fullName: 'Schedule Other' });
        const userId = db.prepare('SELECT id FROM users WHERE email = ?').get('schedule-owner@example.test').id;
        await openAccount(owner.agent, owner.csrfToken, 'savings');
        accounts = db.prepare('SELECT id FROM accounts WHERE user_id = ? ORDER BY id').all(userId);
        db.prepare('UPDATE accounts SET balance = 0, available_balance = 0 WHERE user_id = ?').run(userId);
        schedules = require('../src/services/scheduled-transfers');
    });
    after(() => close());

    it('requires authentication and CSRF, isolates schedules, and supports cancellation before due date', async () => {
        assert.equal((await supertest(app).get('/scheduled-transfers')).status, 302);
        assert.equal((await supertest(app).get('/api/scheduled-transfers').set('Accept', 'application/json')).status, 401);
        const page = await owner.agent.get('/scheduled-transfers');
        assert.equal(page.status, 200);
        assert.match(page.text, /NO REAL PAYMENTS/i);
        const payload = { fromAccountId: accounts[0].id, toAccountId: accounts[1].id, amount: '12.34', scheduledDate: tomorrowUtc(), description: 'Future savings' };
        assert.equal((await owner.agent.post('/api/scheduled-transfers').send(payload)).status, 403);
        assert.equal((await owner.agent.post('/api/scheduled-transfers').set('X-CSRF-Token', owner.csrfToken).send({ ...payload, toAccountId: accounts[0].id })).status, 400);
        const before = db.prepare('SELECT id, balance FROM accounts WHERE user_id = (SELECT id FROM users WHERE email = ?) ORDER BY id').all('schedule-owner@example.test');
        const created = await owner.agent.post('/api/scheduled-transfers').set('X-CSRF-Token', owner.csrfToken).send(payload);
        assert.equal(created.status, 201);
        assert.equal(created.body.transfer.status, 'pending');
        const hub = await owner.agent.get('/api/hub/summary');
        assert.equal(hub.body.summary.scheduledTransfers[0].id, created.body.transfer.id);
        assert.equal(hub.body.summary.scheduledTransferCount, 1);
        const context = await require('../src/services/assistant').buildContext(db.prepare('SELECT id FROM users WHERE email = ?').get('schedule-owner@example.test').id);
        assert.match(context, /## Scheduled transfers\n- \d{4}-\d{2}-\d{2}: \$12\.34 Future savings/);
        assert.deepEqual(db.prepare('SELECT id, balance FROM accounts WHERE user_id = (SELECT id FROM users WHERE email = ?) ORDER BY id').all('schedule-owner@example.test'), before);
        assert.deepEqual((await other.agent.get('/api/scheduled-transfers')).body.transfers, []);
        assert.equal((await other.agent.delete(`/api/scheduled-transfers/${created.body.transfer.id}`).set('X-CSRF-Token', other.csrfToken)).status, 404);
        assert.equal((await owner.agent.delete(`/api/scheduled-transfers/${created.body.transfer.id}`).set('X-CSRF-Token', owner.csrfToken)).status, 200);
        assert.equal(schedules.listScheduledTransfers(db.prepare('SELECT id FROM users WHERE email = ?').get('schedule-owner@example.test').id)[0].status, 'cancelled');
    });

    it('settles due transfers atomically once and records paired ledger entries', () => {
        const userId = db.prepare('SELECT id FROM users WHERE email = ?').get('schedule-owner@example.test').id;
        db.prepare('UPDATE accounts SET balance = 5000, available_balance = 5000 WHERE id = ?').run(accounts[0].id);
        db.prepare('UPDATE accounts SET balance = 0, available_balance = 0 WHERE id = ?').run(accounts[1].id);
        const created = schedules.scheduleTransfer(userId, { fromAccountId: accounts[0].id, toAccountId: accounts[1].id, amount: '12.34', scheduledDate: tomorrowUtc() });
        const dueTime = new Date(Date.now() - 1000).toISOString();
        db.prepare('UPDATE scheduled_transfers SET scheduled_for = ? WHERE id = ?').run(dueTime, created.id);

        assert.deepEqual(schedules.processDueScheduledTransfers(new Date().toISOString()), { checked: 1, completed: 1 });
        assert.equal(db.prepare('SELECT balance FROM accounts WHERE id = ?').get(accounts[0].id).balance, 3766);
        assert.equal(db.prepare('SELECT balance FROM accounts WHERE id = ?').get(accounts[1].id).balance, 1234);
        const reference = db.prepare('SELECT transaction_reference FROM scheduled_transfers WHERE id = ?').get(created.id).transaction_reference;
        const entries = db.prepare('SELECT reference, amount, direction FROM transactions WHERE reference IN (?, ?) ORDER BY direction').all(reference, `${reference}-C`);
        assert.equal(entries.length, 2);
        assert.ok(entries.every(entry => entry.amount === 1234));
        assert.deepEqual(schedules.processDueScheduledTransfers(new Date().toISOString()), { checked: 0, completed: 0 });
        assert.equal(db.prepare("SELECT COUNT(*) AS count FROM transactions WHERE reference LIKE 'SCH-%'").get().count, 2);
    });

    it('marks an underfunded due transfer failed without changing either balance', () => {
        const userId = db.prepare('SELECT id FROM users WHERE email = ?').get('schedule-owner@example.test').id;
        db.prepare('UPDATE accounts SET balance = 0, available_balance = 0 WHERE id = ?').run(accounts[0].id);
        const before = db.prepare('SELECT id, balance FROM accounts WHERE id IN (?, ?) ORDER BY id').all(accounts[0].id, accounts[1].id);
        const created = schedules.scheduleTransfer(userId, { fromAccountId: accounts[0].id, toAccountId: accounts[1].id, amount: '5.00', scheduledDate: tomorrowUtc() });
        const dueTime = new Date(Date.now() - 1000).toISOString();
        db.prepare('UPDATE scheduled_transfers SET scheduled_for = ? WHERE id = ?').run(dueTime, created.id);
        assert.deepEqual(schedules.processDueScheduledTransfers(new Date().toISOString()), { checked: 1, completed: 0 });
        assert.deepEqual(db.prepare('SELECT id, balance FROM accounts WHERE id IN (?, ?) ORDER BY id').all(accounts[0].id, accounts[1].id), before);
        const failed = schedules.listScheduledTransfers(userId).find(item => item.id === created.id);
        assert.equal(failed.status, 'failed');
        assert.match(failed.result_message, /Insufficient available demo funds/);
    });
});