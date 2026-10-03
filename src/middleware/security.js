/**
 * Security middleware — headers, CSRF, XSS protection
 */

const crypto = require('crypto');

function securityHeaders(req, res, next) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    res.setHeader('Content-Security-Policy', [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "font-src 'self'",
        "img-src 'self' data: https://images.unsplash.com",
        "connect-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "object-src 'none'",
    ].join('; '));
    if (process.env.NODE_ENV === 'production') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
}

const ANONYMOUS_SESSION_MS = 2 * 60 * 60 * 1000;

function generateCsrfToken(req) {
    // Generate once per session; rotating on every render breaks multi-page/multi-tab usage
    if (!req.session.csrfToken) {
        req.session.csrfToken = crypto.randomBytes(32).toString('hex');
        // A visitor who hasn't signed in only needs the session for a sign-in or contact form.
        if (!req.session.userId) req.session.cookie.maxAge = ANONYMOUS_SESSION_MS;
    }
    return req.session.csrfToken;
}

function csrfProtection(req, res, next) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        return next();
    }

    const token = req.body?._csrf || req.headers['x-csrf-token'];
    if (!token || token !== req.session.csrfToken) {
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.status(403).json({ error: 'Invalid security token. Please refresh the page.' });
        }
        return res.status(403).render('error', {
            title: 'Security Error',
            message: 'Invalid security token. Please go back and try again.',
            user: res.locals.user,
        });
    }
    next();
}

/**
 * Makes `csrfToken` available to templates. It is created only when a page is
 * rendered, so JSON and public API responses never start a session or set a cookie.
 */
function injectCsrfToken(req, res, next) {
    Object.defineProperty(res.locals, 'csrfToken', { get: () => generateCsrfToken(req), enumerable: true, configurable: true });
    next();
}

module.exports = { securityHeaders, csrfProtection, injectCsrfToken, generateCsrfToken };
