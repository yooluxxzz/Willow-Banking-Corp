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

## Sign-in navigation and reliable sign-out — 2026-10-01

- Protected page links now preserve their destination and filters through sign-in, including after session revocation. Known internal page destinations are validated on both rendering and submission; external URLs, malformed routes and customer redirects to admin are rejected. Ownership remains enforced at the destination. No state-changing action is replayed.
- Authentication failures from API routes consistently return JSON, even without an Accept header. Login responses handle connection and invalid-response failures clearly; the login page is not cached.
- Sign-out checks server success before navigating, reports store/network failures and permits retries. Repeated clicks share one pending operation, cookies are cleared after successful destruction, and the login page shows confirmation. Error toasts now render messages as text with accessible status roles.
- Database: no schema or account-data changes this session. Existing private databases, backups and secrets remain ignored.
- Validation: 76 tests across 22 suites pass, including five navigation/server tests and three client-logic tests for failures, retries and duplicate requests. All 36 templates compile and 51 JavaScript files pass syntax checks. Patch whitespace checks pass.
- Browser visual review remains unavailable following the prior browser security-policy block; integration tests and isolated client-logic tests provide functional verification. Local preview restarted with this version. Completed changes are committed and synced under the user's standing instruction.

## Cards and statements — 2026-10-01

- User selected cards and statements as the next priority. Rebuilt Cards with linked account names, explicit demo labels and an accessible native review dialog for freeze, unfreeze, reporting and replacement.
- Card IDs are validated strictly; owner checks and CSRF remain enforced. Unfreeze/replacement require an active linked account. Replacement now cancels and creates atomically, rejects duplicate replacement of a cancelled card, and reports immediate demo creation without implying physical delivery.
- Rebuilt statement controls with labeled inputs, UTC date presets, custom ranges, account-specific links, busy/error states and PDF downloads that report failures in place. Statement preview renders descriptions as text.
- Corrected statements to include completed entries only, reconstruct opening balances from the current posted balance (retaining initial demo balances), and sort ties by ID. Server validates real dates, ordered ranges, a 366-day range cap and a 5,000-row limit.
- Reworked PDF rows to wrap long references/descriptions, repeat headers and demo disclosures, and number pages. A synthetic three-page sample was rendered and all pages visually inspected; text checks confirm all 45 sample rows, summary balance and page numbers.
- Database: no schema changes or live ledger mutations. Card and statement tests use an isolated in-memory database. Source, tests and documentation are tracked; real account/session data and backups remain ignored.
- Validation: all 85 tests across 23 suites pass, including nine new card/statement tests for ownership, CSRF, transitions, concurrent replacement, rollback, inactive accounts, completed-only balances, date validation and PDF generation. All 36 EJS templates compile, all 54 JavaScript files pass syntax checks, and patch whitespace checks pass.
- Limitation: browser layout/interaction review remains unavailable after the prior browser policy block. PDF visual review succeeded separately. Built-in PDF fonts are intended for Latin-script demo content. Local preview restarted and finished work committed/synced as requested.

## Dashboard and account overview revamp — 2026-10-01

- Rebuilt the signed-in dashboard with a prominent available-balance panel, secondary total balance, primary transfer action, everyday shortcuts, account tiles and a recent-activity list. Added direct links to notifications, security and settings.
- Redesigned the accounts overview using the same shared account tiles, with account-specific detail, activity and statement links. Names, status, balances and masked numbers are still server-rendered from the existing owned-account data.
- Added scoped forest/ivory styling, responsive single-column layouts, dark-theme colors, keyboard focus states and empty states. No fabricated charts, growth figures or new financial data were introduced. Active-account totals and simulated funds are labeled explicitly.
- Validation: all 85 tests pass; all 37 EJS templates compile; whitespace checks pass. Existing integration tests confirm dashboard/account nickname rendering and account links. No new tests were added solely for cosmetic markup. Browser visual review remains unverified following the prior security-policy block.
- No backend, schema or live-data changes. Completed source and work log committed and synced under the user's standing instruction.

## Customer-page design extension — 2026-10-01

- Extended the dashboard's forest/ivory design across account details, transfers, deposits, withdrawals, transactions, statements, cards, settings, security and notifications using scoped customer-page styles.
- Money pages now pair their existing forms with a responsive guidance panel, larger amount fields, clearer demo explanations and account/activity links. Account details receive a prominent balance panel. Other customer pages share consistent headings, cards, inputs, tables, buttons and focus treatments.
- Preserved all form identifiers, scripts, validation, confirmation controls and backend behavior. Included dark-theme styling and narrow-screen layouts without adding animation or external assets.
- Validation: all 85 tests pass; all 37 EJS templates compile; whitespace checks pass. No tests added solely for cosmetic changes. Browser visual review remains unverified after the prior browser security-policy block.
- No schema or live-data changes. Source and documentation committed and synced as requested.

## Optional checking, savings and business accounts — 2026-10-01

- Added Accounts → Open another account, with a product chooser, optional nickname, review step and explicit demo acknowledgement. Checking, savings and single-owner business checking all start at zero USD; existing accounts remain untouched. No extra card is issued automatically.
- Added authenticated, CSRF-protected account creation with product/name validation, a ten-account profile limit, unique account numbers and atomic audit logging. Per-form request keys prevent duplicate accounts after retries or concurrent clicks.
- Added account purpose and opening-key migrations with a unique per-user key index. Business checking uses the existing checking ledger, clearly labeled separately across account cards/details, transfer selectors and statements. Public business copy and links now describe the implemented demo account instead of a concept-only page.
- Existing registrations still receive their starter personal accounts. Business accounts do not implement shared ownership, company verification, payroll, lending or merchant processing; savings do not accrue interest.
- Validation: all 92 tests across 24 suites pass, including seven new tests for all products, zero balances, legacy defaults, cross-user isolation, retries/concurrency, malformed input, CSRF, audit rollback, profile limits and business transfers/statements. All 38 templates compile and all 56 scripts pass syntax checks; whitespace checks pass.
- Private preview backup created before migration; server restarted successfully. Browser interaction/layout review remains unverified after the prior browser-policy block. Live data, backups and secrets remain ignored. Completed code, schema, tests and documentation committed and synced as requested.

## Cross-browser hero scrolling - 2026-10-02

- Added `100vh` fallbacks for the pinned hero stage and its scroll travel, with `100svh` enhancements where supported. Added the prefixed sticky-position declaration for Safari compatibility; retained the existing short-landscape fallback.
- Reviewed Revolut's scroll behavior as a reference: its navigation leaves the viewport while scrolling down. Willow's existing pinned hero remains the focus, with the navigation-height offset preserved.
- Validation: homepage experience tests pass (8/8). Local browser checks at 1440x900 and 390x844 confirm the hero stays pinned beneath the navigation while scrolling; captured the mobile viewport. No schema or live-data changes. Legacy engines without `svh` were not directly emulated.

## Scroll direction and short viewports - 2026-10-02

- The shared 654px-tall desktop viewport triggered the old short-height rule that disabled sticky positioning. The hero now scales to the available desktop height and stays pinned; very short and compact mobile-landscape viewports retain natural scrolling so controls remain reachable.
- The homepage navigation now hides while scrolling down and returns while scrolling up, following the observed Revolut interaction. Opening the mobile menu forces the navigation visible; reduced-motion preferences disable the transition.
- Validation: all 92 tests pass; JavaScript syntax, editor diagnostics and `git diff --check` are clean. Browser checks confirm pinning and direction-aware navigation at 1391x654, portrait layout at 390x844, and natural scrolling at 844x390. No schema or live-data changes.
