# Willow

**Your money. Moving forward.**

Willow is a fictional digital bank, investment platform and financial-intelligence app — a complete, working software demonstration. Everyday banking, cards, payments, currencies, a stocks-and-crypto trading simulator, goals, loan calculators, budgets, debts and net worth, a small-business workspace and an optional local assistant all live in one calm, consistent product. Nothing is pre-filled: every balance and chart comes from what you add.

> **Demo only.** Willow is not a bank, broker or payment provider. Every balance, card, payment, conversion, trade and identity check is simulated, and nothing reaches a bank, card network, exchange or blockchain. Market prices are delayed third-party data used for illustration. Use fictional details.

---

## Contents

1. [What’s inside](#whats-inside)
2. [Your money, nothing made up](#your-money-nothing-made-up)
3. [Quick start](#quick-start)
4. [Market data and the Python bridge](#market-data-and-the-python-bridge)
5. [Local assistant (Ollama)](#local-assistant-ollama)
6. [Budgets and the nightly check](#budgets-and-the-nightly-check)
7. [Keeping the database in Git](#keeping-the-database-in-git)
8. [Configuration](#configuration)
9. [Profiles](#profiles)
10. [Testing](#testing)
11. [Architecture](#architecture)
12. [Security](#security)

## What’s inside

**Public website**
- Storytelling homepage with a five-scene crossfading hero (autoplay, pause on interaction, reduced-motion aware), goal picker, live delayed market panel and calls to action.
- Mega-menu navigation (Money, Wealth, Borrow, Business, Explore) with an accessible full-screen mobile menu.
- 18 product pages, Markets, Insights and Education articles, a searchable Help center and honest company, privacy, terms, compliance, security and “About the demo” pages.

**Authentication**
- Split-screen sign-in with email or customer ID, attempts-left warnings, paused/suspended/timeout states, two-step verification (TOTP) and backup codes, guest profiles and recovery-code password reset.
- Six-step sign-up: Welcome → About you → Account → Security → Verify (clearly simulated identity check) → Done.
- Idle sign-out after 30 minutes with a one-minute warning.

**Banking app**
- Home dashboard: balance, quick actions, a “get started” checklist until you’ve added money, opened a savings account and ordered a card, then accounts, month summary, recent activity, insights, cards, goals and upcoming payments.
- Accounts in USD, EUR, GBP, MZN and ZAR; account details, renaming, statements (preview and PDF), searchable transactions with CSV export.
- Cards — only when you order one: physical and virtual, freeze/unfreeze, lost/stolen, replacement, online/contactless/ATM/international controls, daily limits, designs.
- Send money to another registered Willow customer (by email) or between your own accounts: recipient → amount → account → review → receipt. Scheduled transfers and saved payees.
- International: currency balances, indicative rates and simulated conversions between your accounts.
- **Net worth:** your accounts, investing and the assets and debts you record, as one figure with what-you-own / what-you-owe donuts, daily history, money movement, spending by category and insights.
- **Budgets:** daily, weekly or monthly limits, overall or per category, measured against your real activity and checked every night.
- **Debts:** loans and card balances with payoff estimates and interest; record payments from a Willow account or made elsewhere.
- Goals, loan and mortgage calculators with saved estimates, notifications, Security center (score, 2FA, sessions, card freeze, full data export) and settings.
- **Business workspace:** dashboard, your own expense log (optionally paid from the business account), business budgets, invoices, team invitations and business details.
- **Ask Willow:** an optional assistant that runs on your own computer with Ollama and answers from your records only.

**Wealth (simulated investing)**
- Investing cash starts at $0 — move money in from your accounts and back out again. Portfolio dashboard with performance against what you put in, allocation, holdings and activity.
- Markets with search, categories, sorting, watchlist, indices and popular stocks; stock and crypto detail pages with 1D–MAX charts, key stats, profile, news and your position.
- Buy/sell flows with simulated receipts: *“This is a simulated transaction. No real securities are purchased.”*

**Admin console** for customers (suspend, reactivate, delete), balance adjustments and the audit log.

## Your money, nothing made up

Every figure comes from something you did:

- A new customer gets one empty checking account. **$0** until you add money; no savings account until you open one; **no card until you order one**.
- Investing starts at **$0** and is funded only from your own deposits (each move appears in the account’s history).
- Payments go only to customers who actually exist in this Willow — there are no pre-made recipients. Unknown emails are refused.
- Guest profiles start empty too, and are deleted after 7 unused days unless you keep them.
- Budgets, debts, assets, net worth, business expenses and goals are empty until you add them; charts and statistics are computed from what you record.

On upgrade, a one-time clean-up (`src/services/data-cleanup.js`) removes what earlier versions invented: the sample community customers, sample guest profiles, generated sample transactions (their effect on balances is reversed), sample goals, cards, invoices and team members, automatically issued cards and the old $100,000 practice cash. It runs once and is recorded in the audit log.

## Quick start

Requirements: **Node.js 20+** (22 recommended). Optional: **Python 3.9+** for live market data and **[Ollama](https://ollama.com)** for the assistant.

```bash
npm install
cp .env.example .env          # then set SESSION_SECRET, ADMIN_EMAIL and ADMIN_PASSWORD
npm start                     # http://localhost:3000
```

Optional extras, each picked up automatically on the next `npm start`:

```bash
python3 -m pip install -r market-data-service/requirements.txt   # live market data
ollama pull llama3.2                                             # local assistant
```

`npm run dev` restarts on file changes. The SQLite database (`data/willow.db`) and session store are created on first start and migrated in place on later starts.

## Market data and the Python bridge

Stock, ETF, fund, index, crypto and FX data come from a small Python service in `market-data-service/` that wraps the open-source [yfinance](https://github.com/ranaroussi/yfinance) library. The Node app talks to it over HTTP on localhost; browsers never contact it.

You don’t start it yourself. On start-up Willow (`src/services/market-service.js`):

1. checks `MARKET_DATA_SERVICE_URL/health` and reuses a service that is already running;
2. otherwise finds a Python that can import yfinance (`PYTHON`, then `python3`, then `python`) and launches `server.py`, or explains how to install what’s missing;
3. secures the bridge with a generated shared secret (`X-Willow-Service-Token`) unless `MARKET_DATA_TOKEN` is set;
4. restarts the service with back-off if it exits, and stops it when Willow stops.

`/health` on Willow reports the bridge’s state. Provider chain (`src/services/market-data.js`): yfinance service → Yahoo chart endpoint fallback (quotes and history) → last good cached value marked stale. Responses are cached and coalesced, and a failing provider is backed off. When nothing is available the UI shows **“Market data temporarily unavailable.”** — prices are never invented, and simulated trades and conversions are refused until fresh data returns.

## Local assistant (Ollama)

Ask Willow uses a language model running on the same computer through [Ollama](https://ollama.com). Nothing goes to a cloud service.

```bash
ollama pull llama3.2          # or qwen2.5, mistral, gemma2 … any chat model
ollama serve                  # if Ollama isn’t already running
```

- Willow uses the first installed model, or `OLLAMA_MODEL` if set. It checks Ollama at start-up and again (at most every 30 seconds) as pages load; the assistant button only appears while a model is reachable.
- With each question the model receives a short summary of **your own** records — balances, recent activity, budgets, debts, net worth, investing and business figures — and nothing about anyone else. Answers stream in as they are written.
- It gives information, not advice: it won’t predict markets or recommend trades. Questions are limited to 20 per 5 minutes per customer.

## Budgets and the nightly check

Create budgets on **Budgets** (personal) or **Business → Expenses & budgets**. Each has a period (daily, weekly from Monday, or monthly), a limit and optionally a category. Spending counts payments, withdrawals, money sent to other people, debt payments and logged business expenses from US dollar accounts; moves between your own accounts and currency conversions don’t count.

While Willow runs, a job at `NIGHTLY_CHECK_TIME` (default 23:55, local time) records how every budget stood that day and takes each customer’s daily net-worth snapshot. On start-up it catches up on days missed while it was off (up to 31). You get one notification per period when a budget passes 85% and one when it goes over.

## Keeping the database in Git

The live database file is ignored by Git, but its contents can be versioned as a readable SQL snapshot:

```bash
npm run db:save               # writes data/willow-snapshot.sql — commit it
npm run db:restore -- --force # replaces data/willow.db with the snapshot (keeps a .bak copy)
```

On a fresh clone with no database file, Willow restores the snapshot automatically on first start (`SNAPSHOT_AUTO_RESTORE=false` turns that off). The snapshot is deterministic, so diffs show exactly what changed. It contains everything customers entered plus hashed passwords and recovery codes — **keep the repository private** if you commit it.

## Configuration

All settings are environment variables; see [`.env.example`](.env.example) for the full list. The important ones:

| Variable | Purpose |
| --- | --- |
| `SESSION_SECRET` | Signs session cookies. Required in production. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Admin account created on first start. |
| `SESSION_IDLE_MINUTES` | Idle sign-out (default 30; `0` disables). |
| `GUEST_RETENTION_DAYS` | Unused guest profiles are deleted after this many days (default 7; `0` keeps them). |
| `TWO_FACTOR_KEY` | Key for encrypting authenticator secrets (defaults to the session secret). |
| `DATABASE_PATH`, `DATABASE_SNAPSHOT_PATH` | SQLite file and SQL snapshot locations. |
| `SNAPSHOT_AUTO_RESTORE` | Restore the snapshot when no database exists (default `true`). |
| `NIGHTLY_CHECK_TIME` | Local time for budget checks and net-worth snapshots (default `23:55`). |
| `MARKET_DATA_PROVIDER` | `auto` (default), `service` or `yahoo-chart`. |
| `MARKET_DATA_SERVICE_URL`, `MARKET_DATA_TOKEN` | Where the Python service runs and its shared secret (generated when unset). |
| `MARKET_SERVICE_AUTOSTART`, `PYTHON` | Start the Python service with Willow (default `true`) and which interpreter to use. |
| `OLLAMA_URL`, `OLLAMA_MODEL` | Local Ollama server (default `http://127.0.0.1:11434`) and model (default: first installed). |
| `ASSISTANT_ENABLED` | `false` hides the assistant even when Ollama is running. |

## Profiles

- **Your own profile:** sign up at `/register`. Everything starts at zero.
- **Guest profile:** on the sign-in page choose *Use another sign-in method → Explore as a guest*. Guests start with an empty account and can keep the profile by adding their own email and password in Settings; unused guest profiles are deleted after 7 days.
- **Admin:** the account from `ADMIN_EMAIL` / `ADMIN_PASSWORD` opens the admin console at `/admin`.
- To try payments, create two profiles and send money from one to the other by email.

## Testing

```bash
npm test                      # Node integration and client tests (node:test, supertest, jsdom)
npm run test:python           # market-data service unit tests
npm run test:all              # both
```

Coverage includes authentication, sessions and idle timeout, 2FA, recovery, empty new profiles, accounts and the ledger, transfers between real customers, cards on request, statements, goals, budgets and the nightly check, net worth, assets and debts, business expenses, scheduled transfers, FX, crypto wallet, investing funded from deposits, the assistant (against a stand-in Ollama), the Python bridge supervisor, database snapshots, market-data providers and caching, the homepage hero, and a crawl of every public and signed-in page that fails on broken internal links or placeholder output. Tests never reach the network.

## Architecture

```
server.js                    Startup: database, admin, Python bridge, nightly job, guest clean-up
src/app.js                   Express app factory (security headers, sessions, CSRF, routes)
src/config.js                Environment configuration
src/database.js              sql.js schema, in-place migrations, snapshot auto-restore
src/view-helpers.js          Template helpers (icons, money, dates, navigation)
src/content/                 Products, navigation, help, articles, instrument universe
src/routes/                  Site pages, app pages and JSON APIs
src/services/                Domain logic (ledger, cards, FX, portfolio, budgets, net worth,
                             business, assistant, market-service bridge, snapshot…)
scripts/db.js                db:save / db:restore
market-data-service/         Python yfinance service and its tests
views/                       EJS templates: home, product, explore, auth, app/*, info/*, partials
public/css/                  willow.css (design system), site, home, product, auth, app
public/js/                   app.js runtime, charts.js, and one script per page
tests/                       Node test suites
```

- **One ledger.** Every change to a balance is a transaction row: deposits, payments, investing cash moves (`INV-IN-`/`INV-OUT-`), business expenses paid from an account (`EXP-`), debt payments (`DBT-`) and conversions (`CNV-`). Holdings and trades live in the separate `demo_*` tables; prices come only from the market-data layer.
- **APIs.** Each page loads its data from JSON endpoints (`/api/budgets`, `/api/networth`, `/api/debts`, `/api/business/expenses`, `/api/wealth/cash`, `/api/assistant/chat` …) and updates without a reload.
- **Design system.** Tokens, components, attention animations and the dark theme are in `public/css/willow.css`; see [docs/WILLOW_BRAND_SPEC.md](docs/WILLOW_BRAND_SPEC.md).
- **No third-party scripts.** Charts are in-house SVG; fonts are self-hosted; only homepage photography loads from Unsplash.

## Security

Passwords hashed with bcrypt; rate-limited sign-in with temporary lockout; session regeneration at sign-in, HTTP-only cookies, idle and absolute session expiry, per-session revocation and “sign out everywhere else”; optional TOTP two-step verification with encrypted secrets and single-use backup codes; CSRF tokens on every state-changing request; ownership checks on every account, card, payee, budget, asset and debt; atomic ledger updates; an authenticated localhost bridge to the Python service; a content security policy and other protective headers; and an audit log. No independent security review has been performed — see `/security-info` and `/compliance`.

## Documentation

- [docs/WILLOW_BRAND_SPEC.md](docs/WILLOW_BRAND_SPEC.md) — brand, design system and experience rules
- [docs/DATABASE_CHANGES.md](docs/DATABASE_CHANGES.md) — schema and migration history
- [market-data-service/README.md](market-data-service/README.md) — the market-data service
- [WORK_LOG.md](WORK_LOG.md) — work sessions and checks

## License

MIT. Mona Sans is used under the SIL Open Font License (see `public/fonts/OFL-MonaSans.txt`).
