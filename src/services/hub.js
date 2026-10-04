/**
 * Net worth page — "Your financial picture".
 *
 * Everything here is derived from the requesting user's own records: bank
 * accounts and ledger, the investing portfolio, the assets and debts they log,
 * goals and scheduled transfers. Insights are informational, not advice.
 */
const { getDb } = require('../database');
const demoPortfolio = require('./demo-portfolio');
const goalService = require('./goals');
const scheduledTransfers = require('./scheduled-transfers');
const { categorize, categoryMeta } = require('./categories');
const { formatCurrency } = require('../middleware/validation');
const { monthBounds, ledgerRows, isSpending, isIncome, total, sqlUtc } = require('./spending');

const usd = cents => formatCurrency(Math.round(cents), 'USD');
const accountName = account => account.nickname || (account.purpose === 'business' ? 'Business checking' : account.currency !== 'USD' ? `${account.currency} account` : account.account_type === 'savings' ? 'Savings' : 'Checking');

/** Synchronous summary from banking records (USD accounts for spending analysis). */
function getSummary(userId) {
    const db = getDb();
    const accounts = db.prepare(`SELECT id, nickname, account_type, purpose, currency, balance, available_balance, account_number
        FROM accounts WHERE user_id = ? AND status = 'active' ORDER BY id`).all(userId);
    const thisMonth = monthBounds(0);
    const lastMonth = monthBounds(-1);
    const activity = db.prepare(`SELECT t.id, t.description, t.type, t.direction, t.amount, t.currency, t.created_at, t.category, t.account_id, t.counterparty
        FROM transactions t JOIN accounts a ON a.id = t.account_id
        WHERE a.user_id = ? AND t.status = 'completed' AND t.created_at >= ? AND t.created_at < ?
        ORDER BY t.created_at DESC, t.id DESC`).all(userId, thisMonth.start, thisMonth.end);
    const usdActivity = ledgerRows(userId, thisMonth.start, thisMonth.end);
    const spending = usdActivity.filter(item => isSpending(item, userId));
    const monthTotals = {
        incomeCents: total(usdActivity.filter(item => item.direction === 'credit')),
        expenseCents: total(usdActivity.filter(item => item.direction === 'debit')),
        spendingCents: total(spending),
        earnedCents: total(usdActivity.filter(item => isIncome(item, userId))),
    };
    const expenses = spending.reduce((groups, item) => {
        const label = item.description?.trim() || item.type;
        groups.set(label, (groups.get(label) || 0) + item.amount);
        return groups;
    }, new Map());
    const categories = spending.reduce((groups, item) => {
        const key = categorize(item);
        groups.set(key, (groups.get(key) || 0) + item.amount);
        return groups;
    }, new Map());
    const spentBetween = (from, to) => total(ledgerRows(userId, from, to).filter(item => isSpending(item, userId)));
    const lastMonthSpending = spentBetween(lastMonth.start, lastMonth.end);
    // Last month up to the same point in the month, for like-for-like comparisons.
    const elapsedMs = Date.now() - thisMonth.startDate.getTime();
    const sameDayLastMonth = sqlUtc(new Date(Math.min(lastMonth.startDate.getTime() + elapsedMs, lastMonth.endDate.getTime())));
    const lastMonthToDateSpending = spentBetween(lastMonth.start, sameDayLastMonth);
    const savingsIds = new Set(accounts.filter(account => account.account_type === 'savings').map(account => account.id));
    const savingsMovementCents = activity.filter(item => savingsIds.has(item.account_id)).reduce((sum, item) => sum + (item.direction === 'credit' ? item.amount : -item.amount), 0);
    const savingsCents = accounts.filter(account => account.account_type === 'savings' && account.currency === 'USD').reduce((sum, account) => sum + account.balance, 0);
    const bankBalanceCents = accounts.filter(account => account.currency === 'USD').reduce((sum, account) => sum + account.balance, 0);
    const portfolio = demoPortfolio.getPortfolio(userId);
    const investmentsAtCostCents = portfolio.holdings.reduce((sum, holding) => sum + Math.round(holding.quantity * holding.average_price * 100), 0);
    const monthTrades = db.prepare("SELECT side, total_cents FROM demo_trades WHERE user_id = ? AND created_at >= ? AND created_at < ?").all(userId, thisMonth.start, thisMonth.end);
    const pendingTransfers = scheduledTransfers.listScheduledTransfers(userId).filter(transfer => transfer.status === 'pending');
    const weekAhead = new Date(Date.now() + 7 * 86400000).toISOString();
    return {
        accounts,
        month: monthTotals,
        previousMonthSpendingCents: lastMonthSpending,
        previousMonthToDateSpendingCents: lastMonthToDateSpending,
        topExpenses: [...expenses.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([description, amountCents]) => ({ description, amountCents })),
        categories: [...categories.entries()].sort((a, b) => b[1] - a[1]).map(([key, cents]) => ({ ...categoryMeta(key), cents })),
        expenseCategoryCount: expenses.size,
        spendingCount: spending.length,
        savingsCents,
        savingsMovementCents,
        bankBalanceCents,
        foreignBalances: accounts.filter(account => account.currency !== 'USD').map(account => ({ currency: account.currency, cents: account.balance, name: accountName(account), id: account.id })),
        demoInvestmentsAtCostCents: investmentsAtCostCents,
        demoPortfolioCashCents: portfolio.cashCents,
        investedThisMonthCents: monthTrades.reduce((sum, trade) => sum + (trade.side === 'buy' ? trade.total_cents : -trade.total_cents), 0),
        holdingsCount: portfolio.holdings.length,
        transactionCount: activity.length,
        recent: activity.slice(0, 6),
        goals: goalService.listGoals(userId),
        scheduledTransfers: pendingTransfers.slice(0, 5),
        scheduledTransferCount: pendingTransfers.length,
        scheduledThisWeek: pendingTransfers.filter(transfer => transfer.scheduled_for <= weekAhead).length,
    };
}

