/* Willow settings — profile, password, recovery codes, alerts, privacy and theme. */
'use strict';

(function (global) {
    const doc = global.document;
    const W = global.Willow;
    const ENDPOINTS = { profile: '/auth/update-profile', password: '/auth/change-password', recovery: '/auth/recovery-codes', claim: '/auth/claim-guest' };

    function setupForms() {
        let savedCodes = [];
        doc.querySelectorAll('[data-settings-form]').forEach(form => form.addEventListener('submit', async event => {
            event.preventDefault();
            const kind = form.dataset.settingsForm;
            const status = form.querySelector('.settings-feedback');
            const button = form.querySelector('[type="submit"]');
            const body = Object.fromEntries(new FormData(form));
            const report = (message, isError) => {
                status.textContent = message;
                status.className = `form-status settings-feedback ${isError ? 'is-error' : 'is-success'}`;
                status.hidden = false;
                status.focus();
            };
            if (kind === 'password' && body.newPassword !== body.confirmPassword) return report('New passwords don’t match.', true);
            button.classList.add('is-loading');
            button.disabled = true;
            try {
                const result = await W.api(ENDPOINTS[kind], { method: 'POST', body });
                if (kind === 'recovery') {
                    savedCodes = result.codes;
                    doc.getElementById('recoveryCodeList').textContent = savedCodes.join('\n');
                    doc.getElementById('recoveryResults').hidden = false;
                    doc.getElementById('recoveryCount').textContent = savedCodes.length;
                    report('New codes created. Your old codes no longer work.', false);
                } else {
                    report(result.message || 'Saved.', false);
                }
                if (kind !== 'profile') form.reset();
                if (kind === 'profile') doc.querySelectorAll('.app-user-copy strong, .app-profile-head strong').forEach(node => { node.textContent = body.fullName.trim(); });
                if (kind === 'claim') global.setTimeout(() => global.location.reload(), 1400);
            } catch (error) {
                report(error.message, true);
            } finally {
                button.classList.remove('is-loading');
                button.disabled = false;
            }
        }));

        const download = doc.getElementById('downloadRecoveryCodes');
        download?.addEventListener('click', () => {
            if (!savedCodes.length) return;
            const blob = new Blob([`Willow demo — one-time recovery codes\nKeep these private. Each code can reset your password once.\n\n${savedCodes.join('\n')}\n`], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const link = W.el('a', { href: url, download: 'willow-recovery-codes.txt' });
            doc.body.append(link);
            link.click();
            link.remove();
            global.setTimeout(() => URL.revokeObjectURL(url), 1000);
        });
        const copy = doc.querySelector('[data-copy-codes]');
        copy?.addEventListener('click', async () => {
            try { await global.navigator.clipboard.writeText(savedCodes.join('\n')); W.showToast('Codes copied. Store them somewhere safe.', 'success'); } catch (error) { W.showToast('Copy isn’t available in this browser. Download them instead.', 'warning'); }
        });
        const hide = doc.getElementById('hideRecoveryCodes');
        hide?.addEventListener('click', () => {
            savedCodes = [];
            doc.getElementById('recoveryCodeList').textContent = '';
            doc.getElementById('recoveryResults').hidden = true;
        });
    }

    function setupPreferences() {
        doc.querySelectorAll('[data-pref]').forEach(input => input.addEventListener('change', async () => {
            input.disabled = true;
            try {
                await W.api('/api/preferences', { method: 'PATCH', body: { [input.dataset.pref]: input.checked } });
                W.showToast('Preference saved.', 'success', 2200);
            } catch (error) {
                input.checked = !input.checked;
                W.showToast(error.message, 'error');
            } finally {
                input.disabled = false;
            }
        }));
        const privacy = doc.querySelector('[data-privacy-switch]');
        if (privacy) {
            privacy.checked = doc.documentElement.classList.contains('is-private');
            privacy.addEventListener('change', () => {
                const toggle = doc.querySelector('[data-privacy-toggle]');
                if (toggle) toggle.click();
                privacy.checked = doc.documentElement.classList.contains('is-private');
            });
        }
    }

    function setupTheme() {
        const group = doc.querySelector('[data-theme-choice]');
        if (!group) return;
        const buttons = Array.from(group.querySelectorAll('[data-theme-value]'));
        const current = () => { try { return localStorage.getItem('willow-theme') || 'system'; } catch (error) { return 'system'; } };
        const sync = () => buttons.forEach(button => button.setAttribute('aria-checked', String(button.dataset.themeValue === current())));
        buttons.forEach(button => button.addEventListener('click', () => {
            const value = button.dataset.themeValue;
            const root = doc.documentElement;
            try {
                if (value === 'system') localStorage.removeItem('willow-theme');
                else localStorage.setItem('willow-theme', value);
            } catch (error) { /* storage unavailable */ }
            const dark = value === 'dark' || (value === 'system' && global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches);
            if (dark) root.setAttribute('data-theme', 'dark'); else root.removeAttribute('data-theme');
            doc.dispatchEvent(new CustomEvent('willow:themechange', { detail: { theme: dark ? 'dark' : 'light' } }));
            sync();
        }));
        sync();
    }

    function setupMisc() {
        doc.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', async () => {
            try { await global.navigator.clipboard.writeText(button.dataset.copy); W.showToast('Copied.', 'success', 1800); } catch (error) { W.showToast('Copy isn’t available in this browser.', 'warning'); }
        }));
    }

    function init() {
        setupForms();
        setupPreferences();
        setupTheme();
        setupMisc();
    }

    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
    else init();
})(window);
