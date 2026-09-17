/**
 * Security middleware — headers, CSRF, XSS protection
 */

const crypto = require('crypto');

function securityHeaders(req, res, next) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (process.env.NODE_ENV === 'production') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
}

function generateCsrfToken(req) {
    if (!req.session.csrfToken) {
        req.session.csrfToken = crypto.randomBytes(32).toString('hex');
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

function injectCsrfToken(req, res, next) {
    res.locals.csrfToken = generateCsrfToken(req);
    next();
}

module.exports = { securityHeaders, csrfProtection, injectCsrfToken, generateCsrfToken };
