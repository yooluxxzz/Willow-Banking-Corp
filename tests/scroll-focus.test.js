const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const source = fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8');

/**
 * Runs the shared client runtime on a page whose layout is described by data-top
 * (pixels from the top of an 800px-tall window), with stand-in IntersectionObservers
 * the test drives by hand: approach() brings a section just below the window,
 * scrollTo() brings it into view.
 */
async function page(body, { reduced = false, webdriver = false } = {}) {
    const dom = new JSDOM(`<!DOCTYPE html><html><head><meta name="csrf-token" content="t"></head><body>${body}</body></html>`, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
    const { window } = dom;
    const observers = [];
    window.innerHeight = 800;
    Object.defineProperty(window.navigator, 'webdriver', { value: webdriver, configurable: true });
    window.matchMedia = query => ({ matches: reduced && /reduced-motion/.test(query), addEventListener() {}, removeEventListener() {} });
    window.fetch = async () => ({ ok: true, status: 200, json: async () => ({}) });
    window.IntersectionObserver = class {
        constructor(callback, options = {}) { this.callback = callback; this.margin = options.rootMargin || ''; this.nodes = new Set(); observers.push(this); }
        observe(node) { this.nodes.add(node); }
        unobserve(node) { this.nodes.delete(node); }
        disconnect() { this.nodes.clear(); }
    };
    const top = node => { for (let n = node; n && n.dataset; n = n.parentElement) if (n.dataset.top) return Number(n.dataset.top); return 0; };
    let scrolled = 0;
    window.Element.prototype.getClientRects = function () { return [{}]; };
    window.Element.prototype.getBoundingClientRect = function () { const t = top(this) - scrolled; return { top: t, bottom: t + 300, left: 0, right: 1000, width: 1000, height: 300 }; };
    const ready = new Promise(resolve => window.addEventListener('DOMContentLoaded', resolve));
    window.eval(source);
    await ready;
    const notify = (node, which) => observers.filter(o => o.nodes.has(node) && which(o)).forEach(o => o.callback([{ target: node, isIntersecting: true, boundingClientRect: node.getBoundingClientRect() }]));
    const moveTo = (node, at) => { scrolled += node.getBoundingClientRect().top - at; };
    return {
        window,
        doc: window.document,
        /** The person scrolls until the section is just below the window. */
        approach: async node => {
            moveTo(node, 900);
            window.dispatchEvent(new window.Event('scroll'));
            await new Promise(resolve => window.requestAnimationFrame(() => resolve()));
        },
        /** The section is in view. */
        scrollTo: node => { moveTo(node, 300); notify(node, () => true); },
        animationEnd: node => node.dispatchEvent(new window.Event('animationend', { bubbles: true })),
    };
}

const tick = ms => new Promise(resolve => setTimeout(resolve, ms));
const publicPage = `<main>
    <section class="page-hero" data-top="0"><h1>Top</h1></section>
    <section class="section" id="story" data-top="1400" style="padding-top:64px"><h2>Story</h2><p>Copy</p><a href="#x" id="link">Link</a></section>
    <section class="section" id="cards" data-top="2400" style="padding-top:64px"><div class="card">One</div><div class="card">Two</div></section>
</main>`;

describe('Scroll focus', () => {
    it('never hides content up front: a screenshot or an unscrolled page shows everything', async () => {
        const { doc } = await page(publicPage);
        assert.equal(doc.querySelectorAll('.focus-pending, .focus-enter').length, 0);
    });

    it('fades public sections in as they arrive, then washes them and glows their heading', async () => {
        const { doc, approach, scrollTo, animationEnd } = await page(publicPage);
        const [hero, story, cards] = doc.querySelectorAll('main > section');
        assert.equal(hero.className, 'page-hero', 'what is on screen at load is left alone');

        await approach(story);
        assert.ok(story.classList.contains('focus-pending'), 'made transparent only while still below the window');
        scrollTo(story);
        assert.ok(!story.classList.contains('focus-pending'));
        assert.ok(story.classList.contains('focus-enter'), 'it fades in when reached');
        animationEnd(story);
        assert.ok(!story.classList.contains('focus-enter'));
        assert.ok(story.classList.contains('is-spotlit'), 'then a soft wash fades in and out');
        assert.ok(story.querySelector('h2').classList.contains('is-attention-text'), 'and its heading glows');
        animationEnd(story);
        assert.ok(!story.classList.contains('is-spotlit'), 'the wash is removed when it has faded out');

        await approach(cards);
        scrollTo(cards);
        animationEnd(cards);
        await tick(150);
        assert.equal(cards.querySelectorAll('.card.is-attention').length, 2, 'a section without a heading glows its cards instead');
    });

    it('shows a waiting section at once when keyboard focus moves into it', async () => {
        const { doc, window, approach } = await page(publicPage);
        const story = doc.getElementById('story');
        await approach(story);
        assert.ok(story.classList.contains('focus-pending'));
        doc.getElementById('link').dispatchEvent(new window.FocusEvent('focusin', { bubbles: true }));
        assert.ok(!story.classList.contains('focus-pending'));
    });

    it('fades app cards in one after another and glows the ones reached by scrolling', async () => {
        const { doc, approach, scrollTo, animationEnd } = await page(`<div data-app><div class="app-content">
            <header class="page-head" data-top="0"><h1>Net worth</h1></header>
            <div class="layout-halves" data-top="100">
                <section class="panel" id="own" style="border:1px solid #ccc">Own</section>
                <section class="panel" id="owe" style="border:1px solid #ccc">Owe</section>
            </div>
            <div class="col-stack">
                <section class="panel" id="assets" data-top="1600" style="border:1px solid #ccc">Assets</section>
            </div>
            <p class="disclosure-note" data-top="2600">Note</p>
            <footer class="app-footnote" data-top="3000" style="border-top:1px solid #ccc">Demo bank</footer>
        </div></div>`);
        const own = doc.getElementById('own');
        const assets = doc.getElementById('assets');
        const note = doc.querySelector('.disclosure-note');
        assert.ok(!doc.querySelector('.page-head').classList.contains('focus-enter'), 'the page title never moves');
        assert.ok(own.classList.contains('focus-enter'), 'cards on screen fade in at load');
        assert.ok(own.classList.contains('is-quick'), 'with a short fade so the page feels instant');
        assert.equal(doc.getElementById('owe').style.getPropertyValue('--focus-delay'), '45ms', 'one after another');
        animationEnd(own);
        assert.ok(!own.classList.contains('is-attention'), 'cards seen at load only fade in');

        await approach(assets);
        scrollTo(assets);
        animationEnd(assets);
        assert.ok(assets.classList.contains('is-attention'), 'a card reached by scrolling glows after fading in');
        await approach(note);
        scrollTo(note);
        animationEnd(note);
        assert.ok(!note.classList.contains('is-attention'), 'text without a card only fades in');
        assert.ok(!note.classList.contains('focus-pending'));
        assert.equal(doc.querySelector('footer').className, 'app-footnote', 'the page footer is never animated');
    });

    it('stays still with reduced motion and in automated browsers', async () => {
        for (const options of [{ reduced: true }, { webdriver: true }]) {
            const { doc, approach } = await page(publicPage, options);
            await approach(doc.getElementById('story'));
            assert.equal(doc.querySelectorAll('.focus-pending, .focus-enter').length, 0, JSON.stringify(options));
        }
    });
});
