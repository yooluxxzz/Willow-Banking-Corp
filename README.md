# 🌿 Willow Banking Corp.

A full-stack demonstration banking platform built with **Node.js**, **Express**, and **SQLite**. Features real account management, secure authentication, fund transfers, card management, and a professional admin dashboard.

> **Note**: This is a fictional/demo platform for educational and demonstration purposes only. It is not a real financial institution.

---

## 📋 Table of Contents

- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Running the Application](#running-the-application)
- [Demo Accounts](#demo-accounts)
- [Project Structure](#project-structure)
- [Technology Stack](#technology-stack)
- [Security](#security)

---

## ✨ Features

### Customer Portal
- **Dashboard** — Overview of all accounts, balances, and recent transactions
- **Accounts** — View checking and savings account details
- **Transfers** — Send money between accounts or to other customers
- **Deposits & Withdrawals** — Manage account funds
- **Transaction History** — Filterable list of all transactions with export
- **Statements** — Generate and download PDF account statements
- **Card Management** — View, freeze/unfreeze, and report debit cards
- **Notifications** — Real-time alerts for account activity
- **Security Settings** — Password management and security overview
- **Profile Settings** — Update personal information

### Admin Dashboard
- User management (view, suspend, activate accounts)
- System-wide statistics
- Audit log of all administrative actions
- Manual balance adjustments with logging

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
```

- `SESSION_SECRET` — A random string used to secure session cookies (use any long random string)
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` — Credentials for the admin account (created automatically on first boot)
- `DATABASE_PATH` — Where the SQLite database file is stored
- `PORT` — The port the server runs on (defaults to 3000)

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

You should see:
```
[Server] Willow Banking Corp. running at http://localhost:3000
```

### Open in Browser

Navigate to [http://localhost:3000](http://localhost:3000) in your web browser.

### Stop the Server

Press `Ctrl + C` in the terminal to stop the server.

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
│   ├── css/style.css          # Complete design system
│   ├── js/app.js              # Client-side JavaScript
│   └── images/logo.svg        # Willow tree logo
├── views/                     # EJS templates
│   ├── partials/              # Reusable template components
│   │   ├── header.ejs         # HTML head
│   │   ├── sidebar.ejs        # App sidebar navigation
│   │   ├── public-nav.ejs     # Public pages navigation
│   │   └── public-footer.ejs  # Public pages footer
│   ├── landing.ejs            # Home page
│   ├── login.ejs              # Sign in
│   ├── register.ejs           # Create account
│   ├── dashboard.ejs          # Customer dashboard
│   ├── accounts.ejs           # Account details
│   ├── transfers.ejs          # Money transfers
│   ├── deposits.ejs           # Deposit funds
│   ├── withdrawals.ejs        # Withdraw funds
│   ├── transactions.ejs       # Transaction history
│   ├── statements.ejs         # PDF statements
│   ├── cards.ejs              # Card management
│   ├── notifications.ejs      # Alerts
│   ├── security.ejs           # Security settings
│   ├── settings.ejs           # Profile settings
│   ├── about.ejs              # About Us
│   ├── careers.ejs            # Careers
│   ├── press.ejs              # Press & Media
│   ├── contact.ejs            # Contact Us
│   ├── privacy.ejs            # Privacy Policy
│   ├── terms.ejs              # Terms of Service
│   ├── security-info.ejs      # Public security info
│   ├── compliance.ejs         # Regulatory compliance
│   ├── error.ejs              # Error page
│   └── admin/
│       └── dashboard.ejs      # Admin dashboard
└── src/
    ├── config.js              # App configuration
    ├── database.js            # SQLite database (sql.js)
    ├── seed.js                # Demo data seeder
    ├── session-store.js       # Session storage
    ├── middleware/
    │   ├── auth.js            # Authentication guards
    │   └── security.js        # CSRF, headers, XSS
    ├── routes/
    │   ├── auth.js            # Login/register/logout API
    │   ├── api.js             # Banking operations API
    │   └── pages.js           # Page rendering routes
    └── services/
        ├── auth.js            # User authentication logic
        ├── account.js         # Account management
        ├── transaction.js     # Transaction processing
        ├── card.js            # Card management
        ├── notification.js    # Notification system
        └── audit.js           # Audit logging
```

---

## 🛠 Technology Stack

| Layer        | Technology                                      |
|--------------|------------------------------------------------|
| Runtime      | Node.js                                        |
| Framework    | Express.js                                     |
| Database     | SQLite via sql.js (pure WebAssembly, no native builds) |
| Templating   | EJS (Embedded JavaScript)                      |
| Auth         | bcryptjs (pure JS password hashing)            |
| Sessions     | express-session with custom SQLite store        |
| PDF          | PDFKit                                         |
| Styling      | Vanilla CSS with custom design system          |
| Fonts        | Inter, JetBrains Mono (Google Fonts)           |

---

## 🔒 Security

This application implements the following security measures:

- **Password Hashing** — bcrypt with salt rounds (never stored in plaintext)
- **CSRF Protection** — Anti-forgery tokens on all state-changing requests
- **Rate Limiting** — Prevents brute-force attacks on auth endpoints
- **Secure Headers** — X-Content-Type-Options, X-Frame-Options, X-XSS-Protection
- **HTTP-Only Sessions** — Server-side session management
- **Input Validation** — Server-side validation on all API endpoints
- **Audit Logging** — Complete trail of administrative actions

---

## 📄 License

This project is provided for educational and demonstration purposes.
