/** Durable reservations prevent a retried financial request from running twice.
 * A reservation left pending by a crash is deliberately not retried automatically:
 * its ledger outcome must be reconciled before another attempt.
 */
const crypto = require('node:crypto');
const { getDb, flushDatabase } = require('../database');
const paths = /^(\/api\/(deposits|withdrawals|transfers|fx\/convert|wealth\/(cash|trades)|crypto\/send)|\/api\/debts\/\d+\/payments|\/api\/networth\/assets)(\/|$)/;
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;

function idempotency(req, res, next) {
    if (req.method !== 'POST' || !req.session?.userId || !paths.test(req.path)) return next();
    const key = req.get('Idempotency-Key') || req.body?.requestKey;
    if (key === undefined) return next(); // Compatibility for existing API clients.
    if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(key)) return res.status(400).json({ error: 'Use a valid idempotency key.', code: 'invalid_request_key' });
    const db = getDb();
    const scope = req.method + ' ' + req.path;
    const hash = crypto.createHash('sha256').update(JSON.stringify(canonical(req.body || {}))).digest('hex');
    const previous = db.prepare('SELECT * FROM idempotent_requests WHERE user_id = ? AND scope = ? AND request_key = ?').get(req.session.userId, scope, key);
    if (previous) {
        if (previous.request_hash !== hash) return res.status(409).json({ error: 'This request key was already used for different details.', code: 'request_key_conflict' });
        if (!previous.response_json) return res.status(409).json({ error: 'This request is pending or needs review. Check your activity before preparing another request.', code: 'request_pending' });
        res.set('Idempotency-Replayed', 'true');
        return res.status(previous.response_status).json(JSON.parse(previous.response_json));
    }
    db.prepare('INSERT INTO idempotent_requests (user_id, scope, request_key, request_hash) VALUES (?, ?, ?, ?)').run(req.session.userId, scope, key, hash);
    if (!flushDatabase()) return res.status(503).json({ error: 'Willow cannot save this request right now. No operation was started.', code: 'persistence_unavailable' });
    const json = res.json.bind(res);
    res.json = body => {
        db.prepare('UPDATE idempotent_requests SET response_status = ?, response_json = ? WHERE user_id = ? AND scope = ? AND request_key = ?')
            .run(res.statusCode, JSON.stringify(body), req.session.userId, scope, key);
        flushDatabase();
        return json(body);
    };
    next();
}

module.exports = { idempotency };
