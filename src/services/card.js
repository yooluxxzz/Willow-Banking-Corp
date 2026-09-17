/**
 * Card service — fictional card management
 */
const { getDb } = require('../database');
const { formatCurrency } = require('../middleware/validation');

function getUserCards(userId) {
    const db = getDb();
    const cards = db.prepare(`
    SELECT c.*, a.account_number, a.account_type
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
    SELECT c.*, a.account_number, a.account_type
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

    db.prepare('UPDATE cards SET status = ? WHERE id = ?').run(newStatus, cardId);
    return { success: true };
}

function requestReplacement(cardId, userId) {
    const db = getDb();
    const card = getCardById(cardId, userId);
    if (!card) return { error: 'Card not found.' };
    if (card.status === 'active') return { error: 'Card is already active. Only frozen, reported, or cancelled cards can be replaced.' };

    // Cancel old card
    db.prepare('UPDATE cards SET status = ? WHERE id = ?').run('cancelled', cardId);

    // Create new card
    const lastFour = String(Math.floor(1000 + Math.random() * 9000));
    const exp = new Date();
    exp.setFullYear(exp.getFullYear() + 3);
    const expStr = `${String(exp.getMonth() + 1).padStart(2, '0')}/${exp.getFullYear()}`;

    db.prepare(`
    INSERT INTO cards (account_id, card_type, last_four, expiration_date, status, daily_limit)
    VALUES (?, ?, ?, ?, 'active', ?)
  `).run(card.account_id, card.card_type, lastFour, expStr, card.daily_limit);

    return { success: true, message: 'Replacement card has been requested. Your new card details will be updated shortly.' };
}

function formatCard(card) {
    return {
        ...card,
        maskedNumber: `•••• •••• •••• ${card.last_four}`,
        dailyLimitFormatted: formatCurrency(card.daily_limit),
        statusLabel: card.status.charAt(0).toUpperCase() + card.status.slice(1),
    };
}

module.exports = { getUserCards, getCardById, updateCardStatus, requestReplacement };
