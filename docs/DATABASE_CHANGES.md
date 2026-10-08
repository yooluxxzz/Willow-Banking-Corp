# Database changes and recovery

The application uses sql.js with its schema and startup migrations in `src/database.js`. Existing databases are loaded and migrated in place. This work does not recreate user accounts or modify their balances.

## 2026-10-07: audit integrity and assistant fixes

- Added `idempotent_requests`, keyed by user/operation/request key, with canonical hash, response status/JSON and creation time. Its user foreign key cascades on deletion. Retries replay stored receipts; unresolved reservations require review.
- Added nullable `users.last_active_at` for meaningful signed-in activity, throttled to one update per five minutes. Guest retention uses it with audit activity.
- Added `user_preferences.assistant_revision INTEGER NOT NULL DEFAULT 0`. Autonomy changes advance it and invalidate earlier AI approvals.
- Status changes, MFA reconfiguration and authenticator key rotation advance `auth_version`. Pending MFA and AI approvals bind to the original version. Registration sessions carry it too.
- Removed the global legacy investing/crypto deletion and portfolio reset. Ambiguous positions are preserved; explicit sample cleanup remains. Already deleted data cannot be recovered by this code.
- SQL exports are private, ignored backups. Earlier “Snapshot in Git” guidance below is superseded. See [audit fixes](AUDIT_FIXES.md) for rotation, storage limits and checks.

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
- New demo portfolios start with 10,000,000 cents ($100,000) of simulated investment cash *(superseded on 2026-10-03: investing cash starts at $0 and is funded from the customer's own accounts)*. Trades use server-retrieved prices, validate buy/sell quantities and available demo cash, and update only demo portfolio tables. Holdings record weighted-average acquisition price.
- A server-side allowlisted Yahoo Finance chart adapter retrieves price/history/available quote statistics and indicative FX pairs, caches each symbol/range for five minutes, and marks fallback quotes stale after refresh errors. Stale quotes are visible but cannot be used to place simulated orders. No broker or money-transfer provider is integrated.
- The Hub reads completed, owner-scoped ledger records. Spending summaries and expense rankings exclude transfers; portfolio amounts are at cost basis, not live market valuation. Debt, external accounts, scheduled payments, saved goals, FX execution, crypto send/receive and business team/invoice features are unavailable and are not represented as connected services.
- This Node application has no Python/yfinance runtime. The Yahoo chart endpoint is a prototype market-data source, not a guaranteed or production-grade feed. No existing banking balances or records are backfilled or changed by this feature.

## 2026-10-02: simulated Wealth workspace

- Startup creates `demo_portfolios`, `demo_holdings`, `demo_watchlist`, and `demo_trades`. These user-owned tables cascade on user deletion and remain separate from `accounts`, `transactions`, and the banking ledger.
- New demo portfolios start with 10,000,000 cents ($100,000) of simulated investment cash *(superseded on 2026-10-03, as above)*. Trade records contain a server-retrieved market price, quantity, side and total. Holdings use weighted-average acquisition price; sells cannot exceed owned demo units. Trade writes update only demo portfolio tables.
- The market adapter retrieves a fixed allowlist of symbols from Yahoo Finance chart endpoints on the server, caches each supported historical range for five minutes, and marks expired cached data stale after refresh failures. Simulated orders reject stale data. This is a prototyping data source, not an execution service; this Node project has no Python/yfinance runtime, and no real orders are placed.
- No existing account balance, banking transaction, or user record is backfilled or altered by the feature. The Hub reads completed owner-scoped ledger rows; spending totals and expense rankings exclude transfers. Investment summaries use recorded cost basis, not live valuation. Credit/debt, external accounts and scheduled payments are explicitly unavailable.

## 2026-10-02: personal planning goals

- Startup creates `demo_goals(id, user_id, name, category, target_cents, current_cents, created_at, updated_at)`. Rows are owned by a single user, cascade on account deletion, restrict categories and enforce positive targets with progress between zero and the target.
- Goal targets are planning values, while progress is sourced from the linked personal USD account’s available balance. Creating or updating a goal does not move money; funding happens through normal account transfers. The Hub shows the same account-backed progress.

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
  - `user_preferences` — alert switches, `privacy_hide_balances`, `privacy_personalized_insights`, large-transaction threshold and `sample_data_loaded_at` (makes sample activity idempotent). *(Since 2026-10-03 the threshold, sample-data and hide-balances columns are no longer used; they stay so older databases keep working.)*
  - `two_factor` — TOTP secret encrypted with AES-256-GCM (key from `TWO_FACTOR_KEY` or the session secret), `enabled_at` and `last_used_step` to reject code reuse.
  - `business_profiles`, `business_invoices` (`open` | `paid` | `void`, paid account and transaction reference), `business_team_members` (`admin` | `approver` | `cardholder` | `viewer`; invitations only, no access granted).
  - `loan_estimates` — saved calculator results (estimates only).
  - `support_requests` — Help center messages with a `WLW-` reference; signed-out visitors can send them, so `user_id` is optional (`ON DELETE SET NULL`). Stored, never sent anywhere.
- **New columns:** `users.country`, `users.is_guest` (guest demo profiles; cleared when a guest adds their own email and password); `cards.form` (`physical` | `virtual`), `nickname`, `design`, `holder_name`, `online_enabled`, `contactless_enabled`, `atm_enabled`, `international_enabled`, `notifications_enabled` (existing cards default to physical with every control on); `transactions.category`, `counterparty`, `card_id` (nullable; older rows are categorised by description at read time).
- **Indexes:** payees, invoices, team, loan estimates, support requests, crypto-transfer sender/recipient and `transactions(account_id, created_at)`.
- **`demo_crypto_transfers`:** the symbol check now allows the supported crypto list (`length(symbol) BETWEEN 2 AND 10`, validated in code) instead of BTC/ETH only. Older databases are rebuilt once inside a transaction, copying every row.
- **Sessions:** session JSON now carries `lastSeenAt`. Requests after `SESSION_IDLE_MINUTES` (default 30) of inactivity end the session; background requests marked `X-Willow-Passive` don’t count as activity. No table change.
- **Ledger semantics:** currency conversions write a debit/credit pair (`CNV-…` / `CNV-…-C`) in each account’s own currency at an indicative rate, blocked when rates are stale or unavailable. Invoice “mark paid” writes one credit (`INV-PAY-…`). Simulated portfolio, watchlist and trades remain in the separate `demo_*` tables.
- **Sample data:** `src/services/demo-data.js` created five `@community.willow.test` customers on startup and, on request, months of consistent sample activity per profile. `npm run seed` used the same generator. *(Removed on 2026-10-03 — see below.)*
- This session ran the app only against scratch databases outside the repository; no local `data/` database was migrated or backed up. Databases, session stores and backups remain ignored by Git.

## 2026-10-02: guest profile clean-up

No table or column changes. `purgeStaleGuests` (now in `src/services/guests.js`) runs at startup and then hourly when `GUEST_RETENTION_DAYS` is above 0 (the default is 7).

**Which profiles are removed.** A profile qualifies when all of these hold:
- `is_guest = 1` and `role = 'customer'`;
- it was created before the cutoff;
- its newest `audit_logs` entry is also older than the cutoff.

Profiles whose owners saved their own email and password have `is_guest = 0` and are never touched.

**How each profile is removed.** One transaction per profile:
1. Null `transactions.related_account_id` on other customers’ rows that point at the guest’s accounts. Those rows and their balances are kept.
2. Null `business_invoices.paid_account_id` on other customers’ invoices that point at the guest’s accounts.
3. Delete `scheduled_transfers` to or from the guest’s accounts.
4. Delete the guest’s own `transactions`.
5. Delete the `users` row. This cascades to:
   - the guest’s accounts, cards, payees, preferences, notifications, goals, two-factor settings, business records and `demo_*` portfolio, watchlist and trade rows;
   - rows that name the guest on other customers’ profiles: saved-payee entries and internal `demo_crypto_transfers` records.

   `support_requests.user_id` is set to NULL.

Each removal writes a `guest_profile_purged` audit event with the actor `system`. Other customers’ `transactions` rows and balances are never deleted or re-balanced.

## 2026-10-03: real data only, budgets, debts, net worth and snapshots

All changes are applied in place at startup by `src/database.js`. Nothing invents data any more: sign-up and guest profiles create a single $0 checking account, no card, no savings account and no investing cash. `src/seed.js`, `src/services/demo-data.js` and the `/demo` sample-activity route are deleted.

- **New tables** (user-owned, `ON DELETE CASCADE`):
  - `app_meta(key, value)` — records one-time migrations (not user-owned).
  - `portfolio_transfers` — investing cash moved in (`in`) or out (`out`) from a US dollar account, with the matching ledger reference (`INV-IN-…` / `INV-OUT-…`, category `investing`). Every move debits or credits the account in the same transaction.
  - `budgets` — `scope` (`personal` | `business`), name, optional category, `period` (`daily` | `weekly` | `monthly`), `limit_cents`, `status` (`active` | `archived`).
  - `budget_checks` — one row per budget per local day (`UNIQUE(budget_id, day)`): period start, spent, limit, `status` (`under` | `near` | `over`) and `notified` (`''` | `near` | `over`, so each level is notified once per period).
  - `business_expenses` — date, vendor, category, amount, note; optionally paid from an account, in which case the debit’s reference (`EXP-…`, category `business`) is stored in `transaction_reference`. Deleting a paid expense refunds the account with a ledger credit.
  - `assets` — what a customer owns outside Willow (`cash`, `property`, `vehicle`, `investment`, `retirement`, `business`, `other`) with its current value.
  - `debts` and `debt_payments` — balance, original amount, APR (basis points), minimum, due day, status (`open` | `paid_off`); payments optionally debit a Willow account (`DBT-…`, category `debt`).
  - `net_worth_snapshots` — one row per customer per local day (accounts, investing, assets, debts, net). Written nightly and whenever assets or debts change.
- **Indexes:** `portfolio_transfers(user_id, created_at)`, `budgets(user_id, scope, status)`, `budget_checks(user_id, day)`, `business_expenses(user_id, spent_on)`, `assets(user_id)`, `debts(user_id, status)`, `debt_payments(debt_id, paid_on)`.
- **Changed defaults:** `demo_portfolios.cash_cents` defaults to 0 (new portfolios are created with 0 explicitly, so older databases behave the same). Withdrawals may carry a spending `category` so they count against the right budget.
- **One-time clean-up** (`src/services/data-cleanup.js`, key `fabricated_data_removed_v1` in `app_meta`, audit event `fabricated_data_removed` with counts), in one transaction:
  1. removes the `@community.willow.test` customers and every guest profile (they were created with sample data) with `removeUserRecords`, which keeps other customers’ ledger rows and clears links to the removed accounts;
  2. deletes sample ledger rows (references `DEP|WDR|TRF|PAY-S…`) and reverses their net effect on each account’s balance, floored at zero;
  3. deletes the other records the sample loader created, matched on their exact values (goals, the monthly savings schedule, the studio business profile, invoices and team, sample cards that were never used, watchlist entries, empty unused sample accounts) and the welcome notifications;
  4. deletes debit cards issued automatically at sign-up that were never used;
  5. resets investing: holdings, trades and internal crypto transfers bought with the old $100,000 practice cash are deleted and every portfolio’s cash is set to 0.

  On this session’s scratch preview database it removed 5 community customers, 14 guest profiles, 113 sample transactions, 11 other sample records, 1 automatic card and reset 1 portfolio. Customers’ own deposits, payments and accounts were kept.
- **Nightly job:** `src/services/jobs.js` (started by `server.js`) runs budget checks and net-worth snapshots at start-up (catching up on up to 31 missed days, notifying only for the latest) and then every night at `NIGHTLY_CHECK_TIME` (default 23:55 local time).
- **Snapshot in Git:** `src/services/snapshot.js` exports the whole database as deterministic SQL (schema, then rows in rowid order; `revoked_sessions` is skipped because those rows only matter to the live session store). `npm run db:save` writes `data/willow-snapshot.sql`; `npm run db:restore -- --force` replaces the database file and keeps the old one as `willow.db.bak-<timestamp>`. When no database file exists, start-up restores the snapshot before migrating (`SNAPSHOT_AUTO_RESTORE=false` disables this). `.gitignore` ignores `data/*` except the snapshot, plus `*.bak-*` and `*.tmp`. The snapshot holds password hashes and recovery-code digests, so the repository must stay private.
- **Backups:** this session ran the app only against a scratch database outside the repository that held test data, so no backup was taken. Before upgrading a database you care about, stop Willow and copy it (or run `npm run db:save`) first. Tests use in-memory or temporary databases only.

## 2026-10-03: integrity repair, budget alerts switch and storage tidy-up

Applied in place at start-up by `src/database.js`; nothing is rewritten except the repair below.

- **New column:** `user_preferences.alert_budgets INTEGER NOT NULL DEFAULT 1` — the *Budgets* switch in Settings → Alerts. Existing profiles get it switched on. The alert switches are now enforced: a notification whose type is switched off is not created (`deposit`/`withdrawal`/`transfer` → `alert_transactions`, `card` → `alert_cards`, `budget` → `alert_budgets`, `security` → `alert_security`).
- **Foreign keys were not being enforced after saves.** sql.js reopens the database when it exports it, which resets `PRAGMA foreign_keys` to off, so deleting a profile or account could leave rows pointing at nothing. Enforcement is now switched back on after every export, and a one-pass repair (`repairForeignKeys`) runs at every start-up: it checks `PRAGMA foreign_key_check` and, inside a transaction, clears links that may be empty (`ON DELETE SET NULL`, or a nullable column) and deletes rows that can't exist without their parent. It logs how many records it repaired; `tests/database-integrity.test.js` covers a deliberately damaged database.
- **Saves:** the database file is only rewritten when something changed (`total_changes()`), and is replaced atomically, retrying briefly if Windows reports the file busy.
- **Sessions** are stored in `sessions.db` next to the database (`DATABASE_PATH`) instead of always in `./data`, so a second database never shares sign-ins with the first. For the default setup the location is unchanged (`data/sessions.db`).
- **Ledger references** now use 10 random hex digits (`TRF-3F9A1C0B7E`) instead of 8, generated in one place (`src/services/ids.js`). Prefixes are unchanged and still meaningful (see `src/services/spending.js`); existing references are kept.
- **Hide balances** is a per-device setting (the eye icon), so the unused `privacy_hide_balances` field was removed from the preferences API; the column stays.
- **Backups:** this session ran Willow only against scratch databases outside the repository, so no backup was taken. Before upgrading a database you care about, stop Willow and copy it, or run `npm run db:save`.

## 2026-10-04: sample profile flag and saved market prices

Applied in place at start-up by `src/database.js`.

- **New column:** `users.is_sample INTEGER NOT NULL DEFAULT 0`. Existing customers keep 0. It is set to 1 only for a profile created with **Explore a sample profile** (`POST /auth/sample`), and makes every signed-in page show a "sample profile" banner.
- **Sample profile contents** (`src/services/sample-profile.js`): a guest profile (`is_guest = 1`) whose example activity is generated from a seeded random generator, so it is reproducible per profile. Every balance change is an ordinary ledger row written through the same rules as customer activity (no rows dated in the future, no negative balances): 120 days of salary, rent, bills, everyday spending and a monthly savings transfer; two debts with payments (`DBT-…`); client payments and paid business expenses (`EXP-…`); investing cash moved from checking (`INV-IN-…`) and three holdings bought at the current live or saved price. It also adds assets, budgets (with their daily `budget_checks` for the last 30 days), goals, scheduled transfers, cards and daily `net_worth_snapshots`. Nothing is added to any other profile.
- **Removal:** sample profiles are guests, so the existing guest clean-up deletes them after `GUEST_RETENTION_DAYS` without use (with a `guest_profile_purged` audit event), and their owner can keep one by adding an email and password like any guest.
- **Saved market prices** are a JSON file in the source tree (`src/content/market-snapshot.json`, refreshed by `npm run prices:save` or the *Refresh saved market prices* workflow), not database rows. Simulated orders and conversions at a saved or cached price are stored exactly like others; only their receipt and description say which price was used.
- **Backups:** this session ran Willow only against scratch databases outside the repository, so no backup was taken. Before upgrading a database you care about, stop Willow and copy it, or run `npm run db:save`.
