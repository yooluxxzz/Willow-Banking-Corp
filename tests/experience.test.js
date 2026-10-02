const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
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
    it('renders public pages, redirects legacy URLs and clearly labels business as simulated', async () => {
        for (const route of ['/', '/money/accounts', '/money/cards', '/money/savings', '/business', '/contact', '/login', '/register', '/security-info', '/privacy', '/compliance', '/about', '/demo', '/markets', '/insights', '/learn', '/help', '/help/cards']) {
            const response = await supertest(app).get(route);
            assert.equal(response.status, 200, route);
        }
        for (const [legacy, target] of [['/personal', '/money/accounts'], ['/products/checking', '/money/accounts'], ['/products/savings', '/money/savings'], ['/products/debit-cards', '/money/cards'], ['/trust', '/security-info']]) {
            const response = await supertest(app).get(legacy);
            assert.equal(response.status, 301, legacy);
            assert.equal(response.headers.location, target, legacy);
        }
        assert.match((await supertest(app).get('/business')).text, /Willow Business is a demo/);
        const home = await supertest(app).get('/');
        assert.equal((home.text.match(/data-hero-scene=/g) || []).length, 5);
        assert.match(home.text, /For everyday life\./);
        assert.match(home.text, /For what’s next\./);
        assert.match(home.text, /data-hero-toggle/);
        assert.match(home.text, /What are you working toward\?/);
        assert.match(home.text, /Where will your money take you\?/);
        assert.doesNotMatch(home.text, /lorem ipsum/i);
    });
    async function heroHarness(reduced) {
        const { JSDOM } = require('jsdom');
        const page = new JSDOM((await supertest(app).get('/')).text);
        const heroHtml = page.window.document.querySelector('[data-hero]').outerHTML;
        const goalsHtml = page.window.document.querySelector('.goal-picker').parentElement.outerHTML;
        page.window.close();
        const dom = new JSDOM('<!DOCTYPE html><body></body>', { url: 'http://localhost/', runScripts: 'outside-only' });
        dom.window.eval(fs.readFileSync(path.join(__dirname, '../public/js/home.js'), 'utf8'));
        dom.window.document.body.innerHTML = heroHtml + goalsHtml;
        let tick = null;
        const timers = { set: 0, cleared: 0 };
        const fakeWindow = {
            matchMedia: () => ({ matches: reduced }),
            setInterval: callback => { tick = callback; timers.set += 1; return timers.set; },
            clearInterval: () => { tick = null; timers.cleared += 1; },
        };
        const hero = dom.window.document.querySelector('[data-hero]');
        const controller = dom.window.WillowHome.setupHero(hero, { window: fakeWindow, interval: 1000 });
        return { dom, hero, controller, timers, tick: () => tick && tick(), hasTimer: () => tick !== null };
    }
    it('crossfades five hero scenes, pauses on interaction, and disables autoplay for reduced motion', async () => {
        const { dom, hero, controller, tick, hasTimer } = await heroHarness(false);
        const scenes = [...hero.querySelectorAll('[data-hero-scene]')];
        const captions = [...hero.querySelectorAll('[data-hero-caption]')];
        assert.equal(scenes.length, 5);
        assert.equal(controller.index, 0);
        assert.ok(scenes[0].classList.contains('is-active'));
        assert.equal(controller.playing, true);
        tick();
        assert.equal(controller.index, 1);
        assert.deepEqual(scenes.map(scene => scene.classList.contains('is-active')), [false, true, false, false, false]);
        assert.equal(captions.filter(caption => !caption.hasAttribute('aria-hidden')).length, 1);
        assert.ok(scenes[2].querySelector('img').getAttribute('src'), 'the next scene is preloaded');
        const copy = hero.querySelector('.hero-copy') || hero;
        copy.dispatchEvent(new dom.window.Event('pointerenter'));
        assert.equal(controller.playing, false);
        assert.equal(hasTimer(), false);
        copy.dispatchEvent(new dom.window.Event('pointerleave'));
        assert.equal(controller.playing, true);
        const toggle = hero.querySelector('[data-hero-toggle]');
        toggle.click();
        assert.equal(controller.playing, false);
        assert.equal(toggle.getAttribute('aria-pressed'), 'true');
        toggle.click();
        assert.equal(controller.playing, true);
        const tabs = [...hero.querySelectorAll('[data-hero-tab]')];
        if (tabs.length) {
            tabs[3].click();
            assert.equal(controller.index, 3);
            assert.equal(controller.playing, false);
            assert.equal(tabs[3].getAttribute('aria-selected'), 'true');
        }
        for (let i = 0; i < 7; i += 1) controller.next();
        assert.ok(controller.index >= 0 && controller.index < 5);

        const reduced = await heroHarness(true);
        assert.equal(reduced.controller.reduced, true);
        assert.equal(reduced.controller.playing, false);
        assert.equal(reduced.timers.set, 0);
        assert.equal(reduced.hero.querySelector('[data-hero-toggle]').disabled, true);
        assert.ok(reduced.hero.querySelectorAll('[data-hero-scene]')[0].classList.contains('is-active'));
        dom.window.close();
        reduced.dom.window.close();
    });
    it('switches the goal story when a different goal is selected', async () => {
        const { dom } = await heroHarness(true);
        const doc = dom.window.document;
        const picker = doc.querySelector('.goal-picker');
        dom.window.WillowHome.setupTabs(picker, { tabSelector: '[data-goal-option]', panelFor: tab => doc.getElementById(tab.getAttribute('aria-controls')) });
        const options = [...picker.querySelectorAll('[data-goal-option]')];
        assert.equal(options.length, 6);
        options.forEach(option => {
            option.click();
            const panel = doc.getElementById(option.getAttribute('aria-controls'));
            assert.equal(option.getAttribute('aria-selected'), 'true');
            assert.equal(panel.hidden, false);
            assert.ok(panel.textContent.trim().length > 40);
            assert.equal(options.filter(item => item.getAttribute('aria-selected') === 'true').length, 1);
            assert.equal([...doc.querySelectorAll('[data-goal-panel]')].filter(item => !item.hidden).length, 1);
        });
        const first = options[0];
        first.click();
        first.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        assert.equal(options[1].getAttribute('aria-selected'), 'true');
        dom.window.close();
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
