const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/**
 * A plain `npm start` with no .env runs in development without ADMIN_EMAIL /
 * ADMIN_PASSWORD. Reviewers still need the admin console, so Willow creates
 * admin@willow.test once with a random password and saves it next to the database.
 */
describe('Admin login without configuration (development)', () => {
    let dir, db, auth, logs;
    const capture = fn => { const original = console.log; logs = []; console.log = (...args) => logs.push(args.join(' ')); return Promise.resolve(fn()).finally(() => { console.log = original; }); };

    before(async () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'willow-admin-'));
        process.env.NODE_ENV = 'development';
        process.env.DATABASE_PATH = path.join(dir, 'willow.db');
        process.env.SNAPSHOT_AUTO_RESTORE = 'false';
        delete process.env.ADMIN_EMAIL;
        delete process.env.ADMIN_PASSWORD;
        const database = require('../src/database');
        await database.initializeDatabase();
        db = database.getDb();
        auth = require('../src/services/auth');
    });
    after(() => {
        require('../src/database').closeDatabase();
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('creates admin@willow.test once, saves the password next to the database and prints it', async () => {
        await capture(() => auth.initializeAdmin());
        const admin = db.prepare("SELECT email, password_hash, role FROM users WHERE role = 'admin'").get();
        assert.equal(admin.email, 'admin@willow.test');
        const saved = fs.readFileSync(path.join(dir, 'admin-credentials.txt'), 'utf8');
        const password = /Password:\s*(\S+)/.exec(saved)[1];
        assert.match(password, /^Willow-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
        assert.ok(require('bcryptjs').compareSync(password, admin.password_hash), 'the saved password signs in');
        if (process.platform !== 'win32') assert.equal(fs.statSync(path.join(dir, 'admin-credentials.txt')).mode & 0o777, 0o600, 'only the owner can read it');
        assert.ok(logs.some(line => line.includes(password)), 'the password is printed for whoever started Willow');

        await capture(() => auth.initializeAdmin());
        assert.equal(db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get().n, 1, 'a restart reuses the same login');
        assert.ok(!logs.some(line => line.includes(password)), 'later starts do not print the password again');
        assert.ok(logs.some(line => line.includes('admin-credentials.txt')), 'they say where it is saved');
    });

    it('lets ADMIN_EMAIL/ADMIN_PASSWORD take over later without a clash, and ADMIN_PASSWORD always applies', async () => {
        process.env.ADMIN_EMAIL = 'owner@example.test';
        process.env.ADMIN_PASSWORD = 'Chosen-Password-1';
        const config = require('../src/config');
        config.admin.email = process.env.ADMIN_EMAIL;
        config.admin.password = process.env.ADMIN_PASSWORD;
        await capture(() => auth.initializeAdmin());
        const owner = db.prepare('SELECT role, customer_id, password_hash FROM users WHERE email = ?').get('owner@example.test');
        assert.equal(owner.role, 'admin', 'a second admin is created next to the generated one');
        assert.ok(require('bcryptjs').compareSync('Chosen-Password-1', owner.password_hash));
        config.admin.password = 'Changed-Password-2';
        await capture(() => auth.initializeAdmin());
        const changed = db.prepare('SELECT password_hash FROM users WHERE email = ?').get('owner@example.test');
        assert.ok(require('bcryptjs').compareSync('Changed-Password-2', changed.password_hash), 'a new ADMIN_PASSWORD replaces the old one');
        assert.equal(new Set(db.prepare("SELECT customer_id FROM users WHERE role = 'admin'").all().map(r => r.customer_id)).size, 2, 'admins get distinct customer IDs');
    });
});
