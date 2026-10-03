/**
 * An error caused by the request itself (invalid input, not allowed, not found).
 * Its message is written for the customer and is safe to show; routes send it with
 * `status` (400 unless set). Any other error is treated as a fault on our side: it
 * is logged and the customer gets a generic message instead.
 */
class ValidationError extends Error {
    constructor(message, status = 400, code = null) {
        super(message);
        this.name = 'ValidationError';
        this.status = status;
        if (code) this.code = code;
    }
}

/** True for errors whose message is meant for the customer. */
const isExpected = error => error instanceof ValidationError || Number.isInteger(error && error.status);

module.exports = { ValidationError, isExpected };
