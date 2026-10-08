const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/**
 * The other suites use an in-memory database; this one uses a real file, the way
 * Willow runs, because saving to disk is where foreign-key enforcement used to be lost.
 */
describe('Database integrity with a database file', () => {
    let dir, database, db, raw;
    const user = email => db.prepare("INSERT INTO users (email, full_name, phone, password_hash, role, status, customer_id, is_guest) VALUES (?, 'Test Person', '', 'x', 'customer', 'active', ?, 1)").run(email, `WB${Math.floor(Math.random() * 1e8)}`).lastInsertRowid;

    before(async () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'willow-db-'));
        process.env.NODE_ENV = 'test';
        process.env.DATABASE_PATH = path.join(dir, 'willow.db');
        process.env.SNAPSHOT_AUTO_RESTORE = 'false';
        database = require('../src/database');
        await database.initializeDatabase();
        db = database.getDb();
        raw = database.getSqlDatabase();
    });
    after(() => {
        database.closeDatabase();
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('keeps foreign keys enforced after the database is written to disk', async () => {
        assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1, 'on after start-up');
        user('fk@example.test');
        await new Promise(resolve => setImmediate(resolve)); // the write is saved on the next tick
        assert.ok(fs.statSync(process.env.DATABASE_PATH).size > 0);
        assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1, 'still on after a save');
    });

    it('retains dirty state after a failed export write and retries without another mutation', async () => {
        const original = fs.writeFileSync;
        let fail = true;
        fs.writeFileSync = (...args) => {
            if (fail && String(args[0]).endsWith('willow.db.tmp')) { fail = false; throw new Error('injected save failure'); }
            return original(...args);
        };
        try {
            db.prepare("INSERT INTO app_meta(key, value) VALUES ('audit-save-retry', 'retained')").run();
            await new Promise(resolve => setImmediate(resolve));
            assert.equal(database.persistenceStatus().ready, false);
            assert.equal(database.persistenceStatus().pending, true);
        } finally { fs.writeFileSync = original; }
        // No new writes occur here. A normal periodic save must still retry.
        await new Promise(resolve => setTimeout(resolve, 5100));
        assert.equal(database.persistenceStatus().ready, true);
        assert.equal(database.persistenceStatus().pending, false);
        const SQL = await require('sql.js')();
        const reopened = new SQL.Database(fs.readFileSync(process.env.DATABASE_PATH));
        try { assert.equal(reopened.exec("SELECT value FROM app_meta WHERE key='audit-save-retry'")[0].values[0][0], 'retained'); }
        finally { reopened.close(); }
    });

    it('removes everything a deleted profile owned', async () => {
        const id = user('purge@example.test');
        const account = db.prepare("INSERT INTO accounts (user_id, account_number, account_type, balance, available_balance, currency, status) VALUES (?, '4200999900001', 'checking', 5000, 5000, 'USD', 'active')").run(id).lastInsertRowid;
        db.prepare("INSERT INTO budgets (user_id, name, period, limit_cents) VALUES (?, 'Food', 'monthly', 10000)").run(id);
        db.prepare("INSERT INTO notifications (user_id, type, title, message) VALUES (?, 'system', 'Hi', 'Hello')").run(id);
        db.prepare("INSERT INTO cards (account_id, last_four, expiration_date, status) VALUES (?, '1234', '12/30', 'active')").run(account);
        await new Promise(resolve => setImmediate(resolve));
        require('../src/services/guests').purgeStaleGuests({ days: 0, now: new Date(Date.now() + 86400000) });
        for (const [table, column, value] of [['accounts', 'user_id', id], ['budgets', 'user_id', id], ['notifications', 'user_id', id], ['cards', 'account_id', account]]) {
            assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${column} = ?`).get(value).n, 0, `${table} rows are removed`);
        }
    });

    it('repairs rows left behind while foreign keys were not enforced', () => {
        const keep = user('keep@example.test');
        const keepAccount = db.prepare("INSERT INTO accounts (user_id, account_number, account_type, balance, available_balance, currency, status) VALUES (?, '4200999900002', 'checking', 0, 0, 'USD', 'active')").run(keep).lastInsertRowid;
        raw.run('PRAGMA foreign_keys = OFF');
        raw.run("INSERT INTO accounts (user_id, account_number, account_type, balance, available_balance, currency, status) VALUES (99999, '4200999900003', 'checking', 700, 700, 'USD', 'active')");
        const orphanAccount = raw.exec('SELECT last_insert_rowid()')[0].values[0][0];
        raw.run(`INSERT INTO transactions (reference, account_id, type, amount, currency, direction, status, description) VALUES ('TRF-ORPHAN-1', ${orphanAccount}, 'deposit', 700, 'USD', 'credit', 'completed', 'x')`);
        raw.run(`INSERT INTO transactions (reference, account_id, related_account_id, type, amount, currency, direction, status, description) VALUES ('TRF-KEEP-1', ${keepAccount}, ${orphanAccount}, 'transfer', 100, 'USD', 'credit', 'completed', 'from someone who left')`);
        raw.run("INSERT INTO budgets (user_id, name, period, limit_cents) VALUES (99999, 'Ghost', 'daily', 100)");
        raw.run('PRAGMA foreign_keys = ON');

        const fixed = database.repairForeignKeys();
        assert.ok(fixed >= 4, `fixed ${fixed}`);
        assert.equal(db.prepare('SELECT COUNT(*) AS n FROM accounts WHERE user_id = 99999').get().n, 0, 'orphaned accounts are removed');
        assert.equal(db.prepare("SELECT COUNT(*) AS n FROM transactions WHERE reference = 'TRF-ORPHAN-1'").get().n, 0, 'and their history');
        assert.equal(db.prepare("SELECT related_account_id FROM transactions WHERE reference = 'TRF-KEEP-1'").get().related_account_id, null, 'other customers keep their rows, with the link cleared');
        assert.equal(db.prepare('SELECT COUNT(*) AS n FROM budgets WHERE user_id = 99999').get().n, 0);
        assert.equal(raw.exec('PRAGMA foreign_key_check').length, 0, 'nothing is left pointing nowhere');
        assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
    });
});
