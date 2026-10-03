const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const supertest = require('supertest');
const { createTestApp, registerAgent } = require('./setup');

describe('Simulated crypto wallet', () => {
    let app, db, close, sender, receiver, accounts, portfolio, walletService;
    before(async () => {
        const env = await createTestApp(); app = env.app; db = env.getDb(); close = env.closeDatabase;
        sender = await registerAgent(supertest, app, { email: 'crypto-sender@example.test', password: 'CryptoDemo123', fullName: 'Crypto Sender' });
        receiver = await registerAgent(supertest, app, { email: 'crypto-receiver@example.test', password: 'CryptoDemo123', fullName: 'Crypto Receiver' });
        portfolio = require('../src/services/demo-portfolio');
        walletService = require('../src/services/crypto-wallet');
        const senderId = db.prepare('SELECT id FROM users WHERE email = ?').get('crypto-sender@example.test').id;
        const receiverId = db.prepare('SELECT id FROM users WHERE email = ?').get('crypto-receiver@example.test').id;
        // Investing cash comes only from the customer's own deposited money.
        for (const [who, id, amount] of [[sender, senderId, '10000'], [receiver, receiverId, '8000']]) {
            const checking = db.prepare('SELECT id FROM accounts WHERE user_id = ?').get(id);
            assert.equal((await who.agent.post('/api/deposits').set('X-CSRF-Token', who.csrfToken).send({ accountId: checking.id, amount })).status, 200);
            portfolio.moveCash(id, { accountId: checking.id, direction: 'in', amount });
        }
        portfolio.executeTrade(senderId, { symbol: 'BTC', side: 'buy', quantity: 0.5, price: 20000 });
        portfolio.executeTrade(receiverId, { symbol: 'BTC', side: 'buy', quantity: 0.2, price: 40000 });
        accounts = db.prepare('SELECT id, balance FROM accounts WHERE user_id IN (?, ?) ORDER BY id').all(senderId, receiverId);
        assert.equal(accounts.length, 2);
    });
    after(() => close());

    it('renders a protected wallet and transfers only simulated holdings between profiles', async () => {
        assert.equal((await supertest(app).get('/crypto')).status, 302);
        const page = await sender.agent.get('/crypto');
        assert.equal(page.status, 200);
        assert.match(page.text, /no public wallet addresses/i);
        assert.match(page.text, /Send crypto/);
        assert.equal((await supertest(app).get('/api/crypto/wallet').set('Accept', 'application/json')).status, 401);

        const senderId = db.prepare('SELECT id FROM users WHERE email = ?').get('crypto-sender@example.test').id;
        const receiverId = db.prepare('SELECT id FROM users WHERE email = ?').get('crypto-receiver@example.test').id;
        const senderCashBefore = portfolio.getPortfolio(senderId).cashCents;
        const receiverCashBefore = portfolio.getPortfolio(receiverId).cashCents;
        const bankingBefore = db.prepare('SELECT id, balance FROM accounts WHERE id IN (?, ?) ORDER BY id').all(accounts[0].id, accounts[1].id);
        const ledgerCountBefore = db.prepare('SELECT COUNT(*) AS count FROM transactions').get().count;
        assert.equal((await sender.agent.post('/api/crypto/send').send({ symbol: 'BTC', quantity: '0.1', recipientEmail: 'crypto-receiver@example.test' })).status, 403);

        const response = await sender.agent.post('/api/crypto/send').set('X-CSRF-Token', sender.csrfToken)
            .send({ symbol: 'BTC', quantity: '0.1', recipientEmail: 'crypto-receiver@example.test' });
        assert.equal(response.status, 201);
        assert.match(response.body.message, /No blockchain transaction/);
        assert.equal(response.body.transfer.wallet.holdings[0].quantity, 0.4);
        const receiverWallet = await receiver.agent.get('/api/crypto/wallet');
        assert.equal(receiverWallet.body.wallet.holdings[0].quantity, 0.3);
        assert.ok(Math.abs(receiverWallet.body.wallet.holdings[0].average_price - 10000 / 0.3) < 0.0001);
        assert.equal((await sender.agent.get('/api/crypto/wallet')).body.history[0].direction, 'sent');
        assert.equal(receiverWallet.body.history[0].direction, 'received');
        assert.equal(portfolio.getPortfolio(senderId).cashCents, senderCashBefore);
        assert.equal(portfolio.getPortfolio(receiverId).cashCents, receiverCashBefore);
        assert.deepEqual(db.prepare('SELECT id, balance FROM accounts WHERE id IN (?, ?) ORDER BY id').all(accounts[0].id, accounts[1].id), bankingBefore);
        assert.equal(db.prepare('SELECT COUNT(*) AS count FROM transactions').get().count, ledgerCountBefore);
    });

    it('rejects self-sends, unsupported assets, invalid quantities and units the sender does not own', () => {
        const senderId = db.prepare('SELECT id FROM users WHERE email = ?').get('crypto-sender@example.test').id;
        assert.throws(() => walletService.sendDemoCrypto(senderId, { symbol: 'BTC', quantity: '0.1', recipientEmail: 'crypto-sender@example.test' }), /different Willow demo customer/);
        assert.throws(() => walletService.sendDemoCrypto(senderId, { symbol: 'DOGE', quantity: '0.1', recipientEmail: 'crypto-receiver@example.test' }), /supported demo crypto asset/);
        assert.throws(() => walletService.sendDemoCrypto(senderId, { symbol: 'BTC', quantity: '0.500000001', recipientEmail: 'crypto-receiver@example.test' }), /valid quantity/);
        assert.throws(() => walletService.sendDemoCrypto(senderId, { symbol: 'BTC', quantity: '9', recipientEmail: 'crypto-receiver@example.test' }), /Not enough demo BTC/);
    });
});