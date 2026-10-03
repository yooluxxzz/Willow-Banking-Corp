/**
 * Willow assistant — a local language model served by Ollama
 * (https://ollama.com) on the same machine as Willow. Nothing leaves the
 * machine: the model gets a compact summary of the signed-in customer's own
 * records with each question, and answers are streamed back.
 *
 * The assistant is offered only while Ollama is reachable and has a model.
 */
const config = require('../config');
const { getDb } = require('../database');
const hub = require('./hub');
const budgets = require('./budgets');
const networth = require('./networth');
const portfolio = require('./demo-portfolio');
const goals = require('./goals');
const business = require('./business');
const { categorize, categoryMeta } = require('./categories');

const STATUS_TTL_MS = 30 * 1000;
const MAX_QUESTION = 1000;
const MAX_TURNS = 10;
let status = { available: false, model: null, reason: 'not_checked', checkedAt: 0 };
let pending = null;

async function fetchJson(url, options = {}, timeoutMs = 2000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } finally {
        clearTimeout(timer);
    }
}

/** Asks Ollama which models are installed. Never throws. */
async function refreshStatus() {
    if (!config.assistant.enabled) {
        status = { available: false, model: null, reason: 'disabled', checkedAt: Date.now() };
        return status;
    }
    if (pending) return pending;
    pending = (async () => {
        try {
            const data = await fetchJson(`${config.assistant.ollamaUrl}/api/tags`);
            const models = (data.models || []).map(model => model.name || model.model).filter(Boolean);
            const wanted = config.assistant.model;
            const model = wanted ? models.find(name => name === wanted || name.split(':')[0] === wanted) : models[0];
            status = model
                ? { available: true, model, reason: null, checkedAt: Date.now() }
                : { available: false, model: null, reason: wanted ? 'model_missing' : 'no_models', checkedAt: Date.now() };
        } catch (error) {
            status = { available: false, model: null, reason: 'unreachable', checkedAt: Date.now() };
        } finally {
            pending = null;
        }
        return status;
    })();
    return pending;
}

/** Last known status; refreshes in the background when it is old. */
function cachedStatus() {
    if (Date.now() - status.checkedAt > STATUS_TTL_MS) refreshStatus();
    return status;
}

async function getStatus() {
    return Date.now() - status.checkedAt > STATUS_TTL_MS ? refreshStatus() : status;
}

