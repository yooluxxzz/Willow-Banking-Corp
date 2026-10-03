/**
 * Curated Willow demo market universe. Prices are never stored here — only
 * identifiers and descriptive metadata. Live data comes from the market-data
 * service. `provider` is the Yahoo Finance symbol used upstream.
 */
const instruments = [
    // ── Stocks ──────────────────────────────────────────────────────────
    { symbol: 'AAPL', name: 'Apple', legalName: 'Apple Inc.', type: 'stock', sector: 'Technology', country: 'United States', description: 'Apple designs and sells consumer electronics, software and services, including the iPhone, Mac, iPad, wearables and a growing services business.' },
    { symbol: 'MSFT', name: 'Microsoft', legalName: 'Microsoft Corporation', type: 'stock', sector: 'Technology', country: 'United States', description: 'Microsoft develops software, cloud computing and productivity platforms, including Azure, Microsoft 365, Windows and gaming.' },
    { symbol: 'NVDA', name: 'NVIDIA', legalName: 'NVIDIA Corporation', type: 'stock', sector: 'Semiconductors', country: 'United States', description: 'NVIDIA designs graphics processors and accelerated computing platforms used in gaming, data centers and artificial intelligence.' },
    { symbol: 'AMZN', name: 'Amazon', legalName: 'Amazon.com, Inc.', type: 'stock', sector: 'Consumer', country: 'United States', description: 'Amazon operates online retail marketplaces and logistics networks, and runs Amazon Web Services, a large cloud computing business.' },
    { symbol: 'TSLA', name: 'Tesla', legalName: 'Tesla, Inc.', type: 'stock', sector: 'Automotive', country: 'United States', description: 'Tesla designs and manufactures electric vehicles, battery energy storage systems and solar products.' },
    { symbol: 'GOOGL', name: 'Alphabet', legalName: 'Alphabet Inc. (Class A)', type: 'stock', sector: 'Communication', country: 'United States', description: 'Alphabet is the parent company of Google, with businesses spanning search, advertising, YouTube, Android and Google Cloud.' },
    { symbol: 'META', name: 'Meta Platforms', legalName: 'Meta Platforms, Inc.', type: 'stock', sector: 'Communication', country: 'United States', description: 'Meta builds social and messaging apps including Facebook, Instagram and WhatsApp, and invests in virtual and augmented reality.' },
    { symbol: 'JPM', name: 'JPMorgan Chase', legalName: 'JPMorgan Chase & Co.', type: 'stock', sector: 'Financials', country: 'United States', description: 'JPMorgan Chase is a global financial services firm providing consumer and commercial banking, investment banking and asset management.' },
    { symbol: 'V', name: 'Visa', legalName: 'Visa Inc.', type: 'stock', sector: 'Financials', country: 'United States', description: 'Visa operates a global electronic payments network connecting consumers, merchants, financial institutions and governments.' },
    { symbol: 'MA', name: 'Mastercard', legalName: 'Mastercard Incorporated', type: 'stock', sector: 'Financials', country: 'United States', description: 'Mastercard runs a global payments network and provides payment processing, data and security services.' },
    { symbol: 'KO', name: 'Coca-Cola', legalName: 'The Coca-Cola Company', type: 'stock', sector: 'Consumer staples', country: 'United States', description: 'The Coca-Cola Company manufactures and markets non-alcoholic beverages sold around the world.' },
    { symbol: 'NFLX', name: 'Netflix', legalName: 'Netflix, Inc.', type: 'stock', sector: 'Communication', country: 'United States', description: 'Netflix offers a subscription streaming service with films, series and games across many languages and genres.' },
    { symbol: 'AMD', name: 'AMD', legalName: 'Advanced Micro Devices, Inc.', type: 'stock', sector: 'Semiconductors', country: 'United States', description: 'AMD designs processors and graphics chips for PCs, data centers, gaming consoles and embedded systems.' },
    { symbol: 'DIS', name: 'Disney', legalName: 'The Walt Disney Company', type: 'stock', sector: 'Communication', country: 'United States', description: 'Disney operates film and television studios, streaming services, theme parks, resorts and consumer products businesses.' },
    { symbol: 'NKE', name: 'Nike', legalName: 'NIKE, Inc.', type: 'stock', sector: 'Consumer', country: 'United States', description: 'Nike designs and markets athletic footwear, apparel and equipment sold worldwide.' },
    { symbol: 'COST', name: 'Costco', legalName: 'Costco Wholesale Corporation', type: 'stock', sector: 'Consumer staples', country: 'United States', description: 'Costco operates membership warehouse clubs offering a selection of branded and private-label products.' },
    { symbol: 'WMT', name: 'Walmart', legalName: 'Walmart Inc.', type: 'stock', sector: 'Consumer staples', country: 'United States', description: 'Walmart operates retail stores, warehouse clubs and e-commerce businesses in the United States and internationally.' },
    { symbol: 'BRK-B', name: 'Berkshire Hathaway', legalName: 'Berkshire Hathaway Inc. (Class B)', type: 'stock', sector: 'Financials', country: 'United States', description: 'Berkshire Hathaway is a holding company with businesses in insurance, railroads, utilities, manufacturing and retail, plus a large equity portfolio.' },
    { symbol: 'TSM', name: 'TSMC', legalName: 'Taiwan Semiconductor Manufacturing (ADR)', type: 'stock', sector: 'Semiconductors', country: 'Taiwan', description: 'TSMC manufactures semiconductors on behalf of chip designers and is one of the world’s largest dedicated foundries.' },
    { symbol: 'ASML', name: 'ASML', legalName: 'ASML Holding N.V.', type: 'stock', sector: 'Semiconductors', country: 'Netherlands', description: 'ASML builds lithography systems that chipmakers use to produce advanced semiconductors.' },
    { symbol: 'NVO', name: 'Novo Nordisk', legalName: 'Novo Nordisk A/S (ADR)', type: 'stock', sector: 'Healthcare', country: 'Denmark', description: 'Novo Nordisk is a healthcare company focused on treatments for diabetes, obesity and other chronic diseases.' },
    { symbol: 'SHEL', name: 'Shell', legalName: 'Shell plc (ADR)', type: 'stock', sector: 'Energy', country: 'United Kingdom', description: 'Shell is an integrated energy company working across oil and gas production, refining, trading and lower-carbon energy.' },
    { symbol: 'TM', name: 'Toyota', legalName: 'Toyota Motor Corporation (ADR)', type: 'stock', sector: 'Automotive', country: 'Japan', description: 'Toyota designs and manufactures vehicles, including hybrid and electric models, sold in markets around the world.' },

    // ── ETFs ────────────────────────────────────────────────────────────
    { symbol: 'SPY', name: 'SPDR S&P 500 ETF', legalName: 'SPDR S&P 500 ETF Trust', type: 'etf', sector: 'US large cap', country: 'United States', description: 'An exchange-traded fund that seeks to track the S&P 500, an index of large US companies.' },
    { symbol: 'QQQ', name: 'Invesco QQQ', legalName: 'Invesco QQQ Trust', type: 'etf', sector: 'US growth', country: 'United States', description: 'An exchange-traded fund that tracks the Nasdaq-100, an index of large non-financial companies listed on Nasdaq.' },
    { symbol: 'VTI', name: 'Vanguard Total Stock Market ETF', legalName: 'Vanguard Total Stock Market ETF', type: 'etf', sector: 'US total market', country: 'United States', description: 'An exchange-traded fund that seeks to track the performance of the overall US stock market.' },
    { symbol: 'VXUS', name: 'Vanguard Total International Stock ETF', legalName: 'Vanguard Total International Stock ETF', type: 'etf', sector: 'International', country: 'Global', description: 'An exchange-traded fund providing broad exposure to stocks in developed and emerging markets outside the United States.' },
    { symbol: 'VWO', name: 'Vanguard FTSE Emerging Markets ETF', legalName: 'Vanguard FTSE Emerging Markets ETF', type: 'etf', sector: 'Emerging markets', country: 'Global', description: 'An exchange-traded fund that invests in stocks of companies located in emerging markets.' },
    { symbol: 'BND', name: 'Vanguard Total Bond Market ETF', legalName: 'Vanguard Total Bond Market ETF', type: 'etf', sector: 'Bonds', country: 'United States', description: 'An exchange-traded fund providing broad exposure to US investment-grade bonds.' },
    { symbol: 'GLD', name: 'SPDR Gold Shares', legalName: 'SPDR Gold Trust', type: 'etf', sector: 'Commodities', country: 'Global', description: 'An exchange-traded product that seeks to reflect the price of gold bullion, less the trust’s expenses.' },

    // ── Mutual & index funds ────────────────────────────────────────────
    { symbol: 'VFIAX', name: 'Vanguard 500 Index Fund', legalName: 'Vanguard 500 Index Fund Admiral Shares', type: 'fund', sector: 'US large cap', country: 'United States', description: 'A mutual fund that seeks to track the S&P 500 index. Mutual funds are priced once per trading day at net asset value.' },
    { symbol: 'FXAIX', name: 'Fidelity 500 Index Fund', legalName: 'Fidelity 500 Index Fund', type: 'fund', sector: 'US large cap', country: 'United States', description: 'A mutual fund that seeks to track the S&P 500 index. Mutual funds are priced once per trading day at net asset value.' },
    { symbol: 'SWPPX', name: 'Schwab S&P 500 Index Fund', legalName: 'Schwab S&P 500 Index Fund', type: 'fund', sector: 'US large cap', country: 'United States', description: 'A mutual fund that seeks to track the total return of the S&P 500 index.' },
    { symbol: 'VTSAX', name: 'Vanguard Total Stock Market Index Fund', legalName: 'Vanguard Total Stock Market Index Fund Admiral Shares', type: 'fund', sector: 'US total market', country: 'United States', description: 'A mutual fund that seeks to track the entire US stock market, from large to small companies.' },
    { symbol: 'VTIAX', name: 'Vanguard Total International Stock Index Fund', legalName: 'Vanguard Total International Stock Index Fund Admiral Shares', type: 'fund', sector: 'International', country: 'Global', description: 'A mutual fund providing broad exposure to stocks outside the United States.' },
    { symbol: 'VBTLX', name: 'Vanguard Total Bond Market Index Fund', legalName: 'Vanguard Total Bond Market Index Fund Admiral Shares', type: 'fund', sector: 'Bonds', country: 'United States', description: 'A mutual fund providing broad exposure to US investment-grade bonds.' },

    // ── Crypto (simulated holdings, market prices) ──────────────────────
    { symbol: 'BTC', name: 'Bitcoin', legalName: 'Bitcoin', type: 'crypto', provider: 'BTC-USD', sector: 'Crypto', description: 'The first decentralized cryptocurrency, launched in 2009, with a fixed maximum supply of 21 million coins.' },
    { symbol: 'ETH', name: 'Ethereum', legalName: 'Ethereum', type: 'crypto', provider: 'ETH-USD', sector: 'Crypto', description: 'A programmable blockchain whose native asset, ether, pays for transactions and smart-contract computation.' },
    { symbol: 'SOL', name: 'Solana', legalName: 'Solana', type: 'crypto', provider: 'SOL-USD', sector: 'Crypto', description: 'A high-throughput blockchain designed for fast, low-cost transactions. SOL is its native token.' },
    { symbol: 'XRP', name: 'XRP', legalName: 'XRP', type: 'crypto', provider: 'XRP-USD', sector: 'Crypto', description: 'The native digital asset of the XRP Ledger, a blockchain designed for payments and currency exchange.' },
    { symbol: 'ADA', name: 'Cardano', legalName: 'Cardano', type: 'crypto', provider: 'ADA-USD', sector: 'Crypto', description: 'A proof-of-stake blockchain developed with a research-led approach. ADA is its native token.' },
    { symbol: 'LTC', name: 'Litecoin', legalName: 'Litecoin', type: 'crypto', provider: 'LTC-USD', sector: 'Crypto', description: 'An early cryptocurrency derived from Bitcoin, designed for faster block times and low-cost payments.' },

    // ── Indices ─────────────────────────────────────────────────────────
    { symbol: '^GSPC', name: 'S&P 500', type: 'index', region: 'US', description: 'A market-capitalization-weighted index of 500 large US companies.' },
    { symbol: '^IXIC', name: 'NASDAQ Composite', shortName: 'NASDAQ', type: 'index', region: 'US', description: 'An index of the common stocks listed on the Nasdaq Stock Market.' },
    { symbol: '^DJI', name: 'Dow Jones Industrial Average', shortName: 'Dow Jones', type: 'index', region: 'US', description: 'A price-weighted index of 30 prominent US companies.' },
    { symbol: '^FTSE', name: 'FTSE 100', type: 'index', region: 'Global', description: 'An index of the 100 largest companies listed on the London Stock Exchange.' },
    { symbol: '^STOXX50E', name: 'EURO STOXX 50', type: 'index', region: 'Global', description: 'An index of 50 large companies from countries in the eurozone.' },
    { symbol: '^N225', name: 'Nikkei 225', type: 'index', region: 'Global', description: 'A price-weighted index of 225 large companies listed in Tokyo.' },

    // ── Foreign exchange (USD base: units of currency per 1 USD) ────────
    { symbol: 'EUR', name: 'Euro', type: 'fx', provider: 'EUR=X', currencyCode: 'EUR' },
    { symbol: 'GBP', name: 'British pound', type: 'fx', provider: 'GBP=X', currencyCode: 'GBP' },
    { symbol: 'MZN', name: 'Mozambican metical', type: 'fx', provider: 'MZN=X', currencyCode: 'MZN' },
    { symbol: 'ZAR', name: 'South African rand', type: 'fx', provider: 'ZAR=X', currencyCode: 'ZAR' },
];

const TRADABLE_TYPES = new Set(['stock', 'etf', 'fund', 'crypto']);
const TYPE_LABELS = { stock: 'Stock', etf: 'ETF', fund: 'Fund', crypto: 'Crypto', index: 'Index', fx: 'Currency' };
const POPULAR = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'TSLA', 'GOOGL', 'META'];
const MAIN_INDICES = ['^GSPC', '^IXIC', '^DJI'];
const GLOBAL_INDICES = ['^FTSE', '^STOXX50E', '^N225'];
const CRYPTO = ['BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'LTC'];
const FX = ['EUR', 'GBP', 'MZN', 'ZAR'];

const bySymbol = new Map(instruments.map(item => [item.symbol, { ...item, provider: item.provider || item.symbol, tradable: TRADABLE_TYPES.has(item.type), typeLabel: TYPE_LABELS[item.type] }]));

module.exports = { instruments: [...bySymbol.values()], bySymbol, TRADABLE_TYPES, TYPE_LABELS, POPULAR, MAIN_INDICES, GLOBAL_INDICES, CRYPTO, FX };
