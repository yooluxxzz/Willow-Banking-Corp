'use strict';
document.getElementById('accountNameForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget, button = form.querySelector('button'), status = document.getElementById('accountNameStatus');
    button.disabled = true; button.textContent = 'Saving…'; status.hidden = true;
    try {
        const response = await fetch('/api/accounts/' + form.dataset.accountId, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Token': form.elements._csrf.value }, body: JSON.stringify({ nickname: form.elements.nickname.value }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not save the account name.');
        document.getElementById('accountName').textContent = data.account.displayName;
        document.title = data.account.displayName + ' — Willow Banking Corp.';
        form.elements.nickname.value = data.account.nickname;
        status.dataset.error = 'false'; status.textContent = 'Account name saved.';
    } catch (error) { status.dataset.error = 'true'; status.textContent = error.message || 'Could not connect. Try again.'; }
    finally { status.hidden = false; status.focus(); button.disabled = false; button.textContent = 'Save account name'; }
});
