/**
 * Database snapshot commands.
 *
 *   npm run db:save               Write data/willow-snapshot.sql from the database file.
 *   npm run db:restore -- --force Replace the database file with the snapshot
 *                                 (the old file is kept as a .bak copy).
 *
 * Paths come from DATABASE_PATH and DATABASE_SNAPSHOT_PATH. Safe to run while
 * Willow is running: the server writes its database file atomically.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const config = require('../src/config');
const { exportSnapshot } = require('../src/services/snapshot');

const root = config.paths.root;
const dbPath = path.resolve(root, config.database.path);
const snapshotPath = path.resolve(root, config.database.snapshotPath);
const rel = file => path.relative(process.cwd(), file) || file;

async function save() {
    if (!fs.existsSync(dbPath)) throw new Error(`No database at ${rel(dbPath)}. Start Willow once, or set DATABASE_PATH.`);
    const SQL = await require('sql.js')();
    const db = new SQL.Database(fs.readFileSync(dbPath));
    const { sql, tables, rows } = exportSnapshot(db);
    db.close();
    fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
    fs.writeFileSync(`${snapshotPath}.tmp`, sql);
    fs.renameSync(`${snapshotPath}.tmp`, snapshotPath);
    console.log(`Saved ${rows} row(s) from ${tables} table(s) to ${rel(snapshotPath)}.`);
    console.log('Keep this backup private and outside source control. It contains customer data and credential hashes.');
}

async function restore(force) {
    if (!fs.existsSync(snapshotPath)) throw new Error(`No snapshot at ${rel(snapshotPath)}.`);
    if (fs.existsSync(dbPath)) {
        if (!force) throw new Error(`${rel(dbPath)} already exists. Stop Willow and run "npm run db:restore -- --force" to replace it (a .bak copy is kept).`);
        const backup = `${dbPath}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
        fs.renameSync(dbPath, backup);
        console.log(`Kept the previous database as ${rel(backup)}.`);
    }
    const { initializeDatabase, closeDatabase, getDb } = require('../src/database');
    // Restoring is the point here, whatever SNAPSHOT_AUTO_RESTORE says for normal starts.
    config.database.autoRestore = true;
    await initializeDatabase(); // creates the schema, loads the snapshot, then migrates it
    const profiles = getDb().prepare('SELECT COUNT(*) AS n FROM users').get().n;
    closeDatabase();
    console.log(`Restored ${rel(dbPath)} from ${rel(snapshotPath)} (${profiles} profile(s)).`);
}

const [command, flag] = process.argv.slice(2);
const run = command === 'save' ? save() : command === 'restore' ? restore(flag === '--force') : Promise.reject(new Error('Usage: node scripts/db.js save | restore [--force]'));
run.catch(error => { console.error(error.message); process.exit(1); });
