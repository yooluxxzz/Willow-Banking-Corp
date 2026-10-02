/**
 * Page rendering routes — serves EJS views
 */
const express = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { getUserAccounts, getTotalBalance, getAccountById } = require('../services/account');
const { getRecentTransactions, getTransactions } = require('../services/transaction');
const { getDb } = require('../database');
const { ownedSessions, deviceLabel } = require('../services/sessions');
const { safeReturnTo } = require('../services/sign-in');
const { getUserCards } = require('../services/card');

const router = express.Router();

// Public pages
router.get('/', (req, res) => {
    if (req.session?.userId) {
        return res.redirect(req.session.userRole === 'admin' ? '/admin' : '/dashboard');
    }
    res.render('landing', {
        title: 'Your money. Moving forward. | Willow Banking Corp.',
        description: 'Everyday checking, savings, debit cards and transfers in a clear digital banking experience from Willow Banking Corp.',
    });
});

router.get('/login', (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (req.session?.userId) {
        return res.redirect(safeReturnTo(req.query.returnTo, req.session.userRole) || (req.session.userRole === 'admin' ? '/admin' : '/dashboard'));
    }
    res.render('login', { title: 'Sign In — Willow Banking Corp.', error: req.query.error, returnTo: safeReturnTo(req.query.returnTo) });
});

router.get('/register', (req, res) => {
    if (req.session?.userId) {
        return res.redirect('/dashboard');
    }
    res.render('register', { title: 'Create Account — Willow Banking Corp.' });
});

router.get('/forgot-password', (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (req.session?.userId) {
        return res.redirect('/dashboard');
    }
    res.render('forgot-password', {
        title: 'Reset access — Willow Banking Corp.',
        error: req.query.error,
    });
});

// Public info pages
router.get('/personal', (req, res) => res.render('banking-overview', { title: 'Personal banking — Willow Banking Corp.', business: false }));
router.get('/business', (req, res) => res.render('banking-overview', { title: 'Business banking — Willow Banking Corp.', business: true }));
router.get('/business/dashboard', requireAuth, (req, res) => {
    const db = getDb();
    const accounts = getUserAccounts(req.session.userId).filter(account => account.purpose === 'business');
    const ids = accounts.map(account => account.id);
    let activity = [], totals = { credits: 0, debits: 0 };
    if (ids.length) {
        const placeholders = ids.map(() => '?').join(',');
        activity = db.prepare(`SELECT t.description, t.type, t.direction, t.amount, t.created_at, t.status, a.nickname
            FROM transactions t JOIN accounts a ON a.id = t.account_id
            WHERE t.account_id IN (${placeholders}) ORDER BY t.created_at DESC, t.id DESC LIMIT 8`).all(...ids);
        totals = db.prepare(`SELECT COALESCE(SUM(CASE WHEN direction = 'credit' AND status = 'completed' THEN amount ELSE 0 END), 0) AS credits,
                COALESCE(SUM(CASE WHEN direction = 'debit' AND status = 'completed' THEN amount ELSE 0 END), 0) AS debits
            FROM transactions WHERE account_id IN (${placeholders}) AND created_at >= date('now', 'start of month')`).get(...ids);
    }
    res.set('Cache-Control', 'no-store');
    res.render('business-dashboard', { title: 'Business workspace — Willow Banking Corp.', accounts, activity, totals,
        available: accounts.reduce((sum, account) => sum + account.available_balance, 0),
        balance: accounts.reduce((sum, account) => sum + account.balance, 0) });
});
router.get('/help', (req, res) => res.render('help', { title: 'Help center — Willow Banking Corp.' }));
router.get('/loans', (req, res) => res.render('loans', { title: 'Loan estimates — Willow Banking Corp.' }));
router.get('/international', requireAuth, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.render('international', { title: 'International money — Willow Banking Corp.' });
});
router.get('/about', (req, res) => res.render('about', { title: 'About Us — Willow Banking Corp.' }));
router.get('/careers', (req, res) => res.render('careers', { title: 'Careers — Willow Banking Corp.' }));
router.get('/press', (req, res) => res.render('press', { title: 'Press — Willow Banking Corp.' }));
router.get('/contact', (req, res) => res.render('contact', { title: 'Contact — Willow Banking Corp.' }));
router.get('/privacy', (req, res) => res.render('privacy', { title: 'Privacy Policy — Willow Banking Corp.' }));
router.get('/terms', (req, res) => res.render('terms', { title: 'Terms of Service — Willow Banking Corp.' }));
router.get('/security-info', (req, res) => res.render('security-info', { title: 'Security — Willow Banking Corp.' }));
router.get('/compliance', (req, res) => res.render('compliance', { title: 'Compliance — Willow Banking Corp.' }));

