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

    setupLandingCalculator();
    setupHomeNavigation();
    setupHeroCrossfade();
    setupHomeReveals();
    setupGoalSelection();
    setupPromptAnswers();
});

function setupHeroCrossfade() {
    const hero = document.querySelector('[data-hero-crossfade]');
    const story = hero?.closest('[data-hero-story]');
    if (!hero || !story) return;
    const photos = [hero.querySelector('.home-hero-photo-a'), hero.querySelector('.home-hero-photo-b')];
    const copies = Array.from(hero.querySelectorAll('[data-hero-copy]'));
    const guide = hero.querySelector('[data-hero-guide]');
    const nav = document.querySelector('.home-nav');
    if (photos.some(photo => !photo)) return;

    let frame = null;
    let photoFrame = { top: 8, right: 4, bottom: 8, left: 62, radius: 20 };
    const show = (scene) => {
        if (hero.dataset.activeImage === scene) return;
        hero.dataset.activeImage = scene;
        photos[0].setAttribute('aria-hidden', String(scene !== 'a'));
        photos[1].setAttribute('aria-hidden', String(scene !== 'b'));
        copies.forEach(copy => {
            const inactive = copy.dataset.heroCopy !== scene;
            copy.inert = inactive;
            copy.setAttribute('aria-hidden', String(inactive));
        });
        if (guide) guide.textContent = scene === 'a'
            ? '01 / 02  Scroll to discover'
            : '02 / 02  Keep scrolling to explore';
    };
    const updateFromScroll = () => {
        frame = null;
        const top = nav ? nav.getBoundingClientRect().height : 0;
        const bounds = story.getBoundingClientRect();
        const travel = Math.max(1, story.offsetHeight - hero.offsetHeight);
        const progress = Math.min(1, Math.max(0, (top - bounds.top) / travel));
        const photoProgress = Math.min(1, progress / 0.82);
        const easedPhotoProgress = photoProgress * photoProgress * (3 - 2 * photoProgress);
        const sceneProgress = Math.min(1, Math.max(0, (progress - 0.42) / 0.4));
        const copyAOpacity = 1 - Math.min(1, Math.max(0, (progress - 0.24) / 0.26));
        const copyBOpacity = Math.min(1, Math.max(0, (progress - 0.52) / 0.2));
        hero.style.setProperty('--hero-photo-inset-top', `${photoFrame.top * (1 - easedPhotoProgress)}%`);
        hero.style.setProperty('--hero-photo-inset-right', `${photoFrame.right * (1 - easedPhotoProgress)}%`);
        hero.style.setProperty('--hero-photo-inset-bottom', `${photoFrame.bottom * (1 - easedPhotoProgress)}%`);
        hero.style.setProperty('--hero-photo-inset-left', `${photoFrame.left * (1 - easedPhotoProgress)}%`);
        hero.style.setProperty('--hero-photo-radius', `${photoFrame.radius * (1 - easedPhotoProgress)}px`);
        hero.style.setProperty('--hero-scene-progress', sceneProgress);
        hero.style.setProperty('--hero-copy-a-opacity', copyAOpacity);
        hero.style.setProperty('--hero-copy-b-opacity', copyBOpacity);
        hero.style.setProperty('--story-progress', progress);
        show(progress >= 0.52 ? 'b' : 'a');
    };
    const schedule = () => {
        if (frame === null) frame = window.requestAnimationFrame(updateFromScroll);
    };
    const resize = () => {
        story.style.setProperty('--hero-nav-height', `${nav ? nav.getBoundingClientRect().height : 0}px`);
        const styles = window.getComputedStyle(story);
        photoFrame = {
            top: Number.parseFloat(styles.getPropertyValue('--hero-photo-start-top')) || 0,
            right: Number.parseFloat(styles.getPropertyValue('--hero-photo-start-right')) || 0,
            bottom: Number.parseFloat(styles.getPropertyValue('--hero-photo-start-bottom')) || 0,
            left: Number.parseFloat(styles.getPropertyValue('--hero-photo-start-left')) || 0,
            radius: Number.parseFloat(styles.getPropertyValue('--hero-photo-start-radius')) || 0
        };
        updateFromScroll();
    };
    const enableScrollStory = () => {
        const loaded = photos.map(photo => photo.complete && photo.naturalWidth > 0);
        if (!loaded[0] && loaded[1]) show('b');
        if (!loaded.every(Boolean)) return;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        // Enhance only after both photos load; the first scene works without JS.
        story.classList.add('is-scroll-ready');
        resize();
        window.addEventListener('scroll', schedule, { passive: true });
        window.addEventListener('resize', resize, { passive: true });
        window.addEventListener('pageshow', resize);
        if ('ResizeObserver' in window && nav) new ResizeObserver(resize).observe(nav);
    };
    if (photos.every(photo => photo.complete)) {
        enableScrollStory();
    } else {
        Promise.all(photos.map(photo => new Promise(resolve => {
            if (photo.complete) return resolve();
            photo.addEventListener('load', resolve, { once: true });
            photo.addEventListener('error', resolve, { once: true });
        }))).then(enableScrollStory);
    }
}

