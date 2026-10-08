/**
 * Willow assistant tools.
 *
 * Read tools run immediately because they only inspect the signed-in customer's
 * own records. State-changing tools are never run from model output alone:
 * the route stores a short-lived pending action and requires an explicit
 * confirmation before calling the existing banking services.
 */
'use strict';

const { getDb } = require('../database');
const { getUserAccounts, getTotalBalance } = require('./account');
const hub = require('./hub');
const budgets = require('./budgets');
const networth = require('./networth');
const portfolio = require('./demo-portfolio');
const goals = require('./goals');
const marketData = require('./market-data');
const { executeTransfer } = require('./transfer');
const { formatCurrency } = require('../middleware/validation');
const { ValidationError } = require('../errors');

const READ_TOOLS = new Set([
    'cards',
    'scheduled_transfers',
    'business',
    'crypto_wallet',
    'education',
    'accounts',
    'finances',
    'portfolio',
    'stock_quote',
    'debts',
    'loans',
    'transactions',
    'budgets',
    'goals',
]);

const WRITE_TOOLS = new Set([
    'transfer',
    'pay_debt',
    'move_investing_cash',
    'trade',
    'create_goal',
]);

const usd = cents => formatCurrency(Number(cents || 0), 'USD');
const compact = value => String(value || '').replace(/\s+/g, ' ').trim();

function accountRows(userId) {
    return getDb().prepare("SELECT id, account_type, purpose, nickname, account_number, currency, balance, available_balance, status FROM accounts WHERE user_id = ? AND status = 'active' ORDER BY id").all(userId);
}

function plannerContext(userId) {
    const plannerAccounts = accountRows(userId);
    const plannerDebts = networth.listDebts(userId);
    const instruments = marketData.listInstruments().filter(item => item.tradable).slice(0, 120);
    const goalsList = goals.listGoals(userId);
    return [
        'ACTION DATA (only for choosing tools; IDs are internal and must never be exposed unless needed in a confirmation receipt):',
        'Accounts:',
        ...(plannerAccounts.length ? plannerAccounts.map(a => `- id=${a.id}; name=${a.nickname || (a.purpose === 'business' ? 'Business checking' : a.account_type === 'savings' ? 'Savings' : 'Checking')}; last4=${String(a.account_number).slice(-4)}; ${a.currency}; available=${formatCurrency(a.available_balance, a.currency)}`) : ['- none']),
        'Debts:',
        ...(plannerDebts.length ? plannerDebts.map(d => `- id=${d.id}; name=${d.name}; kind=${d.kind}; balance=${usd(d.balanceCents)}; APR=${d.apr}%`) : ['- none']),
        'Goals:',
        ...(goalsList.length ? goalsList.map(g => `- id=${g.id}; name=${g.name}; target=${usd(g.target_cents)}; accountId=${g.account_id || 'none'}`) : ['- none']),
        'Tradable symbols:',
        ...(instruments.length ? instruments.map(i => `- ${i.symbol}: ${i.name}`) : ['- unavailable']),
    ].join('\n');
}

