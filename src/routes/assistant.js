/**
 * Willow assistant API.
 *
 * Ask Willow can answer questions, read verified customer data through bounded
 * tools, and execute approved demo actions through existing banking services.
 * State-changing actions respect the customer's persisted autonomy setting.
 */
const express = require('express');
const crypto = require('node:crypto');
const { requireAuth } = require('../middleware/auth');
const assistant = require('../services/assistant');
const assistantActions = require('../services/assistant-actions');
const quickAnswers = require('../services/quick-answers');
const preferences = require('../services/preferences');
const assistantChats = require('../services/assistant-chats');
const router = express.Router();

router.use(requireAuth);
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

const WINDOW_MS = 5 * 60 * 1000;
const MAX_QUESTIONS = 20;
const recent = new Map();
const pendingActions = new Map();
const ACTION_TTL_MS = 2 * 60 * 1000;

function allow(userId, now = Date.now()) {
    const times = (recent.get(userId) || []).filter(time => now - time < WINDOW_MS);
    if (times.length >= MAX_QUESTIONS) { recent.set(userId, times); return false; }
    times.push(now);
    recent.set(userId, times);
    return true;
}

function explicitWriteRequest(question) {
    return /\b(send|transfer|move|pay|make a payment|buy|sell|purchase|create|set up|add a goal|put money into investing|move money out of investing)\b/i.test(String(question || ''));
}

function rememberAction(userId, plan, conversationId) {
    const now = Date.now();
    for (const [key, pending] of pendingActions) {
        if (now - pending.createdAt > ACTION_TTL_MS) pendingActions.delete(key);
    }
    const key = crypto.randomBytes(24).toString('hex');
    pendingActions.set(key, { userId, tool: plan.tool, args: plan.args, conversationId, createdAt: Date.now() });
    return key;
}

function takeAction(userId, key) {
    const pending = pendingActions.get(key);
    pendingActions.delete(key);
    if (!pending || pending.userId !== userId || Date.now() - pending.createdAt > ACTION_TTL_MS) return null;
    return pending;
}

function explainTool(tool) {
    return {
        transfer: 'send or move money',
        pay_debt: 'pay a debt',
        move_investing_cash: 'move cash into or out of investing',
        trade: 'place a simulated investment order',
        create_goal: 'create a savings goal',
    }[tool] || 'change your Willow data';
}

router.get('/status', async (req, res) => {
    const status = req.query.refresh === '1' ? await assistant.refreshStatus() : await assistant.getStatus();
    const mode = status.available ? 'ai' : status.reason === 'disabled' ? 'off' : 'quick';
    res.json({ available: status.available, mode, model: status.available ? status.model : null, reason: status.reason, autonomy: preferences.getPreferences(req.session.userId).assistantAutonomy });
});

router.get('/conversations', (req, res) => {
    res.json({ conversations: assistantChats.listConversations(req.session.userId) });
});

router.get('/conversations/:id', (req, res) => {
    try {
        res.json({ conversation: assistantChats.getConversation(req.session.userId, req.params.id) });
    } catch (error) {
        res.status(error.status || 400).json({ error: error.message });
    }
});

