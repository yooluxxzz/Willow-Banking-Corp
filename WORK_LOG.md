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

## Scroll-driven hero transformation - 2026-10-02

- Replaced the binary scene threshold with scroll-progress-driven photo framing: the existing customer portrait begins in a tall, rounded right-side panel and expands to full bleed, while the two photos crossfade and the copy enters in sequenced beats. No Revolut assets or branding were copied.
- Replaced the `decode()`-only enhancement gate with image completion/error handling, because the integrated browser reported loaded images whose decode promises never settled. Reduced-motion users keep the static first scene.
- Validation: all 92 tests pass; JavaScript syntax and editor diagnostics are clean. The shared browser defaults to reduced motion, which leaves the first scene static; with `no-preference` emulated, computed samples at scroll positions 0, 250, 500, 800 and 1050 show the frame insets and image/copy opacity changing continuously from 0 to 1. Screenshot capture was attempted, but the tab was hidden and rendered as a blank/dim frame, so no visual screenshot verification is claimed. No schema or live-data changes.

## Brand alignment and finish pass - 2026-10-02

- Aligned the public-facing brand expression with the final upgrade brief by updating the hero headline and login-page slogan to the premium Willow positioning: "Your money. Moving forward."
- Updated the public page metadata and project brand specification to match the same wording, keeping the digital banking experience consistent from the landing page through the demo sign-in flow.
- Validation: the project test suite runs successfully with Node’s built-in runner (`node --test tests/*.test.js`), with all 92 tests passing and 0 failing. No schema or live account data changes were introduced in this final brand pass; only the public-facing brand copy and work log were updated.
- Repository note: this change is recorded in the local Git history without modifying the live session or account database files, and the work log entry documents the final verification state for the current session.

## Homepage personalization pass - 2026-10-02

- Added the missing Willow goal-selection section to the public homepage to match the brief’s “What are you working toward?” requirement, including a premium, interactive selection flow rather than a static questionnaire.
- The personalization cards surface relevant financial-product cues and a compact goal summary, making the homepage feel more like an integrated financial ecosystem instead of a generic marketing page.
- Validation: the existing Node regression suite remains green after the homepage update (`node --test tests/*.test.js`), with 92 tests passing and 0 failing. No schema or live account data changes were introduced.

## Willow hub and intelligence pass - 2026-10-02

- Added the missing Willow Hub story section to the homepage, including a net-worth summary, money-movement breakdown, and goal-tracking cards to match the brief’s “Your financial picture” requirement.
- Added a premium financial-intelligence panel that responds to common finance prompts such as spending, investments, savings and portfolio allocation. This makes the homepage feel like a connected financial operating system instead of a static landing page.
- The work stays in the demo/illustrative layer only and does not imply real trading, real advice or real-money movement; it is framed as an informational product experience tied to the existing Willow demo ecosystem.
- Validation: the project regression suite still passes after the page expansion (`node --test tests/*.test.js`), with 92 passing tests and 0 failures. No schema or account-data migration was needed for this UI-only enhancement.

## Willow platform narrative pass - 2026-10-02

- Added a further homepage product-layer section that frames Willow as a fuller financial platform: life banking, wealth, business and security all appear in one connected story rather than a single-account marketing page.
- This layer gives the homepage more product breadth and makes the brand feel like a serious financial institution rather than a generic fintech landing screen.
- The section remains demo-oriented and is designed to match the broader Willow upgrade brief without changing existing user flows or backend logic.
- Validation: the project regression suite remains green after the additional homepage layer (`node --test tests/*.test.js`), with 92 passing tests and 0 failures.

## Scroll cue and next-move continuation - 2026-10-02

- Restored the hero scroll cue and ensured the landing page keeps the “Scroll to discover” indicator in the live storefront experience.
- Continued the product-story expansion with a “Built for the next move” section covering home, investing and business momentum, reinforcing the sense that Willow is a broader financial platform rather than a single-product landing page.
- Validation: the app remains stable after the final continuation pass (`node --test tests/*.test.js`), with 92 passing tests and 0 failures.

## Goal-story regression fix - 2026-10-02

- Corrected the final homepage regression where the “What are you working toward?” goal story panel failed to update when different finance goals were selected.
- Restored the dynamic goal-content update path so the goal tag, headline, description, supporting list and mini-metrics all swap correctly between savings, investing, home, business, money and travel scenarios.
- Kept the scroll cue visible in the pinned hero while preserving the premium landing-page interaction without altering the working banking backend or user flows.
- Added the missing Node `vm` import in the goal-selection regression test so the page script can be evaluated in the project’s real test harness.
- Validation: `node --test tests/*.test.js` passes with 93 tests passing and 0 failing. The fix remains isolated to the homepage experience layer; no account, session or database schema changes were introduced.

## Homepage spacing and scroll finish - 2026-10-02

- Restored the standard vertical rhythm on the Hub, financial-intelligence, platform and next-move sections, and brought the personalization section into the same compact mobile spacing system.
- Rebalanced the four platform cards into a two-column layout so content fills the section instead of leaving an empty third column; the move cards stack cleanly on narrow screens.
- Added a visible fine border to the hero photo frame, fading it as the image expands to full bleed. Extended the sticky story to 190svh, retimed the photo/copy crossfade to leave a clear hold on scene two, and synchronized scroll progress with the navigation's hidden state.
- Updated the brand specification to describe the implemented scroll journey. No banking behavior or database schema changed.
- Validation pending: responsive browser review and full regression suite.

## Session-store resilience and final regression pass - 2026-10-02

- Hardened the session management layer so `ownedSessions()` works with either the live database-backed environment or synthetic/legacy `sessionStore.all()` payloads, while preserving real revocation checks for active user sessions.
- Added safe guards around `isRevoked()` so the service degrades gracefully when the database has not been initialized yet or when a legacy session record does not include the modern metadata shape.
- Kept the existing ownership and current-session protections intact; a stale session write still cannot restore access after a user signs out, and real store failures continue to surface as errors.
- Validation: `node --test tests/*.test.js --test-reporter=spec` completes with 93 passing tests and 0 failing tests. This was the final regression pass for the completed Willow upgrade work.
- No schema or account-data migration was needed for this fix; all behavior stays in the session service and runtime validation layer.

## Platform capability completion pass - 2026-10-02

