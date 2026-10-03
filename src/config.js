require('dotenv').config();
const path = require('path');

function parseTrustProxy(raw) {
  const value = String(raw || '').trim();
  if (!value || value === 'false' || value === '0') return false;
  if (value === 'true') return true;
  return /^\d+$/.test(value) ? Number(value) : value;
}

const config = {
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: (process.env.NODE_ENV || 'development') === 'development',

  session: {
    secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    // Guest profiles unused for this many days are removed (0 keeps them).
    guestRetentionDays: process.env.GUEST_RETENTION_DAYS === undefined ? 7 : Math.max(0, parseInt(process.env.GUEST_RETENTION_DAYS, 10) || 0),
    // Signed-in sessions end after this long without a request (0 disables).
    idleTimeoutMs: (process.env.SESSION_IDLE_MINUTES === undefined ? 30 : Math.max(0, parseInt(process.env.SESSION_IDLE_MINUTES, 10) || 0)) * 60 * 1000,
  },

  admin: {
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
  },

  database: {
    path: process.env.DATABASE_PATH || './data/willow.db',
    // Versioned SQL copy of the data (npm run db:save). Restored automatically when no database exists yet.
    snapshotPath: process.env.DATABASE_SNAPSHOT_PATH || './data/willow-snapshot.sql',
    autoRestore: process.env.SNAPSHOT_AUTO_RESTORE !== 'false',
  },

  jobs: {
    // Daily budget checks and net-worth snapshots run at this local time (24-hour HH:MM).
    nightlyTime: /^([01]?\d|2[0-3]):[0-5]\d$/.test(process.env.NIGHTLY_CHECK_TIME || '') ? process.env.NIGHTLY_CHECK_TIME : '23:55',
  },

  assistant: {
    // The assistant runs on a local Ollama server and only appears while it is reachable.
    enabled: process.env.ASSISTANT_ENABLED !== 'false',
    ollamaUrl: (process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/+$/, ''),
    // Empty: use the first model installed in Ollama.
    model: process.env.OLLAMA_MODEL || '',
    timeoutMs: parseInt(process.env.OLLAMA_TIMEOUT_MS, 10) || 120000,
  },

  // Only trust X-Forwarded-For when a reverse proxy is in front (TRUST_PROXY=1, 'loopback', …).
  // Without one, trusting it would let any client choose its own IP and skip the rate limits.
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
    authMax: parseInt(process.env.AUTH_RATE_LIMIT_MAX, 10) || 10,
    apiMax: parseInt(process.env.API_RATE_LIMIT_MAX, 10) || 240,
    publicApiMax: parseInt(process.env.PUBLIC_API_RATE_LIMIT_MAX, 10) || 60,
  },

  bcryptRounds: 12,

  currency: 'USD',

  limits: {
    dailyWithdrawalCents: parseInt(process.env.DAILY_WITHDRAWAL_LIMIT_CENTS, 10) || 1000000, // $10,000
    dailyTransferCents: parseInt(process.env.DAILY_TRANSFER_LIMIT_CENTS, 10) || 2500000,    // $25,000
    dailyDepositCents: parseInt(process.env.DAILY_DEPOSIT_LIMIT_CENTS, 10) || 1000000,      // $10,000
  },

  paths: {
    root: path.resolve(__dirname, '..'),
    data: path.resolve(__dirname, '..', 'data'),
    views: path.resolve(__dirname, '..', 'views'),
    public: path.resolve(__dirname, '..', 'public'),
  },
};

// Local, git-ignored files that belong with the database (a generated admin login, the bridge secret).
config.paths.local = config.database.path === ':memory:'
  ? config.paths.data
  : path.dirname(path.resolve(config.paths.root, config.database.path));

// Startup validation warnings
if (config.session.secret === 'dev-secret-change-in-production' && !config.isDev) {
  console.warn('[Config] WARNING: Using default SESSION_SECRET in production. Set SESSION_SECRET in .env');
}
if ((!config.admin.email || !config.admin.password) && !config.isDev && config.nodeEnv !== 'test') {
  console.warn('[Config] WARNING: ADMIN_EMAIL or ADMIN_PASSWORD not set. Admin account will not be initialized.');
}

module.exports = config;
