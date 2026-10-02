/**
 * Willow Business — profile, invoices, team and cash-flow summaries for a
 * single owner's business demo accounts. Team invitations never grant access.
 */
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database');
const { validateAmount, toCents, validateEmail, formatCurrency } = require('../middleware/validation');
const { logAudit } = require('./audit');
const { createNotification } = require('./notification');
const { categorize, categoryMeta } = require('./categories');
const { formatAccount } = require('./account');

const ROLES = { admin: 'Administrator', approver: 'Approver', cardholder: 'Cardholder', viewer: 'Viewer' };
const text = (value, max) => typeof value === 'string' && value.trim().length <= max && !/[<>\x00-\x1f\x7f]/.test(value);

function businessAccounts(userId) {
    return getDb().prepare("SELECT * FROM accounts WHERE user_id = ? AND purpose = 'business' ORDER BY id").all(userId).map(formatAccount);
}

function getProfile(userId) {
    return getDb().prepare('SELECT name, industry, country, created_at FROM business_profiles WHERE user_id = ?').get(userId) || null;
}

function saveProfile(userId, { name, industry = '', country = '' } = {}) {
    if (!text(name, 80) || name.trim().length < 2) throw new Error('Enter a business name of 2–80 characters.');
    if (!text(industry, 60) || !text(country, 56)) throw new Error('Use plain text for industry and country.');
    getDb().prepare(`INSERT INTO business_profiles (user_id, name, industry, country) VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET name = excluded.name, industry = excluded.industry, country = excluded.country, updated_at = datetime('now')`).run(userId, name.trim(), industry.trim(), country.trim());
    return getProfile(userId);
}

function invoiceStatus(row, today = new Date().toISOString().slice(0, 10)) {
    if (row.status === 'open' && row.due_on < today) return 'overdue';
    return row.status;
}

function formatInvoice(row) {
    const status = invoiceStatus(row);
    return { ...row, displayStatus: status, amountFormatted: formatCurrency(row.amount, row.currency) };
}

function listInvoices(userId) {
    return getDb().prepare('SELECT * FROM business_invoices WHERE user_id = ? ORDER BY CASE status WHEN \'open\' THEN 0 WHEN \'paid\' THEN 1 ELSE 2 END, due_on ASC, id DESC').all(userId).map(formatInvoice);
}

function nextInvoiceNumber(db, userId) {
    const rows = db.prepare('SELECT number FROM business_invoices WHERE user_id = ?').all(userId);
    const max = rows.reduce((highest, row) => Math.max(highest, Number((row.number.match(/(\d+)$/) || [])[1] || 0)), 1000);
    return `INV-${max + 1}`;
}

function createInvoice(userId, input = {}) {
    const { customerName, customerEmail = '', description = '', amount, dueOn } = input;
    if (!businessAccounts(userId).length) throw new Error('Open a business checking account before creating invoices.');
    if (!text(customerName, 80) || customerName.trim().length < 2) throw new Error('Enter the customer’s name.');
    if (customerEmail && !validateEmail(customerEmail)) throw new Error('Enter a valid customer email or leave it blank.');
    if (!text(description, 160)) throw new Error('Keep the description under 160 characters.');
    if (!validateAmount(amount) || toCents(amount) > 100000000) throw new Error('Enter an invoice amount up to 1,000,000.');
    const today = new Date().toISOString().slice(0, 10);
    if (typeof dueOn !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dueOn) || dueOn < today || Number.isNaN(Date.parse(dueOn))) throw new Error('Choose a due date from today onwards.');
    const db = getDb();
    const id = db.transaction(() => {
        const number = nextInvoiceNumber(db, userId);
        const created = db.prepare(`INSERT INTO business_invoices (user_id, number, customer_name, customer_email, description, amount, currency, issued_on, due_on, status)
            VALUES (?, ?, ?, ?, ?, ?, 'USD', ?, ?, 'open')`).run(userId, number, customerName.trim(), customerEmail.trim(), description.trim(), toCents(amount), today, dueOn);
        logAudit({ actorId: userId, action: 'invoice_created', targetType: 'invoice', targetId: String(created.lastInsertRowid), metadata: { number, simulated: true } });
        return created.lastInsertRowid;
    })();
    return formatInvoice(db.prepare('SELECT * FROM business_invoices WHERE id = ?').get(id));
}

