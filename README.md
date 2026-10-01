# 🌿 Willow Banking Corp.

A full-stack demonstration banking platform built with **Node.js**, **Express**, and **SQLite**. Features real account management, secure authentication, fund transfers, card management, and a professional admin dashboard.

> **Note**: This is a fictional/demo platform for educational and demonstration purposes only. It is not a real financial institution.

---

## 📋 Table of Contents

- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Running the Application](#running-the-application)
- [Testing](#testing)
- [Demo Accounts](#demo-accounts)
- [Project Structure](#project-structure)
- [Technology Stack](#technology-stack)
- [Security](#security)

---

## ✨ Features

### Customer Portal
- **Dashboard** — Overview of all accounts, balances, and recent transactions
- **Accounts** — Name checking and savings accounts, view balances and recent activity, and open account-specific transaction history
- **Transfers** — Send money between accounts or to other customers (daily limit: $25,000; includes own-account transfers with review and confirmation)
- **Deposits & Withdrawals** — Manage account funds with daily limits and optional descriptions
- **Transaction History** — Filter by account, date, type, status, description or reference; sort and paginate with shareable filter URLs
- **Statements** — Generate and download PDF account statements by date range
- **Card Management** — View, freeze/unfreeze, and report debit cards
- **Notifications** — Real-time alerts for account activity
- **Profile Editing** — Update your full name and phone number from Settings
- **Security Center** — View recent login history and active sessions; change password
- **Session Controls** — Recognize browser/device labels, identify the current session, and sign out an individual other session
- **Dark / Light Mode** — Fully themed UI with persistent theme preference

### Admin Dashboard
- User management (view, suspend, reactivate, delete with 3-day grace period)
- System-wide statistics (total users, accounts, balances, transactions)
- Paginated user list with search filtering
- Audit log of all administrative and financial actions
- Manual balance adjustments with logging (search by Account ID or Account Number)
- Scheduled account deletion with auto-execution on server restart

### Public Pages
- Landing page with feature highlights
- Product detail pages (Checking, Savings, Debit Cards, Transfers)
- About Us, Careers, Press, Contact pages
- Privacy Policy, Terms of Service, Security, Compliance pages

---

## 📦 Prerequisites

Before you begin, make sure you have the following installed on your computer:

### 1. Install Node.js

Download and install **Node.js** (version 18 or later recommended):

- **Windows / macOS**: Go to [https://nodejs.org](https://nodejs.org) and download the **LTS** (Long Term Support) version. Run the installer and follow the prompts.
- **Linux (Ubuntu/Debian)**:
  ```bash
  curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
  sudo apt-get install -y nodejs
  ```

To verify the installation, open a terminal/command prompt and run:
```bash
node --version
npm --version
```
Both commands should print a version number (e.g., `v20.x.x` and `10.x.x`).

### 2. Install Git (Optional)

If you want to clone the repository:
- **Windows**: Download from [https://git-scm.com](https://git-scm.com)
- **macOS**: `xcode-select --install`
- **Linux**: `sudo apt-get install git`

---

## 🚀 Installation

### Step 1: Get the Project Files

**Option A — Clone with Git:**
```bash
git clone <repository-url>
cd "Willow Banking Corp"
```

**Option B — Download ZIP:**
Download and extract the project folder, then open a terminal in that folder.

### Step 2: Install Dependencies

```bash
npm install
```

This will automatically download all required packages. No native compilation tools are needed — all dependencies are pure JavaScript/WebAssembly.

### Step 3: Set Up Environment Variables

Create a `.env` file in the project root (or use the existing one):

```env
SESSION_SECRET=your-secret-key-change-this-in-production
ADMIN_EMAIL=admin@willowbank.com
ADMIN_PASSWORD=Admin123!
DATABASE_PATH=./data/willow.db
PORT=3000

# Optional: override daily transaction limits (values in cents)
# DAILY_WITHDRAWAL_LIMIT_CENTS=1000000   # $10,000 (default)
# DAILY_TRANSFER_LIMIT_CENTS=2500000     # $25,000 (default)
# Deposits currently use a fixed $10,000 daily cap in src/routes/deposits.js
```

| Variable | Description | Default |
|---|---|---|
| `SESSION_SECRET` | Secret used to sign session cookies | `dev-secret-...` (insecure) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Admin account credentials (created on first boot) | — |
| `DATABASE_PATH` | Path to the SQLite database file | `./data/willow.db` |
| `PORT` | Port the server listens on | `3000` |
| `DAILY_*_LIMIT_CENTS` | Per-day transaction caps (in cents) | see above |

### Step 4: Seed the Demo Data (Optional but Recommended)

```bash
npm run seed
```

This populates the database with **5 demo customer accounts**, sample transactions, and notifications so you can explore the platform immediately.

---

## ▶️ Running the Application

### Start the Server

```bash
npm start
```

Or in development mode (auto-restart on file changes):
```bash
npm run dev
```

You should see:
```
[Server] Willow Banking Corp. running at http://localhost:3000
```

### Open in Browser

Navigate to [http://localhost:3000](http://localhost:3000) in your web browser.

### Stop the Server

Press `Ctrl + C` in the terminal to stop the server.

---

## 🧪 Testing

The project includes an automated test suite using Node.js's built-in test runner (requires Node 18+).

### Run All Tests

```bash
npm test
```

Tests run against an **in-memory database** — no test data touches your real database file.

### What's Covered

| Test File | Coverage |
|---|---|
| `tests/auth.test.js` | Registration, login, logout, account lockout, password change |
| `tests/financial.test.js` | Deposits, withdrawals, transfers, daily limit enforcement |
| `tests/admin.test.js` | Admin-only route protection, user management, stats endpoint |
| `tests/accounts.test.js` | Account names, owned detail pages, filter validation and stable pagination |
| `tests/sessions.test.js` | Individual session revocation, ownership, CSRF, replay and session metadata |
| `tests/sign-in.test.js`, `tests/auth-client.test.js` | Safe return destinations, expired sessions, sign-out failures and client retries |

Each test creates a fresh isolated database and handles CSRF tokens automatically.

---

## 🔑 Demo Accounts

After running `npm run seed`, the following accounts are available:

| Role     | Email                    | Password    |
|----------|--------------------------|-------------|
| Admin    | admin@willowbank.com     | Admin123!   |
| Customer | alice@example.com        | Password1!  |
| Customer | bob@example.com          | Password1!  |
| Customer | carol@example.com        | Password1!  |
| Customer | dave@example.com         | Password1!  |
| Customer | eve@example.com          | Password1!  |

---

## 📁 Project Structure

```
Willow Banking Corp/
├── server.js                  # Application entry point
├── package.json               # Dependencies and scripts
├── .env                       # Environment variables
├── data/                      # SQLite database files
├── public/                    # Static assets
│   ├── css/style.css          # Complete design system (dark/light mode, utilities)
│   ├── js/app.js              # Client-side JS (theme toggle, toasts, confirm dialogs)
│   └── images/logo.svg        # Willow tree logo
├── tests/                     # Automated test suite (Node --test)
│   ├── setup.js               # Shared in-memory DB + authenticated agent helpers
│   ├── auth.test.js           # Auth flow tests
│   ├── financial.test.js      # Financial operation tests
│   └── admin.test.js          # Admin authorization tests
├── views/                     # EJS templates
│   ├── partials/              # Reusable template components (header, sidebar, footer)
│   ├── landing.ejs            # Home page
│   ├── dashboard.ejs          # Customer dashboard
│   ├── transactions.ejs       # Transaction history (paginated, filterable)
│   ├── statements.ejs         # PDF statements
│   ├── security.ejs           # Login history & active sessions
│   ├── settings.ejs           # Editable profile & password change
│   └── admin/dashboard.ejs   # Admin dashboard
└── src/
    ├── config.js              # Centralised config with env var overrides
    ├── database.js            # SQLite database (sql.js, atomic writes)
    ├── session-store.js       # Custom SQLite-backed session store
    ├── middleware/
    │   ├── auth.js            # Auth & authorization guards
    │   ├── security.js        # CSRF, CSP, security headers
    │   └── validation.js      # Input validation & password rules
    ├── routes/
    │   ├── auth.js            # Login / register / logout / profile update API
    │   ├── deposits.js        # Deposit API (daily limit enforced)
    │   ├── withdrawals.js     # Withdrawal API (daily limit enforced)
    │   ├── transfers.js       # Transfer API (daily limit enforced)
    │   ├── transactions.js    # Transaction history API
    │   ├── cards.js           # Card management API
    │   ├── statements.js      # PDF statement generation
    │   ├── admin.js           # Admin dashboard API
    │   └── pages.js           # Page rendering routes
    └── services/
        ├── auth.js            # Auth logic (bcrypt, account lockout)
        ├── account.js         # Account management
        ├── transfer.js        # Transfer execution (atomic)
        ├── card.js            # Card management
        ├── notification.js    # Notification system
        └── audit.js           # Audit logging
```

---

## 🛠 Technology Stack

| Layer        | Technology |
|--------------|------------|
| Runtime      | Node.js 18+ |
| Framework    | Express.js |
| Database     | SQLite via sql.js (pure WebAssembly, no native builds) |
| Templating   | EJS (Embedded JavaScript) |
| Auth         | bcryptjs (pure JS password hashing) |
| Sessions     | express-session with custom SQLite-backed store |
| Rate Limiting| express-rate-limit |
| PDF          | PDFKit |
| Styling      | Vanilla CSS with custom design system |
| Fonts        | Inter, JetBrains Mono (Google Fonts) |
| Testing      | Node.js built-in `node:test` + `supertest` |

---

## 🔒 Security

This application implements the following security measures:

- **Password Hashing** — bcrypt with 12 salt rounds (never stored in plaintext)
- **Password Complexity** — Requires min. 8 characters with uppercase, lowercase, and digit
- **Account Lockout** — Locks after 5 failed login attempts for 15 minutes
- **Session Fixation Protection** — Session ID regenerated on every login
- **CSRF Protection** — Anti-forgery tokens on all state-changing requests
- **Content Security Policy** — CSP header restricting scripts, styles, fonts, and images
- **Rate Limiting** — Brute-force protection on auth endpoints; 100 req/min globally
- **Secure Headers** — X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-Policy, Permissions-Policy, HSTS
- **HTTP-Only Sessions** — Server-side sessions with secure, HTTP-only cookie settings
- **Input Validation** — Server-side validation on all endpoints with parameterized SQL
- **Daily Transaction Limits** — $10,000 withdrawals / $25,000 transfers / $50,000 deposits (configurable via env)
- **Database Constraints** — `CHECK(balance >= 0)` prevents negative balances at the DB level
- **Atomic Database Writes** — Temp file + rename prevents DB corruption on crash
- **Audit Logging** — Complete trail of all financial and administrative actions
- **Startup Config Validation** — Warning on boot if default session secret or missing admin credentials are detected
- **Admin Safeguards** — Admins cannot modify or delete their own account

---

## 📄 License

This project is provided for educational and demonstration purposes.


## Updated Willow experience

The original Express/EJS/sql.js architecture and existing ledger, cards, statements,
admin and authentication routes are preserved. Public navigation now includes
/personal and /business. Business is explicitly a concept preview: no business
accounts, payroll, lending or merchant processing are implemented.

The homepage opens with the customer photograph and original headline. A sticky,
viewport-height hero holds its position while the user scrolls. At 30% of its
scroll sequence, the employee photograph takes over with a new headline,
account details and category links. Both photos and content panels crossfade
over 800ms using cubic-bezier(0.35, 0, 0, 1). Further scrolling holds scene two,
then releases the hero into the rest of the page. Scrolling up reverses it.
There is no timer, wheel interception or playback UI. Inactive copy is inert
and hidden from assistive technology. Reduced motion disables transitions;
short viewports use normal scrolling so all controls remain reachable.
Phones keep the photos above the copy within the same stage.
Both hero photos are local WebP assets with responsive variants, about 132 KiB
combined at full size. HERO_PHOTO_PROMPTS.md contains the two prompts and asset
manifest. Selected feature cards and the account preview have soft shadows and
a gentle CSS perspective hover on fine pointers only; touch and reduced-motion
layouts stay stable. Account and balance cards receive static soft shadows.
Sign-in and two-step registration share the forest/ivory identity, a vector willow
tree emblem, accessible password toggles and visible error feedback. New demo
registrations receive zero-balance checking and savings accounts. Existing users
retain their accounts; startup schema migrations preserve existing accounts and balances.

Transfers support either another demo customer by email or an owned destination
account ID. The UI snapshots details for review before confirmation; the server
validates ownership, status, amounts, available funds and daily transfer caps.
Success is displayed only after the atomic simulated ledger write succeeds.
Reload the transfer page before starting another transfer to refresh balances.

All funds, cards, deposits, withdrawals and transfers are simulated. This app has
no connection to a real bank or payment network. Do not enter real personal or
financial details. The contact form validates locally; it does not send or store
messages. The contact details are illustrative. Password recovery uses one-time backup codes generated in account settings.
No email recovery service is connected; save codes before losing account access.

### Local setup

Run npm ci (Node 18+), then npm start, and open http://localhost:3000.
Set SESSION_SECRET to a long random value. ADMIN_EMAIL and ADMIN_PASSWORD are
optional for local customer exploration; configure both if an admin is needed.
DATABASE_PATH defaults to ./data/willow.db, PORT to 3000 and NODE_ENV to development.
Production cookies require HTTPS when NODE_ENV=production. This educational app
still requires a production security review before any real financial use.

OPEN_BROWSER=true optionally opens the system browser on startup; the default
leaves browser navigation to you. DATABASE_PATH=:memory: creates a temporary
database without writing ledger data to disk. The application session store still
uses data/sessions.db; automated tests use a separate in-memory session store.

Deposits currently enforce a fixed $10,000 cap; the existing deposit configuration
variable is not wired into that route. Transfers use DAILY_TRANSFER_LIMIT_CENTS
(default 2500000). Do not assume unused environment variables change route behavior.

### Verification

npm test runs the original suite plus ownership, ledger consistency, malformed
request, CSRF and public page tests. There is no build, lint or type-check script
in this JavaScript/EJS project. Run node --check on changed JavaScript, and
git diff --check for patch whitespace. Tests use an in-memory ledger, without
attempting invalid :memory: filenames on Windows. The auth functional test
fixture raises its login limit to avoid exhausting the limiter across many tests;
the running application's rate limit is unchanged.

### Visual Prompts for Nano Banana

See [Visual Prompts for Nano Banana](VISUAL_PROMPTS.md) for seven detailed prompts,
expected filenames/dimensions, current photo mappings and responsive export notes.
Nano Banana is not connected. The hero pair was generated with the built-in image
tool; supporting photography still uses interim Unsplash assets.
Their availability depends on that external host. The tree logo is editable SVG,
and all interface text, balances and gradients are built in code.


## Account recovery and settings

In Settings, update your name and phone, change your password, generate eight
one-time backup codes, or sign out all other sessions. Save recovery codes before
you need them. Generating a replacement set invalidates all previous codes.
Use your email and one unused code at /forgot-password to set a new password.
Recovery ends all existing sessions; password changes retain the current session.
Passwords support 8–72 UTF-8 bytes with uppercase, lowercase and a number.

Recovery endpoints are CSRF protected and rate limited. Plaintext codes are shown
once and are never stored in the database or audit log. A lost password with no
saved code cannot be recovered through this demo's self-service flow.

See [database changes](docs/DATABASE_CHANGES.md) for migration and session-version
details, and [the work log](WORK_LOG.md) for the Git record of completed sessions.

## Account names and activity

Open Accounts and select an account to see its available balance, account-number
disclosure and five most recent transactions. Give it a name of up to 40 characters,
or save a blank name to restore its default. Names appear on the dashboard and in
transfer, deposit, withdrawal and activity selectors. Renaming does not change the
account number, ownership or balances and is recorded in the audit log.

Activity links preselect that account. Apply filters or clear them while retaining
the selected account. Successful searches keep the filters and page in the URL
for reloading or bookmarking; viewing the link still requires the owner's login.

## Session management and public disclosures

The Security page identifies the current session, shows approximate browser/device
labels and UTC sign-in times, and lets you sign out a specific other session.
Older sessions show a clear fallback when metadata is unavailable. Session listing
errors are distinguished from an empty list. The UI never receives raw session IDs.
Individual revocation writes a durable hash to the account database before removing
the session from its store, so a stale store write cannot restore access. This does
not cancel a request already executing when sign-out is requested.

Homepage trust disclosures and the linked privacy, compliance and security pages
describe the fictional demo, simulated funds, stored data and implemented controls.
They do not claim a banking license, deposit insurance or independent certification.

## Sign-in navigation

Opening a protected page while signed out preserves its path and filters through
sign-in. Return destinations are restricted to known Willow pages and checked
again after authentication; account ownership and admin permissions still apply.
No financial action is replayed. Expired or revoked sessions keep their page
destination when redirecting back to sign-in. API authentication failures return JSON.

Sign-out displays a success message only after the server confirms completion.
Network or session-store failures show an error and allow a retry without navigating
away. Duplicate sign-out clicks do not send overlapping requests. Sign-in and
sign-out screens use explicit status messages, and error toasts render text safely.
