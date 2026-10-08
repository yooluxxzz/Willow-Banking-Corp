const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const supertest = require('supertest');
const { createTestApp, registerAgent } = require('./setup');

/**
 * Ask Willow without a language model: questions are matched to a topic and
 * answered from the customer's own records, with the same figures the pages show.
 */
describe('Ask Willow quick answers (no Ollama)', () => {
    let app, db, close, quick, owner, userId;
    const post = (url, body) => owner.agent.post(url).set('X-CSRF-Token', owner.csrfToken).set('Accept', 'application/json').send(body);

    before(async () => {
        const env = await createTestApp(); app = env.app; db = env.getDb(); close = env.closeDatabase;
        quick = require('../src/services/quick-answers');
        owner = await registerAgent(supertest, app, { email: 'quick@example.test', password: 'QuickDemo123', fullName: 'Quinn Quick' });
        userId = db.prepare('SELECT id FROM users WHERE email = ?').get('quick@example.test').id;
        const checking = db.prepare('SELECT id FROM accounts WHERE user_id = ?').get(userId).id;
        assert.equal((await post('/api/deposits', { accountId: checking, amount: '2000', description: 'Salary' })).status, 200);
        assert.equal((await post('/api/withdrawals', { accountId: checking, amount: '180', description: 'Weekly shop', category: 'groceries' })).status, 200);
        assert.equal((await post('/api/budgets', { scope: 'personal', name: 'Groceries', category: 'groceries', period: 'monthly', limit: '200' })).status, 201);
        assert.equal((await post('/api/debts', { name: 'Store card', kind: 'credit_card', balance: '600', rate: '29.9', minimum: '25' })).status, 201);
        assert.equal((await post('/api/debts', { name: 'Car loan', kind: 'auto', balance: '4000', rate: '6.5', minimum: '150' })).status, 201);
    });
    after(() => close());

    it('matches the suggested questions to the right topics', () => {
        const cases = {
            'How much have I spent this month?': 'spending',
            'Am I on track with my budgets?': 'budgets',
            'What is my net worth made of?': 'networth',
            'Which debt should I pay off first?': 'debts',
            'Any tips for my money?': 'tips',
            'Summarize my last 10 transactions.': 'recent',
            'How much money do I have?': 'balances',
            'How is my business doing this month?': 'business',
            'How much came in this month?': 'income',
            'Is my emergency fund big enough?': 'savings',
            'What is coming up next week?': 'upcoming',
            'How are my investments doing?': 'investing',
        };
        for (const [question, topic] of Object.entries(cases)) assert.equal(quick.topicOf(question), topic, question);
        assert.equal(quick.topicOf('Tell me a joke'), null);
    });

    it('answers with the customer’s real figures', async () => {
        const spending = (await quick.answer(userId, 'How much have I spent this month?')).text;
        assert.match(spending, /spent \$180\.00 across 1 payment/);
        assert.match(spending, /groceries \$180\.00 \(100%\)/);
        const budgets = (await quick.answer(userId, 'Am I on track with my budgets?')).text;
        assert.match(budgets, /1 budget: 0 on track, 1 close to the limit and 0 over/);
        assert.match(budgets, /Groceries: \$180\.00 of \$200\.00 this month — \$20\.00 left/);
        const balances = (await quick.answer(userId, 'How much money do I have?')).text;
        assert.match(balances, /balance \$1,820\.00; available \$1,820\.00/);
        const worth = (await quick.answer(userId, 'What is my net worth?')).text;
        assert.match(worth, /net worth is -\$2,780\.00: you own \$1,820\.00 and owe \$4,600\.00/);
    });

    it('explains the idea behind the numbers without giving advice', async () => {
        const debts = (await quick.answer(userId, 'Which debt should I pay off first?')).text;
        assert.match(debts, /You owe \$4,600\.00 across 2 debts/);
        assert.match(debts, /avalanche.*snowball.*both point to Store card: it has the highest rate \(29\.9%\) and the smallest balance/s);
        const tips = (await quick.answer(userId, 'Any tips for my money?')).text;
        assert.match(tips, /information, not advice/);
        assert.match(tips, /Store card has the highest interest rate \(29\.9% APR\)/);
    });

    it('gives the headline figures and what it can answer for other questions', async () => {
        const reply = await quick.answer(userId, 'Tell me a joke');
        assert.equal(reply.topic, null);
        assert.match(reply.text, /\$1,820\.00/);
        assert.match(reply.text, /I can answer questions about your spending/);
    });

    it('never uses another customer’s records', async () => {
        const stranger = await registerAgent(supertest, app, { email: 'quick-other@example.test', password: 'QuickDemo123', fullName: 'Other Person' });
        assert.ok(stranger);
        const strangerId = db.prepare('SELECT id FROM users WHERE email = ?').get('quick-other@example.test').id;
        const text = (await quick.answer(strangerId, 'How much have I spent this month?')).text;
        assert.match(text, /haven’t spent anything/);
        assert.doesNotMatch((await quick.answer(strangerId, 'Which debt should I pay off first?')).text, /Store card/);
    });
});