// ── Context ──────────────────────────────────────────────────────────────
const usd = cents => `${cents < 0 ? '-' : ''}$${(Math.abs(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const money = (cents, currency = 'USD') => (currency === 'USD' ? usd(cents) : `${(cents / 100).toFixed(2)} ${currency}`);

/** Plain-text summary of the customer's own records, small enough for a local model. */
async function buildContext(userId, now = new Date()) {
    const db = getDb();
    const user = db.prepare('SELECT full_name, created_at FROM users WHERE id = ?').get(userId);
    const lines = [];
    const section = (title, rows) => { lines.push(`## ${title}`); lines.push(...(rows.length ? rows : ['(none)'])); lines.push(''); };
    lines.push(`Today: ${now.toISOString().slice(0, 10)}. Customer: ${user ? user.full_name.split(' ')[0] : 'customer'}. All amounts are from Willow's records.`, '');

    const accounts = db.prepare("SELECT nickname, account_type, purpose, currency, balance, account_number FROM accounts WHERE user_id = ? AND status = 'active' ORDER BY id").all(userId);
    section('Accounts', accounts.map(a => `- ${a.nickname || (a.purpose === 'business' ? 'Business checking' : a.account_type === 'savings' ? 'Savings' : 'Checking')} (··${String(a.account_number).slice(-4)}, ${a.purpose}, ${a.currency}): balance ${money(a.balance, a.currency)}`));

    const summary = hub.getSummary(userId);
    section('This month (USD accounts)', [
        `- Money in: ${usd(summary.month.earnedCents)}; spending (excludes moves between own accounts): ${usd(summary.month.spendingCents)} across ${summary.spendingCount} payments`,
        `- Spending last month in total: ${usd(summary.previousMonthSpendingCents)}; last month up to the same day: ${usd(summary.previousMonthToDateSpendingCents)}`,
        ...summary.categories.slice(0, 8).map(c => `- Category ${c.label}: ${usd(c.cents)}`),
    ]);

    const recent = db.prepare(`SELECT t.created_at, t.description, t.type, t.direction, t.amount, t.currency, t.category FROM transactions t JOIN accounts a ON a.id = t.account_id
        WHERE a.user_id = ? AND t.status = 'completed' ORDER BY t.created_at DESC, t.id DESC LIMIT 20`).all(userId);
    section('Most recent transactions (newest first)', recent.map(t => `- ${String(t.created_at).slice(0, 10)} ${t.direction === 'credit' ? '+' : '-'}${money(t.amount, t.currency)} ${t.description || t.type} [${categoryMeta(categorize(t)).label}]`));

    const series = hub.cashflowSeries(userId);
    section('Last six months (USD, money in vs spending)', series.map(m => `- ${m.key}: in ${usd(m.incomeCents)}, out ${usd(m.spendingCents)}`));

    const personal = budgets.listBudgets(userId, 'personal', now);
    const businessBudgets = budgets.listBudgets(userId, 'business', now);
    section('Budgets', [...personal, ...businessBudgets].map(b => `- ${b.name} (${b.scope}, ${b.period}, ${b.categoryLabel}): spent ${usd(b.spentCents)} of ${usd(b.limitCents)} this period (${b.status}); ${b.remainingCents >= 0 ? `${usd(b.remainingCents)} left, about ${usd(b.perDayLeftCents)} a day for ${b.daysLeft} day(s)` : `${usd(-b.remainingCents)} over`}`));

    let worth = null;
    try { worth = await networth.computeNetWorth(userId); } catch (error) { worth = null; }
    if (worth) {
        section('Net worth', [
            `- Net worth ${usd(worth.netCents)} = Willow accounts ${usd(worth.accountsCents)} + investing ${usd(worth.investmentsCents)} + logged assets ${usd(worth.assetsCents)} - debts ${usd(worth.debtsCents)}`,
            ...worth.composition.map(c => `- Asset group ${c.label}: ${usd(c.cents)}`),
            worth.fxUnavailable ? '- Note: some currency accounts could not be converted to USD right now.' : null,
        ].filter(Boolean));
    }
    const debts = networth.listDebts(userId);
    section('Debts (logged by the customer)', debts.map(d => `- ${d.name} (${d.kindLabel}${d.lender ? `, ${d.lender}` : ''}, ${d.status}): owes ${usd(d.balanceCents)} of ${usd(d.originalCents)}, APR ${d.apr}%, minimum ${usd(d.minimumCents)}/month${d.nextDue ? `, next due ${d.nextDue}` : ''}; ${d.payoffPossible ? `about ${d.payoffMonths} month(s) to pay off at the minimum with ${usd(d.payoffInterestCents)} interest` : 'the minimum payment does not cover the interest'}`));
    const assets = networth.listAssets(userId);
    section('Assets (logged by the customer)', assets.map(a => `- ${a.name} (${a.kindLabel}): ${usd(a.valueCents)}`));

    try {
        const valuation = await portfolio.valuePortfolio(userId);
        section('Investing (simulated orders at delayed market prices)', [
            `- Investing cash ${usd(Math.round(valuation.cash * 100))}; net money moved in ${usd(Math.round(valuation.contributed * 100))}; total value ${usd(Math.round(valuation.total * 100))}; return vs money moved in ${usd(Math.round(valuation.totalReturn * 100))}`,
            ...valuation.holdings.map(h => `- ${h.symbol} ${h.name}: ${Number(h.quantity.toFixed(6))} units worth ${usd(Math.round(h.marketValue * 100))} (cost ${usd(Math.round(h.costBasis * 100))})${h.priceAvailable ? '' : ', price unavailable'}`),
        ]);
    } catch (error) {
        section('Investing', ['- Portfolio values are unavailable right now.']);
    }

    section('Savings goals', goals.listGoals(userId).map(g => `- ${g.name}: ${usd(g.current_cents ?? g.currentCents ?? 0)} of ${usd(g.target_cents ?? g.targetCents ?? 0)}`));

    const biz = business.getDashboard(userId);
    if (biz.accounts.length || biz.recentExpenses.length || biz.invoices.length) {
        const open = biz.invoices.filter(i => ['open', 'overdue'].includes(i.displayStatus));
        section('Business', [
            `- This month: revenue ${usd(biz.revenueCents)}, expenses ${usd(biz.expensesCents)}, net ${usd(biz.netCents)}`,
            `- Open invoices: ${open.length} worth ${usd(open.reduce((sum, i) => sum + i.amount, 0))}${open.some(i => i.displayStatus === 'overdue') ? ' (some overdue)' : ''}`,
            ...biz.categories.slice(0, 6).map(c => `- Expense category ${c.label}: ${usd(c.cents)} this month`),
            ...biz.recentExpenses.slice(0, 5).map(e => `- Expense ${e.spentOn} ${e.vendor}: ${usd(e.amountCents)} (${e.categoryLabel})`),
        ]);
    }

    const scheduled = summary.scheduledTransfers || [];
    section('Scheduled transfers', scheduled.map(t => `- ${String(t.scheduled_for).slice(0, 10)}: ${usd(t.amount)} ${t.description || ''}`.trim()));
    return lines.join('\n');
}

