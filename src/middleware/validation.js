/**
 * Input validation helpers
 */

function validateEmail(email) {
    if (!email || typeof email !== 'string') return false;
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email.trim()) && email.length <= 255;
}

function validatePassword(password) {
    if (!password || typeof password !== 'string') return false;
    if (password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) return false;
    // Require at least one uppercase, one lowercase, and one digit
    if (!/[A-Z]/.test(password)) return false;
    if (!/[a-z]/.test(password)) return false;
    if (!/[0-9]/.test(password)) return false;
    return true;
}

function validateAmount(amount) {
    if (!['string', 'number'].includes(typeof amount)) return false;
    if (!/^\d+(\.\d{1,2})?$/.test(String(amount).trim())) return false;
    const num = Number(amount);
    if (isNaN(num) || !isFinite(num)) return false;
    if (num <= 0) return false;
    // Max 1 billion dollars
    if (num > 1000000000) return false;
    // Max 2 decimal places
    const parts = String(amount).split('.');
    if (parts.length === 2 && parts[1].length > 2) return false;
    return true;
}

/**
 * Strict money input: a number or numeric string with at most two decimals
 * ("12", "12.5", 12.5). Returns integer cents, or null for anything else
 * (including true, arrays, "1e3", negative and out-of-range values).
 */
function parseCents(value, { allowZero = false, max = 100000000000 } = {}) {
    if (!['string', 'number'].includes(typeof value) || !/^\d+(\.\d{1,2})?$/.test(String(value).trim())) return null;
    const cents = Math.round(Number(value) * 100);
    if (!Number.isSafeInteger(cents) || cents > max || (!allowZero && cents === 0)) return null;
    return cents;
}

/** Optional free text: absent, or a string of at most `max` characters without markup or control characters. */
function isOptionalText(value, max) {
    return value === undefined || value === null || (typeof value === 'string' && value.trim().length <= max && !/[<>\x00-\x1f\x7f]/.test(value));
}

function validCalendarDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(value + 'T00:00:00.000Z');
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function pagination(query, defaultLimit = 20) {
    const positive = (value, max) => typeof value === 'string' && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) <= max;
    if ((query.page !== undefined && !positive(query.page, 100000)) || (query.limit !== undefined && !positive(query.limit, 100))) throw Object.assign(new Error('Use a positive page and a page size from 1 to 100.'), { status: 400 });
    return { page: Number(query.page || 1), limit: Number(query.limit || defaultLimit) };
}

function toCents(amount) {
    return Math.round(Number(amount) * 100);
}

function fromCents(cents) {
    return (cents / 100).toFixed(2);
}

function formatCurrency(cents, currency = 'USD') {
    const dollars = cents / 100;
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
    }).format(dollars);
}

function sanitizeString(str) {
    if (!str || typeof str !== 'string') return '';
    return str.trim().replace(/[<>]/g, '');
}

function validatePhone(phone) {
    if (!phone) return true; // optional
    if (typeof phone !== 'string') return false;
    const cleaned = phone.replace(/[\s\-().+]/g, '');
    return /^\d{7,15}$/.test(cleaned);
}

module.exports = {
    validCalendarDate,
    pagination,
    validateEmail,
    validatePassword,
    validateAmount,
    toCents,
    fromCents,
    formatCurrency,
    sanitizeString,
    validatePhone,
    parseCents,
    isOptionalText,
};
