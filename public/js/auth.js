/* Willow sign in, sign up and password recovery. */
'use strict';

(function (global) {
    const doc = global.document;
    const reduced = () => global.Willow.prefersReducedMotion();
    const wait = ms => new Promise(resolve => setTimeout(resolve, reduced() ? Math.min(ms, 60) : ms));

    // ── Shared helpers ──────────────────────────────────────────────────
    function setLoading(button, loading, label) {
        if (!button) return;
        const text = button.querySelector('.btn-label');
        if (loading) {
            button.dataset.label = text ? text.textContent : button.textContent;
            if (text && label) text.textContent = label;
        } else if (text && button.dataset.label) {
            text.textContent = button.dataset.label;
        }
        button.classList.toggle('is-loading', loading);
        button.disabled = loading;
        button.setAttribute('aria-busy', String(loading));
    }

    function showAlert(box, message) {
        if (!box) return;
        const text = box.querySelector('[data-auth-alert-text], [data-code-alert-text], [data-register-alert-text], [data-demo-error-text]');
        (text || box).textContent = message;
        box.hidden = false;
        box.focus({ preventScroll: false });
    }

    function hideAlert(box) {
        if (box) box.hidden = true;
    }

    function fieldError(input, message) {
        const error = doc.getElementById(`${input.id}Error`);
        if (message) {
            input.setAttribute('aria-invalid', 'true');
            if (error) { error.textContent = message; error.hidden = false; }
        } else {
            input.removeAttribute('aria-invalid');
            if (error) { error.textContent = ''; error.hidden = true; }
        }
        return !message;
    }

    function shake(form) {
        if (reduced()) return;
        form.classList.remove('is-shaking');
        void form.offsetWidth;
        form.classList.add('is-shaking');
    }

    function switcher(root) {
        const views = [...root.querySelectorAll('[data-auth-view]')];
        return function show(name, { focus = true } = {}) {
            views.forEach(view => {
                const active = view.dataset.authView === name;
                view.hidden = !active;
                view.classList.toggle('is-active', active);
            });
            const target = views.find(view => view.dataset.authView === name);
            const title = target && target.querySelector('.auth-title');
            if (focus && title) title.focus({ preventScroll: true });
            global.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' });
        };
    }

    function goTo(url) {
        global.location.assign(url);
    }

    function destinationLabel(url) {
        if (url.startsWith('/admin')) return 'Taking you to the admin console…';
        if (url.startsWith('/dashboard')) return 'Taking you to your dashboard…';
        return 'Taking you back to where you were…';
    }

    function setupCapsLock(input) {
        const hint = doc.getElementById('capsHint');
        if (!input || !hint) return;
        const update = event => { if (event.getModifierState) hint.hidden = !event.getModifierState('CapsLock'); };
        input.addEventListener('keydown', update);
        input.addEventListener('keyup', update);
        input.addEventListener('blur', () => { hint.hidden = true; });
    }

    // ── Fading imagery ──────────────────────────────────────────────────
    function setupScenes(root) {
        if (!root) return null;
        const scenes = [...root.querySelectorAll('[data-auth-scene]')];
        const captions = [...doc.querySelectorAll('[data-auth-caption]')];
        const dots = [...doc.querySelectorAll('.auth-visual-dots span')];
        if (scenes.length < 2) return null;
        let index = 0;
        let timer = null;
        const load = scene => {
            const img = scene && scene.querySelector('img[data-src]');
            if (!img) return;
            img.addEventListener('load', () => img.classList.add('is-loaded'), { once: true });
            img.src = img.dataset.src;
            img.removeAttribute('data-src');
        };
        const show = next => {
            index = (next + scenes.length) % scenes.length;
            scenes.forEach((scene, i) => scene.classList.toggle('is-active', i === index));
            captions.forEach((caption, i) => caption.classList.toggle('is-active', i === index));
            dots.forEach((dot, i) => dot.classList.toggle('is-active', i === index));
            load(scenes[(index + 1) % scenes.length]);
        };
        const play = () => { if (!timer && !reduced()) timer = setInterval(() => show(index + 1), 6500); };
        const pause = () => { clearInterval(timer); timer = null; };
        load(scenes[0]);
        global.setTimeout(() => load(scenes[1]), 1200);
        play();
        doc.addEventListener('visibilitychange', () => (doc.hidden ? pause() : play()));
        return { show, play, pause };
    }

    // ── Sign in ─────────────────────────────────────────────────────────
    function setupLogin(root) {
        const show = switcher(root);
        const form = doc.getElementById('loginForm');
        const email = doc.getElementById('email');
        const password = doc.getElementById('password');
        const alert = root.querySelector('[data-auth-alert]');
        const submit = form.querySelector('[type="submit"]');
        const twoFactorForm = doc.getElementById('twoFactorForm');
        const codeInput = doc.getElementById('code');
        const codeAlert = root.querySelector('[data-code-alert]');
        const codeMode = root.querySelector('[data-code-mode]');
        let backupMode = false;
        setupCapsLock(password);

        const succeed = redirect => {
            const text = root.querySelector('[data-success-text]');
            text.textContent = destinationLabel(redirect);
            show('success');
            global.setTimeout(() => goTo(redirect), reduced() ? 150 : 900);
        };

        const lock = message => {
            root.querySelector('[data-locked-text]').textContent = message || 'Too many unsuccessful attempts. For your security, sign-in is paused for 15 minutes.';
            show('locked');
        };

        const restart = message => {
            password.value = '';
            codeInput.value = '';
            show('credentials');
            if (message) showAlert(alert, message);
            (email.value ? password : email).focus();
        };

        root.querySelectorAll('[data-auth-go]').forEach(button => button.addEventListener('click', () => {
            show(button.dataset.authGo);
            if (button.hasAttribute('data-focus-id')) {
                email.focus();
                email.select();
            }
        }));
        root.querySelectorAll('[data-auth-restart]').forEach(button => button.addEventListener('click', () => restart()));

        [email, password].forEach(input => input.addEventListener('input', () => fieldError(input, '')));

        form.addEventListener('submit', async event => {
            event.preventDefault();
            hideAlert(alert);
            hideAlert(root.querySelector('[data-page-notice]'));
            const okEmail = fieldError(email, email.value.trim() ? '' : 'Enter your email or customer ID.');
            const okPassword = fieldError(password, password.value ? '' : 'Enter your password.');
            if (!okEmail || !okPassword) {
                (okEmail ? password : email).focus();
                shake(form);
                return;
            }
            setLoading(submit, true, 'Signing in…');
            try {
                const result = await global.Willow.api('/auth/login', {
                    method: 'POST',
                    body: { email: email.value.trim(), password: password.value, returnTo: form.elements.returnTo.value },
                });
                if (result.twoFactorRequired) {
                    setLoading(submit, false);
                    show('two-factor');
                    codeInput.focus();
                    return;
                }
                succeed(result.redirect || '/dashboard');
            } catch (error) {
                setLoading(submit, false);
                const data = error.data || {};
                if (data.code === 'locked' || error.status === 429) {
                    lock(error.message);
                    return;
                }
                if (data.code === 'invalid_credentials') {
                    const left = Number(data.attemptsRemaining);
                    const warning = Number.isFinite(left) && left > 0 && left <= 3
                        ? ` ${left} ${left === 1 ? 'attempt' : 'attempts'} left before sign-in is paused for 15 minutes.`
                        : '';
                    password.value = '';
                    password.setAttribute('aria-invalid', 'true');
                    showAlert(alert, `${error.message}${warning}`);
                    shake(form);
                    return;
                }
                showAlert(alert, error.message);
            }
        });

        codeMode.addEventListener('click', () => {
            backupMode = !backupMode;
            codeInput.value = '';
            codeInput.classList.toggle('is-text', backupMode);
            codeInput.setAttribute('inputmode', backupMode ? 'text' : 'numeric');
            codeInput.setAttribute('autocomplete', backupMode ? 'off' : 'one-time-code');
            codeInput.setAttribute('maxlength', backupMode ? '20' : '6');
            codeInput.setAttribute('placeholder', backupMode ? 'XXXX-XXXX' : '000000');
            if (backupMode) codeInput.removeAttribute('pattern'); else codeInput.setAttribute('pattern', '[0-9]{6}');
            root.querySelector('[data-code-label]').textContent = backupMode ? 'Backup code' : 'Authentication code';
            root.querySelector('[data-code-help]').textContent = backupMode
                ? 'Enter one of your unused recovery codes. It will stop working once used.'
                : 'Enter the 6-digit code from your authenticator app.';
            codeMode.textContent = backupMode ? 'Use your authenticator app instead' : 'Use a backup code instead';
            hideAlert(codeAlert);
            codeInput.focus();
        });

        codeInput.addEventListener('input', () => {
            if (!backupMode) {
                codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 6);
                if (codeInput.value.length === 6) twoFactorForm.requestSubmit();
            }
        });

        twoFactorForm.addEventListener('submit', async event => {
            event.preventDefault();
            hideAlert(codeAlert);
            const code = codeInput.value.trim();
            if (backupMode ? code.length < 6 : !/^\d{6}$/.test(code)) {
                showAlert(codeAlert, backupMode ? 'Enter a complete backup code.' : 'Enter all 6 digits.');
                codeInput.focus();
                return;
            }
            const button = twoFactorForm.querySelector('[type="submit"]');
            setLoading(button, true, 'Verifying…');
            try {
                const result = await global.Willow.api('/auth/2fa', { method: 'POST', body: { code } });
                succeed(result.redirect || '/dashboard');
            } catch (error) {
                setLoading(button, false);
                const data = error.data || {};
                if (data.code === 'session_timeout') return restart(error.message);
                if (data.code === 'locked' || error.status === 429) return lock(error.message);
                codeInput.value = '';
                codeInput.focus();
                showAlert(codeAlert, error.message);
                shake(twoFactorForm);
            }
        });

        setupGuestStart(root, succeed);
        if (!email.value) email.focus({ preventScroll: true });
    }

    // "Explore as a guest" starts a temporary, empty profile — no details needed; the sample
    // option (data-demo-kind="sample") starts one with four months of labelled example activity.
    function setupGuestStart(root, done) {
        root.querySelectorAll('[data-demo-start]').forEach(button => button.addEventListener('click', async () => {
            if (button.getAttribute('aria-busy') === 'true') return;
            const view = button.closest('[data-auth-view], [data-step]') || root;
            const errorBox = view.querySelector('[data-demo-error]') || root.querySelector('[data-demo-error]');
            hideAlert(errorBox);
            button.classList.add('is-loading');
            button.setAttribute('aria-busy', 'true');
            const description = button.querySelector('[data-demo-text]');
            const original = description ? description.textContent : '';
            const sample = button.dataset.demoKind === 'sample';
            if (description) description.textContent = sample ? 'Preparing your sample profile…' : 'Opening your guest profile…';
            try {
                const result = await global.Willow.api(sample ? '/auth/sample' : '/auth/demo', { method: 'POST', body: {}, timeout: 45000 });
                done(result.redirect || '/dashboard');
            } catch (error) {
                if (description) description.textContent = original;
                button.classList.remove('is-loading');
                button.removeAttribute('aria-busy');
                showAlert(errorBox, error.message);
            }
        }));
    }

    // ── Sign up ─────────────────────────────────────────────────────────
    const PASSWORD_RULES = {
        length: value => value.length >= 8,
        upper: value => /[A-Z]/.test(value),
        lower: value => /[a-z]/.test(value),
        number: value => /[0-9]/.test(value),
    };
    const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

    function setupRegister(root) {
        const form = doc.getElementById('registerForm');
        const steps = [...root.querySelectorAll('[data-step]')];
        const names = steps.map(step => step.dataset.step);
        const labels = [...root.querySelectorAll('[data-step-name]')].map(item => item.textContent.trim());
        const back = root.querySelector('[data-step-back]');
        const alert = root.querySelector('[data-register-alert]');
        const submit = form.querySelector('[type="submit"]');
        const field = name => form.elements[name];
        let current = 0;
        let created = false;
        let registering = false;

        function go(index, { focus = true } = {}) {
            current = Math.max(0, Math.min(index, steps.length - 1));
            steps.forEach((step, i) => {
                step.hidden = i !== current;
                step.classList.toggle('is-active', i === current);
            });
            root.querySelectorAll('[data-step-dot]').forEach((dot, i) => {
                dot.classList.toggle('is-done', i < current);
                dot.classList.toggle('is-current', i === current);
            });
            root.querySelectorAll('[data-step-name]').forEach((item, i) => {
                item.classList.toggle('is-done', i < current);
                item.classList.toggle('is-current', i === current);
            });
            root.querySelector('[data-step-label]').textContent = `Step ${current + 1} of ${steps.length} · ${labels[current]}`;
            back.hidden = current === 0 || created;
            if (names[current] === 'verify') fillReview();
            const title = steps[current].querySelector('.auth-title');
            if (focus && title) title.focus({ preventScroll: true });
            global.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' });
        }

        function fillReview() {
            const type = form.querySelector('input[name="accountType"]:checked');
            const values = {
                fullName: field('fullName').value.trim(),
                email: field('email').value.trim().toLowerCase(),
                country: field('country').value,
                accountType: type && type.value === 'business' ? 'Personal + business' : 'Personal',
            };
            root.querySelectorAll('[data-review-field]').forEach(item => { item.textContent = values[item.dataset.reviewField] || '—'; });
        }

        const validators = {
            welcome: () => true,
            personal() {
                const name = field('fullName');
                const email = field('email');
                const phone = field('phone');
                const country = field('country');
                const cleanedPhone = phone.value.replace(/[\s\-().+]/g, '');
                const results = [
                    fieldError(name, name.value.trim().length >= 2 ? '' : 'Enter your full name.'),
                    fieldError(email, EMAIL.test(email.value.trim()) ? '' : 'Enter a valid email address, like name@example.com.'),
                    fieldError(phone, !phone.value.trim() || /^\d{7,15}$/.test(cleanedPhone) ? '' : 'Enter a phone number with 7–15 digits, or leave it blank.'),
                    fieldError(country, country.value ? '' : 'Choose your country of residence.'),
                ];
                return results.every(Boolean);
            },
            account: () => Boolean(form.querySelector('input[name="accountType"]:checked')),
            security() {
                const password = field('password');
                const confirm = field('confirmPassword');
                const terms = field('terms');
                const strong = Object.values(PASSWORD_RULES).every(rule => rule(password.value)) && new TextEncoder().encode(password.value).length <= 72;
                const termsError = doc.getElementById('termsError');
                termsError.textContent = terms.checked ? '' : 'Please confirm you understand this is a demonstration.';
                termsError.hidden = terms.checked;
                const results = [
                    fieldError(password, strong ? '' : 'Your password needs all four of the items above.'),
                    fieldError(confirm, confirm.value && confirm.value === password.value ? '' : 'The passwords don’t match.'),
                    terms.checked,
                ];
                return results.every(Boolean);
            },
        };

        function next() {
            const name = names[current];
            const valid = validators[name] ? validators[name]() : true;
            if (!valid) {
                const invalid = steps[current].querySelector('[aria-invalid="true"], input[name="terms"]:not(:checked)');
                if (invalid) invalid.focus();
                shake(steps[current]);
                return;
            }
            go(current + 1);
        }

        root.querySelectorAll('[data-step-next]').forEach(button => button.addEventListener('click', next));
        back.addEventListener('click', () => go(current - 1));
        root.querySelectorAll('[data-step-go]').forEach(button => button.addEventListener('click', () => go(names.indexOf(button.dataset.stepGo))));

        // Enter in a text field advances instead of submitting the whole form.
        form.addEventListener('keydown', event => {
            if (event.key !== 'Enter' || event.target.tagName === 'BUTTON' || event.target.tagName === 'A') return;
            if (names[current] === 'verify') return;
            event.preventDefault();
            next();
        });

        form.querySelectorAll('input, select').forEach(input => input.addEventListener('input', () => {
            if (input.id) fieldError(input, '');
        }));

        const password = field('password');
        const strength = root.querySelector('[data-strength]');
        password.addEventListener('input', () => {
            const value = password.value;
            let met = 0;
            Object.entries(PASSWORD_RULES).forEach(([key, rule]) => {
                const ok = rule(value);
                if (ok) met += 1;
                root.querySelector(`[data-rule="${key}"]`).classList.toggle('is-met', ok);
            });
            const bonus = value.length >= 12 && /[^A-Za-z0-9]/.test(value) ? 1 : 0;
            strength.dataset.level = value ? String(Math.min(4, Math.max(1, met - 1 + bonus))) : '0';
        });

        async function runChecks() {
            const checks = [...root.querySelectorAll('[data-kyc-check]')];
            const status = root.querySelector('[data-kyc-status]');
            checks.forEach(check => check.classList.remove('is-running', 'is-done'));
            for (const check of checks) {
                check.classList.add('is-running');
                status.textContent = `Checking: ${check.querySelector('strong').textContent}`;
                await wait(650);
                check.classList.remove('is-running');
                check.classList.add('is-done');
            }
            status.textContent = 'Simulated checks complete. Opening your account.';
        }

        form.addEventListener('submit', async event => {
            event.preventDefault();
            if (names[current] !== 'verify' || created || registering) return;
            hideAlert(alert);
            if (!validators.personal()) return go(names.indexOf('personal'));
            if (!validators.security()) return go(names.indexOf('security'));
            registering = true;
            setLoading(submit, true, 'Verifying…');
            back.hidden = true;
            try {
                const type = form.querySelector('input[name="accountType"]:checked');
                const body = {
                    fullName: field('fullName').value.trim(),
                    email: field('email').value.trim(),
                    phone: field('phone').value.trim(),
                    country: field('country').value,
                    password: field('password').value,
                    accountType: type ? type.value : 'personal',
                };
                const [result] = await Promise.all([
                    global.Willow.api('/auth/register', { method: 'POST', body, timeout: 45000 }),
                    runChecks(),
                ]);
                created = true;
                const topLink = doc.querySelector('.auth-top-link');
                if (topLink) topLink.hidden = true;
                const first = body.fullName.split(/\s+/)[0];
                root.querySelector('[data-done-name]').textContent = first ? `, ${first}` : '';
                root.querySelector('[data-done-customer-id]').textContent = result.customerId || '';
                root.querySelector('[data-done-continue]').href = result.redirect || '/dashboard?welcome=1';
                field('password').value = '';
                field('confirmPassword').value = '';
                go(names.indexOf('done'));
            } catch (error) {
                setLoading(submit, false);
                root.querySelectorAll('[data-kyc-check]').forEach(check => check.classList.remove('is-running', 'is-done'));
                const message = error.message || 'We couldn’t open your account. Please try again.';
                if (error.data?.code === 'account_created') {
                    created = true;
                    showAlert(alert, message);
                    submit.hidden = true;
                    alert.append(global.Willow.el('a', { className: 'btn btn-primary btn-sm', href: '/login', text: 'Sign in to your account' }));
                } else if (/email/i.test(message)) {
                    go(names.indexOf('personal'));
                    fieldError(field('email'), message);
                    field('email').focus();
                    if (error.data?.code === 'email_in_use') {
                        const errorNode = doc.getElementById('emailError');
                        errorNode.append(' ', global.Willow.el('a', { href: '/login', text: 'Sign in' }), ' or ', global.Willow.el('a', { href: '/forgot-password', text: 'recover access' }));
                    }
                } else if (/password/i.test(message)) {
                    go(names.indexOf('security'));
                    fieldError(field('password'), message);
                    field('password').focus();
                } else if (/name/i.test(message)) {
                    go(names.indexOf('personal'));
                    fieldError(field('fullName'), message);
                    field('fullName').focus();
                } else if (/phone/i.test(message)) {
                    go(names.indexOf('personal'));
                    fieldError(field('phone'), message);
                    field('phone').focus();
                } else {
                    back.hidden = false;
                    showAlert(alert, message);
                }
            } finally {
                registering = false;
            }
        });

        go(0, { focus: false });
    }

    // ── Password recovery ───────────────────────────────────────────────
    function setupRecovery(root) {
        const show = switcher(root);
        const form = doc.getElementById('recoveryForm');
        const alert = root.querySelector('[data-auth-alert]');
        const submit = form.querySelector('[type="submit"]');
        form.addEventListener('submit', async event => {
            event.preventDefault();
            hideAlert(alert);
            const body = Object.fromEntries(new FormData(form));
            if (!body.email.trim() || !body.recoveryCode.trim() || !body.newPassword) {
                showAlert(alert, 'Fill in your email, a recovery code and a new password.');
                return;
            }
            if (!Object.values(PASSWORD_RULES).every(rule => rule(body.newPassword))) {
                showAlert(alert, 'Your new password needs at least 8 characters, with an uppercase letter, a lowercase letter and a number.');
                return;
            }
            if (body.newPassword !== body.confirmPassword) {
                showAlert(alert, 'New passwords do not match.');
                return;
            }
            setLoading(submit, true, 'Resetting…');
            try {
                const result = await global.Willow.api('/auth/reset-password', { method: 'POST', body });
                form.reset();
                show('success');
                global.setTimeout(() => goTo(result.redirect || '/login?reset=success'), reduced() ? 400 : 2400);
            } catch (error) {
                setLoading(submit, false);
                showAlert(alert, error.message || 'Could not reset your password. Please try again.');
                shake(form);
            }
        });
    }

    function init() {
        setupScenes(doc.querySelector('[data-auth-scenes]'));
        const login = doc.querySelector('[data-login]');
        const register = doc.querySelector('[data-register]');
        const recovery = doc.querySelector('[data-recovery]');
        if (login) setupLogin(login);
        if (register) {
            setupRegister(register);
            setupGuestStart(register, goTo);
        }
        if (recovery) setupRecovery(recovery);
    }

    global.WillowAuth = { setupScenes, PASSWORD_RULES };
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
    else init();
})(window);
