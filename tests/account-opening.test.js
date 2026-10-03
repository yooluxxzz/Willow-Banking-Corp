const {describe,it,before,after}=require('node:test');
const assert=require('node:assert/strict');
const supertest=require('supertest');
const {randomUUID}=require('crypto');
const {createTestApp,registerAgent}=require('./setup');
describe('Optional demo account opening',()=>{
 let app,db,close,owner,other;
 const opened=[];
 const request=(auth,body,csrf=true)=>{const req=auth.agent.post('/api/accounts').set('Accept','application/json');if(csrf)req.set('X-CSRF-Token',auth.csrfToken);return req.send(body);};
 const payload=(product='checking')=>({product,requestKey:randomUUID(),demoAcknowledged:true});
 before(async()=>{const env=await createTestApp();app=env.app;db=env.getDb();close=env.closeDatabase;
 owner=await registerAgent(supertest,app,{email:'opening@example.test',password:'OpeningDemo123',fullName:'Opening Demo'});
 other=await registerAgent(supertest,app,{email:'opening-other@example.test',password:'OpeningDemo123',fullName:'Other Demo'});});
 after(()=>close());
 it('opens only one empty checking account at sign-up and renders the optional business selection',async()=>{
  const accounts=(await owner.agent.get('/api/accounts')).body.accounts;assert.equal(accounts.length,1);assert.equal(accounts[0].account_type,'checking');assert.equal(accounts[0].balance,0);assert.ok(accounts.every(a=>a.purpose==='personal'));
  assert.equal((await owner.agent.get('/api/cards')).body.cards.length,0,'no card until the customer orders one');
  const page=await owner.agent.get('/accounts/new?type=business');assert.equal(page.status,200);assert.match(page.text,/value="business" checked/);assert.match(page.text,/starts at \$0.00/);
  assert.match((await supertest(app).get('/accounts/new')).headers.location,/returnTo=/);
 });
 it('creates all three products at zero with correct labels, ownership and no automatic card',async()=>{
  for(const product of ['checking','savings','business']){const response=await request(owner,payload(product));assert.equal(response.status,201);const a=response.body.account;opened.push(a);assert.equal(a.balance,0);assert.equal(a.available_balance,0);assert.equal(a.purpose,product==='business'?'business':'personal');assert.equal(a.account_type,product==='savings'?'savings':'checking');assert.ok(!('opening_key' in a));assert.equal((await other.agent.get('/api/accounts/'+a.id)).status,404);}
  assert.equal(opened[2].displayName,'Business checking');assert.equal(new Set(opened.map(a=>a.account_number)).size,3);
  assert.equal((await owner.agent.get('/api/cards')).body.cards.length,0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action='account_opened'").get().n,3);
 });
 it('reuses a request key for retries and rejects a changed request',async()=>{
  const body={...payload('savings'),nickname:'Holiday plans'};
  const results=await Promise.all([request(owner,body),request(owner,body)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,201]);assert.equal(results[0].body.account.id,results[1].body.account.id);
  assert.equal((await request(owner,{...body,product:'business'})).status,400);
  const separate=await request(other,body);assert.equal(separate.status,201);assert.notEqual(separate.body.account.id,results[0].body.account.id);
 });
 it('rejects malformed inputs and missing CSRF without creating accounts',async()=>{
  const before=db.prepare('SELECT COUNT(*) AS n FROM accounts').get().n;
  for(const change of [{product:'loan'},{product:[]},{nickname:'x'.repeat(41)},{nickname:'<b>name</b>'},{nickname:{}},{demoAcknowledged:false},{requestKey:'bad'}])assert.equal((await request(owner,{...payload(),...change})).status,400);
  assert.equal((await request(owner,payload(),false)).status,403);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM accounts').get().n,before);
 });
 it('rolls back opening when auditing fails',async()=>{
  const before=db.prepare('SELECT COUNT(*) AS n FROM accounts').get().n;
  db.exec("CREATE TRIGGER opening_failure BEFORE INSERT ON audit_logs WHEN NEW.action='account_opened' BEGIN SELECT RAISE(ABORT,'Test audit failure'); END");
  try{assert.equal((await request(owner,payload())).status,500);}finally{db.exec('DROP TRIGGER opening_failure');}
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM accounts').get().n,before);
 });
 it('new business accounts participate in owned transfers and statements',async()=>{
  const deposit=await owner.agent.post('/api/deposits').set('X-CSRF-Token',owner.csrfToken).send({accountId:opened[0].id,amount:'25.00'});assert.equal(deposit.status,200);
  const transfer=await owner.agent.post('/api/transfers').set('X-CSRF-Token',owner.csrfToken).send({fromAccountId:opened[0].id,toAccountId:opened[2].id,amount:'7.00'});assert.equal(transfer.status,200);
  assert.equal((await owner.agent.get('/api/accounts/'+opened[2].id)).body.account.balance,700);
  const today=new Date().toISOString().slice(0,10);const statement=await owner.agent.get('/api/statements').query({accountId:opened[2].id,dateFrom:today,dateTo:today});assert.equal(statement.status,200);assert.equal(statement.body.statement.account.displayName,'Business checking');assert.equal(statement.body.statement.closingBalance,700);
 });
 it('limits each profile to ten accounts without affecting another profile',async()=>{
  const accounts=(await owner.agent.get('/api/accounts')).body.accounts;
  for(let i=accounts.length;i<10;i++)assert.equal((await request(owner,payload())).status,201);
  assert.equal((await request(owner,payload())).status,400);assert.equal((await owner.agent.get('/api/accounts')).body.accounts.length,10);
  assert.match((await owner.agent.get('/accounts/new')).text,/reached the demo account limit/);
  assert.equal((await request(other,payload())).status,201);
 });
});
