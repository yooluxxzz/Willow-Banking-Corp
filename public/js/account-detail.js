/* Willow account detail — rename and number reveal. */
'use strict';

(function (global) {
    const doc = global.document;
    const W = global.Willow;

    function setupRename() {
        const form = doc.getElementById('accountNameForm');
        if (!form) return;
        const status = doc.getElementById('accountNameStatus');
        form.addEventListener('submit', async event => {
            event.preventDefault();
            const button = form.querySelector('button[type="submit"]');
            button.classList.add('is-loading');
            button.disabled = true;
            status.hidden = true;
            try {
                const data = await W.api(`/api/accounts/${form.dataset.accountId}`, { method: 'PATCH', body: { nickname: form.elements.nickname.value } });
                doc.getElementById('accountName').textContent = data.account.displayName;
                doc.title = `${data.account.displayName} · Willow`;
                form.elements.nickname.value = data.account.nickname || '';
                status.className = 'form-status is-success';
                status.textContent = 'Saved.';
            } catch (error) {
                status.className = 'form-status is-error';
                status.textContent = error.message;
            } finally {
                status.hidden = false;
                button.classList.remove('is-loading');
                button.disabled = false;
            }
        });
    }

    function setupReveal() {
        const button = doc.querySelector('[data-reveal-number]');
        const number = doc.querySelector('[data-account-number]');
        if (!button || !number) return;
        const masked = number.textContent;
        button.addEventListener('click', () => {
            const show = button.getAttribute('aria-pressed') !== 'true';
            number.textContent = show ? number.dataset.full.replace(/(\d{4})(?=\d)/g, '$1 ') : masked;
            button.setAttribute('aria-pressed', String(show));
            button.textContent = show ? 'Hide' : 'Show';
        });
    }

    function init() {
        setupRename();
        setupReveal();
    }

    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
    else init();
})(window);
