'use strict';

document.addEventListener('DOMContentLoaded', () => {
    const csrf = document.querySelector('meta[name="csrf-token"]')?.content || '';
    const list = document.getElementById('goalList');
    const form = document.getElementById('goalForm');
    const status = document.getElementById('goalFormStatus');
    const categoryLabels = { savings: 'Savings', home: 'Home', travel: 'Travel', business: 'Business', investing: 'Investing', other: 'Other' };
    const money = cents => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(cents / 100);
    const node = (tag, text, className) => { const element = document.createElement(tag); element.textContent = text; if (className) element.className = className; return element; };
    let goals = [];

    async function request(url, options = {}) {
        const response = await fetch(url, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.method && options.method !== 'GET' ? { 'X-CSRF-Token': csrf } : {}), ...options.headers } });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Could not save this goal.');
        return result;
    }

    function render() {
        list.replaceChildren();
        document.getElementById('goalCount').textContent = `${goals.length} saved`;
        if (!goals.length) { list.append(node('p', 'No goals yet. Add a plan to see it here.', 'wealth-empty')); return; }
        goals.forEach(goal => {
            const card = document.createElement('article'); card.className = 'goal-item';
            const top = document.createElement('div'); top.className = 'goal-item-top';
            const title = document.createElement('div'); title.append(node('span', categoryLabels[goal.category] || 'Goal', 'wealth-kicker'), node('h3', goal.name));
            const remove = node('button', 'Remove'); remove.type = 'button'; remove.className = 'goal-delete'; remove.setAttribute('aria-label', `Remove ${goal.name}`); remove.addEventListener('click', () => removeGoal(goal));
            top.append(title, remove); card.append(top);
            const progress = goal.target_cents > 0 ? Math.min(100, goal.current_cents / goal.target_cents * 100) : 0;
            const summary = document.createElement('div'); summary.className = 'goal-progress-copy'; summary.append(node('strong', money(goal.current_cents)), node('span', `${progress.toFixed(0)}% of ${money(goal.target_cents)}`)); card.append(summary);
            const track = document.createElement('div'); track.className = 'goal-progress-track'; track.setAttribute('role', 'progressbar'); track.setAttribute('aria-label', `${goal.name} self-reported progress`); track.setAttribute('aria-valuemin', '0'); track.setAttribute('aria-valuemax', String(goal.target_cents)); track.setAttribute('aria-valuenow', String(goal.current_cents));
            const fill = document.createElement('span'); fill.style.width = `${progress}%`; track.append(fill); card.append(track);
            const update = document.createElement('form'); update.className = 'goal-update-form';
            const label = node('label', 'Update progress · USD'); const input = document.createElement('input'); input.type = 'number'; input.min = '0'; input.max = (goal.target_cents / 100).toFixed(2); input.step = '0.01'; input.inputMode = 'decimal'; input.value = (goal.current_cents / 100).toFixed(2); input.required;
            const button = node('button', 'Update'); button.type = 'submit'; label.append(input); update.append(label, button);
            update.addEventListener('submit', async event => {
                event.preventDefault(); button.disabled = true;
                try { await request(`/api/goals/${goal.id}`, { method: 'PATCH', body: JSON.stringify({ currentAmount: input.value }) }); await load(); }
                catch (error) { status.textContent = error.message; }
                finally { button.disabled = false; }
            });
            card.append(update); list.append(card);
        });
    }

    async function load() {
        try { goals = (await request('/api/goals')).goals; render(); }
        catch (error) { list.replaceChildren(node('p', error.message, 'wealth-error')); }
    }
    async function removeGoal(goal) {
        try { await request(`/api/goals/${goal.id}`, { method: 'DELETE' }); status.textContent = `${goal.name} removed.`; await load(); }
        catch (error) { status.textContent = error.message; }
    }
    form.addEventListener('submit', async event => {
        event.preventDefault(); const button = form.querySelector('button[type="submit"]'); button.disabled = true; status.textContent = 'Saving planning goal…';
        const data = Object.fromEntries(new FormData(form));
        try { await request('/api/goals', { method: 'POST', body: JSON.stringify(data) }); form.reset(); document.getElementById('goalCurrent').value = '0'; status.textContent = 'Planning goal saved. No money was moved.'; await load(); }
        catch (error) { status.textContent = error.message; }
        finally { button.disabled = false; }
    });
    load();
});