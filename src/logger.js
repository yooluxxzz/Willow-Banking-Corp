/**
 * Structured logger — leveled, timestamped logging with no dependencies
 * Replaces raw console.log/error calls across the application
 */

const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL?.toLowerCase()] ?? (
    process.env.NODE_ENV === 'production' ? LOG_LEVELS.info : LOG_LEVELS.debug
);

function formatMessage(level, context, message, meta) {
    const timestamp = new Date().toISOString();
    const prefix = context ? `[${context}]` : '';
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} ${level.toUpperCase().padEnd(5)} ${prefix} ${message}${metaStr}`;
}

const logger = {
    error(context, message, meta) {
        if (currentLevel >= LOG_LEVELS.error) {
            console.error(formatMessage('error', context, message, meta));
        }
    },
    warn(context, message, meta) {
        if (currentLevel >= LOG_LEVELS.warn) {
            console.warn(formatMessage('warn', context, message, meta));
        }
    },
    info(context, message, meta) {
        if (currentLevel >= LOG_LEVELS.info) {
            console.log(formatMessage('info', context, message, meta));
        }
    },
    debug(context, message, meta) {
        if (currentLevel >= LOG_LEVELS.debug) {
            console.log(formatMessage('debug', context, message, meta));
        }
    },
};

module.exports = logger;
