const destinations = new Set([
    '/dashboard', '/hub', '/accounts', '/accounts/new', '/transactions', '/transfers', '/payees', '/scheduled-transfers',
    '/deposits', '/withdrawals', '/statements', '/cards', '/international', '/notifications', '/security', '/settings',
    '/wealth', '/wealth/markets', '/crypto', '/goals', '/loans', '/business/dashboard', '/business/invoices', '/business/team',
    '/help', '/admin',
]);
const patterns = [/^\/accounts\/[1-9]\d*$/, /^\/wealth\/stocks\/[A-Z0-9.^=-]{1,12}$/i, /^\/crypto\/[A-Z]{2,6}$/i];

function safeReturnTo(value, role) {
    if (typeof value !== 'string' || value.length > 2048 || !value.startsWith('/') || value.startsWith('//') || /[\\\s\x00-\x1f\x7f]/.test(value)) return '';
    const pathname = value.split(/[?#]/, 1)[0];
    if (!destinations.has(pathname) && !patterns.some(pattern => pattern.test(pathname))) return '';
    if (pathname === '/admin' && role && role !== 'admin') return '';
    return value;
}

function signInUrl(req, error) {
    const params = new URLSearchParams();
    if (error) params.set('error', error);
    const returnTo = req.method === 'GET' ? safeReturnTo(req.originalUrl) : '';
    if (returnTo) params.set('returnTo', returnTo);
    return '/login' + (params.size ? '?' + params.toString() : '');
}

function wantsJson(req) {
    return req.path.startsWith('/api/') || req.path.startsWith('/auth/') || req.originalUrl.startsWith('/api/') || req.originalUrl.startsWith('/auth/') || req.xhr || req.headers.accept?.includes('application/json');
}

module.exports = { safeReturnTo, signInUrl, wantsJson };
