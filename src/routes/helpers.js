/**
 * Small helpers shared by the JSON API routers.
 */
const { isExpected } = require('../errors');

/**
 * Sends an error as JSON. Errors meant for the customer (ValidationError, or any
 * error carrying a `status`) keep their message; anything else is logged and
 * answered with a generic 500 so internals never reach the browser.
 */
function sendError(res, error, scope = 'API') {
    if (isExpected(error)) {
        return res.status(error.status || 400).json({ error: error.message, ...(error.code ? { code: error.code } : {}) });
    }
    console.error(`[${scope}]`, error && error.stack ? error.stack : error);
    return res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
}

/** Wraps a handler that returns (or resolves to) the JSON body. */
const jsonRoute = (status, fn, scope) => async (req, res) => {
    try {
        res.status(status).json(await fn(req, res));
    } catch (error) {
        sendError(res, error, scope);
    }
};

/** Rejects `:id` parameters that aren't positive whole numbers. */
const validId = (req, res, next) => (/^[1-9]\d{0,15}$/.test(req.params.id) ? next() : res.status(400).json({ error: 'Invalid identifier.' }));

/** Personal data must not be cached by the browser or a proxy. */
const noStore = (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); };

module.exports = { sendError, jsonRoute, validId, noStore };
