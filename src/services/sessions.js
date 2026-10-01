const { createHash } = require('crypto');
const { getDb } = require('../database');

// Public management identifiers must never expose the session cookie credential.
function sessionKey(sid) {
    return createHash('sha256').update(sid).digest('hex');
}

function sessionMetadata(req) {
    return { signedInAt: new Date().toISOString(), userAgent: (req.get('User-Agent') || '').slice(0, 300) };
}

function deviceLabel(agent = '') {
    const browser = /Edg\//.test(agent) ? 'Edge' : /Firefox\//.test(agent) ? 'Firefox' : /Chrome\//.test(agent) ? 'Chrome' : /Safari\//.test(agent) ? 'Safari' : 'Unknown browser';
    const device = /iPhone|iPad/.test(agent) ? 'iOS' : /Android/.test(agent) ? 'Android' : /Windows/.test(agent) ? 'Windows' : /Macintosh/.test(agent) ? 'macOS' : /Linux/.test(agent) ? 'Linux' : 'unknown device';
    return `${browser} on ${device}`;
}

function isRevoked(sid) {
    return !!getDb().prepare('SELECT session_hash FROM revoked_sessions WHERE session_hash = ?').get(sessionKey(sid));
}

async function ownedSessions(req, version) {
    const sessions = await new Promise((resolve, reject) => {
        if (!req.sessionStore?.all) return reject(new Error('Session listing unavailable'));
        req.sessionStore.all((err, rows) => err ? reject(err) : resolve(rows || []));
    });
    const entries = Array.isArray(sessions) ? sessions.map(row => [row.id, row]) : Object.entries(sessions);
    return entries.filter(([sid, row]) => sid && row.userId === req.session.userId && (row.authVersion || 0) === version && !isRevoked(sid))
        .map(([sid, row]) => ({ sid, id: sessionKey(sid), current: sid === req.sessionID, device: deviceLabel(row.device?.userAgent), signedInAt: row.device?.signedInAt || null }));
}

module.exports = { sessionKey, sessionMetadata, deviceLabel, isRevoked, ownedSessions };
