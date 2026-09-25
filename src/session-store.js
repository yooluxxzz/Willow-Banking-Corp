/**
 * Session store using sql.js (via the app database proxy)
 */
const session = require('express-session');
const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

class SQLiteSessionStore extends session.Store {
    constructor(options = {}) {
        super();
        this._options = options;
        this._db = null;
        this._dbPath = null;
        this._ready = this._init();
    }

    async _init() {
        const SQL = await initSqlJs();
        this._dbPath = this._options.dir
            ? path.join(this._options.dir, this._options.db || 'sessions.db')
            : ':memory:';

        const dir = path.dirname(this._dbPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        if (fs.existsSync(this._dbPath) && this._dbPath !== ':memory:') {
            const buffer = fs.readFileSync(this._dbPath);
            this._db = new SQL.Database(buffer);
        } else {
            this._db = new SQL.Database();
        }

        this._db.run(`
            CREATE TABLE IF NOT EXISTS sessions (
                sid TEXT PRIMARY KEY,
                sess TEXT NOT NULL,
                expired INTEGER NOT NULL
            )
        `);
        this._db.run('CREATE INDEX IF NOT EXISTS idx_sessions_expired ON sessions(expired)');

        // Cleanup expired every 15 min
        this._cleanupInterval = setInterval(() => this._cleanup(), 15 * 60 * 1000);
        this._cleanup();
    }

    _save() {
        if (!this._db || this._dbPath === ':memory:') return;
        try {
            const data = this._db.export();
            const buffer = Buffer.from(data);
            const tmpPath = this._dbPath + '.tmp';
            fs.writeFileSync(tmpPath, buffer);
            fs.renameSync(tmpPath, this._dbPath);
        } catch (e) {
            console.error('[SessionStore] Save error:', e.message);
        }
    }

    _query(sql, params = []) {
        const stmt = this._db.prepare(sql);
        if (params.length) stmt.bind(params);
        const results = [];
        while (stmt.step()) {
            const cols = stmt.getColumnNames();
            const vals = stmt.get();
            const row = {};
            cols.forEach((col, i) => { row[col] = vals[i]; });
            results.push(row);
        }
        stmt.free();
        return results;
    }

    get(sid, callback) {
        if (!this._db) return callback(null, null);
        try {
            const rows = this._query('SELECT sess FROM sessions WHERE sid = ? AND expired > ?', [sid, Date.now()]);
            if (rows.length > 0) {
                callback(null, JSON.parse(rows[0].sess));
            } else {
                callback(null, null);
            }
        } catch (err) { callback(err); }
    }

    set(sid, session, callback) {
        if (!this._db) return callback?.();
        try {
            const maxAge = session.cookie?.maxAge || 86400000;
            const expired = Date.now() + maxAge;
            this._db.run('DELETE FROM sessions WHERE sid = ?', [sid]);
            this._db.run('INSERT INTO sessions (sid, sess, expired) VALUES (?, ?, ?)', [sid, JSON.stringify(session), expired]);
            this._save();
            callback?.(null);
        } catch (err) { callback?.(err); }
    }

    destroy(sid, callback) {
        if (!this._db) return callback?.();
        try {
            this._db.run('DELETE FROM sessions WHERE sid = ?', [sid]);
            this._save();
            callback?.(null);
        } catch (err) { callback?.(err); }
    }

    touch(sid, session, callback) {
        if (!this._db) return callback?.();
        try {
            const maxAge = session.cookie?.maxAge || 86400000;
            const expired = Date.now() + maxAge;
            this._db.run('UPDATE sessions SET expired = ? WHERE sid = ?', [expired, sid]);
            this._save();
            callback?.(null);
        } catch (err) { callback?.(err); }
    }

    all(callback) {
        if (!this._db) return callback?.(null, []);
        try {
            const result = [];
            const stmt = this._db.prepare('SELECT sid, sess FROM sessions WHERE expired > ?');
            stmt.bind([Date.now()]);
            while (stmt.step()) {
                const row = stmt.getAsObject();
                try {
                    const sess = JSON.parse(row.sess);
                    sess.id = row.sid;
                    result.push(sess);
                } catch (e) { /* skip malformed sessions */ }
            }
            stmt.free();
            callback?.(null, result);
        } catch (err) { callback?.(err); }
    }

    _cleanup() {
        if (!this._db) return;
        try {
            this._db.run('DELETE FROM sessions WHERE expired <= ?', [Date.now()]);
            this._save();
        } catch (e) { }
    }

    close() {
        clearInterval(this._cleanupInterval);
        if (this._db) {
            this._save();
            this._db.close();
            this._db = null;
        }
    }
}

module.exports = SQLiteSessionStore;
