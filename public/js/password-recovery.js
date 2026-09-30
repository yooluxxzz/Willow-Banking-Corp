'use strict';
document.getElementById('recoveryForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('[type="submit"]');
    const status = document.getElementById('recoveryStatus');
    const body = Object.fromEntries(new FormData(form));
    status.hidden = true;
    if (body.newPassword !== body.confirmPassword) { status.textContent = 'New passwords do not match.'; status.hidden = false; status.focus(); return; }
    button.disabled = true; button.textContent = 'Resetting…';
    try {
        const response = await fetch('/auth/reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Token': body._csrf }, body: JSON.stringify(body) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Could not reset your password.');
        form.reset(); window.location.assign(result.redirect);
    } catch (error) { status.textContent = error.message || 'Could not connect. Please try again.'; status.hidden = false; status.focus(); button.disabled = false; button.textContent = 'Reset password'; }
});
