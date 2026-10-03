const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const source = fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8');

async function page(body) {
    const dom = new JSDOM(`<!DOCTYPE html><html><head><meta name="csrf-token" content="t"></head><body>${body}</body></html>`, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
    dom.window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
    dom.window.fetch = async () => ({ ok: true, status: 200, json: async () => ({}) });
    const ready = new Promise(resolve => dom.window.addEventListener('DOMContentLoaded', resolve));
    dom.window.eval(source);
    await ready;
    return dom.window;
}

describe('Forms that send money or records', () => {
    it('ignore a second submit (for example pressing Enter again) while the first is still being sent', async () => {
        const window = await page('<form id="pay"><input name="amount"><button type="submit">Pay</button></form>');
        const form = window.document.getElementById('pay');
        let sent = 0;
        let finish;
        form.addEventListener('submit', async event => {
            event.preventDefault();
            const button = form.querySelector('[type="submit"]');
            button.classList.add('is-loading');
            sent += 1;
            await new Promise(resolve => { finish = resolve; });
            button.classList.remove('is-loading');
        });
        const submit = () => form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
        submit();
        submit();
        submit();
        assert.equal(sent, 1, 'only the first submit is sent while it is in flight');
        finish();
        await new Promise(resolve => setTimeout(resolve, 0));
        submit();
        assert.equal(sent, 2, 'once it has finished, the form can be used again');
    });

    it('also respects forms marked aria-busy', async () => {
        const window = await page('<form id="quick" aria-busy="true"><button type="submit">Add</button></form>');
        let sent = 0;
        const form = window.document.getElementById('quick');
        form.addEventListener('submit', event => { event.preventDefault(); sent += 1; });
        form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
        assert.equal(sent, 0);
    });
});
