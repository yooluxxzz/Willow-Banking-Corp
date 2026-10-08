/**
 * Python ↔ Node bridge supervisor.
 *
 * Willow's market data comes from the Python service in market-data-service/
 * (yfinance), which the Node app calls over HTTP. So nobody has to start it by
 * hand, the server starts it as a child process when it isn't already running:
 *
 *   - checks <service>/health first and reuses a service that is already up,
 *     once it has confirmed that service accepts this copy's secret;
 *   - checks that Python and yfinance are installed, and explains how to install
 *     them if not (Willow then falls back to the Yahoo chart endpoint);
 *   - secures the bridge with a shared secret: MARKET_DATA_TOKEN, or one generated
 *     once and kept in data/.market-data-token so later runs can reuse a service
 *     that is still up;
 *   - restarts the service with backoff if it exits, and gives up after repeated
 *     quick crashes;
 *   - stops it when Willow stops, and the service also exits by itself if Willow
 *     is killed (it watches the pipe Willow holds open), so nothing is left behind.
 *
 * Disable with MARKET_SERVICE_AUTOSTART=false. Only local service URLs are managed.
 */
const { spawn, execFile } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('../config');

const DEFAULT_URL = 'http://127.0.0.1:8765';
const QUICK_EXIT_MS = 10000;
const MAX_QUICK_EXITS = 4;
const state = { managed: false, running: false, pid: null, restarts: 0, quickExits: 0, startedAt: null, lastError: null, python: null, pythonArgs: [], stopping: false };
let child = null;
let restartTimer = null;

const log = (...args) => console.log('[Market service]', ...args);

function serviceUrl() {
    return new URL(process.env.MARKET_DATA_SERVICE_URL || DEFAULT_URL);
}

/** The bridge secret: MARKET_DATA_TOKEN, or one generated once and kept with the database. */
function tokenFile() {
    if (process.env.MARKET_DATA_TOKEN_FILE) return path.resolve(process.env.MARKET_DATA_TOKEN_FILE);
    if (config.database.path === ':memory:') return null;
    return path.join(config.paths.local, '.market-data-token');
}

function ensureToken() {
    if (process.env.MARKET_DATA_TOKEN) return process.env.MARKET_DATA_TOKEN;
    const file = tokenFile();
    let token;
    try { token = file ? fs.readFileSync(file, 'utf8').trim() : ''; } catch (error) { token = ''; }
    if (!/^[a-f0-9]{48}$/.test(token)) {
        token = crypto.randomBytes(24).toString('hex');
        if (file) {
            try {
                fs.mkdirSync(path.dirname(file), { recursive: true });
                fs.writeFileSync(file, token, { mode: 0o600 });
            } catch (error) { /* an unsaved secret still works for this run */ }
        }
    }
    process.env.MARKET_DATA_TOKEN = token;
    return token;
}

/**
 * True when the running service accepts our secret. A request without symbols is
 * answered locally (400) when authorised and refused (401) otherwise, so this
 * never reaches Yahoo.
 */
async function acceptsToken(token, timeoutMs = 1500) {
    try {
        const response = await fetch(new URL('/v1/quotes', serviceUrl()), { headers: { 'X-Willow-Service-Token': token }, signal: AbortSignal.timeout(timeoutMs) });
        return response.status !== 401;
    } catch (error) {
        return false;
    }
}