function setupHomeNavigation() {
    const toggle = document.getElementById('homeMenuToggle');
    const menu = document.getElementById('homeNavLinks');
    const nav = document.querySelector('.home-nav');
    if (!toggle || !menu) return;

    const closeMenu = () => {
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-label', 'Open navigation menu');
        menu.classList.remove('is-open');
    };

    toggle.addEventListener('click', () => {
        const isOpen = toggle.getAttribute('aria-expanded') === 'true';
        toggle.setAttribute('aria-expanded', String(!isOpen));
        toggle.setAttribute('aria-label', isOpen ? 'Open navigation menu' : 'Close navigation menu');
        menu.classList.toggle('is-open', !isOpen);
        if (!isOpen) nav?.classList.remove('is-hidden');
    });

    let previousScrollY = window.scrollY;
    window.addEventListener('scroll', () => {
        const currentScrollY = window.scrollY;
        const direction = currentScrollY - previousScrollY;
        if (Math.abs(direction) < 6) return;
        previousScrollY = currentScrollY;
        const menuOpen = toggle.getAttribute('aria-expanded') === 'true';
        nav?.classList.toggle('is-hidden', currentScrollY > 96 && direction > 0 && !menuOpen);
    }, { passive: true });

    menu.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu));
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeMenu();
    });
    window.addEventListener('resize', () => {
        if (window.innerWidth > 900) closeMenu();
    }, { passive: true });
}

function setupHomeReveals() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;

    const sections = document.querySelectorAll('.home-reveal');
    if (!sections.length) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.14 });

    sections.forEach((section) => observer.observe(section));
    document.body.classList.add('home-reveals-enabled');
}

function setupPromptAnswers() {
    const chips = document.querySelectorAll('.prompt-chip');
    const answerHeading = document.getElementById('intelligenceAnswer');
    const answerText = document.querySelector('.intelligence-answer');
    if (!chips.length || !answerHeading || !answerText) return;

    const answers = {
        'How much did I spend this month?': 'You spent $5,360 this month across everyday accounts and recurring payments. The largest categories were groceries, rent and recurring subscriptions.',
        'Show me my investments.': 'Your investment portfolio is spread across seven demo assets, with the strongest weight in large-cap equities and a smaller allocation in crypto.',
        'What are my biggest expenses?': 'Your biggest recurring expenses are housing, groceries and transport, with the largest and most recent variation coming from monthly utility spending.',
        'How much do I have in savings?': 'You have $19,800 in active savings across your primary and goal-based accounts, with $3,200 earmarked for travel and $1,920 added this month.',
        'What is my portfolio allocation?': 'Your portfolio is split roughly 58% equities, 24% cash, 12% crypto and 6% alternative holdings, keeping risk balanced across the current demo mix.'
    };

    chips.forEach((chip) => {
        chip.addEventListener('click', () => {
            chips.forEach((button) => button.classList.toggle('is-active', button === chip));
            const text = chip.dataset.answer || chip.textContent.trim();
            answerHeading.textContent = text;
            answerText.textContent = answers[text] || 'This demo insight is based on the current connected Willow data view.';
        });
    });
}

