/**
 * Audit logging service
 */
const { getDb } = require('../database');

function logAudit({ actorId, actorEmail, action, targetType, targetId, metadata = {}, result = 'success' }) {
    const db = getDb();
    db.prepare(`
    INSERT INTO audit_logs (actor_id, actor_email, action, target_type, target_id, metadata, result)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(actorId, actorEmail, action, targetType || null, targetId || null, JSON.stringify(metadata), result);
}

function getAuditLogs({ page = 1, limit = 30, action, actorEmail, dateFrom, dateTo } = {}) {
    const db = getDb();
    const offset = (page - 1) * limit;
    const conditions = ['1=1'];
    const params = [];

    if (action) { conditions.push('action = ?'); params.push(action); }
    if (actorEmail) { conditions.push('actor_email LIKE ?'); params.push(`%${actorEmail}%`); }
    if (dateFrom) { conditions.push('created_at >= ?'); params.push(dateFrom); }
    if (dateTo) { conditions.push('created_at <= ?'); params.push(dateTo + ' 23:59:59'); }

    const where = conditions.join(' AND ');
    const total = db.prepare(`SELECT COUNT(*) as count FROM audit_logs WHERE ${where}`).get(...params).count;

    const rows = db.prepare(`
    SELECT * FROM audit_logs WHERE ${where}
    ORDER BY created_at DESC LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

    return {
        logs: rows.map(log => ({
            ...log,
            metadata: typeof log.metadata === 'string' ? JSON.parse(log.metadata) : log.metadata,
        })),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
    };
}

module.exports = { logAudit, getAuditLogs };
