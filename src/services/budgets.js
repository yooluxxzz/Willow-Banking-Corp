/**
 * Budgets the customer sets for themselves, measured only against what really
 * happened: money leaving their personal accounts (personal scope) or the
 * business expenses they logged (business scope).
 *
 * Days are calendar days in the server's local time zone. A nightly job (and a
 * catch-up at startup) records one check per budget per day in budget_checks
 * and sends a notification the first time a period gets close to or over its limit.
 */
const { getDb } = require('../database');
const { categorize, categoryMeta } = require('./categories');
const { formatCurrency, parseCents } = require('../middleware/validation');
const { createNotification } = require('./notification');
const { ledgerRows, isSpending, total } = require('./spending');
const { ValidationError } = require('../errors');

const PERIODS = ['daily', 'weekly', 'monthly'];
const PERSONAL_CATEGORIES = ['groceries', 'dining', 'transport', 'housing', 'bills', 'shopping', 'entertainment', 'health', 'travel', 'cash', 'transfers', 'debt', 'other'];
const BUSINESS_CATEGORIES = {
    rent: 'Rent & premises',
    payroll: 'Payroll & contractors',
    software: 'Software & subscriptions',
    supplies: 'Supplies & materials',
    equipment: 'Equipment',
    marketing: 'Marketing',
    travel: 'Travel',
    utilities: 'Utilities',
    professional: 'Professional services',
    taxes: 'Taxes & fees',
    other: 'Other',
};
const NEAR_RATIO = 0.85;
const MAX_BUDGETS = 30;
const LAST_DAY_KEY = 'budget_checks_last_day';

// ── Dates (server local time) ────────────────────────────────────────────
const pad = n => String(n).padStart(2, '0');
const dayKey = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const parseDay = key => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (date, n) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
const sqlUtc = date => date.toISOString().replace('T', ' ').slice(0, 19);
/** The local calendar day of a stored UTC timestamp ("2026-10-03 02:00:00" is 2 October in California). */
const localDayOf = timestamp => { const at = new Date(`${String(timestamp).replace(' ', 'T')}Z`); return new Date(at.getFullYear(), at.getMonth(), at.getDate()); };

function periodStart(period, day) {
    if (period === 'monthly') return new Date(day.getFullYear(), day.getMonth(), 1);
    if (period === 'weekly') return addDays(day, -((day.getDay() + 6) % 7)); // Monday
    return new Date(day.getFullYear(), day.getMonth(), day.getDate());
}

function periodEnd(period, start) {
    if (period === 'monthly') return new Date(start.getFullYear(), start.getMonth() + 1, 1);
    if (period === 'weekly') return addDays(start, 7);
    return addDays(start, 1);
}

function categoryLabel(scope, key) {
    if (!key) return scope === 'business' ? 'All business expenses' : 'All spending';
    return scope === 'business' ? (BUSINESS_CATEGORIES[key] || 'Other') : categoryMeta(key).label;
}

// ── Spending ─────────────────────────────────────────────────────────────
/** Personal spending between two instants (the shared definition in ./spending, personal accounts only). */
function personalSpending(userId, from, to, category = null) {
    return total(ledgerRows(userId, sqlUtc(from), sqlUtc(to), { purpose: 'personal' })
        .filter(row => isSpending(row, userId) && (!category || categorize(row) === category)));
}

function businessSpending(userId, fromDay, toDay, category = null) {
    const row = getDb().prepare(`SELECT COALESCE(SUM(amount_cents), 0) AS total FROM business_expenses
        WHERE user_id = ? AND currency = 'USD' AND spent_on >= ? AND spent_on < ? AND (? IS NULL OR category = ?)`).get(userId, fromDay, toDay, category, category);
    return row.total;
}

/** Spending for a budget's period that contains `day`, up to `until` (exclusive). */
function spentFor(budget, day, until) {
    const start = periodStart(budget.period, day);
    const end = periodEnd(budget.period, start);
    const stop = until && until < end ? until : end;
    // Business expenses are dated, not timed: a partial day counts in full.
    const midnight = new Date(stop.getFullYear(), stop.getMonth(), stop.getDate());
    const spent = budget.scope === 'business'
        ? businessSpending(budget.user_id, dayKey(start), dayKey(stop > midnight ? addDays(midnight, 1) : midnight), budget.category)
        : personalSpending(budget.user_id, start, stop, budget.category);
    return { start, end, spent };
}

function statusFor(spent, limit) {
    if (spent > limit) return 'over';
    if (spent >= limit * NEAR_RATIO) return 'near';
    return 'under';
}

