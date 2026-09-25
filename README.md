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
- **Accounts** — View checking and savings account details
- **Transfers** — Send money between accounts or to other customers (daily limit: $25,000)
- **Deposits & Withdrawals** — Manage account funds with daily limits and optional descriptions
- **Transaction History** — Filterable, paginated list of all transactions
- **Statements** — Generate and download PDF account statements by date range
- **Card Management** — View, freeze/unfreeze, and report debit cards
- **Notifications** — Real-time alerts for account activity
- **Profile Editing** — Update your full name and phone number from Settings
- **Security Center** — View recent login history and active sessions; change password
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
# DAILY_DEPOSIT_LIMIT_CENTS=5000000      # $50,000 (default)
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