/** Marks an invoice paid and records the simulated incoming payment. */
function markInvoicePaid(userId, invoiceId, { accountId } = {}) {
    const db = getDb();
    const invoice = db.prepare('SELECT * FROM business_invoices WHERE id = ? AND user_id = ?').get(invoiceId, userId);
    if (!invoice) throw Object.assign(new Error('Invoice not found.'), { status: 404 });
    if (invoice.status !== 'open') throw new Error('Only open invoices can be marked as paid.');
    const accounts = businessAccounts(userId).filter(account => account.status === 'active' && account.currency === invoice.currency);
    const account = accountId ? accounts.find(item => item.id === Number(accountId)) : accounts[0];
    if (!account) throw new Error('Choose an active business account in the invoice currency.');
    const reference = `INV-PAY-${uuidv4().slice(0, 8).toUpperCase()}`;
    db.transaction(() => {
        const updated = db.prepare("UPDATE business_invoices SET status = 'paid', paid_at = datetime('now'), paid_account_id = ?, transaction_reference = ? WHERE id = ? AND status = 'open'").run(account.id, reference, invoice.id);
        if (updated.changes !== 1) throw new Error('This invoice was already updated.');
        db.prepare('UPDATE accounts SET balance = balance + ?, available_balance = available_balance + ? WHERE id = ?').run(invoice.amount, invoice.amount, account.id);
        db.prepare(`INSERT INTO transactions (reference, account_id, type, amount, currency, direction, status, description, category, counterparty)
            VALUES (?, ?, 'deposit', ?, ?, 'credit', 'completed', ?, 'income', ?)`).run(reference, account.id, invoice.amount, invoice.currency, `Invoice ${invoice.number} payment — ${invoice.customer_name}`, invoice.customer_name);
        logAudit({ actorId: userId, action: 'invoice_paid', targetType: 'invoice', targetId: String(invoice.id), metadata: { reference, simulated: true } });
    })();
    try { createNotification(userId, 'deposit', 'Invoice paid (simulated)', `${invoice.number} for ${formatCurrency(invoice.amount, invoice.currency)} was marked paid. A simulated payment was added to ${account.displayName}.`); } catch (error) { /* non-critical */ }
    return formatInvoice(db.prepare('SELECT * FROM business_invoices WHERE id = ?').get(invoice.id));
}

function voidInvoice(userId, invoiceId) {
    const result = getDb().prepare("UPDATE business_invoices SET status = 'void' WHERE id = ? AND user_id = ? AND status = 'open'").run(invoiceId, userId);
    if (!result.changes) throw new Error('Only open invoices can be voided.');
    logAudit({ actorId: userId, action: 'invoice_voided', targetType: 'invoice', targetId: String(invoiceId) });
    return listInvoices(userId);
}

function listTeam(userId) {
    return getDb().prepare("SELECT id, name, email, role, status, created_at FROM business_team_members WHERE user_id = ? AND status = 'invited' ORDER BY created_at").all(userId)
        .map(member => ({ ...member, roleLabel: ROLES[member.role] || member.role }));
}

function inviteMember(userId, { name, email, role } = {}) {
    if (!text(name, 80) || name.trim().length < 2) throw new Error('Enter the team member’s name.');
    if (!validateEmail(email)) throw new Error('Enter a valid email address.');
    if (!Object.hasOwn(ROLES, role)) throw new Error('Choose a role.');
    const db = getDb();
    if (db.prepare("SELECT COUNT(*) AS count FROM business_team_members WHERE user_id = ? AND status = 'invited'").get(userId).count >= 20) throw new Error('This demo supports up to 20 team invitations.');
    db.prepare(`INSERT INTO business_team_members (user_id, name, email, role, status) VALUES (?, ?, ?, ?, 'invited')
        ON CONFLICT(user_id, email) DO UPDATE SET name = excluded.name, role = excluded.role, status = 'invited'`).run(userId, name.trim(), email.trim().toLowerCase(), role);
    logAudit({ actorId: userId, action: 'team_member_invited', targetType: 'business', targetId: String(userId), metadata: { role, simulated: true } });
    return listTeam(userId);
}

function removeMember(userId, memberId) {
    const result = getDb().prepare("UPDATE business_team_members SET status = 'removed' WHERE id = ? AND user_id = ? AND status = 'invited'").run(memberId, userId);
    if (!result.changes) throw new Error('Team member not found.');
    return listTeam(userId);
}

