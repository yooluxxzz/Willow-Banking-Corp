const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const supertest = require('supertest');
const { createTestApp, registerAgent } = require('./setup');

describe('Banking experience and transfer boundaries', () => {
    let app, db, closeDatabase, agent, csrf, accounts, otherAccount;
    before(async () => {
        const env = await createTestApp();
        app = env.app; db = env.getDb(); closeDatabase = env.closeDatabase;
        const first = await registerAgent(supertest, app, { email: 'review@test.com', password: 'Password123', fullName: 'Review Customer' });
        agent = first.agent; csrf = first.csrfToken;
        accounts = (await agent.get('/api/accounts')).body.accounts;
        db.prepare('UPDATE accounts SET balance = 100000, available_balance = 100000 WHERE id = ?').run(accounts[0].id);
        const other = await registerAgent(supertest, app, { email: 'other@test.com', password: 'Password123', fullName: 'Other Customer' });
        otherAccount = (await other.agent.get('/api/accounts')).body.accounts[0];
    });
    after(() => closeDatabase());
    const transfer = body => agent.post('/api/transfers').set('Accept', 'application/json').set('X-CSRF-Token', csrf).send(body);
    const balances = () => db.prepare('SELECT id, balance FROM accounts ORDER BY id').all();
    it('renders public pages and clearly labels business as simulated', async () => {
        for (const route of ['/', '/personal', '/business', '/contact', '/login', '/register', '/products/checking', '/products/savings', '/products/debit-cards', '/security-info', '/privacy', '/compliance', '/about']) {
            const response = await supertest(app).get(route);
            assert.equal(response.status, 200, route);
        }
        assert.match((await supertest(app).get('/business')).text, /Business checking is a single-owner demo account/);
        const home = await supertest(app).get('/');
        assert.match(home.text, /progress is self-reported and does not move money/);
        assert.match(home.text, /Sign in to save a planning goal/);
        assert.equal((home.text.match(/data-hero-photo=/g) || []).length, 5);
        assert.equal((home.text.match(/data-hero-copy=/g) || []).length, 5);
        assert.match(home.text, /data-hero-toggle/);
    });
    it('crossfades five hero scenes, pauses on interaction, and disables autoplay for reduced motion', () => {
        const createEnvironment = reducedMotion => {
            const sceneIds = ['a', 'b', 'c', 'd', 'e'];
            const windowHandlers = {};
            const heroHandlers = {};
            let intervalCallback = null;
            let intervalId = 0;
            const photos = sceneIds.map(id => ({
                complete: true,
                naturalWidth: 100,
                dataset: { heroPhoto: id },
                setAttribute(name, value) { this[name] = value; },
                addEventListener() {},
            }));
            const copies = sceneIds.map(id => ({
                dataset: { heroCopy: id, heroLabel: `Scene ${id}` },
                setAttribute(name, value) { this[name] = value; },
                inert: id !== 'a',
            }));
            const guide = { textContent: '' };
            const toggle = {
                disabled: false,
                setAttribute(name, value) { this[name] = value; },
                addEventListener(name, handler) { this.clickHandler = handler; },
            };
            const story = {
                offsetHeight: 2900,
                top: 0,
                style: { setProperty() {} },
                classList: { add() {} },
                getBoundingClientRect() { return { top: this.top }; },
            };
            const hero = {
                dataset: { activeImage: 'a' },
                offsetHeight: 1000,
                style: { setProperty() {} },
                closest(selector) { return selector === '[data-hero-story]' ? story : null; },
                querySelectorAll(selector) { return selector === '[data-hero-photo]' ? photos : copies; },
                querySelector(selector) { return selector === '[data-hero-guide]' ? guide : toggle; },
                addEventListener(name, handler) { heroHandlers[name] = handler; },
            };
            const window = {
                matchMedia: () => ({ matches: reducedMotion }),
                requestAnimationFrame(callback) { callback(); return 1; },
                getComputedStyle: () => ({ getPropertyValue: () => '' }),
                addEventListener(name, handler) { windowHandlers[name] = handler; },
                setInterval(callback) { intervalCallback = callback; intervalId += 1; return intervalId; },
                clearInterval() { intervalCallback = null; },
            };
            const document = {
                addEventListener() {},
                querySelector(selector) { return selector === '[data-hero-crossfade]' ? hero : null; },
            };
            const context = { document, window };
            context.window = window;
            vm.createContext(context);
            vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8'), context);
            context.setupHeroCrossfade();
            return { context, hero, story, toggle, guide, photos, copies, heroHandlers, windowHandlers, get intervalCallback() { return intervalCallback; } };
        };

        const environment = createEnvironment(false);
        assert.equal(environment.intervalCallback !== null, true);
        environment.intervalCallback();
        assert.equal(environment.hero.dataset.activeImage, 'b');
        assert.match(environment.guide.textContent, /02 \/ 05/);
        environment.heroHandlers.pointerdown({ target: environment.hero });
        assert.equal(environment.intervalCallback, null);
        const travel = environment.story.offsetHeight - environment.hero.offsetHeight;
        environment.story.top = -travel;
        environment.windowHandlers.scroll();
        assert.equal(environment.hero.dataset.activeImage, 'e');
        assert.equal(environment.copies.find(copy => copy.dataset.heroCopy === 'e').inert, false);
        environment.toggle.clickHandler();
        assert.equal(environment.intervalCallback !== null, true);
        environment.toggle.clickHandler();
        assert.equal(environment.intervalCallback, null);

        const reduced = createEnvironment(true);
        assert.equal(reduced.intervalCallback, null);
        assert.equal(reduced.toggle.disabled, true);
        assert.match(reduced.toggle.textContent, /Motion reduced/);
    });
    it('updates the goal story content when a different personal finance goal is selected', () => {
        const fields = {
            goalTag: { textContent: '' },
            goalStoryTitle: { textContent: '' },
            goalStoryDescription: { textContent: '' },
            goalStoryList: { innerHTML: '' },
            goalStat1Label: { textContent: '' },
            goalStat1Value: { textContent: '' },
            goalStat1Note: { textContent: '' },
            goalStat2Label: { textContent: '' },
            goalStat2Value: { textContent: '' },
            goalStat2Note: { textContent: '' },
            goalStat3Label: { textContent: '' },
            goalStat3Value: { textContent: '' },
            goalStat3Note: { textContent: '' },
            goalStat4Label: { textContent: '' },
            goalStat4Value: { textContent: '' },
            goalStat4Note: { textContent: '' },
        };
        const goals = ['savings', 'invest', 'home', 'business', 'money', 'travel'];
        const pills = goals.map(goal => {
            const pill = {
                dataset: { goal },
                isActive: false,
                classList: { toggle: (_, active) => { pill.isActive = active; } },
                addEventListener: (_, handler) => { pill.clickHandler = handler; },
            };
            return pill;
        });
        const context = {
            document: {
                addEventListener: () => {},
                querySelectorAll: (selector) => selector === '.goal-pill' ? pills : [],
                getElementById: (id) => fields[id] || null,
            },
        };
        context.window = context;
        vm.createContext(context);
        vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8'), context);
        context.setupGoalSelection();
        const expectedTitles = {
            savings: 'Build a stronger cushion.',
            invest: 'Plan for compounding growth.',
            home: 'Make the next move feel manageable.',
            business: 'Keep momentum moving behind the work.',
            money: 'Give your routine a clearer rhythm.',
            travel: 'Build a plan for the next adventure.',
        };
        pills.forEach(pill => {
            pill.clickHandler();
            assert.equal(fields.goalStoryTitle.textContent, expectedTitles[pill.dataset.goal]);
            assert.equal(pills.filter(button => button.isActive).length, 1);
            assert.equal(pill.isActive, true);
            assert.ok(fields.goalTag.textContent);
            assert.ok(fields.goalStoryDescription.textContent);
            assert.ok(fields.goalStoryList.innerHTML);
            assert.ok(fields.goalStat1Value.textContent);
            assert.ok(fields.goalStat4Value.textContent);
        });
    });
    it('creates checking and savings destinations for new demo customers', () => {
        assert.deepEqual(accounts.map(a => a.account_type).sort(), ['checking', 'savings']);
    });
    it('atomically moves funds between owned accounts with matching ledger entries', async () => {
        const result = await transfer({ fromAccountId: accounts[0].id, toAccountId: accounts[1].id, amount: '12.34' });
        assert.equal(result.status, 200);
        assert.equal(result.body.simulated, true);
        assert.equal(db.prepare('SELECT balance FROM accounts WHERE id = ?').get(accounts[0].id).balance, 98766);
        assert.equal(db.prepare('SELECT balance FROM accounts WHERE id = ?').get(accounts[1].id).balance, 1234);
        const entries = db.prepare('SELECT amount, direction FROM transactions WHERE reference IN (?, ?)').all(result.body.reference, result.body.reference + '-C');
        assert.equal(entries.length, 2);
        assert.ok(entries.every(t => t.amount === 1234));
    });
    it('rejects another customer account ID without changing any balances', async () => {
        const before = balances();
        const result = await transfer({ fromAccountId: accounts[0].id, toAccountId: otherAccount.id, amount: '1.00' });
        assert.equal(result.status, 400);
        assert.deepEqual(balances(), before);
    });
    it('rejects an unowned source and a same-account destination', async () => {
        const before = balances();
        for (const body of [
            { fromAccountId: otherAccount.id, toAccountId: accounts[1].id, amount: '1.00' },
            { fromAccountId: accounts[0].id, toAccountId: accounts[0].id, amount: '1.00' },
        ]) assert.equal((await transfer(body)).status, 400);
        assert.deepEqual(balances(), before);
    });
    it('rejects malformed amounts, descriptions and conflicting destinations', async () => {
        const before = balances();
        for (const changes of [{ amount: '1.001' }, { amount: '-1' }, { amount: true }, { amount: [1] }, { amount: '1e-3' }, { description: {} }, { description: 'x'.repeat(201) }, { recipientEmail: {} , toAccountId: undefined }, { recipientEmail: 'other@test.com' }]) {
            assert.equal((await transfer({ fromAccountId: accounts[0].id, toAccountId: accounts[1].id, amount: '1.00', ...changes })).status, 400);
        }
        assert.deepEqual(balances(), before);
    });
    it('enforces CSRF and authentication for new own-account transfers', async () => {
        assert.equal((await agent.post('/api/transfers').set('Accept', 'application/json').send({ fromAccountId: accounts[0].id, toAccountId: accounts[1].id, amount: '1.00' })).status, 403);
        assert.equal((await supertest(app).get('/dashboard')).status, 302);
    });
    it('protects transaction search against access to another customer ledger', async () => {
        const response = await agent.get('/api/transactions?accountId=' + otherAccount.id + '&search=transfer');
        assert.equal(response.status, 403);
    });
});
