'use strict';
(() => {
    let savedCodes = [];
    const endpoints = { profile: '/auth/update-profile', password: '/auth/change-password', recovery: '/auth/recovery-codes', sessions: '/auth/revoke-other-sessions' };
    for (const form of document.querySelectorAll('[data-settings-form]')) {
        form.addEventListener('submit', async event => {
            event.preventDefault();
            const status = form.querySelector('.settings-feedback');
            const button = form.querySelector('[type="submit"]');
            const text = button.textContent;
            const kind = form.dataset.settingsForm;
            const body = Object.fromEntries(new FormData(form));
            status.hidden = true;
            if (kind === 'password' && body.newPassword !== body.confirmPassword) {
                status.textContent = 'New passwords do not match.'; status.dataset.error = 'true'; status.hidden = false; status.focus(); return;
            }
            button.disabled = true; button.textContent = 'Saving…';
            try {
                const response = await fetch(endpoints[kind], { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Token': document.querySelector('[name="_csrf"]').value }, body: JSON.stringify(body) });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || 'Could not save. Please try again.');
                status.dataset.error = 'false';
                status.textContent = result.message || 'Recovery codes created. Save them below before leaving this page.';
                if (kind !== 'profile') form.reset();
                if (kind === 'recovery') {
                    savedCodes = result.codes;
                    document.getElementById('recoveryCodeList').textContent = savedCodes.join('\n');
                    document.getElementById('recoveryResults').hidden = false;
                    document.getElementById('recoveryCount').textContent = savedCodes.length;
                }
            } catch (error) { status.textContent = error.message || 'Could not connect. Please try again.'; status.dataset.error = 'true'; }
            finally { button.disabled = false; button.textContent = text; status.hidden = false; status.focus(); }
        });
    }
    document.getElementById('downloadRecoveryCodes').addEventListener('click', () => {
        if (!savedCodes.length) return;
        const blob = new Blob(['Willow Banking demo — one-time recovery codes\nKeep private. Each code can reset your password once.\n\n' + savedCodes.join('\n')], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a'); link.href = url; link.download = 'willow-recovery-codes.txt'; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    document.getElementById('hideRecoveryCodes').addEventListener('click', () => {
        savedCodes = []; document.getElementById('recoveryCodeList').textContent = ''; document.getElementById('recoveryResults').hidden = true;
        document.getElementById('recoveryPassword').focus();
    });
})();
