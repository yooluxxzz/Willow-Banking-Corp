/* Willow Security center — two-step verification, sessions, cards and privacy. */
'use strict';

(function (global) {
    const doc = global.document;
    const W = global.Willow;

    function showError(node, message) {
        node.textContent = message;
        node.hidden = !message;
    }

    function setupTwoFactor() {
        const setup = doc.getElementById('tfSetup');
        const disable = doc.getElementById('tfDisable');
        const enableButton = doc.querySelector('[data-tf-enable]');
        const disableButton = doc.querySelector('[data-tf-disable]');
        if (enableButton) {
            const code = doc.getElementById('tfCode');
            const error = setup.querySelector('[data-tf-error]');
            enableButton.addEventListener('click', async () => {
                showError(error, '');
                code.value = '';
                W.openDialog(setup);
                try {
                    const result = await W.api('/api/security/2fa/setup', { method: 'POST', body: {} });
                    const holder = setup.querySelector('[data-tf-qr]');
                    holder.innerHTML = result.qrSvg;
                    const svg = holder.querySelector('svg');
                    if (svg) { svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'QR code for your authenticator app'); }
                    setup.querySelector('[data-tf-secret]').textContent = result.secret;
                    code.focus();
                } catch (err) {
                    showError(error, err.message);
                }
            });
            code.addEventListener('input', () => { code.value = code.value.replace(/\D/g, '').slice(0, 6); });
            setup.querySelector('[data-tf-confirm]').addEventListener('click', async event => {
                const button = event.currentTarget;
                if (!/^\d{6}$/.test(code.value)) { showError(error, 'Enter the six-digit code from your app.'); code.focus(); return; }
                button.classList.add('is-loading');
                try {
                    await W.api('/api/security/2fa/confirm', { method: 'POST', body: { code: code.value } });
                    W.closeDialog(setup);
                    W.showToast('Two-step verification is on.', 'success');
                    global.setTimeout(() => global.location.reload(), 700);
                } catch (err) {
                    showError(error, err.message);
                    code.select();
                } finally {
                    button.classList.remove('is-loading');
                }
            });
        }
        if (disableButton) {
            const error = disable.querySelector('[data-tf-disable-error]');
            disableButton.addEventListener('click', () => { showError(error, ''); W.openDialog(disable); doc.getElementById('tfPassword').focus(); });
            disable.querySelector('[data-tf-disable-confirm]').addEventListener('click', async event => {
                const button = event.currentTarget;
                button.classList.add('is-loading');
                try {
                    await W.api('/api/security/2fa/disable', { method: 'POST', body: { currentPassword: doc.getElementById('tfPassword').value, code: doc.getElementById('tfDisableCode').value.trim() } });
                    W.closeDialog(disable);
                    W.showToast('Two-step verification is off.', 'success');
                    global.setTimeout(() => global.location.reload(), 700);
                } catch (err) {
                    showError(error, err.message);
                } finally {
                    button.classList.remove('is-loading');
                }
            });
        }
    }

    function setupSessions() {
        const feedback = doc.getElementById('sessionFeedback');
        const report = (message, isError) => {
            feedback.textContent = message;
            feedback.className = `form-status mt-3 ${isError ? 'is-error' : 'is-success'}`;
            feedback.hidden = false;
            feedback.focus();
        };
        doc.querySelectorAll('[data-revoke-session]').forEach(button => button.addEventListener('click', async () => {
            button.classList.add('is-loading');
            button.disabled = true;
            try {
                await W.api(`/auth/sessions/${button.dataset.revokeSession}/revoke`, { method: 'POST' });
                button.closest('.session-row').remove();
                report('Session signed out. This session stays active.', false);
            } catch (error) {
                report(error.message, true);
                button.classList.remove('is-loading');
                button.disabled = false;
            }
        }));
        const dialog = doc.getElementById('revokeOthers');
        const open = doc.querySelector('[data-revoke-others]');
        if (!open || !dialog) return;
        const error = dialog.querySelector('[data-revoke-error]');
        open.addEventListener('click', () => { showError(error, ''); W.openDialog(dialog); doc.getElementById('revokePassword').focus(); });
        dialog.querySelector('[data-revoke-confirm]').addEventListener('click', async event => {
            const button = event.currentTarget;
            button.classList.add('is-loading');
            try {
                const result = await W.api('/auth/revoke-other-sessions', { method: 'POST', body: { currentPassword: doc.getElementById('revokePassword').value } });
                W.closeDialog(dialog);
                doc.querySelectorAll('.session-row').forEach(row => { if (row.querySelector('[data-revoke-session]')) row.remove(); });
                report(result.message || 'Other sessions signed out.', false);
            } catch (err) {
                showError(error, err.message);
            } finally {
                button.classList.remove('is-loading');
            }
        });
    }

    function setupCards() {
        const button = doc.querySelector('[data-freeze-all]');
        if (!button) return;
        button.addEventListener('click', async () => {
            const ok = await W.showConfirm('Every active card will be frozen straight away. You can unfreeze them one at a time from Cards.', 'Freeze all cards?', { confirmLabel: 'Freeze all' });
            if (!ok) return;
            button.classList.add('is-loading');
            try {
                const result = await W.api('/api/security/cards/freeze-all', { method: 'POST', body: {} });
                W.showToast(result.frozen ? `${result.frozen} card${result.frozen === 1 ? '' : 's'} frozen.` : 'All cards were already frozen.', 'success');
                button.disabled = true;
                const summary = doc.querySelector('[data-card-summary]');
                if (summary) summary.textContent = summary.textContent.replace(/(\d+) active · (\d+) frozen/, (match, active, frozen) => `0 active · ${Number(active) + Number(frozen)} frozen`);
            } catch (error) {
                W.showToast(error.message, 'error');
            } finally {
                button.classList.remove('is-loading');
            }
        });
    }

    function setupPrivacy() {
        const privacy = doc.querySelector('[data-privacy-switch]');
        if (privacy) {
            privacy.checked = doc.documentElement.classList.contains('is-private');
            privacy.addEventListener('change', () => {
                const toggle = doc.querySelector('[data-privacy-toggle]');
                if (toggle) toggle.click();
                privacy.checked = doc.documentElement.classList.contains('is-private');
            });
        }
        doc.querySelectorAll('[data-pref]').forEach(input => input.addEventListener('change', async () => {
            input.disabled = true;
            try {
                await W.api('/api/preferences', { method: 'PATCH', body: { [input.dataset.pref]: input.checked } });
                W.showToast('Preference saved.', 'success', 2400);
            } catch (error) {
                input.checked = !input.checked;
                W.showToast(error.message, 'error');
            } finally {
                input.disabled = false;
            }
        }));
    }

    function init() {
        setupTwoFactor();
        setupSessions();
        setupCards();
        setupPrivacy();
    }

    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
    else init();
})(window);
