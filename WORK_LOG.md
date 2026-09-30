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
