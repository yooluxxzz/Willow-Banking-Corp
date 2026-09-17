/**
 * Page rendering routes — serves EJS views
 */
const express = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { getUserAccounts, getTotalBalance } = require('../services/account');
const { getRecentTransactions } = require('../services/transaction');

const router = express.Router();

// Public pages
router.get('/', (req, res) => {
    if (req.session?.userId) {
        return res.redirect(req.session.userRole === 'admin' ? '/admin' : '/dashboard');
    }
    res.render('landing', { title: 'Willow Banking Corp.' });
});

router.get('/login', (req, res) => {
    if (req.session?.userId) {
        return res.redirect(req.session.userRole === 'admin' ? '/admin' : '/dashboard');
    }
    res.render('login', { title: 'Sign In — Willow Banking Corp.', error: req.query.error });
});

router.get('/register', (req, res) => {
    if (req.session?.userId) {
        return res.redirect('/dashboard');
    }
    res.render('register', { title: 'Create Account — Willow Banking Corp.' });
});

// Public info pages
router.get('/about', (req, res) => res.render('about', { title: 'About Us — Willow Banking Corp.' }));
router.get('/careers', (req, res) => res.render('careers', { title: 'Careers — Willow Banking Corp.' }));
router.get('/press', (req, res) => res.render('press', { title: 'Press — Willow Banking Corp.' }));
router.get('/contact', (req, res) => res.render('contact', { title: 'Contact — Willow Banking Corp.' }));
router.get('/privacy', (req, res) => res.render('privacy', { title: 'Privacy Policy — Willow Banking Corp.' }));
router.get('/terms', (req, res) => res.render('terms', { title: 'Terms of Service — Willow Banking Corp.' }));
router.get('/security-info', (req, res) => res.render('security-info', { title: 'Security — Willow Banking Corp.' }));
router.get('/compliance', (req, res) => res.render('compliance', { title: 'Compliance — Willow Banking Corp.' }));

// Protected customer pages
router.get('/dashboard', requireAuth, (req, res) => {
    const accounts = getUserAccounts(req.session.userId);
    const totals = getTotalBalance(req.session.userId);
    const accountIds = accounts.map(a => a.id);
    const recentTxns = getRecentTransactions(accountIds, 8);
    res.render('dashboard', { title: 'Dashboard — Willow Banking Corp.', accounts, totals, recentTxns });
});

router.get('/accounts', requireAuth, (req, res) => {
    res.render('accounts', { title: 'Accounts — Willow Banking Corp.' });
});

router.get('/transfers', requireAuth, (req, res) => {
    const accounts = getUserAccounts(req.session.userId);
    res.render('transfers', { title: 'Transfer Money — Willow Banking Corp.', accounts });
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
    res.render('transactions', { title: 'Transactions — Willow Banking Corp.', accounts });
});

router.get('/statements', requireAuth, (req, res) => {
    const accounts = getUserAccounts(req.session.userId);
    res.render('statements', { title: 'Statements — Willow Banking Corp.', accounts });
});

router.get('/cards', requireAuth, (req, res) => {
    res.render('cards', { title: 'Cards — Willow Banking Corp.' });
});

router.get('/notifications', requireAuth, (req, res) => {
    res.render('notifications', { title: 'Notifications — Willow Banking Corp.' });
});

router.get('/security', requireAuth, (req, res) => {
    res.render('security', { title: 'Security — Willow Banking Corp.' });
});

router.get('/settings', requireAuth, (req, res) => {
    res.render('settings', { title: 'Settings — Willow Banking Corp.' });
});

// Admin pages
router.get('/admin', requireAdmin, (req, res) => {
    res.render('admin/dashboard', { title: 'Admin Dashboard — Willow Banking Corp.' });
});

// All admin features are consolidated in the admin dashboard view

module.exports = router;
