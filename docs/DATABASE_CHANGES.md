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

## 2026-10-02: personal planning goals

- Startup creates `demo_goals(id, user_id, name, category, target_cents, current_cents, created_at, updated_at)`. Rows are owned by a single user, cascade on account deletion, restrict categories and enforce positive targets with progress between zero and the target.
- Goal amounts are self-reported planning values only. Creating or updating a goal does not move money or modify account balances, savings balances, or ledger transactions. The Hub shows these saved goals with the same planning-only disclosure.

## 2026-10-02: scheduled demo transfers

- Startup creates `scheduled_transfers`, storing owner ID, source/destination account IDs, amount in cents, description, UTC execution date, status and resulting ledger reference. It is separate from posted transactions until execution.
- Scheduling is limited to a single future transfer between two active USD accounts owned by the same customer, no more than one year ahead and within the per-transfer demo limit. Creating/cancelling a schedule does not change account balances. Customers can cancel only while the due time has not arrived.
- The server checks due records every minute. Each settlement runs in a database transaction, rechecks ownership/status/funds/account state/daily transfer limit, debits and credits the paired accounts, writes both ledger entries, updates schedule status and audit event. Reprocessing cannot replay completed or cancelled rows. Insufficient funds/inactive accounts mark the schedule failed without posting a debit.
- This is a one-time internal demo transfer, not external bill pay, a recurring payment mandate, or a real-money instruction. Dates are interpreted in UTC.

## 2026-10-02: internal demo crypto wallet

- Startup creates `demo_crypto_transfers` with sender/recipient profile IDs, BTC/ETH symbol, quantity, reference and timestamp. It records internal simulated wallet movements only; there are no public wallet addresses, private keys, network fees, blockchain transactions or withdrawals.
- A send atomically reduces the sender’s existing simulated holding, adds units to an active recipient’s holding with weighted-average cost basis, writes an internal transfer record and audit event. The amount is normalized to eight decimal places. Bank balances, simulated cash and the banking transaction ledger remain unchanged.

## Recovery delivery and backups

No email delivery service is configured. Recovery therefore requires a code saved before losing account access. There is no public reset-link shortcut. If all codes are lost and the password is forgotten, self-service recovery is unavailable.

Before modifying a live database, stop the server and copy it to a private backup location. The local preview was backed up as `data/preview.before-recovery.db` before this migration. Database files and backups remain ignored; commit schema/migration code and tests, not account or session data.

## 2026-10-02: complete platform upgrade

All changes are additive and applied in place at startup by `src/database.js`. Existing users, accounts, balances and ledger rows are not rewritten.

- **New tables** (user-owned with `ON DELETE CASCADE`, except where noted):
  - `payees` — saved recipients (`recipient_user_id`, optional `nickname`, `last_paid_at`); unique per owner and recipient.
  - `user_preferences` — alert switches, `privacy_hide_balances`, `privacy_personalized_insights`, large-transaction threshold and `sample_data_loaded_at` (makes sample activity idempotent).
  - `two_factor` — TOTP secret encrypted with AES-256-GCM (key from `TWO_FACTOR_KEY` or the session secret), `enabled_at` and `last_used_step` to reject code reuse.
  - `business_profiles`, `business_invoices` (`open` | `paid` | `void`, paid account and transaction reference), `business_team_members` (`admin` | `approver` | `cardholder` | `viewer`; invitations only, no access granted).
  - `loan_estimates` — saved calculator results (estimates only).
  - `support_requests` — Help center messages with a `WLW-` reference; signed-out visitors can send them, so `user_id` is optional (`ON DELETE SET NULL`). Stored, never sent anywhere.
- **New columns:** `users.country`, `users.is_guest` (guest demo profiles; cleared when a guest adds their own email and password); `cards.form` (`physical` | `virtual`), `nickname`, `design`, `holder_name`, `online_enabled`, `contactless_enabled`, `atm_enabled`, `international_enabled`, `notifications_enabled` (existing cards default to physical with every control on); `transactions.category`, `counterparty`, `card_id` (nullable; older rows are categorised by description at read time).
- **Indexes:** payees, invoices, team, loan estimates, support requests, crypto-transfer sender/recipient and `transactions(account_id, created_at)`.
- **`demo_crypto_transfers`:** the symbol check now allows the supported crypto list (`length(symbol) BETWEEN 2 AND 10`, validated in code) instead of BTC/ETH only. Older databases are rebuilt once inside a transaction, copying every row.
- **Sessions:** session JSON now carries `lastSeenAt`. Requests after `SESSION_IDLE_MINUTES` (default 30) of inactivity end the session; background requests marked `X-Willow-Passive` don’t count as activity. No table change.
- **Ledger semantics:** currency conversions write a debit/credit pair (`CNV-…` / `CNV-…-C`) in each account’s own currency at an indicative rate, blocked when rates are stale or unavailable. Invoice “mark paid” writes one credit (`INV-PAY-…`). Simulated portfolio, watchlist and trades remain in the separate `demo_*` tables.
- **Sample data:** `src/services/demo-data.js` creates five `@community.willow.test` customers on startup and, on request, months of consistent sample activity per profile. `npm run seed` uses the same generator.
- This session ran the app only against scratch databases outside the repository; no local `data/` database was migrated or backed up. Databases, session stores and backups remain ignored by Git.