// ── CRUD ─────────────────────────────────────────────────────────────────
function validate(scope, input) {
    const name = String(input.name || '').trim();
    if (!name || name.length > 60 || /[<>\x00-\x1f]/.test(name)) throw new ValidationError('Give the budget a name up to 60 characters.');
    const period = String(input.period || '');
    if (!PERIODS.includes(period)) throw new ValidationError('Choose daily, weekly or monthly.');
    if (input.category !== undefined && input.category !== null && typeof input.category !== 'string') throw new ValidationError('Choose a category from the list.');
    let category = input.category || null;
    if (category) {
        const allowed = scope === 'business' ? Object.keys(BUSINESS_CATEGORIES) : PERSONAL_CATEGORIES;
        if (!allowed.includes(category)) throw new ValidationError('Choose a category from the list.');
    } else category = null;
    const limitCents = parseCents(input.limit, { max: 100000000 });
    if (limitCents === null || limitCents < 100) throw new ValidationError('Set a limit between $1 and $1,000,000.');
    return { name, period, category, limitCents };
}

function scopeOf(value) {
    return value === 'business' ? 'business' : 'personal';
}

function createBudget(userId, input) {
    const db = getDb();
    const scope = scopeOf(input.scope);
    const { name, period, category, limitCents } = validate(scope, input);
    if (db.prepare("SELECT COUNT(*) AS n FROM budgets WHERE user_id = ? AND status = 'active'").get(userId).n >= MAX_BUDGETS) throw new ValidationError(`You can keep up to ${MAX_BUDGETS} budgets.`);
    const id = db.prepare('INSERT INTO budgets (user_id, scope, name, category, period, limit_cents) VALUES (?, ?, ?, ?, ?, ?)').run(userId, scope, name, category, period, limitCents).lastInsertRowid;
    return getBudget(userId, id);
}

function updateBudget(userId, id, input) {
    const db = getDb();
    const existing = db.prepare("SELECT * FROM budgets WHERE id = ? AND user_id = ? AND status = 'active'").get(Number(id), userId);
    if (!existing) throw Object.assign(new Error('Budget not found.'), { status: 404 });
    const { name, period, category, limitCents } = validate(existing.scope, { name: existing.name, period: existing.period, category: existing.category, limit: existing.limit_cents / 100, ...input });
    db.prepare("UPDATE budgets SET name = ?, period = ?, category = ?, limit_cents = ?, updated_at = datetime('now') WHERE id = ?").run(name, period, category, limitCents, existing.id);
    if (existing.period !== period || existing.category !== category) db.prepare('DELETE FROM budget_checks WHERE budget_id = ?').run(existing.id);
    return getBudget(userId, existing.id);
}

function deleteBudget(userId, id) {
    const result = getDb().prepare('DELETE FROM budgets WHERE id = ? AND user_id = ?').run(Number(id), userId);
    if (!result.changes) throw Object.assign(new Error('Budget not found.'), { status: 404 });
}

function present(budget, now = new Date()) {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    // Ledger times are stored to the second and nothing is dated in the future, so the
    // current period is measured to its end rather than to this exact millisecond.
    const { start, end, spent } = spentFor(budget, today, null);
    const limit = budget.limit_cents;
    const daysLeft = Math.max(1, Math.round((end - today) / 86400000));
    const history = getDb().prepare('SELECT day, spent_cents, limit_cents, status FROM budget_checks WHERE budget_id = ? ORDER BY day DESC LIMIT 14').all(budget.id).reverse();
    return {
        id: budget.id,
        scope: budget.scope,
        name: budget.name,
        category: budget.category,
        categoryLabel: categoryLabel(budget.scope, budget.category),
        period: budget.period,
        limitCents: limit,
        spentCents: spent,
        remainingCents: limit - spent,
        percent: Math.round((spent / limit) * 1000) / 10,
        status: statusFor(spent, limit),
        periodStart: dayKey(start),
        periodEnd: dayKey(addDays(end, -1)),
        daysLeft,
        perDayLeftCents: Math.max(0, Math.floor((limit - spent) / daysLeft)),
        history: history.map(row => ({ day: row.day, spentCents: row.spent_cents, limitCents: row.limit_cents, status: row.status })),
        createdAt: budget.created_at,
    };
}

function getBudget(userId, id) {
    const budget = getDb().prepare("SELECT * FROM budgets WHERE id = ? AND user_id = ? AND status = 'active'").get(Number(id), userId);
    if (!budget) throw Object.assign(new Error('Budget not found.'), { status: 404 });
    return present(budget);
}

function listBudgets(userId, scope, now = new Date()) {
    return getDb().prepare("SELECT * FROM budgets WHERE user_id = ? AND scope = ? AND status = 'active' ORDER BY id").all(userId, scopeOf(scope)).map(budget => present(budget, now));
}

function categoryOptions(scope) {
    return scopeOf(scope) === 'business'
        ? Object.entries(BUSINESS_CATEGORIES).map(([key, label]) => ({ key, label }))
        : PERSONAL_CATEGORIES.map(key => ({ key, label: categoryMeta(key).label }));
}

// ── Daily checks ─────────────────────────────────────────────────────────
function getMeta(key) {
    const row = getDb().prepare('SELECT value FROM app_meta WHERE key = ?').get(key);
    return row ? row.value : null;
}

