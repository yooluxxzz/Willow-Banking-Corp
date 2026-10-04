/**
 * Willow assistant API. Answers are streamed as newline-delimited JSON:
 * {"delta":"…"} lines, then {"done":true, mode, links} or {"error":"…"}.
 *
 * mode "ai" is an answer from the local model (Ollama). When Ollama isn't
 * available, or fails before it says anything, the answer comes from
 * services/quick-answers instead (mode "quick"), so Ask Willow always answers.
 */
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const assistant = require('../services/assistant');
const quickAnswers = require('../services/quick-answers');
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
    // ?refresh=1 asks Ollama again now (the "Check again" button) instead of using the last answer.
    const status = req.query.refresh === '1' ? await assistant.refreshStatus() : await assistant.getStatus();
    const mode = status.available ? 'ai' : status.reason === 'disabled' ? 'off' : 'quick';
    res.json({ available: status.available, mode, model: status.available ? status.model : null, reason: status.reason });
});

router.post('/chat', async (req, res) => {
    const userId = req.session.userId;
    const { question, history } = req.body || {};
    if (!allow(userId)) return res.status(429).json({ error: 'You’ve asked a lot of questions in a short time. Please wait a few minutes.' });
    const status = await assistant.getStatus();
    if (status.reason === 'disabled') return res.status(503).json({ error: 'Ask Willow is turned off on this server.', code: 'assistant_disabled' });
    if (typeof question !== 'string' || !question.trim()) return res.status(400).json({ error: 'Ask a question about your money.' });
    if (question.length > 1000) return res.status(400).json({ error: 'Keep questions under 1000 characters.' });

    const controller = new AbortController();
    res.on('close', () => { if (!res.writableEnded) controller.abort(); });
    res.status(200).set({ 'Content-Type': 'application/x-ndjson; charset=utf-8', 'X-Accel-Buffering': 'no' });
    res.flushHeaders();
    const send = payload => { if (!res.writableEnded) res.write(`${JSON.stringify(payload)}\n`); };
    const links = assistant.relatedLinks(question);
    const quick = async notice => {
        const result = await quickAnswers.answer(userId, question);
        send({ delta: result.text });
        send({ done: true, mode: 'quick', notice, links });
    };
    try {
        if (!status.available) {
            await quick(null);
        } else {
            let said = false;
            try {
                await assistant.chat(userId, { question, history }, { onToken: delta => { said = true; send({ delta }); }, signal: controller.signal });
                send({ done: true, mode: 'ai', model: status.model, links });
            } catch (error) {
                if (controller.signal.aborted) throw error;
                // Nothing said yet: answer from the figures instead of showing an error.
                if (!said && error.status !== 400) await quick(`The local AI model couldn’t answer (${error.message.replace(/\.$/, '')}), so this answer was worked out directly from your figures.`);
                else send({ error: error.message, code: error.code || null });
            }
        }
    } catch (error) {
        if (!controller.signal.aborted) {
            console.error('[Assistant] Error:', error.message);
            send({ error: 'Ask Willow couldn’t answer right now. Please try again.' });
        }
    }
    res.end();
});

module.exports = router;
