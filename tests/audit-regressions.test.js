const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const supertest = require('supertest');
const setup = require('./setup');

describe('Audit regressions: integrity and assistant', () => {
    let app, db, close;
    before(async () => { const env = await setup.createTestApp(); app = env.app; db = env.getDb(); close = env.closeDatabase; });
    after(() => close());
    async function customer() {
        const email = randomUUID() + '@audit.test';
        const login = await setup.registerAgent(supertest, app, { email, password: 'Audit1234', fullName: 'Audit Customer' });
        const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
        const account = db.prepare('SELECT * FROM accounts WHERE user_id = ?').get(user.id);
        db.prepare('UPDATE accounts SET balance = 10000000, available_balance = 10000000 WHERE id = ?').run(account.id);
        return { ...login, user, account };
    }
    const post = (c, path, body) => c.agent.post(path).set('X-CSRF-Token', c.csrfToken).send(body);
    const events = response => response.text.trim().split('\n').map(JSON.parse);

    it('answers bank funds without probing Ollama and saves a complete conversation', async () => {
        const c = await customer();
        db.prepare('UPDATE accounts SET balance=12345, available_balance=12000 WHERE id=?').run(c.account.id);
        const ai = require('../src/services/assistant'); const original = ai.getStatus;
        ai.getStatus = () => { throw new Error('Balance checks must not probe the model'); };
        try {
            const response = await post(c, '/api/assistant/chat', { question: 'check my bank account funds' });
            const frames = events(response); const done = frames.find(x => x.done);
            assert.equal(done.tool, 'accounts');
            assert.equal(done.data.accounts[0].balance, '$123.45');
            assert.equal(done.data.accounts[0].available, '$120.00');
            assert.doesNotMatch(response.text, /haven’t started investing/);
            const saved = require('../src/services/assistant-chats').getConversation(c.user.id, done.conversationId);
            assert.deepEqual(saved.messages.map(x => x.role), ['user', 'assistant']);
        } finally { ai.getStatus = original; }
    });

    it('routes writes to planning, maps goal targets, and preserves pending chat identity', async () => {
        const c = await customer(); const ai = require('../src/services/assistant');
        const original = { getStatus: ai.getStatus, planAction: ai.planAction };
        const tools = require('../src/services/assistant-actions');
        let planned = 0;
        ai.getStatus = async () => ({ available: true, model: 'test' });
        ai.planAction = async () => { planned++; return { mode: 'action', tool: 'create_goal', args: { name: 'Home', category: 'home', target: 1000, accountId: c.account.id } }; };
        try {
            for (const question of ['buy AAPL stock', 'pay my debt', 'create a savings goal', 'Can you buy AAPL stock?']) {
                const frames = events(await post(c, '/api/assistant/chat', { question }));
                const done = frames.find(x => x.done);
                assert.equal(done.mode, 'action_pending'); assert.ok(done.conversationId);
            }
            assert.equal(planned, 4);
            assert.equal(tools.detectReadIntent('what is AAPL stock price?'), 'stock_quote');
            const goal = await tools.execute(c.user.id, 'create_goal', { name: 'Car', category: 'other', target: 1000, accountId: c.account.id });
            assert.equal(goal.goal.target_cents, 100000);
        } finally { Object.assign(ai, original); }
    });

    it('persists offline answers and continues the same chat', async () => {
        const c = await customer(); const ai = require('../src/services/assistant'); const old = ai.getStatus;
        ai.getStatus = async () => ({ available: false, reason: 'unreachable' });
        try {
            const first = events(await post(c, '/api/assistant/chat', { question: 'What is compound interest?' })).find(x => x.done);
            const second = events(await post(c, '/api/assistant/chat', { question: 'Tell me more', conversationId: first.conversationId })).find(x => x.done);
            assert.equal(first.conversationId, second.conversationId);
            assert.equal(require('../src/services/assistant-chats').getConversation(c.user.id, first.conversationId).messages.length, 4);
        } finally { ai.getStatus = old; }
    });

    it('returns an offline quote and asks for a symbol rather than inventing one', async () => {
        const c = await customer(); const ai = require('../src/services/assistant'); const market = require('../src/services/market-data');
        const old = ai.getStatus; const quote = market.getLatestQuote;
        ai.getStatus = async () => ({ available: false });
        market.getLatestQuote = async () => ({ price: 123.45, currency: 'USD', saved: true, asOf: '2026-10-04' });
        try {
            const result = events(await post(c, '/api/assistant/chat', { question: 'What is AAPL stock price?' }));
            assert.match(result[0].delta, /AAPL.*\$123\.45.*Saved price/);
            assert.equal(result.find(x => x.done).tool, 'stock_quote');
            assert.match((await post(c, '/api/assistant/chat', { question: 'What is the stock price?' })).text, /Which supported symbol/);
        } finally { ai.getStatus = old; market.getLatestQuote = quote; }
    });

    it('does not turn education or negated requests into autonomous actions', async () => {
        const c = await customer(); const ai = require('../src/services/assistant');
        const old = { getStatus: ai.getStatus, planAction: ai.planAction, chat: ai.chat, runActionTool: ai.runActionTool }; let writes = 0;
        require('../src/services/preferences').updatePreferences(c.user.id, { assistantAutonomy: 'autonomous' });
        ai.getStatus = async () => ({ available: true });
        ai.planAction = async () => ({ mode: 'action', tool: 'trade', args: {} });
        ai.chat = async (id, input, callbacks) => callbacks.onToken('Explanation only.');
        ai.runActionTool = async () => { writes++; return {}; };
        try {
            for (const question of ['How do I buy a stock?', 'Do not buy AAPL stock', 'Please explain how to buy a stock', 'Tell me how to create a goal']) assert.doesNotMatch((await post(c, '/api/assistant/chat', { question })).text, /action_executed/);
            assert.equal(writes, 0);
        } finally { Object.assign(ai, old); }
    });

    it('confirms each supported write exactly once and retains its receipt in history', async () => {
        const c = await customer(); const ai = require('../src/services/assistant'); const market = require('../src/services/market-data');
        const old = { getStatus: ai.getStatus, planAction: ai.planAction }; const quote = market.getLatestQuote;
        const target = require('../src/services/account').openAccount(c.user.id, { product: 'savings', requestKey: randomUUID(), demoAcknowledged: true }).account;
        const debt = require('../src/services/networth').createDebt(c.user.id, { name: 'Card', kind: 'credit_card', balance: 100 });
        const plans = [
            { tool: 'transfer', args: { fromAccountId: c.account.id, toAccountId: target.id, amount: 10 } },
            { tool: 'move_investing_cash', args: { accountId: c.account.id, direction: 'in', amount: 100 } },
            { tool: 'trade', args: { symbol: 'AAPL', side: 'buy', quantity: 1 } },
            { tool: 'pay_debt', args: { accountId: c.account.id, debtId: debt.id, amount: 10 } },
            { tool: 'create_goal', args: { name: 'Home', category: 'home', target: 1000, accountId: target.id } },
        ];
        ai.getStatus = async () => ({ available: true }); market.getLatestQuote = async () => ({ price: 10, source: 'test' });
        try {
            for (const plan of plans) {
                ai.planAction = async () => ({ mode: 'action', ...plan });
                const done = events(await post(c, '/api/assistant/chat', { question: 'Please create the requested action' })).find(x => x.done);
                assert.equal(done.mode, 'action_pending');
                const path = '/api/assistant/actions/' + done.action.token + '/confirm';
                const receipt = await post(c, path, {});
                assert.equal(receipt.status, 200, plan.tool); assert.equal(receipt.body.tool, plan.tool);
                assert.equal((await post(c, path, {})).status, 410, 'a consumed token cannot repeat the mutation');
                assert.match(require('../src/services/assistant-chats').getConversation(c.user.id, done.conversationId).messages.at(-1).content, /Completed:/);
            }
        } finally { Object.assign(ai, old); market.getLatestQuote = quote; }
    });

    it('invalidates an approval after an autonomy change even if the mode is restored', async () => {
        const c = await customer(); const ai = require('../src/services/assistant'); const old = { getStatus: ai.getStatus, planAction: ai.planAction };
        ai.getStatus = async () => ({ available: true });
        ai.planAction = async () => ({ mode: 'action', tool: 'create_goal', args: { name: 'Car', category: 'other', target: 1000, accountId: c.account.id } });
        try {
            const done = events(await post(c, '/api/assistant/chat', { question: 'Create a goal' })).find(x => x.done);
            const prefs = require('../src/services/preferences'); prefs.updatePreferences(c.user.id, { assistantAutonomy: 'read_only' }); prefs.updatePreferences(c.user.id, { assistantAutonomy: 'confirm' });
            const result = await post(c, '/api/assistant/actions/' + done.action.token + '/confirm', {});
            assert.equal(result.status, 403);
            assert.equal(db.prepare('SELECT COUNT(*) AS n FROM demo_goals WHERE user_id=?').get(c.user.id).n, 0);
        } finally { Object.assign(ai, old); }
    });

    it('returns an autonomous action receipt even if saving its chat history fails', async () => {
        const c = await customer(); const ai = require('../src/services/assistant'); const chats = require('../src/services/assistant-chats');
        const old = { getStatus: ai.getStatus, planAction: ai.planAction }; const append = chats.appendMessage;
        require('../src/services/preferences').updatePreferences(c.user.id, { assistantAutonomy: 'autonomous' });
        ai.getStatus = async () => ({ available: true });
        ai.planAction = async () => ({ mode: 'action', tool: 'create_goal', args: { name: 'Car', category: 'other', target: 1000, accountId: c.account.id } });
        chats.appendMessage = (...args) => { if (args[2] === 'assistant') throw new Error('injected history failure'); return append(...args); };
        try {
            const frames = events(await post(c, '/api/assistant/chat', { question: 'Create a savings goal' }));
            assert.equal(frames.find(x => x.done).mode, 'action_executed');
            assert.equal(frames.some(x => x.error), false);
            assert.equal(db.prepare('SELECT COUNT(*) AS n FROM demo_goals WHERE user_id=?').get(c.user.id).n, 1);
        } finally { Object.assign(ai, old); chats.appendMessage = append; }
    });

    it('rotates existing authenticator secrets atomically and invalidates earlier sessions', async () => {
        const c = await customer(); const two = require('../src/services/two-factor');
        const previous = process.env.TWO_FACTOR_KEY; const previousFallback = process.env.TWO_FACTOR_PREVIOUS_KEY;
        process.env.TWO_FACTOR_KEY = 'audit-original-key';
        const secret = two.beginSetup(c.user.id, c.user.email).secret;
        const version = db.prepare('SELECT auth_version FROM users WHERE id=?').get(c.user.id).auth_version;
        try {
            const originalPayload = db.prepare('SELECT secret_encrypted FROM two_factor WHERE user_id=?').get(c.user.id).secret_encrypted;
            process.env.TWO_FACTOR_PREVIOUS_KEY = 'wrong-previous-key'; process.env.TWO_FACTOR_KEY = 'audit-replacement-key';
            assert.throws(() => two.rotateStoredSecrets(), /no secrets were changed/);
            assert.equal(db.prepare('SELECT secret_encrypted FROM two_factor WHERE user_id=?').get(c.user.id).secret_encrypted, originalPayload);
            assert.equal(db.prepare('SELECT auth_version FROM users WHERE id=?').get(c.user.id).auth_version, version);
            process.env.TWO_FACTOR_PREVIOUS_KEY = 'audit-original-key'; process.env.TWO_FACTOR_KEY = 'audit-replacement-key';
            assert.ok(two.rotateStoredSecrets().rotated >= 1);
            assert.equal(db.prepare('SELECT auth_version FROM users WHERE id=?').get(c.user.id).auth_version, version + 1);
            assert.equal(two.verify(c.user.id, two.totp(secret), { allowPending: true }), true);
            assert.equal(two.rotateStoredSecrets().rotated, 0);
        } finally {
            db.prepare('DELETE FROM two_factor WHERE user_id=?').run(c.user.id);
            if (previous === undefined) delete process.env.TWO_FACTOR_KEY; else process.env.TWO_FACTOR_KEY = previous;
            if (previousFallback === undefined) delete process.env.TWO_FACTOR_PREVIOUS_KEY; else process.env.TWO_FACTOR_PREVIOUS_KEY = previousFallback;
        }
    });

    it('applies the daily transfer limit through the AI service', async () => {
        const c = await customer();
        const target = require('../src/services/account').openAccount(c.user.id, { product: 'savings', requestKey: randomUUID(), demoAcknowledged: true }).account;
        await assert.rejects(require('../src/services/assistant-actions').execute(c.user.id, 'transfer', { fromAccountId: c.account.id, toAccountId: target.id, amount: 25001 }), error => error.code === 'limit');
        assert.equal(db.prepare('SELECT balance FROM accounts WHERE id=?').get(c.account.id).balance, 10000000);
    });

    it('respects Read only changes while the action planner is waiting', async () => {
        const c = await customer(); const ai = require('../src/services/assistant'); const prefs = require('../src/services/preferences');
        const old = { getStatus: ai.getStatus, planAction: ai.planAction, runActionTool: ai.runActionTool };
        let release, started; const waiting = new Promise(resolve => { started = resolve; }); let writes = 0;
        ai.getStatus = async () => ({ available: true });
        ai.planAction = () => { started(); return new Promise(resolve => { release = resolve; }); };
        ai.runActionTool = async () => { writes++; return {}; };
        prefs.updatePreferences(c.user.id, { assistantAutonomy: 'autonomous' });
        try {
            const response = post(c, '/api/assistant/chat', { question: 'transfer 1 dollar' }).then(x => x);
            await waiting; prefs.updatePreferences(c.user.id, { assistantAutonomy: 'read_only' });
            release({ mode: 'action', tool: 'transfer', args: {} });
            assert.match((await response).text, /action_blocked/); assert.equal(writes, 0);
        } finally { Object.assign(ai, old); }
    });

    it('rejects frozen accounts and competing FX requests after waiting for rates', async () => {
        const c = await customer(); const accounts = require('../src/services/account');
        const target = accounts.openAccount(c.user.id, { product: 'currency', currency: 'EUR', requestKey: randomUUID(), demoAcknowledged: true }).account;
        const market = require('../src/services/market-data'); const old = market.getFxRates; const rates = [];
        market.getFxRates = () => new Promise(resolve => rates.push(resolve));
        const fx = require('../src/services/fx');
        try {
            const frozen = fx.convertBetweenAccounts(c.user.id, { fromAccountId: c.account.id, toAccountId: target.id, amount: 20000 });
            db.prepare("UPDATE accounts SET status='frozen' WHERE id=?").run(c.account.id);
            rates.shift()([{ currency: 'EUR', perUsd: .9, usdPer: 1 / .9 }]);
            await assert.rejects(frozen, /still be active/);
            db.prepare("UPDATE accounts SET status='active' WHERE id=?").run(c.account.id);
            const pending = [1, 2].map(() => fx.convertBetweenAccounts(c.user.id, { fromAccountId: c.account.id, toAccountId: target.id, amount: 20000 }));
            rates.splice(0).forEach(resolve => resolve([{ currency: 'EUR', perUsd: .9, usdPer: 1 / .9 }]));
            const results = await Promise.allSettled(pending);
            assert.equal(results.filter(x => x.status === 'fulfilled').length, 1);
            assert.equal(results.find(x => x.status === 'rejected').reason.code, 'limit');
        } finally { market.getFxRates = old; }
    });

    it('blocks a trade when the account owner is suspended during a quote', async () => {
        const c = await customer(); const market = require('../src/services/market-data'); const old = market.getLatestQuote;
        let release, started; const waiting = new Promise(resolve => { started = resolve; });
        market.getLatestQuote = () => { started(); return new Promise(resolve => { release = resolve; }); };
        require('../src/services/demo-portfolio').moveCash(c.user.id, { accountId: c.account.id, direction: 'in', amount: 100 });
        try {
            const response = post(c, '/api/wealth/trades', { symbol: 'AAPL', side: 'buy', quantity: 1 }).then(x => x);
            await waiting; db.prepare("UPDATE users SET status='suspended' WHERE id=?").run(c.user.id);
            release({ price: 10 }); assert.notEqual((await response).status, 201);
            assert.equal(db.prepare('SELECT COUNT(*) AS n FROM demo_trades WHERE user_id=?').get(c.user.id).n, 0);
        } finally { market.getLatestQuote = old; }
    });

    it('invalidates pending MFA when the password is reset, before consuming another factor', async () => {
        const c = await customer(); const recovery = require('../src/services/recovery'); const two = require('../src/services/two-factor');
        const codes = await recovery.generateCodes(c.user.id, 'Audit1234');
        const secret = two.beginSetup(c.user.id, c.user.email).secret; two.confirmSetup(c.user.id, two.totp(secret));
        const pending = supertest.agent(app); const csrf = setup.csrfFrom((await pending.get('/login')).text);
        assert.equal((await pending.post('/auth/login').set('X-CSRF-Token', csrf).send({ email: c.user.email, password: 'Audit1234' })).body.twoFactorRequired, true);
        await recovery.resetPassword({ email: c.user.email, recoveryCode: codes.codes[0], newPassword: 'Changed1234' });
        const nextCsrf = setup.csrfFrom((await pending.get('/login')).text);
        const result = await pending.post('/auth/2fa').set('X-CSRF-Token', nextCsrf).send({ code: codes.codes[1] });
        assert.equal(result.status, 401); assert.equal(result.body.code, 'authorization_changed');
    });

    it('does not revive a pre-suspension session on reactivation', async () => {
        const c = await customer(); const admin = await setup.loginAgent(supertest, app, 'admin@willow.test', 'Admin123Test');
        assert.equal((await post(admin, '/api/admin/users/' + c.user.id + '/status', { status: 'suspended', reason: 'Audit test' })).status, 200);
        assert.equal((await post(admin, '/api/admin/users/' + c.user.id + '/status', { status: 'active' })).status, 200);
        assert.equal((await c.agent.get('/api/accounts')).status, 401);
    });

    it('replays duplicate financial requests, rejects changed bodies, and scopes keys by user', async () => {
        const c = await customer(); const key = randomUUID();
        const body = { accountId: c.account.id, amount: 100, requestKey: key };
        const first = await post(c, '/api/deposits', body); const retry = await post(c, '/api/deposits', body);
        assert.equal(first.status, 200); assert.equal(retry.headers['idempotency-replayed'], 'true');
        assert.equal(retry.body.reference, first.body.reference);
        assert.equal(db.prepare('SELECT balance FROM accounts WHERE id=?').get(c.account.id).balance, 10010000);
        assert.equal((await post(c, '/api/deposits', { ...body, amount: 101 })).status, 409);
        const other = await customer(); assert.equal((await post(other, '/api/deposits', { ...body, accountId: other.account.id })).status, 200);
    });

    it('returns the committed asset after an ancillary snapshot failure', async () => {
        const c = await customer(); const net = require('../src/services/networth'); const old = net.recordSnapshot;
        net.recordSnapshot = async () => { throw new Error('injected snapshot failure'); };
        try {
            const response = await post(c, '/api/networth/assets', { name: 'Bike', kind: 'vehicle', value: 100 });
            assert.equal(response.status, 201); assert.ok(response.body.asset);
        } finally { net.recordSnapshot = old; }
    });

    it('rejects malformed money, calendar dates and unbounded pagination', async () => {
        const c = await customer(); const portfolio = require('../src/services/demo-portfolio');
        for (const amount of [true, [], '1e3', '1.001']) assert.throws(() => portfolio.moveCash(c.user.id, { accountId: c.account.id, direction: 'in', amount }), /amount/);
        assert.equal((await c.agent.get('/api/notifications?limit=-1')).status, 400);
        require('../src/services/account').openAccount(c.user.id, { product: 'business', requestKey: randomUUID(), demoAcknowledged: true });
        assert.throws(() => require('../src/services/business').createInvoice(c.user.id, { customerName: 'Client', amount: 1, dueOn: '2027-02-30' }), /date/);
    });

    it('uses actual currency in action previews and exports all added owned domains', async () => {
        const c = await customer(); const target = require('../src/services/account').openAccount(c.user.id, { product: 'currency', currency: 'EUR', requestKey: randomUUID(), demoAcknowledged: true }).account;
        const preview = require('../src/services/assistant-actions').actionPreview(c.user.id, 'transfer', { fromAccountId: target.id, toAccountId: c.account.id, amount: 100 });
        assert.match(preview, /€100\.00/); assert.doesNotMatch(preview, /\$100/);
        const response = await c.agent.get('/api/security/export'); assert.equal(response.status, 200);
        for (const key of ['scheduledTransfers', 'preferences', 'assistantMessages', 'assistantConversations', 'businessInvoices', 'cryptoTransfers', 'watchlist', 'supportRequests']) assert.ok(Object.hasOwn(response.body, key), key);
        assert.doesNotMatch(JSON.stringify(response.body), /password_hash|secret_encrypted|code_hash/);
    });

    it('keeps recently active read-only guests and prevents shared caching of CSRF HTML', async () => {
        const c = await customer();
        db.prepare("UPDATE users SET is_guest=1, created_at=datetime('now', '-10 days'), last_active_at=NULL WHERE id=?").run(c.user.id);
        db.prepare("UPDATE audit_logs SET created_at=datetime('now', '-10 days') WHERE actor_id=?").run(c.user.id);
        assert.equal((await c.agent.get('/accounts')).status, 200);
        require('../src/services/guests').purgeStaleGuests(); assert.ok(db.prepare('SELECT id FROM users WHERE id=?').get(c.user.id));
        assert.equal((await supertest(app).get('/help')).headers['cache-control'], 'no-store');
    });

    it('preserves funded portfolios on upgrade and values received crypto in charts', async () => {
        const c = await customer(); const receiver = await customer(); const portfolio = require('../src/services/demo-portfolio');
        portfolio.moveCash(c.user.id, { accountId: c.account.id, direction: 'in', amount: 100 });
        db.prepare("INSERT INTO demo_holdings(user_id,symbol,quantity,average_price) VALUES (?, 'BTC', 1, 50000)").run(c.user.id);
        db.prepare("DELETE FROM app_meta WHERE key='fabricated_data_removed_v1'").run(); require('../src/services/data-cleanup').run();
        assert.equal(portfolio.getPortfolio(c.user.id).cashCents, 10000);
        require('../src/services/crypto-wallet').sendDemoCrypto(c.user.id, { symbol: 'BTC', quantity: .25, recipientEmail: receiver.user.email });
        const market = require('../src/services/market-data'); const old = market.getHistory;
        market.getHistory = async () => ({ points: [{ t: new Date().toISOString().slice(0, 10), close: 50000 }] });
        try { assert.equal((await portfolio.performance(receiver.user.id)).points.at(-1).v, 12500); }
        finally { market.getHistory = old; }
    });

    it('shows cash contributions on their dates rather than backfilling today’s cash', async () => {
        const c = await customer(); const portfolio = require('../src/services/demo-portfolio');
        portfolio.moveCash(c.user.id, { accountId: c.account.id, direction: 'in', amount: 100 });
        db.prepare("UPDATE demo_portfolios SET created_at=datetime('now', '-10 days') WHERE user_id=?").run(c.user.id);
        const chart = await portfolio.performance(c.user.id);
        assert.equal(chart.points[0].v, 0);
        assert.equal(chart.points.at(-1).v, 100);
    });
});
