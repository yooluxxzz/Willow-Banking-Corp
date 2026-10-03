/**
 * Python ↔ Node bridge supervisor.
 *
 * Willow's market data comes from the Python service in market-data-service/
 * (yfinance), which the Node app calls over HTTP. So nobody has to start it by
 * hand, the server starts it as a child process when it isn't already running:
 *
 *   - checks <service>/health first and reuses a service that is already up;
 *   - checks that Python and yfinance are installed, and explains how to install
 *     them if not (Willow then falls back to the Yahoo chart endpoint);
 *   - generates a shared secret for the bridge when MARKET_DATA_TOKEN isn't set;
 *   - restarts the service with backoff if it exits, and gives up after repeated
 *     quick crashes;
 *   - stops it when Willow stops.
 *
 * Disable with MARKET_SERVICE_AUTOSTART=false. Only local service URLs are managed.
 */
const { spawn, spawnSync } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const config = require('../config');

const DEFAULT_URL = 'http://127.0.0.1:8765';
const QUICK_EXIT_MS = 10000;
const MAX_QUICK_EXITS = 4;
const state = { managed: false, running: false, pid: null, restarts: 0, quickExits: 0, startedAt: null, lastError: null, python: null, stopping: false };
let child = null;
let restartTimer = null;

const log = (...args) => console.log('[Market service]', ...args);

function serviceUrl() {
    return new URL(process.env.MARKET_DATA_SERVICE_URL || DEFAULT_URL);
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

/** Finds a Python interpreter that can import yfinance. */
function findPython() {
    const candidates = [process.env.PYTHON, 'python3', 'python'].filter(Boolean);
    for (const command of candidates) {
        const probe = spawnSync(command, ['-c', 'import sys, yfinance; print(sys.version.split()[0])'], { encoding: 'utf8', timeout: 20000 });
        if (probe.status === 0) return { command, version: probe.stdout.trim() };
        if (probe.error && probe.error.code === 'ENOENT') continue;
        if (/No module named/.test(probe.stderr || '')) return { command, missing: 'yfinance' };
    }
    return null;
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
        PYTHONUNBUFFERED: '1',
    };
    const script = path.join(config.paths.root, 'market-data-service', 'server.py');
    child = spawn(state.python, [script], { env, stdio: ['ignore', 'pipe', 'pipe'] });
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
    if (await healthy()) {
        log(`Already running at ${url.origin}; using it.`);
        return status();
    }
    const python = findPython();
    if (!python) {
        log('Python 3 was not found, so live market data uses the Yahoo chart fallback. Install Python 3.9+ to enable the yfinance service.');
        state.lastError = 'python_missing';
        return status();
    }
    if (python.missing) {
        log(`yfinance isn't installed for ${python.command}. Run: ${python.command} -m pip install -r market-data-service/requirements.txt`);
        state.lastError = 'yfinance_missing';
        return status();
    }
    // The bridge is authenticated: the service only answers requests carrying this secret.
    if (!process.env.MARKET_DATA_TOKEN) process.env.MARKET_DATA_TOKEN = crypto.randomBytes(24).toString('hex');
    state.python = python.command;
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

module.exports = { start, stop, status, healthy };
