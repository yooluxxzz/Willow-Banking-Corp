/**
 * Auth service — registration, login, password hashing
 */
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { uniqueCustomerId, uniqueAccountNumber } = require('./ids');
const { getDb } = require('../database');
const config = require('../config');
const { validateEmail, validatePassword, sanitizeString } = require('../middleware/validation');

async function registerUser({ email, password, fullName, phone, country }) {
    const db = getDb();

    email = typeof email === 'string' ? email.trim().toLowerCase() : '';
    fullName = sanitizeString(fullName);
    phone = sanitizeString(phone || '');

    if (!validateEmail(email)) {
        return { error: 'Please enter a valid email address.' };
    }
    if (!fullName || fullName.length < 2 || fullName.length > 100) {
        return { error: 'Please enter your full name (2-100 characters).' };
    }
    if (!validatePassword(password)) {
        return { error: 'Password must be at least 8 characters with one uppercase letter, one lowercase letter, and one number.' };
    }
    if (country !== undefined && (typeof country !== 'string' || country.length > 56 || /[<>\x00-\x1f]/.test(country))) {
        return { error: 'Choose a valid country of residence.' };
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
        return { error: 'An account with this email already exists.' };
    }

    const passwordHash = await bcrypt.hash(password, config.bcryptRounds);
    const customerId = uniqueCustomerId(db);
    const accountNumber = uniqueAccountNumber(db);

    const insertUser = db.prepare(`
    INSERT INTO users (email, full_name, phone, password_hash, role, status, customer_id, country)
    VALUES (?, ?, ?, ?, 'customer', 'active', ?, ?)
  `);

    const insertAccount = db.prepare(`
    INSERT INTO accounts (user_id, account_number, account_type, balance, available_balance, currency, status)
    VALUES (?, ?, 'checking', 0, 0, 'USD', 'active')
  `);

    const transaction = db.transaction(() => {
        const result = insertUser.run(email, fullName, phone, passwordHash, customerId, typeof country === 'string' ? country.trim() : '');
        const userId = result.lastInsertRowid;
        // The account the customer asked to open. Balances start at zero; cards, savings and
        // everything else are created only when the customer asks for them.
        insertAccount.run(userId, accountNumber);
        return { userId, customerId, accountNumber };
    });

    const result = transaction();
    return { success: true, userId: result.userId, customerId: result.customerId };
}

// Simple in-memory login attempt tracking
const loginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function checkLockout(email) {
    const record = loginAttempts.get(email);
    if (!record) return false;
    if (Date.now() - record.firstAttempt > LOCKOUT_WINDOW_MS) {
        loginAttempts.delete(email);
        return false;
    }
    return record.count >= MAX_ATTEMPTS;
}

function recordFailedAttempt(email) {
    const record = loginAttempts.get(email);
    if (!record || Date.now() - record.firstAttempt > LOCKOUT_WINDOW_MS) {
        loginAttempts.set(email, { count: 1, firstAttempt: Date.now() });
    } else {
        record.count++;
    }
}

function clearAttempts(email) {
    loginAttempts.delete(email);
}

function remainingAttempts(key) {
    const record = loginAttempts.get(key);
    if (!record || Date.now() - record.firstAttempt > LOCKOUT_WINDOW_MS) return MAX_ATTEMPTS;
    return Math.max(0, MAX_ATTEMPTS - record.count);
}

const INVALID = 'That email, customer ID or password doesn’t match our records.';

/**
 * Signs in with an email address or Willow customer ID. Account status is only
 * revealed after the password has been verified.
 */
async function loginUser({ email, password }) {
    const db = getDb();
    const identifier = typeof email === 'string' ? email.trim() : '';
    if (!identifier || identifier.length > 255 || typeof password !== 'string' || !password || password.length > 128) {
        return { error: 'Enter your email or customer ID and your password.', code: 'missing' };
    }
    const byCustomerId = /^WB[A-Z0-9]{6,10}$/i.test(identifier) && !identifier.includes('@');
    const user = byCustomerId
        ? db.prepare('SELECT * FROM users WHERE customer_id = ?').get(identifier.toUpperCase())
        : db.prepare('SELECT * FROM users WHERE email = ?').get(identifier.toLowerCase());
    const key = user ? user.email.toLowerCase() : identifier.toLowerCase();

    if (checkLockout(key)) {
        return { error: 'Too many unsuccessful attempts. For your security, sign-in is paused for 15 minutes.', code: 'locked' };
    }
    if (!user) {
        recordFailedAttempt(key);
        return { error: INVALID, code: 'invalid_credentials', attemptsRemaining: remainingAttempts(key) };
    }
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
        recordFailedAttempt(key);
        const attemptsRemaining = remainingAttempts(key);
        if (attemptsRemaining === 0) return { error: 'Too many unsuccessful attempts. For your security, sign-in is paused for 15 minutes.', code: 'locked' };
        return { error: INVALID, code: 'invalid_credentials', attemptsRemaining };
    }
    if (user.status === 'suspended') {
        return { error: 'This profile is suspended. Contact Willow support if you think this is a mistake.', code: 'suspended' };
    }
    if (user.status === 'deleted' || user.status === 'closed') {
        return { error: 'This profile has been closed and can no longer sign in.', code: 'closed' };
    }

    clearAttempts(key);
    return {
        success: true,
        user: {
            id: user.id,
            email: user.email,
            fullName: user.full_name,
            role: user.role,
            customerId: user.customer_id,
            authVersion: user.auth_version,
        },
    };
}

