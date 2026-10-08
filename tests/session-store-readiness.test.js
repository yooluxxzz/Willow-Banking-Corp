const { it } = require('node:test');
const assert = require('node:assert/strict');
const Store = require('../src/session-store');
const fs = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');

it('waits for session-store initialization instead of acknowledging a discarded write', async () => {
    const store = new Store();
    try {
        await new Promise((resolve, reject) => store.set('early-session', { userId: 123, cookie: { maxAge: 60000 } }, error => error ? reject(error) : resolve()));
        const session = await new Promise((resolve, reject) => store.get('early-session', (error, value) => error ? reject(error) : resolve(value)));
        assert.equal(session.userId, 123);
    } finally { store.close(); }
});

it('retries a failed session-file write without another session mutation', async () => {
    const dir = fs.mkdtempSync(path.join(tmpdir(), 'willow-sessions-'));
    const store = new Store({ dir }); const write = fs.writeFileSync;
    try {
        await store._ready;
        await new Promise((resolve, reject) => store.set('retry-session', { userId: 456, cookie: { maxAge: 60000 } }, error => error ? reject(error) : resolve()));
        fs.writeFileSync = (...args) => { if (String(args[0]) === path.join(dir, 'sessions.db.tmp')) throw new Error('injected session save failure'); return write(...args); };
        store._flush();
        fs.writeFileSync = write;
        await new Promise(resolve => setTimeout(resolve, 1100));
        const SQL = await require('sql.js')();
        const reopened = new SQL.Database(fs.readFileSync(path.join(dir, 'sessions.db')));
        try { assert.equal(JSON.parse(reopened.exec("SELECT sess FROM sessions WHERE sid='retry-session'")[0].values[0][0]).userId, 456); }
        finally { reopened.close(); }
    } finally { fs.writeFileSync = write; store.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
