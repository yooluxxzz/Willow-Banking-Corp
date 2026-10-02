/**
 * Willow Hub — "Your financial picture" — and Willow Intelligence.
 *
 * Everything here is derived from the requesting user's own records: demo bank
 * accounts and ledger, the separate simulated portfolio, goals and scheduled
 * transfers. Insights are informational; nothing here is financial advice.
 */
const { getDb } = require('../database');
const demoPortfolio = require('./demo-portfolio');
const goalService = require('./goals');
const scheduledTransfers = require('./scheduled-transfers');
const marketData = require('./market-data');
const { categorize, categoryMeta } = require('./categories');
const { formatCurrency } = require('../middleware/validation');

const usd = cents => formatCurrency(Math.round(cents), 'USD');
const accountName = account => account.nickname || (account.purpose === 'business' ? 'Business checking' : account.currency !== 'USD' ? `${account.currency} account` : account.account_type === 'savings' ? 'Savings' : 'Checking');

function monthBounds(offset = 0) {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset + 1, 1));
    const sql = date => date.toISOString().replace('T', ' ').slice(0, 19);
    return { start: sql(start), end: sql(end), label: new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' }).format(start), key: start.toISOString().slice(0, 7) };
}

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
    const usdActivity = activity.filter(item => (item.currency || 'USD') === 'USD');
    const spending = usdActivity.filter(item => item.direction === 'debit' && item.type !== 'transfer');
    const monthTotals = usdActivity.reduce((totals, item) => {
        if (item.direction === 'credit') totals.incomeCents += item.amount;
        if (item.direction === 'debit') totals.expenseCents += item.amount;
        return totals;
    }, { incomeCents: 0, expenseCents: 0, spendingCents: 0, earnedCents: 0 });
    monthTotals.spendingCents = spending.reduce((sum, item) => sum + item.amount, 0);
    monthTotals.earnedCents = usdActivity.filter(item => item.direction === 'credit' && item.type !== 'transfer').reduce((sum, item) => sum + item.amount, 0);
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
    const lastMonthSpending = db.prepare(`SELECT COALESCE(SUM(t.amount), 0) AS total FROM transactions t JOIN accounts a ON a.id = t.account_id
        WHERE a.user_id = ? AND t.status = 'completed' AND t.direction = 'debit' AND t.type != 'transfer' AND COALESCE(t.currency, 'USD') = 'USD' AND t.created_at >= ? AND t.created_at < ?`).get(userId, lastMonth.start, lastMonth.end).total;
    // Last month up to the same point in the month, for like-for-like comparisons.
    const toMs = value => Date.parse(value.replace(' ', 'T') + 'Z');
    const elapsedMs = Date.now() - toMs(thisMonth.start);
    const sameDayLastMonth = new Date(Math.min(toMs(lastMonth.start) + elapsedMs, toMs(lastMonth.end))).toISOString().replace('T', ' ').slice(0, 19);
    const lastMonthToDateSpending = db.prepare(`SELECT COALESCE(SUM(t.amount), 0) AS total FROM transactions t JOIN accounts a ON a.id = t.account_id
        WHERE a.user_id = ? AND t.status = 'completed' AND t.direction = 'debit' AND t.type != 'transfer' AND COALESCE(t.currency, 'USD') = 'USD' AND t.created_at >= ? AND t.created_at < ?`).get(userId, lastMonth.start, sameDayLastMonth).total;
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

/** Six months of income vs spending (USD accounts, excluding transfers between accounts). */
function cashflowSeries(userId, months = 6) {
    const db = getDb();
    const series = [];
    for (let offset = months - 1; offset >= 0; offset -= 1) {
        const bounds = monthBounds(-offset);
        const row = db.prepare(`SELECT
                COALESCE(SUM(CASE WHEN t.direction = 'credit' THEN t.amount ELSE 0 END), 0) AS income,
                COALESCE(SUM(CASE WHEN t.direction = 'debit' THEN t.amount ELSE 0 END), 0) AS spending
            FROM transactions t JOIN accounts a ON a.id = t.account_id
            WHERE a.user_id = ? AND t.status = 'completed' AND t.type != 'transfer' AND COALESCE(t.currency, 'USD') = 'USD' AND t.created_at >= ? AND t.created_at < ?`).get(userId, bounds.start, bounds.end);
        series.push({ label: bounds.label, key: bounds.key, incomeCents: row.income, spendingCents: row.spending });
    }
    return series;
}

