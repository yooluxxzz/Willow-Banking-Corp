const { it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const ejs = require('ejs');
const { JSDOM } = require('jsdom');

const waitFor = async check => {
    for (let i = 0; i < 50; i++) { if (check()) return; await new Promise(resolve => setTimeout(resolve, 20)); }
    assert.ok(check(), 'UI operation completed');
};

it('opens searchable history, renders verified balances, and restores New chat prompts', async () => {
    const markup = ejs.render(fs.readFileSync('views/partials/ask-panel.ejs', 'utf8'), { assistant: { available: false }, icon: () => '<svg aria-hidden="true"></svg>' });
    const dom = new JSDOM('<!doctype html><meta name="csrf-token" content="test"><button data-ask-open>Ask Willow</button>' + markup, { url: 'http://localhost', runScripts: 'outside-only', pretendToBeVisual: true });
    const { window } = dom;
    const frames = [{ delta: 'Your verified balance' }, { done: true, mode: 'quick', tool: 'accounts', conversationId: 1, data: { accounts: [{ name: 'Checking', last4: '1234', balance: '$123.45', available: '$120.00', currency: 'USD' }] } }];
    window.TextDecoder = TextDecoder;
    window.AbortController = AbortController;
    window.matchMedia = () => ({ matches: false, addEventListener() {} });
    window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
    window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
    window.fetch = async url => {
        if (url.startsWith('/api/assistant/status')) return Response.json({ available: false, autonomy: 'confirm' });
        if (url === '/api/assistant/conversations') return Response.json({ conversations: [{ id: 1, title: 'Funds check', last_question: 'Check funds', updated_at: new Date().toISOString() }, { id: 2, title: 'Budget help', last_question: 'Budget', updated_at: '2020-01-01 12:00:00' }] });
        if (url === '/api/assistant/chat') return new Response(frames.map(x => JSON.stringify(x)).join('\n') + '\n');
        return Response.json({});
    };
    try {
        await new Promise(resolve => window.addEventListener('load', resolve, { once: true }));
        window.eval(fs.readFileSync('public/js/app.js', 'utf8'));
        const doc = window.document;
        doc.querySelector('[data-ask-open]').click();
        await waitFor(() => doc.querySelectorAll('.ask-history-item').length === 2);
        doc.querySelector('[data-ask-history-toggle]').click();
        assert.equal(doc.querySelector('[data-ask-history]').hidden, false);
        assert.match(doc.querySelector('.ask-history-item:not([hidden])').textContent, /Funds check/);
        doc.querySelector('[data-ask-history-period="older"]').click();
        assert.match(doc.querySelector('.ask-history-item:not([hidden])').textContent, /Budget help/);
        doc.querySelector('[data-ask-history-period="recent"]').click();
        const search = doc.querySelector('[data-ask-history-search]'); search.value = 'funds'; search.dispatchEvent(new window.Event('input'));
        assert.equal(doc.querySelectorAll('.ask-history-item:not([hidden])').length, 1);
        doc.querySelector('[data-ask-history-close]').click();
        doc.querySelector('[data-ask-prompt]').click();
        await waitFor(() => doc.querySelector('.ask-balance-card'));
        assert.match(doc.querySelector('.ask-balance-card').textContent, /\$120\.00 USD/);
        await waitFor(() => !doc.querySelector('[data-ask-send]').disabled);
        doc.querySelector('[data-ask-new]').click();
        assert.ok(doc.querySelector('[data-ask-welcome]'));
        doc.querySelector('[data-ask-prompt]').click();
        await waitFor(() => doc.querySelector('.ask-balance-card'));
    } finally { dom.window.close(); }
});

it('saves autonomy with keyboard controls and ignores stale status responses', async () => {
    const markup = ejs.render(fs.readFileSync('views/partials/ask-panel.ejs', 'utf8'), { assistant: { available: false }, icon: () => '' });
    const dom = new JSDOM('<!doctype html><meta name="csrf-token" content="test">' + markup, { url: 'http://localhost', runScripts: 'outside-only' });
    const { window } = dom; let statusResponse; let rejectSave = false;
    window.fetch = async (url, options) => {
        if (url.startsWith('/api/assistant/status')) return new Promise(resolve => { statusResponse = resolve; });
        if (url === '/api/assistant/autonomy') return rejectSave ? Response.json({ error: 'Save failed' }, { status: 500 }) : Response.json({ autonomy: JSON.parse(options.body).autonomy });
        return Response.json({});
    };
    try {
        await new Promise(resolve => window.addEventListener('load', resolve, { once: true }));
        window.eval(fs.readFileSync('public/js/app.js', 'utf8'));
        const doc = window.document;
        doc.querySelector('[data-ask-autonomy-toggle]').click();
        assert.equal(doc.querySelector('[data-ask-autonomy]').hidden, false);
        doc.querySelector('[data-ask-history-period="older"]').click();
        assert.equal(doc.querySelector('[data-ask-autonomy]').hidden, true);
        doc.querySelector('[data-ask-autonomy-toggle]').click();
        assert.equal(doc.querySelector('[data-ask-history]').hidden, true);
        doc.querySelector('[data-ask-autonomy-value="read_only"]').click();
        await waitFor(() => doc.querySelector('[data-ask-autonomy-label]').textContent === 'Read only');
        statusResponse(Response.json({ available: false, autonomy: 'confirm' }));
        await new Promise(resolve => setTimeout(resolve, 20));
        assert.equal(doc.querySelector('[data-ask-autonomy-label]').textContent, 'Read only');
        assert.equal(doc.querySelector('[data-ask-autonomy-value="read_only"]').tabIndex, 0);
        doc.querySelector('[data-ask-autonomy-value="read_only"]').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        await waitFor(() => doc.querySelector('[data-ask-autonomy-label]').textContent === 'Ask first');
        rejectSave = true;
        doc.querySelector('[data-ask-autonomy-value="autonomous"]').click();
        await waitFor(() => doc.querySelector('[data-ask-autonomy-status]').textContent.includes('Save failed'));
        assert.equal(doc.querySelector('[data-ask-autonomy-value="confirm"]').getAttribute('aria-checked'), 'true');
        assert.equal(doc.querySelector('[data-ask-autonomy-value="autonomous"]').disabled, false);
    } finally { window.close(); }
});

it('reuses the financial request key after an uncertain network outcome', async () => {
    const dom = new JSDOM('<!doctype html><meta name="csrf-token" content="test">', { url: 'http://localhost', runScripts: 'outside-only' });
    const keys = []; let fail = true;
    dom.window.crypto.randomUUID = randomUUID;
    dom.window.fetch = async (url, options) => {
        keys.push(options.headers['Idempotency-Key']);
        if (fail) { fail = false; throw new Error('network interrupted'); }
        return Response.json({ success: true });
    };
    try {
        await new Promise(resolve => dom.window.addEventListener('load', resolve, { once: true }));
        dom.window.eval(fs.readFileSync('public/js/app.js', 'utf8'));
        const options = { method: 'POST', body: { amount: 100, accountId: 1 } };
        await assert.rejects(dom.window.Willow.api('/api/deposits', options));
        await dom.window.Willow.api('/api/deposits', options);
        await dom.window.Willow.api('/api/deposits', options);
        assert.ok(keys[0]); assert.equal(keys[0], keys[1]); assert.notEqual(keys[1], keys[2]);
    } finally { dom.window.close(); }
});

it('makes a failed or expired action approval terminal in the chat panel', async () => {
    const markup = ejs.render(fs.readFileSync('views/partials/ask-panel.ejs', 'utf8'), { assistant: { available: true, model: 'test' }, icon: () => '<svg aria-hidden="true"></svg>' });
    const dom = new JSDOM('<!doctype html><meta name="csrf-token" content="test"><button data-ask-open>Ask Willow</button>' + markup, { url: 'http://localhost', runScripts: 'outside-only', pretendToBeVisual: true });
    const { window } = dom; const timers = []; const timeout = window.setTimeout.bind(window);
    window.TextDecoder = TextDecoder; window.AbortController = AbortController;
    window.matchMedia = () => ({ matches: false, addEventListener() {} });
    window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
    window.setTimeout = (callback, delay, ...args) => { if (delay === 120000) timers.push(callback); return timeout(callback, delay, ...args); };
    window.fetch = async url => {
        if (url.startsWith('/api/assistant/status')) return Response.json({ available: true, autonomy: 'confirm' });
        if (url === '/api/assistant/conversations') return Response.json({ conversations: [] });
        if (url === '/api/assistant/chat') return new Response(JSON.stringify({ delta: 'Prepared.' }) + '\n' + JSON.stringify({ done: true, mode: 'action_pending', action: { tool: 'transfer', token: 'test-token', title: 'Move $10.00 to savings', expiresInSeconds: 120 } }) + '\n');
        if (url.endsWith('/confirm')) return Response.json({ error: 'Approval expired.' }, { status: 410 });
        return Response.json({});
    };
    try {
        await new Promise(resolve => window.addEventListener('load', resolve, { once: true }));
        window.eval(fs.readFileSync('public/js/app.js', 'utf8'));
        const doc = window.document; doc.querySelector('[data-ask-open]').click();
        const submit = () => { doc.querySelector('[data-ask-input], #askInput').value = 'Transfer $10 to savings'; doc.querySelector('[data-ask-form]').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); };
        submit(); await waitFor(() => doc.querySelector('.ask-action-card button'));
        assert.equal(doc.querySelector('.ask-action-card button').textContent, 'Confirm transfer');
        doc.querySelector('.ask-action-card button').click();
        await waitFor(() => !doc.querySelector('.ask-action-card button'));
        assert.match(doc.querySelector('.ask-action-card').textContent, /Approval expired.*Check your activity/);
        await waitFor(() => !doc.querySelector('[data-ask-send]').disabled);
        submit(); await waitFor(() => doc.querySelectorAll('.ask-action-card').length === 2);
        timers.at(-1)();
        const expired = doc.querySelectorAll('.ask-action-card')[1];
        assert.match(expired.textContent, /Expired.*new preview/);
        assert.ok([...expired.querySelectorAll('button')].every(button => button.disabled));
    } finally { window.close(); }
});
