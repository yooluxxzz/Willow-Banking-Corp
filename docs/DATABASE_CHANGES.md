# Database changes and recovery

The application uses sql.js with its schema and startup migrations in `src/database.js`. Existing databases are loaded and migrated in place. This work does not recreate user accounts or modify their balances.

## 2026-09-30: account recovery

- `users.auth_version INTEGER NOT NULL DEFAULT 0` is added on startup. Existing sessions without a version are treated as version zero. Signing in records the current version. Password recovery increments it, invalidating every old session. Password changes and “sign out other sessions” increment it and retain the new version only for the initiating session.
- `recovery_codes` stores `user_id`, unique `code_hash`, and `created_at`, with a foreign key to users and a composite primary key. Eight independent 128-bit random codes are generated only after checking the current password. Only SHA-256 digests are stored; plaintext is returned once for saving by the owner.
- Code rotation replaces the previous set in a transaction. Recovery atomically consumes one matching code, changes the password hash and advances the authentication version. Concurrent attempts cannot reuse a code. Disabled users cannot recover access through this flow.
- Audit events record code generation, password recovery and session revocation without passwords or recovery codes. Successful sign-in auditing continues to use the existing audit log.
- Revoked session rows may remain in `data/sessions.db` until store cleanup. Requests reject the old version, and session listings exclude revoked versions.

## 2026-10-01: account names

- Startup adds `accounts.nickname TEXT NOT NULL DEFAULT ''`. Existing accounts use their checking/savings default display name until the owner saves a nickname.
- Nickname changes are validated, ownership checked and committed with an `account_renamed` audit event. Account numbers, balances and ledger entries are unchanged.
- Transaction ordering now uses timestamp and ID together so records with the same timestamp paginate consistently.
- The preview database was backed up privately as `data/preview.before-account-names.db` before startup migration. Automated account tests use only an in-memory database.

## 2026-10-01: individual session controls

- Startup creates `revoked_sessions(session_hash, user_id, revoked_at)`. The primary key is the SHA-256 digest of a high-entropy session ID, not the credential itself. Rows are owned by a user with cascading deletion and retained to reject replay; there is no automatic pruning policy.
- Individual revocation checks ownership and CSRF, records a hash and audit event atomically, then removes the session-store row. Authentication and session listing reject revoked hashes even if a stale request restores a row. Already executing requests are not cancelled.
- Newly authenticated sessions store browser user-agent (capped at 300 characters) and UTC sign-in time in the existing session JSON. Older sessions remain usable with an explicit missing-details label. No existing balances or accounts change.
- Preview data was backed up as `data/preview.before-session-controls.db` before restarting for migration. Session data, revocation records and backups remain excluded from Git; schema and tests are versioned.

## 2026-10-01: optional account opening

- Startup adds `accounts.purpose` (`personal` by default, or `business`) and nullable `accounts.opening_key`. A unique index on `(user_id, opening_key)` supports per-user request retry protection. Existing accounts retain their numbers, balances and personal classification.
- Business checking uses `account_type = 'checking'` with `purpose = 'business'`, preserving the existing ledger and foreign keys. It is a single-owner demo account, not a real business bank account. Checking/savings remain personal.
- Each opening writes a zero-balance account and an `account_opened` audit event in one transaction. Repeated identical requests return the existing account; mismatched reuses are rejected. The form key is omitted from formatted account responses.
- Up to ten accounts are allowed per profile. No extra card or initial ledger credit is created, and no savings interest is accrued. The preview was backed up privately to `data/preview.before-optional-accounts.db` before migration and restarted successfully.

## 2026-10-02: demo Wealth and financial Hub

- Startup creates `demo_portfolios`, `demo_holdings`, `demo_watchlist`, and `demo_trades`. These tables are user-owned and cascade on user deletion; they are separate from `accounts`, `transactions`, and the banking ledger.
- New demo portfolios start with 10,000,000 cents ($100,000) of simulated investment cash. Trades use server-retrieved prices, validate buy/sell quantities and available demo cash, and update only demo portfolio tables. Holdings record weighted-average acquisition price.
- A server-side allowlisted Yahoo Finance chart adapter retrieves price/history/available quote statistics and indicative FX pairs, caches each symbol/range for five minutes, and marks fallback quotes stale after refresh errors. Stale quotes are visible but cannot be used to place simulated orders. No broker or money-transfer provider is integrated.
- The Hub reads completed, owner-scoped ledger records. Spending summaries and expense rankings exclude transfers; portfolio amounts are at cost basis, not live market valuation. Debt, external accounts, scheduled payments, saved goals, FX execution, crypto send/receive and business team/invoice features are unavailable and are not represented as connected services.
- This Node application has no Python/yfinance runtime. The Yahoo chart endpoint is a prototype market-data source, not a guaranteed or production-grade feed. No existing banking balances or records are backfilled or changed by this feature.

## 2026-10-02: simulated Wealth workspace

- Startup creates `demo_portfolios`, `demo_holdings`, `demo_watchlist`, and `demo_trades`. These user-owned tables cascade on user deletion and remain separate from `accounts`, `transactions`, and the banking ledger.
- New demo portfolios start with 10,000,000 cents ($100,000) of simulated investment cash. Trade records contain a server-retrieved market price, quantity, side and total. Holdings use weighted-average acquisition price; sells cannot exceed owned demo units. Trade writes update only demo portfolio tables.
- The market adapter retrieves a fixed allowlist of symbols from Yahoo Finance chart endpoints on the server, caches each supported historical range for five minutes, and marks expired cached data stale after refresh failures. Simulated orders reject stale data. This is a prototyping data source, not an execution service; this Node project has no Python/yfinance runtime, and no real orders are placed.
- No existing account balance, banking transaction, or user record is backfilled or altered by the feature. The Hub reads completed owner-scoped ledger rows; spending totals and expense rankings exclude transfers. Investment summaries use recorded cost basis, not live valuation. Credit/debt, external accounts and scheduled payments are explicitly unavailable.

## Recovery delivery and backups

No email delivery service is configured. Recovery therefore requires a code saved before losing account access. There is no public reset-link shortcut. If all codes are lost and the password is forgotten, self-service recovery is unavailable.

Before modifying a live database, stop the server and copy it to a private backup location. The local preview was backed up as `data/preview.before-recovery.db` before this migration. Database files and backups remain ignored; commit schema/migration code and tests, not account or session data.
