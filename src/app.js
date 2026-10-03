/**
 * Express application factory shared by the server and the test-suite.
 */
const express = require('express');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const { loadUser } = require('./middleware/auth');
const { securityHeaders, csrfProtection, injectCsrfToken } = require('./middleware/security');
const { formatCurrency, fromCents } = require('./middleware/validation');
const { attachViewHelpers } = require('./view-helpers');
const { wantsJson } = require('./services/sign-in');

function createApp({ sessionStore, sessionSecret = config.session.secret, cookieName = 'willow.sid', secureCookies = config.nodeEnv === 'production' } = {}) {
    const app = express();
    app.set('trust proxy', config.trustProxy);
    app.set('view engine', 'ejs');
    app.set('views', config.paths.views);
    app.disable('x-powered-by');

    app.use(express.static(config.paths.public, {
        maxAge: config.isDev ? 0 : '7d',
        setHeaders(res, filePath) {
            if (/\.woff2$/.test(filePath)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        },
    }));
    app.use(express.json({ limit: '1mb' }));
    app.use(express.urlencoded({ extended: true, limit: '1mb' }));
    app.use(securityHeaders);

    app.use(session({
        store: sessionStore,
        secret: sessionSecret,
        resave: false,
        saveUninitialized: false,
        cookie: { secure: secureCookies, httpOnly: true, maxAge: config.session.maxAge, sameSite: 'lax' },
        name: cookieName,
    }));

    app.use(injectCsrfToken);
    app.use(loadUser);
    app.use((req, res, next) => {
        res.locals.formatCurrency = formatCurrency;
        res.locals.fromCents = fromCents;
        res.locals.currentPath = req.path;
        next();
    });
    app.use(attachViewHelpers);

    app.use('/api', csrfProtection);
    app.use('/auth', csrfProtection);
    app.use('/api', rateLimit({
        windowMs: 60 * 1000,
        max: config.rateLimit.apiMax,
        message: { error: 'Too many requests. Please slow down.' },
        standardHeaders: true,
        legacyHeaders: false,
    }));

    app.use('/auth', require('./routes/auth'));
    app.use('/api/public', require('./routes/public-api'));
    app.use('/api/accounts', require('./routes/accounts'));
    app.use('/api/transactions', require('./routes/transactions'));
    app.use('/api/transfers', require('./routes/transfers'));
    app.use('/api/payees', require('./routes/payees'));
    app.use('/api/deposits', require('./routes/deposits'));
    app.use('/api/withdrawals', require('./routes/withdrawals'));
    app.use('/api/cards', require('./routes/cards'));
    app.use('/api/notifications', require('./routes/notifications'));
    app.use('/api/statements', require('./routes/statements'));
    app.use('/api/wealth', require('./routes/wealth'));
    app.use('/api/hub', require('./routes/hub'));
    app.use('/api/goals', require('./routes/goals'));
    app.use('/api/scheduled-transfers', require('./routes/scheduled-transfers'));
    app.use('/api/crypto', require('./routes/crypto'));
    app.use('/api/fx', require('./routes/fx'));
    app.use('/api/preferences', require('./routes/preferences'));
    app.use('/api/security', require('./routes/security'));
    app.use('/api/business', require('./routes/business'));
    app.use('/api/budgets', require('./routes/budgets'));
    app.use('/api/assistant', require('./routes/assistant'));
    app.use('/api/networth', require('./routes/networth').worth);
    app.use('/api/debts', require('./routes/networth').debts);
    app.use('/api/loans', require('./routes/loans'));
    app.use('/api/support', require('./routes/support'));
    app.use('/api/admin', require('./routes/admin'));
    app.use('/health', require('./routes/health'));

    app.use('/', require('./routes/site'));
    app.use('/', require('./routes/pages'));

    app.use((req, res) => {
        if (wantsJson(req)) return res.status(404).json({ error: 'Not found.' });
        res.status(404).render('error', {
            title: 'Page not found',
            status: 404,
            heading: 'This page has moved on.',
            message: 'The page you are looking for doesn’t exist or is no longer available.',
        });
    });

    // eslint-disable-next-line no-unused-vars
    app.use((err, req, res, next) => {
        if (err && err.type === 'entity.parse.failed') {
            return res.status(400).json({ error: 'The request could not be read. Please try again.' });
        }
        console.error('[Server] Unhandled error:', err);
        if (wantsJson(req)) return res.status(500).json({ error: 'An internal error occurred.' });
        res.status(500).render('error', {
            title: 'Something went wrong',
            status: 500,
            heading: 'Something went wrong on our side.',
            message: 'Please try again in a moment. Your demo data has not been changed.',
        });
    });

    return app;
}

module.exports = { createApp };