// Product pages
router.get('/products/checking', (req, res) => res.render('product-checking', { title: 'Checking Account — Willow Banking Corp.' }));
router.get('/products/savings', (req, res) => res.render('product-savings', { title: 'Savings Account — Willow Banking Corp.' }));
router.get('/products/debit-cards', (req, res) => res.render('product-debit-cards', { title: 'Debit Cards — Willow Banking Corp.' }));
router.get('/products/transfers', (req, res) => res.render('product-transfers', { title: 'Transfers — Willow Banking Corp.' }));


// Protected customer pages
router.get('/dashboard', requireAuth, (req, res) => {
    const accounts = getUserAccounts(req.session.userId);
    const totals = getTotalBalance(req.session.userId);
    const accountIds = accounts.map(a => a.id);
    const recentTxns = getRecentTransactions(accountIds, 8);
    res.render('dashboard', { title: 'Dashboard — Willow Banking Corp.', accounts, totals, recentTxns });
});

router.get('/accounts', requireAuth, (req, res) => {
    res.render('accounts', { title: 'Accounts — Willow Banking Corp.', accounts: getUserAccounts(req.session.userId), totals: getTotalBalance(req.session.userId) });
});

router.get('/accounts/new', requireAuth, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.render('open-account', { title: 'Choose an account — Willow Banking Corp.', product: ['checking','savings','business'].includes(req.query.type) ? req.query.type : 'checking', requestKey: require('crypto').randomUUID(), accountCount: getUserAccounts(req.session.userId).length });
});

router.get('/accounts/:id', requireAuth, (req, res) => {
    const account = /^[1-9]\d*$/.test(req.params.id) && Number.isSafeInteger(Number(req.params.id)) ? getAccountById(Number(req.params.id), req.session.userId) : null;
    if (!account) return res.status(404).render('error', { title: 'Account not found', message: 'This account is unavailable.' });
    const recent = getTransactions(account.id, { limit: 5 });
    res.render('account-detail', { title: `${account.displayName} — Willow Banking Corp.`, account, recent });
});

router.get('/transfers', requireAuth, (req, res) => {
    const accounts = getUserAccounts(req.session.userId);
    res.render('transfers', { title: 'Transfer Money — Willow Banking Corp.', accounts });
});

router.get('/scheduled-transfers', requireAuth, (req, res) => {
    const tomorrow = new Date();
    tomorrow.setUTCHours(0, 0, 0, 0);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    res.set('Cache-Control', 'no-store');
    res.render('scheduled-transfers', {
        title: 'Scheduled transfers — Willow Banking Corp.',
        accounts: getUserAccounts(req.session.userId).filter(account => account.status === 'active' && account.currency === 'USD'),
        minScheduleDate: tomorrow.toISOString().slice(0, 10),
    });
});

router.get('/deposits', requireAuth, (req, res) => {
    const accounts = getUserAccounts(req.session.userId);
    res.render('deposits', { title: 'Deposit Funds — Willow Banking Corp.', accounts });
});

router.get('/withdrawals', requireAuth, (req, res) => {
    const accounts = getUserAccounts(req.session.userId);
    res.render('withdrawals', { title: 'Withdraw Funds — Willow Banking Corp.', accounts });
});

