'use strict';
for (const button of document.querySelectorAll('[data-revoke-session]')) {
    button.addEventListener('click', async () => {
        const feedback = document.getElementById('sessionFeedback');
        button.disabled = true; button.textContent = 'Signing out…'; feedback.hidden = true;
        try {
            const response = await fetch('/auth/sessions/' + button.dataset.revokeSession + '/revoke', {
                method: 'POST', headers: { Accept: 'application/json', 'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]').content }
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Could not sign out this session.');
            button.closest('.session-row').remove();
            feedback.dataset.error = 'false'; feedback.textContent = 'Session signed out. Your current session stays active.';
        } catch (error) {
            feedback.dataset.error = 'true'; feedback.textContent = error.message || 'Connection failed. Please try again.';
            button.disabled = false; button.textContent = 'Sign out session';
        } finally { feedback.hidden = false; feedback.focus(); }
    });
}
