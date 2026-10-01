const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const supertest = require('supertest');
const { createTestApp, registerAgent } = require('./setup');
describe('Account names, details and transaction filters', () => {
    let app, db, closeDatabase, owner, other, checking, savings, foreign;
    const patch = (id, nickname, csrf = true) => {
        const request = owner.agent.patch('/api/accounts/' + id).set('Accept', 'application/json');
        if (csrf) request.set('X-CSRF-Token', owner.csrfToken);
        return request.send({ nickname });
    };
    before(async () => {
        const env = await createTestApp(); app = env.app; db = env.getDb(); closeDatabase = env.closeDatabase;
        owner = await registerAgent(supertest, app, { email: 'accounts@test.example', fullName: 'Account Owner', password: 'AccountTest123' });
        other = await registerAgent(supertest, app, { email: 'foreign@test.example', fullName: 'Other Owner', password: 'AccountTest123' });
        [checking,savings] = (await owner.agent.get('/api/accounts')).body.accounts;
        [foreign] = (await other.agent.get('/api/accounts')).body.accounts;
        for (let i = 0; i < 18; i++) db.prepare("INSERT INTO transactions (reference, account_id, type, amount, direction, status, description, created_at) VALUES (?, ?, 'deposit', 100, 'credit', 'completed', ?, '2026-09-30 12:00:00')").run('OWN-'+i, savings.id, 'Savings contribution '+i);
        db.prepare("INSERT INTO transactions (reference, account_id, type, amount, direction, description) VALUES ('PRIVATE-OTHER', ?, 'deposit', 100, 'credit', 'Other customer only')").run(foreign.id);
    });
    after(() => closeDatabase());
    it('saves a nickname without changing balances and carries it across account views', async () => {
        const response = await patch(savings.id, '  Holiday fund  ');
        assert.equal(response.status, 200); assert.equal(response.body.account.displayName, 'Holiday fund');
        assert.equal(response.body.account.balance, savings.balance);
        assert.equal(response.body.account.account_number, savings.account_number);
        for (const path of ['/accounts','/dashboard','/accounts/'+savings.id,'/transactions?accountId='+savings.id, '/transfers']) {
            const page = await owner.agent.get(path); assert.equal(page.status, 200); assert.match(page.text, /Holiday fund/);
        }
        assert.equal(db.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'account_renamed'").get().n, 1);
    });
    it('clears a nickname back to its account-type default', async () => {
        const response = await patch(savings.id, ''); assert.equal(response.status, 200); assert.equal(response.body.account.displayName, 'Savings account');
    });
    it('rejects malformed names and IDs without mutation', async () => {
        for (const name of [null, [], {}, 'x'.repeat(41), '<img src=x>', 'hidden\nline']) assert.equal((await patch(savings.id, name)).status, 400);
        for (const id of ['1x','0','-1','1.5','99999999999999999999']) assert.equal((await patch(id, 'Changed')).status, 400);
        assert.equal(db.prepare('SELECT nickname FROM accounts WHERE id = ?').get(savings.id).nickname, '');
    });
    it('enforces account ownership and CSRF for updates and detail pages', async () => {
        assert.equal((await patch(foreign.id, 'Taken')).status, 404);
        assert.equal((await patch(checking.id, 'Taken', false)).status, 403);
        assert.equal((await owner.agent.get('/accounts/'+foreign.id)).status, 404);
        assert.equal((await owner.agent.get('/transactions?accountId='+foreign.id)).status, 404);
        assert.equal((await supertest(app).get('/accounts/'+checking.id)).status, 302);
        assert.equal(db.prepare('SELECT nickname FROM accounts WHERE id = ?').get(foreign.id).nickname, '');
    });
    it('shows only selected-account activity and safely escapes existing stored text', async () => {
        const page = await owner.agent.get('/accounts/'+savings.id); assert.match(page.text, /Savings contribution/); assert.ok(!page.text.includes('PRIVATE-OTHER'));
        assert.ok(!(await owner.agent.get('/accounts/'+checking.id)).text.includes('Savings contribution'));
        db.prepare('UPDATE accounts SET nickname = ? WHERE id = ?').run('<script>alert(1)</script>', checking.id);
        const escaped = await owner.agent.get('/accounts/'+checking.id); assert.match(escaped.text, /&lt;script&gt;/); assert.ok(!escaped.text.includes('<script>alert(1)</script>'));
        await patch(checking.id, '');
    });
    it('honors the selected account link and returns stable nonoverlapping pages', async () => {
        const page = await owner.agent.get('/transactions?accountId='+savings.id);
        assert.match(page.text, new RegExp('value="'+savings.id+'" selected'));
        const first = await owner.agent.get('/api/transactions').query({ accountId: savings.id, limit: 5, page: 1 });
        const next = await owner.agent.get('/api/transactions').query({ accountId: savings.id, limit: 5, page: 2 });
        assert.equal(first.body.total, 18); assert.equal(first.body.totalPages, 4); assert.equal(first.body.transactions.length, 5);
        const ids = new Set(first.body.transactions.map(t=>t.id)); assert.ok(next.body.transactions.every(t=>!ids.has(t.id)));
        assert.ok(first.body.transactions[0].id > first.body.transactions[1].id);
    });
    it('combines search and inclusive date filters, with ascending order', async () => {
        const result = await owner.agent.get('/api/transactions').query({ accountId: savings.id, search: 'contribution 1', dateFrom: '2026-09-30', dateTo: '2026-09-30', sort: 'asc' });
        assert.equal(result.status, 200); assert.equal(result.body.total, 9);
        assert.ok(result.body.transactions[0].id < result.body.transactions[1].id);
        const empty = await owner.agent.get('/api/transactions').query({ accountId: savings.id, dateFrom: '2026-10-01' }); assert.equal(empty.body.total, 0);
    });
    it('rejects invalid filters and prevents cross-user transaction access', async () => {
        for (const query of [{accountId:'1x'}, {limit:-1}, {limit:101}, {page:0}, {page:'1.5'}, {dateFrom:'2026-02-30'}, {dateFrom:'2026-10-02',dateTo:'2026-10-01'}, {sort:'anything'}, {type:'bad'}, {status:'bad'}, {search:'x'.repeat(101)}, {accountId:[checking.id,savings.id]}]) {
            assert.equal((await owner.agent.get('/api/transactions').query(query)).status, 400, JSON.stringify(query));
        }
        assert.equal((await owner.agent.get('/api/transactions').query({ accountId:foreign.id })).status, 403);
    });
});
