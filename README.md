# Willow

**Your money. Moving forward.**

Willow is a fictional digital bank, investment platform and financial-intelligence app — a complete, working software demonstration. Everyday banking, cards, payments, currencies, a stocks-and-crypto trading simulator, goals, loan calculators, a small-business workspace and a “financial picture” assistant all live in one calm, consistent product.

> **Demo only.** Willow is not a bank, broker or payment provider. Every balance, card, payment, conversion, trade and identity check is simulated, and nothing reaches a bank, card network, exchange or blockchain. Market prices are delayed third-party data used for illustration. Use fictional details.

---

## Contents

1. [What’s inside](#whats-inside)
2. [Quick start](#quick-start)
3. [Market data service (yfinance)](#market-data-service-yfinance)
4. [Configuration](#configuration)
5. [Demo profiles](#demo-profiles)
6. [Testing](#testing)
7. [Architecture](#architecture)
8. [Security](#security)
9. [Documentation](#documentation)

## What’s inside

**Public website**
- Storytelling homepage with a five-scene crossfading hero (autoplay, pause on interaction, reduced-motion aware), goal picker, live delayed market panel and calls to action.
- Mega-menu navigation (Money, Wealth, Borrow, Business, Explore) with an accessible full-screen mobile menu.
- 18 product pages, Markets, Insights and Education articles, a searchable Help center with nine categories, and honest company, privacy, terms, compliance, security and “About the demo” pages.

**Authentication**
- Split-screen sign-in with email or customer ID, attempts-left warnings, paused/suspended/timeout states, two-step verification (TOTP) and backup codes, guest profiles and recovery-code password reset.
- Six-step sign-up: Welcome → About you → Account → Security → Verify (clearly simulated identity check) → Done, with optional sample activity.
- Idle sign-out after 30 minutes with a one-minute warning.

**Banking app**
- Home dashboard: balance, quick actions, accounts, month summary and charts, recent activity, insights, cards, goals, upcoming payments and the demo portfolio.
- Accounts in USD, EUR, GBP, MZN and ZAR; account details, renaming, statements (preview and PDF), searchable transactions with CSV export.
- Cards: physical and virtual, freeze/unfreeze, lost/stolen, replacement, online/contactless/ATM/international controls, daily limits, designs, card activity.
- Send money: recipient (saved payees, confirmation of payee) → amount → account → review → success receipt. Own-account moves, scheduled transfers and payees.
- International: currency balances, indicative rates and simulated conversions between your accounts.
- Willow Hub: net worth, composition, money movement, categories, investments, goals and insights, plus “Ask Willow” — answers computed only from your own records.
- Goals, loan and mortgage calculators with saved estimates, notifications, Security center (score, 2FA, sessions, card freeze, data export) and settings.
- Business workspace: dashboard, invoices (mark paid records a simulated payment), team invitations and business details.

**Wealth (simulated investing)**
- $100,000 of demo cash, portfolio dashboard with performance, allocation, holdings and activity.
- Markets with search, categories, sorting, watchlist, indices and popular stocks; stock and crypto detail pages with 1D–MAX charts, key stats, profile, news and your position.
- Buy/sell flows with simulated receipts: *“This is a simulated transaction. No real securities are purchased.”*

**Admin console** for customers (suspend, reactivate, delete), balance adjustments and the audit log.

## Quick start

Requirements: **Node.js 20+** (22 recommended) and, for live market data, **Python 3.9+**.

```bash
npm install
cp .env.example .env          # then set SESSION_SECRET, ADMIN_EMAIL and ADMIN_PASSWORD
npm start                     # http://localhost:3000
```

Optional:

```bash
npm run seed                  # demo customer with months of sample activity (prints its password)
npm run dev                   # restart on file changes
```

The SQLite database (`data/willow.db`) and session store are created on first start and migrated in place on later starts. They are ignored by Git.

## Market data service (yfinance)

Stock, ETF, fund, index, crypto and FX data come from a small Python service in `market-data-service/` that wraps the open-source [yfinance](https://github.com/ranaroussi/yfinance) library. The Node app calls it server-to-server; browsers never contact it.

```bash
python3 -m pip install -r market-data-service/requirements.txt
npm run market-service        # http://127.0.0.1:8765/health
```

Provider chain (`src/services/market-data.js`): yfinance service → Yahoo chart endpoint fallback (quotes and history) → last good cached value marked stale. Responses are cached (quotes 60s, history by range, profiles 12h, news 30m), concurrent requests are coalesced, and a failing provider is backed off. When nothing is available the UI shows **“Market data temporarily unavailable.”** — prices are never invented, and simulated trades and conversions are refused until fresh data returns.

## Configuration

All settings are environment variables; see [`.env.example`](.env.example) for the full list. The important ones:

| Variable | Purpose |
| --- | --- |
| `SESSION_SECRET` | Signs session cookies. Required in production. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Admin account created on first start. |
| `SESSION_IDLE_MINUTES` | Idle sign-out (default 30; `0` disables). |
| `GUEST_RETENTION_DAYS` | Unused guest profiles are deleted after this many days (default 7; `0` keeps them). |
| `TWO_FACTOR_KEY` | Key for encrypting authenticator secrets (defaults to the session secret). |
| `MARKET_DATA_PROVIDER` | `auto` (default), `service` or `yahoo-chart`. |
| `MARKET_DATA_SERVICE_URL`, `MARKET_DATA_TOKEN` | Where the Python service runs and the shared secret it expects. |
| `DATABASE_PATH` | SQLite file location. |

## Demo profiles

- **Guest profile:** on the sign-in page choose *Use another sign-in method → Explore as a guest*, or use the homepage call to action. Guests get sample activity and can keep the profile by adding their own email and password in Settings; unused guest profiles are deleted after 7 days.
- **Seeded customer:** `npm run seed` creates `demo@willow.test` (password printed once, or set `SEED_DEMO_PASSWORD`).
- **Admin:** the account from `ADMIN_EMAIL` / `ADMIN_PASSWORD` opens the admin console at `/admin`.
- Five demo customers (for example `maria.silva@community.willow.test`) exist so payments have someone to go to.

## Testing

```bash
npm test                      # Node integration and client tests (node:test, supertest, jsdom)
npm run test:python           # market-data service unit tests
npm run test:all              # both
```

Coverage includes authentication, sessions and idle timeout, 2FA, recovery, accounts and the ledger, transfers, cards, statements, goals, scheduled transfers, FX, crypto wallet, demo portfolio, the Hub assistant, business workspace, market-data providers and caching, the homepage hero and goal picker, sign-out client logic, and a crawl of every public and signed-in page that fails on broken internal links or placeholder output. Tests never reach the network.

## Architecture

```
server.js                    Startup: database, admin, demo customers, background jobs
src/app.js                   Express app factory (security headers, sessions, CSRF, routes)
src/config.js                Environment configuration
src/database.js              sql.js schema and in-place migrations
src/view-helpers.js          Template helpers (icons, money, dates, navigation)
src/content/                 Products, navigation, help, articles, instrument universe
src/routes/                  Site pages, app pages and JSON APIs
src/services/                Domain logic (ledger, cards, FX, portfolio, hub, business, 2FA…)
market-data-service/         Python yfinance service and its tests
views/                       EJS templates: home, product, explore, auth, app/*, info/*, partials
public/css/                  willow.css (design system), site, home, product, auth, app
public/js/                   app.js runtime, charts.js, and one script per page
tests/                       Node test suites
```

- **Real vs simulated data.** Banking records live in the ledger tables (`accounts`, `transactions`, `cards`…). The investing simulator uses separate `demo_*` tables and never touches the ledger. Market prices come only from the market-data layer.
- **Design system.** Tokens, components and the dark theme are in `public/css/willow.css`; see [WILLOW_BRAND_SPEC.md](WILLOW_BRAND_SPEC.md).
- **No third-party scripts.** Charts are in-house SVG; fonts are self-hosted; only homepage photography loads from Unsplash.

## Security

Passwords hashed with bcrypt; rate-limited sign-in with temporary lockout; session regeneration at sign-in, HTTP-only cookies, idle and absolute session expiry, per-session revocation and “sign out everywhere else”; optional TOTP two-step verification with encrypted secrets and single-use backup codes; CSRF tokens on every state-changing request; ownership checks on every account, card and payee; atomic ledger updates; a content security policy and other protective headers; and an audit log. No independent security review has been performed — see `/security-info` and `/compliance`.

## Documentation

- [WILLOW_BRAND_SPEC.md](WILLOW_BRAND_SPEC.md) — brand, design system and experience rules
- [docs/DATABASE_CHANGES.md](docs/DATABASE_CHANGES.md) — schema and migration history
- [market-data-service/README.md](market-data-service/README.md) — the market-data service
- [WORK_LOG.md](WORK_LOG.md) — work sessions and checks

## License

MIT. Mona Sans is used under the SIL Open Font License (see `public/fonts/OFL-MonaSans.txt`).
