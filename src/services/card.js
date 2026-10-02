/**
 * Card service — fictional card management. Card numbers are never issued:
 * only a demo "last four" identifier exists.
 */
const { randomInt } = require('crypto');
const { getDb } = require('../database');
const { formatCurrency } = require('../middleware/validation');
const { logAudit } = require('./audit');

const CONTROLS = ['online_enabled', 'contactless_enabled', 'atm_enabled', 'international_enabled', 'notifications_enabled'];
const DESIGNS = ['forest', 'sage', 'copper', 'ivory', 'graphite'];
const MAX_CARDS = 12;

const CARD_SELECT = `SELECT c.*, a.account_number, a.account_type, a.nickname AS account_nickname, a.purpose, a.currency, a.status AS account_status, u.full_name AS owner_name
    FROM cards c
    JOIN accounts a ON c.account_id = a.id
    JOIN users u ON a.user_id = u.id`;

function getUserCards(userId) {
    const cards = getDb().prepare(`${CARD_SELECT} WHERE a.user_id = ? ORDER BY CASE c.status WHEN 'active' THEN 0 WHEN 'frozen' THEN 1 ELSE 2 END, c.created_at ASC, c.id ASC`).all(userId);
    return cards.map(formatCard);
}

function getCardById(cardId, userId) {
    const card = getDb().prepare(`${CARD_SELECT} WHERE c.id = ? AND a.user_id = ?`).get(cardId, userId);
    return card ? formatCard(card) : null;
}

function updateCardStatus(cardId, userId, newStatus) {
    const db = getDb();
    const card = getCardById(cardId, userId);
    if (!card) return { error: 'Card not found.' };

    const validTransitions = {
        active: ['frozen', 'reported'],
        frozen: ['active', 'reported'],
        reported: ['cancelled'],
        cancelled: [],
    };

    if (!validTransitions[card.status]?.includes(newStatus)) {
        return { error: `Cannot change card status from ${card.status} to ${newStatus}.` };
    }

    if (newStatus === 'active' && card.account_status !== 'active') return { error: 'The linked account must be active before unfreezing this card.' };
    db.prepare('UPDATE cards SET status = ? WHERE id = ?').run(newStatus, cardId);
    return { success: true, card: getCardById(cardId, userId) };
}

function expiryString() {
    const exp = new Date();
    exp.setFullYear(exp.getFullYear() + 3);
    return `${String(exp.getMonth() + 1).padStart(2, '0')}/${exp.getFullYear()}`;
}

