/**
 * Willow assistant API. Answers are streamed as newline-delimited JSON:
 * {"delta":"…"} lines, then {"done":true} or {"error":"…"}.
 */
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const assistant = require('../services/assistant');
const router = express.Router();

router.use(requireAuth);
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

// A local model is slow and shared by everyone on this server: keep each person to a fair share.
const WINDOW_MS = 5 * 60 * 1000;
const MAX_QUESTIONS = 20;
const recent = new Map();
function allow(userId, now = Date.now()) {
    const times = (recent.get(userId) || []).filter(time => now - time < WINDOW_MS);
    if (times.length >= MAX_QUESTIONS) { recent.set(userId, times); return false; }
    times.push(now);
    recent.set(userId, times);
    return true;
}

router.get('/status', async (req, res) => {
    const status = await assistant.getStatus();
    res.json({ available: status.available, model: status.available ? status.model : null, reason: status.reason });
});

router.post('/chat', async (req, res) => {
    const userId = req.session.userId;
    const { question, history } = req.body || {};
    if (!allow(userId)) return res.status(429).json({ error: 'You’ve asked a lot of questions in a short time. Please wait a few minutes.' });
    const status = await assistant.getStatus();
    if (!status.available) return res.status(503).json({ error: 'The assistant is offline. Start Ollama on this computer to use it.', code: 'assistant_unavailable' });
    if (typeof question !== 'string' || !question.trim()) return res.status(400).json({ error: 'Ask a question about your money.' });

    const controller = new AbortController();
    res.on('close', () => { if (!res.writableEnded) controller.abort(); });
    res.status(200).set({ 'Content-Type': 'application/x-ndjson; charset=utf-8', 'X-Accel-Buffering': 'no' });
    res.flushHeaders();
    const send = payload => { if (!res.writableEnded) res.write(`${JSON.stringify(payload)}\n`); };
    try {
        await assistant.chat(userId, { question, history }, { onToken: delta => send({ delta }), signal: controller.signal });
        send({ done: true, model: status.model });
    } catch (error) {
        if (!controller.signal.aborted) send({ error: error.message, code: error.code || null });
    }
    res.end();
});

module.exports = router;