/** Net worth and composition, including the simulated portfolio at live prices where available. */
async function getPicture(userId) {
    const summary = getSummary(userId);
    let valuation = null;
    try { valuation = await demoPortfolio.valuePortfolio(userId); } catch (error) { valuation = null; }
    let rates = null;
    if (summary.foreignBalances.length) {
        try { rates = await marketData.getFxRates(); } catch (error) { rates = null; }
    }
    const convertedForeign = summary.foreignBalances.map(item => {
        const converted = rates ? marketData.convertAmount(item.cents / 100, item.currency, 'USD', rates) : null;
        return { ...item, usdCents: converted === null ? null : Math.round(converted * 100) };
    });
    const checkingCents = summary.accounts.filter(account => account.currency === 'USD' && account.account_type !== 'savings').reduce((sum, account) => sum + account.balance, 0)
        + convertedForeign.reduce((sum, item) => sum + (item.usdCents || 0), 0);
    const cryptoValue = valuation ? valuation.holdings.filter(holding => holding.type === 'crypto').reduce((sum, holding) => sum + holding.marketValue, 0) : 0;
    const investmentValue = valuation ? valuation.total - cryptoValue : summary.demoPortfolioCashCents / 100 + summary.demoInvestmentsAtCostCents / 100;
    const composition = [
        { key: 'cash', label: 'Cash', cents: checkingCents, color: 'var(--chart-1)', note: 'Checking and currency accounts' },
        { key: 'savings', label: 'Savings', cents: summary.savingsCents, color: 'var(--chart-2)', note: 'Savings accounts' },
        { key: 'investments', label: 'Investments', cents: Math.round(investmentValue * 100), color: 'var(--chart-3)', note: 'Simulated portfolio, incl. demo cash' },
        { key: 'crypto', label: 'Crypto', cents: Math.round(cryptoValue * 100), color: 'var(--chart-5)', note: 'Simulated crypto holdings' },
    ];
    const netWorthCents = composition.reduce((sum, item) => sum + item.cents, 0);
    return {
        summary,
        composition,
        creditCents: 0,
        netWorthCents,
        valuation,
        foreign: convertedForeign,
        fxUnavailable: Boolean(summary.foreignBalances.length && (!rates || convertedForeign.some(item => item.usdCents === null))),
        cashflow: cashflowSeries(userId),
        insights: buildInsights(summary, valuation),
    };
}

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
        insights.push({ icon: top.icon, tone: 'neutral', text: `${top.label} is your largest spending category this month.`, detail: `${usd(top.cents)} · ${share}% of spending`, href: '/hub#spending' });
    }
    if (summary.savingsMovementCents > 0) {
        insights.push({ icon: 'savings', tone: 'positive', text: `You’ve moved ${usd(summary.savingsMovementCents)} into savings this month.`, detail: 'Net change across your savings accounts.', href: '/accounts' });
    }
    if (summary.scheduledThisWeek) {
        insights.push({ icon: 'calendar', tone: 'neutral', text: `You have ${summary.scheduledThisWeek} scheduled payment${summary.scheduledThisWeek === 1 ? '' : 's'} this week.`, detail: 'Demo transfers run on their scheduled date (UTC).', href: '/scheduled-transfers' });
    }
    if (valuation && valuation.holdings.length) {
        insights.push({ icon: 'pie', tone: 'neutral', text: `Your simulated portfolio is spread across ${valuation.holdings.length} asset${valuation.holdings.length === 1 ? '' : 's'}.`, detail: valuation.pricing === 'live' ? 'Valued at the latest available market prices.' : 'Some prices are unavailable — those holdings show cost basis.', href: '/wealth' });
    }
    const nearest = summary.goals.filter(goal => goal.target_cents > 0 && goal.current_cents < goal.target_cents).sort((a, b) => (b.current_cents / b.target_cents) - (a.current_cents / a.target_cents))[0];
    if (nearest) {
        insights.push({ icon: 'target', tone: 'neutral', text: `“${nearest.name}” is ${Math.round(nearest.current_cents / nearest.target_cents * 100)}% of the way there.`, detail: `${usd(nearest.target_cents - nearest.current_cents)} to go · self-reported progress`, href: '/goals' });
    }
    return insights.slice(0, 5);
}

