/**
 * Transfer service — atomic internal transfers with full validation
 */
const ids = require('./ids');
const { getDb } = require('../database');
const { toCents, validateAmount, formatCurrency } = require('../middleware/validation');
const { createNotification } = require('./notification');
const { assertUser, assertTransferLimit } = require('./mutation-guard');
const { logAudit } = require('./audit');

function executeTransfer({ fromAccountId, toAccountNumber, amount, description, userId }) {
    const db = getDb();
    assertUser(userId);

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
    SELECT a.*, u.id as owner_id, u.full_name as owner_name, u.email as owner_email FROM accounts a
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
    if ((fromAccount.currency || 'USD') !== (toAccount.currency || 'USD')) {
        return { error: `These accounts use different currencies (${fromAccount.currency} and ${toAccount.currency}). Use Convert in International to move money between currencies.` };
    }
    const currency = fromAccount.currency || 'USD';

    // Check balance
    if (fromAccount.available_balance < amountCents) {
        return { error: 'Insufficient funds for this transfer.' };
    }

    const reference = ids.reference('TRF');
    const desc = description?.trim() || (toAccount.owner_id === fromAccount.owner_id ? `Transfer to ${toAccount.nickname || (toAccount.account_type === 'savings' ? 'Savings' : 'Checking')} ••••${toAccount.account_number.slice(-4)}` : `Transfer to ${toAccount.owner_name}`);
    const counterpartyOut = toAccount.owner_id === fromAccount.owner_id ? null : toAccount.owner_name;
    const counterpartyIn = toAccount.owner_id === fromAccount.owner_id ? null : fromAccount.owner_name;

    // Atomic transaction
    const transfer = db.transaction(() => {
        assertUser(userId);
        assertTransferLimit(fromAccount, amountCents);
        // Debit sender
        const debit = db.prepare(`
      UPDATE accounts SET balance = balance - ?, available_balance = available_balance - ?
      WHERE id = ? AND available_balance >= ?
    `).run(amountCents, amountCents, fromAccount.id, amountCents);

        // Verify debit happened (race condition check)
        const updated = db.prepare('SELECT available_balance FROM accounts WHERE id = ?').get(fromAccount.id);
        if (debit.changes !== 1 || updated.available_balance < 0) {
            throw new Error('Insufficient funds');
        }

        // Credit recipient
        db.prepare(`
      UPDATE accounts SET balance = balance + ?, available_balance = available_balance + ?
      WHERE id = ?
    `).run(amountCents, amountCents, toAccount.id);

        // Record debit transaction
        db.prepare(`
      INSERT INTO transactions (reference, account_id, related_account_id, type, amount, currency, direction, status, description, counterparty)
      VALUES (?, ?, ?, 'transfer', ?, ?, 'debit', 'completed', ?, ?)
    `).run(reference, fromAccount.id, toAccount.id, amountCents, currency, desc, counterpartyOut);

        // Record credit transaction
        const creditRef = `${reference}-C`;
        db.prepare(`
      INSERT INTO transactions (reference, account_id, related_account_id, type, amount, currency, direction, status, description, counterparty)
      VALUES (?, ?, ?, 'transfer', ?, ?, 'credit', 'completed', ?, ?)
    `).run(creditRef, toAccount.id, fromAccount.id, amountCents, currency, counterpartyIn ? `Transfer from ${counterpartyIn}` : `Transfer from account ••••${fromAccount.account_number.slice(-4)}`, counterpartyIn);

        logAudit({ actorId: userId, actorEmail: fromAccount.owner_email, action: 'transfer', targetType: 'account', targetId: String(fromAccount.id), metadata: { amountCents, currency, reference, destinationType: toAccount.owner_id === userId ? 'own-account' : 'customer' } });

        return { reference };
    });

    try {
        const result = transfer();

        // Notifications (outside transaction — non-critical)
        try {
            const formatted = formatCurrency(amountCents, currency);
            createNotification(userId, 'transfer', 'Demo transfer sent',
                `You sent ${formatted} to ${toAccount.owner_id === fromAccount.owner_id ? 'your account ••••' + toAccount.account_number.slice(-4) : toAccount.owner_name} (Ref: ${result.reference}). Simulated — no real money moved.`);
            if (toAccount.owner_id !== fromAccount.owner_id) {
                createNotification(toAccount.owner_id, 'transfer', 'Demo transfer received',
                    `You received ${formatted} from ${fromAccount.owner_name} (Ref: ${result.reference}). Simulated — no real money moved.`);
            }
        } catch (e) { /* notification failure shouldn't fail the transfer */ }

        return { success: true, reference: result.reference, amountCents, currency, recipientName: toAccount.owner_id === fromAccount.owner_id ? null : toAccount.owner_name, toAccountId: toAccount.id };
    } catch (err) {
        if (err.status) return { error: err.message, code: err.code || 'rejected' };
        if (err.message === 'Insufficient funds') {
            return { error: 'Insufficient funds for this transfer.' };
        }
        throw err;
    }
}

module.exports = { executeTransfer };
