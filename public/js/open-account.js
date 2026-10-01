'use strict';
(() => {
    const form = document.getElementById('openAccountForm'); if (!form) return;
    const review = document.getElementById('accountOpeningReview'), feedback = document.getElementById('openingFeedback');
    const confirm = document.getElementById('confirmOpening'), edit = document.getElementById('editOpening'), acknowledged = document.getElementById('openingAcknowledged');
    const names = {checking:'Checking account',savings:'Savings account',business:'Business checking'};
    let draft, pending = false;
    form.addEventListener('submit', event => {
        event.preventDefault(); if (!form.reportValidity()) return;
        draft = { product: form.elements.product.value, nickname: form.elements.nickname.value.trim(), requestKey: form.elements.requestKey.value };
        document.getElementById('openingProduct').textContent = names[draft.product];
        document.getElementById('openingName').textContent = draft.nickname || names[draft.product];
        form.hidden = true; review.hidden = false; feedback.hidden = true; acknowledged.checked = false; review.focus();
    });
    edit.addEventListener('click', () => { if (pending) return; review.hidden = true; form.hidden = false; feedback.hidden = true; form.querySelector('input[type="radio"]:checked').focus(); });
    confirm.addEventListener('click', async () => {
        if (pending) return;
        if (!acknowledged.checked) { feedback.textContent = 'Confirm that this is a simulated account before continuing.'; feedback.dataset.error = 'true'; feedback.hidden = false; acknowledged.focus(); return; }
        pending = true; confirm.disabled = true; edit.disabled = true; acknowledged.disabled = true; feedback.hidden = true; confirm.textContent = 'Opening…';
        try {
            const response = await fetch('/api/accounts', {method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json','X-CSRF-Token':form.elements._csrf.value},body:JSON.stringify({...draft,demoAcknowledged:true})});
            const data = await response.json();
            if (!response.ok || !data.success) throw new Error(data.error || 'Could not open the account. Please retry.');
            location.href = data.redirect;
        } catch (error) { feedback.textContent = error.message || 'Connection failed. Please retry your request.'; feedback.dataset.error = 'true'; feedback.hidden = false; feedback.focus(); }
        finally { pending = false; confirm.disabled = false; edit.disabled = false; acknowledged.disabled = false; confirm.textContent = 'Open demo account'; }
    });
})();
