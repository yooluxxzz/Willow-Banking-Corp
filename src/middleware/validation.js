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
    return password.length >= 8 && password.length <= 128;
}

function validateAmount(amount) {
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
        currency: currency,
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
    validateEmail,
    validatePassword,
    validateAmount,
    toCents,
    fromCents,
    formatCurrency,
    sanitizeString,
    validatePhone,
};
