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

## Recovery delivery and backups

No email delivery service is configured. Recovery therefore requires a code saved before losing account access. There is no public reset-link shortcut. If all codes are lost and the password is forgotten, self-service recovery is unavailable.

Before modifying a live database, stop the server and copy it to a private backup location. The local preview was backed up as `data/preview.before-recovery.db` before this migration. Database files and backups remain ignored; commit schema/migration code and tests, not account or session data.
