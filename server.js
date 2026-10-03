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

        // Start the Python market-data service (yfinance) if it isn't already running.
        // Runs in the background: pages work immediately and market data switches over when ready.
        const marketService = require('./src/services/market-service');
        marketService.start().catch(error => console.error('[Market service] Could not start:', error.message));
        // The local model for the assistant, if Ollama is running.
        require('./src/services/assistant').refreshStatus().then(status => {
            console.log(status.available ? `[Assistant] Using ${status.model} via Ollama.` : `[Assistant] Off (${status.reason === 'unreachable' ? 'Ollama is not running' : status.reason}).`);
        });

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

        // Daily budget checks and net-worth snapshots: catch up on days missed while the
        // app was stopped, then run every night at the configured time.
        const budgets = require('./src/services/budgets');
        const networth = require('./src/services/networth');
        const nightly = async mode => {
            try {
                const result = budgets.runBudgetChecks({ mode });
                const snapshots = await networth.snapshotAll();
                if (result.checks || snapshots) console.log(`[Server] Daily checks (${mode}): ${result.checks} budget check(s) over ${result.days.length} day(s), ${result.alerts} alert(s), ${snapshots} net-worth snapshot(s).`);
            } catch (error) {
                console.error('[Server] Daily checks failed:', error.message);
            }
        };
        nightly('startup');
        const scheduleNightly = () => setTimeout(async () => { await nightly('nightly'); scheduleNightly(); }, budgets.msUntil(config.jobs.nightlyTime)).unref();
        scheduleNightly();

        // Background task: remove guest demo profiles nobody has used for a while
        const purgeGuests = () => {
            if (!config.session.guestRetentionDays) return;
            try {
                const { purged } = require('./src/services/guests').purgeStaleGuests({ days: config.session.guestRetentionDays });
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
            require('./src/services/market-service').stop();
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
