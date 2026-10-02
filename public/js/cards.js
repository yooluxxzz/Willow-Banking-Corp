'use strict';
(() => {
    const dialog = document.getElementById('cardReview');
    const confirm = document.getElementById('confirmCardAction');
    const cancel = document.getElementById('cancelCardAction');
    const error = document.getElementById('cardActionError');
    let selected, pending = false;
    const copy = {
        frozen: ['Freeze demo card', 'You can unfreeze this card later while its linked account is active.'],
        active: ['Unfreeze demo card', 'This restores the demo card to active status. It does not enable real payments.'],
        reported: ['Report demo card lost', 'The card becomes inactive immediately and cannot be reactivated. You can create a replacement demo card afterward.'],
        replace: ['Replace demo card', 'The current card will be permanently cancelled and one new demo card created. No physical card will be shipped.']
    };
    for (const button of document.querySelectorAll('[data-card-action]')) button.addEventListener('click', () => {
        selected = button.dataset;
        document.getElementById('cardReviewTitle').textContent = copy[selected.cardAction][0] + ' ending ' + selected.lastFour;
        document.getElementById('cardReviewDescription').textContent = copy[selected.cardAction][1];
        confirm.textContent = copy[selected.cardAction][0]; error.hidden = true; dialog.showModal();
    });
    cancel.addEventListener('click', () => dialog.close());
    dialog.addEventListener('cancel', event => { if (pending) event.preventDefault(); });
    confirm.addEventListener('click', async () => {
        if (pending) return;
        pending = true; confirm.disabled = true; cancel.disabled = true; error.hidden = true;
        try {
            const replacing = selected.cardAction === 'replace';
            const response = await fetch('/api/cards/' + selected.cardId + (replacing ? '/replace' : '/status'), {
                method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]').content },
                body: JSON.stringify(replacing ? {} : { status: selected.cardAction })
            });
            const data = await response.json();
            if (!response.ok || !data.success) throw new Error(data.error || 'Could not update this card.');
            location.href = '/cards?notice=' + (replacing ? 'replaced' : selected.cardAction);
        } catch (err) { error.textContent = err.message || 'Connection failed. Please try again.'; error.hidden = false; }
        finally { pending = false; confirm.disabled = false; cancel.disabled = false; }
    });
})();
