/**
 * Supported Willow demo account currencies. Limits are product policy expressed
 * in each currency's own units — they are rounded figures, not exchange rates.
 */
const { formatCurrency } = require('../middleware/validation');

const CURRENCIES = {
    USD: { code: 'USD', name: 'US dollar', symbol: '$', region: 'United States', limitScale: 1 },
    EUR: { code: 'EUR', name: 'Euro', symbol: '€', region: 'Eurozone', limitScale: 1 },
    GBP: { code: 'GBP', name: 'British pound', symbol: '£', region: 'United Kingdom', limitScale: 1 },
    ZAR: { code: 'ZAR', name: 'South African rand', symbol: 'R', region: 'South Africa', limitScale: 20 },
    MZN: { code: 'MZN', name: 'Mozambican metical', symbol: 'MT', region: 'Mozambique', limitScale: 60 },
};

const CURRENCY_CODES = Object.keys(CURRENCIES);

function isSupportedCurrency(code) {
    return typeof code === 'string' && Object.hasOwn(CURRENCIES, code);
}

/** Scales a USD-denominated cent limit into another currency's minor units. */
function scaledLimit(usdCents, currency) {
    return usdCents * (CURRENCIES[currency] ? CURRENCIES[currency].limitScale : 1);
}

function formatMoney(cents, currency = 'USD') {
    return formatCurrency(cents, isSupportedCurrency(currency) ? currency : 'USD');
}

module.exports = { CURRENCIES, CURRENCY_CODES, isSupportedCurrency, scaledLimit, formatMoney };
