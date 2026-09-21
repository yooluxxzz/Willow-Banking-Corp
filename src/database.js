/**
 * Database layer using sql.js (pure WebAssembly SQLite)
 * Provides a synchronous API compatible with better-sqlite3 patterns
 */
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const config = require('./config');

let db = null;
let dbPath = null;
let saveTimer = null;

/**
 * Initialize the database (must be called before any queries)
 */
async function initializeDatabase() {
    const SQL = await initSqlJs();
    dbPath = path.resolve(config.paths.root, config.database.path);
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    // Load existing database or create new
    if (fs.existsSync(dbPath)) {
        const buffer = fs.readFileSync(dbPath);
        db = new SQL.Database(buffer);
    } else {
        db = new SQL.Database();
    }

    // Enable WAL-like behavior and foreign keys
    db.run('PRAGMA foreign_keys = ON');

    // Create tables
    db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      full_name TEXT NOT NULL,
      phone TEXT DEFAULT '',
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'customer' CHECK(role IN ('customer', 'admin')),
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'suspended', 'closed', 'deleted')),
      customer_id TEXT NOT NULL UNIQUE,
      status_reason TEXT DEFAULT NULL,
      scheduled_deletion_at TEXT DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      account_number TEXT NOT NULL UNIQUE,
      account_type TEXT NOT NULL DEFAULT 'checking' CHECK(account_type IN ('checking', 'savings')),
      balance INTEGER NOT NULL DEFAULT 0,
      available_balance INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'USD',
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'frozen', 'closed')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference TEXT NOT NULL UNIQUE,
      account_id INTEGER NOT NULL REFERENCES accounts(id),
      related_account_id INTEGER REFERENCES accounts(id),
      type TEXT NOT NULL CHECK(type IN ('transfer', 'deposit', 'withdrawal', 'payment', 'refund', 'adjustment')),
      amount INTEGER NOT NULL CHECK(amount > 0),
      currency TEXT NOT NULL DEFAULT 'USD',
      direction TEXT NOT NULL CHECK(direction IN ('credit', 'debit')),
      status TEXT NOT NULL DEFAULT 'completed' CHECK(status IN ('completed', 'pending', 'failed')),
      description TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      card_type TEXT NOT NULL DEFAULT 'debit' CHECK(card_type IN ('debit', 'credit')),
      last_four TEXT NOT NULL,
      expiration_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'frozen', 'reported', 'cancelled')),
      daily_limit INTEGER NOT NULL DEFAULT 500000,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL DEFAULT 'info',
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_id INTEGER,
      actor_email TEXT,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      metadata TEXT DEFAULT '{}',
      result TEXT NOT NULL DEFAULT 'success',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    `);

    // Auto-update updated_at on user changes
    db.run(`
      CREATE TRIGGER IF NOT EXISTS trg_users_updated_at
      AFTER UPDATE ON users
      BEGIN
        UPDATE users SET updated_at = datetime('now') WHERE id = NEW.id;
      END
    `);

    // Create indexes
    const indexes = [
        'CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id)',
        'CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id)',
        'CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at)',
        'CREATE INDEX IF NOT EXISTS idx_transactions_reference ON transactions(reference)',
        'CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type)',
        'CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id)',
        'CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(user_id, is_read)',
        'CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at)',
        'CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON audit_logs(actor_id)',
        'CREATE INDEX IF NOT EXISTS idx_cards_account_id ON cards(account_id)',
        'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)',
        'CREATE INDEX IF NOT EXISTS idx_users_customer_id ON users(customer_id)',
    ];
    indexes.forEach(idx => db.run(idx));

    // Migrations for existing databases
    const migrations = [
        "ALTER TABLE users ADD COLUMN status_reason TEXT DEFAULT NULL",
        "ALTER TABLE users ADD COLUMN scheduled_deletion_at TEXT DEFAULT NULL",
    ];
    migrations.forEach(m => { try { db.run(m); } catch (e) { /* column already exists */ } });

    // Auto-save to disk every 5 seconds
    saveTimer = setInterval(() => saveToDisk(), 5000);
    saveToDisk();

    return db;
}

/**
 * Get the database instance
 * Provides a wrapper with .prepare() API for compatibility
 */
function getDb() {
    if (!db) throw new Error('Database not initialized. Call initializeDatabase() first.');
    return createDbProxy();
}

/**
 * Creates a proxy object that mimics the better-sqlite3 API
 */
function createDbProxy() {
    return {
        prepare(sql) {
            return {
                get(...params) {
                    const stmt = db.prepare(sql);
                    if (params.length) stmt.bind(params);
                    if (stmt.step()) {
                        const cols = stmt.getColumnNames();
                        const vals = stmt.get();
                        stmt.free();
                        const row = {};
                        cols.forEach((col, i) => { row[col] = vals[i]; });
                        return row;
                    }
                    stmt.free();
                    return undefined;
                },
                all(...params) {
                    const results = [];
                    const stmt = db.prepare(sql);
                    if (params.length) stmt.bind(params);
                    while (stmt.step()) {
                        const cols = stmt.getColumnNames();
                        const vals = stmt.get();
                        const row = {};
                        cols.forEach((col, i) => { row[col] = vals[i]; });
                        results.push(row);
                    }
                    stmt.free();
                    return results;
                },
                run(...params) {
                    db.run(sql, params);
                    const info = {
                        changes: db.getRowsModified(),
                        lastInsertRowid: getLastInsertRowId(),
                    };
                    scheduleSave();
                    return info;
                },
            };
        },
        exec(sql) {
            db.run(sql);
            scheduleSave();
        },
        transaction(fn) {
            return (...args) => {
                db.run('BEGIN');
                try {
                    const result = fn(...args);
                    db.run('COMMIT');
                    scheduleSave();
                    return result;
                } catch (err) {
                    db.run('ROLLBACK');
                    throw err;
                }
            };
        },
    };
}

function getLastInsertRowId() {
    const stmt = db.prepare('SELECT last_insert_rowid() as id');
    stmt.step();
    const id = stmt.get()[0];
    stmt.free();
    return id;
}

let saveScheduled = false;
function scheduleSave() {
    if (!saveScheduled) {
        saveScheduled = true;
        process.nextTick(() => {
            saveToDisk();
            saveScheduled = false;
        });
    }
}

function saveToDisk() {
    if (!db || !dbPath) return;
    try {
        const data = db.export();
        const buffer = Buffer.from(data);
        const tmpPath = dbPath + '.tmp';
        fs.writeFileSync(tmpPath, buffer);
        fs.renameSync(tmpPath, dbPath);
    } catch (err) {
        console.error('[Database] Save error:', err.message);
    }
}

function closeDatabase() {
    if (saveTimer) {
        clearInterval(saveTimer);
        saveTimer = null;
    }
    if (db) {
        saveToDisk();
        db.close();
        db = null;
    }
}

module.exports = { getDb, initializeDatabase, closeDatabase };
