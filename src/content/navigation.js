/**
 * Site and app navigation. Public product entries come from products.js so
 * labels, paths and descriptions stay in one place.
 */
const { groups, products } = require('./products');

const explore = [
    { label: 'Insights', href: '/insights', icon: 'lightbulb', description: 'Perspectives on money and markets' },
    { label: 'Markets', href: '/markets', icon: 'chart', description: 'Indices, stocks and crypto today' },
    { label: 'Education', href: '/learn', icon: 'graduation', description: 'Plain-language financial guides' },
    { label: 'Security', href: '/security-info', icon: 'shield', description: 'How Willow protects your access' },
    { label: 'Help', href: '/help', icon: 'help', description: 'Answers, guides and support' },
];

const featured = {
    money: { kind: 'card', eyebrow: 'Willow Cards', title: 'Physical and virtual cards with instant controls.', href: '/money/cards', cta: 'Explore cards' },
    wealth: { kind: 'portfolio', eyebrow: 'Investing', title: 'Invest the money you move in — at real, delayed market prices.', href: '/invest/portfolio', cta: 'How it works' },
    borrow: { kind: 'calculator', eyebrow: 'Estimate first', title: 'See an estimated monthly payment in seconds.', href: '/borrow/personal-loans', cta: 'Try the calculator' },
    business: { kind: 'business', eyebrow: 'Willow Business', title: 'Accounts, cards, invoices and cash flow in one place.', href: '/business', cta: 'Explore business' },
    explore: { kind: 'demo', eyebrow: 'Willow Demo', title: 'A fictional bank. Real product thinking. No real money.', href: '/demo', cta: 'How the demo works' },
};

function buildSiteNavigation() {
    const sections = groups.map(group => ({
        key: group.key,
        label: group.label,
        items: products.filter(product => product.group === group.key).map(product => ({
            label: product.navLabel,
            href: product.path,
            icon: product.icon,
            description: product.navDescription,
        })),
        featured: featured[group.key],
    }));
    sections.push({ key: 'explore', label: 'Explore', items: explore, featured: featured.explore });
    return sections;
}

const siteNavigation = buildSiteNavigation();

/** Signed-in navigation. `match` lists path prefixes that mark an item current. */
const appNavigation = [
    {
        label: null,
        items: [
            { label: 'Home', href: '/dashboard', icon: 'home', match: ['/dashboard'] },
            { label: 'Net worth', href: '/hub', icon: 'hub', match: ['/hub'] },
        ],
    },
    {
        label: 'Money',
        items: [
            { label: 'Accounts', href: '/accounts', icon: 'wallet', match: ['/accounts', '/transactions', '/statements', '/deposits', '/withdrawals'] },
            { label: 'Cards', href: '/cards', icon: 'card', match: ['/cards'] },
            { label: 'Payments', href: '/transfers', icon: 'send', match: ['/transfers', '/payees', '/scheduled-transfers'] },
            { label: 'International', href: '/international', icon: 'globe', match: ['/international'] },
        ],
    },
    {
        label: 'Wealth',
        items: [
            { label: 'Portfolio', href: '/wealth', icon: 'pie', match: ['/wealth'], exclude: ['/wealth/markets', '/wealth/stocks'] },
            { label: 'Markets', href: '/wealth/markets', icon: 'chart', match: ['/wealth/markets', '/wealth/stocks'] },
            { label: 'Crypto', href: '/crypto', icon: 'bitcoin', match: ['/crypto'] },
        ],
    },
    {
        label: 'Plan & borrow',
        items: [
            { label: 'Budgets', href: '/budgets', icon: 'sliders', match: ['/budgets'] },
            { label: 'Goals', href: '/goals', icon: 'target', match: ['/goals'] },
            { label: 'Debts', href: '/debts', icon: 'scale', match: ['/debts'] },
            { label: 'Loan calculators', href: '/loans', icon: 'calculator', match: ['/loans'] },
        ],
    },
    {
        label: 'Business',
        items: [
            { label: 'Business', href: '/business/dashboard', icon: 'briefcase', match: ['/business/dashboard', '/business/invoices', '/business/expense-log', '/business/team'] },
        ],
    },
];

const appSecondaryNavigation = [
    { label: 'Security', href: '/security', icon: 'shield', match: ['/security'] },
    { label: 'Settings', href: '/settings', icon: 'settings', match: ['/settings'] },
    { label: 'Help', href: '/help', icon: 'help', match: ['/help'] },
];

const appTabs = [
    { label: 'Home', href: '/dashboard', icon: 'home', match: ['/dashboard', '/hub', '/budgets', '/debts'] },
    { label: 'Money', href: '/accounts', icon: 'wallet', match: ['/accounts', '/cards', '/transactions', '/statements', '/deposits', '/withdrawals', '/international'] },
    { label: 'Pay', href: '/transfers', icon: 'send', match: ['/transfers', '/payees', '/scheduled-transfers'], primary: true },
    { label: 'Wealth', href: '/wealth', icon: 'trend', match: ['/wealth', '/crypto'] },
];

function isCurrent(item, currentPath = '') {
    if (!currentPath) return false;
    if (item.exclude && item.exclude.some(prefix => currentPath.startsWith(prefix))) return false;
    return (item.match || [item.href]).some(prefix => currentPath === prefix || currentPath.startsWith(prefix + '/'));
}

module.exports = { siteNavigation, appNavigation, appSecondaryNavigation, appTabs, isCurrent, explore };
