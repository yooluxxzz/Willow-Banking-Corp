/**
 * Loan calculators and saved estimates. Estimates are educational: Willow
 * offers no credit, performs no credit checks and makes no lending decisions.
 */
const { getDb } = require('../database');
const { logAudit } = require('./audit');

const LIMITS = {
    personal: { minPrincipal: 1000, maxPrincipal: 100000, minMonths: 12, maxMonths: 84, maxRate: 36 },
    business: { minPrincipal: 5000, maxPrincipal: 500000, minMonths: 12, maxMonths: 120, maxRate: 30 },
    mortgage: { minPrincipal: 10000, maxPrincipal: 5000000, minMonths: 60, maxMonths: 480, maxRate: 15 },
    credit: { minPrincipal: 100, maxPrincipal: 100000, minMonths: 1, maxMonths: 600, maxRate: 40 },
};

function amortizedPayment(principal, annualRatePct, months) {
    const r = annualRatePct / 100 / 12;
    if (r === 0) return principal / months;
    return (principal * r) / (1 - Math.pow(1 + r, -months));
}

function round2(value) {
    return Math.round(value * 100) / 100;
}

function num(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : NaN;
}

/** Computes an estimate. Throws on out-of-range input. */
function calculate(kind, input = {}) {
    const limits = LIMITS[kind];
    if (!limits) throw new Error('Choose a loan type.');
    const rate = num(input.rate);
    if (!(rate >= 0 && rate <= limits.maxRate)) throw new Error(`Enter a rate between 0% and ${limits.maxRate}%.`);

    if (kind === 'credit') {
        const balance = num(input.balance);
        const payment = num(input.payment);
        if (!(balance >= limits.minPrincipal && balance <= limits.maxPrincipal)) throw new Error('Enter a balance between 100 and 100,000.');
        const monthlyInterest = balance * (rate / 100 / 12);
        if (!(payment > monthlyInterest + 0.005)) {
            return { kind, principal: balance, rate, payment, months: null, totalInterest: null, neverPaysOff: true };
        }
        let remaining = balance;
        let months = 0;
        let interest = 0;
        while (remaining > 0.005 && months < limits.maxMonths) {
            const charge = remaining * (rate / 100 / 12);
            interest += charge;
            remaining = remaining + charge - payment;
            months += 1;
        }
        return { kind, principal: balance, rate, payment, months, totalInterest: round2(interest), totalPaid: round2(balance + interest), neverPaysOff: remaining > 0.005 };
    }

    let principal;
    let extras = 0;
    let details = {};
    if (kind === 'mortgage') {
        const price = num(input.homePrice);
        const down = num(input.downPayment);
        if (!(price >= 20000 && price <= 10000000)) throw new Error('Enter a home price between 20,000 and 10,000,000.');
        if (!(down >= 0 && down < price)) throw new Error('The down payment must be less than the home price.');
        principal = price - down;
        const tax = Math.max(0, num(input.propertyTax) || 0);
        const insurance = Math.max(0, num(input.insurance) || 0);
        if (tax > 200000 || insurance > 100000) throw new Error('Check the yearly tax and insurance amounts.');
        extras = (tax + insurance) / 12;
        details = { homePrice: price, downPayment: down, downPaymentPct: round2(down / price * 100), propertyTax: tax, insurance };
    } else {
        principal = num(input.principal);
    }
    if (!(principal >= limits.minPrincipal && principal <= limits.maxPrincipal)) throw new Error(`Enter an amount between ${limits.minPrincipal.toLocaleString('en-US')} and ${limits.maxPrincipal.toLocaleString('en-US')}.`);
    const months = Math.round(num(input.termMonths));
    if (!(months >= limits.minMonths && months <= limits.maxMonths)) throw new Error(`Choose a term between ${limits.minMonths} and ${limits.maxMonths} months.`);
    const payment = amortizedPayment(principal, rate, months);
    const totalPaid = payment * months;
    return {
        kind,
        principal: round2(principal),
        rate,
        months,
        payment: round2(payment),
        monthlyTotal: round2(payment + extras),
        totalPaid: round2(totalPaid),
        totalInterest: round2(totalPaid - principal),
        details,
    };
}

function listEstimates(userId) {
    return getDb().prepare('SELECT * FROM loan_estimates WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 20').all(userId)
        .map(row => ({ ...row, details: safeJson(row.details) }));
}

function safeJson(value) {
    try { return JSON.parse(value); } catch (error) { return {}; }
}

function saveEstimate(userId, { kind, label = '', ...input } = {}) {
    if (typeof label !== 'string' || label.trim().length > 60 || /[<>\x00-\x1f\x7f]/.test(label)) throw new Error('Use a label of up to 60 characters.');
    const result = calculate(kind, input);
    if (result.neverPaysOff) throw new Error('This payment doesn’t cover the monthly interest, so the balance would never be repaid.');
    const db = getDb();
    if (db.prepare('SELECT COUNT(*) AS count FROM loan_estimates WHERE user_id = ?').get(userId).count >= 20) throw new Error('You can save up to 20 estimates. Remove one to add another.');
    db.prepare(`INSERT INTO loan_estimates (user_id, kind, label, principal_cents, annual_rate_bps, term_months, monthly_payment_cents, total_interest_cents, details)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(userId, kind, label.trim(), Math.round(result.principal * 100), Math.round(result.rate * 100), result.months, Math.round((result.monthlyTotal || result.payment) * 100), Math.round(result.totalInterest * 100), JSON.stringify(result.details || {}));
    logAudit({ actorId: userId, action: 'loan_estimate_saved', targetType: 'loan_estimate', targetId: String(userId), metadata: { kind, simulated: true } });
    return listEstimates(userId);
}

function deleteEstimate(userId, id) {
    const result = getDb().prepare('DELETE FROM loan_estimates WHERE id = ? AND user_id = ?').run(id, userId);
    if (!result.changes) throw Object.assign(new Error('Estimate not found.'), { status: 404 });
    return listEstimates(userId);
}

module.exports = { calculate, amortizedPayment, listEstimates, saveEstimate, deleteEstimate, LIMITS };
