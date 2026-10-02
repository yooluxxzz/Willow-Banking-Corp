/**
 * Template helpers shared by every view (attached to res.locals).
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('./config');

const assetVersions = new Map();

/** Returns a cache-busted URL for a file in /public. */
function asset(publicPath) {
    const filePath = path.join(config.paths.public, publicPath);
    let stat;
    try { stat = fs.statSync(filePath); } catch (error) { return publicPath; }
    const cached = assetVersions.get(filePath);
    if (cached && cached.mtimeMs === stat.mtimeMs) return `${publicPath}?v=${cached.hash}`;
    const hash = crypto.createHash('sha1').update(fs.readFileSync(filePath)).digest('hex').slice(0, 10);
    assetVersions.set(filePath, { mtimeMs: stat.mtimeMs, hash });
    return `${publicPath}?v=${hash}`;
}

const ICON_SPRITE = '/images/icons.svg';

/** Inline SVG icon referencing the shared sprite. Decorative unless a label is given. */
function icon(name, className = '', label = '') {
    const safeName = String(name).replace(/[^a-z0-9-]/gi, '');
    const classes = ['icon', className].filter(Boolean).join(' ');
    const a11y = label ? `role="img" aria-label="${escapeHtml(label)}"` : 'aria-hidden="true" focusable="false"';
    return `<svg class="${classes}" ${a11y}><use href="${asset(ICON_SPRITE)}#${safeName}"></use></svg>`;
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

const CURRENCY_DIGITS = { USD: 2, EUR: 2, GBP: 2, MZN: 2, ZAR: 2 };

/** Formats integer minor units (cents) as currency. */
function money(cents, currency = 'USD', options = {}) {
    const value = Number(cents || 0) / 100;
    const digits = options.whole ? 0 : (CURRENCY_DIGITS[currency] ?? 2);
    const formatted = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
        signDisplay: options.sign ? 'exceptZero' : 'auto',
    }).format(value);
    return formatted;
}

/** Formats a number with fixed decimals. */
function number(value, digits = 2) {
    return new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Number(value || 0));
}

function initials(name) {
    return String(name || '?').trim().split(/\s+/).slice(0, 2).map(part => part.charAt(0).toUpperCase()).join('') || '?';
}

function firstName(name) {
    return String(name || '').trim().split(/\s+/)[0] || 'there';
}

/** SQLite UTC timestamps ("YYYY-MM-DD HH:MM:SS") → Date. */
function toDate(value) {
    if (!value) return null;
    if (value instanceof Date) return value;
    const text = String(value);
    const iso = /Z$|[+-]\d\d:?\d\d$/.test(text) ? text : `${text.replace(' ', 'T')}Z`;
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value, style = 'medium') {
    const date = toDate(value);
    if (!date) return '';
    const options = style === 'short'
        ? { month: 'short', day: 'numeric', timeZone: 'UTC' }
        : style === 'long'
            ? { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }
            : { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' };
    return new Intl.DateTimeFormat('en-US', options).format(date);
}

function formatDateTime(value) {
    const date = toDate(value);
    if (!date) return '';
    return `${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(date)} · ${new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(date)} UTC`;
}

/** "Today", "Yesterday" or a short date (UTC calendar days). */
function relativeDay(value) {
    const date = toDate(value);
    if (!date) return '';
    const day = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    const now = new Date();
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const diff = Math.round((today - day) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    return formatDate(value, diff < 300 ? 'short' : 'medium');
}

function greeting(date = new Date()) {
    const hour = date.getUTCHours();
    if (hour < 5 || hour >= 22) return 'Good evening';
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
}

function pageTitle(title) {
    if (!title) return 'Willow — Your money. Moving forward.';
    return /Willow/.test(title) ? title : `${title} · Willow`;
}

let navigation = null;
function getNavigation() {
    if (!navigation) navigation = require('./content/navigation');
    return navigation;
}

function attachViewHelpers(req, res, next) {
    const nav = getNavigation();
    Object.assign(res.locals, {
        asset, icon, money, number, initials, firstName, formatDate, formatDateTime, relativeDay, greeting, pageTitle, escapeHtml, toDate,
        siteNavigation: nav.siteNavigation,
        appNavigation: nav.appNavigation,
        appSecondaryNavigation: nav.appSecondaryNavigation,
        appTabs: nav.appTabs,
        isCurrentNav: item => nav.isCurrent(item, req.path),
        idleMinutes: Math.round(require('./config').session.idleTimeoutMs / 60000),
    });
    next();
}

module.exports = { attachViewHelpers, asset, icon, money, number, initials, firstName, formatDate, formatDateTime, toDate, escapeHtml };
