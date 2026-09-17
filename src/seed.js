/**
 * Seed script — creates demo data for development
 * Run: npm run seed
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { initializeDatabase, getDb, closeDatabase } = require('./database');
const config = require('./config');

async function seed() {
    console.log('[Seed] Initializing database...');
    await initializeDatabase();
    const db = getDb();

    // Check if demo data already exists
    const existingUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'customer'").get();
    if (existingUsers.count > 0) {
        console.log('[Seed] Demo data already exists. Skipping.');
        closeDatabase();
        return;
    }

    console.log('[Seed] Creating demo users and accounts...');

    const passwordHash = await bcrypt.hash('password123', config.bcryptRounds);

    const users = [
        { email: 'john.doe@email.com', fullName: 'John Doe', phone: '+1-555-0101', customerId: 'WB10000001' },
        { email: 'jane.smith@email.com', fullName: 'Jane Smith', phone: '+1-555-0102', customerId: 'WB10000002' },
        { email: 'robert.wilson@email.com', fullName: 'Robert Wilson', phone: '+1-555-0103', customerId: 'WB10000003' },
        { email: 'sarah.johnson@email.com', fullName: 'Sarah Johnson', phone: '+1-555-0104', customerId: 'WB10000004' },
        { email: 'michael.chen@email.com', fullName: 'Michael Chen', phone: '+1-555-0105', customerId: 'WB10000005' },
    ];

    const insertUser = db.prepare(`
    INSERT INTO users (email, full_name, phone, password_hash, role, status, customer_id)
    VALUES (?, ?, ?, ?, 'customer', 'active', ?)
  `);

    const insertAccount = db.prepare(`
    INSERT INTO accounts (user_id, account_number, account_type, balance, available_balance, currency, status)
    VALUES (?, ?, ?, ?, ?, 'USD', 'active')
  `);

    const insertCard = db.prepare(`
    INSERT INTO cards (account_id, card_type, last_four, expiration_date, status, daily_limit)
    VALUES (?, ?, ?, ?, 'active', 500000)
  `);

    const insertTxn = db.prepare(`
    INSERT INTO transactions (reference, account_id, related_account_id, type, amount, currency, direction, status, description, created_at)
    VALUES (?, ?, ?, ?, ?, 'USD', ?, 'completed', ?, datetime(?, 'utc'))
  `);

    const insertNotification = db.prepare(`
    INSERT INTO notifications (user_id, type, title, message, created_at)
    VALUES (?, ?, ?, ?, datetime(?, 'utc'))
  `);

    const transaction = db.transaction(() => {
        const userIds = [];
        const accountIds = [];
        const accountNumbers = [];

        // Create users and accounts
        const accounts = [
            { number: '4200100010011001', type: 'checking', balance: 1250075 },  // $12,500.75
            { number: '4200100010021002', type: 'checking', balance: 875030 },   // $8,750.30
            { number: '4200100010031003', type: 'checking', balance: 3200000 },  // $32,000.00
            { number: '4200100010041004', type: 'checking', balance: 450050 },   // $4,500.50
            { number: '4200100010051005', type: 'checking', balance: 15750000 }, // $157,500.00
        ];

        for (let i = 0; i < users.length; i++) {
            const u = users[i];
            const a = accounts[i];
            const result = insertUser.run(u.email, u.fullName, u.phone, passwordHash, u.customerId);
            const userId = result.lastInsertRowid;
            userIds.push(userId);

            const accResult = insertAccount.run(userId, a.number, a.type, a.balance, a.balance);
            const accountId = accResult.lastInsertRowid;
            accountIds.push(accountId);
            accountNumbers.push(a.number);

            // Create card
            insertCard.run(accountId, 'debit', a.number.slice(-4), '09/2029');

            // Optional savings account for first two users
            if (i < 2) {
                const savingsNum = a.number.replace(/\d{2}$/, '99');
                const savingsBalance = Math.floor(a.balance * 0.5);
                const savResult = insertAccount.run(userId, savingsNum, 'savings', savingsBalance, savingsBalance);
                insertCard.run(savResult.lastInsertRowid, 'debit', savingsNum.slice(-4), '09/2029');
            }
        }

        // Create demo transactions
        const now = new Date();
        const txnTypes = ['deposit', 'withdrawal', 'transfer', 'payment'];
        const descriptions = [
            'Monthly salary deposit',
            'Grocery store purchase',
            'Electric bill payment',
            'Transfer to savings',
            'Restaurant payment',
            'Gas station',
            'Online subscription',
            'ATM withdrawal',
            'Direct deposit',
            'Insurance premium',
        ];

        for (let i = 0; i < 30; i++) {
            const accountIdx = i % userIds.length;
            const accountId = accountIds[accountIdx];
            const daysAgo = Math.floor(i * 2.5);
            const date = new Date(now.getTime() - daysAgo * 86400000);
            const type = txnTypes[i % txnTypes.length];
            const direction = type === 'deposit' ? 'credit' : (type === 'withdrawal' ? 'debit' : (i % 2 === 0 ? 'debit' : 'credit'));
            const amount = Math.floor(5000 + Math.random() * 200000); // $50 - $2000
            const ref = `SEED-${uuidv4().slice(0, 8).toUpperCase()}`;

            insertTxn.run(
                ref,
                accountId,
                type === 'transfer' ? accountIds[(accountIdx + 1) % accountIds.length] : null,
                type,
                amount,
                direction,
                descriptions[i % descriptions.length],
                date.toISOString()
            );
        }

        // Create demo notifications
        for (let i = 0; i < userIds.length; i++) {
            const date = new Date(now.getTime() - i * 3600000);
            insertNotification.run(userIds[i], 'info', 'Welcome to Willow Banking',
                'Your account has been set up. Explore your dashboard to manage your finances.', date.toISOString());
            insertNotification.run(userIds[i], 'security', 'Login from new device',
                'A new login was detected from your account. If this was not you, please contact support.', date.toISOString());
        }
    });

    transaction();

    console.log('[Seed] Demo data created:');
    console.log('  5 demo users (password: password123)');
    console.log('  Emails: john.doe@email.com, jane.smith@email.com, etc.');
    console.log('  30 demo transactions');
    console.log('  Demo notifications');

    closeDatabase();
}

seed().catch(err => {
    console.error('[Seed] Error:', err);
    closeDatabase();
    process.exit(1);
});
