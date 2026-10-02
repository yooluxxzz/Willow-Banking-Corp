const { it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { JSDOM } = require('jsdom');
const source = fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8');

/** Runs the shared client runtime against a real DOM with a controllable fetch and location. */
function client(fetch) {
    const dom = new JSDOM('<!DOCTYPE html><html><head><meta name="csrf-token" content="csrf-test"></head><body></body></html>');
    const messages = [];
    const context = {
        document: dom.window.document, Node: dom.window.Node, CustomEvent: dom.window.CustomEvent, navigator: dom.window.navigator,
        getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
        location: { href: '/settings', pathname: '/settings', search: '' }, fetch,
        setTimeout, clearTimeout, setInterval, clearInterval, console,
    };
    context.window = context;
    vm.createContext(context);
    vm.runInContext(source, context);
    context.showToast = message => messages.push(message);
    return { context, messages, close: () => dom.window.close() };
}

it('keeps the page visible on failed sign-out and allows a successful retry', async () => {
    const { context, messages, close } = client(async () => ({ ok: false, status: 500, json: async () => ({ error: 'Please retry sign-out.' }) }));
    await context.handleLogout();
    assert.equal(context.location.href, '/settings'); assert.equal(messages[0], 'Please retry sign-out.');
    context.fetch = async () => ({ ok: true, status: 200, json: async () => ({ success: true }) });
    await context.handleLogout();
    assert.equal(context.location.href, '/login?signedOut=success');
    close();
});

it('prevents duplicate sign-out requests and handles an already-ended session', async () => {
    let finish, calls = 0;
    const { context, close } = client(() => { calls++; return new Promise(resolve => { finish = resolve; }); });
    const first = context.handleLogout();
    await context.handleLogout(); assert.equal(calls, 1);
    finish({ status: 401, ok: false, json: async () => ({}) });
    await first;
    assert.equal(context.location.href, '/login?error=session_expired');
    close();
});

it('does not report successful sign-out for a network error or an invalid response', async () => {
    const { context, messages, close } = client(async () => { throw new Error('Connection lost'); });
    await context.handleLogout();
    assert.equal(context.location.href, '/settings'); assert.equal(messages.length, 1);
    context.fetch = async () => ({ ok: true, status: 200, json: async () => { throw new Error('HTML response'); } });
    await context.handleLogout();
    assert.equal(context.location.href, '/settings'); assert.equal(messages.length, 2);
    close();
});
