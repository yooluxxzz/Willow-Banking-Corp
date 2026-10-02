const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const supertest = require('supertest');
const { createTestApp, registerAgent, loginAgent } = require('./setup');
const { sessionKey, ownedSessions, deviceLabel } = require('../src/services/sessions');

describe('Individual session management', () => {
    let app, db, store, close, owner, second, other;
    const list = () => new Promise((resolve, reject) => store.all((err, rows) => err ? reject(err) : resolve(rows)));
    const revoke = (id, csrf = true) => {
        const request = owner.agent.post('/auth/sessions/' + id + '/revoke').set('Accept', 'application/json');
        if (csrf) request.set('X-CSRF-Token', owner.csrfToken);
        return request.send({});
    };
    before(async () => {
        const env = await createTestApp(); app = env.app; db = env.getDb(); store = env.sessionStore; close = env.closeDatabase;
        owner = await registerAgent(supertest, app, { email: 'sessions@example.test', password: 'SessionDemo123', fullName: 'Session Owner' });
        second = await loginAgent(supertest, app, 'sessions@example.test', 'SessionDemo123');
        other = await registerAgent(supertest, app, { email: 'separate@example.test', password: 'SessionDemo123', fullName: 'Separate Person' });
    });
    after(() => close());
    it('shows owned sessions, the current label and sign-in times without exposing session credentials', async () => {
        const page = await owner.agent.get('/security'); assert.equal(page.status, 200);
        assert.match(page.text, /This session/); assert.match(page.text, /Signed in <time/);
        assert.equal((page.text.match(/data-session-id=/g) || []).length, 2);
        assert.equal((page.text.match(/data-revoke-session=/g) || []).length, 1);
        for (const sid of Object.keys(await list())) assert.ok(!page.text.includes(sid));
        assert.match(page.headers['cache-control'], /no-store/);
    });
    it('rejects malformed identifiers, missing CSRF, foreign sessions and the current session', async () => {
        const sessions = Object.entries(await list());
        const ownerId = db.prepare('SELECT id FROM users WHERE email = ?').get('sessions@example.test').id;
        const owned = sessions.filter(([,row]) => row.userId === ownerId);
        const foreign = sessions.find(([,row]) => row.userId !== ownerId && row.userId);
        const page = await owner.agent.get('/security');
        const otherId = page.text.match(/data-revoke-session="([a-f0-9]+)"/)[1];
        const current = owned.find(([sid]) => sessionKey(sid) !== otherId);
        assert.equal((await revoke('bad')).status, 400);
        assert.equal((await revoke(otherId, false)).status, 403);
        assert.equal((await revoke(sessionKey(foreign[0]))).status, 404);
        assert.equal((await revoke(sessionKey(current[0]))).status, 400);
        assert.equal(db.prepare('SELECT COUNT(*) AS n FROM revoked_sessions').get().n, 0);
    });
    it('revokes only the selected session and blocks replay even if a stale request restores its store row', async () => {
        const page = await owner.agent.get('/security');
        const id = page.text.match(/data-revoke-session="([a-f0-9]+)"/)[1];
        const [sid, snapshot] = Object.entries(await list()).find(([sid]) => sessionKey(sid) === id);
        assert.equal((await revoke(id)).status, 200);
        assert.equal(db.prepare('SELECT session_hash FROM revoked_sessions').get().session_hash, id);
        await new Promise((resolve,reject) => store.set(sid, snapshot, err => err ? reject(err) : resolve()));
        const refreshed = await owner.agent.get('/security'); assert.ok(!refreshed.text.includes(id));
        assert.equal((await second.agent.get('/api/accounts').set('Accept','application/json')).status, 401);
        assert.equal((await owner.agent.get('/api/accounts')).status, 200);
        assert.equal((await other.agent.get('/api/accounts')).status, 200);
        assert.equal((await revoke(id)).status, 404);
        const audit = db.prepare("SELECT * FROM audit_logs WHERE action = 'session_revoked'").get();
        assert.ok(audit); assert.ok(!JSON.stringify(audit).includes(sid));
        const newLogin = await loginAgent(supertest, app, 'sessions@example.test', 'SessionDemo123');
        assert.equal((await newLogin.agent.get('/api/accounts')).status, 200);
    });
    it('handles the production store array shape, legacy sessions and store failures', async () => {
        const userId = db.prepare('SELECT id FROM users WHERE email = ?').get('sessions@example.test').id;
        const req = { session: { userId }, sessionID: 'legacy', sessionStore: { all: cb => cb(null, [
            { id: 'legacy', userId }, { id: 'old-version', userId, authVersion: 3 }, { id: 'unowned', userId: -1 }
        ]) } };
        const result = await ownedSessions(req, 0);
        assert.equal(result.length, 1); assert.equal(result[0].current, true); assert.equal(result[0].signedInAt, null);
        req.sessionStore.all = cb => cb(new Error('unavailable'));
        await assert.rejects(ownedSessions(req, 0), /unavailable/);
    });
    it('uses limited device labels instead of rendering arbitrary browser headers', () => {
        assert.equal(deviceLabel('Mozilla Windows Chrome/123 Edg/123'), 'Edge on Windows');
        assert.equal(deviceLabel('Mozilla iPhone Safari/604'), 'Safari on iOS');
        assert.equal(deviceLabel('<script>bad</script>'), 'Unknown browser on unknown device');
    });
});
