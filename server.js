/**
 * Willow Banking Corp — Main Server
 */
const express = require('express');
const session = require('express-session');
const path = require('path');
const config = require('./src/config');
const { initializeDatabase, closeDatabase } = require('./src/database');
const { initializeAdmin } = require('./src/services/auth');
const { loadUser } = require('./src/middleware/auth');
const { securityHeaders, csrfProtection, injectCsrfToken } = require('./src/middleware/security');
const { formatCurrency, fromCents } = require('./src/middleware/validation');

const app = express();

// Trust first proxy (for rate limiting behind reverse proxy)
app.set('trust proxy', 1);

// View engine
app.set('view engine', 'ejs');
app.set('views', config.paths.views);

// Static files
app.use(express.static(config.paths.public, { maxAge: config.isDev ? 0 : '1d' }));

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Security headers
app.use(securityHeaders);

// Sessions
const BetterSQLiteStore = require('./src/session-store');
app.use(session({
    store: new BetterSQLiteStore({
        db: 'sessions.db',
        dir: path.resolve(config.paths.root, 'data'),
    }),
    secret: config.session.secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: config.nodeEnv === 'production',
        httpOnly: true,
        maxAge: config.session.maxAge,
        sameSite: 'lax',
    },
    name: 'willow.sid',
}));

// CSRF + user loading
app.use(injectCsrfToken);
app.use(loadUser);

// Template helpers
app.use((req, res, next) => {
    res.locals.formatCurrency = formatCurrency;
    res.locals.fromCents = fromCents;
    res.locals.currentPath = req.path;
    next();
});

// CSRF protection for state-changing routes
app.use('/api', csrfProtection);
app.use('/auth', csrfProtection);

// Routes — API
app.use('/auth', require('./src/routes/auth'));
app.use('/api/accounts', require('./src/routes/accounts'));
app.use('/api/transactions', require('./src/routes/transactions'));
app.use('/api/transfers', require('./src/routes/transfers'));
app.use('/api/deposits', require('./src/routes/deposits'));
app.use('/api/withdrawals', require('./src/routes/withdrawals'));
app.use('/api/cards', require('./src/routes/cards'));
app.use('/api/notifications', require('./src/routes/notifications'));
app.use('/api/statements', require('./src/routes/statements'));
app.use('/api/admin', require('./src/routes/admin'));
app.use('/health', require('./src/routes/health'));

// Routes — Pages
app.use('/', require('./src/routes/pages'));

// 404 handler
app.use((req, res) => {
    if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(404).json({ error: 'Not found.' });
    }
    res.status(404).render('error', {
        title: 'Page Not Found',
        message: 'The page you are looking for does not exist.',
        user: res.locals.user,
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('[Server] Unhandled error:', err);
    if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(500).json({ error: 'An internal error occurred.' });
    }
    res.status(500).render('error', {
        title: 'Server Error',
        message: 'Something went wrong. Please try again later.',
        user: res.locals.user,
    });
});

// Startup
async function start() {
    try {
        console.log('[Server] Initializing database...');
        await initializeDatabase();

        console.log('[Server] Checking admin account...');
        await initializeAdmin();

        const server = app.listen(config.port, () => {
            console.log(`[Server] Willow Banking Corp. running at http://localhost:${config.port}`);
            console.log(`[Server] Environment: ${config.nodeEnv}`);
        });

        // Graceful shutdown
        const shutdown = (signal) => {
            console.log(`\n[Server] Received ${signal}. Shutting down gracefully...`);
            server.close(() => {
                closeDatabase();
                console.log('[Server] Shutdown complete.');
                process.exit(0);
            });
            setTimeout(() => {
                console.error('[Server] Forced shutdown after timeout.');
                process.exit(1);
            }, 10000);
        };

        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));

    } catch (err) {
        console.error('[Server] Failed to start:', err);
        process.exit(1);
    }
}

start();

module.exports = app; // for testing
