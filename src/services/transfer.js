/**
 * Transfer service — atomic internal transfers with full validation
 */
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database');
const { toCents, validateAmount } = require('../middleware/validation');
const { createNotification } = require('./notification');
const { logAudit } = require('./audit');

function executeTransfer({ fromAccountId, toAccountNumber, amount, description, userId }) {
    const db = getDb();

    // Validate amount
    if (!validateAmount(amount)) {
        return { error: 'Please enter a valid positive amount (up to 2 decimal places).' };
    }

    const amountCents = toCents(amount);
    if (amountCents <= 0) {
        return { error: 'Transfer amount must be greater than zero.' };
    }

    // Get sender account
    const fromAccount = db.prepare(`
    SELECT a.*, u.id as owner_id FROM accounts a
    JOIN users u ON a.user_id = u.id
    WHERE a.id = ? AND a.user_id = ?
  `).get(fromAccountId, userId);

    if (!fromAccount) {
        return { error: 'Source account not found or you do not have access.' };
    }
    if (fromAccount.status !== 'active') {
        return { error: 'Source account is not active.' };
    }

    // Get recipient account
    const toAccount = db.prepare(`
    SELECT a.*, u.id as owner_id, u.full_name as owner_name, u.status as user_status
    FROM accounts a
    JOIN users u ON a.user_id = u.id
    WHERE a.account_number = ?
  `).get(toAccountNumber);

    if (!toAccount) {
        return { error: 'Recipient account not found. Please check the account number.' };
    }
    if (toAccount.status !== 'active') {
        return { error: 'Recipient account is not active.' };
    }
    if (toAccount.user_status !== 'active') {
        return { error: 'Recipient account holder is not active.' };
    }

    // Prevent self-transfer to same account
    if (fromAccount.id === toAccount.id) {
        return { error: 'Cannot transfer to the same account.' };
    }

    // Check balance
    if (fromAccount.available_balance < amountCents) {
        return { error: 'Insufficient funds for this transfer.' };
    }

    const reference = `TRF-${uuidv4().slice(0, 8).toUpperCase()}`;
    const desc = description?.trim() || `Transfer to ${toAccount.owner_name}`;

    // Atomic transaction
    const transfer = db.transaction(() => {
        // Debit sender
        db.prepare(`
      UPDATE accounts SET balance = balance - ?, available_balance = available_balance - ?
      WHERE id = ? AND available_balance >= ?
    `).run(amountCents, amountCents, fromAccount.id, amountCents);

        // Verify debit happened (race condition check)
        const updated = db.prepare('SELECT available_balance FROM accounts WHERE id = ?').get(fromAccount.id);
        if (updated.available_balance < 0) {
            throw new Error('Insufficient funds');
        }

        // Credit recipient
        db.prepare(`
      UPDATE accounts SET balance = balance + ?, available_balance = available_balance + ?
      WHERE id = ?
    `).run(amountCents, amountCents, toAccount.id);

        // Record debit transaction
        db.prepare(`
      INSERT INTO transactions (reference, account_id, related_account_id, type, amount, currency, direction, status, description)
      VALUES (?, ?, ?, 'transfer', ?, 'USD', 'debit', 'completed', ?)
    `).run(reference, fromAccount.id, toAccount.id, amountCents, desc);

        // Record credit transaction
        const creditRef = `${reference}-C`;
        db.prepare(`
      INSERT INTO transactions (reference, account_id, related_account_id, type, amount, currency, direction, status, description)
      VALUES (?, ?, ?, 'transfer', ?, 'USD', 'credit', 'completed', ?)
    `).run(creditRef, toAccount.id, fromAccount.id, amountCents, `Transfer from account ••••${fromAccount.account_number.slice(-4)}`);

        return { reference };
    });

    try {
        const result = transfer();

        // Notifications (outside transaction — non-critical)
        try {
            createNotification(userId, 'transfer', 'Transfer Sent',
                `You sent $${amount} to ${toAccount.owner_name} (Ref: ${result.reference})`);
            createNotification(toAccount.owner_id, 'transfer', 'Transfer Received',
                `You received $${amount} from account ••••${fromAccount.account_number.slice(-4)} (Ref: ${result.reference})`);
        } catch (e) { /* notification failure shouldn't fail the transfer */ }

        return { success: true, reference: result.reference };
    } catch (err) {
        if (err.message === 'Insufficient funds') {
            return { error: 'Insufficient funds for this transfer.' };
        }
        throw err;
    }
}

module.exports = { executeTransfer };
