/**
 * Public Willow website — marketing, product, explore, help and company pages.
 */
const express = require('express');
const config = require('../config');
const { products, groups } = require('../content/products');
const articles = require('../content/articles');
const { categories: helpCategories } = require('../content/help');
const { safeReturnTo } = require('../services/sign-in');

const router = express.Router();
const bySlug = new Map(products.map(product => [product.slug, product]));

router.get('/', (req, res) => {
    res.render('home', {
        title: 'Willow — Your money. Moving forward.',
        description: 'Banking, investing and building wealth — brought together in one intelligent financial experience. Willow is a fictional demo bank; no real money moves.',
    });
});

// ── Product pages ──────────────────────────────────────────────────────
products.forEach(product => {
    router.get(product.path, (req, res) => {
        res.render('product', {
            title: `${product.navLabel} — ${product.headline.replace(/\.$/, '')}`,
            description: product.metaDescription,
            product,
            group: groups.find(group => group.key === product.group),
            related: product.related.map(slug => bySlug.get(slug)).filter(Boolean),
        });
    });
});

const redirects = {
    '/personal': '/money/accounts',
    '/products/checking': '/money/accounts',
    '/products/savings': '/money/savings',
    '/products/debit-cards': '/money/cards',
    '/products/transfers': '/money/transfers',
    '/trust': '/security-info',
    '/security-center': '/security-info',
};
Object.entries(redirects).forEach(([from, to]) => router.get(from, (req, res) => res.redirect(301, to)));

// ── Explore ────────────────────────────────────────────────────────────
router.get('/markets', (req, res) => {
    res.render('markets', {
        title: 'Markets today',
        description: 'Major indices, popular stocks and crypto with delayed market data. Explore simulated investing in the Willow demo.',
    });
});

function articleList(kind) {
    return articles.filter(article => article.kind === kind);
}

/** Up to five distinct topic symbols from a collection, for the link to it. */
const topicIcons = kind => [...new Set(articleList(kind).map(article => article.icon).filter(Boolean))].slice(0, 5);

router.get('/insights', (req, res) => {
    res.render('articles', {
        title: 'Insights',
        description: 'Perspectives on money, markets, business and security from Willow — clear, calm and free of hype.',
        kind: 'insight',
        heading: 'Perspectives on money, without the noise.',
        intro: 'Short reads on saving, investing, business and security — written to help you think clearly, not to tell you what to buy.',
        list: articleList('insight'),
        other: { label: 'Education guides', href: '/learn', icon: 'graduation', count: articleList('guide').length, noun: 'guide', blurb: 'Plain-language explanations of the ideas behind everyday money.', topics: topicIcons('guide') },
    });
});

router.get('/learn', (req, res) => {
    res.render('articles', {
        title: 'Education',
        description: 'Plain-language guides to investing, crypto risk, loans, mortgages and building an emergency fund.',
        kind: 'guide',
        heading: 'Understand your money, one guide at a time.',
        intro: 'Plain-language explanations of the ideas behind everyday finance — from compound growth to how loan payments are calculated.',
        list: articleList('guide'),
        other: { label: 'Insights', href: '/insights', icon: 'lightbulb', count: articleList('insight').length, noun: 'article', blurb: 'Short perspectives on saving, investing, business and security.', topics: topicIcons('insight') },
    });
});

function renderArticle(kind) {
    return (req, res, next) => {
        const article = articles.find(item => item.slug === req.params.slug);
        if (!article) return next();
        // Articles live under one section; send the other spelling to the canonical URL.
        if (article.kind !== kind) return res.redirect(301, `${article.kind === 'guide' ? '/learn' : '/insights'}/${article.slug}`);
        res.render('article', {
            title: article.title,
            description: article.dek,
            article,
            related: article.related.map(slug => articles.find(item => item.slug === slug)).filter(Boolean),
            section: kind === 'guide' ? { label: 'Education', href: '/learn' } : { label: 'Insights', href: '/insights' },
        });
    };
}
router.get('/insights/:slug', renderArticle('insight'));
router.get('/learn/:slug', renderArticle('guide'));

