const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const supertest = require('supertest');
const { createTestApp, registerAgent, loginAgent } = require('./setup');
const { safeReturnTo } = require('../src/services/sign-in');

describe('Sign-in navigation and reliable sign-out', () => {
    let app, db, store, close;
    const email = 'return@example.test', password = 'ReturnDemo123';
    before(async () => {
        const env = await createTestApp(); app = env.app; db = env.getDb(); store = env.sessionStore; close = env.closeDatabase;
        await registerAgent(supertest, app, { email, password, fullName: 'Return Customer' });
    });
    after(() => close());
    it('preserves an account activity destination through the sign-in form and a failed attempt', async () => {
        const agent = supertest.agent(app);
        const destination = '/transactions?accountId=1&type=deposit&page=2';
        const initial = await agent.get(destination);
        assert.equal(initial.status, 302);
        const url = new URL(initial.headers.location, 'http://localhost');
        assert.equal(url.searchParams.get('returnTo'), destination);
        const page = await agent.get(initial.headers.location);
        assert.equal(page.status, 200); assert.match(page.headers['cache-control'], /no-store/);
        assert.match(page.text, /name="returnTo" value="\/transactions\?accountId=1&amp;type=deposit&amp;page=2"/);
        const csrf = page.text.match(/name="_csrf"\s+value="([^"]+)"/)[1];
        const attempt = value => agent.post('/auth/login').set('X-CSRF-Token', csrf).set('Accept', 'application/json').send({ email, password: value, returnTo: destination });
        assert.equal((await attempt('Wrong123')).status, 401);
        const success = await attempt(password); assert.equal(success.status, 200); assert.equal(success.body.redirect, destination);
    });
    it('rejects off-site, executable, malformed and non-page return destinations', () => {
        for (const input of ['https://evil.test', '//evil.test', '/\\evil.test', '/settings\n', 'javascript:alert(1)', '/%2f%2fevil.test', '/api/accounts', '/auth/logout', '/login', '/register', '/other/../settings', ['/settings'], {}, '/settings'+'x'.repeat(2048)]) assert.equal(safeReturnTo(input), '', String(input));
        assert.equal(safeReturnTo('/settings#sessionsTitle'), '/settings#sessionsTitle');
        assert.equal(safeReturnTo('/admin', 'customer'), '');
        assert.equal(safeReturnTo('/admin', 'admin'), '/admin');
    });
    it('applies server validation even when clients bypass the form', async () => {
        const anonymous = supertest.agent(app);
        const page = await anonymous.get('/login?returnTo=https%3A%2F%2Fevil.test');
        assert.match(page.text, /name="returnTo" value=""/);
        const token = page.text.match(/name="_csrf"\s+value="([^"]+)"/)[1];
        const result = await anonymous.post('/auth/login').set('X-CSRF-Token', token).send({ email, password, returnTo: '/admin' });
        assert.equal(result.status, 200); assert.equal(result.body.redirect, '/dashboard');
        assert.equal((await anonymous.get('/login?returnTo=%2Fsettings')).headers.location, '/settings');
        assert.equal((await anonymous.get('/login?returnTo=%2F%2Fevil.test')).headers.location, '/dashboard');
    });
    it('keeps an expired session destination and returns JSON for anonymous APIs without Accept headers', async () => {
        const auth = await loginAgent(supertest, app, email, password);
        db.prepare('UPDATE users SET auth_version = auth_version + 1 WHERE email = ?').run(email);
        const response = await auth.agent.get('/accounts/1');
        assert.equal(response.status, 302);
        const url = new URL(response.headers.location, 'http://localhost');
        assert.equal(url.searchParams.get('error'), 'session_expired');
        assert.equal(url.searchParams.get('returnTo'), '/accounts/1');
        const api = await supertest(app).get('/api/accounts');
        assert.equal(api.status, 401); assert.match(api.headers['content-type'], /json/);
    });
    it('reports store failure without claiming sign-out, then supports retry and invalidates the cookie', async () => {
        const auth = await loginAgent(supertest, app, email, password);
        const original = store.destroy;
        store.destroy = (sid, callback) => callback(new Error('Simulated store failure'));
        try {
            const failed = await auth.agent.post('/auth/logout').set('X-CSRF-Token', auth.csrfToken).set('Accept','application/json');
            assert.equal(failed.status, 500); assert.ok(!failed.body.success);
        } finally { store.destroy = original; }
        assert.equal((await auth.agent.get('/api/accounts')).status, 200);
        const success = await auth.agent.post('/auth/logout').set('X-CSRF-Token', auth.csrfToken).set('Accept','application/json');
        assert.equal(success.status, 200); assert.equal(success.body.redirect, '/login?signedOut=success');
        // The app under test names its cookie willow.sid.test; sign-out must clear that one, not a hard-coded name.
        assert.ok(success.headers['set-cookie'].some(cookie => cookie.startsWith('willow.sid.test=;')));
        assert.equal((await auth.agent.get('/api/accounts')).status, 401);
    });
});
