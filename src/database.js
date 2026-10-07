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
    dbPath = config.database.path === ':memory:' ? null : path.resolve(config.paths.root, config.database.path);
    const dir = dbPath ? path.dirname(dbPath) : config.paths.data;
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    // Load existing database or create new
    const existed = Boolean(dbPath && fs.existsSync(dbPath));
    if (existed) {
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

    CREATE TABLE IF NOT EXISTS recovery_codes (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      code_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, code_hash)
    );

    CREATE TABLE IF NOT EXISTS revoked_sessions (
      session_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      revoked_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

        CREATE TABLE IF NOT EXISTS demo_portfolios (
            user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            cash_cents INTEGER NOT NULL DEFAULT 0 CHECK(cash_cents >= 0),
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS demo_holdings (
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            symbol TEXT NOT NULL,
            quantity REAL NOT NULL CHECK(quantity > 0),
            average_price REAL NOT NULL CHECK(average_price > 0),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            PRIMARY KEY (user_id, symbol)
        );

        CREATE TABLE IF NOT EXISTS demo_watchlist (
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            symbol TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            PRIMARY KEY (user_id, symbol)
        );

        CREATE TABLE IF NOT EXISTS demo_trades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            symbol TEXT NOT NULL,
            side TEXT NOT NULL CHECK(side IN ('buy', 'sell')),
            quantity REAL NOT NULL CHECK(quantity > 0),
            price REAL NOT NULL CHECK(price > 0),
            total_cents INTEGER NOT NULL CHECK(total_cents > 0),
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      account_number TEXT NOT NULL UNIQUE,
      account_type TEXT NOT NULL DEFAULT 'checking' CHECK(account_type IN ('checking', 'savings')),
      balance INTEGER NOT NULL DEFAULT 0 CHECK(balance >= 0),
      available_balance INTEGER NOT NULL DEFAULT 0 CHECK(available_balance >= 0),
      currency TEXT NOT NULL DEFAULT 'USD',
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'frozen', 'closed')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

        CREATE TABLE IF NOT EXISTS demo_goals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
            name TEXT NOT NULL,
            category TEXT NOT NULL CHECK(category IN ('savings', 'home', 'travel', 'business', 'investing', 'other')),
            target_cents INTEGER NOT NULL CHECK(target_cents > 0),
            current_cents INTEGER NOT NULL DEFAULT 0 CHECK(current_cents >= 0),
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            CHECK(current_cents <= target_cents)
        );

        CREATE TABLE IF NOT EXISTS scheduled_transfers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            from_account_id INTEGER NOT NULL REFERENCES accounts(id),
            to_account_id INTEGER NOT NULL REFERENCES accounts(id),
            amount INTEGER NOT NULL CHECK(amount > 0),
            description TEXT NOT NULL DEFAULT '',
            scheduled_for TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
            transaction_reference TEXT UNIQUE,
            result_message TEXT DEFAULT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            executed_at TEXT DEFAULT NULL,
            CHECK(from_account_id != to_account_id)
        );

        CREATE TABLE IF NOT EXISTS demo_crypto_transfers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            reference TEXT NOT NULL UNIQUE,
            sender_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            recipient_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            symbol TEXT NOT NULL CHECK(length(symbol) BETWEEN 2 AND 10),
            quantity REAL NOT NULL CHECK(quantity > 0),
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            CHECK(sender_user_id != recipient_user_id)
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

    CREATE TABLE IF NOT EXISTS payees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      nickname TEXT NOT NULL DEFAULT '',
      last_paid_at TEXT DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, recipient_user_id),
      CHECK(user_id != recipient_user_id)
    );

    CREATE TABLE IF NOT EXISTS user_preferences (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      alert_transactions INTEGER NOT NULL DEFAULT 1,
      alert_large_threshold_cents INTEGER NOT NULL DEFAULT 50000,
      alert_cards INTEGER NOT NULL DEFAULT 1,
      alert_security INTEGER NOT NULL DEFAULT 1,
      alert_markets INTEGER NOT NULL DEFAULT 0,
      alert_product_news INTEGER NOT NULL DEFAULT 0,
      privacy_hide_balances INTEGER NOT NULL DEFAULT 0,
      privacy_personalized_insights INTEGER NOT NULL DEFAULT 1,
      assistant_autonomy TEXT NOT NULL DEFAULT 'confirm' CHECK(assistant_autonomy IN ('read_only', 'confirm', 'autonomous')),
      sample_data_loaded_at TEXT DEFAULT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS two_factor (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      secret_encrypted TEXT NOT NULL,
      enabled_at TEXT DEFAULT NULL,
      last_used_step INTEGER DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS business_profiles (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      industry TEXT NOT NULL DEFAULT '',
      country TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS business_invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      number TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      amount INTEGER NOT NULL CHECK(amount > 0),
      currency TEXT NOT NULL DEFAULT 'USD',
      issued_on TEXT NOT NULL,
      due_on TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'paid', 'void')),
      paid_at TEXT DEFAULT NULL,
      paid_account_id INTEGER REFERENCES accounts(id),
      transaction_reference TEXT DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, number)
    );

    CREATE TABLE IF NOT EXISTS business_team_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      email TEXT NOT NULL COLLATE NOCASE,
      role TEXT NOT NULL CHECK(role IN ('admin', 'approver', 'cardholder', 'viewer')),
      status TEXT NOT NULL DEFAULT 'invited' CHECK(status IN ('invited', 'removed')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, email)
    );

    CREATE TABLE IF NOT EXISTS loan_estimates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK(kind IN ('personal', 'mortgage', 'business', 'credit')),
      label TEXT NOT NULL DEFAULT '',
      principal_cents INTEGER NOT NULL CHECK(principal_cents > 0),
      annual_rate_bps INTEGER NOT NULL CHECK(annual_rate_bps >= 0),
      term_months INTEGER NOT NULL CHECK(term_months > 0),
      monthly_payment_cents INTEGER NOT NULL CHECK(monthly_payment_cents >= 0),
      total_interest_cents INTEGER NOT NULL CHECK(total_interest_cents >= 0),
      details TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS support_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reference TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      topic TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'received',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS portfolio_transfers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      account_id INTEGER REFERENCES accounts(id),
      direction TEXT NOT NULL CHECK(direction IN ('in', 'out')),
      amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
      reference TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      scope TEXT NOT NULL DEFAULT 'personal' CHECK(scope IN ('personal', 'business')),
      name TEXT NOT NULL,
      category TEXT DEFAULT NULL,
      period TEXT NOT NULL CHECK(period IN ('daily', 'weekly', 'monthly')),
      limit_cents INTEGER NOT NULL CHECK(limit_cents > 0),
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'archived')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS budget_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      budget_id INTEGER NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      day TEXT NOT NULL,
      period_start TEXT NOT NULL,
      spent_cents INTEGER NOT NULL CHECK(spent_cents >= 0),
      limit_cents INTEGER NOT NULL CHECK(limit_cents > 0),
      status TEXT NOT NULL CHECK(status IN ('under', 'near', 'over')),
      notified TEXT NOT NULL DEFAULT '' CHECK(notified IN ('', 'near', 'over')),
      checked_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(budget_id, day)
    );

    CREATE TABLE IF NOT EXISTS business_expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      spent_on TEXT NOT NULL,
      vendor TEXT NOT NULL,
      category TEXT NOT NULL,
      amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
      currency TEXT NOT NULL DEFAULT 'USD',
      note TEXT NOT NULL DEFAULT '',
      account_id INTEGER REFERENCES accounts(id),
      transaction_reference TEXT DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('cash', 'property', 'vehicle', 'investment', 'retirement', 'business', 'other')),
      value_cents INTEGER NOT NULL CHECK(value_cents >= 0),
      currency TEXT NOT NULL DEFAULT 'USD',
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS debts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('credit_card', 'student_loan', 'mortgage', 'auto', 'personal', 'medical', 'other')),
      lender TEXT NOT NULL DEFAULT '',
      balance_cents INTEGER NOT NULL CHECK(balance_cents >= 0),
      original_cents INTEGER NOT NULL CHECK(original_cents >= 0),
      rate_bps INTEGER NOT NULL DEFAULT 0 CHECK(rate_bps BETWEEN 0 AND 10000),
      minimum_cents INTEGER NOT NULL DEFAULT 0 CHECK(minimum_cents >= 0),
      due_day INTEGER DEFAULT NULL CHECK(due_day IS NULL OR due_day BETWEEN 1 AND 31),
      currency TEXT NOT NULL DEFAULT 'USD',
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'paid_off')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS debt_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      debt_id INTEGER NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
      account_id INTEGER REFERENCES accounts(id),
      transaction_reference TEXT DEFAULT NULL,
      paid_on TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS net_worth_snapshots (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      day TEXT NOT NULL,
      accounts_cents INTEGER NOT NULL,
      investments_cents INTEGER NOT NULL,
      assets_cents INTEGER NOT NULL,
      debts_cents INTEGER NOT NULL,
      net_cents INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, day)
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

    CREATE TABLE IF NOT EXISTS assistant_conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT 'New chat',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS assistant_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL REFERENCES assistant_conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      mode TEXT DEFAULT NULL,
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
        'CREATE INDEX IF NOT EXISTS idx_assistant_conversations_user ON assistant_conversations(user_id, updated_at)',
        'CREATE INDEX IF NOT EXISTS idx_assistant_messages_conversation ON assistant_messages(conversation_id, id)',
        'CREATE INDEX IF NOT EXISTS idx_cards_account_id ON cards(account_id)',
        'CREATE INDEX IF NOT EXISTS idx_demo_trades_user_created ON demo_trades(user_id, created_at)',
        'CREATE INDEX IF NOT EXISTS idx_demo_goals_user ON demo_goals(user_id, created_at)',
        'CREATE INDEX IF NOT EXISTS idx_demo_goals_account ON demo_goals(account_id)',
        'CREATE INDEX IF NOT EXISTS idx_scheduled_transfers_due ON scheduled_transfers(status, scheduled_for)',
        'CREATE INDEX IF NOT EXISTS idx_scheduled_transfers_user ON scheduled_transfers(user_id, created_at)',
        'CREATE INDEX IF NOT EXISTS idx_demo_crypto_transfers_sender ON demo_crypto_transfers(sender_user_id, created_at)',
        'CREATE INDEX IF NOT EXISTS idx_demo_crypto_transfers_recipient ON demo_crypto_transfers(recipient_user_id, created_at)',
        'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)',
        'CREATE INDEX IF NOT EXISTS idx_users_customer_id ON users(customer_id)',
    ];
    indexes.forEach(idx => db.run(idx));

    // Migrations for existing databases
    const migrations = [
        "ALTER TABLE accounts ADD COLUMN purpose TEXT NOT NULL DEFAULT 'personal' CHECK(purpose IN ('personal','business'))",
        "ALTER TABLE accounts ADD COLUMN opening_key TEXT DEFAULT NULL",
        "ALTER TABLE accounts ADD COLUMN nickname TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE users ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE users ADD COLUMN status_reason TEXT DEFAULT NULL",
        "ALTER TABLE users ADD COLUMN scheduled_deletion_at TEXT DEFAULT NULL",
        "ALTER TABLE users ADD COLUMN country TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE users ADD COLUMN is_guest INTEGER NOT NULL DEFAULT 0",
        // Opt-in sample profiles (services/sample-profile.js) show a "sample data" banner.
        "ALTER TABLE users ADD COLUMN is_sample INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE cards ADD COLUMN form TEXT NOT NULL DEFAULT 'physical'",
        "ALTER TABLE cards ADD COLUMN nickname TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE cards ADD COLUMN design TEXT NOT NULL DEFAULT 'forest'",
        "ALTER TABLE cards ADD COLUMN holder_name TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE cards ADD COLUMN online_enabled INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE cards ADD COLUMN contactless_enabled INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE cards ADD COLUMN atm_enabled INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE cards ADD COLUMN international_enabled INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE cards ADD COLUMN notifications_enabled INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE transactions ADD COLUMN category TEXT DEFAULT NULL",
        "ALTER TABLE transactions ADD COLUMN counterparty TEXT DEFAULT NULL",
        "ALTER TABLE transactions ADD COLUMN card_id INTEGER DEFAULT NULL",
        "ALTER TABLE user_preferences ADD COLUMN alert_budgets INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE user_preferences ADD COLUMN assistant_autonomy TEXT NOT NULL DEFAULT 'confirm' CHECK(assistant_autonomy IN ('read_only', 'confirm', 'autonomous'))",
        "ALTER TABLE demo_goals ADD COLUMN account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL",
    ];
    migrations.forEach(m => { try { db.run(m); } catch (e) { /* column already exists */ } });
    db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_opening_key ON accounts(user_id, opening_key)');
    [
        'CREATE INDEX IF NOT EXISTS idx_payees_user ON payees(user_id)',
        'CREATE INDEX IF NOT EXISTS idx_invoices_user ON business_invoices(user_id, status)',
        'CREATE INDEX IF NOT EXISTS idx_team_user ON business_team_members(user_id)',
        'CREATE INDEX IF NOT EXISTS idx_loan_estimates_user ON loan_estimates(user_id, created_at)',
        'CREATE INDEX IF NOT EXISTS idx_support_user ON support_requests(user_id, created_at)',
        'CREATE INDEX IF NOT EXISTS idx_transactions_account_created ON transactions(account_id, created_at)',
        'CREATE INDEX IF NOT EXISTS idx_portfolio_transfers_user ON portfolio_transfers(user_id, created_at)',
        'CREATE INDEX IF NOT EXISTS idx_budgets_user ON budgets(user_id, scope, status)',
        'CREATE INDEX IF NOT EXISTS idx_budget_checks_user_day ON budget_checks(user_id, day)',
        'CREATE INDEX IF NOT EXISTS idx_business_expenses_user ON business_expenses(user_id, spent_on)',
        'CREATE INDEX IF NOT EXISTS idx_assets_user ON assets(user_id)',
        'CREATE INDEX IF NOT EXISTS idx_debts_user ON debts(user_id, status)',
        'CREATE INDEX IF NOT EXISTS idx_debt_payments_debt ON debt_payments(debt_id, paid_on)',
    ].forEach(statement => db.run(statement));
    migrateCryptoTransfers();

    // A fresh database (for example a new clone) starts from the committed snapshot, if any.
    if (!existed && dbPath && config.database.autoRestore) {
        const snapshotPath = path.resolve(config.paths.root, config.database.snapshotPath);
        if (fs.existsSync(snapshotPath)) {
            require('./services/snapshot').importSnapshot(db, fs.readFileSync(snapshotPath, 'utf8'));
            console.log(`[Database] Restored data from ${path.relative(config.paths.root, snapshotPath)}.`);
        }
    }

    // Rows left pointing at deleted parents by older versions, which saved the database
    // in a way that silently switched foreign-key enforcement off.
    const repaired = repairForeignKeys();
    if (repaired) console.log(`[Database] Repaired ${repaired} record(s) left behind by deleted profiles or accounts.`);

    // One-time data migrations that need the full schema (lazy require avoids a cycle).
    const cleanup = require('./services/data-cleanup').run();
    if (cleanup && !cleanup.skipped && (cleanup.community || cleanup.guests || cleanup.sampleTransactions || cleanup.autoCards || cleanup.portfolios)) {
        console.log('[Database] Removed pre-filled demo data:', JSON.stringify(cleanup));
    }

    // Writes are saved right after they happen; this also catches any that weren't.
    saveTimer = setInterval(() => saveToDisk(), 5000);
    saveTimer.unref();
    saveToDisk({ force: true });

    return db;
}

