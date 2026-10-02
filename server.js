/**
 * Willow — main server
 */
const path = require('path');
const config = require('./src/config');
const { initializeDatabase, closeDatabase } = require('./src/database');
const { initializeAdmin } = require('./src/services/auth');
const { createApp } = require('./src/app');
const SQLiteSessionStore = require('./src/session-store');

const app = createApp({
    sessionStore: new SQLiteSessionStore({ db: 'sessions.db', dir: path.resolve(config.paths.root, 'data') }),
});

// Startup
async function start() {
    try {
        console.log('[Server] Initializing database...');
        await initializeDatabase();

        console.log('[Server] Checking admin account...');
        await initializeAdmin();
        // Demo customers that anyone can send simulated payments to.
        await require('./src/services/demo-data').ensureCommunity();

        const { processDueScheduledTransfers } = require('./src/services/scheduled-transfers');
        const processScheduledTransfers = () => {
            try {
                const result = processDueScheduledTransfers();
                if (result.completed) console.log(`[Server] Completed ${result.completed} scheduled demo transfer(s).`);
            } catch (error) {
                console.error('[Server] Scheduled demo transfer check failed:', error.message);
            }
        };
        processScheduledTransfers();
        const scheduledTransferTimer = setInterval(processScheduledTransfers, 60 * 1000);

        // Background task: remove guest demo profiles nobody has used for a while
        const purgeGuests = () => {
            if (!config.session.guestRetentionDays) return;
            try {
                const { purged } = require('./src/services/demo-data').purgeStaleGuests({ days: config.session.guestRetentionDays });
                if (purged) console.log(`[Server] Removed ${purged} inactive guest profile(s).`);
            } catch (error) {
                console.error('[Server] Guest cleanup failed:', error.message);
            }
        };
        purgeGuests();
        setInterval(purgeGuests, 60 * 60 * 1000).unref();

        // Background task: process scheduled deletions every hour
        setInterval(() => {
            try {
                const { getDb } = require('./src/database');
                const { logAudit } = require('./src/services/audit');
                const db = getDb();
                const now = new Date().toISOString();
                const pendingUsers = db.prepare(
                    "SELECT id, email FROM users WHERE scheduled_deletion_at IS NOT NULL AND scheduled_deletion_at <= ? AND status != 'deleted'"
                ).all(now);

                for (const user of pendingUsers) {
                    db.prepare("UPDATE users SET status = 'deleted', updated_at = datetime('now') WHERE id = ?").run(user.id);
                    logAudit({
                        actorId: null,
                        actorEmail: 'system',
                        action: 'user_auto_deleted',
                        targetType: 'user',
                        targetId: String(user.id),
                        metadata: { reason: 'Scheduled deletion period expired' },
                    });
                    console.log(`[Server] Auto-deleted user ${user.email} (scheduled deletion expired).`);
                }
            } catch (e) {
                console.error('[Server] Scheduled deletion check error:', e.message);
            }
        }, 60 * 60 * 1000); // Every hour

        const server = app.listen(config.port, () => {
            console.log(`[Server] Willow Banking Corp. running at http://localhost:${config.port}`);
            console.log(`[Server] Environment: ${config.nodeEnv}`);

            const { exec } = require('child_process');
            const os = require('os');
            const url = `http://localhost:${config.port}`;
            const cmd = os.platform() === 'win32' ? `start "" "${url}"` : (os.platform() === 'darwin' ? `open ${url}` : `xdg-open ${url}`);
            if (process.env.OPEN_BROWSER === 'true') {
                exec(cmd).on('error', e => console.log('[Server] Failed to auto-open browser:', e.message));
            }
        });

        // Graceful shutdown
        const shutdown = (signal) => {
            console.log(`\n[Server] Received ${signal}. Shutting down gracefully...`);
            clearInterval(scheduledTransferTimer);
            server.close(() => {
                closeDatabase();
                console.log('[Server] Shutdown complete.');
                process.exit(0);
            });
            setTimeout(() => {
                console.error('[Server] Forced shutdown after timeout.');
                process.exit(1);
            }, 10000);
        };

        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));

    } catch (err) {
        console.error('[Server] Failed to start:', err);
        process.exit(1);
    }
}

start();

module.exports = app; // for testing
