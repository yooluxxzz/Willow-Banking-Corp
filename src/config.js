require('dotenv').config();
const path = require('path');

const config = {
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: (process.env.NODE_ENV || 'development') === 'development',

  session: {
    secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  },

  admin: {
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
  },

  database: {
    path: process.env.DATABASE_PATH || './data/willow.db',
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
    authMax: parseInt(process.env.AUTH_RATE_LIMIT_MAX, 10) || 10,
  },

  bcryptRounds: 12,

  currency: 'USD',

  limits: {
    dailyWithdrawalCents: parseInt(process.env.DAILY_WITHDRAWAL_LIMIT_CENTS, 10) || 1000000, // $10,000
    dailyTransferCents: parseInt(process.env.DAILY_TRANSFER_LIMIT_CENTS, 10) || 2500000,    // $25,000
    dailyDepositCents: parseInt(process.env.DAILY_DEPOSIT_LIMIT_CENTS, 10) || 5000000,      // $50,000
  },

  paths: {
    root: path.resolve(__dirname, '..'),
    data: path.resolve(__dirname, '..', 'data'),
    views: path.resolve(__dirname, '..', 'views'),
    public: path.resolve(__dirname, '..', 'public'),
  },
};

// Startup validation warnings
if (config.session.secret === 'dev-secret-change-in-production' && !config.isDev) {
  console.warn('[Config] WARNING: Using default SESSION_SECRET in production. Set SESSION_SECRET in .env');
}
if (!config.admin.email || !config.admin.password) {
  console.warn('[Config] WARNING: ADMIN_EMAIL or ADMIN_PASSWORD not set. Admin account will not be initialized.');
}

module.exports = config;