const rows = sql => { const result = db.exec(sql); return result.length ? result[0].values : []; };

/**
 * Fixes rows whose parent no longer exists: optional links (SET NULL, or a nullable
 * NO ACTION reference such as "paid from account") are cleared, and rows that can't
 * exist without their parent are deleted. Runs in passes because removing an
 * orphaned account orphans its own children. Returns the number of rows fixed.
 */
function repairForeignKeys() {
    let fixed = 0;
    db.run('PRAGMA foreign_keys = OFF');
    try {
        for (let pass = 0; pass < 10; pass += 1) {
            const violations = rows('PRAGMA foreign_key_check');
            if (!violations.length) break;
            db.run('BEGIN');
            try {
                for (const [table, rowid, , fkid] of violations) {
                    if (rowid === null) continue;
                    const fk = rows(`PRAGMA foreign_key_list("${table}")`).find(row => row[0] === fkid);
                    const column = fk[3];
                    const nullable = rows(`PRAGMA table_info("${table}")`).find(col => col[1] === column)[3] === 0;
                    if (fk[6] === 'SET NULL' || (nullable && fk[6] === 'NO ACTION')) db.run(`UPDATE "${table}" SET "${column}" = NULL WHERE rowid = ?`, [rowid]);
                    else db.run(`DELETE FROM "${table}" WHERE rowid = ?`, [rowid]);
                    fixed += 1;
                }
                db.run('COMMIT');
            } catch (error) {
                db.run('ROLLBACK');
                throw error;
            }
        }
    } finally {
        db.run('PRAGMA foreign_keys = ON');
    }
    return fixed;
}