function detectReadIntent(question) {
    const text = String(question || '').trim().toLowerCase();
    // Explicit requests to change records must reach the planner, not a read shortcut.
    if (isWriteRequest(text)) return null;
    if (/\b(my cards?|debit cards?|card settings|card status)\b/.test(text)) return 'cards';
    if (/\b(scheduled|upcoming transfers|standing orders)\b/.test(text)) return 'scheduled_transfers';
    if (/\b(business|invoices?|receivables)\b/.test(text)) return 'business';
    if (/\b(crypto wallet|wallet history|crypto transfers)\b/.test(text)) return 'crypto_wallet';
    if (/\b(education|learn about|explain (stocks|etfs|funds|interest)|what is compound interest)\b/.test(text)) return 'education';
    if (/\b(stock price|share price|quote)\b|\bprice\b.*\b(stock|share|ticker)\b/.test(text) || (/\bprice\b/.test(text) && quoteArgs(text))) return 'stock_quote';
    if (/\b(balance|available funds|bank account funds|check my funds|how much money|how much do i have|what(?:'s| is) in (my )?(checking|savings|accounts?))\b/.test(text) || (/\bfunds\b/.test(text) && /\b(bank|account|checking|savings)\b/.test(text))) return 'accounts';
    if (/\b(finances?|financial picture|money overview|overall money|how am i doing financially)\b/.test(text)) return 'finances';
    if (/\b(my )?(stocks?|shares|portfolio|holdings|investments?)\b/.test(text)) return 'portfolio';
    if (/\b(loan|mortgage|borrowing|borrowed|loan estimate)\b/.test(text)) return 'loans';
    if (/\b(debt|debts|owe|interest rate|payoff)\b/.test(text)) return 'debts';
    if (/\b(transaction|transactions|recent activity|what did i spend|latest payments)\b/.test(text)) return 'transactions';
    if (/\b(budget|budgets|budget limit|on track)\b/.test(text)) return 'budgets';
    if (/\b(goal|goals|savings goal)\b/.test(text)) return 'goals';
    return null;
}

function isWriteRequest(question) {
    const text = String(question || '').toLowerCase();
    if (/\b(don['’]t|do not|never|avoid)\b[^.!?]*\b(send|transfer|move|pay|buy|sell|purchase|create|execute|run)\b/.test(text)) return false;
    if (/^\s*(how|what|why|which|should i|can i|could i)\b/.test(text)) return false;
    if (/\b(explain|teach|describe)\b|\b(tell|show) me how\b/.test(text)) return false;
    return /\b(send|transfer|move|pay|make a payment|buy|sell|purchase|create|set up|add a goal|put money into investing|move money out of investing)\b/.test(text);
}

function quoteArgs(question) {
    const text = String(question || '').toUpperCase();
    const tokens = new Set(text.match(/[A-Z0-9][A-Z0-9.^=-]*/g) || []);
    const matches = marketData.listInstruments().filter(item => tokens.has(item.symbol.toUpperCase()));
    return matches.length === 1 ? { symbol: matches[0].symbol } : null;
}

function renderAccounts(result) {
    if (!result.accounts.length) return 'You don’t have any active accounts.';
    return ['Your active Willow demo accounts:', ...result.accounts.map(a => `- ${a.name} ··${a.last4} (${a.currency}): balance ${a.balance}; available ${a.available}.`), 'From your Willow records. Balances are simulated; currencies are shown separately.'].join('\n');
}

function renderRead(tool, data) {
    switch (tool) {
    case 'stock_quote': return data.unavailable || !Number.isFinite(data.price) ? `A price for ${data.symbol} is unavailable right now.` : `${data.symbol} (${data.name}): ${formatCurrency(Math.round(data.price * 100), data.currency)} ${data.currency}. ${data.saved ? 'Saved price' : data.stale ? 'Cached price' : 'Latest available price'}${data.asOf ? ' as of ' + data.asOf : ''}. Simulated orders use this provider price.`;
    case 'cards': return data.cards.length ? data.cards.map(c => `- ${c.name} ··${c.last4}: ${c.status}; daily limit ${c.dailyLimit} (${c.currency}).`).join('\n') : 'You don’t have any demo cards. Order one from Cards.';
    case 'scheduled_transfers': return data.transfers.length ? data.transfers.slice(0, 10).map(t => `- ${formatCurrency(t.amount, t.currency)} (${t.currency}) on ${t.scheduled_for.slice(0, 10)}: ${t.status}.`).join('\n') : 'You don’t have any scheduled transfers.';
    case 'business': return `Business USD accounts: ${usd(data.availableCents)} available. This month: ${usd(data.revenueCents)} revenue and ${usd(data.expensesCents)} expenses. ${data.invoices.length} invoices recorded.`;
    case 'crypto_wallet': return data.holdings.length ? data.holdings.map(h => `- ${h.symbol}: ${h.quantity} simulated units.`).join('\n') : 'Your simulated crypto wallet is empty.';
    case 'education': return ['Willow education guides:', ...data.guides.map(g => `- ${g.title}: ${g.summary}`)].join('\n');
    default: return null;
    }
}

function accounts(userId) {
    const rows = getUserAccounts(userId).filter(a => a.status === 'active');
    const totals = getTotalBalance(userId);
    return {
        simulated: true,
        totals,
        accounts: rows.map(a => ({
            id: a.id,
            name: a.displayName,
            type: a.productLabel,
            currency: a.currency,
            balance: a.balanceFormatted,
            available: a.availableBalanceFormatted,
            last4: String(a.account_number).slice(-4),
        })),
    };
}

async function finances(userId) {
    const summary = hub.getSummary(userId);
    const worth = await networth.computeNetWorth(userId).catch(() => null);
    const budgetRows = [...budgets.listBudgets(userId, 'personal'), ...budgets.listBudgets(userId, 'business')];
    const savings = getUserAccounts(userId).filter(a => a.status === 'active' && a.currency === 'USD' && a.account_type === 'savings')
        .reduce((sum, a) => sum + a.balance, 0);
    const openDebts = networth.listDebts(userId).filter(d => d.status === 'open');
    return {
        simulated: true,
        balance: getTotalBalance(userId),
        thisMonth: {
            moneyInCents: summary.month.earnedCents,
            spendingCents: summary.month.spendingCents,
            spendingCount: summary.spendingCount,
        },
        savingsCents: savings,
        netWorthCents: worth ? worth.netCents : null,
        debtsCents: openDebts.reduce((sum, d) => sum + d.balanceCents, 0),
        budgets: budgetRows.map(b => ({ name: b.name, status: b.status, spentCents: b.spentCents, limitCents: b.limitCents })),
        topSpending: summary.categories.slice(0, 5).map(c => ({ category: c.label, cents: c.cents })),
    };
}

async function portfolioRead(userId) {
    const valuation = await portfolio.valuePortfolio(userId);
    return {
        simulated: true,
        total: valuation.total,
        cash: valuation.cash,
        marketValue: valuation.marketValue,
        unrealized: valuation.unrealized,
        unrealizedPercent: valuation.unrealizedPercent,
        holdings: valuation.holdings.map(h => ({
            symbol: h.symbol,
            name: h.name,
            quantity: h.quantity,
            price: h.price,
            marketValue: h.marketValue,
            gain: h.gain,
            gainPercent: h.gainPercent,
            priceAvailable: h.priceAvailable,
            stale: h.stale,
            saved: h.saved,
        })),
        watchlist: portfolio.getWatchlist(userId),
        pricing: valuation.pricing,
    };
}

async function stockQuote(symbol) {
    const normalized = String(symbol || '').trim().toUpperCase();
    const instrument = marketData.getInstrument(normalized);
    if (!instrument) throw new ValidationError('Choose a supported stock, ETF, fund or crypto symbol.');
    const quote = await marketData.getLatestQuote(instrument.symbol);
    return {
        simulated: true,
        symbol: instrument.symbol,
        name: instrument.name,
        type: instrument.type,
        price: quote.price,
        currency: quote.currency || 'USD',
        change: quote.change,
        changePercent: quote.changePercent,
        asOf: quote.asOf || null,
        stale: Boolean(quote.stale),
        saved: Boolean(quote.saved),
        unavailable: Boolean(quote.unavailable),
    };
}

function debts(userId) {
    return { simulated: true, debts: networth.listDebts(userId) };
}

function loans(userId) {
    const db = getDb();
    const estimates = db.prepare('SELECT id, kind, label, principal_cents, annual_rate_bps, term_months, monthly_payment_cents, total_interest_cents, created_at FROM loan_estimates WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 20').all(userId);
    const active = networth.listDebts(userId).filter(d => ['personal', 'mortgage', 'student_loan', 'auto'].includes(d.kind));
    return { simulated: true, activeLoans: active, savedEstimates: estimates, applicationAvailable: false };
}

function transactions(userId, limit = 10) {
    const n = Math.min(20, Math.max(1, Number(limit) || 10));
    const rows = getDb().prepare(`SELECT t.id, t.created_at, t.description, t.counterparty, t.type, t.direction, t.amount, t.currency, a.nickname, a.account_type
        FROM transactions t JOIN accounts a ON a.id = t.account_id
        WHERE a.user_id = ? AND t.status = 'completed'
        ORDER BY t.created_at DESC, t.id DESC LIMIT ?`).all(userId, n);
    return {
        simulated: true,
        transactions: rows.map(row => ({
            ...row,
            account: row.nickname || (row.account_type === 'savings' ? 'Savings' : 'Checking'),
            amountFormatted: formatCurrency(row.amount, row.currency),
        })),
    };
}

function budgetRead(userId) {
    return { simulated: true, budgets: [...budgets.listBudgets(userId, 'personal'), ...budgets.listBudgets(userId, 'business')] };
}

function goalsRead(userId) {
    return { simulated: true, goals: goals.listGoals(userId) };
}

async function read(userId, tool, args = {}) {
    if (!READ_TOOLS.has(tool)) throw new ValidationError('That assistant read tool is not available.');
    switch (tool) {
    case 'cards': return { cards: require('./card').getUserCards(userId).map(c => ({ id: c.id, name: c.nickname || c.form + ' debit card', last4: c.last_four, status: c.status, currency: c.currency, dailyLimit: formatCurrency(c.daily_limit, c.currency) })) };
    case 'scheduled_transfers': return { transfers: require('./scheduled-transfers').listScheduledTransfers(userId) };
    case 'business': return require('./business').getDashboard(userId);
    case 'crypto_wallet': return { ...require('./crypto-wallet').getCryptoWallet(userId), history: require('./crypto-wallet').getCryptoHistory(userId) };
    case 'education': return { guides: require('../content/articles').filter(a => a.kind === 'guide').slice(0, 10).map(a => ({ title: a.title, summary: a.dek, href: '/learn/' + a.slug })) };
    case 'accounts': return accounts(userId);
    case 'finances': return finances(userId);
    case 'portfolio': return portfolioRead(userId);
    case 'stock_quote': return stockQuote(args.symbol);
    case 'debts': return debts(userId);
    case 'loans': return loans(userId);
    case 'transactions': return transactions(userId, args.limit);
    case 'budgets': return budgetRead(userId);
    case 'goals': return goalsRead(userId);
    default: throw new ValidationError('That assistant read tool is not available.');
    }
}

function validateAccount(userId, accountId) {
    const id = Number(accountId);
    if (!Number.isSafeInteger(id) || id <= 0) throw new ValidationError('Choose a valid account.');
    const account = getDb().prepare("SELECT * FROM accounts WHERE id = ? AND user_id = ? AND status = 'active'").get(id, userId);
    if (!account) throw new ValidationError('The selected account is not available.');
    return account;
}

function transfer(userId, args = {}) {
    const amount = args.amount;
    const from = validateAccount(userId, args.fromAccountId);
    const destination = (() => {
        if (args.toAccountId !== undefined && args.toAccountId !== null && args.toAccountId !== '') {
            const to = validateAccount(userId, args.toAccountId);
            if (to.id === from.id) throw new ValidationError('The source and destination accounts must be different.');
            return {
                toAccountNumber: to.account_number,
                recipientName: to.nickname || (to.account_type === 'savings' ? 'Savings' : 'Checking'),
            };
        }
        if (typeof args.recipientEmail === 'string' && args.recipientEmail.trim()) {
            const recipient = getDb().prepare("SELECT id, full_name, email, status FROM users WHERE email = ? COLLATE NOCASE").get(args.recipientEmail.trim());
            if (!recipient || recipient.status !== 'active') throw new ValidationError('No active Willow customer was found for that email.');
            const target = getDb().prepare("SELECT account_number FROM accounts WHERE user_id = ? AND account_type = 'checking' AND status = 'active' AND currency = ? ORDER BY id LIMIT 1").get(recipient.id, from.currency || 'USD');
            if (!target) throw new ValidationError('That recipient does not have a compatible checking account.');
            return {
                toAccountNumber: target.account_number,
                recipientName: recipient.full_name,
            };
        }
        throw new ValidationError('Choose a destination account or recipient email.');
    })();

    const result = executeTransfer({
        fromAccountId: from.id,
        toAccountNumber: destination.toAccountNumber,
        amount,
        description: typeof args.description === 'string' ? compact(args.description).slice(0, 200) : '',
        userId,
    });
    if (result.error) throw new ValidationError(result.error, 400, result.code);
    return { ...result, amountFormatted: formatCurrency(result.amountCents, result.currency), recipientName: destination.recipientName };
}

function payDebt(userId, args = {}) {
    const debtId = Number(args.debtId);
    const accountId = Number(args.accountId);
    validateAccount(userId, accountId);
    if (!Number.isSafeInteger(debtId) || debtId <= 0) throw new ValidationError('Choose a valid debt.');
    networth.getDebt(userId, debtId);
    const result = networth.recordPayment(userId, debtId, { amount: args.amount, accountId, note: typeof args.note === 'string' ? compact(args.note).slice(0, 120) : 'Paid by Ask Willow' });
    return { debt: result, amountFormatted: formatCurrency(Number(args.amount) * 100, 'USD') };
}

function moveInvestingCash(userId, args = {}) {
    const account = validateAccount(userId, args.accountId);
    if (account.currency !== 'USD') throw new ValidationError('Investing cash transfers require a USD account.');
    return portfolio.moveCash(userId, { accountId: account.id, direction: args.direction, amount: args.amount });
}

async function trade(userId, args = {}) {
    const instrument = marketData.getInstrument(args.symbol);
    if (!instrument || !instrument.tradable) throw new ValidationError('Choose a supported demo asset.');
    const quote = await marketData.getLatestQuote(instrument.symbol);
    require('./mutation-guard').assertUser(userId);
    const result = portfolio.executeTrade(userId, {
        symbol: instrument.symbol,
        side: args.side,
        quantity: args.quantity,
        amount: args.amount,
        price: quote.price,
    });
    return {
        ...result,
        trade: result.trade,
        priceSource: quote.source,
        quoteAsOf: quote.asOf || null,
        stale: Boolean(quote.stale),
        saved: Boolean(quote.saved),
    };
}

function createGoal(userId, args = {}) {
    const result = goals.createGoal(userId, {
        name: args.name,
        category: args.category,
        targetAmount: args.target,
        accountId: args.accountId,
    });
    return { goal: result };
}

async function execute(userId, tool, args = {}) {
    require('./mutation-guard').assertUser(userId);
    if (!WRITE_TOOLS.has(tool)) throw new ValidationError('That assistant action is not available.');
    switch (tool) {
    case 'transfer': return transfer(userId, args);
    case 'pay_debt': return payDebt(userId, args);
    case 'move_investing_cash': return moveInvestingCash(userId, args);
    case 'trade': return trade(userId, args);
    case 'create_goal': return createGoal(userId, args);
    default: throw new ValidationError('That assistant action is not available.');
    }
}

function actionTitle(tool, args = {}) {
    const amount = args.amount !== undefined ? formatCurrency(Number(args.amount) * 100, 'USD') : '';
    switch (tool) {
    case 'transfer':
        return `Move ${amount} from the selected account to the selected destination`;
    case 'pay_debt':
        return `Pay ${amount} toward the selected debt`;
    case 'move_investing_cash':
        return `${args.direction === 'out' ? 'Move' : 'Add'} ${amount} ${args.direction === 'out' ? 'from investing to an account' : 'from an account to investing'}`;
    case 'trade':
        return `${String(args.side || '').toLowerCase() === 'sell' ? 'Sell' : 'Buy'} ${args.quantity ? Number(args.quantity) : amount} of ${String(args.symbol || '').toUpperCase()}`;
    case 'create_goal':
        return `Create the savings goal “${compact(args.name).slice(0, 60)}”`;
    default:
        return 'Run this Willow action';
    }
}

function actionPreview(userId, tool, args = {}) {
    const db = getDb();
    const accountLabel = id => {
        const account = db.prepare("SELECT nickname, account_type, purpose, account_number, currency FROM accounts WHERE id = ? AND user_id = ? AND status = 'active'").get(Number(id), userId);
        if (!account) return 'Unavailable account';
        return `${account.nickname || (account.purpose === 'business' ? 'Business checking' : account.account_type === 'savings' ? 'Savings' : 'Checking')} ··${String(account.account_number).slice(-4)} (${account.currency})`;
    };
    const currency = tool === 'transfer' ? validateAccount(userId, args.fromAccountId).currency : 'USD';
    const amount = args.amount !== undefined ? formatCurrency(Number(args.amount) * 100, currency) : '';
    switch (tool) {
    case 'transfer':
        return args.toAccountId
            ? `Move ${amount} from ${accountLabel(args.fromAccountId)} to ${accountLabel(args.toAccountId)}`
            : `Send ${amount} from ${accountLabel(args.fromAccountId)} to ${compact(args.recipientEmail)}`;
    case 'pay_debt': {
        const debt = Number(args.debtId) > 0 ? networth.getDebt(userId, Number(args.debtId)) : null;
        return debt ? `Pay ${amount} toward “${debt.name}” from ${accountLabel(args.accountId)}` : actionTitle(tool, args);
    }
    case 'move_investing_cash':
        return args.direction === 'out'
            ? `Move ${amount} from investing cash to ${accountLabel(args.accountId)}`
            : `Move ${amount} from ${accountLabel(args.accountId)} into investing cash`;
    case 'trade':
        return `${String(args.side || '').toLowerCase() === 'sell' ? 'Sell' : 'Buy'} ${args.quantity ? Number(args.quantity) + ' units' : amount} of ${String(args.symbol || '').toUpperCase()}`;
    case 'create_goal':
        return `Create “${compact(args.name).slice(0, 60)}” with a ${formatCurrency(Number(args.target) * 100, 'USD')} target funded by ${accountLabel(args.accountId)}`;
    default:
        return actionTitle(tool, args);
    }
}


function isReadTool(tool) { return READ_TOOLS.has(tool); }
function isWriteTool(tool) { return WRITE_TOOLS.has(tool); }

module.exports = { isWriteRequest, quoteArgs, renderRead, renderAccounts, READ_TOOLS, WRITE_TOOLS, plannerContext, detectReadIntent, read, execute, title: actionTitle, actionTitle, actionPreview, isReadTool, isWriteTool };
