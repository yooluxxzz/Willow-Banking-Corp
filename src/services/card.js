/**
 * Card service — fictional card management
 */
const { getDb } = require('../database');
const { formatCurrency } = require('../middleware/validation');

function getUserCards(userId) {
    const db = getDb();
    const cards = db.prepare(`
    SELECT c.*, a.account_number, a.account_type, a.nickname, a.status AS account_status
    FROM cards c
    JOIN accounts a ON c.account_id = a.id
    WHERE a.user_id = ?
    ORDER BY c.created_at ASC
  `).all(userId);

    return cards.map(formatCard);
}

function getCardById(cardId, userId) {
    const db = getDb();
    const card = db.prepare(`
    SELECT c.*, a.account_number, a.account_type, a.nickname, a.status AS account_status
    FROM cards c
    JOIN accounts a ON c.account_id = a.id
    WHERE c.id = ? AND a.user_id = ?
  `).get(cardId, userId);

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
    return { success: true };
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
        do { lastFour = String(require('crypto').randomInt(1000, 10000)); } while (lastFour === card.last_four);
        const exp = new Date(); exp.setFullYear(exp.getFullYear() + 3);
        const expStr = `${String(exp.getMonth() + 1).padStart(2, '0')}/${exp.getFullYear()}`;
        const created = db.prepare(`INSERT INTO cards (account_id, card_type, last_four, expiration_date, status, daily_limit)
            VALUES (?, ?, ?, ?, 'active', ?)`).run(card.account_id, card.card_type, lastFour, expStr, card.daily_limit);
        return { success: true, card: getCardById(created.lastInsertRowid, userId), message: 'Replacement demo card created. The previous card is cancelled. No physical card will be shipped.' };
    })();
}

function formatCard(card) {
    return {
        ...card,
        accountName: card.nickname || (card.account_type === 'savings' ? 'Savings account' : 'Checking account'),
        maskedNumber: `•••• •••• •••• ${card.last_four}`,
        dailyLimitFormatted: formatCurrency(card.daily_limit),
        statusLabel: card.status.charAt(0).toUpperCase() + card.status.slice(1),
    };
}

module.exports = { getUserCards, getCardById, updateCardStatus, requestReplacement };
