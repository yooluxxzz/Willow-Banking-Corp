/**
 * Auth service — registration, login, password hashing
 */
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database');
const config = require('../config');
const { validateEmail, validatePassword, sanitizeString } = require('../middleware/validation');

function generateCustomerId() {
    const prefix = 'WB';
    const num = Math.floor(10000000 + Math.random() * 90000000);
    return `${prefix}${num}`;
}

function generateAccountNumber() {
    const prefix = '4200';
    const num = Math.floor(10000000 + Math.random() * 90000000);
    const suffix = Math.floor(10 + Math.random() * 90);
    return `${prefix}${num}${suffix}`;
}

async function registerUser({ email, password, fullName, phone }) {
    const db = getDb();

    email = email?.trim().toLowerCase();
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

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
        return { error: 'An account with this email already exists.' };
    }

    const passwordHash = await bcrypt.hash(password, config.bcryptRounds);
    const customerId = generateCustomerId();
    const accountNumber = generateAccountNumber();

    const insertUser = db.prepare(`
    INSERT INTO users (email, full_name, phone, password_hash, role, status, customer_id)
    VALUES (?, ?, ?, ?, 'customer', 'active', ?)
  `);

    const insertAccount = db.prepare(`
    INSERT INTO accounts (user_id, account_number, account_type, balance, available_balance, currency, status)
    VALUES (?, ?, 'checking', 0, 0, 'USD', 'active')
  `);

    const insertNotification = db.prepare(`
    INSERT INTO notifications (user_id, type, title, message)
    VALUES (?, 'info', 'Welcome to Willow Banking', 'Your account has been created successfully. Start by making a deposit to fund your account.')
  `);

    const insertCard = db.prepare(`
    INSERT INTO cards (account_id, card_type, last_four, expiration_date, status, daily_limit)
    VALUES (?, 'debit', ?, ?, 'active', 500000)
  `);

    const transaction = db.transaction(() => {
        const result = insertUser.run(email, fullName, phone, passwordHash, customerId);
        const userId = result.lastInsertRowid;
        const accountResult = insertAccount.run(userId, accountNumber);
        const accountId = accountResult.lastInsertRowid;
        insertNotification.run(userId);

        // Generate a demo debit card
        const lastFour = accountNumber.slice(-4);
        const exp = new Date();
        exp.setFullYear(exp.getFullYear() + 3);
        const expStr = `${String(exp.getMonth() + 1).padStart(2, '0')}/${exp.getFullYear()}`;
        insertCard.run(accountId, lastFour, expStr);

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

async function loginUser({ email, password }) {
    const db = getDb();

    email = email?.trim().toLowerCase();
    if (!email || !password) {
        return { error: 'Email and password are required.' };
    }

    // Check lockout before any DB work
    if (checkLockout(email)) {
        return { error: 'Account temporarily locked due to too many failed attempts. Please try again in 15 minutes.' };
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
        recordFailedAttempt(email);
        return { error: 'Invalid email or password.' };
    }

    if (user.status === 'suspended') {
        const reason = user.status_reason ? ` Reason: ${user.status_reason}` : '';
        const scheduled = user.scheduled_deletion_at ? ` Your account is scheduled for permanent deletion on ${new Date(user.scheduled_deletion_at).toLocaleDateString()}.` : '';
        return { error: `This account has been suspended.${reason}${scheduled} Please contact support.` };
    }
    if (user.status === 'deleted' || user.status === 'closed') {
        const reason = user.status_reason ? ` Reason: ${user.status_reason}` : '';
        return { error: `This account no longer exists or has been closed.${reason}` };
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
        recordFailedAttempt(email);
        return { error: 'Invalid email or password.' };
    }

    // Successful login — clear lockout tracking
    clearAttempts(email);

    return {
        success: true,
        user: {
            id: user.id,
            email: user.email,
            fullName: user.full_name,
            role: user.role,
            customerId: user.customer_id,
        },
    };
}

async function initializeAdmin() {
    const db = getDb();
    const { email, password } = config.admin;

    if (!email || !password) {
        console.log('[Admin] No ADMIN_EMAIL/ADMIN_PASSWORD set — skipping admin initialization.');
        return;
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ? AND role = ?').get(email, 'admin');
    if (existing) {
        return;
    }

    // Check if email exists as a customer
    const existingCustomer = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existingCustomer) {
        console.log('[Admin] Email already exists as a customer account. Use a different ADMIN_EMAIL.');
        return;
    }

    const passwordHash = await bcrypt.hash(password, config.bcryptRounds);
    const customerId = 'WBADMIN001';

    db.prepare(`
    INSERT INTO users (email, full_name, phone, password_hash, role, status, customer_id)
    VALUES (?, 'System Administrator', '', ?, 'admin', 'active', ?)
  `).run(email, passwordHash, customerId);

    console.log(`[Admin] Admin account created: ${email}`);
}

module.exports = { registerUser, loginUser, initializeAdmin, generateAccountNumber };
