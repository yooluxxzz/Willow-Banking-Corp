# Testing Willow — step-by-step guide

This guide is for whoever tests Willow. It assumes no knowledge of the code.

**What Willow is about.** Willow is a demonstration bank built around two ideas:
- **Financial literacy:** people understand their money as they use it. Budgets are checked every night, net worth is shown over time, debts come with payoff estimates, and insights are explained in plain words.
- **Private AI:** Ask Willow explains your own numbers. It runs on your own computer through Ollama, and without Ollama it still answers from your figures.

Follow the guide from top to bottom:

- **Part A** (install and start) takes about 10 minutes.
- **Part B** (the guided test) takes about 40 minutes. Every step says what to do and what you should see.
- **Parts C–F** are optional extras, automated checks and help when something goes wrong.

> **Everything is simulated.** Willow is a fictional bank built as a software demonstration. No real money, card, bank or exchange is involved. Use made-up names, emails such as `alex@example.test`, and a password you don't use anywhere else.

---

## Contents

- [Part A — Install and start](#part-a--install-and-start)
- [Part B — Guided test](#part-b--guided-test)
- [Part C — Optional: live market data with Python](#part-c--optional-live-market-data-with-python)
- [Part D — Optional: Ask Willow, the local AI assistant](#part-d--optional-ask-willow-the-local-ai-assistant)
- [Part E — Automated checks](#part-e--automated-checks)
- [Part F — Troubleshooting and starting over](#part-f--troubleshooting-and-starting-over)
- [What is real and what is simulated](#what-is-real-and-what-is-simulated)

---

## Part A — Install and start

### A1. What you need

| Needed | Why | Where to get it |
| --- | --- | --- |
| **Node.js 22 or 24 (LTS)** — required | Runs Willow. Any version from 20.19 works. | [nodejs.org](https://nodejs.org) → download the **LTS** installer and accept the defaults. |
| A modern browser — required | Chrome, Edge, Firefox or Safari. | — |
| Internet — for some steps | Installing (first time only), stock prices and exchange rates. Everything else works offline. | — |
| Git — optional | To download the code. You can download a ZIP instead. | [git-scm.com](https://git-scm.com/downloads) |
| Python 3.9+ — optional | More reliable market data (Part C). | [python.org](https://www.python.org/downloads/) |
| Ollama — optional | The AI assistant (Part D). About 2 GB of disk; 8 GB of memory is recommended. | [ollama.com](https://ollama.com/download) |

To check Node.js, open a **new** terminal (see A2) and type `node --version`. It should print `v22…` or `v24…` (or at least `v20.19`).

### A2. Get the code and open a terminal in it

**With Git:**

```
git clone https://github.com/yooluxxzz/Willow-Banking-Corp.git
cd Willow-Banking-Corp
```

**Without Git:** on the GitHub page click **Code → Download ZIP**, then unzip it (Windows: right-click → *Extract All*). Open a terminal in the unzipped folder — the one that contains `package.json`:

- **Windows:** open the folder in File Explorer, click the address bar, type `powershell` and press Enter.
- **macOS:** open Terminal, type `cd ` (with a space), drag the folder onto the Terminal window and press Enter.
- **Linux:** right-click inside the folder → *Open in Terminal*.

> If GitHub shows "404", the repository is private. Ask the owner to add your GitHub account, or to send you the ZIP.

### A3. Install

```
npm install
```

This takes about a minute the first time and ends with `found 0 vulnerabilities`.

> **Windows:** if PowerShell says *"running scripts is disabled on this system"*, type `npm.cmd install` instead (and `npm.cmd start` in A4), or use **Command Prompt** instead of PowerShell.

### A4. Start Willow

```
npm start
```

No configuration file is needed. After a few seconds you should see:

```
[Server] Initializing database...
[Server] Checking admin account...
[Admin] ┌─────────────────────────────────────────────────────────────┐
[Admin] │ Admin sign-in for this copy of Willow                       │
[Admin] │   Email:    admin@willow.test                               │
[Admin] │   Password: Willow-XXXX-XXXX-XXXX                           │
[Admin] │   Sign in at http://localhost:3000/login, then open /admin. │
[Admin] │   Saved in data/admin-credentials.txt (ignored by Git).     │
[Admin] └─────────────────────────────────────────────────────────────┘
[Server] Willow Banking Corp. running at http://localhost:3000
[Server] Environment: development
[Assistant] Ask Willow gives quick answers from each customer's figures (Ollama is not running). …
[Market service] …
```

- **Keep this window open** while you test. Press **Ctrl+C** in it to stop Willow.
- **Write down the admin password** from the box (you need it in test B13). It is also saved in the file `data/admin-credentials.txt` inside the project folder. The box appears only on the first start; later starts print where the password is saved.
- The `[Assistant]` and `[Market service]` lines describe the optional extras. It is fine if Ask Willow is on quick answers or the market service isn't running.
- Windows may ask whether Node.js may use the network. Either answer works for testing on this computer.

Now open **http://localhost:3000** in your browser.

---

## Part B — Guided test

Do the tests in order: later tests use money and accounts from earlier ones, and the expected amounts assume you followed every step exactly. The first time you open each page, its sections fade in as you scroll to them; that is intentional.

### B1. Public website (3 min)

**Do**
1. On the home page, scroll slowly to the bottom.
2. Open each menu in the header: **Money, Wealth, Borrow, Business, Explore**. Close each with **Esc**.
3. Click the moon icon to switch to dark mode, then reload the page.
4. Make the browser window narrow, like a phone (or press **F12** and click the phone/tablet icon to use device mode).

**You should see**
- Each section fades in as you reach it, with a brief soft highlight.
- Menus open and close with the mouse and with the keyboard (**Tab**, **Enter**, **Esc**).
- Dark mode changes every color and is still on after reloading.
- At phone width the header becomes a menu button that opens a full-screen menu, and nothing scrolls sideways.

### B2. Open an account (3 min)

**Do**
1. Click **Open an account** (top right of the home page).
2. Complete the six steps:
   - **Welcome** → *Let's begin*.
   - **About you** → a made-up full name, an email such as `alex@example.test` and any country.
   - **Account** → *Personal*.
   - **Security** → a password with at least 8 characters, an uppercase letter, a lowercase letter and a number (for example `Willow-Test-2026`), typed twice. Tick the terms box.
   - **Verify** → a pretend identity check. Click the button to open the account.
   - **Done.**
3. Continue to your dashboard.

**You should see**
- Each field is checked as you type, with clear messages.
- The dashboard (**Home**) shows **$0.00** and a short *Get started* list. Nothing is pre-filled: no money, no savings account, no card.

> **Shortcuts:** on the sign-in page, **Explore as a guest** creates an empty, temporary profile in one click. Next to it, **explore a sample profile** creates one that already has four months of example activity (see B15). Guests can keep their profile later by adding an email and password in Settings.

### B3. Add money (2 min)

**Do**
1. On Home, click **Add money**.
2. Type `2500` as the amount and `Salary` as the note, then click **Review** and **Add money**.

**You should see**
- A receipt, then Home shows **$2,500.00**.
- The bell (top right) shows a new notification.
- **Accounts → Checking account** lists the $2,500.00 deposit.

### B4. Open savings and move money between your accounts (3 min)

**Do**
1. **Accounts → Open an account** → *Savings* → **Continue** → name it `Rainy day` → **Review** → tick *"I understand this is a simulated account"* → **Open demo account**.
2. **Payments** → the **My accounts** tab → choose *Rainy day* → **Continue** → `400` → **Continue** → choose *Checking account* → **Review** → **Send money**.

**You should see**
- Checking **$2,100.00** and Rainy day **$400.00** (Home and Accounts).
- The move appears in both accounts' activity.

### B5. Pay another customer (4 min)

Payments only go to customers that really exist in this copy of Willow, so first create a second one.

**Do**
1. Open a **private window** (Chrome/Edge: **Ctrl+Shift+N**, Mac: **Cmd+Shift+N**; Firefox: **Ctrl/Cmd+Shift+P**), go to **http://localhost:3000/register** and open a second account, for example *Ben Carter*, `ben@example.test`.
2. Back in the first window: **Payments** → type Ben's email → **Check** → **Continue** → `125` → **Continue** → choose *Checking account* → **Review** → **Send money**.
3. Try an email that doesn't exist, such as `nobody@example.test`.

**You should see**
- After **Check**, the recipient shows as **"Ben C."** (names are shortened for privacy).
- A receipt with a reference number. Your checking account is now **$1,975.00**.
- In Ben's window, Home shows **$125.00** and his bell has a notification about the payment.
- The unknown email is refused.

### B6. Budgets (3 min)

**Do**
1. **Budgets → New budget**: name `Groceries`, *What it covers*: **Groceries**, *How often it resets*: **Monthly** (the default), limit `150` → **Save budget**.
2. **Accounts → Checking account → Withdraw**: amount `140`, *What was it for?* **Groceries** → **Review** → **Withdraw**.
3. Go back to **Budgets**.

**You should see**
- *Groceries* shows **$140 of $150** spent with the badge **Close** (a budget is *Close* from 85% of its limit and *Over* once spending passes the limit), and how much is left per day.
- Budget alerts are sent by the daily check (every night at 23:55, and when Willow starts). You will trigger it yourself in test B13.

### B7. Debts and net worth (4 min)

**Do**
1. **Debts → Add a debt**: name `Visa card`, owed today `1200`, interest rate `22.9`, minimum payment `40` → save.
2. On the debt, **Record a payment**: `100`, *Paid from* **Checking account** → save.
3. **Net worth → Add an asset**: name `Car`, type **Vehicle**, worth today `9500` → save.

**You should see**
- The debt now shows **$1,100.00** owed, with a payoff estimate and its monthly interest.
- **Net worth: $10,535.00** = accounts $2,135.00 (checking $1,735 + savings $400) + car $9,500 − card $1,100.
- What you own and owe as two rings, a history chart, and money in and out by month.

### B8. Investing (4 min)

**Do**
1. **Portfolio → Add cash**: `300` from *Checking account* → **Add cash**.
2. **Markets** → open **Apple (AAPL)** → **Buy** → leave **USD** selected and type `100` → **Review order** → **Confirm simulated buy**.

**You should see**
- Investing cash starts at **$0** and becomes **$300.00**. Checking shows the move ("investing"), and net worth doesn't change (the money just moved).
- With internet: delayed real prices and charts. The order fills at the price shown, and Apple appears in Portfolio with its value and return.
- Without internet, or if Yahoo Finance is blocked: Willow uses **real prices saved earlier**, labelled *"Prices saved <date>"*. The order screen says the order will use the saved price, and the receipt says *(saved price)*. Willow never invents a price.

### B9. Cards (2 min)

**Do**
1. **Cards → New card** → keep *Virtual*, card name `Online` → **Create card**.
2. Click **Freeze** and confirm. Move the **Daily spending limit** slider and click **Save limit**. Switch off **Contactless** and click **Save settings**. Reload the page.

**You should see**
- The card exists only after you order it.
- Freezing and every setting take effect immediately and are still there after reloading.

### B10. Business (4 min)

**Do**
1. **Business → Expenses & budgets** → **Open business checking** → confirm.
2. **Payments → My accounts**: move `200` from *Checking account* to the business account.
3. **Business → Expenses & budgets → Log an expense**: paid to `Print shop`, `45.50`, *Pay from* the business account → **Save expense**.
4. **Business → Invoices → New invoice**: any customer name, description and amount → **Create invoice**. Then click **Mark paid** on it and confirm.

**You should see**
- The business account drops to **$154.50** and the expense is listed by category.
- The paid invoice adds its amount to business checking, and the business overview charts update.

### B11. Statements, activity and export (2 min)

**Do**
1. **Statements** → choose *Checking account* → **View statement** → **Download PDF**.
2. **Transactions** → search or filter by type → **Export CSV**.

**You should see**
- A statement with opening and closing balances, money in and out and every completed transaction, and the same as a PDF.
- A CSV file of the matching transactions that opens in Excel, Numbers or Google Sheets.

### B12. Privacy, security and settings (4 min)

**Do**
1. Click the **eye icon** in the top bar. Look at Home, Net worth and the account picker on **Withdraw**. Click the eye again.
2. **Security**: review the checklist. Optionally turn on **two-step verification** with an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…): scan the QR code and type the 6-digit code.
3. **Settings → Recovery codes**: confirm with your password → **Create new codes** → **Download**. In **Alerts**, switch one off.
4. Note your **customer ID** in Settings (it starts with `WB`). **Sign out** (avatar menu, top right). On the sign-in page, enter the customer ID instead of the email with a wrong password, and click **Sign in** twice. Then sign in with the right password.

**You should see**
- With the eye on, every amount, chart axis and chart tooltip is blurred, and account pickers stop showing balances. The setting is remembered on this device.
- With two-step verification on, sign-in asks for the code (a recovery code also works).
- Sign-in works with the customer ID. A wrong password shows an error, and from the second wrong try it also says how many attempts are left. After 5 wrong attempts that profile is paused for 15 minutes.
- If you leave Willow idle for 30 minutes, it warns you and then signs you out.

### B13. Admin console (3 min)

**Do**
1. In a private window, sign in with the **admin** email and password from Part A (`data/admin-credentials.txt`) and open **http://localhost:3000/admin**.
2. In **System**, click **Run daily checks now**.
3. In **Customers**, search for Ben → **Manage** → type a reason → **Suspend** → **Confirm**. Try to sign in as Ben (in a private window). Then **Manage → Reactivate → Confirm**, and sign in as Ben again.
4. Open the **Audit log** and filter it.

**You should see**
- The overview counts, the customer list and the latest transactions.
- After running the daily checks: the result appears in the System panel, and the first customer's bell gets a **budget alert** for *Groceries* (from B6).
- A suspended customer can't sign in; reactivating restores access.
- The audit log lists sign-ins, payments, admin actions and the daily checks.

### B14. Ask Willow without any set-up (3 min)

**Do**
1. Click **Ask Willow** in the top bar (or press **Ctrl+K**, **Cmd+K** on a Mac).
2. Click the suggestion **Which debt should I pay off first?**, then ask *How much have I spent this month?* and *Any tips for my money?*

**You should see**
- Without Ollama, the panel says **"Quick answers, worked out directly from your Willow records"**, and offers **Get full AI answers on this computer** (Part D).
- The answers use your real figures and link to the related pages:
  - **Debt:** you owe **$1,100.00** on the Visa card, with its monthly interest and how long the minimum payment would take.
  - **Spending:** **$410.50 across 4 payments** this month. That's the $140 groceries withdrawal, the $125 to Ben, the $100 card payment and the $45.50 business expense; moves between your own accounts and into investing don't count.
- With two or more debts (as in the sample profile, B15), the debt answer also explains the "avalanche" and "snowball" ways of paying them off.

### B15. Sample profile (3 min)

**Do**
1. Sign out. On the sign-in page, click **explore a sample profile** (under *Explore as a guest*).
2. Look at **Home**, **Net worth**, **Budgets**, **Debts**, **Business** and **Portfolio**, and ask Ask Willow *Any tips for my money?*

**You should see**
- A banner on every page: **"Sample profile. The activity here is example data…"**.
- Four months of activity: salary, rent, bills, everyday spending, monthly savings, a small design business, two debts with payments, a net-worth history chart, budgets (one is over its limit), goals and investing.
- Everything follows the same rules as your own profile. Balances add up to their transactions, and the money is just as simulated.

### B16. Keyboard and accessibility (2 min)

**Do**
1. Using only the keyboard (**Tab**, **Shift+Tab**, **Enter**, **Space**, **Esc**, arrow keys in tabs and menus), send yourself a transfer between your accounts.
2. Turn on *Reduce motion* in your operating system and reload any page.

**You should see**
- A clearly visible focus outline everywhere. Dialogs keep focus inside them and return it when they close.
- With reduced motion, animations are switched off and every section is visible straight away.

---

## Part C — Optional: live market data with Python

Without Python, Willow fetches delayed prices directly from Yahoo Finance's public chart service. With Python it uses the [yfinance](https://github.com/ranaroussi/yfinance) library through a small built-in service, which gives fuller data (company details, news, more reliable exchange rates). Willow starts and stops that service by itself.

1. Install **Python 3.9 or newer** from [python.org](https://www.python.org/downloads/). On Windows, tick **"Add python.exe to PATH"** in the installer.
2. Stop Willow (**Ctrl+C**) and run:

   ```
   npm run setup:python
   ```

3. Start Willow again with `npm start`. You should see:

   ```
   [Market service] Started (pid …) at http://127.0.0.1:8765.
   [Market service] Ready (Python 3.x.x).
   ```

If `npm run setup:python` fails with **"externally-managed-environment"** (common with Homebrew Python on macOS and on Linux), install into a virtual environment and start Willow from the same terminal:

```
python3 -m venv .venv
source .venv/bin/activate
npm run setup:python
npm start
```

Market data is delayed third-party data, shown for illustration. If your network blocks Yahoo Finance, Willow uses the real prices saved in the project (labelled *"Prices saved <date>"*). With internet, `npm run prices:save` refreshes those saved prices.

---

## Part D — Optional: full AI answers in Ask Willow

Without any set-up, Ask Willow gives quick answers worked out from your figures (B14). With [Ollama](https://ollama.com), it uses a language model on your own computer to answer any question about your money in its own words. Nothing is sent to a cloud service.

1. Install Ollama from [ollama.com/download](https://ollama.com/download) (Windows and macOS installers start it automatically; on Linux run `curl -fsSL https://ollama.com/install.sh | sh`).
2. Download a model (about 2 GB):

   ```
   ollama pull llama3.2
   ```

   On a computer with less than 8 GB of memory, use the smaller `ollama pull llama3.2:1b` instead.
3. In the Willow folder, check the setup (Willow doesn't need to be running):

   ```
   npm run assistant:check
   ```

   It checks that Ollama is reachable, which model Willow will use, how long the model takes to load, and asks it one test question. It ends with **"Ask Willow is ready"** or tells you exactly what to fix.
4. In Willow, click **Ask Willow** in the top bar (or press **Ctrl+K**, **Cmd+K** on a Mac). The panel should say **"AI running on this computer with llama3.2…"**. If it still says *Quick answers*, open **Get full AI answers on this computer** and click **Check again**; Willow also notices by itself within 30 seconds.

**Try asking**

- *How much did I spend this month?*
- *Am I on track with my budgets?*
- *What is my net worth, and what makes it up?*
- *Which debt costs me the most in interest?*

**You should see**

- The first answer can take 10–60 seconds while the model loads; later ones are faster. Answers appear word by word.
- Answers use your real figures (for example the $140 groceries spending from B6) and end with links to the related pages.
- It gives information, not advice: it won't recommend investments or predict prices. Each customer can ask 20 questions every 5 minutes.
- If the model fails before answering (for example, not enough memory), you still get a quick answer, with a note saying why the AI couldn't answer.

---

## Part E — Automated checks

In the Willow folder (Willow doesn't need to be running):

| Command | What it does | Expected result |
| --- | --- | --- |
| `npm run check` | Code style check (ESLint), then all Node tests | No lint errors, then `# fail 0` (about 30 seconds). There are 192 tests; Windows runs 188, because four tests of the Python bridge need a Unix shell. |
| `npm run test:python` | The 42 tests of the Python market-data service (needs Python, not yfinance) | `Ran 42 tests … OK` |
| `npm run test:coverage` | The Node tests with a coverage report (Node 22 or newer) | About 87% of lines covered |

The tests never use the internet or your Willow data: each one runs against its own temporary database. The same checks run on Linux, Windows and macOS for every push to GitHub (`.github/workflows/ci.yml`).

---

## Part F — Troubleshooting and starting over

| What you see | What to do |
| --- | --- |
| `node` or `npm` "is not recognized" / "command not found" | Install Node.js (Part A1), then **close and reopen** the terminal. |
| PowerShell: "running scripts is disabled on this system" | Use `npm.cmd install` and `npm.cmd start`, or Command Prompt. |
| "Port 3000 is already in use" | Another program (perhaps another copy of Willow) uses it. Close it, or start on port 3001 — PowerShell: `$env:PORT=3001; npm start` · Command Prompt: `set PORT=3001 && npm start` · macOS/Linux: `PORT=3001 npm start` — then open http://localhost:3001. |
| Prices say *"Prices saved <date>"* | Live prices can't be reached (no internet, or Yahoo Finance is blocked), so Willow uses real prices saved earlier. Orders still work. With internet, prices go live again by themselves. |
| "Market data temporarily unavailable" | Neither live nor saved prices are available for that item. Check the connection and click **Retry**. |
| `[Market service] yfinance isn't installed …` | Run `npm run setup:python` and restart Willow. |
| "externally-managed-environment" | Use the virtual environment steps in Part C. |
| Ask Willow says *Quick answers* | That's expected without Ollama. For full AI answers, follow Part D, then click **Check again**. |
| The assistant's first answer is very slow or times out | The model is still loading. Ask again, or use the smaller model (`ollama pull llama3.2:1b`). `npm run assistant:check` shows what is wrong. |
| "Too many attempts" when signing in | 5 wrong passwords pause that profile for 15 minutes, and 10 failed sign-ins from one computer pause sign-in for 15 minutes. Wait, or restart Willow (this clears both). |
| Signed out unexpectedly | Sessions end after 30 minutes without activity (a warning appears a minute before). |
| Lost the admin password | It is in `data/admin-credentials.txt`. |

**Starting over with an empty Willow:** stop Willow (**Ctrl+C**), delete the files `willow.db` and `sessions.db` in the `data` folder, and run `npm start` again. Willow creates a fresh database and a new admin password.

**Where Willow keeps data:** everything is in the `data` folder of the project: the database (`willow.db`), sign-in sessions (`sessions.db`), the generated admin password and the secret for the market-data service. Git ignores this folder.

---

## What is real and what is simulated

| Real | Simulated |
| --- | --- |
| The software: accounts and a full transaction ledger, payments between customers, budgets with nightly checks, net worth, debts, cards and their controls, statements, two-step verification, sessions, the admin console and audit log | All money. Balances start at $0 and only change when you add money, pay or move it. |
| Delayed stock, fund, crypto and exchange-rate data from Yahoo Finance, or real prices saved earlier when it can't be reached | Every order, trade, conversion and card. Nothing reaches a bank, exchange, card network or blockchain. |
| The AI assistant, running locally through Ollama, and the quick answers calculated from your records | The identity check during sign-up. |
| | The activity in a **sample profile**, which is labelled as example data. |
| | Emails and text messages: none are sent. |

Apart from the labelled sample profile, nothing in Willow is made up: every figure, chart and insight comes from what you entered while testing.
