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
    if (!sid) return false;
    try {
        return !!getDb().prepare('SELECT session_hash FROM revoked_sessions WHERE session_hash = ?').get(sessionKey(sid));
    } catch (error) {
        if (/Database not initialized|no such table|session_hash/i.test(error.message || String(error))) {
            return false;
        }
        throw error;
    }
}

function normalizeSessionEntries(sessions) {
    if (Array.isArray(sessions)) {
        return sessions
            .map((row) => {
                if (!row || typeof row !== 'object') return null;
                const sid = row.id || row.sid || row.sessionId || row.sessionID || null;
                return sid ? [sid, row] : null;
            })
            .filter(Boolean);
    }
    if (sessions && typeof sessions === 'object') {
        return Object.entries(sessions)
            .map(([sid, row]) => {
                if (!row || typeof row !== 'object') return null;
                return [sid, row.session && typeof row.session === 'object' ? row.session : row];
            })
            .filter(([sid, row]) => sid && row);
    }
    return [];
}

async function ownedSessions(req, version) {
    const sessions = await new Promise((resolve, reject) => {
        if (!req.sessionStore?.all) return reject(new Error('Session listing unavailable'));
        req.sessionStore.all((err, rows) => err ? reject(err) : resolve(rows || []));
    });
    const entries = normalizeSessionEntries(sessions);
    return entries.filter(([sid, row]) => {
        if (!sid || !row || typeof row !== 'object') return false;
        const rowUserId = row.userId ?? row.user_id ?? row.user?.id ?? null;
        const rowVersion = row.authVersion ?? row.auth_version ?? 0;
        return Number(rowUserId) === Number(req.session.userId) && Number(rowVersion) === Number(version) && !isRevoked(sid);
    }).map(([sid, row]) => {
        const device = row.device && typeof row.device === 'object' ? row.device : {};
        return {
            sid,
            id: sessionKey(sid),
            current: String(sid) === String(req.sessionID),
            device: deviceLabel(device.userAgent || row.userAgent || ''),
            signedInAt: device.signedInAt || row.signedInAt || null,
        };
    });
}

module.exports = { sessionKey, sessionMetadata, deviceLabel, isRevoked, ownedSessions };
