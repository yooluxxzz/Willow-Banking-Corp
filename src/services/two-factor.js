/**
 * Two-step verification with time-based one-time passwords (RFC 6238, SHA-1,
 * 30-second steps, 6 digits) — compatible with common authenticator apps.
 * Secrets are encrypted at rest with AES-256-GCM using a key derived from the
 * server secret.
 */
const crypto = require('crypto');
const { getDb } = require('../database');
const config = require('../config');

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;
const DIGITS = 6;

function base32Encode(buffer) {
    let bits = 0;
    let value = 0;
    let output = '';
    for (const byte of buffer) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            output += BASE32[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    if (bits > 0) output += BASE32[(value << (5 - bits)) & 31];
    return output;
}

function base32Decode(text) {
    const clean = String(text).toUpperCase().replace(/[^A-Z2-7]/g, '');
    let bits = 0;
    let value = 0;
    const bytes = [];
    for (const char of clean) {
        value = (value << 5) | BASE32.indexOf(char);
        bits += 5;
        if (bits >= 8) {
            bytes.push((value >>> (bits - 8)) & 255);
            bits -= 8;
        }
    }
    return Buffer.from(bytes);
}

function hotp(secret, counter) {
    const buffer = Buffer.alloc(8);
    buffer.writeBigUInt64BE(BigInt(counter));
    const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(buffer).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const code = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
    return String(code % 10 ** DIGITS).padStart(DIGITS, '0');
}

function currentStep(now = Date.now()) {
    return Math.floor(now / 1000 / STEP_SECONDS);
}

function totp(secret, now = Date.now()) {
    return hotp(secret, currentStep(now));
}

function encryptionKey() {
    const source = process.env.TWO_FACTOR_KEY || config.session.secret;
    return crypto.createHash('sha256').update(`willow-2fa:${source}`).digest();
}

function encrypt(text) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), encrypted].map(part => part.toString('base64')).join('.');
}

function decrypt(payload) {
    const [iv, tag, data] = String(payload).split('.').map(part => Buffer.from(part, 'base64'));
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

function getStatus(userId) {
    const row = getDb().prepare('SELECT enabled_at, created_at FROM two_factor WHERE user_id = ?').get(userId);
    return { enabled: Boolean(row && row.enabled_at), enabledAt: row ? row.enabled_at : null, pending: Boolean(row && !row.enabled_at) };
}

function isEnabled(userId) {
    return getStatus(userId).enabled;
}

/** Starts (or restarts) setup and returns the secret for the authenticator app. */
function beginSetup(userId, email) {
    if (isEnabled(userId)) throw new Error('Two-step verification is already on.');
    const secret = base32Encode(crypto.randomBytes(20));
    getDb().prepare(`INSERT INTO two_factor (user_id, secret_encrypted, enabled_at, last_used_step) VALUES (?, ?, NULL, NULL)
        ON CONFLICT(user_id) DO UPDATE SET secret_encrypted = excluded.secret_encrypted, enabled_at = NULL, last_used_step = NULL, created_at = datetime('now')`).run(userId, encrypt(secret));
    const label = encodeURIComponent(`Willow Demo:${email}`);
    return {
        secret,
        secretGrouped: secret.match(/.{1,4}/g).join(' '),
        otpauthUrl: `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent('Willow Demo')}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`,
    };
}

/** Verifies a code within ±1 step and refuses reuse of the same step. */
function verify(userId, code, { allowPending = false } = {}) {
    if (typeof code !== 'string' || !/^\d{6}$/.test(code.replace(/\s/g, ''))) return false;
    const clean = code.replace(/\s/g, '');
    const db = getDb();
    const row = db.prepare('SELECT secret_encrypted, enabled_at, last_used_step FROM two_factor WHERE user_id = ?').get(userId);
    if (!row || (!row.enabled_at && !allowPending)) return false;
    let secret;
    try { secret = decrypt(row.secret_encrypted); } catch (error) { return false; }
    const step = currentStep();
    for (const offset of [0, -1, 1]) {
        const candidate = step + offset;
        if (row.last_used_step !== null && candidate <= row.last_used_step) continue;
        const expected = hotp(secret, candidate);
        if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(clean))) {
            db.prepare('UPDATE two_factor SET last_used_step = ? WHERE user_id = ?').run(candidate, userId);
            return true;
        }
    }
    return false;
}

function confirmSetup(userId, code) {
    const status = getStatus(userId);
    if (status.enabled) throw new Error('Two-step verification is already on.');
    if (!status.pending) throw new Error('Start setup again to get a new key.');
    if (!verify(userId, code, { allowPending: true })) return false;
    getDb().prepare("UPDATE two_factor SET enabled_at = datetime('now') WHERE user_id = ?").run(userId);
    return true;
}

function disable(userId) {
    getDb().prepare('DELETE FROM two_factor WHERE user_id = ?').run(userId);
}

module.exports = { getStatus, isEnabled, beginSetup, verify, confirmSetup, disable, totp, hotp, base32Encode, base32Decode };
