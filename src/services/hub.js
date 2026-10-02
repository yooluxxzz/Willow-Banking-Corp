const { getDb } = require('../database');
const demoPortfolio = require('./demo-portfolio');
const goalService = require('./goals');
const scheduledTransfers = require('./scheduled-transfers');

function getSummary(userId) {
    const db = getDb();
    const accounts = db.prepare(`SELECT id, nickname, account_type, purpose, currency, balance, available_balance
        FROM accounts WHERE user_id = ? AND status = 'active' ORDER BY id`).all(userId);
    const activity = db.prepare(`SELECT t.description, t.type, t.direction, t.amount, t.currency, t.created_at
        FROM transactions t JOIN accounts a ON a.id = t.account_id
        WHERE a.user_id = ? AND t.status = 'completed' AND t.created_at >= date('now', 'start of month')
        ORDER BY t.created_at DESC, t.id DESC`).all(userId);
    const spending = activity.filter(item => item.direction === 'debit' && item.type !== 'transfer');
    const monthTotals = activity.reduce((totals, item) => {
        if (item.direction === 'credit') totals.incomeCents += item.amount;
        if (item.direction === 'debit') totals.expenseCents += item.amount;
        return totals;
    }, { incomeCents: 0, expenseCents: 0, spendingCents: 0 });
    monthTotals.spendingCents = spending.reduce((sum, item) => sum + item.amount, 0);
    const expenses = spending.reduce((groups, item) => {
        const label = item.description?.trim() || item.type;
        groups.set(label, (groups.get(label) || 0) + item.amount);
        return groups;
    }, new Map());
    const savingsCents = accounts.filter(account => account.account_type === 'savings').reduce((sum, account) => sum + account.balance, 0);
    const bankBalanceCents = accounts.reduce((sum, account) => sum + account.balance, 0);
    const portfolio = demoPortfolio.getPortfolio(userId);
    const investmentsAtCostCents = portfolio.holdings.reduce((sum, holding) => sum + Math.round(holding.quantity * holding.average_price * 100), 0);
    return {
        accounts,
        month: monthTotals,
        topExpenses: [...expenses.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([description, amountCents]) => ({ description, amountCents })),
        expenseCategoryCount: expenses.size,
        spendingCount: spending.length,
        savingsCents,
        bankBalanceCents,
        demoInvestmentsAtCostCents: investmentsAtCostCents,
        demoPortfolioCashCents: portfolio.cashCents,
        transactionCount: activity.length,
        goals: goalService.listGoals(userId),
        scheduledTransfers: scheduledTransfers.listScheduledTransfers(userId).filter(transfer => transfer.status === 'pending').slice(0, 5),
        scheduledTransferCount: scheduledTransfers.getPendingScheduledTransferCount(userId),
    };
}

function answerQuestion(userId, question) {
    if (typeof question !== 'string' || question.trim().length < 2 || question.length > 200) {
        return { answer: 'Enter a question using 2 to 200 characters.', links: [] };
    }
    const query = question.trim().toLowerCase();
    const summary = getSummary(userId);
    const currency = amount => `$${(amount / 100).toFixed(2)}`;
    if (/\b(return|forecast|predict|recommend|should i|buy now|will .* (earn|gain))\b/.test(query)) {
        return { answer: 'I cannot predict investment performance or recommend a trade. I can summarize the demo holdings and recorded cost basis you already have.', links: [{ label: 'Open Wealth', href: '/wealth' }] };
    }
    if (/biggest|largest|top/.test(query) && /expense|spend|purchase/.test(query)) {
        if (!summary.topExpenses.length) return { answer: 'There are no completed debits recorded this month in your demo accounts.', links: [{ label: 'View transactions', href: '/transactions' }] };
        return { answer: `Your largest recorded demo expense this month is ${summary.topExpenses[0].description} at ${currency(summary.topExpenses[0].amountCents)}. I found ${summary.expenseCategoryCount} expense categories in completed transactions, excluding transfers.`, links: [{ label: 'Review transactions', href: '/transactions' }], data: summary.topExpenses };
    }
    if (/spend|expense/.test(query) && /month|spent|spending/.test(query)) {
        return { answer: `Recorded demo spending this month totals ${currency(summary.month.spendingCents)} across ${summary.spendingCount} completed non-transfer debits.`, links: [{ label: 'Review transactions', href: '/transactions' }] };
    }
    if (/saving|savings/.test(query)) {
        return { answer: `Your savings accounts currently hold ${currency(summary.savingsCents)} across ${summary.accounts.filter(account => account.account_type === 'savings').length} demo savings accounts.`, links: [{ label: 'View accounts', href: '/accounts' }] };
    }
    if (/invest|portfolio|allocation|crypto|stock/.test(query)) {
        const invested = summary.demoInvestmentsAtCostCents;
        const total = invested + summary.demoPortfolioCashCents;
        const assets = demoPortfolio.getPortfolio(userId).holdings;
        const breakdown = assets.map(holding => `${holding.symbol}: ${currency(Math.round(holding.quantity * holding.average_price * 100))}`).join(', ');
        return { answer: assets.length ? `Your separate simulated investment portfolio holds ${assets.length} assets with ${currency(invested)} at recorded cost basis and ${currency(summary.demoPortfolioCashCents)} in demo cash${breakdown ? `. Holdings: ${breakdown}` : ''}. This is not a live valuation.` : `Your separate simulated investment portfolio has ${currency(total)} in demo cash and no holdings.`, links: [{ label: 'Open Wealth', href: '/wealth' }] };
    }
    if (/balance|account|cash/.test(query)) {
        return { answer: `Your active Willow demo accounts total ${currency(summary.bankBalanceCents)} across ${summary.accounts.length} accounts. This amount is separate from simulated investment cash.`, links: [{ label: 'View accounts', href: '/accounts' }] };
    }
    if (/income|received/.test(query)) {
        return { answer: `Completed credits recorded this month total ${currency(summary.month.incomeCents)} in your demo accounts.`, links: [{ label: 'Review transactions', href: '/transactions' }] };
    }
    if (/scheduled|upcoming transfer|due transfer/.test(query)) {
        const transfers = summary.scheduledTransfers;
        if (!summary.scheduledTransferCount) return { answer: 'You have no pending scheduled demo transfers. Bill payments and external transfers are not connected.', links: [{ label: 'Schedule a demo transfer', href: '/scheduled-transfers' }] };
        const next = transfers[0];
        return { answer: `You have ${summary.scheduledTransferCount} pending scheduled demo transfer${summary.scheduledTransferCount === 1 ? '' : 's'}. The next is ${currency(next.amount)} on ${next.scheduled_for.slice(0, 10)} UTC. No funds move until the due date, and bill pay is not connected.`, links: [{ label: 'Review scheduled transfers', href: '/scheduled-transfers' }] };
    }
    return { answer: 'I can answer from your demo account balances, this month’s completed income or spending, savings balances, simulated portfolio holdings, and pending scheduled demo transfers. I do not have access to credit, external accounts, bill pay or financial advice.', links: [{ label: 'View accounts', href: '/accounts' }, { label: 'Open Wealth', href: '/wealth' }] };
}

module.exports = { getSummary, answerQuestion };