- Audited the original upgrade checklist against the actual codebase after identifying that the previous session’s “finished” summary overstated what had been implemented. Added an authenticated Wealth workspace with server-side cached quotes/history for an allowlisted stock, ETF and crypto demo market; searchable/filterable instruments, indices, watchlists, chart ranges, portfolio holdings/activity and server-priced simulated buy/sell orders.
- Added separate `demo_portfolios`, `demo_holdings`, `demo_watchlist`, and `demo_trades` schema. New demo portfolios receive $100,000 of simulated cash. Server-side trade writes validate safe order values, cash, units and ownership and never modify bank accounts or ledger transactions. Stale market data is identified and cannot be traded.
- Added a signed-in Willow Hub whose account totals, savings, completed credits/debits and expense rankings come from the requesting user’s records. Internal transfers are excluded from spending/expense rankings. The financial question endpoint answers only supported queries from that same user’s records and refuses investment predictions/recommendations.
- Added indicative USD/EUR/GBP/MZN/ZAR conversion estimates from server-side FX quotes, a business workspace derived from separately owned business accounts, a monthly-payment loan estimate calculator and searchable demo Help Center. Unsupported FX execution, lending, scheduled payments, invoices, team access and other external services are explicitly disclosed as unavailable.
- Replaced fabricated public homepage assistant answers with links to the authenticated data-backed Hub and labeled the public dashboard values as illustrative examples. No customer data appears on the signed-out homepage.
- Validation: focused integration checks cover Wealth auth/CSRF, ownership, server-side order pricing, ledger separation, FX quote access, market quote parsing/stale fallback, Hub account isolation and transfer-excluded spending, and business-account filtering. Full regression run: 106 tests passed, 0 failed. Changed JavaScript syntax checks passed.
- No Python/yfinance runtime exists in this Node application; Yahoo Finance chart endpoints are used as a prototype provider. No real brokerage, FX execution, live banking, scheduled payments, saved goals, crypto send/receive, 2FA, mortgage/credit decisioning, or business team/invoice infrastructure was added. The local image directory still contains only two hero photos, so the requested five-scene photographic system remains incomplete. Browser screenshot review remains unverified; page rendering and interactions are covered by integration and client scripts, but external market/FX availability depends on Yahoo Finance.

## Goal planning and homepage goal selector - 2026-10-02

- Added user-owned `demo_goals` with authenticated, CSRF-protected create/update/delete APIs and a saved Planning Goals page. Goals validate category, name, target and self-reported progress; they never move funds or alter bank balances. The Hub now displays each saved goal’s progress, and customers can reach goal management from the signed-in navigation.
- Fixed the homepage goal selector hiding its only story card when a non-savings category was selected. The shared framed detail and metric panels now remain visible for all six categories, and the regression test exercises each choice.
- Refined the goal-section header spacing: supporting copy aligns with the headline, has a controlled measure, and the choices have clearer separation; the narrow layout remains compact and stacked. Added public copy that distinguishes illustrative examples from saved, self-reported goals.
- Validation: focused goal tests pass for user isolation, CSRF, validation, updates, deletion, Hub integration and unchanged bank balances. The six-category UI regression passes. Full suite: 108 passing, 0 failing. HTTP smoke tests return 200 for `/`, `/css/style.css`, `/js/app.js`, and `/js/goals.js`, and redirect unauthenticated `/goals` and `/hub` to sign-in. Editor diagnostics and `git diff --check` are clean. The integrated browser accessibility snapshot confirmed the category choices, shared detail panel, metric boxes and planning disclosure; screenshot capture failed because the browser display surface was unavailable, so no screenshot review is claimed.

## Five-scene homepage hero - 2026-10-02

- Expanded the pinned hero from two scenes to five story beats: everyday life, home/family plans, business, travel and wealth. Scene text, links, photo visibility and accessible hidden/inert state now advance together.
- Added a 10-second crossfade autoplay interval and visible pause/resume control. Pointer/focus/keyboard interaction and wheel/touch scrolling pause autoplay; scroll progress continues to select the five scenes. Reduced-motion users keep the first local scene with autoplay and scroll movement disabled.
- The original locally served WebP remains the first high-priority image. Four additional image sources use responsive Unsplash CDN candidates (768px/1536px, auto format and quality 76) with lazy/low-priority loading. All four sources returned HTTP 200 as JPEG when checked. External CDN availability remains a runtime dependency; production should move these assets to a controlled image host.
- Validation: a five-scene VM regression checks auto-advance, pause on interaction, resume, scroll selection of scene five, and reduced-motion behavior. Full suite result and live route checks follow after this pass.

## Scheduled demo transfers - 2026-10-02

- Added a signed-in schedule/review/list page for one-time transfers between the customer’s own active USD demo accounts. Schedules are dated in UTC, can be cancelled before due time, and are visible in the Hub and financial assistant.
- The server checks due transfers every minute. Settlement revalidates account ownership/status, available funds, and daily limits; then posts paired transfer ledger entries and updates/audits the schedule atomically. Failed due transfers do not debit accounts; processing is idempotent. Scheduling itself never reserves or moves funds.
- This does not connect external bill pay or recurring mandates. The UI discloses that scope and that insufficient funds or account state can cause a due demo transfer to fail.
- Validation: focused coverage confirms authentication, CSRF, owner isolation, no early balance changes, cancellation, due settlement exactly once, paired ledger entries, Hub/assistant visibility and insufficient-funds failure. The suite at this checkpoint had 112 passing tests.

## Internal crypto wallet demo - 2026-10-02

- Added a protected BTC/ETH demo wallet page with holdings, optional market estimates, activity history, an internal demo-handle receive flow, and review-before-send. Crypto sends only move simulated units to another active Willow demo profile; the interface explicitly rules out blockchain addresses, keys, external withdrawal or real asset movement.
- Added `demo_crypto_transfers` as an isolated user-to-user record. Sends preserve weighted-average cost basis, normalize quantities to eight decimals, and never alter simulated cash, bank account balances, or the banking ledger.
- Validation: focused tests cover protected rendering, CSRF, internal send/receive, ownership, cost basis, history, invalid assets/quantities, and separation from banking records. Full suite: 114 tests pass, 0 fail. Syntax checks, editor diagnostics and `git diff --check` are clean.

## Scroll reference and live hero review - 2026-10-02

