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
    const accounts = accountRows(userId);
    const debts = networth.listDebts(userId);
    const instruments = marketData.listInstruments().filter(item => item.tradable).slice(0, 120);
    const goalsList = goals.listGoals(userId);
    return [
        'ACTION DATA (only for choosing tools; IDs are internal and must never be exposed unless needed in a confirmation receipt):',
        'Accounts:',
        ...(accounts.length ? accounts.map(a => \`- id=\${a.id}; name=\${a.nickname || (a.purpose === 'business' ? 'Business checking' : a.account_type === 'savings' ? 'Savings' : 'Checking')}; last4=\${String(a.account_number).slice(-4)}; \${a.currency}; available=\${formatCurrency(a.available_balance, a.currency)}\`) : ['- none']),
        'Debts:',
        ...(debts.length ? debts.map(d => \`- id=\${d.id}; name=\${d.name}; kind=\${d.kind}; balance=\${usd(d.balanceCents)}; APR=\${d.apr}%\`) : ['- none']),
        'Goals:',
        ...(goalsList.length ? goalsList.map(g => \`- id=\${g.id}; name=\${g.name}; target=\${usd(g.target_cents)}; accountId=\${g.account_id || 'none'}\`) : ['- none']),
        'Tradable symbols:',
        ...(instruments.length ? instruments.map(i => \`- \${i.symbol}: \${i.name}\`) : ['- unavailable']),
    ].join('\n');
}

function detectReadIntent(question) {
    const text = String(question || '').trim().toLowerCase();
    if (/\b(balance|how much money|what(?:'s| is) in (my )?(checking|savings|accounts?)|account balance)\b/.test(text)) return 'accounts';
    if (/\b(finances?|financial picture|money overview|overall money|how am i doing financially)\b/.test(text)) return 'finances';
    if (/\b(my )?(stocks?|shares|portfolio|holdings|investments?)\b/.test(text)) return 'portfolio';
    if (/\b(stock price|share price|quote|how is [a-z]{1,5}\b|what is [a-z]{1,5}\s*(?:stock|share)?)\b/.test(text)) return 'stock_quote';
    if (/\b(loan|mortgage|borrowing|borrowed|loan estimate)\b/.test(text)) return 'loans';
    if (/\b(debt|debts|owe|interest rate|payoff)\b/.test(text)) return 'debts';
    if (/\b(transaction|transactions|recent activity|what did i spend|latest payments)\b/.test(text)) return 'transactions';
    if (/\bbudget|budgets|budget limit|on track\b/.test(text)) return 'budgets';
    if (/\b(goal|goals|savings goal)\b/.test(text)) return 'goals';
    return null;
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
    const debts = networth.listDebts(userId).filter(d => d.status === 'open');
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
        debtsCents: debts.reduce((sum, d) => sum + d.balanceCents, 0),
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
    const rows = getDb().prepare(\`SELECT t.id, t.created_at, t.description, t.counterparty, t.type, t.direction, t.amount, t.currency, a.nickname, a.account_type
        FROM transactions t JOIN accounts a ON a.id = t.account_id
        WHERE a.user_id = ? AND t.status = 'completed'
        ORDER BY t.created_at DESC, t.id DESC LIMIT ?\`).all(userId, n);
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
    let toAccountNumber = null;
    let recipientName = '';
    if (args.toAccountId !== undefined && args.toAccountId !== null && args.toAccountId !== '') {
        const to = validateAccount(userId, args.toAccountId);
        if (to.id === from.id) throw new ValidationError('The source and destination accounts must be different.');
        toAccountNumber = to.account_number;
        recipientName = to.nickname || (to.account_type === 'savings' ? 'Savings' : 'Checking');
    } else if (typeof args.recipientEmail === 'string' && args.recipientEmail.trim()) {
        const recipient = getDb().prepare("SELECT id, full_name, email, status FROM users WHERE email = ? COLLATE NOCASE").get(args.recipientEmail.trim());
        if (!recipient || recipient.status !== 'active') throw new ValidationError('No active Willow customer was found for that email.');
        const target = getDb().prepare("SELECT account_number FROM accounts WHERE user_id = ? AND account_type = 'checking' AND status = 'active' AND currency = ? ORDER BY id LIMIT 1").get(recipient.id, from.currency || 'USD');
        if (!target) throw new ValidationError('That recipient does not have a compatible checking account.');
        toAccountNumber = target.account_number;
        recipientName = recipient.full_name;
    } else {
        throw new ValidationError('Choose a destination account or recipient email.');
    }
    const result = executeTransfer({
        fromAccountId: from.id,
        toAccountNumber,
        amount,
        description: typeof args.description === 'string' ? compact(args.description).slice(0, 200) : '',
        userId,
    });
    if (result.error) throw new ValidationError(result.error);
    return { ...result, amountFormatted: formatCurrency(result.amountCents, result.currency), recipientName };
}

function payDebt(userId, args = {}) {
    const debtId = Number(args.debtId);
    const accountId = Number(args.accountId);
    validateAccount(userId, accountId);
    if (!Number.isSafeInteger(debtId) || debtId <= 0) throw new ValidationError('Choose a valid debt.');
    const debt = networth.getDebt(userId, debtId);
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
        target: args.target,
        accountId: args.accountId,
    });
    return { goal: result };
}

async function execute(userId, tool, args = {}) {
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

function title(tool, args = {}) {
    const amount = args.amount !== undefined ? formatCurrency(Number(args.amount) * 100, 'USD') : '';
    switch (tool) {
    case 'transfer':
        return \`Move \${amount} from your selected account to the selected destination\`;
    case 'pay_debt':
        return \`Pay \${amount} toward the selected debt\`;
    case 'move_investing_cash':
        return \`\${args.direction === 'out' ? 'Move' : 'Add'} \${amount} \${args.direction === 'out' ? 'from investing to an account' : 'from an account to investing'}\`;
    case 'trade':
        return \`\${String(args.side || '').toLowerCase() === 'sell' ? 'Sell' : 'Buy'} \${args.quantity ? Number(args.quantity) : amount} of \${String(args.symbol || '').toUpperCase()}\`;
    case 'create_goal':
        return \`Create the savings goal “\${compact(args.name).slice(0, 60)}”\`;
    default:
        return 'Run this Willow action';
    }
}

function isReadTool(tool) { return READ_TOOLS.has(tool); }
function isWriteTool(tool) { return WRITE_TOOLS.has(tool); }

module.exports = { READ_TOOLS, WRITE_TOOLS, plannerContext, detectReadIntent, read, execute, title, isReadTool, isWriteTool };
