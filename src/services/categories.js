/**
 * Spending categories. Transactions may carry an explicit category; otherwise
 * one is inferred from the description and type. Inference is a convenience
 * for summaries — it never changes the ledger.
 */
const CATEGORIES = {
    income: { label: 'Income', icon: 'arrow-down-left', color: 'var(--chart-1)' },
    groceries: { label: 'Groceries', icon: 'store', color: 'var(--chart-2)' },
    dining: { label: 'Dining', icon: 'coins', color: 'var(--chart-3)' },
    transport: { label: 'Transport', icon: 'map-pin', color: 'var(--chart-5)' },
    housing: { label: 'Housing', icon: 'house', color: 'var(--chart-4)' },
    bills: { label: 'Bills & utilities', icon: 'zap', color: 'var(--chart-6)' },
    shopping: { label: 'Shopping', icon: 'tag', color: 'var(--chart-7)' },
    entertainment: { label: 'Entertainment', icon: 'sparkle', color: 'var(--chart-3)' },
    health: { label: 'Health', icon: 'leaf', color: 'var(--chart-2)' },
    travel: { label: 'Travel', icon: 'plane', color: 'var(--chart-5)' },
    business: { label: 'Business', icon: 'briefcase', color: 'var(--chart-8)' },
    transfers: { label: 'Transfers', icon: 'transfer', color: 'var(--chart-8)' },
    investing: { label: 'Investing', icon: 'trend', color: 'var(--chart-1)' },
    cash: { label: 'Cash', icon: 'banknote', color: 'var(--chart-8)' },
    other: { label: 'Other', icon: 'receipt', color: 'var(--chart-8)' },
};

const RULES = [
    ['income', /\b(salary|payroll|wage|paycheck|income|invoice .* payment|dividend|refund|interest)\b/i],
    ['groceries', /\b(grocer|grocery|supermarket|market|bakery|whole foods|trader|aldi|lidl|spar|continente|pick n pay|woolworths)\b/i],
    ['dining', /\b(cafe|café|coffee|restaurant|bistro|dinner|lunch|brunch|pizza|sushi|bar|eatery|kitchen)\b/i],
    ['transport', /\b(uber|lyft|bolt|taxi|metro|train|rail|bus|fuel|petrol|gas station|parking|transit)\b/i],
    ['housing', /\b(rent|mortgage|landlord|property|home insurance|hoa)\b/i],
    ['bills', /\b(electric|electricity|water|internet|broadband|phone|mobile plan|utility|utilities|insurance|subscription)\b/i],
    ['shopping', /\b(store|shop|boutique|amazon|online order|clothing|apparel|hardware|bookshop|books)\b/i],
    ['entertainment', /\b(cinema|movie|streaming|concert|theatre|theater|music|games?|museum)\b/i],
    ['health', /\b(pharmacy|clinic|doctor|dental|gym|fitness|health|yoga)\b/i],
    ['travel', /\b(airline|flight|hotel|airbnb|booking|travel|lodge|resort)\b/i],
    ['business', /\b(supplier|wholesale|software|saas|office|contractor|freelance|studio supplies)\b/i],
];

function categorize(txn) {
    if (txn.category && CATEGORIES[txn.category]) return txn.category;
    if (txn.type === 'transfer') return 'transfers';
    if (txn.direction === 'credit' && (txn.type === 'deposit' || txn.type === 'refund' || txn.type === 'payment')) {
        const match = RULES.find(([, pattern]) => pattern.test(txn.description || ''));
        return match && match[0] === 'income' ? 'income' : (txn.type === 'refund' ? 'shopping' : 'income');
    }
    if (txn.type === 'withdrawal') {
        const match = RULES.find(([, pattern]) => pattern.test(txn.description || ''));
        return match ? match[0] : 'cash';
    }
    const match = RULES.find(([, pattern]) => pattern.test(txn.description || ''));
    return match ? match[0] : 'other';
}

function categoryMeta(key) {
    return { key, ...(CATEGORIES[key] || CATEGORIES.other) };
}

module.exports = { CATEGORIES, categorize, categoryMeta };
