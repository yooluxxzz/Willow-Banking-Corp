/**
 * Identifiers shown to customers, all from a cryptographic random source. Customer
 * IDs and account numbers are checked against the database, so they never collide.
 */
const { randomInt, randomBytes } = require('crypto');

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

/**
 * Ledger reference such as TRF-3F9A1C0B7E: a type prefix and 10 random hex digits.
 * Prefixes mean something elsewhere (see ./spending), so keep them stable.
 */
function reference(prefix) {
    return `${prefix}-${randomBytes(5).toString('hex').toUpperCase()}`;
}

module.exports = { uniqueCustomerId, uniqueAccountNumber, reference };
