const { randomUUID } = require('crypto');
const { getDb } = require('../database');
const { createNotification } = require('./notification');
const { logAudit } = require('./audit');

const { CRYPTO } = require('../content/instruments');
const { ValidationError } = require('../errors');

const SUPPORTED_ASSETS = new Set(CRYPTO);
const normalizeUnits = quantity => Math.round((quantity + Number.EPSILON) * 1e8) / 1e8;

function parseQuantity(value) {
    if (!['string', 'number'].includes(typeof value) || !/^\d+(\.\d{1,8})?$/.test(String(value).trim())) return null;
    const quantity = Number(value);
    return Number.isFinite(quantity) && quantity > 0 && quantity <= 1000000 ? normalizeUnits(quantity) : null;
}

function getCryptoWallet(userId) {
    const placeholders = CRYPTO.map(() => '?').join(',');
    const holdings = getDb().prepare(`SELECT symbol, quantity, average_price FROM demo_holdings
        WHERE user_id = ? AND symbol IN (${placeholders}) ORDER BY symbol`).all(userId, ...CRYPTO);
    return { simulated: true, holdings };
}

function getCryptoHistory(userId) {
    return getDb().prepare(`SELECT t.id, t.reference, t.symbol, t.quantity, t.created_at,
            CASE WHEN t.sender_user_id = ? THEN 'sent' ELSE 'received' END AS direction,
            CASE WHEN t.sender_user_id = ? THEN recipient.email ELSE sender.email END AS counterparty,
            CASE WHEN t.sender_user_id = ? THEN recipient.full_name ELSE sender.full_name END AS counterparty_name
        FROM demo_crypto_transfers t
        JOIN users sender ON sender.id = t.sender_user_id
        JOIN users recipient ON recipient.id = t.recipient_user_id
        WHERE t.sender_user_id = ? OR t.recipient_user_id = ?
        ORDER BY t.id DESC LIMIT 50`).all(userId, userId, userId, userId, userId);
}

function sendDemoCrypto(senderUserId, input = {}) {
    const symbol = typeof input.symbol === 'string' ? input.symbol.trim().toUpperCase() : '';
    const quantity = parseQuantity(input.quantity);
    const recipientEmail = typeof input.recipientEmail === 'string' ? input.recipientEmail.trim().toLowerCase() : '';
    if (!SUPPORTED_ASSETS.has(symbol)) throw new ValidationError('Choose a supported demo crypto asset.');
    if (quantity === null) throw new ValidationError('Enter a valid quantity with up to eight decimal places.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail) || recipientEmail.length > 255) throw new ValidationError('Enter a valid Willow demo customer email.');

    const db = getDb();
    const sender = db.prepare('SELECT id, email, status FROM users WHERE id = ?').get(senderUserId);
    const recipient = db.prepare('SELECT id, email, status FROM users WHERE email = ? COLLATE NOCASE').get(recipientEmail);
    if (!sender || sender.status !== 'active') throw new ValidationError('An active Willow demo profile is required.');
    if (!recipient || recipient.status !== 'active') throw new ValidationError('An active Willow demo recipient was not found.');
    if (recipient.id === sender.id) throw new ValidationError('Choose a different Willow demo customer.');

    const result = db.transaction(() => {
        const holding = db.prepare('SELECT quantity, average_price FROM demo_holdings WHERE user_id = ? AND symbol = ?').get(senderUserId, symbol);
        if (!holding || holding.quantity + 1e-12 < quantity) throw new ValidationError(`Not enough demo ${symbol} to send.`);
        const receiverHolding = db.prepare('SELECT quantity, average_price FROM demo_holdings WHERE user_id = ? AND symbol = ?').get(recipient.id, symbol);
        const remaining = normalizeUnits(holding.quantity - quantity);
        const receivedQuantity = normalizeUnits((receiverHolding?.quantity || 0) + quantity);
        const receivedAverage = (((receiverHolding?.quantity || 0) * (receiverHolding?.average_price || 0)) + (quantity * holding.average_price)) / receivedQuantity;
        if (remaining <= 1e-12) db.prepare('DELETE FROM demo_holdings WHERE user_id = ? AND symbol = ?').run(senderUserId, symbol);
        else db.prepare('UPDATE demo_holdings SET quantity = ?, updated_at = datetime(\'now\') WHERE user_id = ? AND symbol = ?').run(remaining, senderUserId, symbol);
        db.prepare(`INSERT INTO demo_holdings (user_id, symbol, quantity, average_price) VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id, symbol) DO UPDATE SET quantity = excluded.quantity, average_price = excluded.average_price, updated_at = datetime('now')`)
            .run(recipient.id, symbol, receivedQuantity, receivedAverage);
        const reference = `CRY-${randomUUID().slice(0, 8).toUpperCase()}`;
        db.prepare(`INSERT INTO demo_crypto_transfers (reference, sender_user_id, recipient_user_id, symbol, quantity)
            VALUES (?, ?, ?, ?, ?)`).run(reference, senderUserId, recipient.id, symbol, quantity);
        logAudit({ actorId: senderUserId, actorEmail: sender.email, action: 'demo_crypto_sent', targetType: 'demo_crypto_transfer', targetId: reference, metadata: { symbol, quantity, recipientUserId: recipient.id, simulated: true } });
        return { reference, symbol, quantity, recipientEmail: recipient.email };
    })();

    try { createNotification(recipient.id, 'info', 'Demo crypto received', `You received ${quantity} ${symbol} in your Willow demo wallet. No blockchain transfer occurred.`); }
    catch (error) { /* notification failure does not undo the simulated transfer */ }
    return { ...result, wallet: getCryptoWallet(senderUserId) };
}

module.exports = { getCryptoWallet, getCryptoHistory, sendDemoCrypto };