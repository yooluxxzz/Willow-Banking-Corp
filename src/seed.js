/**
 * Seed script — creates a demo customer with realistic sample activity.
 * Run: npm run seed
 *
 * The demo password comes from SEED_DEMO_PASSWORD, or a random one is generated
 * and printed once. Nothing here is a real credential; all money is simulated.
 */
require('dotenv').config();
const crypto = require('crypto');
const { initializeDatabase, getDb, closeDatabase } = require('./database');
const { initializeAdmin, registerUser } = require('./services/auth');
const { ensureCommunity, loadSampleData } = require('./services/demo-data');

const DEMO_EMAIL = (process.env.SEED_DEMO_EMAIL || 'demo@willow.test').toLowerCase();

function generatedPassword() {
    // Meets the password policy: upper, lower and digits.
    return `Willow-${crypto.randomBytes(4).toString('hex')}-${crypto.randomInt(10, 99)}A`;
}

async function seed() {
    console.log('[Seed] Initializing database...');
    await initializeDatabase();
    await initializeAdmin();
    const db = getDb();

    console.log('[Seed] Creating demo community customers...');
    await ensureCommunity();

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(DEMO_EMAIL);
    if (existing) {
        console.log(`[Seed] ${DEMO_EMAIL} already exists. Loading sample activity if it is missing.`);
        const result = await loadSampleData(existing.id, { business: true });
        console.log(result.loaded ? '[Seed] Sample activity loaded.' : '[Seed] Sample activity was already present.');
        closeDatabase();
        return;
    }

    const password = process.env.SEED_DEMO_PASSWORD || generatedPassword();
    const created = await registerUser({ email: DEMO_EMAIL, password, fullName: 'Alex Morgan', phone: '', country: 'United States' });
    if (created.error) throw new Error(created.error);
    const { uniqueAccountNumber } = require('./services/account');
    db.prepare("INSERT INTO accounts (user_id, account_number, account_type, purpose, nickname, balance, available_balance, currency, status) VALUES (?, ?, 'checking', 'business', 'Studio operating', 0, 0, 'USD', 'active')")
        .run(created.userId, uniqueAccountNumber(db));
    const sample = await loadSampleData(created.userId, { business: true });

    console.log('\n[Seed] Demo customer ready:');
    console.log(`  Email:        ${DEMO_EMAIL}`);
    console.log(`  Customer ID:  ${created.customerId}`);
    if (!process.env.SEED_DEMO_PASSWORD) console.log(`  Password:     ${password}   (generated — set SEED_DEMO_PASSWORD to choose one)`);
    console.log(`  Portfolio:    ${sample.portfolio && sample.portfolio.seeded ? 'seeded at current market prices' : 'demo cash only (market data unavailable)'}`);
    console.log('\nAll balances and activity are simulated.');
    closeDatabase();
}

seed().catch(err => {
    console.error('[Seed] Error:', err);
    process.exit(1);
});
