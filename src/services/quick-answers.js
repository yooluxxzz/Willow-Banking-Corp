/**
 * Quick answers — Ask Willow without a language model.
 *
 * When Ollama isn't installed, isn't running, or fails before it says anything,
 * Ask Willow still answers the common questions about money: spending, income,
 * budgets, debts, net worth, balances, investing, business, savings goals,
 * upcoming transfers and recent activity. Answers are worked out here from the
 * signed-in customer's own records (the same services the pages use), so the
 * figures always match what the rest of Willow shows. Where it helps, an answer
 * explains the idea behind the number (an emergency fund, the avalanche and
 * snowball methods), as information rather than advice.
 */
const { getDb } = require('../database');
const hub = require('./hub');
const budgets = require('./budgets');
const networth = require('./networth');
const portfolio = require('./demo-portfolio');
const goals = require('./goals');
const business = require('./business');

const usd = cents => `${cents < 0 ? '-' : ''}$${(Math.abs(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
const percent = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);
const categoryName = category => (category.key === 'transfers' ? 'money sent to people' : category.label.toLowerCase());

/** What each answer can draw on. Investing and net worth may need market data, so they fail soft. */
async function gather(userId, now) {
    const db = getDb();
    const accounts = db.prepare("SELECT nickname, account_type, purpose, currency, balance FROM accounts WHERE user_id = ? AND status = 'active' ORDER BY id").all(userId);
    return {
        accounts,
        summary: hub.getSummary(userId),
        series: hub.cashflowSeries(userId),
        budgets: [...budgets.listBudgets(userId, 'personal', now), ...budgets.listBudgets(userId, 'business', now)],
        worth: await networth.computeNetWorth(userId).catch(() => null),
        debts: networth.listDebts(userId).filter(debt => debt.status === 'open'),
        valuation: await portfolio.valuePortfolio(userId).catch(() => null),
        goals: goals.listGoals(userId),
        business: business.getDashboard(userId),
        recent: db.prepare(`SELECT t.created_at, t.description, t.counterparty, t.type, t.direction, t.amount, t.currency FROM transactions t JOIN accounts a ON a.id = t.account_id
            WHERE a.user_id = ? AND t.status = 'completed' ORDER BY t.created_at DESC, t.id DESC LIMIT 10`).all(userId),
    };
}

const accountName = account => account.nickname || (account.purpose === 'business' ? 'Business checking' : account.account_type === 'savings' ? 'Savings' : 'Checking');
const averageSpending = series => {
    const months = series.slice(0, -1).filter(month => month.spendingCents > 0); // full months only
    return months.length ? Math.round(months.reduce((sum, month) => sum + month.spendingCents, 0) / months.length) : 0;
};

const answers = {
    spending(data, question) {
        const { month, categories, topExpenses, spendingCount, previousMonthSpendingCents: lastMonth, previousMonthToDateSpendingCents: lastToDate } = data.summary;
        if (/last month/.test(question) && !/this month/.test(question)) {
            return lastMonth ? `Last month you spent ${usd(lastMonth)} from your US dollar accounts.` : 'You didn’t spend anything from your US dollar accounts last month.';
        }
        if (!month.spendingCents) return 'You haven’t spent anything from your US dollar accounts this month yet. Payments, withdrawals and money you send to other people count as spending; moves between your own accounts and into investing don’t.';
        const lines = [`This month you’ve spent ${usd(month.spendingCents)} across ${plural(spendingCount, 'payment')}.`];
        if (lastToDate > 0) {
            const change = percent(month.spendingCents - lastToDate, lastToDate);
            lines.push(change === 0 ? `That’s about the same as by this point last month (${usd(lastToDate)}).` : `That’s ${Math.abs(change)}% ${change > 0 ? 'more' : 'less'} than by this point last month (${usd(lastToDate)}).`);
        }
        if (categories.length) lines.push(`Biggest categories: ${categories.slice(0, 3).map(category => `${categoryName(category)} ${usd(category.cents)} (${percent(category.cents, month.spendingCents)}%)`).join(', ')}.`);
        if (topExpenses.length) lines.push(`Largest single expense: ${topExpenses[0].description} at ${usd(topExpenses[0].amountCents)}.`);
        return lines.join(' ');
    },

    income(data) {
        const earned = data.summary.month.earnedCents;
        const months = data.series.filter(month => month.incomeCents > 0);
        const lines = [earned ? `Money in this month: ${usd(earned)} (deposits and payments you received; moves between your own accounts don’t count).` : 'No money has come in to your US dollar accounts this month yet.'];
        if (months.length > 1) lines.push(`Over the last ${months.length} months with income, that averages ${usd(Math.round(months.reduce((sum, month) => sum + month.incomeCents, 0) / months.length))} a month.`);
        if (earned && data.summary.month.spendingCents) {
            const left = earned - data.summary.month.spendingCents;
            lines.push(left >= 0 ? `You’ve spent ${percent(data.summary.month.spendingCents, earned)}% of it so far, leaving ${usd(left)}.` : `You’ve spent ${usd(-left)} more than came in this month.`);
        }
        return lines.join(' ');
    },

    budgets(data) {
        if (!data.budgets.length) return 'You haven’t set any budgets yet. A budget is a spending limit for a day, week or month, for everything or one category such as groceries. Set one on the Budgets page and Willow tracks it against what you actually spend.';
        const count = status => data.budgets.filter(budget => budget.status === status).length;
        const lines = [`You have ${plural(data.budgets.length, 'budget')}: ${count('under')} on track, ${count('near')} close to the limit and ${count('over')} over.`];
        data.budgets.slice(0, 5).forEach(budget => {
            const left = budget.remainingCents >= 0
                ? `${usd(budget.remainingCents)} left${budget.period !== 'daily' && budget.daysLeft ? `, about ${usd(budget.perDayLeftCents)} a day for ${plural(budget.daysLeft, 'day')}` : ''}`
                : `${usd(-budget.remainingCents)} over`;
            lines.push(`- ${budget.name}: ${usd(budget.spentCents)} of ${usd(budget.limitCents)} this ${budget.period === 'daily' ? 'day' : budget.period === 'weekly' ? 'week' : 'month'} — ${left}.`);
        });
        return lines.join('\n');
    },

    debts(data) {
        if (!data.debts.length) return 'You haven’t logged any debts. If you have a loan or a card balance, add it on the Debts page to see when it could be paid off and how much interest it costs each month.';
        const total = data.debts.reduce((sum, debt) => sum + debt.balanceCents, 0);
        const interest = data.debts.reduce((sum, debt) => sum + (debt.monthlyInterestCents || 0), 0);
        const costliest = [...data.debts].sort((a, b) => b.apr - a.apr)[0];
        const smallest = [...data.debts].sort((a, b) => a.balanceCents - b.balanceCents)[0];
        const lines = [`You owe ${usd(total)} across ${plural(data.debts.length, 'debt')}, costing about ${usd(interest)} in interest a month.`];
        data.debts.slice(0, 4).forEach(debt => lines.push(`- ${debt.name}: ${usd(debt.balanceCents)} at ${debt.apr}% APR; ${debt.payoffPossible ? `about ${plural(debt.payoffMonths, 'month')} to clear at the minimum, with ${usd(debt.payoffInterestCents)} of interest` : 'the minimum payment doesn’t cover the interest'}.`));
        lines.push(data.debts.length > 1
            ? `Paying extra on the highest rate first (the “avalanche” method) costs the least interest overall — here that’s ${costliest.name} at ${costliest.apr}%. Clearing the smallest balance first (the “snowball” method, ${smallest.name}) gives a quicker win.`
            : `Anything you pay above the minimum goes straight to the balance and cuts the interest you pay.`);
        return lines.join('\n');
    },

    networth(data) {
        const worth = data.worth;
        if (!worth) return 'Your net worth can’t be worked out right now. Please try again in a moment.';
        const owns = worth.accountsCents + worth.investmentsCents + worth.assetsCents;
        const lines = [`Your net worth is ${usd(worth.netCents)}: you own ${usd(owns)} and owe ${usd(worth.debtsCents)}.`];
        const parts = worth.composition.filter(part => part.cents > 0).sort((a, b) => b.cents - a.cents);
        if (parts.length) lines.push(`What you own: ${parts.slice(0, 5).map(part => `${part.label.toLowerCase()} ${usd(part.cents)}`).join(', ')}.`);
        if (!worth.assetsCents && !worth.debtsCents) lines.push('Add anything you own outside Willow (a car, a home, a pension) and any debts on the Net worth page to complete the picture.');
        return lines.join(' ');
    },

    balances(data) {
        const dollars = data.accounts.filter(account => account.currency === 'USD');
        const others = data.accounts.filter(account => account.currency !== 'USD');
        if (!data.accounts.length) return 'You don’t have any open accounts.';
        const lines = [`You have ${usd(dollars.reduce((sum, account) => sum + account.balance, 0))} across your US dollar accounts:`];
        dollars.forEach(account => lines.push(`- ${accountName(account)}: ${usd(account.balance)}`));
        others.forEach(account => lines.push(`- ${accountName(account)}: ${(account.balance / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })} ${account.currency}`));
        return lines.join('\n');
    },

    investing(data) {
        const valuation = data.valuation;
        if (!valuation) return 'Your portfolio can’t be valued right now. Please try again in a moment.';
        if (!valuation.holdings.length && !valuation.cash) return 'You haven’t started investing yet. Investing in Willow starts at $0: move cash in from one of your accounts on the Portfolio page, then place simulated orders at delayed market prices.';
        const total = Math.round(valuation.total * 100);
        const lines = [`Your portfolio is worth ${usd(total)}: ${usd(Math.round(valuation.cash * 100))} in cash and ${plural(valuation.holdings.length, 'holding')}.`];
        if (valuation.holdings.length) lines.push(`Largest: ${valuation.holdings.slice(0, 3).map(holding => `${holding.symbol} ${usd(Math.round(holding.marketValue * 100))} (${Math.round(holding.weight)}%)`).join(', ')}.`);
        if (valuation.contributed > 0) lines.push(`Compared with the ${usd(Math.round(valuation.contributed * 100))} you moved in, that’s ${valuation.totalReturn >= 0 ? 'up' : 'down'} ${usd(Math.round(Math.abs(valuation.totalReturn) * 100))} (${Math.abs(valuation.totalReturnPercent).toFixed(1)}%).`);
        if (valuation.holdings.some(holding => holding.saved)) lines.push('Live prices can’t be reached right now, so holdings are valued at saved prices.');
        return lines.join(' ');
    },

    business(data) {
        const biz = data.business;
        if (!biz.accounts.length && !biz.recentExpenses.length && !biz.invoices.length) return 'You haven’t set up any business banking yet. Open business checking (Accounts → Open an account) to send invoices and pay expenses, or log expenses on the Business page.';
        const open = biz.invoices.filter(invoice => ['open', 'overdue'].includes(invoice.displayStatus));
        const lines = [`This month your business took in ${usd(biz.revenueCents)} and spent ${usd(biz.expensesCents)}, so it’s ${biz.netCents >= 0 ? 'up' : 'down'} ${usd(Math.abs(biz.netCents))}.`];
        if (open.length) lines.push(`${plural(open.length, 'invoice')} worth ${usd(open.reduce((sum, invoice) => sum + invoice.amount, 0))} ${open.length === 1 ? 'is' : 'are'} still unpaid${open.some(invoice => invoice.displayStatus === 'overdue') ? ', some overdue' : ''}.`);
        if (biz.categories.length) lines.push(`Biggest expense category: ${biz.categories[0].label.toLowerCase()} at ${usd(biz.categories[0].cents)}.`);
        return lines.join(' ');
    },

    savings(data) {
        const savings = data.accounts.filter(account => account.account_type === 'savings' && account.currency === 'USD').reduce((sum, account) => sum + account.balance, 0);
        const average = averageSpending(data.series);
        const lines = [savings ? `You have ${usd(savings)} in savings.` : 'You don’t have money in a savings account yet.'];
        if (average) {
            lines.push(`Many people aim for an emergency fund of three to six months of spending; based on your average month (${usd(average)}), that’s ${usd(average * 3)} to ${usd(average * 6)}${savings ? ` — your savings cover about ${(savings / average).toFixed(1)} months` : ''}.`);
        }
        data.goals.slice(0, 4).forEach(goal => lines.push(`- Goal “${goal.name}”: ${usd(goal.current_cents)} of ${usd(goal.target_cents)} (${percent(goal.current_cents, goal.target_cents)}%).`));
        if (!data.goals.length) lines.push('You can set savings goals on the Goals page to track progress toward them.');
        return lines.join('\n');
    },

    upcoming(data) {
        const scheduled = data.summary.scheduledTransfers || [];
        if (!scheduled.length) return 'You don’t have any scheduled transfers. You can schedule one on the Payments page, under scheduled transfers.';
        return [`You have ${plural(data.summary.scheduledTransferCount, 'scheduled transfer')}${data.summary.scheduledThisWeek ? `, ${data.summary.scheduledThisWeek} this week` : ''}:`,
            ...scheduled.map(transfer => `- ${String(transfer.scheduled_for).slice(0, 10)}: ${usd(transfer.amount)}${transfer.description ? ` — ${transfer.description}` : ''}`)].join('\n');
    },

    recent(data, question) {
        if (!data.recent.length) return 'There are no transactions yet. Add money from Home to get started.';
        const wanted = Math.min(10, Math.max(1, Number((question.match(/\b(\d{1,2})\b/) || [])[1]) || 5));
        const rows = data.recent.slice(0, wanted);
        return [`Your latest ${plural(rows.length, 'transaction')}:`, ...rows.map(row => `- ${String(row.created_at).slice(0, 10)} ${row.direction === 'credit' ? '+' : '−'}${row.currency === 'USD' ? usd(row.amount) : `${(row.amount / 100).toFixed(2)} ${row.currency}`} ${row.counterparty || row.description || row.type}`)].join('\n');
    },

    tips(data) {
        const tips = [];
        const { month, categories } = data.summary;
        if (month.earnedCents && month.spendingCents < month.earnedCents) tips.push(`You’ve kept ${percent(month.earnedCents - month.spendingCents, month.earnedCents)}% of this month’s income so far. A common guide is to save at least 20% of what comes in.`);
        if (categories.length && month.spendingCents) tips.push(`${categories[0].label} is ${percent(categories[0].cents, month.spendingCents)}% of your spending this month; a budget for it is the quickest way to keep it in check.`);
        if (!data.budgets.length) tips.push('Setting one or two budgets for your biggest categories makes overspending visible before the month ends.');
        const costliest = [...data.debts].sort((a, b) => b.apr - a.apr)[0];
        if (costliest) tips.push(`${costliest.name} has the highest interest rate (${costliest.apr}% APR); extra payments there save the most interest.`);
        const average = averageSpending(data.series);
        const savings = data.accounts.filter(account => account.account_type === 'savings').reduce((sum, account) => sum + account.balance, 0);
        if (average && savings < average * 3) tips.push(`An emergency fund of three months’ spending would be about ${usd(average * 3)}.`);
        if (!tips.length) tips.push('Add money, set a budget and log any debts, and I can point out where your money goes and what to look at first.');
        return ['A few things your figures show (information, not advice):', ...tips.map(tip => `- ${tip}`)].join('\n');
    },

    help() {
        return 'I can answer questions about your spending, income, budgets, debts, net worth, account balances, investing, business, savings goals, scheduled transfers and recent transactions. Try “How much have I spent this month?” or “Which debt costs me the most?”.';
    },
};

// The first matching topic answers; the order puts specific topics before broad ones.
const TOPICS = [
    ['help', /^(hi|hello|hey)\b|what can you (do|answer)|help me use|how do(es)? (this|you) work/],
    ['tips', /\btips?\b|advice|how (can|do|could) i (save|spend less|improve)|save more|spend less|improve my/],
    ['budgets', /budget|on track|\blimit/],
    ['debts', /debt|\bowe\b|loan|credit card|interest|pay (it )?off|payoff|\bapr\b|mortgage/],
    ['networth', /net worth|worth|\bassets?\b|what (do )?i own/],
    ['savings', /saving|goal|emergency|rainy day/], // before investing: "emergency fund" isn't an investment fund
    ['investing', /invest|portfolio|stocks?\b|shares|\betfs?\b|funds?\b|crypto|bitcoin|holdings?/],
    ['business', /business|invoice|revenue|client/],
    ['upcoming', /upcoming|scheduled|coming up|next week|\bdue\b/],
    ['recent', /recent|latest|last \d+|transactions|summari[sz]e/],
    ['income', /income|earn|salary|paycheck|money in\b|came in|received/],
    ['spending', /spen[dt]|expens|categor|cost|bought|shopping|grocer|dining|where .*money/],
    ['balances', /balance|how much (money )?(do i have|have i got|is in)|accounts?\b|checking/],
];

/** Picks the topic a question is about (or null) — exported for tests. */
function topicOf(question) {
    const text = String(question || '').toLowerCase();
    const match = TOPICS.find(([, pattern]) => pattern.test(text));
    return match ? match[0] : null;
}

/** Answers a question from the customer's own records. Resolves with { topic, text }. */
async function answer(userId, question, now = new Date()) {
    const text = String(question || '').toLowerCase();
    const topic = topicOf(text);
    const data = await gather(userId, now);
    if (topic) return { topic, text: answers[topic](data, text) };
    // Not a question these answers cover: give the headline figures and say what is covered.
    const overview = [answers.balances(data).split('\n')[0].replace(/:$/, '.'), data.summary.month.spendingCents ? `This month you’ve spent ${usd(data.summary.month.spendingCents)}.` : null, data.worth ? `Your net worth is ${usd(data.worth.netCents)}.` : null].filter(Boolean);
    return { topic: null, text: `${overview.join(' ')}\n\n${answers.help()}` };
}

module.exports = { answer, topicOf };
