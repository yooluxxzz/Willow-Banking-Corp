/**
 * One-time removal of data Willow used to invent for customers: the fictional
 * "community" customers, sample activity, auto-issued cards, welcome messages
 * and the $100,000 practice cash. After this runs, every balance and record
 * comes from something a customer actually did. Recorded in app_meta so it
 * runs once per database.
 */
const { getDb } = require('../database');
const { removeUserRecords } = require('./guests');
const { logAudit } = require('./audit');

const KEY = 'fabricated_data_removed_v1';
const SAMPLE_REFERENCE = /^(DEP|WDR|TRF|PAY)-S[0-9A-F]{6}\d{4}$/;
const SAMPLE_GOALS = [['Emergency fund', 'savings', 1000000], ['Home deposit', 'home', 6000000], ['Lisbon in spring', 'travel', 320000], ['Long-term investing', 'investing', 1500000]];
const SAMPLE_CARDS = [['Online shopping', 'ivory'], ['Studio expenses', 'graphite']];
const SAMPLE_NOTIFICATIONS = ['Welcome to your Willow demo', 'Virtual card ready', 'Upcoming scheduled transfer', 'Welcome to Willow'];
const SAMPLE_INVOICES = [['INV-1041', 'Harbor & Pine'], ['INV-1042', 'Kestrel Labs'], ['INV-1043', 'Fernwood Hotels'], ['INV-1044', 'Orchard Books']];
const SAMPLE_ACCOUNTS = [['Travel euros', 'EUR', 'personal'], ['Studio operating', 'USD', 'business']];

function hasRun(db) {
    return Boolean(db.prepare('SELECT value FROM app_meta WHERE key = ?').get(KEY));
}

function run() {
    const db = getDb();
    if (hasRun(db)) return { skipped: true };
    const counts = { community: 0, guests: 0, sampleTransactions: 0, sampleRecords: 0, autoCards: 0, portfolios: 0 };
    db.transaction(() => {
        // Fictional customers and the old sample-filled guest profiles.
        db.prepare("SELECT id FROM users WHERE email LIKE '%@community.willow.test'").all().forEach(row => { removeUserRecords(db, row.id); counts.community += 1; });
        db.prepare("SELECT u.id FROM users u JOIN user_preferences p ON p.user_id = u.id WHERE u.is_guest = 1 AND p.sample_data_loaded_at IS NOT NULL").all().forEach(row => { removeUserRecords(db, row.id); counts.guests += 1; });

        // Sample ledger entries: remove them and undo their effect on balances.
        const sample = db.prepare("SELECT id, account_id, amount, direction, reference FROM transactions WHERE reference LIKE '%-S%'").all().filter(row => SAMPLE_REFERENCE.test(row.reference));
        const net = new Map();
        sample.forEach(row => net.set(row.account_id, (net.get(row.account_id) || 0) + (row.direction === 'credit' ? row.amount : -row.amount)));
        net.forEach((cents, accountId) => {
            db.prepare('UPDATE accounts SET balance = MAX(0, balance - ?), available_balance = MAX(0, available_balance - ?) WHERE id = ?').run(cents, cents, accountId);
        });
        sample.forEach(row => db.prepare('DELETE FROM transactions WHERE id = ?').run(row.id));
        counts.sampleTransactions = sample.length;

        // Other records the sample loader created, matched by their exact values.
        const sampleUsers = db.prepare('SELECT user_id FROM user_preferences WHERE sample_data_loaded_at IS NOT NULL').all().map(row => row.user_id);
        for (const userId of sampleUsers) {
            const removed = [
                ...SAMPLE_GOALS.map(([name, category, target]) => db.prepare('DELETE FROM demo_goals WHERE user_id = ? AND name = ? AND category = ? AND target_cents = ?').run(userId, name, category, target).changes),
                db.prepare("DELETE FROM scheduled_transfers WHERE user_id = ? AND description = 'Monthly savings' AND amount = 50000 AND status = 'pending'").run(userId).changes,
                db.prepare("DELETE FROM business_profiles WHERE user_id = ? AND industry = 'Design studio' AND name LIKE '% & Co. Studio'").run(userId).changes,
                ...SAMPLE_INVOICES.map(([number, customer]) => db.prepare('DELETE FROM business_invoices WHERE user_id = ? AND number = ? AND customer_name = ?').run(userId, number, customer).changes),
                db.prepare("DELETE FROM business_team_members WHERE user_id = ? AND email LIKE '%@studio.example'").run(userId).changes,
                ...SAMPLE_CARDS.map(([nickname, design]) => db.prepare(`DELETE FROM cards WHERE nickname = ? AND design = ? AND account_id IN (SELECT id FROM accounts WHERE user_id = ?)
                    AND id NOT IN (SELECT card_id FROM transactions WHERE card_id IS NOT NULL)`).run(nickname, design, userId).changes),
                db.prepare("DELETE FROM demo_watchlist WHERE user_id = ? AND symbol IN ('AMZN', 'SOL', 'QQQ')").run(userId).changes,
            ];
            // Accounts the loader opened, if they are now empty and unused.
            for (const [nickname, currency, purpose] of SAMPLE_ACCOUNTS) {
                const account = db.prepare('SELECT id FROM accounts WHERE user_id = ? AND nickname = ? AND currency = ? AND purpose = ? AND balance = 0').get(userId, nickname, currency, purpose);
                if (account && !db.prepare('SELECT 1 FROM transactions WHERE account_id = ? OR related_account_id = ? LIMIT 1').get(account.id, account.id)
                    && !db.prepare('SELECT 1 FROM cards WHERE account_id = ? LIMIT 1').get(account.id)
                    && !db.prepare('SELECT 1 FROM scheduled_transfers WHERE from_account_id = ? OR to_account_id = ? LIMIT 1').get(account.id, account.id)) {
                    db.prepare('DELETE FROM accounts WHERE id = ?').run(account.id);
                    removed.push(1);
                }
            }
            counts.sampleRecords += removed.reduce((sum, n) => sum + n, 0);
        }
        db.prepare('UPDATE user_preferences SET sample_data_loaded_at = NULL').run();
        SAMPLE_NOTIFICATIONS.forEach(title => { counts.sampleRecords += db.prepare('DELETE FROM notifications WHERE title = ?').run(title).changes; });

        // Debit cards issued automatically at sign-up (same moment as the profile, never used).
        counts.autoCards = db.prepare(`DELETE FROM cards WHERE nickname = '' AND form = 'physical'
            AND id NOT IN (SELECT card_id FROM transactions WHERE card_id IS NOT NULL)
            AND account_id IN (SELECT a.id FROM accounts a JOIN users u ON u.id = a.user_id WHERE abs(julianday(a.created_at) - julianday(u.created_at)) * 86400 <= 5)
            AND abs(julianday(created_at) - julianday((SELECT u.created_at FROM accounts a JOIN users u ON u.id = a.user_id WHERE a.id = cards.account_id))) * 86400 <= 5`).run().changes;

        // Investing and crypto have no reliable legacy provenance. Preserve them:
        // a missing migration marker is not evidence that customer funding is fabricated.

        db.prepare("INSERT INTO app_meta (key, value) VALUES (?, datetime('now'))").run(KEY);
    })();
    logAudit({ actorId: null, actorEmail: 'system', action: 'fabricated_data_removed', targetType: 'database', targetId: KEY, metadata: counts });
    return counts;
}

module.exports = { run, KEY };
