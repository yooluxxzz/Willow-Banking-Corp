'use strict';
document.addEventListener('DOMContentLoaded', () => {
    const byId = id => document.getElementById(id);
    const form = byId('transferForm');
    const review = byId('transferReview');
    const alert = byId('transferAlert');
    const confirm = byId('confirmTransfer');
    let draft = null;
    function destinationChanged() {
        const own = byId('transferKind').value === 'own';
        byId('ownDestination').hidden = !own;
        byId('customerDestination').hidden = own;
        byId('toAccountId').disabled = !own;
        byId('recipientEmail').disabled = own;
        byId('recipientEmail').required = !own;
        const source = byId('fromAccountId').value;
        Array.from(byId('toAccountId').options).forEach(option => { option.disabled = option.value === source; });
        if (byId('toAccountId').value === source) byId('toAccountId').value = Array.from(byId('toAccountId').options).find(option => !option.disabled)?.value || '';
    }
    byId('transferKind').addEventListener('change', destinationChanged);
    byId('fromAccountId').addEventListener('change', destinationChanged);
    destinationChanged();
    form.addEventListener('submit', event => {
        event.preventDefault();
        if (!form.reportValidity()) return;
        const own = byId('transferKind').value === 'own';
        draft = { fromAccountId: byId('fromAccountId').value, amount: byId('amount').value, description: byId('description').value.trim() };
        if (own) draft.toAccountId = byId('toAccountId').value;
        else draft.recipientEmail = byId('recipientEmail').value.trim();
        byId('reviewFrom').textContent = byId('fromAccountId').selectedOptions[0].textContent;
        byId('reviewTo').textContent = own ? byId('toAccountId').selectedOptions[0].textContent : draft.recipientEmail;
        byId('reviewAmount').textContent = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(draft.amount));
        byId('reviewDescription').textContent = draft.description || 'No description';
        alert.className = 'hidden';
        form.hidden = true;
        review.hidden = false;
        review.focus();
    });
    byId('editTransfer').addEventListener('click', () => {
        review.hidden = true;
        form.hidden = false;
        draft = null;
        byId('amount').focus();
    });
    confirm.addEventListener('click', async () => {
        if (!draft || confirm.disabled) return;
        confirm.disabled = true;
        byId('editTransfer').disabled = true;
        confirm.textContent = 'Processing…';
        try {
            const response = await fetch('/api/transfers', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Token': form.elements._csrf.value }, body: JSON.stringify(draft) });
            const data = await response.json();
            if (!response.ok || !data.success) throw new Error(data.error || 'Transfer could not be confirmed.');
            alert.className = 'alert alert-success';
            alert.textContent = `Demo transfer recorded. Reference: ${data.reference}. No real money moved.`;
            draft = null;
            review.hidden = true;
            const link = document.createElement('a');
            link.href = '/transfers';
            link.textContent = ' Make another transfer';
            alert.append(link);
        } catch (error) {
            alert.className = 'alert alert-danger';
            alert.textContent = error.message || 'Transfer failed. Please try again.';
        } finally {
            confirm.disabled = false;
            byId('editTransfer').disabled = false;
            confirm.textContent = 'Confirm demo transfer';
        }
    });
});
