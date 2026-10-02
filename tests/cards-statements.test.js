const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const supertest = require('supertest');
const { createTestApp, registerAgent } = require('./setup');
const { generateStatementPDF } = require('../src/services/statement');

describe('Demo cards and accurate statements', () => {
    let app, db, close, owner, other, card, foreign, accountId;
    const post = (path, body = {}, csrf = true) => {
        const request = owner.agent.post(path).set('Accept','application/json');
        if (csrf) request.set('X-CSRF-Token',owner.csrfToken);
        return request.send(body);
    };
    before(async () => {
        const env = await createTestApp(); app = env.app; db = env.getDb(); close = env.closeDatabase;
        owner = await registerAgent(supertest, app, {email:'cards@example.test', password:'CardDemo123', fullName:'Card Demo Customer'});
        other = await registerAgent(supertest, app, {email:'separate-cards@example.test', password:'CardDemo123', fullName:'Other Demo Customer'});
        [card] = (await owner.agent.get('/api/cards')).body.cards;
        [foreign] = (await other.agent.get('/api/cards')).body.cards;
        accountId = card.account_id;
        db.prepare('UPDATE accounts SET nickname = ?, balance = 15000, available_balance = 15000 WHERE id = ?').run('Everyday demo',accountId);
        const insert = db.prepare('INSERT INTO transactions (reference,account_id,type,amount,direction,status,description,created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        for(const [ref,amount,direction,status,time] of [
            ['BEFORE',3000,'credit','completed','2026-09-29 12:00:00'],
            ['DEBIT',1000,'debit','completed','2026-09-30 12:00:00'],
            ['CREDIT',2000,'credit','completed','2026-09-30 23:59:59'],
            ['PENDING',50000,'credit','pending','2026-09-30 12:00:00'],
            ['FAILED',50000,'debit','failed','2026-09-29 12:00:00'],
            ['AFTER',4000,'credit','completed','2026-10-01 12:00:00']
        ]) insert.run(ref,accountId,direction === 'credit' ? 'deposit' : 'withdrawal',amount,direction,status,'Demo '+ref,time);
    });
    after(() => close());
    it('renders named cards, clear demo labeling and owner-specific statement links', async () => {
        const cards = await owner.agent.get('/cards'); assert.equal(cards.status,200); assert.match(cards.text,/Everyday demo/); assert.match(cards.text,/No live payments/); assert.match(cards.text,/cardReview/);
        assert.match((await owner.agent.get('/accounts/'+accountId)).text,new RegExp('/statements\\?accountId='+accountId));
        const statements = await owner.agent.get('/statements?accountId='+accountId); assert.equal(statements.status,200); assert.match(statements.text,/Everyday demo/);
        assert.equal((await owner.agent.get('/statements?accountId='+foreign.account_id)).status,404);
    });
    it('rejects malformed card IDs, cross-user changes and missing CSRF', async () => {
        for(const id of ['1x','0','-1','1.5','99999999999999999999']) assert.equal((await post('/api/cards/'+id+'/status',{status:'frozen'})).status,400);
        assert.equal((await post('/api/cards/'+card.id+'/status',{status:'frozen'},false)).status,403);
        assert.equal((await post('/api/cards/'+foreign.id+'/status',{status:'frozen'})).status,400);
        assert.equal((await post('/api/cards/'+foreign.id+'/replace')).status,400);
        assert.equal(db.prepare('SELECT status FROM cards WHERE id = ?').get(foreign.id).status,'active');
    });
    it('supports freeze/unfreeze/report and prevents reactivating a lost card', async () => {
        for(const status of ['frozen','active','reported']) assert.equal((await post('/api/cards/'+card.id+'/status',{status})).status,200);
        assert.equal((await post('/api/cards/'+card.id+'/status',{status:'active'})).status,400);
        assert.equal(db.prepare('SELECT status FROM cards WHERE id = ?').get(card.id).status,'reported');
    });
    it('creates exactly one replacement even when requests are repeated concurrently', async () => {
        const results = await Promise.all([post('/api/cards/'+card.id+'/replace'),post('/api/cards/'+card.id+'/replace')]);
        assert.deepEqual(results.map(r=>r.status).sort(),[200,400]);
        const result = results.find(r=>r.status===200); assert.equal(result.body.simulated,true);
        assert.notEqual(result.body.card.last_four,card.last_four);
        assert.equal(db.prepare('SELECT COUNT(*) AS n FROM cards WHERE account_id = ?').get(accountId).n,2);
        assert.equal(db.prepare('SELECT status FROM cards WHERE id = ?').get(card.id).status,'cancelled');
        card = result.body.card;
    });
    it('rolls back cancellation when replacement creation fails and blocks inactive accounts', async () => {
        await post('/api/cards/'+card.id+'/status',{status:'frozen'});
        db.exec("CREATE TRIGGER fail_replacement BEFORE INSERT ON cards BEGIN SELECT RAISE(ABORT, 'Test replacement failure'); END");
        try { assert.equal((await post('/api/cards/'+card.id+'/replace')).status,500); }
        finally { db.exec('DROP TRIGGER fail_replacement'); }
        assert.equal(db.prepare('SELECT status FROM cards WHERE id = ?').get(card.id).status,'frozen');
        db.prepare("UPDATE accounts SET status = 'frozen' WHERE id = ?").run(accountId);
        assert.equal((await post('/api/cards/'+card.id+'/replace')).status,400);
        assert.equal((await post('/api/cards/'+card.id+'/status',{status:'active'})).status,400);
        db.prepare("UPDATE accounts SET status = 'active' WHERE id = ?").run(accountId);
    });
    it('reconstructs opening and closing balances from completed entries and preserves the initial balance', async () => {
        const result = await owner.agent.get('/api/statements').query({accountId,dateFrom:'2026-09-30',dateTo:'2026-09-30'});
        assert.equal(result.status,200); assert.match(result.headers['cache-control'],/no-store/);
        const s = result.body.statement; assert.equal(s.openingBalance,10000); assert.equal(s.closingBalance,11000);
        assert.deepEqual(s.transactions.map(t=>t.reference),['DEBIT','CREDIT']); assert.deepEqual(s.transactions.map(t=>t.runningBalance),[9000,11000]);
        assert.equal(s.totalCreditsFormatted,'$20.00'); assert.equal(s.totalDebitsFormatted,'$10.00');
        const empty = await owner.agent.get('/api/statements').query({accountId,dateFrom:'2026-09-01',dateTo:'2026-09-01'});
        assert.equal(empty.body.statement.openingBalance,7000); assert.equal(empty.body.statement.closingBalance,7000); assert.equal(empty.body.statement.transactions.length,0);
    });
    it('validates date ranges and ownership equally for previews and downloads', async () => {
        for(const route of ['/api/statements','/api/statements/download']) {
            for(const query of [{accountId:'1x'},{dateFrom:'2026-02-30'},{dateTo:'2026-09-29'},{dateFrom:'2024-01-01'},{dateFrom:['2026-09-30','2026-10-01']},{accountId:foreign.account_id}]) {
                const response = await owner.agent.get(route).query({accountId,dateFrom:'2026-09-30',dateTo:'2026-09-30',...query}); assert.equal(response.status,400,JSON.stringify(query));
            }
        }
    });
    it('returns a real PDF download with no-store and a safe filename', async () => {
        const response = await owner.agent.get('/api/statements/download').query({accountId,dateFrom:'2026-09-30',dateTo:'2026-09-30'});
        assert.equal(response.status,200); assert.match(response.headers['content-type'],/application\/pdf/); assert.match(response.headers['content-disposition'],/2026-09-30/); assert.match(response.headers['cache-control'],/no-store/);
        assert.equal(response.body.subarray(0,5).toString(),'%PDF-');
    });
    it('generates a multipage sample with long descriptions and references for PDF review', async () => {
        const data = (await owner.agent.get('/api/statements').query({accountId,dateFrom:'2026-09-30',dateTo:'2026-09-30'})).body.statement;
        data.transactions = Array.from({length:45},(_,i)=>({...data.transactions[i%2],reference:'DEMO-LONG-REFERENCE-'+String(i+1).padStart(4,'0'),description:i%5===0 ? 'A long demonstration description that wraps across several lines without covering the amount or running balance. All values on this sample are simulated.' : 'Everyday demo transaction '+(i+1)}));
        const { formatCurrency } = require('../src/middleware/validation');
        let balance = data.openingBalance, credits = 0, debits = 0;
        for (const txn of data.transactions) {
            txn.created_at = '2026-09-30 12:00:00';
            if (txn.direction === 'credit') { credits += txn.amount; balance += txn.amount; }
            else { debits += txn.amount; balance -= txn.amount; }
            txn.runningBalance = balance; txn.runningBalanceFormatted = formatCurrency(balance);
        }
        data.closingBalance = balance; data.closingBalanceFormatted = formatCurrency(balance);
        data.totalCreditsFormatted = formatCurrency(credits); data.totalDebitsFormatted = formatCurrency(debits);
        const pdf = await generateStatementPDF(data); assert.ok(pdf.length > 3000);
        if(process.env.WILLOW_STATEMENT_SAMPLE) require('fs').writeFileSync(process.env.WILLOW_STATEMENT_SAMPLE,pdf);
    });
});