function requestReplacement(cardId, userId) {
    const db = getDb();
    const card = getCardById(cardId, userId);
    if (!card) return { error: 'Card not found.' };
    if (!['frozen', 'reported'].includes(card.status)) return { error: 'Only frozen or reported cards can be replaced. A cancelled card cannot be replaced again.' };
    if (card.account_status !== 'active') return { error: 'The linked account must be active before replacing this card.' };

    return db.transaction(() => {
        db.prepare("UPDATE cards SET status = 'cancelled' WHERE id = ?").run(cardId);
        // This is a demo identifier, never a usable card number.
        let lastFour;
        do { lastFour = String(randomInt(1000, 10000)); } while (lastFour === card.last_four);
        const created = db.prepare(`INSERT INTO cards (account_id, card_type, last_four, expiration_date, status, daily_limit, form, nickname, design, holder_name,
                online_enabled, contactless_enabled, atm_enabled, international_enabled, notifications_enabled)
            VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(card.account_id, card.card_type, lastFour, expiryString(), card.daily_limit,
            card.form, card.nickname, card.design, card.holder_name, card.online_enabled, card.contactless_enabled, card.atm_enabled, card.international_enabled, card.notifications_enabled);
        return { success: true, card: getCardById(created.lastInsertRowid, userId), message: 'Replacement demo card created. The previous card is cancelled. No physical card will be shipped.' };
    })();
}

/** Creates a new physical or virtual demo card on an owned, active account. */
function createCard(userId, { accountId, form, nickname = '', design, dailyLimit } = {}) {
    const db = getDb();
    const id = Number(accountId);
    if (!Number.isSafeInteger(id) || id <= 0) return { error: 'Choose an account for this card.' };
    if (!['physical', 'virtual'].includes(form)) return { error: 'Choose a physical or virtual card.' };
    if (typeof nickname !== 'string' || nickname.trim().length > 30 || /[<>\x00-\x1f\x7f]/.test(nickname)) return { error: 'Use a card name of up to 30 characters without markup.' };
    const chosenDesign = DESIGNS.includes(design) ? design : (form === 'virtual' ? 'ivory' : 'forest');
    const limit = dailyLimit === undefined ? 500000 : Number(dailyLimit);
    if (!Number.isSafeInteger(limit) || limit < 1000 || limit > 2000000) return { error: 'Choose a daily limit between 10 and 20,000.' };
    const account = db.prepare('SELECT a.id, a.status, u.full_name FROM accounts a JOIN users u ON u.id = a.user_id WHERE a.id = ? AND a.user_id = ?').get(id, userId);
    if (!account) return { error: 'Account not found.' };
    if (account.status !== 'active') return { error: 'Cards can only be added to active accounts.' };
    const count = db.prepare("SELECT COUNT(*) AS count FROM cards c JOIN accounts a ON a.id = c.account_id WHERE a.user_id = ? AND c.status IN ('active', 'frozen')").get(userId).count;
    if (count >= MAX_CARDS) return { error: `You can hold up to ${MAX_CARDS} active demo cards.` };
    const lastFour = String(randomInt(1000, 10000));
    const created = db.prepare(`INSERT INTO cards (account_id, card_type, last_four, expiration_date, status, daily_limit, form, nickname, design, holder_name)
        VALUES (?, 'debit', ?, ?, 'active', ?, ?, ?, ?, ?)`).run(id, lastFour, expiryString(), limit, form, nickname.trim(), chosenDesign, account.full_name);
    logAudit({ actorId: userId, action: 'card_created', targetType: 'card', targetId: String(created.lastInsertRowid), metadata: { form, simulated: true } });
    return { success: true, card: getCardById(created.lastInsertRowid, userId) };
}

/** Updates spending controls, limit, name or design. */
function updateCardSettings(cardId, userId, changes = {}) {
    const db = getDb();
    const card = getCardById(cardId, userId);
    if (!card) return { error: 'Card not found.' };
    if (['reported', 'cancelled'].includes(card.status)) return { error: 'Controls are unavailable for an inactive card.' };
    const updates = [];
    const values = [];
    for (const key of CONTROLS) {
        const camel = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
        const value = changes[camel] ?? changes[key];
        if (value === undefined) continue;
        if (typeof value !== 'boolean') return { error: 'Card controls must be on or off.' };
        updates.push(`${key} = ?`);
        values.push(value ? 1 : 0);
    }
    if (changes.dailyLimit !== undefined) {
        const limit = Number(changes.dailyLimit);
        if (!Number.isSafeInteger(limit) || limit < 1000 || limit > 2000000) return { error: 'Choose a daily limit between 10 and 20,000.' };
        updates.push('daily_limit = ?');
        values.push(limit);
    }
    if (changes.nickname !== undefined) {
        if (typeof changes.nickname !== 'string' || changes.nickname.trim().length > 30 || /[<>\x00-\x1f\x7f]/.test(changes.nickname)) return { error: 'Use a card name of up to 30 characters without markup.' };
        updates.push('nickname = ?');
        values.push(changes.nickname.trim());
    }
    if (changes.design !== undefined) {
        if (!DESIGNS.includes(changes.design)) return { error: 'Choose a supported card design.' };
        updates.push('design = ?');
        values.push(changes.design);
    }
    if (!updates.length) return { error: 'No card settings were changed.' };
    db.prepare(`UPDATE cards SET ${updates.join(', ')} WHERE id = ?`).run(...values, cardId);
    logAudit({ actorId: userId, action: 'card_settings_changed', targetType: 'card', targetId: String(cardId), metadata: { fields: updates.map(item => item.split(' ')[0]) } });
    return { success: true, card: getCardById(cardId, userId) };
}

function formatCard(card) {
    const accountName = card.account_nickname || (card.purpose === 'business' ? 'Business checking' : card.currency && card.currency !== 'USD' ? `${card.currency} account` : card.account_type === 'savings' ? 'Savings account' : 'Checking account');
    const form = card.form || 'physical';
    return {
        ...card,
        form,
        nickname: card.nickname || '',
        accountName,
        displayName: card.nickname || (form === 'virtual' ? 'Virtual card' : card.purpose === 'business' ? 'Business card' : 'Willow debit card'),
        maskedNumber: `•••• •••• •••• ${card.last_four}`,
        dailyLimitFormatted: formatCurrency(card.daily_limit, card.currency || 'USD'),
        statusLabel: card.status.charAt(0).toUpperCase() + card.status.slice(1),
        holder: card.holder_name || card.owner_name || '',
        controls: {
            online: Boolean(card.online_enabled ?? 1),
            contactless: Boolean(card.contactless_enabled ?? 1),
            atm: Boolean(card.atm_enabled ?? 1),
            international: Boolean(card.international_enabled ?? 1),
            notifications: Boolean(card.notifications_enabled ?? 1),
        },
    };
}

module.exports = { getUserCards, getCardById, updateCardStatus, requestReplacement, createCard, updateCardSettings, DESIGNS };
