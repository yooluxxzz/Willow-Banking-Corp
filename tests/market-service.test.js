const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');

/**
 * The supervisor that starts the Python market-data service with Willow. A stand-in
 * "python" (a small shell script) lets this run without Python installed: asked to
 * import yfinance it succeeds, asked to run server.py it serves /health via Node.
 */
describe('Python market-data bridge supervisor', () => {
    let dir, supervisor, port;
    const freePort = () => new Promise(resolve => { const srv = net.createServer(); srv.listen(0, '127.0.0.1', () => { const { port: p } = srv.address(); srv.close(() => resolve(p)); }); });

    before(async () => {
        port = await freePort();
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'willow-bridge-'));
        // Like the real service: /health is open, everything else needs the secret (400 = authorised but no symbols).
        const server = `require('http').createServer((q, s) => { if (q.url === '/health') { s.end(JSON.stringify({ status: 'ok', token: Boolean(process.env.MARKET_DATA_TOKEN) })); } else { s.statusCode = q.headers['x-willow-service-token'] === process.env.MARKET_DATA_TOKEN ? 400 : 401; s.end('{}'); } }).listen(Number(process.env.MARKET_DATA_PORT), process.env.MARKET_DATA_HOST); process.on('SIGTERM', () => process.exit(0));`;
        fs.writeFileSync(path.join(dir, 'server.js'), server);
        const fake = path.join(dir, 'python');
        fs.writeFileSync(fake, `#!/bin/sh\nif [ "$1" = "-c" ]; then echo "3.11.0"; exit 0; fi\nexec "${process.execPath}" "${path.join(dir, 'server.js')}"\n`);
        fs.chmodSync(fake, 0o755);
        process.env.PYTHON = fake;
        process.env.MARKET_DATA_PROVIDER = 'auto';
        process.env.MARKET_DATA_SERVICE_URL = `http://127.0.0.1:${port}`;
        process.env.MARKET_SERVICE_LOG = 'quiet';
        process.env.MARKET_DATA_TOKEN_FILE = path.join(dir, '.market-data-token');
        delete process.env.MARKET_DATA_TOKEN;
        delete process.env.MARKET_SERVICE_AUTOSTART;
        supervisor = require('../src/services/market-service');
    });
    after(() => {
        supervisor.stop();
        fs.rmSync(dir, { recursive: true, force: true });
        process.env.MARKET_DATA_PROVIDER = 'yahoo-chart';
    });

    it('starts the service, secures the bridge with a generated token, and restarts it if it exits', async () => {
        assert.equal(await supervisor.healthy(), false);
        const status = await supervisor.start();
        assert.equal(status.managed, true);
        assert.equal(status.running, true);
        assert.match(process.env.MARKET_DATA_TOKEN, /^[a-f0-9]{48}$/, 'a shared secret is generated for the bridge');
        const health = await (await fetch(`http://127.0.0.1:${port}/health`)).json();
        assert.deepEqual(health, { status: 'ok', token: true });

        const firstPid = status.pid;
        process.kill(firstPid, 'SIGKILL');
        let restarted = null;
        for (let i = 0; i < 40 && !restarted; i += 1) {
            await new Promise(resolve => setTimeout(resolve, 150));
            const now = supervisor.status();
            if (now.running && now.pid && now.pid !== firstPid && await supervisor.healthy()) restarted = now;
        }
        assert.ok(restarted, 'the service came back after exiting');
        assert.equal(restarted.restarts, 1);
    });

    it('reuses a service that is already running instead of starting a second one', async () => {
        const again = await supervisor.start();
        assert.equal(again.restarts, 1);
        assert.equal(again.running, true);
        assert.equal(again.lastError, null);
    });

    it('keeps the generated secret with the data so a later run can reuse a service that is still up', () => {
        assert.equal(fs.readFileSync(process.env.MARKET_DATA_TOKEN_FILE, 'utf8'), process.env.MARKET_DATA_TOKEN);
    });

    it('does not reuse a running service that rejects its secret', async () => {
        const otherPort = await freePort();
        const other = require('http').createServer((q, s) => { s.statusCode = q.url === '/health' ? 200 : 401; s.end('{}'); });
        await new Promise(resolve => other.listen(otherPort, '127.0.0.1', resolve));
        const url = process.env.MARKET_DATA_SERVICE_URL;
        process.env.MARKET_DATA_SERVICE_URL = `http://127.0.0.1:${otherPort}`;
        try {
            const result = await supervisor.start();
            assert.equal(result.lastError, 'token_mismatch');
        } finally {
            process.env.MARKET_DATA_SERVICE_URL = url;
            await new Promise(resolve => other.close(resolve));
        }
    });
});
