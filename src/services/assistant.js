/**
 * Willow assistant — a local language model served by Ollama
 * (https://ollama.com) on the same machine as Willow. Nothing leaves the
 * machine: the model gets a compact summary of the signed-in customer's own
 * records with each question, and answers are streamed back.
 *
 * Built to behave well with a real local model:
 *  - picks an installed chat model (never an embedding model), or OLLAMA_MODEL;
 *  - loads the model as soon as it is found and keeps it in memory, so the first
 *    answer doesn't wait for a cold start;
 *  - allows time for loading, then times out only if the answer stalls;
 *  - hides the "thinking" text that reasoning models (qwen3, deepseek-r1) emit;
 *  - passes on Ollama's own error message (for example, not enough memory);
 *  - gives the model figures already calculated, because small models are
 *    unreliable at arithmetic.
 *
 * When Ollama isn't available (or fails before it answers), ./quick-answers
 * answers from the customer's figures instead, so Ask Willow always responds.
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
const KEEP_ALIVE = '30m';
const STALL_MS = 45 * 1000;
const MAX_ANSWER_MS = 5 * 60 * 1000;
// Used when several chat models are installed and OLLAMA_MODEL isn't set.
const PREFERRED = ['llama3.2', 'llama3.1', 'qwen2.5', 'qwen3', 'gemma3', 'gemma2', 'mistral', 'mistral-nemo', 'phi4', 'phi3', 'llama3'];
const NOT_CHAT = /embed|bge|minilm|rerank|clip|whisper|e5-/i;
let status = { available: false, model: null, reason: 'not_checked', checkedAt: 0 };
let pending = null;
let warmedModel = null;

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

/** Installed models that can chat: embedding and other special-purpose models are left out. */
function chatModels(models) {
    return (models || []).filter(model => {
        const name = model.name || model.model || '';
        const details = model.details || {};
        const families = [].concat(details.families || [], details.family || []);
        return name && !NOT_CHAT.test(name) && !families.some(family => /bert|clip/i.test(String(family)));
    }).map(model => model.name || model.model);
}

/** OLLAMA_MODEL if installed (by full name or without its tag), else the first preferred family, else any chat model. */
function pickModel(names, wanted) {
    if (wanted) return names.find(name => name === wanted || name.split(':')[0] === wanted) || null;
    for (const family of PREFERRED) {
        const found = names.find(name => name.split(':')[0] === family);
        if (found) return found;
    }
    return names[0] || null;
}

