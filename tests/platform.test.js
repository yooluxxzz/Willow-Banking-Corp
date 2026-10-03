const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const supertest = require('supertest');
const { createTestApp, registerAgent, loginAgent, csrfFrom } = require('./setup');

/** Internal links on a page, without fragments, excluding API/auth endpoints and downloads. */
function internalLinks(html) {
    const links = new Set();
    for (const match of html.matchAll(/href="([^"]+)"/g)) {
        const href = match[1].replace(/&amp;/g, '&');
        if (!href.startsWith('/') || href.startsWith('//')) continue;
        const path = href.split('#')[0];
        if (!path || /^\/(api|auth)\//.test(path) || /\.(css|js|svg|png|webp|woff2)(\?|$)/.test(path)) continue;
        links.add(path);
    }
    return links;
}

describe('Platform: navigation, sessions and new flows', () => {
    let app, db, store, close, owner, originalFetch;
    const email = 'platform@example.test';
    const password = 'Platform123';

    before(async () => {
        // Keep the suite hermetic: market data is "unavailable" rather than reaching the network.
        originalFetch = global.fetch;
        global.fetch = async () => { throw new Error('network disabled in tests'); };
        const env = await createTestApp();
        app = env.app; db = env.getDb(); store = env.sessionStore; close = env.closeDatabase;
        owner = await registerAgent(supertest, app, { email, password, fullName: 'Platform Person', country: 'Portugal', accountType: 'business' });
        await registerAgent(supertest, app, { email: 'maria@example.test', password, fullName: 'Maria Silva' });
    });
    after(() => { global.fetch = originalFetch; close(); });

    it('registers with only the requested accounts — empty, with no invented data', async () => {
        assert.equal(owner.regRes.status, 200);
        assert.match(owner.regRes.body.customerId, /^WB\d{8}$/);
        const { accounts } = (await owner.agent.get('/api/accounts')).body;
        assert.deepEqual(accounts.map(account => [account.purpose, account.account_type, account.currency, account.balance]).sort(), [['business', 'checking', 'USD', 0], ['personal', 'checking', 'USD', 0]]);
        const userId = db.prepare('SELECT id FROM users WHERE email = ?').get(email).id;
        for (const [table, where] of [['transactions', 'account_id IN (SELECT id FROM accounts WHERE user_id = ?)'], ['cards', 'account_id IN (SELECT id FROM accounts WHERE user_id = ?)'], ['notifications', 'user_id = ?'], ['payees', 'user_id = ?'], ['demo_goals', 'user_id = ?'], ['business_invoices', 'user_id = ?'], ['demo_holdings', 'user_id = ?']]) {
            assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).get(userId).n, 0, `${table} starts empty`);
        }
        assert.equal(require('../src/services/demo-portfolio').getPortfolio(userId).cashCents, 0);
        assert.equal(db.prepare("SELECT COUNT(*) AS n FROM users WHERE email LIKE '%@community.willow.test'").get().n, 0, 'no fictional customers');
        const bad = await registerAgent(supertest, app, { email: 'phone@example.test', password, fullName: 'Phone Test', phone: '12' });
        assert.equal(bad.regRes.status, 400);
        assert.match(bad.regRes.body.error, /phone/i);
    });

    it('renders every public and signed-in page without broken internal links', async () => {
        const anonymous = supertest.agent(app);
        const { products } = require('../src/content/products');
        const articles = require('../src/content/articles');
        const { categories } = require('../src/content/help');
        const publicPages = ['/', '/markets', '/insights', '/learn', '/help', '/login', '/register', '/forgot-password', '/about', '/careers', '/press', '/contact', '/privacy', '/terms', '/compliance', '/security-info', '/demo',
            ...products.map(product => product.path), ...articles.map(article => `/${article.kind === 'guide' ? 'learn' : 'insights'}/${article.slug}`), ...categories.map(category => `/help/${category.slug}`)];
        const accountId = (await owner.agent.get('/api/accounts')).body.accounts[0].id;
        const appPages = ['/dashboard', '/net-worth', '/accounts', '/accounts/new', `/accounts/${accountId}`, '/transactions', '/statements', '/deposits', '/withdrawals', '/cards', '/transfers', '/transfers?mode=own', '/payees', '/scheduled-transfers', '/international',
            '/wealth', '/wealth/markets', '/wealth/stocks/AAPL', '/crypto', '/crypto/BTC', '/goals', '/budgets', '/debts', '/loans', '/business/dashboard', '/business/expense-log', '/business/invoices', '/business/team', '/notifications', '/security', '/settings', '/help'];
        const checked = new Map();
        const check = async (agent, path, from) => {
            const key = `${agent === anonymous ? 'anon' : 'user'}:${path}`;
            if (checked.has(key)) return checked.get(key);
            const response = await agent.get(path);
            checked.set(key, response);
            assert.ok(response.status < 400, `${path} returned ${response.status}${from ? ` (linked from ${from})` : ''}`);
            const text = response.text || '';
            assert.doesNotMatch(text, /lorem ipsum/i, `${path} has placeholder copy`);
            assert.doesNotMatch(text, />\s*(undefined|null|NaN)\s*</, `${path} renders an empty value`);
            assert.doesNotMatch(text, /\[object Object\]|\bTODO\b|\$NaN/, `${path} has broken output`);
            return response;
        };
        for (const [agent, pages] of [[anonymous, publicPages], [owner.agent, appPages]]) {
            for (const page of pages) {
                const response = await check(agent, page);
                if (response.status !== 200) continue;
                for (const link of internalLinks(response.text)) {
                    if (link === '/logout') continue;
                    await check(agent, link, page);
                }
            }
        }
        // Links generated in code: assistant answers, help articles and product content.
        const fs = require('node:fs');
        const path = require('node:path');
        const sources = ['src/services/hub.js', 'src/content/help.js', 'src/content/products.js', 'src/content/navigation.js', 'src/content/articles.js'].map(file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')).join('\n');
        const codeLinks = new Set([...sources.matchAll(/['`](\/(?:[a-z0-9-]+)(?:\/[a-z0-9-]+)*(?:\?[a-z]+=[a-z0-9]+)?)['`]/g)].map(match => match[1]).filter(link => !/^\/(api|auth|images|css|js|fonts)\b/.test(link)));
        for (const link of codeLinks) await check(owner.agent, link, 'source code');
        assert.ok(checked.size > 80, `crawled ${checked.size} pages`);
    });

    it('shows clear sign-in notices for timeouts, sign-out and resets', async () => {
        const page = await supertest(app).get('/login?error=session_timeout');
        assert.match(page.text, /You were signed out to keep your account safe/);
        assert.match(page.text, /no activity for 30 minutes/);
        assert.match((await supertest(app).get('/login?signedOut=success')).text, /You’ve signed out/);
        assert.match((await supertest(app).get('/login?reset=success')).text, /Password reset\./);
        assert.doesNotMatch((await supertest(app).get('/login?error=<script>')).text, /<script>alert/);
    });

    it('ends idle sessions with a timeout redirect and a JSON code, and keeps active ones alive', async () => {
        const session = await loginAgent(supertest, app, email, password);
        assert.equal(session.loginRes.status, 200);
        assert.equal((await session.agent.get('/auth/session').set('Accept', 'application/json')).body.active, true);
        const sessions = await new Promise((resolve, reject) => store.all((error, rows) => (error ? reject(error) : resolve(rows))));
        const userId = db.prepare('SELECT id FROM users WHERE email = ?').get(email).id;
        const entries = Object.entries(sessions).filter(([, row]) => row.userId === userId);
        for (const [sid, row] of entries) {
            await new Promise((resolve, reject) => store.set(sid, { ...row, lastSeenAt: Date.now() - 31 * 60 * 1000 }, error => (error ? reject(error) : resolve())));
        }
        const pageResponse = await session.agent.get('/accounts');
        assert.equal(pageResponse.status, 302);
        assert.match(pageResponse.headers.location, /^\/login\?error=session_timeout&returnTo=%2Faccounts$/);
        const relogin = await loginAgent(supertest, app, email, password);
        const fresh = await new Promise((resolve, reject) => store.all((error, rows) => (error ? reject(error) : resolve(rows))));
        for (const [sid, row] of Object.entries(fresh).filter(([, item]) => item.userId === userId)) {
            await new Promise((resolve, reject) => store.set(sid, { ...row, lastSeenAt: Date.now() - 31 * 60 * 1000 }, error => (error ? reject(error) : resolve())));
        }
        const api = await relogin.agent.get('/api/accounts').set('Accept', 'application/json');
        assert.equal(api.status, 401);
        assert.equal(api.body.code, 'session_timeout');
        owner = await loginAgent(supertest, app, email, password);
        assert.equal((await owner.agent.get('/dashboard')).status, 200);
    });

    it('confirms payee names before paying and never reveals the caller', async () => {
        const lookup = await owner.agent.get('/api/payees/lookup?email=maria@example.test').set('Accept', 'application/json');
        assert.equal(lookup.status, 200);
        assert.deepEqual({ found: lookup.body.found, name: lookup.body.name }, { found: true, name: 'Maria S.' });
        assert.equal((await owner.agent.get(`/api/payees/lookup?email=${encodeURIComponent(email)}`)).body.self, true);
        assert.equal((await owner.agent.get('/api/payees/lookup?email=nobody@example.test')).body.found, false);
        assert.equal((await owner.agent.get('/api/payees/lookup?email=bad')).status, 400);
        assert.equal((await supertest(app).get('/api/payees/lookup?email=maria@example.test').set('Accept', 'application/json')).status, 401);
    });

    it('lets a guest profile keep its data by adding its own sign-in details', async () => {
        const agent = supertest.agent(app);
        const csrf = csrfFrom((await agent.get('/login')).text);
        const started = await agent.post('/auth/demo').set('X-CSRF-Token', csrf).set('Accept', 'application/json').send({});
        assert.equal(started.status, 200);
        assert.match(started.body.redirect, /^\/dashboard/);
        const settings = await agent.get('/settings');
        assert.match(settings.text, /Keep this profile/);
        const token = csrfFrom(settings.text);
        const claim = body => agent.post('/auth/claim-guest').set('X-CSRF-Token', token).set('Accept', 'application/json').send(body);
        assert.equal((await claim({ email, newPassword: 'Guest12345' })).status, 400);
        assert.equal((await claim({ email: 'kept@example.test', newPassword: 'weak' })).status, 400);
        assert.equal((await claim({ email: 'x@demo.willow.test', newPassword: 'Guest12345' })).status, 400);
        assert.equal((await claim({ email: 'x@guest.willow.test', newPassword: 'Guest12345' })).status, 400);
        const kept = await claim({ email: 'kept@example.test', newPassword: 'Guest12345' });
        assert.equal(kept.status, 200);
        assert.equal((await claim({ email: 'again@example.test', newPassword: 'Guest12345' })).status, 400);
        assert.doesNotMatch((await agent.get('/settings')).text, /Keep this profile/);
        const signedIn = await loginAgent(supertest, app, 'kept@example.test', 'Guest12345');
        assert.equal(signedIn.loginRes.status, 200);
        const keptAccounts = (await signedIn.agent.get('/api/accounts')).body.accounts;
        assert.deepEqual(keptAccounts.map(account => [account.account_type, account.balance]), [['checking', 0]], 'guests start empty like any new profile');
    });

    it('removes guest profiles unused for a week without touching anyone else', async () => {
        const start = async () => {
            const agent = supertest.agent(app);
            const csrf = csrfFrom((await agent.get('/login')).text);
            assert.equal((await agent.post('/auth/demo').set('X-CSRF-Token', csrf).set('Accept', 'application/json').send({})).status, 200);
            return { agent, csrf: csrfFrom((await agent.get('/settings')).text), id: db.prepare("SELECT id FROM users WHERE is_guest = 1 ORDER BY id DESC LIMIT 1").get().id };
        };
        const stale = await start();
        const fresh = await start();
        const staleAccounts = db.prepare('SELECT id FROM accounts WHERE user_id = ?').all(stale.id).map(row => row.id);
        // The guest adds money and pays a real customer, so other people's records reference it.
        assert.equal((await stale.agent.post('/api/deposits').set('X-CSRF-Token', stale.csrf).send({ accountId: staleAccounts[0], amount: '40' })).status, 200);
        assert.equal((await stale.agent.post('/api/transfers').set('X-CSRF-Token', stale.csrf).send({ fromAccountId: staleAccounts[0], recipientEmail: 'maria@example.test', amount: '15' })).status, 200);
        const linked = db.prepare(`SELECT COUNT(*) AS n FROM transactions WHERE related_account_id IN (${staleAccounts.join(',')}) AND account_id NOT IN (${staleAccounts.join(',')})`).get().n;
        assert.ok(linked > 0, 'the guest paid another customer');
        const mariaId = db.prepare('SELECT id FROM users WHERE email = ?').get('maria@example.test').id;
        const communityBefore = db.prepare('SELECT SUM(balance) AS total FROM accounts WHERE user_id = ?').get(mariaId).total;
        assert.equal(communityBefore, 1500);
        const otherRowsBefore = db.prepare('SELECT COUNT(*) AS n FROM transactions WHERE account_id NOT IN (SELECT id FROM accounts WHERE user_id = ?)').get(stale.id).n;
        db.prepare("UPDATE users SET created_at = datetime('now', '-10 days') WHERE id = ?").run(stale.id);
        db.prepare("UPDATE audit_logs SET created_at = datetime('now', '-9 days') WHERE actor_id = ?").run(stale.id);
        const { purgeStaleGuests } = require('../src/services/guests');
        assert.equal(purgeStaleGuests({ days: 7 }).purged, 1);
        assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users WHERE id = ?').get(stale.id).n, 0);
        assert.equal(db.prepare('SELECT COUNT(*) AS n FROM accounts WHERE user_id = ?').get(stale.id).n, 0);
        assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM transactions WHERE account_id IN (${staleAccounts.join(',')}) OR related_account_id IN (${staleAccounts.join(',')})`).get().n, 0);
        assert.equal(db.prepare('SELECT COUNT(*) AS n FROM transactions WHERE account_id NOT IN (SELECT id FROM accounts WHERE user_id = ?)').get(stale.id).n, otherRowsBefore);
        assert.equal(db.prepare('SELECT SUM(balance) AS total FROM accounts WHERE user_id = ?').get(mariaId).total, communityBefore);
        assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users WHERE id = ?').get(fresh.id).n, 1);
        assert.ok(db.prepare("SELECT COUNT(*) AS n FROM users WHERE email = 'kept@example.test' AND is_guest = 0").get().n === 1);
        assert.equal((await stale.agent.get('/dashboard')).status, 302);
        assert.equal(purgeStaleGuests({ days: 7 }).purged, 0);
    });

    it('sends signed-in visitors on product pages straight to the feature', async () => {
        const cards = await owner.agent.get('/money/cards');
        assert.match(cards.text, /href="\/cards" class="btn btn-primary btn-lg">Go to Cards/);
        assert.match(cards.text, /href="\/accounts\/new" class="btn btn-secondary btn-lg">Open another account/);
        assert.match((await owner.agent.get('/business')).text, /Open business checking/);
        assert.match((await supertest(app).get('/money/cards')).text, /Sign in to Cards/);
    });

    it('sends anonymous visitors from /loans to the public loans page', async () => {
        const response = await supertest(app).get('/loans');
        assert.equal(response.status, 302);
        assert.equal(response.headers.location, '/borrow/personal-loans');
    });
});