// ── Help center ────────────────────────────────────────────────────────
router.get('/help', (req, res) => {
    res.set('Cache-Control', res.locals.user ? 'no-store' : 'public, max-age=300');
    res.render('help', {
        title: 'Help center',
        description: 'Answers about Willow accounts, cards, payments, investing, crypto, loans, security and business banking.',
        categories: helpCategories,
        category: null,
    });
});

router.get('/help/:category', (req, res, next) => {
    const category = helpCategories.find(item => item.slug === req.params.category);
    if (!category) return next();
    res.render('help', {
        title: `${category.title} · Help`,
        description: category.summary,
        categories: helpCategories,
        category,
    });
});

// ── Company, trust and legal ───────────────────────────────────────────
const infoPages = {
    '/about': ['about', 'About Willow', 'Why Willow exists, what it stands for and how the demo is built.'],
    '/careers': ['careers', 'Careers', 'Willow is a fictional company — here is how we would build the team behind it.'],
    '/press': ['press', 'Press', 'Brand assets, facts and contacts for writing about the Willow demo.'],
    '/contact': ['contact', 'Contact Willow', 'Ways to reach the Willow demo team and where to find answers.'],
    '/privacy': ['privacy', 'Privacy notice', 'What the Willow demo stores, why, and the controls you have.'],
    '/terms': ['terms', 'Terms of use', 'The terms for using the Willow demonstration platform.'],
    '/compliance': ['compliance', 'Compliance and disclosures', 'Willow is a fictional demo: regulatory status, deposit protection and simulated funds explained.'],
    '/security-info': ['security-info', 'Security at Willow', 'How Willow protects your access: hashed passwords, two-step verification, session controls and card freezing.'],
    '/demo': ['demo', 'About the Willow demo', 'What is real and what is simulated in the Willow demonstration platform.'],
};
Object.entries(infoPages).forEach(([path, [view, title, description]]) => {
    router.get(path, (req, res) => res.render(`info/${view}`, { title, description }));
});

// ── Authentication pages ───────────────────────────────────────────────
/** Maps sign-in page query flags to a single status message. */
function loginNotice(query) {
    const idleMinutes = Math.round(config.session.idleTimeoutMs / 60000);
    if (query.signedOut === 'success') return { tone: 'success', icon: 'check-circle', title: 'You’ve signed out.', text: 'On a shared device, close this browser window too.' };
    if (query.reset === 'success') return { tone: 'success', icon: 'check-circle', title: 'Password reset.', text: 'Sign in with your new password. Your other sessions were signed out.' };
    switch (query.error) {
        case 'session_timeout': return { tone: 'info', icon: 'clock', title: 'You were signed out to keep your account safe.', text: `There was no activity for ${idleMinutes} minutes. Sign in again to pick up where you left off.` };
        case 'session_expired': return { tone: 'warning', icon: 'alert', title: 'Your session ended.', text: 'Please sign in again to continue.' };
        case 'account_suspended': return { tone: 'error', icon: 'lock', title: 'We can’t sign you in right now.', text: 'This profile has been suspended. Contact the operator of this demo if you think this is a mistake.' };
        default: return null;
    }
}

router.get('/login', (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (req.session?.userId) {
        return res.redirect(safeReturnTo(req.query.returnTo, req.session.userRole) || (req.session.userRole === 'admin' ? '/admin' : '/dashboard'));
    }
    res.render('login', {
        title: 'Sign in',
        description: 'Sign in to Willow.',
        returnTo: safeReturnTo(req.query.returnTo),
        notice: loginNotice(req.query),
        noIndex: true,
    });
});

router.get('/register', (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (req.session?.userId) return res.redirect('/dashboard');
    res.render('register', {
        title: 'Open an account',
        description: 'Open a Willow demo account in a few minutes.',
        accountType: req.query.type === 'business' ? 'business' : 'personal',
        noIndex: true,
    });
});

router.get('/forgot-password', (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (req.session?.userId) return res.redirect('/dashboard');
    res.render('forgot-password', { title: 'Reset access', error: req.query.error, noIndex: true });
});

module.exports = router;
