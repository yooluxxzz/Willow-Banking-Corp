# Development work log

Each completed work session is recorded here and committed locally. Git history is the authoritative record of code and database schema changes. Live account/session data and secrets are excluded.

## Earlier design sessions — 2026-09-30

- `f399ce6`: Willow photography, authentication design and demo transfer flows.
- `bab424d`: static two-photo hero composition.
- `a8aca4b`: aligned image crossfade and controls.
- `a492b22`: scroll-triggered crossfade.
- `583bd63`: pinned two-scene hero with separate changing HTML content and release into page categories.

## Password recovery and account settings — 2026-09-30

- Added one-time backup recovery codes with authenticated generation, download/hide controls, hashed storage, replacement of old code sets and atomic single-use password reset.
- Password recovery signs out all existing sessions. Password changes and an explicit settings action sign out other sessions while retaining the current one.
- Added session version validation, registration session regeneration, explicit session-save failures and sign-in feedback after recovery/session expiry.
- Rebuilt account settings into profile, password, recovery and session sections. Name/phone validation runs on the server. Saved phone values now load correctly. Inactive/removed account sessions are rejected.
- Added database schema/migration documentation and this work-log policy. Preview data backed up locally before migration. No balances or real financial operations changed.
- Validation: integration coverage for code generation/rotation/replay, concurrent reset, authentication/CSRF, rate limits, cross-user isolation, session revocation, profile persistence and malformed fields; UI review of recovery and settings using a synthetic demo account. All 55 tests pass, including registration session rotation. All 35 EJS templates compile; JavaScript syntax and whitespace checks pass. The synthetic profile update survived server restart.
- Limitation: email recovery requires a separate delivery integration; this version uses backup codes saved in advance.

## Account details and activity — 2026-10-01

- Added account detail pages with available/current balances, account-number disclosure and the five latest transactions. Account cards and dashboard names now link to their detail pages.
- Added owner-only account nicknames, saved with an audit event and reflected in dashboard and payment/activity selectors. Blank names restore defaults; invalid names, non-owned IDs and missing CSRF are rejected.
- Added the startup `accounts.nickname` migration without modifying balances or account numbers. Preview database backed up privately before migration; live databases and backups remain ignored.
- Rebuilt activity filtering with explicit Apply/Clear controls, account-specific links, URL-preserved filters, date validation, request cancellation, safe text rendering and stable pagination for matching timestamps.
- Validation: all 63 tests across 20 suites pass, including eight new account/transaction tests. All 36 EJS templates compile, all 44 JavaScript files pass syntax checks, and `git diff --check` passes. No live database or environment files are tracked.
- Browser verification limitation: the browser security policy blocked the preview tab action. This session's new pages were verified through integration rendering and API tests; no new visual verification is claimed.
- User explicitly requested commit and sync on completion. This session is committed on `codex/willow-experience` for synchronization to the existing GitHub repository; Git records the exact commit and remote tracking state.

## Session controls and completed trust disclosures — 2026-10-01

- Rebuilt the Security page around recognizable signed-in sessions, a current-session label, approximate browser/device names, UTC sign-in times and recent sign-ins. Replaced the misleading “Online” label and added explicit unavailable/legacy states.
- Added owner-only, CSRF-protected individual sign-out. Raw session IDs stay server-side. A durable hashed revocation record prevents a stale session-store write from restoring access; the current session and unrelated users remain signed in.
- Added the `revoked_sessions` table and new-session metadata. Preview data was privately backed up and the local server restarted successfully. Live session/account databases, backup files and secrets remain ignored.
- Filled all four homepage trust placeholders with factual demo disclosures and useful links. Updated the linked privacy, compliance and public security pages to remove unsupported insurance, regulatory and audit claims and explain stored data, third-party resources, available controls and simulated funds.
- Validation: all 68 tests across 21 suites pass, including five new session tests covering ownership, CSRF, isolation, replay after stale store restoration, current-session protection, legacy metadata and store errors. All 36 EJS templates compile, all 48 JavaScript files pass syntax checks, and patch whitespace checks pass. Public privacy/compliance pages render in integration tests.
- Visual limitation: the browser action was previously blocked by browser security policy, so this session does not claim a fresh browser/screenshot review. The local preview server is running with these changes.
- Commit and sync continue under the user's explicit instruction to commit and synchronize completed work. No merge into main or deployment is included.