const SYSTEM_PROMPT = `You are the assistant inside Willow, a personal banking app. The customer's own records are in the CONTEXT block.
Rules:
- Use only CONTEXT for facts about the customer's money. If something isn't there, say you don't have that information and, where useful, point to the part of Willow where they can add or find it (Budgets, Net worth, Debts, Business, Transactions, Investing).
- Be exact with numbers. Show amounts in US dollars like $1,234.56 unless another currency is stated. Do arithmetic step by step in your head and give the result.
- You may explain general money concepts and suggest budgeting or debt-repayment approaches. Do not predict market prices or returns, and do not tell the customer to buy or sell specific investments.
- Keep answers short: two to five sentences or a short bullet list. Use plain text with "-" bullets; no tables or headings.
- Willow is a demonstration bank: money in it does not reach real banks or markets. Mention this only if it matters to the question.`;

/**
 * Streams an answer. `history` is [{ role: 'user'|'assistant', content }] from
 * this conversation; `onToken` receives text as it arrives. Resolves with the
 * full answer.
 */
async function chat(userId, { question, history = [] }, { onToken = () => {}, signal } = {}) {
    const text = typeof question === 'string' ? question.trim() : '';
    if (!text) throw Object.assign(new Error('Ask a question about your money.'), { status: 400 });
    if (text.length > MAX_QUESTION) throw Object.assign(new Error(`Keep questions under ${MAX_QUESTION} characters.`), { status: 400 });
    const current = await getStatus();
    if (!current.available) throw Object.assign(new Error('The assistant is offline. Start Ollama on this computer to use it.'), { status: 503, code: 'assistant_unavailable' });
    const turns = (Array.isArray(history) ? history : [])
        .filter(turn => turn && ['user', 'assistant'].includes(turn.role) && typeof turn.content === 'string' && turn.content.trim())
        .slice(-MAX_TURNS)
        .map(turn => ({ role: turn.role, content: turn.content.slice(0, 4000) }));
    const context = await buildContext(userId);
    const messages = [
        { role: 'system', content: `${SYSTEM_PROMPT}\n\nCONTEXT\n${context}` },
        ...turns,
        { role: 'user', content: text },
    ];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.assistant.timeoutMs);
    if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true });
    let answer = '';
    try {
        const response = await fetch(`${config.assistant.ollamaUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: current.model, messages, stream: true, options: { temperature: 0.2, num_ctx: 8192 } }),
            signal: controller.signal,
        });
        if (!response.ok || !response.body) {
            status.checkedAt = 0;
            throw Object.assign(new Error('The local model could not answer. Check that Ollama is running.'), { status: 502 });
        }
        const decoder = new TextDecoder();
        let buffer = '';
        for await (const chunk of response.body) {
            buffer += decoder.decode(chunk, { stream: true });
            let newline;
            while ((newline = buffer.indexOf('\n')) >= 0) {
                const line = buffer.slice(0, newline).trim();
                buffer = buffer.slice(newline + 1);
                if (!line) continue;
                let event;
                try { event = JSON.parse(line); } catch (error) { continue; }
                if (event.error) throw Object.assign(new Error('The local model reported an error.'), { status: 502 });
                const token = event.message && event.message.content;
                if (token) { answer += token; onToken(token); }
            }
        }
    } catch (error) {
        if (error.name === 'AbortError') throw Object.assign(new Error(signal && signal.aborted ? 'Stopped.' : 'The local model took too long to answer.'), { status: 504 });
        if (!error.status) { status.checkedAt = 0; throw Object.assign(new Error('The local model could not be reached. Check that Ollama is running.'), { status: 502 }); }
        throw error;
    } finally {
        clearTimeout(timer);
    }
    return answer.trim();
}

module.exports = { refreshStatus, cachedStatus, getStatus, buildContext, chat, SYSTEM_PROMPT };