// ── Willow Intelligence ──────────────────────────────────────────────
const link = (label, href) => ({ label, href });
const txnView = item => ({ description: item.description || item.type, detail: `${String(item.created_at).slice(0, 10)} · ${categoryMeta(categorize(item)).label}`, amount: `${item.direction === 'credit' ? '+' : '−'}${formatCurrency(item.amount, item.currency || 'USD')}`, direction: item.direction });
const accountView = account => ({ name: accountName(account), detail: `${account.currency} · ••••${String(account.account_number || '').slice(-4)}`, balance: formatCurrency(account.balance, account.currency), href: `/accounts/${account.id}` });

const CATEGORY_WORDS = {
    groceries: /grocer|supermarket|food shop/, dining: /dining|restaurant|eating out|coffee|caf/, transport: /transport|travel to work|taxi|uber|transit|fuel/, housing: /rent|housing|mortgage/,
    bills: /bills?|utilit|internet|phone/, shopping: /shopping|clothes|books/, entertainment: /entertainment|movies|streaming|cinema/, health: /health|gym|fitness|pharmacy/, travel: /travel|flights?|hotels?/,
};

async function answerQuestion(userId, question) {
    if (typeof question !== 'string' || question.trim().length < 2 || question.length > 200) {
        return { answer: 'Enter a question using 2 to 200 characters.', links: [], invalid: true };
    }
    const query = question.trim().toLowerCase();
    const summary = getSummary(userId);

    if (/\b(return|forecast|predict|recommend|should i|buy now|sell now|will .* (earn|gain|go up|rise|fall)|best (stock|investment|crypto)|tip)\b/.test(query)) {
        return { kind: 'refusal', answer: 'I can’t predict investment performance or recommend a trade. I can show what your simulated portfolio holds, how it’s allocated and how it has moved so far.', links: [link('Open your portfolio', '/wealth'), link('Learn: stocks, ETFs and funds', '/learn/stocks-etfs-and-funds')] };
    }

    const categoryKey = Object.keys(CATEGORY_WORDS).find(key => CATEGORY_WORDS[key].test(query));
    if (categoryKey && /spend|spent|cost|much/.test(query)) {
        const meta = categoryMeta(categoryKey);
        const match = summary.categories.find(item => item.key === categoryKey);
        const db = getDb();
        const month = monthBounds(0);
        const rows = db.prepare(`SELECT t.* FROM transactions t JOIN accounts a ON a.id = t.account_id WHERE a.user_id = ? AND t.status = 'completed' AND t.direction = 'debit' AND t.type != 'transfer' AND t.created_at >= ? AND t.created_at < ? ORDER BY t.created_at DESC`).all(userId, month.start, month.end)
            .filter(item => categorize(item) === categoryKey);
        return {
            kind: 'category',
            answer: match ? `You’ve spent ${usd(match.cents)} on ${meta.label.toLowerCase()} this month across ${rows.length} transaction${rows.length === 1 ? '' : 's'}.` : `I didn’t find any ${meta.label.toLowerCase()} spending in your USD accounts this month.`,
            figure: match ? usd(match.cents) : null,
            transactions: rows.slice(0, 5).map(txnView),
            transactionsTitle: `${meta.label} this month`,
            links: [link('Review transactions', '/transactions'), link('Spending by category', '/hub#spending')],
        };
    }

    if (/(biggest|largest|top|most)/.test(query) && /(expense|spend|purchase|cost)/.test(query)) {
        if (!summary.topExpenses.length) return { kind: 'expenses', answer: 'There are no completed purchases or payments in your USD accounts this month yet.', links: [link('View transactions', '/transactions')] };
        return {
            kind: 'expenses',
            answer: `Your largest expense this month is ${summary.topExpenses[0].description} at ${usd(summary.topExpenses[0].amountCents)}. Transfers between your own accounts aren’t counted.`,
            chart: { type: 'bars', title: 'Top expenses this month', currency: 'USD', series: summary.topExpenses.map(item => ({ label: item.description, value: item.amountCents / 100 })) },
            links: [link('Review transactions', '/transactions'), link('Your financial picture', '/hub')],
        };
    }

    if (/(spend|spent|spending|expenses?)/.test(query)) {
        const previous = summary.previousMonthSpendingCents;
        const toDate = summary.previousMonthToDateSpendingCents;
        const comparison = previous ? ` By this point last month you’d spent ${usd(toDate)}, and ${usd(previous)} over the whole month.` : '';
        return {
            kind: 'spending',
            answer: `You’ve spent ${usd(summary.month.spendingCents)} this month across ${summary.spendingCount} completed purchases and payments.${comparison}`,
            figure: usd(summary.month.spendingCents),
            chart: summary.categories.length ? { type: 'donut', title: 'Spending by category', currency: 'USD', series: summary.categories.slice(0, 6).map(item => ({ label: item.label, value: item.cents / 100, color: item.color })) } : null,
            links: [link('Spending breakdown', '/hub#spending'), link('Review transactions', '/transactions')],
        };
    }

    if (/(income|earn|earned|salary|paid me|received)/.test(query)) {
        return { kind: 'income', answer: `You’ve received ${usd(summary.month.earnedCents)} in income and deposits this month, not counting transfers between your accounts.`, figure: usd(summary.month.earnedCents), links: [link('Review transactions', '/transactions')] };
    }

    if (/(net worth|worth|everything i (own|have)|total wealth)/.test(query)) {
        const picture = await getPicture(userId);
        return {
            kind: 'net_worth',
            answer: `Your Willow net worth is ${usd(picture.netWorthCents)}. It combines your demo bank balances with your separate simulated portfolio and crypto.${picture.fxUnavailable ? ' Some currency balances are excluded because exchange rates are unavailable.' : ''}`,
            figure: usd(picture.netWorthCents),
            chart: { type: 'donut', title: 'Composition', currency: 'USD', series: picture.composition.filter(item => item.cents > 0).map(item => ({ label: item.label, value: item.cents / 100, color: item.color })) },
            links: [link('Your financial picture', '/hub')],
        };
    }

    if (/(allocation|allocated|diversif|split|mix|spread)/.test(query) || (/portfolio/.test(query) && /how|what/.test(query) && !/worth|value/.test(query) && /alloc|split/.test(query))) {
        const valuation = await demoPortfolio.valuePortfolio(userId);
        if (!valuation.holdings.length) return { kind: 'allocation', answer: `Your simulated portfolio is entirely demo cash (${formatCurrency(Math.round(valuation.cash * 100))}). Buy a demo asset to see an allocation.`, links: [link('Explore markets', '/wealth/markets')] };
        const parts = valuation.allocation.map(item => `${item.label} ${(item.value / valuation.total * 100).toFixed(0)}%`).join(', ');
        return {
            kind: 'allocation',
            answer: `Your simulated portfolio is allocated ${parts}.${valuation.pricing !== 'live' ? ' Some prices are unavailable, so those holdings use cost basis.' : ''}`,
            chart: { type: 'donut', title: 'Portfolio allocation', currency: 'USD', series: valuation.allocation.map((item, index) => ({ label: item.label, value: item.value, color: `var(--chart-${index + 1})` })) },
            links: [link('Open your portfolio', '/wealth')],
        };
    }

    if (/(crypto|bitcoin|btc|ethereum|eth\b|solana)/.test(query)) {
        const valuation = await demoPortfolio.valuePortfolio(userId);
        const crypto = valuation.holdings.filter(holding => holding.type === 'crypto');
        if (!crypto.length) return { kind: 'crypto', answer: 'You don’t hold any simulated crypto right now.', links: [link('Explore crypto', '/crypto')] };
        const total = crypto.reduce((sum, holding) => sum + holding.marketValue, 0);
        return {
            kind: 'crypto',
            answer: `Your simulated crypto holdings are worth ${formatCurrency(Math.round(total * 100))} across ${crypto.length} asset${crypto.length === 1 ? '' : 's'}.`,
            figure: formatCurrency(Math.round(total * 100)),
            items: crypto.map(holding => ({ label: `${holding.name} · ${holding.symbol}`, detail: `${holding.quantity} units${holding.priceAvailable ? '' : ' · cost basis'}`, value: formatCurrency(Math.round(holding.marketValue * 100)) })),
            itemsTitle: 'Crypto holdings',
            links: [link('Open Crypto', '/crypto')],
        };
    }

    if (/(invest|portfolio|holdings|stocks?|shares|etf|fund)/.test(query)) {
        const valuation = await demoPortfolio.valuePortfolio(userId);
        if (!valuation.holdings.length) return { kind: 'investments', answer: `Your simulated portfolio holds ${formatCurrency(Math.round(valuation.cash * 100))} in demo cash and no assets yet.`, links: [link('Explore markets', '/wealth/markets')] };
        return {
            kind: 'investments',
            answer: `Your simulated portfolio is worth ${formatCurrency(Math.round(valuation.total * 100))}, including ${formatCurrency(Math.round(valuation.cash * 100))} in demo cash. Total return since your $100,000 start: ${valuation.totalReturn >= 0 ? '+' : '−'}${formatCurrency(Math.round(Math.abs(valuation.totalReturn) * 100))}.`,
            figure: formatCurrency(Math.round(valuation.total * 100)),
            items: valuation.holdings.slice(0, 6).map(holding => ({ label: `${holding.name} · ${holding.symbol}`, detail: `${holding.weight.toFixed(1)}% of portfolio${holding.priceAvailable ? '' : ' · cost basis'}`, value: formatCurrency(Math.round(holding.marketValue * 100)) })),
            itemsTitle: 'Largest holdings',
            links: [link('Open your portfolio', '/wealth'), link('Markets', '/wealth/markets')],
        };
    }

    if (/saving/.test(query)) {
        const savings = summary.accounts.filter(account => account.account_type === 'savings');
        return {
            kind: 'savings',
            answer: `You have ${usd(summary.savingsCents)} in ${savings.length} savings account${savings.length === 1 ? '' : 's'}.${summary.savingsMovementCents > 0 ? ` That includes ${usd(summary.savingsMovementCents)} added this month.` : ''}`,
            figure: usd(summary.savingsCents),
            accounts: savings.map(accountView),
            links: [link('View accounts', '/accounts'), link('Your goals', '/goals')],
        };
    }

    if (/(scheduled|upcoming|due|bills? this week|payments? this week)/.test(query)) {
        if (!summary.scheduledTransferCount) return { kind: 'scheduled', answer: 'You have no pending scheduled transfers.', links: [link('Schedule a transfer', '/scheduled-transfers')] };
        return {
            kind: 'scheduled',
            answer: `You have ${summary.scheduledTransferCount} scheduled transfer${summary.scheduledTransferCount === 1 ? '' : 's'}, ${summary.scheduledThisWeek} due in the next seven days. Nothing moves until the scheduled date.`,
            items: summary.scheduledTransfers.map(transfer => ({ label: transfer.description || 'Scheduled transfer', detail: `${String(transfer.scheduled_for).slice(0, 10)} (UTC)`, value: usd(transfer.amount) })),
            itemsTitle: 'Scheduled',
            links: [link('Review scheduled transfers', '/scheduled-transfers')],
        };
    }

    if (/goal/.test(query)) {
        if (!summary.goals.length) return { kind: 'goals', answer: 'You haven’t saved any goals yet.', links: [link('Create a goal', '/goals')] };
        return {
            kind: 'goals',
            answer: `You’re tracking ${summary.goals.length} goal${summary.goals.length === 1 ? '' : 's'}. Progress is self-reported and doesn’t move money.`,
            items: summary.goals.map(goal => ({ label: goal.name, detail: `${Math.round(goal.current_cents / goal.target_cents * 100)}% of ${usd(goal.target_cents)}`, value: usd(goal.current_cents) })),
            itemsTitle: 'Goals',
            links: [link('Manage goals', '/goals')],
        };
    }

    if (/card/.test(query)) {
        const cards = getDb().prepare("SELECT c.status, c.form, c.last_four, c.nickname FROM cards c JOIN accounts a ON a.id = c.account_id WHERE a.user_id = ? AND c.status IN ('active', 'frozen')").all(userId);
        return {
            kind: 'cards',
            answer: cards.length ? `You have ${cards.length} demo card${cards.length === 1 ? '' : 's'}: ${cards.filter(card => card.status === 'active').length} active and ${cards.filter(card => card.status === 'frozen').length} frozen.` : 'You don’t have an active demo card.',
            items: cards.map(card => ({ label: card.nickname || (card.form === 'virtual' ? 'Virtual card' : 'Debit card'), detail: `•••• ${card.last_four}`, value: card.status === 'frozen' ? 'Frozen' : 'Active' })),
            links: [link('Manage cards', '/cards')],
        };
    }

    if (/(euro|currenc|exchange|fx|pound|rand|metical|gbp|eur|zar|mzn)/.test(query)) {
        if (!summary.foreignBalances.length) return { kind: 'currency', answer: 'You don’t have a currency account yet. You can open EUR, GBP, MZN or ZAR accounts.', links: [link('International', '/international'), link('Open an account', '/accounts/new?type=currency')] };
        return {
            kind: 'currency',
            answer: `You hold ${summary.foreignBalances.map(item => formatCurrency(item.cents, item.currency)).join(', ')} in currency accounts.`,
            accounts: summary.accounts.filter(account => account.currency !== 'USD').map(accountView),
            links: [link('International', '/international')],
        };
    }

    if (/(business|invoice|revenue|cash ?flow)/.test(query)) {
        const { getDashboard } = require('./business');
        const dashboard = getDashboard(userId);
        if (!dashboard.accounts.length) return { kind: 'business', answer: 'You don’t have a business account yet.', links: [link('Open business checking', '/accounts/new?type=business')] };
        const openInvoices = dashboard.invoices.filter(invoice => ['open', 'overdue'].includes(invoice.displayStatus));
        return {
            kind: 'business',
            answer: `This month your business accounts received ${usd(dashboard.revenueCents)} and spent ${usd(dashboard.expensesCents)}. You have ${openInvoices.length} open invoice${openInvoices.length === 1 ? '' : 's'}.`,
            links: [link('Business dashboard', '/business/dashboard'), link('Invoices', '/business/invoices')],
        };
    }

    if (/(balance|how much (money )?do i have|accounts?|cash|available)/.test(query)) {
        const foreign = summary.foreignBalances.length ? ` You also hold ${summary.foreignBalances.map(item => formatCurrency(item.cents, item.currency)).join(', ')} in currency accounts.` : '';
        return {
            kind: 'balance',
            answer: `Your USD accounts hold ${usd(summary.bankBalanceCents)} across ${summary.accounts.filter(account => account.currency === 'USD').length} accounts.${foreign} This is separate from your simulated investment cash.`,
            figure: usd(summary.bankBalanceCents),
            accounts: summary.accounts.map(accountView),
            links: [link('View accounts', '/accounts')],
        };
    }

    return {
        kind: 'help',
        answer: 'I can answer questions about your spending, income, savings, balances, investments, portfolio allocation, crypto, goals, cards, currency accounts, business activity and scheduled transfers — using only your Willow demo data.',
        links: [link('Your financial picture', '/hub'), link('Help center', '/help')],
    };
}

module.exports = { getSummary, getPicture, cashflowSeries, answerQuestion, buildInsights };
