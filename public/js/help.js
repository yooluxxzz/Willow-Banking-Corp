/* Willow Help center — instant search and the contact form. */
'use strict';

(function (global) {
    const doc = global.document;

    function setupSearch() {
        const input = doc.querySelector('[data-help-search]');
        const results = doc.querySelector('[data-help-results]');
        const source = doc.getElementById('helpIndex');
        if (!input || !results || !source) return;
        let index = [];
        try { index = JSON.parse(source.textContent); } catch (error) { index = []; }
        const { el } = global.Willow;
        const score = (item, terms) => terms.reduce((total, term) => total + (item.q.toLowerCase().includes(term) ? 3 : 0) + (item.t.toLowerCase().includes(term) ? 1 : 0) + (item.c.toLowerCase().includes(term) ? 1 : 0), 0);
        let timer = null;
        input.addEventListener('input', () => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                const query = input.value.trim().toLowerCase();
                if (query.length < 2) { results.replaceChildren(); return; }
                const terms = query.split(/\s+/).filter(term => term.length > 1);
                const matches = index.map(item => ({ item, score: score(item, terms) })).filter(entry => entry.score > 0).sort((a, b) => b.score - a.score).slice(0, 6);
                if (!matches.length) {
                    results.replaceChildren(el('div', { className: 'help-results-list' }, el('p', { className: 'help-empty', text: `No answers match “${input.value.trim()}”. Try different words, or send us a message below.` })));
                    return;
                }
                results.replaceChildren(
                    el('p', { className: 'visually-hidden', text: `${matches.length} answers found` }),
                    el('div', { className: 'help-results-list' }, matches.map(({ item }) => el('a', { href: `/help/${item.s}#${item.a}` }, el('small', { text: item.c }), item.q))));
            }, 120);
        });
        input.addEventListener('keydown', event => {
            if (event.key === 'Enter') {
                const first = results.querySelector('a');
                if (first) global.location.href = first.href;
            }
        });
    }

    function setupHashOpen() {
        const id = decodeURIComponent((global.location.hash || '').slice(1));
        if (!id) return;
        const target = doc.getElementById(id);
        if (target && target.tagName === 'DETAILS') {
            target.open = true;
            target.querySelector('summary').focus();
        }
    }

    function setupSupportForm() {
        const form = doc.querySelector('[data-support-form]');
        if (!form) return;
        const error = form.querySelector('[data-support-error]');
        const success = form.querySelector('[data-support-success]');
        form.addEventListener('submit', async event => {
            event.preventDefault();
            error.hidden = true;
            success.hidden = true;
            if (!form.reportValidity()) return;
            const button = form.querySelector('button[type="submit"]');
            button.classList.add('is-loading');
            try {
                const data = Object.fromEntries(new FormData(form));
                const result = await global.Willow.api('/api/support', { method: 'POST', body: data });
                form.querySelector('[data-support-success-text]').textContent = `Saved with reference ${result.reference}. ${result.message}`;
                success.hidden = false;
                form.querySelector('textarea').value = '';
            } catch (err) {
                error.textContent = err.message;
                error.hidden = false;
            } finally {
                button.classList.remove('is-loading');
            }
        });
    }

    const init = () => { setupSearch(); setupHashOpen(); setupSupportForm(); };
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
    else init();
})(window);
