/**
 * Background jobs that run while Willow is up, kept in one place:
 *  - due scheduled transfers (every minute);
 *  - the daily budget check and net-worth snapshots (at start-up, then every night
 *    at NIGHTLY_CHECK_TIME; admins can also run it on demand);
 *  - removing guest profiles nobody has used (hourly);
 *  - finishing account deletions whose waiting period has ended (hourly).
 *
 * startJobs() returns a function that stops every timer.
 */
const config = require('../config');
const { getDb } = require('../database');
const { logAudit } = require('./audit');

const log = (...args) => console.log('[Jobs]', ...args);
const fail = (job, error) => console.error(`[Jobs] ${job} failed:`, error.message);

function runScheduledTransfers() {
    try {
        const result = require('./scheduled-transfers').processDueScheduledTransfers();
        if (result.completed) log(`Completed ${result.completed} scheduled transfer(s).`);
        return result;
    } catch (error) {
        fail('Scheduled transfers', error);
        return null;
    }
}

/** Budget checks plus a net-worth snapshot for every customer with something to value. */
async function runDailyChecks(mode = 'nightly', now = new Date()) {
    const result = require('./budgets').runBudgetChecks({ mode, now });
    const snapshots = await require('./networth').snapshotAll(now);
    return { ...result, snapshots };
}

async function dailyChecksJob(mode) {
    try {
        const result = await runDailyChecks(mode);
        if (result.checks || result.snapshots) log(`Daily checks (${mode}): ${result.checks} budget check(s) over ${result.days.length} day(s), ${result.alerts} alert(s), ${result.snapshots} net-worth snapshot(s).`);
    } catch (error) {
        fail('Daily checks', error);
    }
}

function purgeGuests() {
    if (!config.session.guestRetentionDays) return;
    try {
        const { purged } = require('./guests').purgeStaleGuests({ days: config.session.guestRetentionDays });
        if (purged) log(`Removed ${purged} inactive guest profile(s).`);
    } catch (error) {
        fail('Guest clean-up', error);
    }
}

/** Marks profiles deleted once their scheduled deletion date has passed. Returns how many. */
function finishScheduledDeletions(now = new Date()) {
    try {
        const db = getDb();
        const due = db.prepare("SELECT id FROM users WHERE scheduled_deletion_at IS NOT NULL AND scheduled_deletion_at <= ? AND status != 'deleted'").all(now.toISOString());
        for (const user of due) {
            db.prepare("UPDATE users SET status = 'deleted', updated_at = datetime('now') WHERE id = ?").run(user.id);
            logAudit({ actorId: null, actorEmail: 'system', action: 'user_auto_deleted', targetType: 'user', targetId: String(user.id), metadata: { reason: 'Scheduled deletion period expired' } });
        }
        if (due.length) log(`Completed ${due.length} scheduled profile deletion(s).`);
        return due.length;
    } catch (error) {
        fail('Scheduled deletions', error);
        return 0;
    }
}

function startJobs() {
    const intervals = [];
    const every = (ms, job) => { job(); const timer = setInterval(job, ms); timer.unref(); intervals.push(timer); };
    every(60 * 1000, runScheduledTransfers);
    every(60 * 60 * 1000, purgeGuests);
    every(60 * 60 * 1000, finishScheduledDeletions);

    // Catch up on days missed while Willow was stopped, then run every night.
    dailyChecksJob('startup');
    let nightly = null;
    const scheduleNightly = () => {
        nightly = setTimeout(async () => { await dailyChecksJob('nightly'); scheduleNightly(); }, require('./budgets').msUntil(config.jobs.nightlyTime));
        nightly.unref();
    };
    scheduleNightly();

    return function stopJobs() {
        intervals.forEach(clearInterval);
        clearTimeout(nightly);
    };
}

module.exports = { startJobs, runDailyChecks, runScheduledTransfers, purgeGuests, finishScheduledDeletions };