function setupGoalSelection() {
    const pills = document.querySelectorAll('.goal-pill');
    const panels = document.querySelectorAll('[data-goal-panel]');
    if (!pills.length || !panels.length) return;

    pills.forEach((pill) => {
        pill.addEventListener('click', () => {
            const selectedGoal = pill.dataset.goal;
            pills.forEach((button) => button.classList.toggle('is-active', button === pill));
            panels.forEach((panel) => panel.classList.toggle('is-active', panel.dataset.goalPanel === selectedGoal));
        });
    });
}

function setupLandingCalculator() {
    const amountInput = document.getElementById('loanAmount');
    const downInput = document.getElementById('downPayment');
    const aprInput = document.getElementById('aprRate');
    const termInput = document.getElementById('loanTerm');
    const paymentNode = document.getElementById('monthlyPayment');
    const totalNode = document.getElementById('loanTotal');
    const principalNode = document.getElementById('loanPrincipal');

    if (!amountInput || !downInput || !aprInput || !termInput || !paymentNode || !totalNode || !principalNode) {
        return;
    }

    const formatCurrency = (value) => new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
    }).format(value || 0);

    const updateCalculator = () => {
        const amount = Number(amountInput.value) || 0;
        const down = Number(downInput.value) || 0;
        const apr = Number(aprInput.value) || 0;
        const years = Number(termInput.value) || 30;
        const principal = Math.max(amount - down, 0);
        const payments = years * 12;
        const monthlyRate = apr / 100 / 12;

        let monthlyPayment = 0;
        if (principal > 0 && monthlyRate > 0) {
            monthlyPayment = principal * (monthlyRate * Math.pow(1 + monthlyRate, payments)) /
                (Math.pow(1 + monthlyRate, payments) - 1);
        } else if (principal > 0) {
            monthlyPayment = principal / payments;
        }

        const totalPaid = monthlyPayment * payments;

        paymentNode.textContent = formatCurrency(monthlyPayment);
        principalNode.textContent = formatCurrency(principal);
        totalNode.textContent = formatCurrency(totalPaid);
    };

    [amountInput, downInput, aprInput, termInput].forEach((input) => {
        input.addEventListener('input', updateCalculator);
        input.addEventListener('change', updateCalculator);
    });

    updateCalculator();
}

