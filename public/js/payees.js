/* Willow payees — add and remove saved recipients. */
'use strict';

(function (global) {
    const doc = global.document;
    const W = global.Willow;

    function init() {
        const form = doc.getElementById('payeeForm');
        if (!form) return;
        const error = form.querySelector('[data-payee-error]');
        form.addEventListener('submit', async event => {
            event.preventDefault();
            error.hidden = true;
            const button = form.querySelector('[type="submit"]');
            button.classList.add('is-loading');
            try {
                await W.api('/api/payees', { method: 'POST', body: { email: form.elements.email.value.trim(), nickname: form.elements.nickname.value.trim() } });
                W.showToast('Payee saved.', 'success');
                global.location.reload();
            } catch (err) {
                error.textContent = err.message;
                error.hidden = false;
                button.classList.remove('is-loading');
            }
        });
        doc.querySelectorAll('[data-remove-payee]').forEach(button => button.addEventListener('click', async () => {
            const ok = await W.showConfirm(`${button.dataset.payeeName} will be removed from your payees. Past payments stay in your history.`, 'Remove payee?', { confirmLabel: 'Remove', danger: true });
            if (!ok) return;
            try {
                const { payees } = await W.api(`/api/payees/${button.dataset.removePayee}`, { method: 'DELETE' });
                const row = doc.querySelector(`[data-payee-row="${button.dataset.removePayee}"]`);
                // Keep keyboard focus nearby instead of dropping it to the top of the page.
                const next = row.nextElementSibling || row.previousElementSibling;
                row.remove();
                let target = next && next.querySelector('[data-remove-payee], a, button');
                if (!target) {
                    target = doc.getElementById('payeesTitle');
                    if (target) target.setAttribute('tabindex', '-1');
                }
                if (target) target.focus();
                doc.querySelector('[data-payee-count]').textContent = `${payees.length} saved`;
                doc.querySelector('[data-payee-empty]').hidden = Boolean(payees.length);
                W.showToast('Payee removed.', 'success');
            } catch (failure) {
                W.showToast(failure.message, 'error');
            }
        }));
    }

    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
    else init();
})(window);
