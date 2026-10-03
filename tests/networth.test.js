const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const supertest = require('supertest');
const { createTestApp, registerAgent, openAccount } = require('./setup');

describe('Net worth, debts and business expenses from the customer’s own records', () => {
    let app, db, close, owner, other, networth, ownerId, otherId, checking, originalFetch;
    const api = (who, method, path, body) => who.agent[method](path).set('X-CSRF-Token', who.csrfToken).set('Accept', 'application/json').send(body);
    const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

    before(async () => {
        originalFetch = global.fetch;
        global.fetch = async () => { throw new Error('network disabled in tests'); };
        const env = await createTestApp(); app = env.app; db = env.getDb(); close = env.closeDatabase;
        owner = await registerAgent(supertest, app, { email: 'worth-owner@example.test', password: 'WorthDemo123', fullName: 'Worth Owner' });
        other = await registerAgent(supertest, app, { email: 'worth-other@example.test', password: 'WorthDemo123', fullName: 'Worth Other' });
        networth = require('../src/services/networth');
        ownerId = db.prepare('SELECT id FROM users WHERE email = ?').get('worth-owner@example.test').id;
        otherId = db.prepare('SELECT id FROM users WHERE email = ?').get('worth-other@example.test').id;
        checking = db.prepare('SELECT id FROM accounts WHERE user_id = ?').get(ownerId);
    });
    after(() => { global.fetch = originalFetch; close(); });

    it('starts at zero and adds up accounts, logged assets and debts', async () => {
        const empty = (await owner.agent.get('/api/networth')).body;
        assert.deepEqual([empty.netCents, empty.assetsCents, empty.debtsCents, empty.composition.length], [0, 0, 0, 0]);
        assert.equal((await api(owner, 'post', '/api/deposits', { accountId: checking.id, amount: '2500' })).status, 200);
        assert.equal((await owner.agent.post('/api/networth/assets').send({ name: 'Car', kind: 'vehicle', value: '8000' })).status, 403);
        for (const bad of [{ name: 'X', kind: 'vehicle', value: '1' }, { name: 'Car', kind: 'spaceship', value: '1' }, { name: 'Car', kind: 'vehicle', value: '-5' }, { name: 'Car', kind: 'vehicle', value: '' }]) {
            assert.equal((await api(owner, 'post', '/api/networth/assets', bad)).status, 400, JSON.stringify(bad));
        }
        const car = (await api(owner, 'post', '/api/networth/assets', { name: 'Car', kind: 'vehicle', value: '8000', note: 'Estimated' })).body.asset;
        assert.equal(car.kindLabel, 'Vehicles');
        const card = (await api(owner, 'post', '/api/debts', { name: 'Visa card', kind: 'credit_card', lender: 'Big Bank', balance: '1200', rate: '24', minimum: '60', dueDay: 15 })).body.debt;
        assert.equal(card.originalCents, 120000);
        const worth = (await owner.agent.get('/api/networth')).body;
        assert.equal(worth.accountsCents, 250000);
        assert.equal(worth.assetsCents, 800000);
        assert.equal(worth.debtsCents, 120000);
        assert.equal(worth.netCents, 250000 + 800000 - 120000);
        assert.deepEqual(worth.composition.map(item => item.key).sort(), ['checking', 'vehicle']);
        assert.deepEqual(worth.liabilities.map(item => [item.key, item.cents]), [['credit_card', 120000]]);
        assert.equal(worth.debtToAssets, Math.round((120000 / 1050000) * 1000) / 10);
        const snapshot = db.prepare('SELECT * FROM net_worth_snapshots WHERE user_id = ?').get(ownerId);
        assert.equal(snapshot.net_cents, worth.netCents);
        assert.equal(worth.history.length, 1);
        // Nothing leaks across customers.
        const others = (await other.agent.get('/api/networth')).body;
        assert.deepEqual([others.netCents, others.assets.length, others.debts.length], [0, 0, 0]);
        assert.equal((await api(other, 'put', `/api/networth/assets/${car.id}`, { value: '1' })).status, 404);
        assert.equal((await api(other, 'delete', `/api/debts/${card.id}`)).status, 404);
    });

    it('estimates payoff at the minimum and flags minimums that don’t cover interest', () => {
        assert.deepEqual(networth.payoff(120000, 0, 10000), { months: 12, interestCents: 0, payable: true });
        const plan = networth.payoff(120000, 24, 6000);
        assert.equal(plan.payable, true);
        assert.ok(plan.months > 20 && plan.months < 30);
        assert.ok(plan.interestCents > 0);
        assert.equal(networth.payoff(120000, 24, 2000).payable, false, '$20 doesn’t cover 2%/month interest on $1,200');
        const debt = networth.listDebts(ownerId)[0];
        assert.equal(debt.payoffPossible, true);
        assert.equal(debt.monthlyInterestCents, 2400);
        assert.match(debt.nextDue, /^\d{4}-\d{2}-15$/);
    });

    it('records payments from a Willow account through the ledger, or made elsewhere', async () => {
        const debt = networth.listDebts(ownerId)[0];
        assert.equal((await api(owner, 'post', `/api/debts/${debt.id}/payments`, { amount: '5000' })).status, 400, 'more than is owed');
        assert.equal((await api(owner, 'post', `/api/debts/${debt.id}/payments`, { amount: '100', accountId: checking.id, paidOn: '2999-01-01' })).status, 400, 'future date');
        const paid = await api(owner, 'post', `/api/debts/${debt.id}/payments`, { amount: '200', accountId: checking.id });
        assert.equal(paid.status, 201);
        assert.equal(paid.body.debt.balanceCents, 100000);
        assert.equal(db.prepare('SELECT balance FROM accounts WHERE id = ?').get(checking.id).balance, 230000);
        const ledger = db.prepare("SELECT type, direction, amount, category FROM transactions WHERE reference = ?").get(paid.body.debt.payments[0].reference);
        assert.deepEqual(ledger, { type: 'payment', direction: 'debit', amount: 20000, category: 'debt' });
        const outside = await api(owner, 'post', `/api/debts/${debt.id}/payments`, { amount: '1000' });
        assert.equal(outside.body.debt.balanceCents, 0);
        assert.equal(outside.body.debt.status, 'paid_off');
        assert.equal(outside.body.debt.payments[0].from, 'Paid outside Willow');
        assert.equal(db.prepare('SELECT balance FROM accounts WHERE id = ?').get(checking.id).balance, 230000, 'outside payments don’t touch accounts');
        assert.equal(db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND title = 'Debt paid off'").get(ownerId).n, 1);
        assert.equal((await api(owner, 'post', `/api/debts/${debt.id}/payments`, { amount: '1' })).status, 400);
        const otherChecking = db.prepare('SELECT id FROM accounts WHERE user_id = ?').get(otherId);
        const second = (await api(owner, 'post', '/api/debts', { name: 'Student loan', kind: 'student_loan', balance: '500' })).body.debt;
        assert.equal((await api(owner, 'post', `/api/debts/${second.id}/payments`, { amount: '10', accountId: otherChecking.id })).status, 400, 'can’t pay from someone else’s account');
        const page = await owner.agent.get('/debts');
        assert.equal(page.status, 200);
        assert.match(page.text, /Record a payment/);
    });

    it('logs business expenses, optionally paid from a business account, and reflects them on the dashboard', async () => {
        const record = await api(owner, 'post', '/api/business/expenses', { vendor: 'Studio rent', category: 'rent', amount: '700', spentOn: today() });
        assert.equal(record.status, 201);
        assert.equal(record.body.expense.paidFromAccount, false);
        for (const bad of [{ vendor: 'X', category: 'rent', amount: '1', spentOn: today() }, { vendor: 'Rent', category: 'yachts', amount: '1', spentOn: today() }, { vendor: 'Rent', category: 'rent', amount: '1', spentOn: '2999-01-01' }, { vendor: 'Rent', category: 'rent', amount: 'abc', spentOn: today() }]) {
            assert.equal((await api(owner, 'post', '/api/business/expenses', bad)).status, 400, JSON.stringify(bad));
        }
        assert.equal((await api(owner, 'post', '/api/business/expenses', { vendor: 'Laptop', category: 'equipment', amount: '50', spentOn: today(), payFromAccountId: checking.id })).status, 400, 'personal accounts can’t pay business expenses');
        const business = await openAccount(owner.agent, owner.csrfToken, 'business');
        assert.equal((await api(owner, 'post', '/api/business/expenses', { vendor: 'Laptop', category: 'equipment', amount: '50', spentOn: today(), payFromAccountId: business.id })).status, 400, 'not enough money');
        assert.equal((await api(owner, 'post', '/api/deposits', { accountId: business.id, amount: '300' })).status, 200);
        const paid = await api(owner, 'post', '/api/business/expenses', { vendor: 'Laptop', category: 'equipment', amount: '250', spentOn: today(), payFromAccountId: business.id });
        assert.equal(paid.status, 201);
        assert.equal(paid.body.expense.paidFromAccount, true);
        assert.equal(db.prepare('SELECT balance FROM accounts WHERE id = ?').get(business.id).balance, 5000);
        assert.equal((await api(owner, 'put', `/api/business/expenses/${paid.body.expense.id}`, { amount: '1' })).status, 400, 'paid amounts are fixed');
        assert.equal((await api(owner, 'put', `/api/business/expenses/${paid.body.expense.id}`, { vendor: 'Laptop for design', note: 'Replacement' })).status, 200);
        assert.equal((await api(owner, 'delete', `/api/business/expenses/${paid.body.expense.id}`)).status, 400);
        assert.equal((await api(other, 'delete', `/api/business/expenses/${record.body.expense.id}`)).status, 404);

        const dashboard = require('../src/services/business').getDashboard(ownerId);
        assert.equal(dashboard.expensesCents, 70000 + 25000, 'the paid expense counts once');
        assert.equal(dashboard.revenueCents, 30000);
        assert.deepEqual(dashboard.categories.map(item => item.label), ['Rent & premises', 'Equipment']);
        const list = (await owner.agent.get('/api/business/expenses')).body.expenses;
        assert.equal(list.length, 2);
        assert.equal((await other.agent.get('/api/business/expenses')).body.expenses.length, 0);
        const page = await owner.agent.get('/business/expense-log');
        assert.equal(page.status, 200);
        assert.match(page.text, /Expense log/);
        assert.match(page.text, /data-scope="business"/);
        assert.equal((await api(owner, 'delete', `/api/business/expenses/${record.body.expense.id}`)).status, 200);
    });
});