router.delete('/conversations/:id', (req, res) => {
    try {
        assistantChats.deleteConversation(req.session.userId, req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(error.status || 400).json({ error: error.message });
    }
});

router.get('/autonomy', (req, res) => {
    const value = preferences.getPreferences(req.session.userId).assistantAutonomy;
    res.json({ autonomy: value, options: [
        { value: 'read_only', label: 'Read only', description: 'Willow can inspect your finances but never changes anything.' },
        { value: 'confirm', label: 'Ask before actions', description: 'Willow prepares actions and waits for you to approve them.' },
        { value: 'autonomous', label: 'Autonomous', description: 'Willow may execute explicit demo actions without another approval prompt.' },
    ] });
});

router.patch('/autonomy', (req, res) => {
    try {
        const value = preferences.updatePreferences(req.session.userId, { assistantAutonomy: req.body?.autonomy });
        res.json({ success: true, autonomy: value.assistantAutonomy });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.post('/actions/:token/confirm', async (req, res) => {
    if (preferences.getPreferences(req.session.userId).assistantAutonomy === 'read_only') return res.status(403).json({ error: 'Ask Willow is currently Read only, so no action was taken.', code: 'autonomy_read_only' });
    const pending = takeAction(req.session.userId, req.params.token);
    if (!pending) return res.status(410).json({ error: 'That action has expired. Ask Willow to prepare it again.', code: 'action_expired' });
    try {
        const result = await assistant.runActionTool(req.session.userId, pending.tool, pending.args);
        const summary = 'Completed: ' + assistantActions.actionPreview(req.session.userId, pending.tool, pending.args) + '.';
        if (pending.conversationId) assistantChats.appendMessage(req.session.userId, pending.conversationId, 'assistant', summary, 'action_executed');
        res.json({ success: true, tool: pending.tool, result, conversationId: pending.conversationId || null });
    } catch (error) {
        res.status(error.status || 400).json({ error: error.message });
    }
});

router.post('/actions/:token/cancel', (req, res) => {
    const pending = takeAction(req.session.userId, req.params.token);
    if (!pending) return res.status(410).json({ error: 'That action has already expired or been handled.', code: 'action_expired' });
    res.json({ success: true, cancelled: true });
});

router.post('/chat', async (req, res) => {
    const userId = req.session.userId;
    const { question, history: clientHistory, conversationId: requestedConversationId } = req.body || {};
    if (!allow(userId)) return res.status(429).json({ error: 'You’ve asked a lot of questions in a short time. Please wait a few minutes.' });
    const status = await assistant.getStatus();
    if (status.reason === 'disabled') return res.status(503).json({ error: 'Ask Willow is turned off on this server.', code: 'assistant_disabled' });
    if (typeof question !== 'string' || !question.trim()) return res.status(400).json({ error: 'Ask a question about your money.' });
    if (question.length > 1000) return res.status(400).json({ error: 'Keep questions under 1000 characters.' });

    let conversation;
    try {
        conversation = assistantChats.ensureConversation(userId, requestedConversationId, question);
        assistantChats.appendMessage(userId, conversation.id, 'user', question, 'user');
    } catch (error) {
        return res.status(error.status || 400).json({ error: error.message });
    }
    const history = assistantChats.history(userId, conversation.id, 10);

    const controller = new AbortController();
    res.on('close', () => { if (!res.writableEnded) controller.abort(); });
    res.status(200).set({ 'Content-Type': 'application/x-ndjson; charset=utf-8', 'X-Accel-Buffering': 'no' });
    res.flushHeaders();
    const send = payload => { if (!res.writableEnded) res.write(JSON.stringify(payload) + '\n'); };
    const links = assistant.relatedLinks(question);
    const quick = async notice => {
        const result = await quickAnswers.answer(userId, question);
        send({ delta: result.text });
        send({ done: true, mode: 'quick', notice, links });
    };

    try {
        const autonomy = preferences.getPreferences(userId).assistantAutonomy;
        const directRead = assistantActions.detectReadIntent(question);

        if (directRead && directRead !== 'stock_quote') {
            try {
                const result = await assistant.runReadTool(userId, directRead, {});
                if (status.available) {
                    const answerText = await assistant.chat(userId, { question, history }, {
                        onToken: delta => send({ delta }),
                        signal: controller.signal,
                        extraContext: JSON.stringify({ tool: directRead, result }),
                    });
                    assistantChats.appendMessage(userId, conversation.id, 'assistant', answerText, 'ai');
                    send({ done: true, mode: 'ai', model: status.model, tool: directRead, conversationId: conversation.id, links });
                } else {
                    const fallback = await quickAnswers.answer(userId, question);
                    assistantChats.appendMessage(userId, conversation.id, 'assistant', fallback.text, 'quick');
                    send({ delta: fallback.text });
                    send({ done: true, mode: 'quick', conversationId: conversation.id, links });
                }
                return res.end();
            } catch (error) {
                if (controller.signal.aborted) throw error;
            }
        }

        let planned = { mode: 'answer' };
        const mayNeedTool = explicitWriteRequest(question) || /\b(stock|share|ticker|quote|price|trading)\b/i.test(question);
        if (status.available && mayNeedTool) planned = await assistant.planAction(userId, question);

        if (planned.mode === 'read') {
            try {
                const result = await assistant.runReadTool(userId, planned.tool, planned.args);
                await assistant.chat(userId, { question, history }, {
                    onToken: delta => send({ delta }),
                    signal: controller.signal,
                    extraContext: JSON.stringify({ tool: planned.tool, result }),
                });
                send({ done: true, mode: 'ai', model: status.model, tool: planned.tool, links });
                return res.end();
            } catch (error) {
                if (controller.signal.aborted) throw error;
            }
        }

        if (planned.mode === 'action') {
            if (autonomy === 'read_only') {
                const blocked = 'I can prepare ' + explainTool(planned.tool) + ', but Read only mode prevents me from executing it. Change Ask Willow autonomy if you want Willow to act.';
                assistantChats.appendMessage(userId, conversation.id, 'assistant', blocked, 'action_blocked');
                send({ delta: blocked });
                send({ done: true, mode: 'action_blocked', action: { tool: planned.tool, autonomy }, links });
                return res.end();
            }
            if (autonomy === 'confirm') {
                const actionToken = rememberAction(userId, planned, conversation.id);
                const pendingText = 'I’m ready to ' + explainTool(planned.tool) + '.';
                assistantChats.appendMessage(userId, conversation.id, 'assistant', pendingText, 'action_pending');
                send({ delta: pendingText });
                send({ done: true, mode: 'action_pending', action: { token: actionToken, tool: planned.tool, title: assistantActions.actionPreview(userId, planned.tool, planned.args), expiresInSeconds: ACTION_TTL_MS / 1000 }, links });
                return res.end();
            }
            try {
                const result = await assistant.runActionTool(userId, planned.tool, planned.args);
                const resultText = status.available
                    ? await assistant.chat(userId, { question, history }, {
                        onToken: delta => send({ delta }),
                        signal: controller.signal,
                        extraContext: JSON.stringify({ action: planned.tool, executed: true, result }),
                    })
                    : 'Done. ' + assistantActions.actionPreview(userId, planned.tool, planned.args) + ' was completed in the Willow demo.';
                assistantChats.appendMessage(userId, conversation.id, 'assistant', resultText, 'action_executed');
                send({ done: true, mode: 'action_executed', action: { tool: planned.tool, autonomy }, conversationId: conversation.id, links });
                return res.end();
            } catch (error) {
                if (controller.signal.aborted) throw error;
                send({ error: error.message, code: error.code || 'action_failed' });
                return res.end();
            }
        }

        if (!status.available) {
            await quick(null);
        } else {
            let said = false;
            try {
                const answerText = await assistant.chat(userId, { question, history }, { onToken: delta => { said = true; send({ delta }); }, signal: controller.signal });
                assistantChats.appendMessage(userId, conversation.id, 'assistant', answerText, 'ai');
                send({ done: true, mode: 'ai', model: status.model, conversationId: conversation.id, links });
            } catch (error) {
                if (controller.signal.aborted) throw error;
                if (!said && error.status !== 400) await quick('The local AI model couldn’t answer (' + error.message.replace(/\.$/, '') + '), so this answer was worked out directly from your figures.');
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