/** Revenue, expenses, cash flow and upcoming items for business accounts. */
function getDashboard(userId) {
    const db = getDb();
    const accounts = businessAccounts(userId);
    const ids = accounts.map(account => account.id);
    const usdIds = accounts.filter(account => account.currency === 'USD').map(account => account.id);
    const empty = { accounts, profile: getProfile(userId), months: [], revenueCents: 0, expensesCents: 0, netCents: 0, categories: [], activity: [], upcoming: [], invoices: listInvoices(userId), team: listTeam(userId), availableCents: 0, balanceCents: 0 };
    if (!ids.length) return empty;
    const placeholders = ids.map(() => '?').join(',');
    const rows = db.prepare(`SELECT t.*, a.nickname AS account_nickname FROM transactions t JOIN accounts a ON a.id = t.account_id
        WHERE t.account_id IN (${placeholders}) AND t.status = 'completed' AND t.created_at >= date('now', 'start of month', '-5 months')
        ORDER BY t.created_at DESC, t.id DESC`).all(...ids);
    const usdRows = rows.filter(row => usdIds.includes(row.account_id));
    const monthKey = value => String(value).slice(0, 7);
    const months = [];
    for (let offset = 5; offset >= 0; offset -= 1) {
        const date = new Date();
        date.setUTCDate(1);
        date.setUTCMonth(date.getUTCMonth() - offset);
        const key = date.toISOString().slice(0, 7);
        months.push({ key, label: new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' }).format(date), revenueCents: 0, expensesCents: 0 });
    }
    usdRows.filter(row => row.type !== 'transfer').forEach(row => {
        const month = months.find(item => item.key === monthKey(row.created_at));
        if (!month) return;
        if (row.direction === 'credit') month.revenueCents += row.amount;
        else month.expensesCents += row.amount;
    });
    const current = months[months.length - 1];
    const categoryTotals = new Map();
    usdRows.filter(row => row.direction === 'debit' && row.type !== 'transfer' && monthKey(row.created_at) >= months[3].key).forEach(row => {
        const key = categorize(row);
        categoryTotals.set(key, (categoryTotals.get(key) || 0) + row.amount);
    });
    const scheduled = db.prepare(`SELECT s.id, s.amount, s.description, s.scheduled_for, a.currency FROM scheduled_transfers s JOIN accounts a ON a.id = s.from_account_id
        WHERE s.user_id = ? AND s.status = 'pending' AND s.from_account_id IN (${placeholders}) ORDER BY s.scheduled_for LIMIT 5`).all(userId, ...ids);
    const invoices = listInvoices(userId);
    const upcoming = [
        ...scheduled.map(item => ({ kind: 'payment', label: item.description || 'Scheduled transfer', date: item.scheduled_for.slice(0, 10), amountCents: item.amount, currency: item.currency, direction: 'out' })),
        ...invoices.filter(item => ['open', 'overdue'].includes(item.displayStatus)).map(item => ({ kind: 'invoice', label: `${item.number} · ${item.customer_name}`, date: item.due_on, amountCents: item.amount, currency: item.currency, direction: 'in', overdue: item.displayStatus === 'overdue' })),
    ].sort((a, b) => a.date.localeCompare(b.date));
    return {
        ...empty,
        months,
        revenueCents: current.revenueCents,
        expensesCents: current.expensesCents,
        netCents: current.revenueCents - current.expensesCents,
        categories: [...categoryTotals.entries()].sort((a, b) => b[1] - a[1]).map(([key, cents]) => ({ ...categoryMeta(key), cents })),
        activity: rows.slice(0, 10).map(row => ({ ...row, categoryKey: categorize(row), categoryLabel: categoryMeta(categorize(row)).label, categoryIcon: categoryMeta(categorize(row)).icon, amountFormatted: formatCurrency(row.amount, row.currency) })),
        upcoming,
        invoices,
        availableCents: accounts.filter(account => account.currency === 'USD' && account.status === 'active').reduce((sum, account) => sum + account.available_balance, 0),
        balanceCents: accounts.filter(account => account.currency === 'USD' && account.status === 'active').reduce((sum, account) => sum + account.balance, 0),
    };
}

module.exports = { ROLES, businessAccounts, getProfile, saveProfile, listInvoices, createInvoice, markInvoicePaid, voidInvoice, listTeam, inviteMember, removeMember, getDashboard };