/**
 * The first demo wallet only allowed BTC and ETH sends. Rebuild the table once so
 * every supported demo crypto asset can move between Willow profiles; the
 * application validates symbols against the market universe.
 */
function migrateCryptoTransfers() {
    const stmt = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'demo_crypto_transfers'");
    const definition = stmt.step() ? stmt.get()[0] : '';
    stmt.free();
    if (!/symbol IN \('BTC', 'ETH'\)/.test(definition || '')) return;
    db.run('PRAGMA foreign_keys = OFF');
    try {
        db.run('BEGIN');
        db.run(`CREATE TABLE demo_crypto_transfers_v2 (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            reference TEXT NOT NULL UNIQUE,
            sender_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            recipient_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            symbol TEXT NOT NULL CHECK(length(symbol) BETWEEN 2 AND 10),
            quantity REAL NOT NULL CHECK(quantity > 0),
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            CHECK(sender_user_id != recipient_user_id)
        )`);
        db.run('INSERT INTO demo_crypto_transfers_v2 SELECT id, reference, sender_user_id, recipient_user_id, symbol, quantity, created_at FROM demo_crypto_transfers');
        db.run('DROP TABLE demo_crypto_transfers');
        db.run('ALTER TABLE demo_crypto_transfers_v2 RENAME TO demo_crypto_transfers');
        db.run('CREATE INDEX IF NOT EXISTS idx_demo_crypto_transfers_sender ON demo_crypto_transfers(sender_user_id, created_at)');
        db.run('CREATE INDEX IF NOT EXISTS idx_demo_crypto_transfers_recipient ON demo_crypto_transfers(recipient_user_id, created_at)');
        db.run('COMMIT');
    } catch (error) {
        db.run('ROLLBACK');
        throw error;
    } finally {
        db.run('PRAGMA foreign_keys = ON');
    }
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

/** Rows changed since the database was last written (export() reopens the connection, resetting the count). */
function unsavedChanges() {
    return rows('SELECT total_changes()')[0][0];
}

/** Replaces `target` with `source`, retrying briefly when Windows (often antivirus) holds the file. */
function replaceFile(source, target) {
    for (let attempt = 0; ; attempt += 1) {
        try {
            fs.renameSync(source, target);
            return;
        } catch (error) {
            if (!['EPERM', 'EBUSY', 'EACCES'].includes(error.code) || attempt >= 5) throw error;
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 40 * (attempt + 1));
        }
    }
}

function saveToDisk({ force = false } = {}) {
    if (!db || !dbPath) return;
    if (!force && unsavedChanges() === 0) return;
    try {
        const data = db.export();
        // export() reopens the database, which resets every PRAGMA to its default.
        db.run('PRAGMA foreign_keys = ON');
        const tmpPath = dbPath + '.tmp';
        fs.writeFileSync(tmpPath, Buffer.from(data));
        replaceFile(tmpPath, dbPath);
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
        saveToDisk({ force: true });
        db.close();
        db = null;
    }
}

/** The underlying sql.js database, for snapshot tooling. */
function getSqlDatabase() {
    if (!db) throw new Error('Database not initialized. Call initializeDatabase() first.');
    return db;
}

module.exports = { getDb, getSqlDatabase, initializeDatabase, closeDatabase, repairForeignKeys };