function setMeta(key, value) {
    getDb().prepare("INSERT INTO app_meta (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").run(key, value);
}

/** "today" / "this week" / "this month", or the date when the check is for an earlier period. */
function periodLabel(period, day, now) {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const date = day.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    if (period === 'daily') return dayKey(day) === dayKey(today) ? 'today' : `on ${date}`;
    if (period === 'weekly') return dayKey(periodStart('weekly', day)) === dayKey(periodStart('weekly', today)) ? 'this week' : `in the week of ${periodStart('weekly', day).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`;
    return day.getMonth() === today.getMonth() && day.getFullYear() === today.getFullYear() ? 'this month' : `in ${day.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;
}

function notify(budget, level, spent, day = new Date(), now = new Date()) {
    const label = periodLabel(budget.period, day, now);
    const title = level === 'over' ? `Over budget: ${budget.name}` : `Close to your budget: ${budget.name}`;
    const message = `${formatCurrency(spent)} of ${formatCurrency(budget.limit_cents)} spent ${label}${level === 'over' ? ` — ${formatCurrency(spent - budget.limit_cents)} over.` : '.'}`;
    createNotification(budget.user_id, 'budget', title, message);
}

/** Records the check for one budget on one day. Returns { status, notified }. */
function checkBudgetDay(budget, day, { now = new Date(), notifyUser = true } = {}) {
    const db = getDb();
    const { start, spent } = spentFor(budget, day, addDays(day, 1));
    const status = statusFor(spent, budget.limit_cents);
    const key = dayKey(day);
    const periodKey = dayKey(start);
    db.prepare(`INSERT INTO budget_checks (budget_id, user_id, day, period_start, spent_cents, limit_cents, status) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(budget_id, day) DO UPDATE SET spent_cents = excluded.spent_cents, limit_cents = excluded.limit_cents, status = excluded.status, checked_at = datetime('now')`)
        .run(budget.id, budget.user_id, key, periodKey, spent, budget.limit_cents, status);
    if (notifyUser && status !== 'under') {
        const already = db.prepare("SELECT notified FROM budget_checks WHERE budget_id = ? AND period_start = ? AND notified != '' ORDER BY CASE notified WHEN 'over' THEN 0 ELSE 1 END LIMIT 1").get(budget.id, periodKey);
        const level = already && already.notified;
        if (level !== 'over' && (status === 'over' || level !== 'near')) {
            notify(budget, status, spent, day, now);
            db.prepare('UPDATE budget_checks SET notified = ? WHERE budget_id = ? AND day = ?').run(status, budget.id, key);
            return { status, notified: true };
        }
    }
    return { status, notified: false };
}

/**
 * Checks every active budget.
 *
 * Every run first records each day that has ended since the last completed check (up
 * to 31 days back), so no day is ever skipped: not while Willow was stopped, not when
 * it starts just before midnight, and not the last minutes after the nightly run.
 * The nightly run (mode 'nightly') then also checks today so far. Only days that have
 * ended count as done; today is checked again once it is over. Alerts are sent only
 * for the most recent day, so a long downtime doesn't flood anyone with notifications.
 */
function runBudgetChecks({ now = new Date(), mode = 'nightly' } = {}) {
    const db = getDb();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const last = getMeta(LAST_DAY_KEY);
    const earliest = addDays(today, -31);
    let first = last ? addDays(parseDay(last), 1) : addDays(today, -1);
    if (first < earliest) first = earliest;
    const days = [];
    for (let day = first; day < today; day = addDays(day, 1)) days.push(day);
    const completed = days.length;
    if (mode === 'nightly') days.push(today);
    const budgets = db.prepare("SELECT * FROM budgets WHERE status = 'active'").all();
    let checks = 0;
    let alerts = 0;
    days.forEach((day, index) => {
        const isLatest = index === days.length - 1;
        budgets.forEach(budget => {
            if (day < localDayOf(budget.created_at)) return;
            if (checkBudgetDay(budget, day, { now, notifyUser: isLatest }).notified) alerts += 1;
            checks += 1;
        });
    });
    if (completed) setMeta(LAST_DAY_KEY, dayKey(days[completed - 1]));
    return { days: days.map(dayKey), checks, alerts };
}

/** The most recent day whose budget check is complete, or null before the first check. */
function lastCompletedDay() {
    return getMeta(LAST_DAY_KEY);
}

/** Milliseconds from `now` until the next daily check at HH:MM local time. */
function msUntil(time, now = new Date()) {
    const [h, m] = String(time || '23:55').split(':').map(Number);
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Number.isFinite(h) ? h : 23, Number.isFinite(m) ? m : 55, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next - now;
}

module.exports = {
    PERIODS, PERSONAL_CATEGORIES, BUSINESS_CATEGORIES,
    createBudget, updateBudget, deleteBudget, getBudget, listBudgets, categoryOptions,
    runBudgetChecks, checkBudgetDay, lastCompletedDay, msUntil, periodLabel, personalSpending, businessSpending, dayKey,
};