// ── Auth Functions ───────────────────────────────────────
async function handleLogin(e) {
    e.preventDefault();
    const btn = document.getElementById('loginBtn');
    const errBox = document.getElementById('loginError');
    const errText = document.getElementById('loginErrorText');

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Signing in...';
    errBox.hidden = true;

    try {
        const form = document.getElementById('loginForm');
        const csrf = form.querySelector('[name="_csrf"]').value;
        const res = await fetch('/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf, Accept: 'application/json' },
            body: JSON.stringify({
                email: document.getElementById('email').value,
                password: document.getElementById('password').value,
                returnTo: form.elements.returnTo.value,
            }),
        });
        const data = await res.json().catch(() => ({ error: 'Sign-in is temporarily unavailable. Please try again.' }));
        if (!res.ok || !data.success) throw new Error(data.error || 'Login failed.');
        window.location.href = data.redirect || '/dashboard';
    } catch (err) {
        errBox.hidden = false; errBox.focus();
        errText.textContent = err instanceof TypeError ? 'Could not connect. Check your connection and try again.' : (err.message || 'Invalid email or password.');
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
        errBox.hidden = false; errBox.focus();
        errText.textContent = 'Passwords do not match.';
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Creating account...';
    errBox.hidden = true;

    try {
        const form = document.getElementById('registerForm');
        const csrf = form.querySelector('[name="_csrf"]').value;
        const res = await fetch('/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf, Accept: 'application/json' },
            body: JSON.stringify({
                fullName: document.getElementById('fullName').value,
                email: document.getElementById('email').value,
                phone: document.getElementById('phone').value,
                password,
            }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Registration failed.');
        window.location.href = data.redirect || '/dashboard';
    } catch (err) {
        errBox.hidden = false; errBox.focus();
        errText.textContent = err.message || 'Could not create account. Please try again.';
        btn.disabled = false;
        btn.textContent = 'Create Account';
    }
}

let logoutPending = false;
async function handleLogout() {
    if (logoutPending) return;
    logoutPending = true;
    try {
        const csrfMeta = document.querySelector('meta[name="csrf-token"]');
        const csrf = csrfMeta ? csrfMeta.getAttribute('content') : '';
        const response = await fetch('/auth/logout', {
            method: 'POST',
            headers: { 'X-CSRF-Token': csrf, Accept: 'application/json' },
        });
        const data = await response.json().catch(() => ({}));
        if (response.status === 401) { window.location.href = '/login?error=session_expired'; return; }
        if (!response.ok || !data.success) throw new Error(data.error || 'Sign-out could not be completed. Please try again.');
        window.location.href = '/login?signedOut=success';
    } catch (error) {
        showToast(error.message || 'Could not connect. Please try signing out again.', 'error');
    } finally { logoutPending = false; }
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
            + '<div data-toast-message style="flex:1;font-weight:500;"></div>'
            + '<button onclick="this.parentElement.remove()" style="flex-shrink:0;background:none;border:none;cursor:pointer;color:' + t.text + ';opacity:0.5;font-size:1.2rem;line-height:1;padding:0;">&times;</button>';
        toast.querySelector('[data-toast-message]').textContent = message;
        toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
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

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-password-toggle]').forEach(button => {
        button.addEventListener('click', () => {
            const input = document.getElementById(button.getAttribute('aria-controls'));
            const visible = input.type === 'password';
            input.type = visible ? 'text' : 'password';
            button.setAttribute('aria-pressed', String(visible));
            button.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
        });
    });
    const form = document.getElementById('registerForm');
    if (!form) return;
    const steps = Array.from(form.querySelectorAll('[data-register-step]'));
    const setStep = index => {
        steps.forEach((step, i) => {
            step.hidden = i !== index;
            step.querySelectorAll('input').forEach(input => { input.disabled = i !== index; });
        });
        document.getElementById('registerStepLabel').textContent = 'Step ' + (index + 1) + ' of 2';
        document.getElementById('registerStepName').textContent = index ? 'Account security' : 'Personal details';
        document.getElementById('registerProgress').style.width = index ? '100%' : '50%';
        document.querySelector('.auth-progress-track').setAttribute('aria-valuenow', String(index + 1));
        steps[index].querySelector('input').focus();
    };
    document.getElementById('registerNext').addEventListener('click', () => {
        if (Array.from(steps[0].querySelectorAll('input')).every(input => input.reportValidity())) setStep(1);
    });
    document.getElementById('registerBack').addEventListener('click', () => setStep(0));
    steps[1].querySelectorAll('input').forEach(input => { input.disabled = true; });
    const password = document.getElementById('password');
    password.addEventListener('input', () => {
        const value = password.value;
        const rules = { length: value.length >= 8 && value.length <= 128, upper: /[A-Z]/.test(value), lower: /[a-z]/.test(value), number: /[0-9]/.test(value) };
        Object.entries(rules).forEach(([rule, valid]) => document.querySelector('[data-password-rule="' + rule + '"]').classList.toggle('is-valid', valid));
        const met = Object.values(rules).filter(Boolean).length;
        document.getElementById('passwordStrengthBar').style.width = met * 25 + '%';
        document.getElementById('passwordStrengthText').textContent = met === 4 ? 'Password meets the requirements' : 'Meet all four password requirements';
        password.setCustomValidity(met === 4 || !value ? '' : 'Use 8–128 characters with uppercase, lowercase and a number.');
    });
    document.getElementById('confirmPassword').addEventListener('input', event => {
        const matches = event.target.value === password.value;
        document.getElementById('confirmPasswordError').hidden = matches;
        event.target.setCustomValidity(matches ? '' : 'Passwords must match.');
    });
});
