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
                doc.querySelector(`[data-payee-row="${button.dataset.removePayee}"]`).remove();
                doc.querySelector('[data-payee-count]').textContent = `${payees.length} saved`;
                doc.querySelector('[data-payee-empty]').hidden = Boolean(payees.length);
                W.showToast('Payee removed.', 'success');
            } catch (error) {
                W.showToast(error.message, 'error');
            }
        }));
    }

    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
    else init();
})(window);
