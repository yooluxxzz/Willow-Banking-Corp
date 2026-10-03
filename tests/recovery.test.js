const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const supertest = require('supertest');
const { createTestApp, registerAgent, loginAgent } = require('./setup');
const post = (auth, path, body) => auth.agent.post(path).set('Accept', 'application/json').set('X-CSRF-Token', auth.csrfToken).send(body);
async function anonymous(app) {
    const agent = supertest.agent(app);
    const page = await agent.get('/forgot-password');
    return { agent, csrfToken: page.text.match(/name="_csrf"\s+value="([^"]+)"/)[1] };
}
describe('Recovery and account settings', () => {
    let app, db, closeDatabase, owner, second, other, codes, originalCodes;
    const email = 'recovery@example.test';
    before(async () => {
        const env = await createTestApp(); app = env.app; db = env.getDb(); closeDatabase = env.closeDatabase;
        owner = await registerAgent(supertest, app, { email, password: 'Original123', fullName: 'Recovery Test' });
        second = await loginAgent(supertest, app, email, 'Original123');
        other = await registerAgent(supertest, app, { email: 'other@example.test', password: 'Original123', fullName: 'Other Test' });
    });
    after(() => closeDatabase());
    it('rotates the anonymous session at registration and rejects its old cookie', async () => {
        const agent = supertest.agent(app);
        const page = await agent.get('/register');
        const oldCookie = page.headers['set-cookie'][0].split(';')[0];
        const csrf = page.text.match(/name="_csrf"\s+value="([^"]+)"/)[1];
        const result = await agent.post('/auth/register').set('X-CSRF-Token', csrf).send({ email: 'new-session@example.test', password: 'SessionTest123', fullName: 'Session Test' });
        assert.equal(result.status, 200);
        assert.notEqual(result.headers['set-cookie'][0].split(';')[0], oldCookie);
        assert.equal((await supertest(app).get('/api/accounts').set('Cookie', oldCookie).set('Accept', 'application/json')).status, 401);
        assert.equal((await agent.get('/api/accounts').set('Accept', 'application/json')).status, 200);
    });
    it('requires authentication, CSRF and the current password for generating codes', async () => {
        assert.equal((await post(await anonymous(app), '/auth/recovery-codes', { currentPassword: 'Original123' })).status, 401);
        assert.equal((await owner.agent.post('/auth/recovery-codes').set('Accept', 'application/json').send({ currentPassword: 'Original123' })).status, 403);
        assert.equal((await post(owner, '/auth/recovery-codes', { currentPassword: 'Wrong123' })).status, 400);
    });
    it('issues eight distinct codes once, stores hashes and excludes secrets from audit', async () => {
        const res = await post(owner, '/auth/recovery-codes', { currentPassword: 'Original123' });
        assert.equal(res.status, 200); assert.equal(res.headers['cache-control'], 'no-store');
        codes = res.body.codes; originalCodes = codes;
        assert.equal(new Set(codes).size, 8);
        const stored = db.prepare('SELECT code_hash FROM recovery_codes').all();
        assert.equal(stored.length, 8); stored.forEach(r => assert.match(r.code_hash, /^[a-f0-9]{64}$/));
        const audit = JSON.stringify(db.prepare('SELECT * FROM audit_logs').all());
        for (const c of codes) { assert.ok(!audit.includes(c)); assert.ok(!stored.some(r => r.code_hash === c.replaceAll('-', ''))); }
        const page = await owner.agent.get('/settings'); assert.match(page.text, /id="recoveryCount">8/); assert.ok(!page.text.includes(codes[0]));
    });
    it('rotates the full code set and old codes no longer work', async () => {
        const generated = await post(owner, '/auth/recovery-codes', { currentPassword: 'Original123' });
        assert.equal(generated.status, 200); codes = generated.body.codes;
        const res = await post(await anonymous(app), '/auth/reset-password', { email, recoveryCode: originalCodes[0], newPassword: 'Updated123' });
        assert.equal(res.status, 400);
        assert.equal(db.prepare('SELECT COUNT(*) AS n FROM recovery_codes').get().n, 8);
    });
    it('does not expose account existence and rejects another user’s code', async () => {
        const auth = await anonymous(app);
        const bad = await post(auth, '/auth/reset-password', { email, recoveryCode: '0000-0000-0000-0000-0000-0000-0000-0000', newPassword: 'Updated123' });
        const missing = await post(auth, '/auth/reset-password', { email: 'missing@example.test', recoveryCode: codes[0], newPassword: 'Updated123' });
        const cross = await post(auth, '/auth/reset-password', { email: 'other@example.test', recoveryCode: codes[0], newPassword: 'Updated123' });
        assert.equal(bad.status, 400); assert.deepEqual(bad.body, missing.body); assert.deepEqual(bad.body, cross.body);
    });
    it('rejects weak passwords and CSRF without consuming a code', async () => {
        const auth = await anonymous(app);
        assert.equal((await post(auth, '/auth/reset-password', { email, recoveryCode: codes[0], newPassword: 'weak' })).status, 400);
        assert.equal((await auth.agent.post('/auth/reset-password').set('Accept', 'application/json').send({ email, recoveryCode: codes[0], newPassword: 'Updated123' })).status, 403);
        assert.equal(db.prepare('SELECT COUNT(*) AS n FROM recovery_codes').get().n, 8);
    });
    it('resets once, revokes every old session and accepts only the new password', async () => {
        const auth = await anonymous(app);
        const res = await post(auth, '/auth/reset-password', { email: email.toUpperCase(), recoveryCode: codes[0].toLowerCase(), newPassword: 'Updated123' });
        assert.equal(res.status, 200);
        for (const session of [owner, second]) assert.equal((await session.agent.get('/api/accounts').set('Accept', 'application/json')).status, 401);
        assert.equal((await other.agent.get('/api/accounts').set('Accept', 'application/json')).status, 200);
        assert.equal((await loginAgent(supertest, app, email, 'Original123')).loginRes.status, 401);
        owner = await loginAgent(supertest, app, email, 'Updated123'); assert.equal(owner.loginRes.status, 200);
        assert.equal((await post(await anonymous(app), '/auth/reset-password', { email, recoveryCode: codes[0], newPassword: 'ChangedAgain123' })).status, 400);
        assert.equal(db.prepare('SELECT COUNT(*) AS n FROM recovery_codes').get().n, 7);
    });
    it('signs out other sessions but retains the current one and unrelated users', async () => {
        second = await loginAgent(supertest, app, email, 'Updated123');
        assert.equal((await post(owner, '/auth/revoke-other-sessions', { currentPassword: 'wrong' })).status, 400);
        assert.equal((await second.agent.get('/api/accounts').set('Accept', 'application/json')).status, 200);
        assert.equal((await post(owner, '/auth/revoke-other-sessions', { currentPassword: 'Updated123' })).status, 200);
        assert.equal((await second.agent.get('/api/accounts').set('Accept', 'application/json')).status, 401);
        for (const auth of [owner, other]) assert.equal((await auth.agent.get('/api/accounts').set('Accept', 'application/json')).status, 200);
    });
    it('persists profile fields on reload and rejects malformed input without changing them', async () => {
        assert.equal((await post(owner, '/auth/update-profile', { fullName: 'Updated Person', phone: '+258 84 123 4567' })).status, 200);
        const page = await owner.agent.get('/settings'); assert.match(page.text, /Updated Person/); assert.match(page.text, /\+258 84 123 4567/);
        for (const bad of [{ fullName: [] }, { fullName: '<script>bad</script>' }, { fullName: 'Valid Name', phone: [] }, { fullName: 'Valid Name', phone: 'abc' }]) {
            assert.equal((await post(owner, '/auth/update-profile', bad)).status, 400);
        }
        assert.equal(db.prepare('SELECT full_name FROM users WHERE email = ?').get(email).full_name, 'Updated Person');
    });
    it('password change revokes other sessions and preserves the current one', async () => {
        second = await loginAgent(supertest, app, email, 'Updated123');
        assert.equal((await post(owner, '/auth/change-password', { currentPassword: 'Updated123', newPassword: 'Changed123' })).status, 200);
        assert.equal((await second.agent.get('/api/accounts').set('Accept', 'application/json')).status, 401);
        assert.equal((await owner.agent.get('/api/accounts').set('Accept', 'application/json')).status, 200);
    });
    it('atomically consumes a code under concurrent reset attempts', async () => {
        const { resetPassword } = require('../src/services/recovery');
        const results = await Promise.all([1,2].map(() => resetPassword({ email, recoveryCode: codes[1], newPassword: 'RaceWinner123' })));
        assert.equal(results.filter(r => !r.error).length, 1);
        assert.equal(db.prepare('SELECT COUNT(*) AS n FROM recovery_codes').get().n, 6);
    });
    it('cannot reset suspended users or keep a session for a removed user', async () => {
        const { resetPassword } = require('../src/services/recovery');
        db.prepare("UPDATE users SET status = 'suspended' WHERE email = ?").run(email);
        assert.ok((await resetPassword({ email, recoveryCode: codes[2], newPassword: 'Suspended123' })).error);
        // A nonexistent principal must never retain API access.
        db.prepare('DELETE FROM cards WHERE account_id IN (SELECT id FROM accounts WHERE user_id IN (SELECT id FROM users WHERE email = ?))').run('other@example.test');
        db.prepare('DELETE FROM users WHERE email = ?').run('other@example.test');
        assert.equal((await other.agent.get('/api/accounts').set('Accept', 'application/json')).status, 401);
    });
    it('limits repeated recovery attempts', async () => {
        const auth = await anonymous(app);
        let result;
        for (let n = 0; n < 101; n++) { result = await post(auth, '/auth/reset-password', { email: 'bad', recoveryCode: 'bad', newPassword: 'bad' }); if (result.status === 429) break; }
        assert.equal(result.status, 429);
        // Without a reverse proxy (TRUST_PROXY unset) a client can't pick a new IP to escape the limit.
        const spoofed = await post(auth, '/auth/reset-password', { email: 'bad', recoveryCode: 'bad', newPassword: 'bad' }).set('X-Forwarded-For', '203.0.113.77');
        assert.equal(spoofed.status, 429);
    });
});
