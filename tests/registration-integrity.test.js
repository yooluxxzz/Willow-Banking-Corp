const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const supertest = require('supertest');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const setup = require('./setup');

describe('Registration integrity', () => {
    let app, db, store, close;
    before(async () => { const env = await setup.createTestApp(); app = env.app; db = env.getDb(); store = env.sessionStore; close = env.closeDatabase; });
    after(() => close());
    const payload = () => ({ email: randomUUID() + '@signup.test', password: 'SignupTest123', fullName: 'Signup Test', accountType: 'business' });

    it('rolls back a failed business setup so the same email can be registered', async () => {
        const input = payload(); const auth = require('../src/services/auth');
        db.prepare("CREATE TRIGGER fail_business BEFORE INSERT ON accounts WHEN NEW.purpose = 'business' BEGIN SELECT RAISE(ABORT, 'injected business failure'); END").run();
        try {
            await assert.rejects(auth.registerUser(input), /injected business failure/);
            assert.equal(db.prepare('SELECT id FROM users WHERE email = ?').get(input.email), undefined);
        } finally { db.prepare('DROP TRIGGER fail_business').run(); }
        const result = await auth.registerUser(input);
        assert.equal(result.success, true);
        assert.equal(db.prepare('SELECT COUNT(*) AS n FROM accounts WHERE user_id=?').get(result.userId).n, 2);
    });

    it('rolls back failed registration audit writes instead of leaving an occupied email', async () => {
        const input = payload();
        db.prepare("CREATE TRIGGER fail_registration_audit BEFORE INSERT ON audit_logs WHEN NEW.action = 'register' BEGIN SELECT RAISE(ABORT, 'injected audit failure'); END").run();
        try {
            await assert.rejects(require('../src/services/auth').registerUser(input), /injected audit failure/);
            assert.equal(db.prepare('SELECT id FROM users WHERE email = ?').get(input.email), undefined);
        } finally { db.prepare('DROP TRIGGER fail_registration_audit').run(); }
    });

    it('creates one user for simultaneous attempts and reports an accurate email conflict', async () => {
        const input = payload();
        const results = await Promise.all([1, 2].map(() => require('../src/services/auth').registerUser(input)));
        assert.equal(results.filter(x => x.success).length, 1);
        assert.equal(results.find(x => x.error).code, 'email_in_use');
        assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users WHERE email=?').get(input.email).n, 1);
    });

    it('reports account creation truthfully when automatic sign-in fails', async () => {
        const agent = supertest.agent(app); const csrf = setup.csrfFrom((await agent.get('/register')).text);
        const set = store.set; const input = payload();
        store.set = function (sid, session, callback) { if (session.userId) return callback(new Error('injected session failure')); return set.call(this, sid, session, callback); };
        try {
            const response = await agent.post('/auth/register').set('X-CSRF-Token', csrf).send(input);
            assert.equal(response.body.code, 'account_created');
            assert.equal(response.body.redirect, '/login');
            assert.ok(db.prepare('SELECT id FROM users WHERE email=?').get(input.email));
        } finally { store.set = set; }
    });

    it('submits the signup wizard once and offers sign-in after an account-created error', async () => {
        const page = await supertest(app).get('/register');
        const dom = new JSDOM(page.text, { url: 'http://localhost/register', runScripts: 'outside-only' });
        const { window } = dom; let rejectRequest; let requests = 0;
        window.TextEncoder = TextEncoder;
        window.scrollTo = () => {};
        window.matchMedia = () => ({ matches: true, addEventListener() {} });
        try {
            await new Promise(resolve => window.addEventListener('load', resolve, { once: true }));
            window.eval(fs.readFileSync('public/js/app.js', 'utf8'));
            window.Willow.api = () => { requests++; return new Promise((resolve, reject) => { rejectRequest = reject; }); };
            window.eval(fs.readFileSync('public/js/auth.js', 'utf8'));
            const doc = window.document; const form = doc.getElementById('registerForm');
            form.elements.fullName.value = 'Signup Test';
            form.elements.email.value = 'signup@example.test';
            form.elements.country.selectedIndex = 1;
            form.elements.password.value = 'SignupTest123';
            form.elements.confirmPassword.value = 'SignupTest123';
            form.elements.terms.checked = true;
            for (const step of ['welcome', 'personal', 'account', 'security']) doc.querySelector(`[data-step="${step}"] [data-step-next]`).click();
            const submit = () => form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
            submit(); submit();
            assert.equal(requests, 1);
            rejectRequest(Object.assign(new Error('Account created, but sign-in failed.'), { data: { code: 'account_created' } }));
            await new Promise(resolve => setTimeout(resolve, 20));
            assert.ok(doc.querySelector('[data-register-alert] a[href="/login"]'));
            assert.equal(form.querySelector('[type="submit"]').hidden, true);
            submit();
            assert.equal(requests, 1);
        } finally { window.close(); }
    });
});