const DEV_ADMIN_EMAIL = 'admin@willow.test';

/** A readable random password, e.g. Willow-7KQ4-M9TP-X2RD (no 0/O or 1/I to mistype). */
function readablePassword() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const group = () => Array.from(crypto.randomBytes(4), byte => alphabet[byte % alphabet.length]).join('');
    return `Willow-${group()}-${group()}-${group()}`;
}

/** A path relative to the current folder when it is inside it, otherwise absolute. */
function shownPath(file) {
    const relative = path.relative(process.cwd(), file);
    return relative && !relative.startsWith('..') && !path.isAbsolute(relative) ? relative : file;
}

function printAdminLogin(email, password, file) {
    const lines = [
        'Admin sign-in for this copy of Willow',
        `  Email:    ${email}`,
        `  Password: ${password}`,
        `  Sign in at http://localhost:${config.port}/login, then open /admin.`,
        `  Saved in ${shownPath(file)} (ignored by Git).`,
    ];
    const width = Math.max(...lines.map(line => line.length)) + 2;
    console.log(`[Admin] ┌${'─'.repeat(width)}┐`);
    lines.forEach(line => console.log(`[Admin] │ ${line.padEnd(width - 1)}│`));
    console.log(`[Admin] └${'─'.repeat(width)}┘`);
}

/**
 * Local development without ADMIN_EMAIL/ADMIN_PASSWORD: create admin@willow.test
 * once with a random password, save it next to the database (git-ignored) and
 * print it, so anyone can open the admin console after a plain `npm start`.
 */
async function ensureDevelopmentAdmin(db) {
    const email = config.admin.email || DEV_ADMIN_EMAIL;
    const file = path.join(config.paths.local, 'admin-credentials.txt');
    const existing = db.prepare('SELECT id, role FROM users WHERE email = ?').get(email);
    if (existing && existing.role !== 'admin') {
        console.log(`[Admin] ${email} is already a customer, so no admin login was created. Set ADMIN_EMAIL and ADMIN_PASSWORD in .env.`);
        return;
    }
    if (existing) {
        // The password was shown when it was created; after that it lives only in the file.
        console.log(fs.existsSync(file)
            ? `[Admin] Admin sign-in: ${email} — the password is in ${shownPath(file)}.`
            : `[Admin] Admin sign-in: ${email}. To set its password, add ADMIN_EMAIL and ADMIN_PASSWORD to .env and restart.`);
        return;
    }
    const password = readablePassword();
    const passwordHash = await bcrypt.hash(password, config.bcryptRounds);
    db.prepare(`INSERT INTO users (email, full_name, phone, password_hash, role, status, customer_id)
        VALUES (?, 'System Administrator', '', ?, 'admin', 'active', ?)`).run(email, passwordHash, uniqueCustomerId(db));
    try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, [
            'Willow admin sign-in (created automatically because ADMIN_EMAIL/ADMIN_PASSWORD are not set)',
            `Email:    ${email}`,
            `Password: ${password}`,
            `Sign in at http://localhost:${config.port}/login, then open /admin.`,
            'To choose your own, set ADMIN_EMAIL and ADMIN_PASSWORD in .env.',
            '',
        ].join('\n'), { mode: 0o600 });
    } catch (error) {
        console.log('[Admin] Could not save the admin login to a file; note the password below.');
    }
    printAdminLogin(email, password, file);
}

async function initializeAdmin() {
    const db = getDb();
    const { email, password } = config.admin;

    if (!email || !password) {
        if (config.isDev) return ensureDevelopmentAdmin(db);
        console.log('[Admin] No ADMIN_EMAIL/ADMIN_PASSWORD set — skipping admin initialization.');
        return;
    }
    if (typeof password !== 'string' || password.length > 128) {
        console.log('[Admin] ADMIN_PASSWORD must be at most 128 characters — skipping admin initialization.');
        return;
    }

    const existing = db.prepare('SELECT id, role, password_hash FROM users WHERE email = ?').get(email);
    if (existing && existing.role !== 'admin') {
        console.log('[Admin] Email already exists as a customer account. Use a different ADMIN_EMAIL.');
        return;
    }
    if (existing) {
        // ADMIN_PASSWORD always wins, so setting it in .env works even if the admin already exists.
        if (!(await bcrypt.compare(password, existing.password_hash))) {
            db.prepare("UPDATE users SET password_hash = ?, auth_version = auth_version + 1, updated_at = datetime('now') WHERE id = ?").run(await bcrypt.hash(password, config.bcryptRounds), existing.id);
            console.log(`[Admin] Updated the password for ${email} from ADMIN_PASSWORD.`);
        }
        return;
    }

    const passwordHash = await bcrypt.hash(password, config.bcryptRounds);
    db.prepare(`
    INSERT INTO users (email, full_name, phone, password_hash, role, status, customer_id)
    VALUES (?, 'System Administrator', '', ?, 'admin', 'active', ?)
  `).run(email, passwordHash, uniqueCustomerId(db));

    console.log(`[Admin] Admin account created: ${email}`);
}

module.exports = { registerUser, loginUser, initializeAdmin, clearAttempts };