async function healthy(timeoutMs = 1500) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(new URL('/health', serviceUrl()), { signal: controller.signal });
        return response.ok;
    } catch (error) {
        return false;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Finds a Python 3 interpreter that can import yfinance. Tries PYTHON, then
 * python3 and python, and on Windows the `py -3` launcher.
 */
async function findPython() {
    const candidates = [
        process.env.PYTHON && [process.env.PYTHON, []],
        ['python3', []],
        ['python', []],
        process.platform === 'win32' && ['py', ['-3']],
    ].filter(Boolean);
    // Runs asynchronously: importing yfinance (and pandas) can take a while on first use,
    // and Willow keeps serving pages meanwhile.
    const probe = (command, args) => new Promise(resolve => {
        execFile(command, [...args, '-c', 'import sys; assert sys.version_info >= (3, 10); import yfinance; print(sys.version.split()[0])'], { timeout: 30000, windowsHide: true }, (error, stdout, stderr) => {
            resolve({ ok: !error, stdout: String(stdout || ''), stderr: String(stderr || '') });
        });
    });
    let missing = null;
    for (const [command, args] of candidates) {
        const result = await probe(command, args);
        if (result.ok) return { command, args, version: result.stdout.trim() };
        if (!missing && /No module named/.test(result.stderr)) missing = { command, args, missing: 'yfinance' };
    }
    return missing;
}

function launch() {
    const url = serviceUrl();
    const env = {
        ...process.env,
        MARKET_DATA_HOST: url.hostname,
        MARKET_DATA_PORT: url.port || '80',
        MARKET_DATA_TOKEN: process.env.MARKET_DATA_TOKEN,
        // One log line per request is noise in Willow's console; warnings and errors still show.
        MARKET_DATA_LOG_LEVEL: process.env.MARKET_DATA_LOG_LEVEL || 'WARNING',
        // The service exits when this pipe closes, i.e. when Willow stops for any reason.
        MARKET_DATA_EXIT_WITH_PARENT: '1',
        PYTHONUNBUFFERED: '1',
    };
    const script = path.join(config.paths.root, 'market-data-service', 'server.py');
    child = spawn(state.python, [...state.pythonArgs, script], { env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    child.stdin.on('error', () => {}); // the service closing its end first is fine
    state.running = true;
    state.pid = child.pid;
    state.startedAt = Date.now();
    log(`Started (pid ${child.pid}) at ${url.origin}.`);
    const relay = stream => stream.on('data', chunk => String(chunk).split('\n').filter(Boolean).forEach(line => {
        if (/error|exception|traceback/i.test(line)) state.lastError = line.slice(0, 300);
        if (process.env.MARKET_SERVICE_LOG !== 'quiet') console.log(`[Market service] ${line}`);
    }));
    relay(child.stdout);
    relay(child.stderr);
    child.on('exit', (code, signal) => {
        state.running = false;
        state.pid = null;
        child = null;
        if (state.stopping) return;
        const quick = Date.now() - state.startedAt < QUICK_EXIT_MS;
        state.quickExits = quick ? state.quickExits + 1 : 0;
        if (state.quickExits >= MAX_QUICK_EXITS) {
            log(`Stopped restarting after ${state.quickExits} quick exits (last: ${signal || `code ${code}`}). Market data falls back to the Yahoo chart endpoint.`);
            return;
        }
        const delay = Math.min(60000, 2000 * 2 ** state.quickExits);
        log(`Exited (${signal || `code ${code}`}). Restarting in ${Math.round(delay / 1000)}s.`);
        state.restarts += 1;
        restartTimer = setTimeout(launch, delay);
        restartTimer.unref();
    });
}

/** Starts the Python service if it should be managed here. Resolves with the current status. */
async function start() {
    const mode = (process.env.MARKET_DATA_PROVIDER || 'auto').toLowerCase();
    if (process.env.MARKET_SERVICE_AUTOSTART === 'false' || !['auto', 'service'].includes(mode)) return status();
    const url = serviceUrl();
    if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname)) return status();
    const token = ensureToken();
    if (await healthy()) {
        if (await acceptsToken(token)) {
            log(`Already running at ${url.origin}; using it.`);
        } else {
            state.lastError = 'token_mismatch';
            log(`A market-data service is already running at ${url.origin} but doesn't accept this copy's secret (it was probably started by another Willow folder). Stop that process, or set MARKET_DATA_SERVICE_URL to another port. Until then quotes come from the Yahoo chart fallback.`);
        }
        return status();
    }
    const python = await findPython();
    if (!python) {
        log('Python 3.10+ was not found, so live market data uses the Yahoo chart fallback. Install Python 3.10+ to enable the yfinance service.');
        state.lastError = 'python_missing';
        return status();
    }
    if (python.missing) {
        log(`yfinance isn't installed for ${[python.command, ...python.args].join(' ')}. Run: ${[python.command, ...python.args].join(' ')} -m pip install -r market-data-service/requirements.txt`);
        state.lastError = 'yfinance_missing';
        return status();
    }
    state.python = python.command;
    state.pythonArgs = python.args;
    state.managed = true;
    launch();
    for (let attempt = 0; attempt < 20 && state.running; attempt += 1) {
        if (await healthy(1000)) { log(`Ready (Python ${python.version}).`); break; }
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    return status();
}

function stop() {
    state.stopping = true;
    if (restartTimer) clearTimeout(restartTimer);
    if (child) {
        child.kill('SIGTERM');
        const pending = child;
        setTimeout(() => { if (pending.exitCode === null) pending.kill('SIGKILL'); }, 3000).unref();
    }
}

function status() {
    return { managed: state.managed, running: state.running, pid: state.pid, restarts: state.restarts, lastError: state.lastError, url: serviceUrl().origin };
}

/** Whether a usable local market-data service is healthy and accepts this copy's token. */
async function ready(timeoutMs = 1500) {
    const mode = (process.env.MARKET_DATA_PROVIDER || 'auto').toLowerCase();
    if (process.env.MARKET_SERVICE_AUTOSTART === 'false' || !['auto', 'service'].includes(mode)) return false;
    const url = serviceUrl();
    if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname)) return false;
    const token = ensureToken();
    return (await healthy(timeoutMs)) && (await acceptsToken(token, timeoutMs));
}

module.exports = { start, stop, status, healthy, ready };