/** Six months of income vs spending (US dollar accounts, by the shared definition in ./spending). */
function cashflowSeries(userId, months = 6) {
    const series = [];
    for (let offset = months - 1; offset >= 0; offset -= 1) {
        const bounds = monthBounds(-offset);
        const rows = ledgerRows(userId, bounds.start, bounds.end);
        series.push({ label: bounds.label, key: bounds.key, incomeCents: total(rows.filter(row => isIncome(row, userId))), spendingCents: total(rows.filter(row => isSpending(row, userId))) });
    }
    return series;
}

/**
 * Cash flow, investing value and insights for the net worth page. Net worth itself
 * (and its history) comes from ./networth, which the page loads alongside this.
 */
async function getPicture(userId) {
    const summary = getSummary(userId);
    const valuation = await demoPortfolio.valuePortfolio(userId).catch(() => null);
    return {
        summary,
        valuation,
        cashflow: cashflowSeries(userId),
        insights: buildInsights(summary, valuation),
    };
}

/** Short observations for Home and Net worth. Amounts go in `detail`, which "Hide balances" blurs. */
function buildInsights(summary, valuation) {
    const insights = [];
    const spend = summary.month.spendingCents;
    const previousToDate = summary.previousMonthToDateSpendingCents || 0;
    if (previousToDate > 0 && spend > 0 && new Date().getUTCDate() >= 5) {
        const diff = ((spend - previousToDate) / previousToDate) * 100;
        if (Math.abs(diff) >= 5) {
            insights.push({ icon: diff < 0 ? 'trend-down' : 'trend', tone: diff < 0 ? 'positive' : 'neutral', text: `You’ve spent ${Math.abs(diff).toFixed(0)}% ${diff < 0 ? 'less' : 'more'} than at this point last month.`, detail: `${usd(spend)} so far vs ${usd(previousToDate)} by the same day last month.`, href: '/transactions' });
        }
    }
    if (summary.categories.length) {
        const top = summary.categories[0];
        const share = spend ? Math.round(top.cents / spend * 100) : 0;
        // Moves between your own accounts aren't spending, so "transfers" here means money sent to other people.
        const text = top.key === 'transfers'
            ? 'Most of your spending this month was money sent to other people.'
            : `Your largest spending category this month is ${top.label.toLowerCase()}.`;
        insights.push({ icon: top.icon, tone: 'neutral', text, detail: `${usd(top.cents)} · ${share}% of spending`, href: '/net-worth#spending' });
    }
    if (summary.savingsMovementCents > 0) {
        insights.push({ icon: 'savings', tone: 'positive', text: 'You’ve added to your savings this month.', detail: `${usd(summary.savingsMovementCents)} net across your savings accounts`, href: '/accounts' });
    }
    if (summary.scheduledThisWeek) {
        insights.push({ icon: 'calendar', tone: 'neutral', text: `You have ${summary.scheduledThisWeek} scheduled payment${summary.scheduledThisWeek === 1 ? '' : 's'} this week.`, detail: 'Demo transfers run on their scheduled date (UTC).', href: '/scheduled-transfers' });
    }
    if (valuation && valuation.holdings.length) {
        insights.push({ icon: 'pie', tone: 'neutral', text: `Your simulated portfolio is spread across ${valuation.holdings.length} asset${valuation.holdings.length === 1 ? '' : 's'}.`, detail: valuation.pricing !== 'live' ? 'Some prices are unavailable — those holdings show cost basis.' : valuation.holdings.some(holding => holding.saved) ? 'Valued at saved prices while live prices can’t be reached.' : 'Valued at the latest available market prices.', href: '/wealth' });
    }
    const nearest = summary.goals.filter(goal => goal.target_cents > 0 && goal.current_cents < goal.target_cents).sort((a, b) => (b.current_cents / b.target_cents) - (a.current_cents / a.target_cents))[0];
    if (nearest) {
        insights.push({ icon: 'target', tone: 'neutral', text: `“${nearest.name}” is ${Math.round(nearest.current_cents / nearest.target_cents * 100)}% of the way there.`, detail: `${usd(nearest.target_cents - nearest.current_cents)} to go · self-reported progress`, href: '/goals' });
    }
    return insights.slice(0, 5);
}

module.exports = { getSummary, getPicture, cashflowSeries, buildInsights };
