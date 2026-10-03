/**
 * Willow — main server
 */
const path = require('path');
const config = require('./src/config');
const { initializeDatabase, closeDatabase } = require('./src/database');
const { initializeAdmin } = require('./src/services/auth');
const { createApp } = require('./src/app');
const SQLiteSessionStore = require('./src/session-store');

const sessionStore = new SQLiteSessionStore({ db: 'sessions.db', dir: path.resolve(config.paths.root, 'data') });
const app = createApp({ sessionStore });

// Startup
async function start() {
    try {
        console.log('[Server] Initializing database...');
        await initializeDatabase();

        console.log('[Server] Checking admin account...');
        await initializeAdmin();

        // Start the Python market-data service (yfinance) if it isn't already running.
        // Runs in the background: pages work immediately and market data switches over when ready.
        const marketService = require('./src/services/market-service');
        marketService.start().catch(error => console.error('[Market service] Could not start:', error.message));
        // The local model for the assistant, if Ollama is running.
        require('./src/services/assistant').refreshStatus().then(status => {
            const why = { unreachable: 'Ollama is not running', no_models: 'Ollama has no model yet', model_missing: `OLLAMA_MODEL "${config.assistant.model}" is not installed`, disabled: 'ASSISTANT_ENABLED=false' }[status.reason] || status.reason;
            console.log(status.available
                ? `[Assistant] Ask Willow is on, using ${status.model} via Ollama.`
                : `[Assistant] Ask Willow is off (${why}). To turn it on: install Ollama from https://ollama.com and run "ollama pull llama3.2"; Willow notices within 30 seconds.`);
        });

        // Scheduled transfers, the nightly budget check, guest clean-up and deletions.
        const stopJobs = require('./src/services/jobs').startJobs();

        const server = app.listen(config.port, () => {
            console.log(`[Server] Willow Banking Corp. running at http://localhost:${config.port}`);
            console.log(`[Server] Environment: ${config.nodeEnv}`);

            const { exec } = require('child_process');
            const os = require('os');
            const url = `http://localhost:${config.port}`;
            const cmd = os.platform() === 'win32' ? `start "" "${url}"` : (os.platform() === 'darwin' ? `open ${url}` : `xdg-open ${url}`);
            if (process.env.OPEN_BROWSER === 'true') {
                exec(cmd).on('error', e => console.log('[Server] Failed to auto-open browser:', e.message));
            }
        });

        server.on('error', error => {
            if (error.code === 'EADDRINUSE') {
                console.error(`[Server] Port ${config.port} is already in use (is Willow already running?). Stop the other program, or start on another port:`);
                console.error('[Server]   macOS/Linux:  PORT=3001 npm start');
                console.error('[Server]   Windows (PowerShell):  $env:PORT=3001; npm start');
                console.error('[Server]   Windows (Command Prompt):  set PORT=3001 && npm start');
            } else {
                console.error('[Server] Could not start the web server:', error.message);
            }
            require('./src/services/market-service').stop();
            process.exit(1);
        });

        // Graceful shutdown
        const shutdown = (signal) => {
            console.log(`\n[Server] Received ${signal}. Shutting down gracefully...`);
            stopJobs();
            require('./src/services/market-service').stop();
            server.close(() => {
                sessionStore.close();
                closeDatabase();
                console.log('[Server] Shutdown complete.');
                process.exit(0);
            });
            setTimeout(() => {
                console.error('[Server] Forced shutdown after timeout.');
                process.exit(1);
            }, 10000);
        };

        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));

    } catch (err) {
        console.error('[Server] Failed to start:', err);
        process.exit(1);
    }
}

start();
