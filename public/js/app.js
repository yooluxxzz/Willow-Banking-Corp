/* ═══════════════════════════════════════════════════════════
   Willow Banking Corp. — Client-Side Application
   ═══════════════════════════════════════════════════════════ */

'use strict';

// ── Sidebar Toggle (Mobile) ──────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const sidebar = document.getElementById('sidebar');
    const toggle = document.getElementById('menuToggle');
    const overlay = document.getElementById('sidebarOverlay');

    if (toggle && sidebar) {
        toggle.addEventListener('click', () => {
            sidebar.classList.toggle('open');
            overlay && overlay.classList.toggle('active');
        });
    }
    if (overlay && sidebar) {
        overlay.addEventListener('click', () => {
            sidebar.classList.remove('open');
            overlay.classList.remove('active');
        });
    }
});

// ── Auth Functions ───────────────────────────────────────
async function handleLogin(e) {
    e.preventDefault();
    const btn = document.getElementById('loginBtn');
    const errBox = document.getElementById('loginError');
    const errText = document.getElementById('loginErrorText');

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Signing in...';
    errBox.classList.add('hidden');

    try {
        const form = document.getElementById('loginForm');
        const csrf = form.querySelector('[name="_csrf"]').value;
        const res = await fetch('/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
            body: JSON.stringify({
                email: document.getElementById('email').value,
                password: document.getElementById('password').value,
            }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Login failed.');
        window.location.href = '/dashboard';
    } catch (err) {
        errBox.classList.remove('hidden');
        errText.textContent = err.message || 'Invalid email or password.';
        btn.disabled = false;
        btn.textContent = 'Sign In';
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const btn = document.getElementById('registerBtn');
    const errBox = document.getElementById('registerError');
    const errText = document.getElementById('registerErrorText');

    const password = document.getElementById('password').value;
    const confirm = document.getElementById('confirmPassword').value;
    if (password !== confirm) {
        errBox.classList.remove('hidden');
        errText.textContent = 'Passwords do not match.';
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Creating account...';
    errBox.classList.add('hidden');

    try {
        const form = document.getElementById('registerForm');
        const csrf = form.querySelector('[name="_csrf"]').value;
        const res = await fetch('/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
            body: JSON.stringify({
                fullName: document.getElementById('fullName').value,
                email: document.getElementById('email').value,
                phone: document.getElementById('phone').value,
                password,
            }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Registration failed.');
        window.location.href = '/dashboard';
    } catch (err) {
        errBox.classList.remove('hidden');
        errText.textContent = err.message || 'Could not create account. Please try again.';
        btn.disabled = false;
        btn.textContent = 'Create Account';
    }
}

async function handleLogout() {
    try {
        const csrfMeta = document.querySelector('meta[name="csrf-token"]');
        const csrf = csrfMeta ? csrfMeta.getAttribute('content') : '';
        await fetch('/auth/logout', {
            method: 'POST',
            headers: { 'X-CSRF-Token': csrf },
        });
    } catch (e) { /* ignore */ }
    window.location.href = '/login';
}

// ── Theme Toggle ─────────────────────────────────────────
function toggleTheme() {
    const html = document.documentElement;
    const current = html.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    if (next === 'dark') {
        html.setAttribute('data-theme', 'dark');
    } else {
        html.removeAttribute('data-theme');
    }
    localStorage.setItem('willow-theme', next);
}

// ── Toast Notification System ────────────────────────────
(function () {
    // Create toast container on load
    let container;
    function getContainer() {
        if (container) return container;
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:99999;display:flex;flex-direction:column;gap:10px;pointer-events:none;max-width:420px;width:100%;';
        document.body.appendChild(container);
        return container;
    }

    const icons = {
        success: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
        error: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" x2="9" y1="9" y2="15"/><line x1="9" x2="15" y1="9" y2="15"/></svg>',
        warning: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>',
        info: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
    };

    const lightColors = {
        success: { bg: '#ecfdf5', border: '#6ee7b7', text: '#065f46', icon: '#059669' },
        error: { bg: '#fef2f2', border: '#fca5a5', text: '#991b1b', icon: '#dc2626' },
        warning: { bg: '#fffbeb', border: '#fcd34d', text: '#92400e', icon: '#d97706' },
        info: { bg: '#eff6ff', border: '#93c5fd', text: '#1e40af', icon: '#3b82f6' },
    };
    const darkColors = {
        success: { bg: '#064e3b', border: '#065f46', text: '#d1fae5', icon: '#6ee7b7' },
        error: { bg: '#7f1d1d', border: '#991b1b', text: '#fef2f2', icon: '#fca5a5' },
        warning: { bg: '#78350f', border: '#92400e', text: '#fef3c7', icon: '#fcd34d' },
        info: { bg: '#1e3a5f', border: '#1e40af', text: '#dbeafe', icon: '#93c5fd' },
    };
    function getColors() {
        return document.documentElement.getAttribute('data-theme') === 'dark' ? darkColors : lightColors;
    }

    window.showToast = function (message, type, duration) {
        type = type || 'info';
        duration = duration || 4000;
        const c = getContainer();
        const colors = getColors();
        const t = colors[type] || colors.info;
        const toast = document.createElement('div');
        toast.style.cssText = 'pointer-events:auto;display:flex;align-items:flex-start;gap:12px;padding:14px 18px;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,0.12);border:1px solid ' + t.border + ';background:' + t.bg + ';color:' + t.text + ';font-size:0.9rem;line-height:1.5;transform:translateX(110%);transition:transform 0.35s cubic-bezier(0.22,1,0.36,1),opacity 0.3s;opacity:0;';
        toast.innerHTML = '<div style="flex-shrink:0;color:' + t.icon + ';margin-top:1px;">' + (icons[type] || icons.info) + '</div>'
            + '<div style="flex:1;font-weight:500;">' + message + '</div>'
            + '<button onclick="this.parentElement.remove()" style="flex-shrink:0;background:none;border:none;cursor:pointer;color:' + t.text + ';opacity:0.5;font-size:1.2rem;line-height:1;padding:0;">&times;</button>';
        c.appendChild(toast);
        requestAnimationFrame(function () {
            toast.style.transform = 'translateX(0)';
            toast.style.opacity = '1';
        });
        setTimeout(function () {
            toast.style.transform = 'translateX(110%)';
            toast.style.opacity = '0';
            setTimeout(function () { toast.remove(); }, 400);
        }, duration);
    };

    // ── Confirm Dialog ────────────────────────────────────
    window.showConfirm = function (message, title) {
        return new Promise(function (resolve) {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:99998;display:flex;align-items:center;justify-content:center;animation:willowFadeIn 0.2s;';

            const dialog = document.createElement('div');
            dialog.style.cssText = 'background:var(--white,#fff);color:var(--charcoal,#1a1a2e);border-radius:16px;padding:28px 32px;max-width:440px;width:90%;box-shadow:0 25px 60px rgba(0,0,0,0.2);border:1px solid var(--border-color,#e5e7eb);animation:willowSlideUp 0.25s cubic-bezier(0.22,1,0.36,1);';

            const titleEl = title ? '<h3 style="margin:0 0 8px 0;font-size:1.1rem;font-weight:600;">' + title + '</h3>' : '';
            dialog.innerHTML = titleEl
                + '<p style="margin:0 0 24px 0;font-size:0.925rem;line-height:1.6;opacity:0.85;">' + message + '</p>'
                + '<div style="display:flex;gap:10px;justify-content:flex-end;">'
                + '<button id="_confirmCancel" style="padding:10px 22px;border-radius:8px;border:1px solid var(--border-color,#d1d5db);background:var(--gray-100,#f3f4f6);color:var(--charcoal,#374151);font-size:0.875rem;font-weight:500;cursor:pointer;transition:background 0.15s;">Cancel</button>'
                + '<button id="_confirmOk" style="padding:10px 22px;border-radius:8px;border:none;background:var(--green-600,#16a34a);color:#fff;font-size:0.875rem;font-weight:600;cursor:pointer;transition:background 0.15s;">Confirm</button>'
                + '</div>';

            overlay.appendChild(dialog);
            document.body.appendChild(overlay);

            function close(val) {
                overlay.style.opacity = '0';
                overlay.style.transition = 'opacity 0.2s';
                setTimeout(function () { overlay.remove(); }, 200);
                resolve(val);
            }

            overlay.querySelector('#_confirmCancel').onclick = function () { close(false); };
            overlay.querySelector('#_confirmOk').onclick = function () { close(true); };
            overlay.addEventListener('click', function (e) { if (e.target === overlay) close(false); });
            overlay.querySelector('#_confirmCancel').focus();
        });
    };
})();
