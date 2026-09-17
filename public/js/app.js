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