- Analyzed the supplied Revolut page at its salary/gallery section: the page uses a clear section handoff and a centered active visual with neighboring image previews. Willow retains its own pinned, full-frame editorial stage rather than copying that card arrangement, while adopting deliberate scene pacing and keeping image, copy and calls to action synchronized.
- Browser review at 1160px found the expanded nav links wrapped and produced horizontal overflow. The existing keyboard-accessible menu now activates through 1280px, and the header stays compact above the hero. The opening customer image crop was shifted to keep the subject inside its inset frame and eases back toward center as the frame expands.
- Live interaction found the hero content wrapper intercepted clicks on the visible pause control. Pointer hit testing now passes through the wrapper while active copy links remain interactive; the pause control sits above it.
- Validation: browser screenshot confirms the desktop nav no longer overflows and the first portrait is framed cleanly. Clicking Pause changes the accessible label to Resume. The complete suite passes with 109 tests and 0 failures; syntax, editor diagnostics and `git diff --check` are clean. The five external CDN image sources returned HTTP 200 during integration checks.

## Complete digital banking and investing platform upgrade — 2026-10-02

The user asked for Willow to be upgraded into one premium digital bank, investing and financial-intelligence platform, keeping the existing working features and architecture (Express, EJS, sql.js).

**Design system and shells**
- New design system in `public/css/willow.css`: Mona Sans (self-hosted variable font with tabular figures), forest/sage/copper/ivory tokens with semantic roles and a full dark theme, type, spacing, radius and motion scales, reduced-motion handling, privacy mode and a stroke icon sprite. About 40 components, including bank-card mockups and in-house SVG charts (`charts.js`).
- New public header (mega menus, mobile navigation, demo strip) and footer. New app shell: sidebar, top bar with Ask Willow (⌘K), notifications, profile menu, mobile tab bar and More sheet. Shared client runtime in `app.js`: API helper, toasts, dialogs, step flows, transaction rows and detail sheet, local greeting, idle-timeout warning.
- `src/app.js` app factory, used by both the server and the tests. `src/view-helpers.js` and the `src/content/` modules hold products, navigation, help, articles and the instrument universe.

**Public site**
- New homepage: five-scene crossfading hero with captions, tabs, pause controls and reduced-motion support; everyday banking, investing panel with live data, goal picker, Hub, security and closing sections.
- 18 product pages, Markets, Insights and Education articles, and a Help center with search, 9 categories and a contact form that stores messages with a reference.
- Info pages rewritten honestly: about, careers, press, contact, privacy, terms, compliance, security and a new “About the demo” page. Earlier claims of a SOC 2 audit, an industry award, fees and contact details were removed.
- Legacy `/personal` and `/products/*` URLs return 301 redirects to their new pages.

**Sign-in and sign-up**
- Split-screen sign-in with fading imagery. Accepts email or customer ID and shows a warning when few attempts remain. Has paused, suspended, timeout, signed-out and reset states, a two-step code step, and other ways in (guest profile, recovery code, customer ID).
- Six-step sign-up with progress: Welcome, About you, Account, Security, a clearly simulated identity check, then Done (shows the customer ID).
- Restyled password recovery.
- Server-side idle sign-out after 30 minutes (`SESSION_IDLE_MINUTES`) with a client-side warning one minute before. Guests can keep their profile by adding an email and password (`/auth/claim-guest`).
- Registration now validates phone numbers.

**Banking app (all views rewritten under `views/app/`)**
- Dashboard, Willow Hub, accounts (grouped), account detail, opening a new account (including currency accounts), transactions (with CSV export), statements, adding and withdrawing money, cards, payees, scheduled transfers, international (rates and simulated conversion), goals, loan calculators, business (overview, invoices, team), notifications, Security center, settings and the admin console.
- Cards: switcher, freeze, reveal, replace, lost or stolen, controls, limits, design and a placeholder for adding to a phone wallet.
- Send-money flow: recipient (with payee name confirmation), amount, account, review, then the “Money sent” receipt.
- Security center: score, two-step verification setup with QR code, sessions, freeze all cards, privacy and data export.
- Supporting backend changes:
  - payee lookup endpoint;
  - `/auth/session` keepalive;
  - five demo customers created at startup;
  - like-for-like month-to-date spending comparisons;
  - the personalized-insights preference is respected;
  - deposit limit is configurable;
  - anonymous `/loans` redirects to the public loans page, and bare `/wealth/stocks` to Markets;
  - insight/guide URL mix-ups redirect to the right section;
  - stricter content security policy (fonts self-hosted, no Google Fonts).

**Wealth (built by a delegated agent and reviewed here)**
- Portfolio dashboard, markets (search, filters, sort, watchlist, indices, popular), stock and crypto detail pages (1D–MAX charts, stats, profile, news, position), simulated buy and sell with receipts, and a crypto overview with send and receive.
- Applied the agent’s fixes for bugs outside its files:
  - missing market fields now read as “—” instead of 0;
  - line-chart gradient fills now show;
  - modals are centred on desktop;
  - portfolio activity includes the instrument type.

**Market data**
- Python yfinance service (`market-data-service/`, 41 unit tests) behind a Node provider chain with a Yahoo chart fallback, caching, request coalescing and backoff. Honest unavailable states throughout.

**Removed**
- 35 legacy views, 6 legacy partials, 7 stylesheets and 6 scripts that are no longer referenced.
- `public/images/logo.svg` now contains the new mark.

**Database / schema**
- See `docs/DATABASE_CHANGES.md` (2026-10-02 entry).
- New tables: `payees`, `user_preferences`, `two_factor`, `business_profiles`, `business_invoices`, `business_team_members`, `loan_estimates`, `support_requests`.
- New user, card and transaction columns, new indexes, and a one-time rebuild of `demo_crypto_transfers`.
- Migrations are additive and in place.
- Only scratch databases outside the repository were used. No local `data/` database was migrated, and databases, session stores and backups remain ignored.

**Docs and tooling**
- New README, brand/design-system specification and `.env.example` (no secrets).
- New `npm run seed`: it uses the sample-data generator and prints a generated password rather than storing one.
- New npm scripts: `market-service`, `test:python` and `test:all`.

