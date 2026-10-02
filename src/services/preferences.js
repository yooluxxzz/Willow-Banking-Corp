/**
 * Alert and privacy preferences. Stored per profile; defaults are created on demand.
 */
const { getDb } = require('../database');

const BOOLEAN_FIELDS = {
    alertTransactions: 'alert_transactions',
    alertCards: 'alert_cards',
    alertSecurity: 'alert_security',
    alertMarkets: 'alert_markets',
    alertProductNews: 'alert_product_news',
    hideBalances: 'privacy_hide_balances',
    personalizedInsights: 'privacy_personalized_insights',
};

function ensure(userId) {
    const db = getDb();
    db.prepare('INSERT OR IGNORE INTO user_preferences (user_id) VALUES (?)').run(userId);
    return db.prepare('SELECT * FROM user_preferences WHERE user_id = ?').get(userId);
}

function format(row) {
    const result = {};
    Object.entries(BOOLEAN_FIELDS).forEach(([key, column]) => { result[key] = Boolean(row[column]); });
    result.largeTransactionThresholdCents = row.alert_large_threshold_cents;
    result.sampleDataLoadedAt = row.sample_data_loaded_at;
    return result;
}

function getPreferences(userId) {
    return format(ensure(userId));
}

function updatePreferences(userId, changes = {}) {
    ensure(userId);
    const sets = [];
    const values = [];
    Object.entries(BOOLEAN_FIELDS).forEach(([key, column]) => {
        if (changes[key] === undefined) return;
        if (typeof changes[key] !== 'boolean') throw new Error('Preferences must be on or off.');
        sets.push(`${column} = ?`);
        values.push(changes[key] ? 1 : 0);
    });
    if (changes.largeTransactionThresholdCents !== undefined) {
        const value = Number(changes.largeTransactionThresholdCents);
        if (!Number.isSafeInteger(value) || value < 0 || value > 100000000) throw new Error('Choose a threshold between 0 and 1,000,000.');
        sets.push('alert_large_threshold_cents = ?');
        values.push(value);
    }
    if (!sets.length) throw new Error('No preferences were changed.');
    getDb().prepare(`UPDATE user_preferences SET ${sets.join(', ')}, updated_at = datetime('now') WHERE user_id = ?`).run(...values, userId);
    return getPreferences(userId);
}

module.exports = { getPreferences, updatePreferences, ensure };