/** Loads the model into memory in the background (an empty chat request does that in Ollama). */
function warmUp(model) {
    if (warmedModel === model) return;
    warmedModel = model;
    const started = Date.now();
    fetch(`${config.assistant.ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: [], keep_alive: KEEP_ALIVE }),
        signal: AbortSignal.timeout(config.assistant.timeoutMs),
    }).then(response => {
        if (response.ok) console.log(`[Assistant] ${model} is loaded and ready (${Math.round((Date.now() - started) / 1000)}s).`);
    }).catch(() => { warmedModel = null; });
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
            const wanted = config.assistant.model;
            const model = pickModel(chatModels(data.models), wanted);
            status = model
                ? { available: true, model, reason: null, checkedAt: Date.now() }
                : { available: false, model: null, reason: wanted ? 'model_missing' : 'no_models', checkedAt: Date.now() };
            if (model) warmUp(model);
        } catch (error) {
            status = { available: false, model: null, reason: 'unreachable', checkedAt: Date.now() };
            warmedModel = null;
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
        `- Money in: ${usd(summary.month.earnedCents)}; spending (payments, withdrawals and money sent to other people; not moves between own accounts, investing cash or conversions): ${usd(summary.month.spendingCents)} across ${summary.spendingCount} payments`,
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

    const worth = await networth.computeNetWorth(userId).catch(() => null);
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

    let valuation = null;
    try {
        valuation = await portfolio.valuePortfolio(userId);
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

    // Small models are unreliable at adding things up, so the totals people ask about
    // most are worked out here and listed first.
    const facts = keyFigures({ accounts, summary, worth, budgets: [...personal, ...businessBudgets], debts, valuation });
    lines.splice(2, 0, '## Key figures (already calculated: use these numbers as they are)', ...facts, '');
    return lines.join('\n');
}

function keyFigures({ accounts, summary, worth, budgets: allBudgets, debts, valuation }) {
    const facts = [];
    const dollars = accounts.filter(a => a.currency === 'USD');
    const savings = dollars.filter(a => a.account_type === 'savings').reduce((sum, a) => sum + a.balance, 0);
    const others = accounts.filter(a => a.currency !== 'USD');
    facts.push(`- Money in Willow accounts in US dollars: ${usd(dollars.reduce((sum, a) => sum + a.balance, 0))}${savings ? `, of which ${usd(savings)} in savings` : ''}${others.length ? `; also ${others.map(a => money(a.balance, a.currency)).join(', ')}` : ''}.`);
    facts.push(`- This month: spent ${usd(summary.month.spendingCents)} in ${summary.spendingCount} payment${summary.spendingCount === 1 ? '' : 's'}; money in ${usd(summary.month.earnedCents)}; last month ${usd(summary.previousMonthSpendingCents)} spent in total.`);
    if (summary.categories.length) facts.push(`- Biggest spending categories this month: ${summary.categories.slice(0, 3).map(c => `${c.label} ${usd(c.cents)}`).join(', ')}.`);
    if (summary.topExpenses.length) facts.push(`- Biggest expenses this month: ${summary.topExpenses.slice(0, 3).map(e => `${e.description} ${usd(e.amountCents)}`).join(', ')}.`);
    if (worth) facts.push(`- Net worth: ${usd(worth.netCents)} (owns ${usd(worth.accountsCents + worth.investmentsCents + worth.assetsCents)}, owes ${usd(worth.debtsCents)}).`);
    if (allBudgets.length) {
        const count = state => allBudgets.filter(b => b.status === state).length;
        facts.push(`- Budgets: ${allBudgets.length} set; ${count('under')} on track, ${count('near')} close to the limit, ${count('over')} over.`);
    } else {
        facts.push('- Budgets: none set yet.');
    }
    const open = debts.filter(d => d.status === 'open');
    if (open.length) {
        const costliest = [...open].sort((a, b) => b.apr - a.apr)[0];
        facts.push(`- Debts: owes ${usd(open.reduce((sum, d) => sum + d.balanceCents, 0))} across ${open.length}; highest interest rate: ${costliest.name} at ${costliest.apr}% APR.`);
    }
    if (valuation && valuation.total > 0) {
        const share = value => `${Math.round((value / valuation.total) * 100)}%`;
        const parts = valuation.holdings.filter(h => h.marketValue > 0).map(h => `${h.symbol} ${share(h.marketValue)}`);
        if (valuation.cash > 0) parts.push(`cash ${share(valuation.cash)}`);
        facts.push(`- Investing: worth ${usd(Math.round(valuation.total * 100))}; allocation ${parts.join(', ') || 'all in cash'}.`);
    }
    return facts;
}

/** Up to three pages that help with the question, shown as links under the answer. */
function relatedLinks(question) {
    const text = String(question || '').toLowerCase();
    const links = [
        [/spen[dt]|expens|categor|bought|shopping|grocer|dining/, { label: 'Spending by category', href: '/net-worth#spending' }],
        [/budget|limit|on track/, { label: 'Budgets', href: '/budgets' }],
        [/debt|loan|owe|credit card|interest|pay off|payoff|mortgage/, { label: 'Debts', href: '/debts' }],
        [/net worth|worth|asset|own\b|picture/, { label: 'Net worth', href: '/net-worth' }],
        [/invest|portfolio|stock|shares|etf|fund|allocation|crypto|bitcoin/, { label: 'Portfolio', href: '/wealth' }],
        [/business|invoice|revenue|client/, { label: 'Business', href: '/business/dashboard' }],
        [/saving|goal|emergency/, { label: 'Goals', href: '/goals' }],
        [/transaction|payment|transfer|sent|received|history|last \d+/, { label: 'Transactions', href: '/transactions' }],
        [/balance|account|checking/, { label: 'Accounts', href: '/accounts' }],
    ];
    return links.filter(([pattern]) => pattern.test(text)).map(([, link]) => link).slice(0, 3);
}

const SYSTEM_PROMPT = `You are the assistant inside Willow, a personal banking app. The customer's own records are in the CONTEXT block.
Rules:
- Use only CONTEXT for facts about the customer's money. If something isn't there, say you don't have that information and, where useful, point to the part of Willow where they can add or find it (Budgets, Net worth, Debts, Business, Transactions, Investing).
- Be exact with numbers. Show amounts in US dollars like $1,234.56 unless another currency is stated. Do arithmetic step by step in your head and give the result.
- You may explain general money concepts and suggest budgeting or debt-repayment approaches. Do not predict market prices or returns, and do not tell the customer to buy or sell specific investments.
- Keep answers short: two to five sentences or a short bullet list. Use plain text with "-" bullets; no tables or headings.
- Willow is a demonstration bank: money in it does not reach real banks or markets. Mention this only if it matters to the question.`;

/**
 * Removes <think>…</think> sections that reasoning models stream before their answer,
 * including tags split across chunks. push() returns the visible part of a chunk.
 */
function thinkFilter() {
    const OPEN = '<think>';
    const CLOSE = '</think>';
    let inside = false;
    let carry = '';
    return {
        push(chunk) {
            let text = carry + chunk;
            let visible = '';
            carry = '';
            while (text) {
                const tag = inside ? CLOSE : OPEN;
                const at = text.indexOf(tag);
                if (at >= 0) {
                    if (!inside) visible += text.slice(0, at);
                    text = text.slice(at + tag.length);
                    inside = !inside;
                    continue;
                }
                // Hold back an incomplete tag at the end until the next chunk arrives.
                let keep = 0;
                for (let n = Math.min(tag.length - 1, text.length); n > 0; n -= 1) {
                    if (tag.startsWith(text.slice(-n))) { keep = n; break; }
                }
                if (!inside) visible += text.slice(0, text.length - keep);
                carry = text.slice(text.length - keep);
                text = '';
            }
            return visible;
        },
        flush() {
            const rest = inside ? '' : carry;
            carry = '';
            return rest;
        },
    };
}

const fail = (message, httpStatus = 502) => Object.assign(new Error(message), { status: httpStatus });
/** Ollama's own error text, shortened, for messages people can act on. */
const ollamaReason = text => String(text || '').replace(/\s+/g, ' ').trim().slice(0, 200);

/**
 * Streams an answer. `history` is [{ role: 'user'|'assistant', content }] from
 * this conversation; `onToken` receives text as it arrives. Resolves with the
 * full answer.
 */
async function chat(userId, { question, history = [] }, { onToken = () => {}, signal } = {}) {
    const text = typeof question === 'string' ? question.trim() : '';
    if (!text) throw fail('Ask a question about your money.', 400);
    if (text.length > MAX_QUESTION) throw fail(`Keep questions under ${MAX_QUESTION} characters.`, 400);
    const current = await getStatus();
    if (!current.available) throw Object.assign(fail('The assistant is offline. Start Ollama on this computer to use it.', 503), { code: 'assistant_unavailable' });
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

    // The first word may take a while (the model can still be loading); after that, an
    // answer that stops arriving for STALL_MS is treated as stuck.
    const controller = new AbortController();
    let timedOut = false;
    let watchdog = null;
    const waitFor = ms => { clearTimeout(watchdog); watchdog = setTimeout(() => { timedOut = true; controller.abort(); }, ms); };
    const cap = setTimeout(() => { timedOut = true; controller.abort(); }, MAX_ANSWER_MS);
    if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true });
    waitFor(config.assistant.timeoutMs);

    const filter = thinkFilter();
    let answer = '';
    const emit = piece => { if (piece) { answer += piece; onToken(piece); } };
    try {
        const response = await fetch(`${config.assistant.ollamaUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: current.model, messages, stream: true, keep_alive: KEEP_ALIVE, options: { temperature: 0.2, num_ctx: config.assistant.contextTokens } }),
            signal: controller.signal,
        });
        if (!response.ok || !response.body) {
            const body = await response.text().catch(() => '');
            let reason = body;
            try { reason = JSON.parse(body).error || body; } catch (error) { /* plain text */ }
            status.checkedAt = 0;
            if (response.status === 404) {
                warmedModel = null;
                throw fail(`The model ${current.model} isn’t installed in Ollama any more. Run: ollama pull ${current.model.split(':')[0]}`);
            }
            throw fail(reason ? `The local model couldn’t answer: ${ollamaReason(reason)}` : 'The local model couldn’t answer. Check that Ollama is running.');
        }
        const decoder = new TextDecoder();
        let buffer = '';
        for await (const chunk of response.body) {
            waitFor(STALL_MS);
            buffer += decoder.decode(chunk, { stream: true });
            let newline;
            while ((newline = buffer.indexOf('\n')) >= 0) {
                const line = buffer.slice(0, newline).trim();
                buffer = buffer.slice(newline + 1);
                if (!line) continue;
                let event;
                try { event = JSON.parse(line); } catch (error) { continue; }
                if (event.error) throw fail(`The local model stopped with an error: ${ollamaReason(event.error)}`);
                const token = event.message && event.message.content;
                if (token) emit(answer ? filter.push(token) : filter.push(token).replace(/^\s+/, ''));
            }
        }
        emit(filter.flush());
    } catch (error) {
        if (error.name === 'AbortError') {
            if (signal && signal.aborted) throw fail('Stopped.', 499);
            if (timedOut) throw fail(answer ? 'The local model stopped responding partway through.' : 'The local model took too long to answer. A larger model can be slow on this computer; try again, or use a smaller one (for example llama3.2).', 504);
        }
        if (!error.status) { status.checkedAt = 0; throw fail('The local model could not be reached. Check that Ollama is running.'); }
        throw error;
    } finally {
        clearTimeout(watchdog);
        clearTimeout(cap);
    }
    return answer.trim();
}

module.exports = { refreshStatus, cachedStatus, getStatus, buildContext, chat, relatedLinks, thinkFilter, pickModel, chatModels, SYSTEM_PROMPT };
