# Audit fixes — 7 October 2026

Implemented on `fix/audit-integrity-and-assistant`, from `5fc3fbdb4835374d37322616f06603c522ab682f`. After the user's approval, the original audit source tree was published as `2974fd94f78c8569839cf1fc157ee967a3bc3b2f`; the targeted follow-up below is on the same branch. No deployed database, main branch or running application was modified.

## Ask Willow

- “Check my bank account funds” reads the signed-in customer's accounts directly, without Ollama or market data. It displays ledger and available balances separately, keeps currencies separate, and returns structured data with a read timestamp.
- Explicit transfer, payment, trade and goal requests reach the planner. Quote requests precede generic portfolio reads. Supported symbol quotes work without the model; missing symbols prompt clarification. Educational and negated requests cannot execute a model-planned action.
- New read tools cover cards, scheduled transfers, business summaries, crypto wallets/history and education guides. Existing banking, budgeting, debt, loan-estimate and investing tools remain available.
- Goal creation maps `target` to `targetAmount`. Transfer previews use the source currency. Completed responses retain history and conversation identity; interrupted text is marked. Executed and cancelled actions append a readable status.
- Recent chats, Older chats, Autonomy and New chat have a dedicated toolbar. History is searchable, styled and scrollable, including on mobile. New chat restores prompts. Funds checks render as balance cards.
- Action buttons name the action, expire after two minutes and become terminal after failed confirmation. Consumed approvals cannot execute again. Receipts come from mutation results rather than a subsequent model response, and a failed chat-history write cannot hide a completed action receipt.
- Approvals bind to authentication and permission versions. Changing autonomy invalidates previous approvals even if the old mode is restored. User status and current permissions are checked at the mutation boundary, including after awaited quotes.

## Targeted follow-up — 8 October 2026

- Recent chats uses the last seven days of updates; Older chats shows earlier saved conversations. The existing retention limit remains 50 conversations with up to 200 messages each. The drawers no longer overlap each other or the mobile toolbar.
- The Autonomy button displays the current mode and opens its picker. Saving feedback, failed-save recovery, keyboard radio navigation and stale-poll protection keep the displayed mode consistent with successful saves. Server permission checks from the audit still apply.
- Authentication/homepage photography keeps a stable crop. The active-only zoom animation previously reset when a scene began fading out, producing a visible jump.
- Registration creates the user, primary/business accounts and audit record atomically. Concurrent attempts return an accurate email conflict; duplicate browser submissions are blocked. A post-creation sign-in failure offers login instead of another signup. The specific reported email cannot be diagnosed without its address, the affected flow and the running database; retained or administrator records still reserve their emails.
- Follow-up validation: lint clean, all **227 Node tests pass**, including nine focused DOM/registration checks. No new browser rendering verification is claimed. No schema migration or live data change.

## Finding status

The reported defects below are addressed; architectural recommendations and new product journeys are only complete where explicitly stated.

| Findings | Changes | Remaining scope |
|---|---|---|
| F01: save retry | Dirty generations survive sql.js export and failed writes; periodic retries continue; readiness reports a save failure. | Still an in-memory database exported to disk, without multi-process or synchronous commit guarantees. |
| F02: cleanup | Removed global investing/crypto deletion; old guest cleanup requires sample provenance. | Ambiguous legacy positions need reconciliation; previously deleted records cannot be recovered by this code. |
| F03–F04: authentication | Pending MFA binds to the original authentication version. Status, password and MFA changes invalidate earlier challenges/sessions. New registrations establish versioned sessions. | Deployment rotation must follow the notes below. |
| F05–F07: financial/AI authorization | FX repeats ownership, account status and limits in its transaction. Trades recheck after quotes. AI transfers share ordinary limits. Current autonomy and permission revision gate writes. | Scheduled transfers retain their separate transaction implementation and existing limits. |
| F08: duplicate writes | User/operation-scoped reservations, canonical hashes and replayed receipts cover keyed deposits, withdrawals, transfers, FX, investing cash, trades, crypto sends, debt payments and asset creation. Browser API retries reuse keys. | Keys are optional for older clients. Reservations/results surround the mutation rather than sharing one transaction. Crash-left pending operations require review; no reconciliation screen exists. |
| F09: ambiguous failures | Snapshot failure preserves a truthful primary-operation response. Transfer, deposit, withdrawal, adjustment, investing cash, asset/debt creation and debt-payment audit writes are transactional. Applicable notifications are non-critical. | Snapshot recovery uses the nightly job; a durable outbox and review of every side effect remain. |
| F10: secrets | Production rejects missing, short, known placeholder or shared signing/encryption keys. Versioned authenticator payloads and atomic previous-key rotation invalidate old sessions. | Operators must generate random values; length validation does not measure entropy. |
| F11: snapshot workflow | Raw backups stay ignored; removed instructions to commit customer data. | Exhaustive historical and pre-push secret/data scanning remain. |
| F12: sessions | Operations and startup await readiness. Failed file writes retry without another request. | Saves are coalesced rather than synchronously durable. |
| F13–F16: AI logic | Corrected funds/quote/write routing, history identity, goal mapping and transfer currencies. | Real-model quality and ambiguous language need evaluation. |
| F17: AI UI | History/New chat controls, search, balance cards, descriptive approvals, expiry and terminal failures. | Browser viewport/accessibility review pending; historical action statuses reload as text. |
| F18: money input | Rejects booleans, arrays, exponential money strings and excess precision. | Formal tool schemas could further strengthen contracts. |
| F19: charts | Replays cash and crypto movements, including received crypto; removes flat current-cash history; flags missing prices. | Contribution-adjusted returns, rebalancing and legacy opening-position reconciliation remain. |
| F20–F24: correctness/privacy | Calendar validation, meaningful guest activity, no-store anonymous session HTML, expanded/versioned owned export and bounded pagination. | Export evolution and retention remain ongoing maintenance. |
| F25–F27: market service | Labels expired data stale, bounds upstream work/HTTP threads, and reports availability from recent observed responses. | Load/slow-client tests and dedicated periodic health probes remain. |
| F28: Python integration | CI installs pinned runtime requirements, checks yfinance's required API and tests Python 3.9/3.12. | Transitive dependencies are not fully locked or separately vulnerability-audited; remote CI has not run on this local branch. |

