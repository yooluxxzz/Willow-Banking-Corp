/**
 * Signed-in Willow app pages.
 */
const express = require('express');
const crypto = require('crypto');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { getUserAccounts, getTotalBalance, getAccountById } = require('../services/account');
const { getRecentTransactions, getTransactions } = require('../services/transaction');
const { getDb } = require('../database');
const { ownedSessions, deviceLabel } = require('../services/sessions');
const { getUserCards } = require('../services/card');
const payees = require('../services/payees');
const hub = require('../services/hub');
const business = require('../services/business');
const preferences = require('../services/preferences');
const twoFactor = require('../services/two-factor');
const marketData = require('../services/market-data');
const demoPortfolio = require('../services/demo-portfolio');
const scheduledTransfers = require('../services/scheduled-transfers');
const { CURRENCIES } = require('../services/currencies');
const { remainingCodes } = require('../services/recovery');

const router = express.Router();
const noStore = (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); };
const customer = [requireAuth, noStore, (req, res, next) => {
    if (res.locals.user && res.locals.user.role === 'admin') return res.redirect('/admin');
    next();
}];

function validAccountParam(value, accounts) {
    if (value === undefined) return accounts[0]?.id;
    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null;
    const id = Number(value);
    return accounts.some(account => account.id === id) ? id : null;
}

router.get('/dashboard', customer, (req, res) => {
    const userId = req.session.userId;
    const accounts = getUserAccounts(userId);
    const active = accounts.filter(account => account.status === 'active');
    const summary = hub.getSummary(userId);
    const prefs = preferences.getPreferences(userId);
    const guest = getDb().prepare('SELECT is_guest FROM users WHERE id = ?').get(userId);
    res.render('app/dashboard', {
        title: 'Home',
        accounts,
        totals: getTotalBalance(userId),
        recentTxns: getRecentTransactions(active.map(account => account.id), 7),
        cards: getUserCards(userId).filter(card => ['active', 'frozen'].includes(card.status)).slice(0, 3),
        summary,
        insights: prefs.personalizedInsights ? hub.buildInsights(summary, null) : [],
        insightsEnabled: prefs.personalizedInsights,
        cashflow: hub.cashflowSeries(userId, 6),
        welcome: typeof req.query.welcome === 'string' ? req.query.welcome : '',
        isGuest: Boolean(guest && guest.is_guest),
    });
});

router.get('/hub', customer, (req, res) => {
    res.render('app/hub', { title: 'Net worth' });
});

router.get('/accounts', customer, (req, res) => {
    const userId = req.session.userId;
    res.render('app/accounts', { title: 'Accounts', accounts: getUserAccounts(userId), totals: getTotalBalance(userId) });
});

router.get('/accounts/new', customer, (req, res) => {
    const type = ['checking', 'savings', 'business', 'currency'].includes(req.query.type) ? req.query.type : 'checking';
    res.render('app/open-account', {
        title: 'Open an account',
        product: type,
        currency: ['EUR', 'GBP', 'MZN', 'ZAR'].includes(req.query.currency) ? req.query.currency : 'EUR',
        currencies: CURRENCIES,
        requestKey: crypto.randomUUID(),
        accountCount: getUserAccounts(req.session.userId).length,
    });
});

router.get('/accounts/:id', customer, (req, res) => {
    const account = /^[1-9]\d*$/.test(req.params.id) && Number.isSafeInteger(Number(req.params.id)) ? getAccountById(Number(req.params.id), req.session.userId) : null;
    if (!account) return res.status(404).render('error', { title: 'Account not found', status: 404, heading: 'We couldn’t find that account.', message: 'This account is unavailable or doesn’t belong to your profile.' });
    const recent = getTransactions(account.id, { limit: 8 });
    const db = getDb();
    const flows = db.prepare(`SELECT
            COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount ELSE 0 END), 0) AS moneyIn,
            COALESCE(SUM(CASE WHEN direction = 'debit' THEN amount ELSE 0 END), 0) AS moneyOut
        FROM transactions WHERE account_id = ? AND status = 'completed' AND created_at >= date('now', 'start of month')`).get(account.id);
    res.render('app/account-detail', {
        title: account.displayName,
        account,
        recent,
        flows,
        cards: getUserCards(req.session.userId).filter(card => card.account_id === account.id),
        scheduled: scheduledTransfers.listScheduledTransfers(req.session.userId).filter(item => item.status === 'pending' && (item.from_account_id === account.id || item.to_account_id === account.id)),
    });
});

