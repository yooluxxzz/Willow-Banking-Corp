/**
 * Identifiers shown to customers. Both use a cryptographic random source and are
 * checked against the database, so they never collide.
 */
const { randomInt } = require('crypto');

/** Customer ID such as WB48213907 (used to sign in instead of an email address). */
function uniqueCustomerId(db) {
    let id;
    do { id = `WB${randomInt(10000000, 100000000)}`; }
    while (db.prepare('SELECT id FROM users WHERE customer_id = ?').get(id));
    return id;
}

/** 14-digit account number starting 4200. */
function uniqueAccountNumber(db) {
    let number;
    do { number = `4200${randomInt(1000000000, 10000000000)}`; }
    while (db.prepare('SELECT id FROM accounts WHERE account_number = ?').get(number));
    return number;
}

module.exports = { uniqueCustomerId, uniqueAccountNumber };