**Checks run**
- `npm test`: 122 tests pass across 20 files. Updated suites: auth-client (now jsdom), experience (hero and goal picker tested against `home.js` with jsdom), auth, business, crypto, hub, scheduled transfers and wealth.
- New `tests/platform.test.js`:
  - crawls every public and signed-in page (over 80 URLs) plus links found in source code, failing on broken links or placeholder output;
  - covers idle timeout, sign-in notices, payee lookup and guest claim.
- New `tests/wealth-screens.test.js` checks the investing pages’ required disclosure text and their escaping and redirect handling.
- `python3 -m unittest`: 41 tests pass.
- All 61 EJS templates compile, all 32 browser scripts parse, and `git diff --check` is clean.
- axe-core: 0 violations on 30 pages, in light and dark themes with reduced motion. It found 6 issue types, all fixed: ARIA roles, the tab `aria-selected` attribute and contrast.
- Playwright screenshots reviewed:
  - desktop, tablet and mobile, light and dark, for the public, auth and app pages;
  - end-to-end flows: registration, sign-in errors and lockout, recovery, send money, and buy/sell plus crypto send (the agent's run).
- Populated market-data screens were checked against a fake sidecar kept only in the scratchpad (outbound market data is blocked in this environment). The real yfinance path is covered by unit tests and could not be exercised live here.

**Known limitations**
- Real-time data depends on running `npm run market-service` with internet access.
- Guest profiles are not deleted automatically.
- There is no self-service account deletion; operators can delete accounts from the admin console.

## Platform polish round 2 — 2026-10-02

**Behavior**
- **Guest clean-up.** Guest demo profiles are now deleted automatically after `GUEST_RETENTION_DAYS` (default 7; `0` keeps them).
  - A guest qualifies when its newest audit-log entry (or its creation date, if there is none) is older than the cutoff.
  - The server runs the clean-up at startup and then hourly; each removal is audited as `guest_profile_purged`.
  - Other customers’ ledger rows and balances are never changed.
  - The dashboard notice, Settings → Keep this profile, the privacy notice, “About the demo”, README and `.env.example` now state the retention period.
  - This resolves the earlier known limitation that guest profiles were never deleted.
- **Admin console copy.** The delete confirmation now says what actually happens: the profile is marked deleted (soft delete) and its records stay for the audit trail. It no longer claims data is removed.
- **Product pages when signed in.** The calls to action now go straight to the feature (“Go to Cards”) plus “Open another account”. On Business pages the second action is “Open business checking”. Signed-out visitors still see “Open an account” and “Sign in to …”.
- **Asset detail layout.** At 1180px and narrower, the “Your position” and risk panels now sit directly under the quote, both visually and in DOM order. This keeps screen-reader and keyboard order matching what is on screen. Previously only CSS `order` moved them.
- **Markets paging.** The markets list shows 20 assets at a time, with “Showing 20 of 42” and a “Show 20 more” button.
  - Focus moves to the first newly shown asset.
  - Changing the filter, search or sort starts again from the first page.
- **Ask Willow** was re-checked in the browser:
  - spending and expense questions answer with charts;
  - “Should I buy Tesla?” is declined;
  - there were no console errors.

**Database / schema**
- No schema change. The clean-up deletes guest rows in one transaction per profile:
  1. clears `transactions.related_account_id` on other customers’ rows that pointed at the guest’s accounts;
  2. clears `business_invoices.paid_account_id` on other customers’ invoices that pointed at the guest’s accounts;
  3. deletes `scheduled_transfers` to or from the guest’s accounts;
  4. deletes the guest’s own `transactions`;
  5. deletes the `users` row. This cascades to the guest’s own records, plus other customers’ saved-payee entries and internal crypto-transfer records that name the guest.
- See `docs/DATABASE_CHANGES.md`.

**Checks run**
- `npm test`: 125 tests pass. New tests:
  - guest clean-up removes only the stale guest, keeps a fresh guest and a claimed profile, leaves other customers’ rows and balances unchanged, and ends the stale guest’s session;
  - signed-in and signed-out product calls to action;
  - markets paging, run in jsdom against the real `wealth-markets.js`. It was confirmed to fail against the previous script.
- `python3 -m unittest`: 41 tests pass.
- All 61 EJS templates compile, all 32 browser scripts parse, and `git diff --check` is clean. The dev server restarted cleanly with the clean-up job.
- Playwright:
  - markets paging at 1440px and 390px;
  - asset-page DOM order at 390px and 1440px;
  - the Ask Willow panel;
  - tablet layouts.

**Known limitations**
- Real-time data still depends on running `npm run market-service` with internet access.
- There is no self-service account deletion. Admin deletion is a soft delete.

## Responsive layout pass — 2026-10-03

**Reported problems**
- **Homepage hero scene tabs.** On short or zoomed laptop windows (for example 1307×620), the demo note and the illustrative card ran into the scene tab row, and the tab progress line crossed the note.
  - Cause: the hero had a fixed height while the tabs were absolutely positioned at its bottom.
  - The hero is now a flex column with a minimum height and the tabs in normal flow, so it grows with its content.
  - On short wide screens the headline also scales with viewport height and the spacing tightens, so the tabs stay on screen.

**Found by the audit and fixed**
- **Mobile menu.** On every public page, at 1120px and narrower, the menu panel opened 0px tall, so it never appeared. The desktop mega-menu scrim had collapsed the same way.
  - Cause: `backdrop-filter` on `.site-header` made the header the containing block for those fixed-position children.
  - The frosted background now lives on `.site-header::before`.
- **Help category pages** (`/help/<topic>`) were about 1230px wide on phones and tablets.
  - Cause: bare `1fr` grid tracks grow to fit non-wrapping content.
  - All 47 such declarations across the stylesheets now use `minmax(0, …fr)`. `auto-fill` / `auto-fit` minimums are capped with `min(…, 100%)`.
  - Before/after screenshots of 65 pages at 390px and 1440px show no other changes.
- **Horizontal overflow on phones:**
  - Business invoices: a visually hidden column label escaped the table scroller. `.table-wrap`, `.tabs`, `.segmented` and `.card-switcher` are now positioned.
  - 320px: the Security panel header button, the send-money recipient list, and the homepage currency board and mortgages split layout.
  - The forgot-password back link.
  - `body` now sets `overflow-wrap: break-word`, panel headers wrap, and emails wrap after the “@”.
- **Amount fields.** On send money, deposit/withdraw and convert, the “$” overlapped the typed amount at every width.
  - Cause: two conflicting `.amount-input` definitions.
  - These forms now use the design-system field, the same one the order dialog uses, and the app copy was removed. The underline turns red when the amount is invalid.
  - The quick-amount chips now read “$20” instead of “$ 20”.
- **Demo strip.** It is shortened on mid-size screens so it stays on one line, and the 1px gap under the open mobile menu is closed.
- **Accessibility** (found by axe once the test profile had unread notifications and wide tables):
  - The notification badge contrast is now 5.5:1 in light mode and 7.8:1 in dark mode.
  - Horizontal scrollers that overflow and contain nothing focusable become keyboard-focusable, and plain wrappers get a named region (`setupScrollRegions` in `app.js`).
  - The shortened sign-in back links keep their full accessible names.

**Database / schema**
- None.

**Checks run**
- Playwright audit scripts, kept outside the repo, flagging horizontal page overflow, off-screen elements, overlapping controls and clipped text:
  - 65 public and signed-in pages at 17 widths (320–2560), light and dark: no issues remaining. The one flag left is the intentional phone illustration bleed on the homepage tile.
  - Interactive states at 6 sizes, including 844×390 landscape: mega menus, mobile menu, profile menu, More sheet, Ask Willow and every dialog trigger, 413 states with 0 issues. Every surface fits the screen or scrolls.
  - Full flows at 320×568, 390×844, 768×1024 and 844×390: send money (5 steps), stock order (with a local fake price feed kept outside the repo), Ask Willow, sign-up and sign-in. Screenshots reviewed.
  - Hero: 120 checks across window sizes, 125% zoom and all five scenes. The tabs never overlap the content.
- axe-core: 0 violations on 30 pages at 390px and 1280px, light and dark.
- `npm test`: 129 tests pass. New `tests/responsive-css.test.js` adds static guards:
  - no bare `fr` grid tracks;
  - no containing-block-creating effects on `.site-header`;
  - a single `.amount-input` definition;
  - positioned table scrollers.
  - All four were confirmed to fail on the previous stylesheets.
- `python3 -m unittest`: 41 tests pass.
- All 61 EJS templates compile, all 32 browser scripts parse, and `git diff --check` is clean.

## Real data only, budgets, debts, net worth and a local assistant — 2026-10-03

**Requested**
- Customers have only their own money: no pre-filled balances, cards, recipients or activity. Everything is 0 until the customer acts, and transfers go only to accounts that exist.
- Business owners log their own expenses and budgets.
- A daily budget check, run at night while the app is running and at start-up.
- Databases stored in GitHub.
- Debts the customer can manage; a net worth the customer logs, with the charts and statistics computed from it.
- Replace the old assistant with a local one if possible.
- Short fade-in / fade-out attention animations.
- Fix the Explore mega-menu image and the Education header.
- Use more symbols and images.
- Let Python (yfinance) and Node work together automatically.
- Update the README.

**Implemented**
- **Nothing invented.**
  - Sign-up and guest profiles create one $0 checking account only: no savings account, card, sample activity or welcome messages (`src/services/auth.js`, new `src/services/guests.js`).
  - Removed `src/seed.js`, `src/services/demo-data.js`, the sample-activity route and `npm run seed`, along with the five `@community.willow.test` customers. Payments go only to registered customers.
  - The dashboard shows a “get started” checklist (add money, open savings, order a card) until each step is done.
  - Public copy no longer mentions $100,000 practice cash or sample data.
  - A one-time clean-up removes what earlier versions created for existing databases (see Database).
- **Investing funded from deposits.**
  - Investing cash starts at $0. *Add cash* / *Withdraw cash* on the Portfolio page move money from or to a US dollar account through the ledger (`INV-IN-` / `INV-OUT-`).
  - Total return is measured against the money moved in.
- **Budgets** (`/budgets`, and business budgets on `/business/expense-log`).
  - Daily, weekly (Monday start) or monthly; overall or per category.
  - Near the limit at 85% or more; over when spending passes it.
  - Withdrawals can carry a category.
  - `server.js` runs the check at start-up, catching up on missed days up to 31, and nightly at `NIGHTLY_CHECK_TIME` (default 23:55). Each level is notified once per period.
- **Business expenses.**
  - Owners log their own expenses, optionally paid from the business account (`EXP-` debit; deleting the expense refunds it).
  - The business dashboard counts logged expenses plus other account debits.
  - Owners without a business account can still log expenses and budgets.
- **Net worth** (`/hub`, now titled *Net worth*).
  - Accounts (converted from other currencies) + investing + recorded assets − open debts.
  - Own/owe donuts, daily history, debt-to-assets ratio, money movement, categories, insights.
  - Assets can be added, edited and deleted.
- **Debts** (`/debts`).
  - Balances, APR, minimums and due days, with payoff and interest estimates.
  - Payments can come from a Willow account (`DBT-` debit) or be recorded as paid elsewhere.
- **Ask Willow.**
  - The old rule-based `/api/hub/ask` was removed.
  - The new assistant uses a local model through Ollama (`src/services/assistant.js`). It streams answers and gets a summary of only the signed-in customer’s own records.
  - It is hidden unless Ollama is reachable and limited to 20 questions per 5 minutes. Replies are rendered as safe DOM, never as raw HTML.
- **Python ↔ Node bridge.**
  - `src/services/market-service.js` starts `market-data-service/server.py` with Willow when `/health` doesn’t answer, after checking for Python and yfinance.
  - It generates the shared `X-Willow-Service-Token` secret, restarts the service with back-off and stops it with Willow. `/health` reports its state.
- **Database in Git.** `npm run db:save` / `npm run db:restore -- --force` and auto-restore on first start (`src/services/snapshot.js`, `scripts/db.js`).
- **Attention and symbols.**
  - `W.highlight` / `[data-attention]`: a fade-in glow held about 2.4 s, then faded out. `W.stagger` for lists. Both respect reduced motion.
  - Page titles carry their sidebar symbol, and stat labels have icons.
  - The Explore mega-menu feature card was 64px tall because its variant class collided with the icon-tile class. It now uses `.mega-feature-symbols`.
  - **Education / Insights header.** A `flex: 0 1 440px` meant for row ledes also hit the lede nested in the right-hand column stack, making it 440px tall. The rule is now `> .lede`. The “Browse …” card is larger, with a row of topic symbols.
- **Smaller changes.**
  - The Security center export includes budgets, budget checks, business expenses, assets, debts, payments, net-worth history and investing cash moves. The file is now `willow-data-<date>.json`.
  - On Wealth at 320px, the long simulated-orders badge wraps instead of overflowing.
  - Stat tiles stay two per row on phones (one column only below 360px), so Budgets and Debts show their figures without a long scroll.
  - The largest-category insight reads “Your largest spending category this month is debt payments.” The Debts “paid off so far” note now says it is measured against the original amounts.
  - Accessibility:
    - Empty states take a heading `level` (`W.empty({ level: 2 })`), so Goals, Budgets, Debts and the no-cards state keep heading order on a new, empty profile.
    - The public markets strip has `role="group"` for its label.
- **Docs.** README rewritten, along with `.env.example`, `docs/DATABASE_CHANGES.md`, `WILLOW_BRAND_SPEC.md`, the market-data service README and AGENTS.md (snapshot policy).

**Database / schema** (details in `docs/DATABASE_CHANGES.md`)
- New tables: `app_meta`, `portfolio_transfers`, `budgets`, `budget_checks`, `business_expenses`, `assets`, `debts`, `debt_payments`, `net_worth_snapshots`, with indexes. `demo_portfolios.cash_cents` defaults to 0.
- One-time clean-up `fabricated_data_removed_v1` (audit event `fabricated_data_removed`):
  - removes community customers and old guest profiles;
  - removes sample ledger rows, reversing their balance effect;
  - removes other sample records and auto-issued unused cards;
  - resets portfolios bought with practice cash.
  - On this session’s scratch preview database (outside the repo, test data only, not backed up) it removed 5 community customers, 14 guests, 113 sample transactions, 11 other records and 1 card, and reset 1 portfolio.
- `.gitignore` keeps `data/*` ignored except `data/willow-snapshot.sql`. No snapshot is committed in this session: the only database here holds test profiles.

**Checks run**
- `npm test`: 148 tests pass.
  - New suites: `budgets`, `networth`, `assistant` (against a stand-in Ollama server), `snapshot` and `market-service` (against a stand-in Python).
  - New CSS guard for the split-intro lede. It was confirmed to fail on the previous stylesheet.
  - Existing suites were updated for empty new profiles.
  - The first full run failed one assertion: it still expected the old `/business/expenses` link. Fixed.
- `python3 -m unittest`: 41 tests pass.
- All 64 EJS templates compile, all 35 browser scripts parse, and `git diff --check` is clean.
- Browser:
  - A guest profile was filled through the APIs with deposits, a business account, categorised withdrawals, budgets, debts with a payment, assets, business expenses, investing cash and a card.
  - Dashboard, Net worth, Budgets, Debts, Business expenses and Wealth were screenshotted at 1440 and 390/360 with no console errors. Every figure was checked against the entered data: totals, net worth, budget status and left-to-spend, debt interest and paid-off amounts.
  - Education and Insights headers were screenshotted at 1440, 1024 and 390, light and dark. The open Explore mega menu now shows its full feature card (343×276 at 1440, 279×276 at 1180).
  - Attention animation on `/budgets`: the glow starts about 0.8 s after load, lasts 2.4 s and clears. With reduced motion it is effectively off.
- Responsive audit (scripts outside the repo): 37 public and 32 signed-in pages, including `/budgets`, `/debts` and `/business/expense-log`, at 9 widths from 320 to 1440.
  - No issues except the known intentional homepage tile bleed at 320.
  - The first parallel run timed out on some pages because 9 browsers hit the dev server at once. They were re-run in batches of 3 widths.
  - After the stat-tile change, the affected pages were re-checked at 320–600: 0 issues.
- axe-core:
  - First run, on 15 public and 25 signed-in pages at 390 and 1280, light and dark: two pre-existing issues, the role-less labelled markets strip and an `h3` empty state under the Goals title.
  - Both were fixed, together with the same empty-state issue on Cards.
  - Re-check on a populated profile and a brand-new empty profile: 30 pages at 390 and 1280, 0 violations.
- Python bridge, end to end: Willow started the service itself; requests without the token got 401; the service restarted after being killed; it stopped with Willow. This environment blocks Yahoo, so quotes correctly show as unavailable.
- Ollama isn’t installed here, so the assistant was tested only against the stand-in server, not a real model.

## Scroll focus on every section — 2026-10-03

**Requested**
- Every section people scroll down to should fade in, then fade out briefly to catch their attention.

**Implemented** (`setupAttention` in `public/js/app.js`, styles in `public/css/willow.css`)
- **Fade in.** Each section fades up (0.7 s) the first time it is scrolled to. It triggers when its top passes 82% of the window height.
- **Focus moment.** A light then fades in and back out over the section (2.4–2.6 s):
  - Public pages (`main > section` and the info pages’ `.info-section`): a soft copper colour wash over padded sections, plus a glow on the section heading. Sections without a heading glow their first cards on screen.
  - Signed-in pages: each card-like block (found inside plain layout wrappers) gets the copper ring glow.
- **Rules that keep it calm:**
  - What is on screen at load only fades in. App cards do this one after another; public sections are left untouched.
  - No more than three glows play at once.
  - Each section does this once per visit.
  - Sections whose content already reveals itself on scroll (`.reveal`, on the homepage and product pages) keep that animation and add the wash and heading glow.
  - Content at the very end of a page, which may never cross the trigger line, comes in once the page can’t scroll further.
  - Reduced motion and browsers without IntersectionObserver show everything immediately. Hidden content is shown when printing.
- **Fixes to the existing glow (`W.highlight`):**
  - It now starts and ends on the element’s own shadow, so cards don’t flicker.
  - A child element’s animation ending no longer cuts it short.
  - The page’s marked figure, when it is itself a card fading in, glows after the fade instead of the two animations cancelling.

**Database / schema**
- None.

**Checks run**
- New `tests/scroll-focus.test.js` (jsdom with a stand-in IntersectionObserver) covers:
  - public sections waiting hidden, fading in, then washing and glowing their heading;
  - headless sections glowing their cards;
  - app cards staggering at load and glowing when reached;
  - reduced motion.
  - Two of its three tests fail on the previous `app.js`.
- `npm test`: 151 tests pass. All 35 browser scripts parse. `git diff --check` is clean.
- Browser, with motion on, scrolling top to bottom at 1280×800 and 390×844:
  - Pages: home, a product page, Education, About, Markets, Help, an article, Net worth, Dashboard, Budgets, Debts, Business expenses, Wealth, Settings and Security.
  - Every page ended with nothing hidden and no animation classes left behind, and there were no script errors.
  - Mid-animation screenshots, in light and dark, show the wash with the heading glow and the card ring.

## Submission readiness: full review, fixes, tooling and a tester guide — 2026-10-03

**Requested**
- Finalize everything for submission, aiming for at least 9/10 in Code Structure & Technical Quality, UI/UX & Responsiveness, Theme Impact & Utility, Innovation and Completeness, with careful full-scan testing.
- Someone else will test it, so the guide must be careful and very clear.
- Make sure the Ollama assistant works well.
- Commit, push and sync when done.

**Implemented**
- **Full review.** Three independent reviews (backend and security, frontend and accessibility, structure and tooling) were followed by dynamic tests. Every finding below was fixed and, where possible, covered by a test.
- **Data integrity**
  - Foreign keys stay enforced (sql.js switched them off on every save), and orphaned rows are repaired at start-up.
  - Saves only when something changed, with an atomic file replace that retries while Windows holds the file.
  - Rounding in trades and conversions favours the bank, so tiny round trips can't create money.
  - Admin adjustments use the account's own currency.
  - `db:restore` loads the snapshot explicitly.
- **Security**
  - `TRUST_PROXY`, so clients can't pick their own IP to skip rate limits.
  - CSRF tokens are created only when a page renders, so API and public responses don't start sessions.
  - `/health` details are shown to admins only.
  - Typed `ValidationError` for expected failures; anything unexpected returns a generic 500 and is logged.
  - Strict cent parsing and type checks.
  - CSV export guards against spreadsheet formulas.
  - Sign-out and expiry clear the configured cookie.
  - Guests can't set up two-step verification.
  - The sign-in rate limit now counts failed attempts only.
- **Zero-config start for reviewers**
  - In development an admin login is generated, printed once and saved to `data/admin-credentials.txt`.
  - The Python bridge keeps its secret with the data, refuses a foreign service, finds `py -3` on Windows and exits with Willow.
  - Clear messages when the port is taken.
  - Sessions are stored next to the database.
- **Budgets and alerts**
  - Nightly checks never skip a day, and alerts name past days.
  - The alert switches now apply, with a new Budgets switch.
  - One definition of spending (`src/services/spending.js`) is shared by budgets, Net worth and the assistant.
  - An admin System panel with **Run daily checks now**.
- **UI/UX**
  - Pressing Enter twice no longer submits a form twice.
  - Scroll focus never hides content from screenshots or keyboard users.
  - "Hide balances" now covers chart axes and tooltips, account pickers and insight sentences.
  - The theme icon shows correctly on app pages; the closed profile menu is out of the Tab order.
  - Notifications tabs work with the arrow keys.
  - Correct button labels for signed-in visitors on product pages.
  - The Security center handles guests.
  - Activity is grouped by local day.
  - Invoices offer to open business checking.
  - Retry states for Net worth, investing cash and the watchlist.
  - Labels fixed for the loan calculator, assistant suggestions, admin tables and the admin reason field.
  - Scheduled transfers show the right currency and account type.
  - Guest access is on the first sign-in screen and on sign-up.
  - The mobile tab bar highlights More on pages like Goals and Loans.
  - The payments page has one name, "Payments".
  - Copy fixes on Home, Markets, account opening and "Willow demo".
- **Ask Willow (Ollama)**
  - Picks the best installed chat model (never an embedding model) and warms it up.
  - Stops a stalled answer after 45 s and strips `<think>` blocks.
  - Shows Ollama's own error (for example, out of memory).
  - Gives the model precomputed key figures, and links answers to the related pages.
  - A setup card with **Check again** and status polling while Ollama is off.
  - `npm run assistant:check` diagnoses a real install end to end.
- **Structure**
  - Background jobs (`src/services/jobs.js`), identifiers and references (`src/services/ids.js`), errors (`src/errors.js`) and route helpers (`src/routes/helpers.js`).
  - Net worth lives at `/net-worth`, and `/hub` redirects permanently there; the picture API no longer recomputes net worth.
  - Removed five unused endpoints, the unused `/api/wealth/fx`, about 400 lines of dead CSS and JS, `src/logger.js` and the `uuid` dependency.
- **Tooling**
  - ESLint (`npm run lint`), and the codebase is lint-clean; `npm run check` runs lint plus tests; `npm run test:coverage`.
  - Cross-platform Python scripts (`scripts/python.js`, `npm run setup:python`).
  - `engines` and `private` in package.json.
  - pdfkit 0.20 and jsdom 29, so clean installs show no deprecation warnings.
  - `.gitattributes` and `.editorconfig`.
  - GitHub Actions CI on Linux (Node 20, 22, 24), Windows and macOS, plus the Python tests.
  - Old test logs removed from the root; design notes and the original brief moved to `docs/`.
- **Docs**
  - New `docs/TESTING_GUIDE.md`: install on each OS, a 14-part guided test with expected results, Python and Ollama, automated checks and troubleshooting.
  - README quick start is now zero-config.
  - `.env.example` matches the code.
  - `docs/DATABASE_CHANGES.md` is updated.

**Database / schema** (details in `docs/DATABASE_CHANGES.md`)
- New column `user_preferences.alert_budgets` (default on).
- Foreign-key enforcement after every save and a start-up repair of orphaned rows.
- Sessions are stored next to `DATABASE_PATH`.
- Ledger references use 10 random hex digits; prefixes are unchanged.
- No backup was needed: only scratch databases outside the repository were used.

**Checks run**
- `npm run check`: ESLint clean and 181 Node tests pass. `npm run test:python`: 42 tests pass. Coverage is about 87.5% of lines.
- GitHub Actions: all six jobs green — Node 20, 22 and 24 on Ubuntu, Node 22 on Windows and macOS, and Python.
- Fresh clone with no `.env`:
  - `npm ci` shows no warnings and 0 vulnerabilities.
  - `npm start` printed the admin box, created `data/` and started the Python service.
  - The service exited with Willow.
- Playwright end-to-end runs against a live server:
  - **Journey 2** (15 steps): guest access, paying another customer, scheduling, business account and expense, investing cash, PDF statement, CSV export, privacy, sign-out and sign-in, the assistant setup card, the admin console and the phone layout.
  - **Journey 3**: the guide's Part B, steps B2–B13, through the UI with every promised figure checked (for example, net worth $10,535.00).
  - No page errors or server errors in either run.
- axe-core: 0 violations on 47 pages, in light and dark, at 1280 and 390 px. The admin console is clean too, with the Manage dialog open.
- Responsive audit: 69 pages at 320, 390, 768, 1024 and 1440 px. The only finding is the decorative phone tile on the home page at 320 px.
- Not testable in this environment:
  - A real Ollama model: downloads are blocked. Covered by protocol-faithful tests and `assistant:check` against a stand-in server.
  - Live stock prices: Yahoo is blocked by the sandbox proxy. The unavailable states were verified.

## Always-working demo: saved prices, quick answers and a sample profile — 2026-10-04

The user chose: keep both themes (financial literacy and AI), make sure Ask Willow never looks broken, use saved real prices when live prices can't be reached, add an opt-in sample profile, and merge straight into main.

**Implemented**
- **Saved real prices**
  - `scripts/save-market-prices.js` (`npm run prices:save`) saves a quote, a year of daily closes and five years of weekly closes for every listed instrument. The *Refresh saved market prices* GitHub workflow runs it with open internet access and commits `src/content/market-snapshot.json` (52 instruments, saved Oct 4).
  - The provider chain is now service → Yahoo chart → cached value → saved price. Quotes, history (except 1 day), crypto, FX rates, portfolio values and net worth fall back to saved prices, and every screen labels them ("Prices saved Oct 4", "Saved · <date>", "saved rate").
  - Simulated orders and conversions are no longer refused when only saved or cached prices are available; the receipt says "(saved price)" and the conversion description says "(saved rate)". An instrument with no price at all still shows "Market data temporarily unavailable".
  - A failing provider now backs off for 30 seconds (Yahoo network errors and service 5xx), so an offline Markets page loads in about a second instead of nine.
- **Ask Willow always answers**
  - New `src/services/quick-answers.js`: answers about spending, income, budgets, debts (avalanche and snowball, explained), net worth, balances, savings and emergency funds, investing, business, upcoming payments, recent activity and tips, worked out from the customer's own records.
  - Without Ollama the panel says "Quick answers…" and offers the set-up steps in a collapsed section; with Ollama it says which model is running. If the model fails before writing anything, a quick answer is given with a note naming the problem. The status API reports `mode` (`ai`, `quick` or `off`).
- **Sample profile**
  - "Explore a sample profile" on sign-in, sign-up and the homepage creates a labelled guest profile with four months of generated activity (`src/services/sample-profile.js`) so every chart, budget, debt plan and insight has something to show. A banner marks it as a sample; it is deleted like any guest.
- **Theme copy**
  - The homepage, page descriptions, footer, About, Demo, Compliance and Education pages present Willow as financial literacy built into everyday banking, with a private AI assistant that explains your own numbers.
- **Docs**
  - `docs/TESTING_GUIDE.md`: new steps B14 (Ask Willow without set-up, with expected figures) and B15 (sample profile), saved-prices notes, Part D is now optional, updated counts.
  - README, `.env.example` (`MARKET_SNAPSHOT_PATH`) and `docs/DATABASE_CHANGES.md` updated.

**Database / schema** (details in `docs/DATABASE_CHANGES.md`)
- New column `users.is_sample` (default 0). Sample profiles are guests and are purged by the existing guest clean-up.
- Saved prices are a committed JSON file, not database data.
- No backup was needed: only scratch databases outside the repository were used.

**Checks run**
- `npx eslint .` clean; `npm test`: 192 Node tests pass (new: saved-price fallback, an order at a saved price, 5 quick-answer tests, 4 sample-profile tests including purge, assistant fallback and mode). `npm run test:python`: 42 tests pass.
- Playwright against a live server with Yahoo blocked and no Ollama:
  - **Journey 3** (guide Part B, B2–B14): every promised figure checked, including the quick answers ($1,100.00 of debt; "$410.50 across 4 payments").
  - **Journey 4**: sample profile banner and dashboard, quick answers, Markets with saved prices, a simulated order at a saved price and its receipt, and a currency conversion at a saved rate.
  - No page errors or server errors.
- Not testable here: a real Ollama model (downloads blocked; covered by tests against a stand-in Ollama) and live prices (Yahoo blocked; saved prices verified instead).

## Quieter, faster market-data service — 2026-10-04

The user saw about 40 `upstream quote:… timed out after 10.0s` warnings right after the service started and asked whether that was normal. It was harmless: the first batch of quotes ran past the service's shared 10-second wait, and those fetches finished in the background. But it looked like a failure, and that first visit to Markets had to wait.

**Implemented**
- `market-data-service/willow_market/service.py`:
  - A batch that outlasts the wait logs one `INFO` line ("N of M quotes still loading…; they finish in the background") instead of a warning per symbol. Willow runs the service at `WARNING`, so nothing is printed.
  - An entry that expired less than 5 minutes ago is returned at once while a background refresh updates it, so later visits never wait on a routine refresh.
  - Upstream failures of the same kind are logged as a warning at most once a minute, with a count of the ones in between, so an outage doesn't print a line per symbol.
- `cache.py`: cache hits report how long ago they expired.
- `server.js`: once the market service is ready (or found missing), Willow loads the Markets and currency quotes once, so the first visit to those pages is quick.
- Docs: the service README (timing, background refresh, quiet logs) and a tester-guide troubleshooting row for market-service warnings.

**Database / schema**
- None.

**Checks run**
- `npm run test:python`: 45 tests pass. New tests cover the one-line summary for a slow batch, failures logged once a minute with a count, and a recently expired quote served instantly then refreshed. The stale-fallback test now moves past the revalidation window.
- `npx eslint .` clean; `npm test`: 192 Node tests pass.
- Simulation of the reported case: 40 symbols against a slow stand-in for Yahoo, logging at `WARNING`. The cold batch printed nothing, and the next request returned all 40 instantly.
- Willow against a stand-in market service: at start-up it requested the 44 market symbols and 8 currencies, with no errors, and the markets endpoint then answered in 56 ms.