## Requested product areas

Willow uses simulated records; this change connects no real banking provider.

| Area | Current scope / improvement | Further product work |
|---|---|---|
| Everyday banking | Accounts, activity, simulated deposits/withdrawals; direct AI funds card. | Pending/posted drill-down and broader AI account controls. |
| Savings | Accounts/goals; corrected AI goal creation and transfers. | Movement-based progress, recurrence and simulated interest. |
| Cards | Simulated ordering/settings; new AI card status/limit read. | Approved AI freeze/unfreeze. |
| Payments | Customer payments, AI transfer/payment tool and receipts. | Saved-payee tools and bill-payment simulation. |
| Transfers | Immediate moves with shared limits; new schedule read. | AI schedule create/cancel and recurrence. |
| International money | Currency accounts/internal FX with commit-time checks. | AI conversion previews and remittance simulation. |
| Loans | Calculators and saved-estimate reads. | Demo application/status/disbursement. |
| Credit | Debt tracking, calculators and AI debt payments. | Simulated credit facility/statements. |
| Mortgages | Affordability/payment estimates. | Application simulation, amortization and comparisons. |
| Business banking | Accounts/invoices/expenses/team records; new AI summary. | AI write tools and shared-user approvals. |
| Stocks | Quote/portfolio reads and simulated trades; corrected routing/confirmation. | Richer order previews/states. |
| ETFs | Instruments and generic quote/trade tools. | Sourced exposure/fee comparisons. |
| Funds | Instruments and generic quote/trade tools. | Fund-specific discovery/pricing/settlement. |
| Crypto | Simulated holdings/internal sends; AI wallet/history read and chart fixes. | Approved AI send tools. |
| Portfolio management | Funding, holdings, watchlist, corrected charts; AI read/move/trade. | Allocation/rebalance previews and contribution-adjusted returns. |
| Financial insights | Spending, budget, debt and net-worth calculations. | More timestamped drill-down cards and insight preferences. |
| Financial education | Articles; new guide tool and linked offline answers. | Topic search, calculator links and broader grounded explanations. |

## Upgrade notes

1. Privately back up database/session files before upgrading. Never commit raw SQL exports, credential hashes, recovery codes or environment files. Startup applies schema migrations. Only disposable databases were used here.
2. Added `idempotent_requests`, `users.last_active_at` and `user_preferences.assistant_revision`. Data exports use `schemaVersion: 2` and include schedules, AI chats, business records, crypto history, watchlist, notifications and support requests. Credential secrets are excluded.
3. Production requires independent random `SESSION_SECRET` and `TWO_FACTOR_KEY` values, each at least 32 characters. Existing placeholder configurations fail startup.
4. To change authenticator encryption keys, temporarily set `TWO_FACTOR_PREVIOUS_KEY` to the old `TWO_FACTOR_KEY`. If secrets used the fallback, set it to the **old** `SESSION_SECRET` instead. Set the new independent key. Startup decrypts all affected rows before any changes, re-encrypts them and advances authentication versions. Wrong old keys abort without changes; persistence failure aborts startup. After a successful start and private backup, remove `TWO_FACTOR_PREVIOUS_KEY`. Keep the old value securely for backup recovery. Do not discard an old key without migration.
5. API clients should send `Idempotency-Key` or a body `requestKey`: 8–128 letters, digits, underscores or hyphens. Reuse it for retries; use a new key for an intentional new operation. Changed bodies or unresolved pending reservations return 409. Check the ledger before preparing another operation after an uncertain outcome.
6. Storage remains intended for one Willow process. Unkeyed writes and coalesced sessions have a short crash window; atomic file replacement is not an fsync guarantee. A transactional database is needed before relying on this architecture for a shared production financial system.

## Checks

- `npm run check`: lint clean; **221 Node tests pass**, including three DOM interaction tests for history, balance cards/New chat, request-key reuse and terminal approvals.
- Installed Python runtime requirements in an isolated Python 3.12 environment: **46 tests pass**. yfinance 1.7.0 import and provider adapter smoke passed.
- Regression coverage includes offline funds/quotes; all five AI writes; one-time approval; autonomy changes; wrong/correct key rotation; suspended traders; competing/frozen FX; funded upgrades; received crypto and dated cash charts; replay; secondary snapshot failure; invalid dates/types; exports; and guest retention.
- Production startup smoke passed: independent secrets, readiness, file-backed sessions and graceful shutdown with a disposable database. Missing/placeholder/shared configuration tests pass.
- `git diff --check` clean. No live accounts or deployment used.
- Chromium installation failed: no new browser screenshots, viewport matrix or accessibility audit are claimed. DOM tests do not validate layout. Real Ollama quality, live Yahoo quotes and load behavior were not exercised.