router.get('/transactions', customer, (req, res) => {
    const accounts = getUserAccounts(req.session.userId);
    const selectedAccountId = validAccountParam(req.query.accountId, accounts);
    if (req.query.accountId !== undefined && !selectedAccountId) {
        return res.status(404).render('error', { title: 'Account not found', status: 404, heading: 'We couldn’t find that account.', message: 'This account is unavailable.' });
    }
    res.render('app/transactions', { title: 'Transactions', accounts, selectedAccountId });
});

router.get('/statements', customer, (req, res) => {
    const accounts = getUserAccounts(req.session.userId);
    const selectedAccountId = validAccountParam(req.query.accountId, accounts);
    if (req.query.accountId !== undefined && !selectedAccountId) return res.status(404).render('error', { title: 'Account not found', status: 404, heading: 'We couldn’t find that account.', message: 'This account is unavailable.' });
    res.render('app/statements', { title: 'Statements', accounts, selectedAccountId });
});

router.get('/deposits', customer, (req, res) => {
    const accounts = getUserAccounts(req.session.userId).filter(account => account.status === 'active');
    res.render('app/money-form', { title: 'Add money', mode: 'deposit', accounts, selectedAccountId: validAccountParam(req.query.accountId, accounts) });
});

router.get('/withdrawals', customer, (req, res) => {
    const accounts = getUserAccounts(req.session.userId).filter(account => account.status === 'active');
    res.render('app/money-form', { title: 'Withdraw', mode: 'withdrawal', accounts, selectedAccountId: validAccountParam(req.query.accountId, accounts) });
});

router.get('/cards', customer, (req, res) => {
    const notices = { frozen: 'Demo card frozen.', active: 'Demo card unfrozen.', reported: 'Demo card reported lost and made inactive.', replaced: 'Replacement demo card created. The previous card is cancelled. Nothing will be shipped.' };
    res.render('app/cards', {
        title: 'Cards',
        cards: getUserCards(req.session.userId),
        accounts: getUserAccounts(req.session.userId).filter(account => account.status === 'active'),
        notice: typeof req.query.notice === 'string' && Object.hasOwn(notices, req.query.notice) ? notices[req.query.notice] : '',
        selectedCardId: /^[1-9]\d*$/.test(String(req.query.card || '')) ? Number(req.query.card) : null,
    });
});

router.get('/transfers', customer, (req, res) => {
    const accounts = getUserAccounts(req.session.userId).filter(account => account.status === 'active');
    res.render('app/transfers', {
        title: 'Send & transfer',
        accounts,
        payees: payees.listPayees(req.session.userId),
        preselect: {
            payee: /^[1-9]\d*$/.test(String(req.query.payee || '')) ? Number(req.query.payee) : null,
            from: validAccountParam(req.query.from, accounts) || null,
            to: /^[1-9]\d*$/.test(String(req.query.to || '')) ? Number(req.query.to) : null,
            mode: req.query.mode === 'own' || req.query.to ? 'own' : 'someone',
        },
    });
});

router.get('/payees', customer, (req, res) => {
    res.render('app/payees', { title: 'Payees', payees: payees.listPayees(req.session.userId) });
});

router.get('/scheduled-transfers', customer, (req, res) => {
    const tomorrow = new Date();
    tomorrow.setUTCHours(0, 0, 0, 0);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    res.render('app/scheduled-transfers', {
        title: 'Scheduled transfers',
        accounts: getUserAccounts(req.session.userId).filter(account => account.status === 'active'),
        minScheduleDate: tomorrow.toISOString().slice(0, 10),
    });
});

router.get('/international', customer, (req, res) => {
    const accounts = getUserAccounts(req.session.userId).filter(account => account.status === 'active');
    res.render('app/international', { title: 'International', accounts, currencies: CURRENCIES, totals: getTotalBalance(req.session.userId) });
});

router.get('/wealth', customer, (req, res) => {
    res.render('app/wealth', { title: 'Portfolio' });
});

router.get('/wealth/markets', customer, (req, res) => {
    const type = ['stock', 'etf', 'fund', 'crypto', 'watchlist'].includes(req.query.type) ? req.query.type : 'all';
    res.render('app/markets', { title: 'Markets', filter: type, query: typeof req.query.q === 'string' ? req.query.q.slice(0, 40) : '' });
});

