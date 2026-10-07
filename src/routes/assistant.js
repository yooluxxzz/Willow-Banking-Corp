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

function rememberAction(userId, plan) {
    const key = crypto.randomBytes(24).toString('hex');
    pendingActions.set(key, { userId, tool: plan.tool, args: plan.args, createdAt: Date.now() });
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
    const pending = takeAction(req.session.userId, req.params.token);
    if (!pending) return res.status(410).json({ error: 'That action has expired. Ask Willow to prepare it again.', code: 'action_expired' });
    try {
        const result = await assistant.runActionTool(req.session.userId, pending.tool, pending.args);
        res.json({ success: true, tool: pending.tool, result });
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
                    await assistant.chat(userId, { question, history }, {
                        onToken: delta => send({ delta }),
                        signal: controller.signal,
                        extraContext: JSON.stringify({ tool: directRead, result }),
                    });
                    send({ done: true, mode: 'ai', model: status.model, tool: directRead, links });
                } else {
                    await quick(null);
                }
                return res.end();
            } catch (error) {
                if (controller.signal.aborted) throw error;
            }
        }

        let planned = { mode: 'answer' };
        if (status.available && explicitWriteRequest(question)) planned = await assistant.planAction(userId, question);

        if (planned.mode === 'action') {
            if (autonomy === 'read_only') {
                send({ delta: 'I can prepare ' + explainTool(planned.tool) + ', but Read only mode prevents me from executing it. Change Ask Willow autonomy if you want Willow to act.' });
                send({ done: true, mode: 'action_blocked', action: { tool: planned.tool, autonomy }, links });
                return res.end();
            }
            if (autonomy === 'confirm') {
                const actionToken = rememberAction(userId, planned);
                send({ delta: 'I’m ready to ' + explainTool(planned.tool) + '.' });
                send({ done: true, mode: 'action_pending', action: { token: actionToken, tool: planned.tool, title: assistantActions.actionPreview(userId, planned.tool, planned.args), expiresInSeconds: ACTION_TTL_MS / 1000 }, links });
                return res.end();
            }
            try {
                const result = await assistant.runActionTool(userId, planned.tool, planned.args);
                if (status.available) {
                    await assistant.chat(userId, { question, history }, {
                        onToken: delta => send({ delta }),
                        signal: controller.signal,
                        extraContext: JSON.stringify({ action: planned.tool, executed: true, result }),
                    });
                } else {
                    send({ delta: 'Done. ' + assistantActions.actionPreview(userId, planned.tool, planned.args) + ' was completed in the Willow demo.' });
                }
                send({ done: true, mode: 'action_executed', action: { tool: planned.tool, autonomy }, links });
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
                await assistant.chat(userId, { question, history }, { onToken: delta => { said = true; send({ delta }); }, signal: controller.signal });
                send({ done: true, mode: 'ai', model: status.model, links });
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
