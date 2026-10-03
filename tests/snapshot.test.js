const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const supertest = require('supertest');
const { createTestApp, registerAgent } = require('./setup');

const root = path.resolve(__dirname, '..');

describe('Database snapshots in Git and removal of invented data', () => {
    let app, db, close, owner, dir;
    before(async () => {
        const env = await createTestApp(); app = env.app; db = env.getDb(); close = env.closeDatabase;
        owner = await registerAgent(supertest, app, { email: 'snapshot@example.test', password: 'SnapshotDemo123', fullName: 'Snap Shot' });
        const checking = db.prepare('SELECT a.id FROM accounts a JOIN users u ON u.id = a.user_id WHERE u.email = ?').get('snapshot@example.test');
        assert.equal((await owner.agent.post('/api/deposits').set('X-CSRF-Token', owner.csrfToken).send({ accountId: checking.id, amount: '42.50', description: "O'Brien & Sons — paycheck" })).status, 200);
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'willow-snapshot-'));
    });
    after(() => { close(); fs.rmSync(dir, { recursive: true, force: true }); });

    const run = (args, env) => execFileSync(process.execPath, ['scripts/db.js', ...args], { cwd: root, env: { ...process.env, ...env, DATABASE_PATH: env.DATABASE_PATH, NODE_ENV: 'test' }, encoding: 'utf8', stdio: 'pipe' });
    const openFile = async file => new (await require('sql.js')()).Database(fs.readFileSync(file));
    const one = (sqlDb, sql) => sqlDb.exec(sql)[0].values[0];

    it('exports deterministic SQL without sessions, restores it into a new database, and saves it back identically', async () => {
        const { exportSnapshot, importSnapshot } = require('../src/services/snapshot');
        const { getSqlDatabase } = require('../src/database');
        db.prepare("INSERT INTO revoked_sessions (session_hash, user_id) VALUES ('secret-session', (SELECT id FROM users WHERE email = 'snapshot@example.test'))").run();
        const first = exportSnapshot(getSqlDatabase());
        assert.equal(first.sql, exportSnapshot(getSqlDatabase()).sql, 'deterministic');
        assert.match(first.sql, /^-- Willow database snapshot/);
        assert.match(first.sql, /O''Brien & Sons — paycheck/);
        assert.doesNotMatch(first.sql, /secret-session/);
        assert.throws(() => importSnapshot(getSqlDatabase(), 'DROP TABLE users;'), /not a Willow database snapshot/);

        const snapshot = path.join(dir, 'willow-snapshot.sql');
        const restored = path.join(dir, 'restored.db');
        fs.writeFileSync(snapshot, first.sql);
        assert.match(run(['restore'], { DATABASE_PATH: restored, DATABASE_SNAPSHOT_PATH: snapshot }), /Restored/);
        const copy = await openFile(restored);
        assert.deepEqual(one(copy, "SELECT full_name, (SELECT SUM(balance) FROM accounts a WHERE a.user_id = u.id) FROM users u WHERE email = 'snapshot@example.test'"), ['Snap Shot', 4250]);
        assert.equal(one(copy, 'SELECT COUNT(*) FROM revoked_sessions')[0], 0);
        copy.close();

        const again = path.join(dir, 'again.sql');
        assert.match(run(['save'], { DATABASE_PATH: restored, DATABASE_SNAPSHOT_PATH: again }), /Saved \d+ row\(s\)/);
        assert.equal(fs.readFileSync(again, 'utf8'), first.sql, 'save after restore reproduces the same snapshot');

        assert.throws(() => run(['restore'], { DATABASE_PATH: restored, DATABASE_SNAPSHOT_PATH: snapshot }), /already exists/);
        // An explicit restore loads the snapshot even when automatic restore on start-up is switched off.
        assert.match(run(['restore', '--force'], { DATABASE_PATH: restored, DATABASE_SNAPSHOT_PATH: snapshot, SNAPSHOT_AUTO_RESTORE: 'false' }), /Restored .* \([1-9]\d* profile\(s\)\)/);
        assert.ok(fs.readdirSync(dir).some(name => name.startsWith('restored.db.bak-')), 'the replaced database is kept as a backup');
        const forced = await openFile(restored);
        assert.equal(one(forced, "SELECT COUNT(*) FROM users WHERE email = 'snapshot@example.test'")[0], 1, 'the restored database holds the snapshot, not an empty schema');
        forced.close();
    });

    it('removes invented customers, sample activity, auto-issued cards and practice cash once, keeping what customers did', async () => {
        const cleanup = require('../src/services/data-cleanup');
        db.prepare('DELETE FROM app_meta WHERE key = ?').run(cleanup.KEY);
        // A database from the previous version: a fictional customer, sample rows mixed with a real deposit.
        const legacy = db.prepare("INSERT INTO users (email, full_name, password_hash, customer_id) VALUES ('maria.silva@community.willow.test', 'Maria Silva', 'x', 'WB00000001')").run().lastInsertRowid;
        const legacyAccount = db.prepare("INSERT INTO accounts (user_id, account_number, balance, available_balance) VALUES (?, '420000000001', 4500, 4500)").run(legacy).lastInsertRowid;
        const user = db.prepare("SELECT id, created_at FROM users WHERE email = 'snapshot@example.test'").get();
        const account = db.prepare('SELECT id, balance, created_at FROM accounts WHERE user_id = ?').get(user.id);
        db.prepare("INSERT INTO user_preferences (user_id, sample_data_loaded_at) VALUES (?, datetime('now')) ON CONFLICT(user_id) DO UPDATE SET sample_data_loaded_at = excluded.sample_data_loaded_at").run(user.id);
        db.prepare("INSERT INTO transactions (reference, account_id, type, amount, direction, description) VALUES ('DEP-SABC1230001', ?, 'deposit', 320000, 'credit', 'Opening demo funds')").run(account.id);
        db.prepare("INSERT INTO transactions (reference, account_id, related_account_id, type, amount, direction, description) VALUES ('TRF-SABC1230002', ?, ?, 'transfer', 4500, 'debit', 'Dinner — Maria Silva')").run(account.id, legacyAccount);
        db.prepare('UPDATE accounts SET balance = balance + 315500, available_balance = available_balance + 315500 WHERE id = ?').run(account.id);
        db.prepare("INSERT INTO demo_goals (user_id, name, category, target_cents, current_cents) VALUES (?, 'Emergency fund', 'savings', 1000000, 720000), (?, 'My real goal', 'travel', 50000, 0)").run(user.id, user.id);
        const autoCard = db.prepare("INSERT INTO cards (account_id, last_four, expiration_date, created_at) VALUES (?, '1234', '01/2030', ?)").run(account.id, account.created_at).lastInsertRowid;
        const ordered = db.prepare("INSERT INTO cards (account_id, last_four, expiration_date, created_at, nickname) VALUES (?, '5678', '01/2030', datetime('now', '+1 day'), 'Mine')").run(account.id).lastInsertRowid;
        db.prepare("INSERT INTO demo_portfolios (user_id, cash_cents) VALUES (?, 10000000) ON CONFLICT(user_id) DO UPDATE SET cash_cents = 10000000").run(user.id);
        db.prepare("INSERT INTO demo_holdings (user_id, symbol, quantity, average_price) VALUES (?, 'AAPL', 3, 100)").run(user.id);
        db.prepare("INSERT INTO notifications (user_id, title, message) VALUES (?, 'Welcome to Willow', 'sample'), (?, 'Deposit received', 'real')").run(user.id, user.id);

        const counts = cleanup.run();
        assert.equal(counts.community, 1);
        assert.equal(counts.sampleTransactions, 2);
        assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users WHERE id = ?').get(legacy).n, 0);
        assert.equal(db.prepare('SELECT balance FROM accounts WHERE id = ?').get(account.id).balance, 4250, 'only the real $42.50 deposit remains');
        assert.deepEqual(db.prepare("SELECT reference FROM transactions WHERE account_id = ?").all(account.id).map(row => row.reference).filter(ref => /-S/.test(ref)), []);
        assert.deepEqual(db.prepare('SELECT name FROM demo_goals WHERE user_id = ?').all(user.id).map(row => row.name), ['My real goal']);
        assert.deepEqual(db.prepare('SELECT id FROM cards WHERE account_id = ?').all(account.id).map(row => row.id), [ordered], 'the ordered card stays, the auto-issued one goes');
        assert.ok(autoCard);
        assert.deepEqual(db.prepare('SELECT cash_cents FROM demo_portfolios WHERE user_id = ?').get(user.id), { cash_cents: 0 });
        assert.equal(db.prepare('SELECT COUNT(*) AS n FROM demo_holdings').get().n, 0);
        assert.deepEqual(db.prepare('SELECT title FROM notifications WHERE user_id = ?').all(user.id).map(row => row.title).filter(title => /Welcome|Deposit received/.test(title)), ['Deposit received']);
        assert.equal(db.prepare('SELECT sample_data_loaded_at FROM user_preferences WHERE user_id = ?').get(user.id).sample_data_loaded_at, null);
        assert.deepEqual(cleanup.run(), { skipped: true }, 'runs once per database');
    });
});
