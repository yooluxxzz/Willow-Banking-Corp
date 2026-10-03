const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const supertest = require('supertest');
const { createTestApp, registerAgent, openAccount } = require('./setup');

describe('Budgets measured against real activity, with nightly checks', () => {
    let app, db, close, owner, other, budgets, portfolio, ownerId, otherId, checking, savings;
    const api = (who, method, path, body) => who.agent[method](path).set('X-CSRF-Token', who.csrfToken).set('Accept', 'application/json').send(body);
    const pad = n => String(n).padStart(2, '0');
    const localDay = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

    before(async () => {
        const env = await createTestApp(); app = env.app; db = env.getDb(); close = env.closeDatabase;
        owner = await registerAgent(supertest, app, { email: 'budget-owner@example.test', password: 'BudgetDemo123', fullName: 'Budget Owner' });
        other = await registerAgent(supertest, app, { email: 'budget-other@example.test', password: 'BudgetDemo123', fullName: 'Budget Other' });
        budgets = require('../src/services/budgets');
        portfolio = require('../src/services/demo-portfolio');
        ownerId = db.prepare('SELECT id FROM users WHERE email = ?').get('budget-owner@example.test').id;
        otherId = db.prepare('SELECT id FROM users WHERE email = ?').get('budget-other@example.test').id;
        checking = db.prepare('SELECT id FROM accounts WHERE user_id = ?').get(ownerId);
        savings = await openAccount(owner.agent, owner.csrfToken, 'savings');
        assert.equal((await api(owner, 'post', '/api/deposits', { accountId: checking.id, amount: '1000' })).status, 200);
    });
    after(() => close());

    it('validates budgets, requires CSRF and keeps them private to their owner', async () => {
        assert.equal((await supertest(app).get('/api/budgets').set('Accept', 'application/json')).status, 401);
        assert.equal((await owner.agent.post('/api/budgets').send({ name: 'Food', period: 'monthly', limit: '100' })).status, 403);
        for (const bad of [{ name: '', period: 'monthly', limit: '100' }, { name: 'Food', period: 'yearly', limit: '100' }, { name: 'Food', period: 'monthly', limit: '0.5' }, { name: 'Food', period: 'monthly', limit: '100', category: 'yachts' }, { name: '<b>x</b>', period: 'daily', limit: '10' }]) {
            assert.equal((await api(owner, 'post', '/api/budgets', bad)).status, 400, JSON.stringify(bad));
        }
        const created = await api(owner, 'post', '/api/budgets', { name: 'Groceries', category: 'groceries', period: 'monthly', limit: '200' });
        assert.equal(created.status, 201);
        assert.deepEqual([created.body.budget.spentCents, created.body.budget.limitCents, created.body.budget.status], [0, 20000, 'under']);
        assert.equal((await other.agent.get('/api/budgets')).body.budgets.length, 0);
        assert.equal((await api(other, 'put', `/api/budgets/${created.body.budget.id}`, { limit: '1' })).status, 404);
        assert.equal((await api(other, 'delete', `/api/budgets/${created.body.budget.id}`)).status, 404);
        const page = await owner.agent.get('/budgets');
        assert.equal(page.status, 200);
        assert.match(page.text, /checks every budget each night/);
    });

    it('counts withdrawals by category and money sent to others, but not moves between your own accounts or into investing', async () => {
        const all = budgets.createBudget(ownerId, { name: 'Everything', period: 'daily', limit: '500' });
        assert.equal((await api(owner, 'post', '/api/withdrawals', { accountId: checking.id, amount: '150', category: 'groceries', description: 'Weekly shop' })).status, 200);
        assert.equal((await api(owner, 'post', '/api/withdrawals', { accountId: checking.id, amount: '20', category: 'dining' })).status, 200);
        assert.equal((await api(owner, 'post', '/api/withdrawals', { accountId: checking.id, amount: '5', category: 'spaceships' })).status, 400);
        assert.equal((await api(owner, 'post', '/api/transfers', { fromAccountId: checking.id, toAccountId: savings.id, amount: '100' })).status, 200);
        portfolio.moveCash(ownerId, { accountId: checking.id, direction: 'in', amount: '50' });
        assert.equal((await api(owner, 'post', '/api/transfers', { fromAccountId: checking.id, recipientEmail: 'budget-other@example.test', amount: '30' })).status, 200);

        const groceries = budgets.listBudgets(ownerId, 'personal').find(budget => budget.name === 'Groceries');
        assert.equal(groceries.spentCents, 15000);
        assert.equal(groceries.status, 'under');
        const everything = budgets.getBudget(ownerId, all.id);
        assert.equal(everything.spentCents, 15000 + 2000 + 3000, 'groceries + dining + money sent to someone else');
        assert.equal(budgets.listBudgets(otherId, 'personal').length, 0);
    });

    it('marks budgets near and over, and the nightly check notifies once per period', () => {
        const tight = budgets.createBudget(ownerId, { name: 'Dining out', category: 'dining', period: 'weekly', limit: '22' });
        assert.equal(tight.status, 'near', '$20 of $22 is past 85%');
        const first = budgets.runBudgetChecks({ mode: 'nightly' });
        assert.ok(first.checks >= 3);
        const today = localDay(new Date());
        const check = db.prepare('SELECT * FROM budget_checks WHERE budget_id = ? AND day = ?').get(tight.id, today);
        assert.deepEqual([check.spent_cents, check.limit_cents, check.status, check.notified], [2000, 2200, 'near', 'near']);
        const notes = () => db.prepare("SELECT title FROM notifications WHERE user_id = ? AND type = 'budget' ORDER BY id").all(ownerId).map(row => row.title);
        assert.deepEqual(notes(), ['Close to your budget: Dining out']);
        budgets.runBudgetChecks({ mode: 'nightly' });
        assert.equal(notes().length, 1, 'no repeat for the same level in the same period');

        budgets.updateBudget(ownerId, tight.id, { limit: '15' });
        assert.equal(budgets.getBudget(ownerId, tight.id).status, 'over');
        budgets.runBudgetChecks({ mode: 'nightly' });
        assert.deepEqual(notes(), ['Close to your budget: Dining out', 'Over budget: Dining out']);
        const over = db.prepare("SELECT message FROM notifications WHERE user_id = ? AND title = 'Over budget: Dining out'").get(ownerId);
        assert.match(over.message, /\$20\.00 of \$15\.00 spent this week — \$5\.00 over/);
        assert.equal(db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND type = 'budget'").get(otherId).n, 0);
    });

    it('catches up on days missed while the app was stopped, notifying only for the latest day', () => {
        const now = new Date();
        const fiveDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 5);
        const daily = budgets.createBudget(ownerId, { name: 'Daily coffee', category: 'dining', period: 'daily', limit: '1' });
        db.prepare("UPDATE budgets SET created_at = ? WHERE id = ?").run(`${localDay(fiveDaysAgo)} 00:00:00`, daily.id);
        db.prepare("INSERT INTO app_meta (key, value) VALUES ('budget_checks_last_day', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
            .run(localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 4)));
        const result = budgets.runBudgetChecks({ mode: 'startup', now });
        assert.deepEqual(result.days, [3, 2, 1].map(n => localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - n))));
        const rows = db.prepare('SELECT day, status FROM budget_checks WHERE budget_id = ? ORDER BY day').all(daily.id);
        assert.equal(rows.length, 3);
        assert.ok(rows.every(row => row.status === 'under'), 'no spending on those days');
        assert.equal(db.prepare("SELECT value FROM app_meta WHERE key = 'budget_checks_last_day'").get().value, result.days[2]);
        assert.deepEqual(budgets.runBudgetChecks({ mode: 'startup', now }).days, [], 'nothing left to catch up');
        assert.ok(budgets.msUntil('23:55', new Date(2026, 0, 1, 23, 0)) === 55 * 60 * 1000);
        assert.ok(budgets.msUntil('23:55', new Date(2026, 0, 1, 23, 56)) > 23 * 3600 * 1000);
    });

    it('never skips a day: today is checked again once it has ended, and past-day alerts name the day', () => {
        const now = new Date();
        const at = (daysAgo, h, m) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, h, m);
        db.prepare("UPDATE app_meta SET value = ? WHERE key = 'budget_checks_last_day'").run(localDay(at(3, 0, 0)));
        const late = budgets.createBudget(ownerId, { name: 'Late snacks', category: 'dining', period: 'daily', limit: '5' });
        db.prepare('UPDATE budgets SET created_at = ? WHERE id = ?').run(at(3, 12, 0).toISOString().replace('T', ' ').slice(0, 19), late.id);
        // The nightly run at 23:55 two days ago checks that day so far, but doesn't count it as done…
        const nightly = budgets.runBudgetChecks({ mode: 'nightly', now: at(2, 23, 55) });
        assert.equal(nightly.days[nightly.days.length - 1], localDay(at(2, 0, 0)));
        assert.equal(db.prepare("SELECT value FROM app_meta WHERE key = 'budget_checks_last_day'").get().value, localDay(at(3, 0, 0)));
        // …so spending after 23:55 still counts: the next run records the finished day again.
        const account = db.prepare("SELECT id FROM accounts WHERE user_id = ? AND purpose = 'personal' ORDER BY id LIMIT 1").get(ownerId);
        db.prepare("INSERT INTO transactions (reference, account_id, type, amount, currency, direction, status, description, category, created_at) VALUES ('WDR-LATE-1', ?, 'withdrawal', 900, 'USD', 'debit', 'completed', 'Midnight snack', 'dining', ?)")
            .run(account.id, at(2, 23, 58).toISOString().replace('T', ' ').slice(0, 19));
        const startup = budgets.runBudgetChecks({ mode: 'startup', now: at(0, 8, 0) });
        assert.deepEqual(startup.days, [localDay(at(2, 0, 0)), localDay(at(1, 0, 0))]);
        const row = db.prepare('SELECT spent_cents, status FROM budget_checks WHERE budget_id = ? AND day = ?').get(late.id, localDay(at(2, 0, 0)));
        assert.deepEqual(row, { spent_cents: 900, status: 'over' });
        assert.match(budgets.periodLabel('daily', at(2, 0, 0), now), /^on [A-Z][a-z]+day, [A-Z][a-z]+ \d+$/, 'an alert about an earlier day names it');
        assert.equal(budgets.periodLabel('daily', at(0, 9, 0), now), 'today');
        budgets.deleteBudget(ownerId, late.id);
    });

    it('starts checking a budget on the local day it was created, in any time zone', () => {
        const { execFileSync } = require('node:child_process');
        const script = `
            process.env.DATABASE_PATH = ':memory:'; process.env.NODE_ENV = 'test';
            (async () => {
                const database = require('./src/database');
                await database.initializeDatabase();
                const db = database.getDb();
                const user = db.prepare("INSERT INTO users (email, full_name, password_hash, customer_id) VALUES ('tz@example.test', 'Time Zone', 'x', 'WB12345678')").run().lastInsertRowid;
                const account = db.prepare("INSERT INTO accounts (user_id, account_number, account_type, balance, available_balance, currency) VALUES (?, '42001234567890', 'checking', 0, 0, 'USD')").run(user).lastInsertRowid;
                // 02:00 UTC on 3 October is 7 pm on 2 October in California.
                const budget = db.prepare("INSERT INTO budgets (user_id, name, period, limit_cents, created_at) VALUES (?, 'Evening', 'daily', 1000, '2026-10-03 02:00:00')").run(user).lastInsertRowid;
                db.prepare("INSERT INTO transactions (reference, account_id, type, amount, currency, direction, status, description, category, created_at) VALUES ('WDR-TZ-1', ?, 'withdrawal', 2000, 'USD', 'debit', 'completed', 'Dinner', 'dining', '2026-10-03 03:00:00')").run(account);
                const result = require('./src/services/budgets').runBudgetChecks({ mode: 'nightly', now: new Date(2026, 9, 2, 23, 55) });
                const row = db.prepare('SELECT day, status FROM budget_checks WHERE budget_id = ?').get(budget);
                process.stdout.write(JSON.stringify({ result, row }));
            })();`;
        const out = JSON.parse(execFileSync(process.execPath, ['-e', script], { cwd: require('node:path').resolve(__dirname, '..'), env: { ...process.env, TZ: 'America/Los_Angeles' }, encoding: 'utf8' }));
        assert.deepEqual(out.row, { day: '2026-10-02', status: 'over' }, 'the budget is checked on its first evening, not skipped');
    });

    it('measures business budgets against the expenses the owner logs', async () => {
        const budget = (await api(owner, 'post', '/api/budgets', { scope: 'business', name: 'Software', category: 'software', period: 'monthly', limit: '100' })).body.budget;
        assert.equal(budget.scope, 'business');
        assert.equal((await api(owner, 'post', '/api/business/expenses', { vendor: 'Cloud tools', category: 'software', amount: '90', spentOn: localDay(new Date()) })).status, 201);
        assert.equal((await api(owner, 'post', '/api/business/expenses', { vendor: 'Print shop', category: 'supplies', amount: '40', spentOn: localDay(new Date()) })).status, 201);
        const listed = (await owner.agent.get('/api/budgets?scope=business')).body;
        assert.equal(listed.budgets.length, 1);
        assert.deepEqual([listed.budgets[0].spentCents, listed.budgets[0].status], [9000, 'near']);
        assert.ok(listed.categories.some(option => option.key === 'payroll'));
        assert.equal(budgets.listBudgets(ownerId, 'personal').some(item => item.id === budget.id), false, 'scopes stay separate');
    });
});