function renderAsset(view) {
    return (req, res, next) => {
        const instrument = marketData.getInstrument(req.params.symbol);
        if (!instrument || !instrument.tradable) return next();
        const isCrypto = instrument.type === 'crypto';
        if (view === 'crypto' && !isCrypto) return res.redirect(`/wealth/stocks/${encodeURIComponent(instrument.symbol)}`);
        if (view === 'asset' && isCrypto) return res.redirect(`/crypto/${encodeURIComponent(instrument.symbol)}`);
        const { provider, ...publicInstrument } = instrument;
        const holding = demoPortfolio.getPortfolio(req.session.userId).holdings.find(item => item.symbol === instrument.symbol) || null;
        res.render(view === 'crypto' ? 'app/crypto-detail' : 'app/asset', {
            title: `${instrument.name} (${instrument.symbol})`,
            instrument: publicInstrument,
            holding,
            watching: demoPortfolio.getWatchlist(req.session.userId).includes(instrument.symbol),
        });
    };
}
router.get('/wealth/stocks', customer, (req, res) => res.redirect('/wealth/markets?type=stock'));
router.get('/wealth/stocks/:symbol', customer, renderAsset('asset'));
router.get('/crypto/:symbol', customer, renderAsset('crypto'));
router.get('/crypto', customer, (req, res) => {
    res.render('app/crypto', { title: 'Crypto' });
});

router.get('/budgets', customer, (req, res) => {
    res.render('app/budgets', { title: 'Budgets', scope: 'personal' });
});
router.get('/debts', customer, (req, res) => {
    res.render('app/debts', { title: 'Debts', accounts: getUserAccounts(req.session.userId).filter(account => account.status === 'active' && account.currency === 'USD') });
});
router.get('/goals', customer, (req, res) => {
    res.render('app/goals', { title: 'Goals' });
});

router.get('/loans', (req, res, next) => (req.session && req.session.userId ? next() : res.redirect('/borrow/personal-loans')), customer, (req, res) => {
    res.render('app/loans', { title: 'Loans & calculators' });
});

router.get('/business/dashboard', customer, (req, res) => {
    res.render('app/business', { title: 'Business', section: 'overview', dashboard: business.getDashboard(req.session.userId) });
});
router.get('/business/invoices', customer, (req, res) => {
    res.render('app/business', { title: 'Invoices', section: 'invoices', dashboard: business.getDashboard(req.session.userId) });
});
router.get('/business/expense-log', customer, (req, res) => {
    res.render('app/business', { title: 'Expenses & budgets', section: 'expenses', dashboard: business.getDashboard(req.session.userId), expenseCategories: require('../services/budgets').BUSINESS_CATEGORIES });
});
router.get('/business/team', customer, (req, res) => {
    res.render('app/business', { title: 'Team', section: 'team', dashboard: business.getDashboard(req.session.userId), roles: business.ROLES });
});

router.get('/notifications', customer, (req, res) => {
    res.render('app/notifications', { title: 'Notifications' });
});

router.get('/security', customer, async (req, res) => {
    const db = getDb();
    const userId = req.session.userId;
    let loginHistory = [];
    try {
        loginHistory = db.prepare(`SELECT created_at, metadata FROM audit_logs WHERE actor_id = ? AND action = 'login' ORDER BY created_at DESC LIMIT 8`).all(userId);
    } catch (e) {
        console.error('[Security] Error fetching login history:', e);
    }
    let activeSessions = [];
    let sessionsUnavailable = false;
    try {
        activeSessions = (await ownedSessions(req, res.locals.user.auth_version)).map(({ sid, ...publicSession }) => publicSession);
        activeSessions.sort((a, b) => Number(b.current) - Number(a.current));
    } catch (err) { sessionsUnavailable = true; }
    loginHistory = loginHistory.map(log => {
        let metadata = {};
        try { metadata = JSON.parse(log.metadata) || {}; } catch (err) { /* legacy record */ }
        return { created_at: log.created_at, device: deviceLabel(metadata.userAgent) };
    });
    const events = db.prepare(`SELECT action, created_at FROM audit_logs WHERE actor_id = ? AND action IN ('password_changed','two_factor_enabled','two_factor_disabled','recovery_codes_generated','session_revoked','other_sessions_revoked','cards_frozen_all','data_exported','password_recovered')
        ORDER BY created_at DESC LIMIT 8`).all(userId);
    const cards = getUserCards(userId).filter(card => ['active', 'frozen'].includes(card.status));
    res.render('app/security', {
        title: 'Security center',
        loginHistory,
        activeSessions,
        sessionsUnavailable,
        events,
        cards,
        twoFactor: twoFactor.getStatus(userId),
        recoveryCount: remainingCodes(userId),
        prefs: preferences.getPreferences(userId),
    });
});

router.get('/settings', requireAuth, noStore, (req, res) => {
    const userId = req.session.userId;
    res.render('app/settings', {
        title: 'Settings',
        recoveryCount: remainingCodes(userId),
        prefs: preferences.getPreferences(userId),
        profile: getDb().prepare('SELECT country, is_guest, created_at FROM users WHERE id = ?').get(userId),
    });
});

router.get('/admin', requireAdmin, noStore, (req, res) => {
    res.render('admin/dashboard', { title: 'Admin overview' });
});

module.exports = router;
