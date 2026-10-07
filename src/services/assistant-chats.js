/**
 * Persistent, user-scoped Ask Willow conversations.
 */
'use strict';

const { getDb } = require('../database');
const { ValidationError } = require('../errors');

const MAX_CONVERSATIONS = 50;
const MAX_MESSAGES = 200;
const MAX_TITLE = 80;
const MAX_CONTENT = 12000;

function cleanText(value, max) {
    if (typeof value !== 'string') throw new ValidationError('Chat content must be text.');
    const text = value.trim();
    if (!text || text.length > max) throw new ValidationError('Chat content is empty or too long.');
    return text;
}

function titleFromQuestion(question) {
    const text = cleanText(question, 1000).replace(/\s+/g, ' ');
    return text.length <= MAX_TITLE ? text : `${text.slice(0, MAX_TITLE - 1)}…`;
}

function ensureConversation(userId, conversationId, firstQuestion = '') {
    const db = getDb();
    if (conversationId !== undefined && conversationId !== null && conversationId !== '') {
        const id = Number(conversationId);
        if (!Number.isSafeInteger(id) || id <= 0) throw new ValidationError('Invalid chat.');
        const existing = db.prepare('SELECT * FROM assistant_conversations WHERE id = ? AND user_id = ?').get(id, userId);
        if (!existing) throw Object.assign(new Error('Chat not found.'), { status: 404 });
        return existing;
    }
    if (db.prepare('SELECT COUNT(*) AS count FROM assistant_conversations WHERE user_id = ?').get(userId).count >= MAX_CONVERSATIONS) {
        db.prepare(`DELETE FROM assistant_conversations WHERE user_id = ? AND id IN (SELECT id FROM assistant_conversations WHERE user_id = ? ORDER BY updated_at ASC, id ASC LIMIT 1)`).run(userId, userId);
    }
    const title = firstQuestion ? titleFromQuestion(firstQuestion) : 'New chat';
    const id = db.prepare('INSERT INTO assistant_conversations (user_id, title) VALUES (?, ?)').run(userId, title).lastInsertRowid;
    return db.prepare('SELECT * FROM assistant_conversations WHERE id = ?').get(id);
}

function listConversations(userId) {
    return getDb().prepare(`SELECT c.id, c.title, c.created_at, c.updated_at,
        (SELECT COUNT(*) FROM assistant_messages m WHERE m.conversation_id = c.id) AS message_count,
        (SELECT content FROM assistant_messages m WHERE m.conversation_id = c.id AND m.role = 'user' ORDER BY m.id DESC LIMIT 1) AS last_question
        FROM assistant_conversations c WHERE c.user_id = ? ORDER BY c.updated_at DESC, c.id DESC LIMIT ?`).all(userId, MAX_CONVERSATIONS);
}

function getConversation(userId, conversationId) {
    const id = Number(conversationId);
    if (!Number.isSafeInteger(id) || id <= 0) throw new ValidationError('Invalid chat.');
    const conversation = getDb().prepare('SELECT id, title, created_at, updated_at FROM assistant_conversations WHERE id = ? AND user_id = ?').get(id, userId);
    if (!conversation) throw Object.assign(new Error('Chat not found.'), { status: 404 });
    const messages = getDb().prepare(`SELECT id, role, content, mode, created_at FROM assistant_messages WHERE conversation_id = ? ORDER BY id ASC LIMIT ?`).all(id, MAX_MESSAGES);
    return { ...conversation, messages };
}

function history(userId, conversationId, limit = 10) {
    const conversation = getConversation(userId, conversationId);
    return conversation.messages.slice(-Math.min(20, Math.max(1, Number(limit) || 10))).map(message => ({ role: message.role, content: message.content }));
}

function appendMessage(userId, conversationId, role, content, mode = null) {
    if (!['user', 'assistant'].includes(role)) throw new ValidationError('Invalid chat message.');
    const clean = cleanText(content, MAX_CONTENT);
    const conversation = getConversation(userId, conversationId);
    const db = getDb();
    const id = db.prepare('INSERT INTO assistant_messages (conversation_id, role, content, mode) VALUES (?, ?, ?, ?)').run(conversation.id, role, clean, mode).lastInsertRowid;
    const title = role === 'user' && conversation.title === 'New chat' ? titleFromQuestion(clean) : conversation.title;
    db.prepare("UPDATE assistant_conversations SET title = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?").run(title, conversation.id, userId);
    const count = db.prepare('SELECT COUNT(*) AS count FROM assistant_messages WHERE conversation_id = ?').get(conversation.id).count;
    if (count > MAX_MESSAGES) {
        db.prepare(`DELETE FROM assistant_messages WHERE conversation_id = ? AND id NOT IN (SELECT id FROM assistant_messages WHERE conversation_id = ? ORDER BY id DESC LIMIT ?)`).run(conversation.id, conversation.id, MAX_MESSAGES);
    }
    return { id, conversationId: conversation.id, title };
}

function deleteConversation(userId, conversationId) {
    const id = Number(conversationId);
    if (!Number.isSafeInteger(id) || id <= 0) throw new ValidationError('Invalid chat.');
    const result = getDb().prepare('DELETE FROM assistant_conversations WHERE id = ? AND user_id = ?').run(id, userId);
    if (!result.changes) throw Object.assign(new Error('Chat not found.'), { status: 404 });
    return true;
}

module.exports = { ensureConversation, listConversations, getConversation, history, appendMessage, deleteConversation, MAX_CONVERSATIONS, MAX_MESSAGES };
