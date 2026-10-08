/**
 * Willow — main server
 */
const config = require('./src/config');
const { initializeDatabase, closeDatabase } = require('./src/database');
const { initializeAdmin } = require('./src/services/auth');
const { createApp } = require('./src/app');
const SQLiteSessionStore = require('./src/session-store');

// Sessions are kept next to the database (DATABASE_PATH), so a separate database never shares them.
const sessionStore = new SQLiteSessionStore({ db: 'sessions.db', dir: config.paths.local });
const app = createApp({ sessionStore });

// Startup
async function start() {
    try {
        console.log('[Server] Initializing database...');
        await initializeDatabase();
        await sessionStore._ready;
        const rotation = require('./src/services/two-factor').rotateStoredSecrets();
        if (rotation.rotated && !require('./src/database').flushDatabase()) throw new Error('Could not persist rotated authenticator secrets.');

        console.log('[Server] Checking admin account...');
        await initializeAdmin();

        // Start the Python market-data service (yfinance) if it isn't already running.
        // Runs in the background: pages work immediately and market data switches over when ready.
        const marketService = require('./src/services/market-service');
        const marketData = require('./src/services/market-data');
        marketService.start()
            .catch(error => console.error('[Market service] Could not start:', error.message))
            // Load market and currency quotes once now, so the first visit to those pages is quick.
            .then(() => Promise.all([marketData.getMarkets(), marketData.getFxRates()]))
            .catch(() => { /* pages fall back to cached or saved prices the same way */ });
        // The local model for the assistant, if Ollama is running.
        require('./src/services/assistant').refreshStatus().then(status => {
            const why = { unreachable: 'Ollama is not running', no_models: 'Ollama has no model yet', model_missing: `OLLAMA_MODEL "${config.assistant.model}" is not installed`, disabled: 'ASSISTANT_ENABLED=false' }[status.reason] || status.reason;
            const message = status.reason === 'disabled' ? 'Ask Willow is turned off (ASSISTANT_ENABLED=false).'
                : status.available ? `Ask Willow is using AI: ${status.model} via Ollama.`
                    : `Ask Willow gives quick answers from each customer's figures (${why}). For full AI answers, install Ollama from https://ollama.com and run "ollama pull llama3.2"; Willow notices within 30 seconds.`;
            console.log(`[Assistant] ${message}`);
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