router.get('/transactions', requireAuth, (req, res) => {
    const accounts = getUserAccounts(req.session.userId);
    const selectedAccountId = req.query.accountId === undefined ? accounts[0]?.id : Number(req.query.accountId);
    if (req.query.accountId !== undefined && (typeof req.query.accountId !== 'string' || !/^[1-9]\d*$/.test(req.query.accountId) || !accounts.some(a => a.id === selectedAccountId))) {
        return res.status(404).render('error', { title: 'Account not found', message: 'This account is unavailable.' });
    }
    res.render('transactions', { title: 'Transactions — Willow Banking Corp.', accounts, selectedAccountId });
});

router.get('/statements', requireAuth, (req, res) => {
    const accounts = getUserAccounts(req.session.userId);
    const selectedAccountId = req.query.accountId === undefined ? accounts[0]?.id : Number(req.query.accountId);
    if (req.query.accountId !== undefined && (typeof req.query.accountId !== 'string' || !/^[1-9]\d*$/.test(req.query.accountId) || !accounts.some(a => a.id === selectedAccountId))) return res.status(404).render('error', { title: 'Account not found', message: 'This account is unavailable.' });
    res.render('statements', { title: 'Statements — Willow Banking Corp.', accounts, selectedAccountId });
});

router.get('/cards', requireAuth, (req, res) => {
    const notices = { frozen: 'Demo card frozen.', active: 'Demo card unfrozen.', reported: 'Demo card reported lost and made inactive.', replaced: 'Replacement demo card created. The previous card is cancelled. Nothing will be shipped.' };
    res.render('cards', { title: 'Cards — Willow Banking Corp.', cards: getUserCards(req.session.userId), notice: typeof req.query.notice === 'string' && Object.hasOwn(notices, req.query.notice) ? notices[req.query.notice] : '' });
});

router.get('/wealth', requireAuth, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.render('wealth', { title: 'Wealth — Willow Banking Corp.' });
});

router.get('/crypto', requireAuth, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.render('crypto', { title: 'Crypto wallet — Willow Banking Corp.' });
});

router.get('/hub', requireAuth, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.render('hub', { title: 'Financial picture — Willow Banking Corp.' });
});

router.get('/goals', requireAuth, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.render('goals', { title: 'Planning goals — Willow Banking Corp.' });
});

router.get('/notifications', requireAuth, (req, res) => {
    res.render('notifications', { title: 'Notifications — Willow Banking Corp.' });
});

router.get('/security', requireAuth, async (req, res) => {
    const db = getDb();

    let loginHistory = [];
    try {
        loginHistory = db.prepare(`
            SELECT created_at, metadata 
            FROM audit_logs 
            WHERE actor_id = ? AND action = 'login' 
            ORDER BY created_at DESC 
            LIMIT 5
        `).all(req.session.userId);
    } catch (e) {
        console.error('[Security] Error fetching login history:', e);
    }

    let activeSessions = [], sessionsUnavailable = false;
    try {
        activeSessions = (await ownedSessions(req, res.locals.user.auth_version)).map(({ sid, ...publicSession }) => publicSession);
        activeSessions.sort((a, b) => Number(b.current) - Number(a.current));
    } catch (err) { sessionsUnavailable = true; }
    loginHistory = loginHistory.map(log => {
        let metadata = {};
        try { metadata = JSON.parse(log.metadata) || {}; } catch (err) { /* legacy record */ }
        return { created_at: log.created_at, device: deviceLabel(metadata.userAgent) };
    });
    res.render('security', { title: 'Security — Willow Banking Corp.', loginHistory, activeSessions, sessionsUnavailable });
});

router.get('/settings', requireAuth, (req, res) => {
    const recoveryCount = getDb().prepare('SELECT COUNT(*) AS count FROM recovery_codes WHERE user_id = ?').get(req.session.userId).count;
    res.set('Cache-Control', 'no-store');
    res.render('settings', { title: 'Settings — Willow Banking Corp.', recoveryCount });
});

// Admin pages
router.get('/admin', requireAdmin, (req, res) => {
    res.render('admin/dashboard', { title: 'Admin Dashboard — Willow Banking Corp.' });
});

// All admin features are consolidated in the admin dashboard view

module.exports = router;
