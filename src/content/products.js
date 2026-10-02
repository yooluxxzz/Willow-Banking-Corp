'use strict';

/*
 * Product page and mega-menu content for the public Willow site.
 *
 * Willow is a demo platform. Every capability described here is simulated:
 * no real money, accounts, cards, trades, foreign exchange or lending exist.
 * Keep copy accurate to what the demo actually does, and keep each
 * product's `disclosure` explicit about what is simulated.
 */

const groups = [
    { key: 'money', label: 'Money' },
    { key: 'wealth', label: 'Wealth' },
    { key: 'borrow', label: 'Borrow' },
    { key: 'business', label: 'Business' },
];

const products = [
    // ------------------------------------------------------------------ Money
    {
        slug: 'accounts',
        group: 'money',
        path: '/money/accounts',
        navLabel: 'Accounts',
        navDescription: 'Checking, savings and currency accounts',
        icon: 'wallet',
        metaDescription: 'Open demo checking, savings and business accounts in USD, EUR, GBP, MZN and ZAR, with simulated balances, clear history and PDF statements.',
        eyebrow: 'Willow Accounts',
        headline: 'Everything you need for everyday money.',
        lede: 'Checking, savings and currency accounts in one calm place. Name them, follow every transaction and download statements, all with simulated demo balances.',
        primaryCta: { label: 'Open an account', href: '/register' },
        secondaryCta: { label: 'Sign in to Accounts', href: '/login?returnTo=%2Faccounts' },
        highlights: [
            {
                icon: 'layers',
                title: 'An account for each purpose',
                body: 'Keep personal checking, savings and business checking side by side, with up to 10 accounts on one profile.',
            },
            {
                icon: 'globe',
                title: 'Five currencies',
                body: 'Hold balances in US dollars, euros, British pounds, Mozambican metical and South African rand.',
            },
            {
                icon: 'file',
                title: 'Statements on demand',
                body: 'Choose an account and a date range, then download a PDF statement whenever you need a record.',
            },
        ],
        feature: {
            eyebrow: 'Clear by design',
            title: 'A history you can actually read.',
            body: 'Every account keeps a searchable record of what moved and when. Filter the list, open the details of a single transaction and give each account a nickname that makes sense to you.',
            points: [
                'Search and filter transaction history',
                'Account details in one place when you need them',
                'A nickname for every account',
                'PDF statements for any date range',
            ],
        },
        steps: [
            {
                title: 'Create your profile',
                body: 'Register with an email address and a password. Willow is a demo, so no identity documents are requested.',
            },
            {
                title: 'Open the accounts you need',
                body: 'Choose checking, savings or business checking, pick one of five currencies and add a nickname. New accounts start at zero.',
            },
            {
                title: 'Add demo money',
                body: 'Use Add money to place simulated funds in an account, then explore cards, payments and statements.',
            },
        ],
        faqs: [
            {
                q: 'Is the money in my Willow account real?',
                a: 'No. Willow is a demo platform and every balance is simulated. Accounts are not held at a regulated bank and carry no deposit insurance. Add money places simulated demo funds in an account so you can explore the experience.',
            },
            {
                q: 'How many accounts can I open?',
                a: 'Up to 10 on a single profile, across personal checking, savings and single-owner business checking. Each account holds one currency: USD, EUR, GBP, MZN or ZAR.',
            },
            {
                q: 'Do savings accounts earn interest?',
                a: 'Not in the demo. Savings accounts help you keep money set aside and visible, but no interest is calculated or paid, and Willow does not offer or advertise any interest rate.',
            },
            {
                q: 'Can I download statements?',
                a: 'Yes. Choose an account and a date range to download a PDF statement. Statements are generated from simulated demo activity, so they are not official financial records and cannot be used as proof of funds.',
            },
        ],
        disclosure: 'All Willow accounts and balances are simulated for demonstration. They hold no real money, are not deposit accounts at a regulated institution and carry no deposit insurance.',
        related: ['cards', 'savings', 'international'],
    },
    {
        slug: 'cards',
        group: 'money',
        path: '/money/cards',
        navLabel: 'Cards',
        navDescription: 'Physical and virtual demo debit cards',
        icon: 'card',
        metaDescription: 'Explore Willow demo debit cards. Freeze instantly, set a daily limit and control online, contactless, ATM and international use. No card is issued.',
        eyebrow: 'Willow Cards',
        headline: 'A card that answers to you.',
        lede: 'Physical and virtual demo debit cards linked to your accounts, with controls you can change in seconds. Freeze a card, set a daily limit or switch off international use whenever you like.',
        primaryCta: { label: 'Open an account', href: '/register' },
        secondaryCta: { label: 'Sign in to Cards', href: '/login?returnTo=%2Fcards' },
        highlights: [
            {
                icon: 'snowflake',
                title: 'Freeze in one tap',
                body: 'Freeze a card the moment something feels wrong, and unfreeze it just as quickly if it turns up again.',
            },
            {
                icon: 'settings',
                title: 'Controls that fit your day',
                body: 'Turn online payments, contactless, ATM withdrawals and international use on or off, card by card.',
            },
            {
                icon: 'layers',
                title: 'Physical and virtual',
                body: 'Create a virtual card for online spending or a physical card for everyday use, each linked to the account you choose.',
            },
        ],
        feature: {
            eyebrow: 'Card controls',
            title: 'Decide where, how and how much.',
            body: 'Every card has its own settings. Set a daily spending limit, choose which payment types are allowed, turn transaction notifications on or off, and report a card lost or replace it from the same place.',
            points: [
                'A daily spending limit for each card',
                'Online, contactless, ATM and international toggles',
                'Report lost and replace in a few steps',
                'Switch between your cards visually',
            ],
        },
        steps: [
            {
                title: 'Choose an account',
                body: 'Every demo card is linked to one of your Willow accounts. Open an account first if you do not have one yet.',
            },
            {
                title: 'Create a card',
                body: 'Pick a physical or virtual card and the account it should draw on. It appears in your cards view straight away.',
            },
            {
                title: 'Set your controls',
                body: 'Adjust the daily limit and payment types to suit how you spend. Changes apply to the demo card at once.',
            },
        ],
        faqs: [
            {
                q: 'Will I receive a physical card?',
                a: 'No. Physical cards in Willow are demo cards only. Nothing is manufactured, printed or shipped, and no card number can be used for a real purchase. You can still manage a physical demo card exactly as you would a virtual one.',
            },
            {
                q: 'Why are Apple Wallet and Google Wallet unavailable?',
                a: 'The wallet buttons are placeholders that show where mobile wallet setup would sit in a live product. Adding a card to a mobile wallet needs a connected card network and issuer, which the demo does not have.',
            },
            {
                q: 'What happens when I freeze a card?',
                a: 'The card is marked as frozen straight away and its status updates in your cards view. You can unfreeze it at any time. In the demo this changes a setting only, because no card network is connected.',
            },
            {
                q: 'Can I change my daily spending limit?',
                a: 'Yes. Each card has its own daily spending limit, which you can raise or lower from card controls. The limit is a demo setting and is not enforced by any card network.',
            },
        ],
        disclosure: 'Willow cards are demo cards. No card is issued, manufactured or shipped, no card network is connected, and card controls change demo settings only.',
        related: ['accounts', 'payments', 'international'],
    },
    {
        slug: 'payments',
        group: 'money',
        path: '/money/payments',
        navLabel: 'Payments',
        navDescription: 'Pay other Willow customers by email',
        icon: 'send',
        metaDescription: 'Send simulated payments to other Willow demo customers by email, save payees and follow a clear, guided flow from recipient to receipt.',
        eyebrow: 'Willow Payments',
        headline: 'Paying someone should feel simple.',
        lede: 'Send money to another Willow demo customer using just their email address. A guided flow shows who you are paying, from which account and how much, before anything moves.',
        primaryCta: { label: 'Open an account', href: '/register' },
        secondaryCta: { label: 'Sign in to Payments', href: '/login?returnTo=%2Ftransfers' },
        highlights: [
            {
                icon: 'user',
                title: 'Pay by email',
                body: 'Find another Willow demo customer by email address and send a payment in the same currency as your account.',
            },
            {
                icon: 'users',
                title: 'Saved payees',
                body: 'Save the people you pay often, so the next payment starts with their details already in place.',
            },
            {
                icon: 'receipt',
                title: 'A receipt every time',
                body: 'Each completed payment ends with a receipt and appears in your transaction history for later reference.',
            },
        ],
        feature: {
            eyebrow: 'Guided flow',
            title: 'Review before you send, every time.',
            body: 'Every payment follows the same path: choose a recipient, enter an amount, pick the account to pay from, review the details and confirm. Nothing is sent until you confirm, and you can step back at any point.',
            points: [
                'Recipient, amount, account, review, confirm',
                'Saved payees for people you pay often',
                'A daily limit of 25,000 in the account currency',
                'A receipt for every completed payment',
            ],
        },
        steps: [
            {
                title: 'Choose who to pay',
                body: 'Pick a saved payee or enter the email address of another Willow demo customer.',
            },
            {
                title: 'Set the amount',
                body: 'Enter the amount and choose which of your accounts to pay from. Payments are sent in the same currency.',
            },
            {
                title: 'Review and confirm',
                body: 'Check the details on the review screen, confirm, and keep the receipt for your records.',
            },
        ],
        faqs: [
            {
                q: 'Can I pay someone outside Willow?',
                a: 'Not in the demo. Payments can only go to other Willow demo customers, found by email address. External bank transfers, bill pay, card payments and international networks such as SWIFT or SEPA are not supported.',
            },
            {
                q: 'Is there a limit on how much I can send?',
                a: 'Yes. Outgoing transfers and payments are limited to 25,000 units of the sending account currency per day. The limit exists to make the demo realistic and applies only to simulated balances.',
            },
            {
                q: 'What does the recipient see?',
                a: "The payment appears in the recipient's transaction history as a credit and in yours as a debit, each with a reference. Both are simulated demo transactions, and no real money changes hands.",
            },
            {
                q: 'Can I undo a payment?',
                a: 'A completed payment cannot be reversed from your side, so the review screen is the moment to check the recipient and amount. Because balances are simulated, the recipient can simply send the same amount back.',
            },
        ],
        disclosure: 'Payments in Willow are simulated and can only be sent between Willow demo customers. No real money moves and no external payment network is connected.',
        related: ['transfers', 'accounts', 'international'],
    },
    {
        slug: 'transfers',
        group: 'money',
        path: '/money/transfers',
        navLabel: 'Transfers',
        navDescription: 'Move and schedule money between accounts',
        icon: 'transfer',
        metaDescription: 'Move simulated money between your own Willow accounts instantly, or schedule a one-time transfer for a future date. Everyday transfers, demonstrated.',
        eyebrow: 'Willow Transfers',
        headline: 'Move money where it needs to be.',
        lede: 'Shift funds between your own accounts in a few steps, or schedule a one-time transfer for a date that suits you. Every movement is recorded, simulated and easy to follow.',
        primaryCta: { label: 'Open an account', href: '/register' },
        secondaryCta: { label: 'Sign in to Transfers', href: '/login?returnTo=%2Ftransfers' },
        highlights: [
            {
                icon: 'transfer',
                title: 'Between your accounts',
                body: 'Move money from checking to savings or back again, and see both balances update at once.',
            },
            {
                icon: 'calendar',
                title: 'Schedule ahead',
                body: 'Set up a one-time transfer between your own accounts that runs on the date you choose.',
            },
            {
                icon: 'clock',
                title: 'See what is coming',
                body: 'Upcoming scheduled transfers are listed in one place, so you always know what is due to move and when.',
            },
        ],
        feature: {
            eyebrow: 'Scheduled transfers',
            title: 'Your money. Moving forward.',
            body: 'Choose a future date and Willow runs a one-time transfer between your own accounts on that day, in UTC. If funds are short or a limit would be exceeded, the transfer does not run and its status explains why.',
            points: [
                'One-time transfers on a date you choose',
                'Dates follow Coordinated Universal Time (UTC)',
                'Cancel any time before the scheduled date',
                'A notification when a transfer completes or fails',
            ],
        },
        steps: [
            {
                title: 'Choose two accounts',
                body: 'Pick the account to move money from and the account to move it to. Both must belong to you.',
            },
            {
                title: 'Pick the amount and date',
                body: 'Transfer straight away, or choose a future date for a one-time scheduled transfer that runs in UTC.',
            },
            {
                title: 'Review and confirm',
                body: 'Check the details, confirm, and follow the result in your transaction history or scheduled transfers.',
            },
        ],
        faqs: [
            {
                q: 'When does a scheduled transfer run?',
                a: 'On the date you choose, based on Coordinated Universal Time (UTC). Depending on where you are, that can fall on the evening before or early on the morning of that date in your own time zone.',
            },
            {
                q: 'Why did my scheduled transfer fail?',
                a: 'The usual reasons are insufficient simulated funds in the source account on the day, the daily transfer limit being reached, or one of the accounts no longer being active. The transfer shows the reason, and you receive a notification.',
            },
            {
                q: 'Can I set up recurring transfers?',
                a: 'No. Scheduled transfers in the demo run once, on a single date. To move money on several dates, set up a separate scheduled transfer for each one.',
            },
            {
                q: 'Can I transfer to another bank?',
                a: 'No. Transfers move simulated money between your own Willow accounts, and payments can go to other Willow demo customers. No external bank or payment network is connected.',
            },
        ],
        disclosure: 'Transfers move simulated demo balances between Willow accounts only. No real money moves and no external bank or payment system is connected.',
        related: ['payments', 'accounts', 'savings'],
    },
    {
        slug: 'savings',
        group: 'money',
        path: '/money/savings',
        navLabel: 'Savings',
        navDescription: 'Savings accounts and goals you can track',
        icon: 'savings',
        metaDescription: 'Set money aside in Willow demo savings accounts and track goals for an emergency fund, a home or travel. Progress is self-reported and illustrative.',
        eyebrow: 'Willow Savings',
        headline: 'Give every goal a place of its own.',
        lede: 'Keep savings in a separate account and track the goals that matter, from an emergency fund to a first home. Simple tools for steady progress, without pressure.',
        primaryCta: { label: 'Open an account', href: '/register' },
        secondaryCta: { label: 'Sign in to Goals', href: '/login?returnTo=%2Fgoals' },
        highlights: [
            {
                icon: 'savings',
                title: 'Separate savings accounts',
                body: 'Open a savings account alongside checking, so money set aside stays visibly apart from everyday spending.',
            },
            {
                icon: 'target',
                title: 'Goals with a purpose',
                body: 'Create goals for an emergency fund, a home, travel or anything else, each with a target amount of its own.',
            },
            {
                icon: 'chart',
                title: 'Progress at a glance',
                body: 'See how far each goal has come and how much remains, with progress you update yourself as you save.',
            },
        ],
        feature: {
            eyebrow: 'Goals tracker',
            title: 'Progress you can see, at your own pace.',
            body: 'Goals in Willow are a planning tool. You set a target, record what you have saved and watch the progress bar fill. Goals never move money on their own, so you stay in control of every transfer.',
            points: [
                'Emergency fund, home, travel and other goals',
                'Self-reported progress toward each target',
                'Goals never move money automatically',
                'Goals shown in Willow Hub alongside balances',
            ],
        },
        steps: [
            {
                title: 'Open a savings account',
                body: 'Add a savings account next to your checking account, in the currency that suits you. It starts at zero.',
            },
            {
                title: 'Set a goal',
                body: 'Name a goal, choose a category such as emergency fund, home or travel, and set the amount you are aiming for.',
            },
            {
                title: 'Record your progress',
                body: 'Update a goal as you save, and move simulated funds into savings with a transfer whenever you choose.',
            },
        ],
        faqs: [
            {
                q: 'Do Willow savings accounts earn interest?',
                a: 'No. Savings accounts in the demo do not earn interest, and Willow does not offer or advertise any rate. They are designed to show how keeping savings separate can make progress easier to see.',
            },
            {
                q: 'Does a goal move money for me?',
                a: 'No. Goal progress is self-reported. Updating a goal records how much you have saved toward it, but it never moves money between accounts. Use a transfer if you want to move simulated funds into savings.',
            },
            {
                q: 'What kinds of goals can I create?',
                a: 'Common goals include an emergency fund, a home and travel, and you can give any goal a name of your own. Each goal has a target amount and a record of progress that you update as you go.',
            },
            {
                q: 'Is my savings balance real?',
                a: 'No. Every Willow balance is simulated, including savings. New savings accounts start at zero, and you can add simulated demo funds or transfer them from another of your Willow accounts.',
            },
        ],
        disclosure: 'Willow savings accounts hold simulated balances and earn no interest. Goals are planning tools with self-reported progress, and they never move money.',
        related: ['accounts', 'transfers', 'portfolio'],
    },
    {
        slug: 'international',
        group: 'money',
        path: '/money/international',
        navLabel: 'International',
        navDescription: 'Currency accounts and indicative rates',
        icon: 'globe',
        metaDescription: 'Hold USD, EUR, GBP, MZN and ZAR demo accounts, check indicative exchange rates and simulate conversions between your own currency accounts.',
        eyebrow: 'Willow International',
        headline: 'Money that travels as easily as you do.',
        lede: 'Hold five currencies on one profile, check indicative exchange rates and estimate a conversion before you simulate it. Designed for lives and businesses that cross borders.',
        primaryCta: { label: 'Open an account', href: '/register' },
        secondaryCta: { label: 'Sign in to International', href: '/login?returnTo=%2Finternational' },
        highlights: [
            {
                icon: 'layers',
                title: 'Five currency accounts',
                body: 'Open accounts in US dollars, euros, British pounds, Mozambican metical and South African rand.',
            },
            {
                icon: 'refresh',
                title: 'Indicative rates',
                body: 'See indicative exchange rates from a market-data provider. They may be delayed and are shown for reference only.',
            },
            {
                icon: 'calculator',
                title: 'Conversion estimator',
                body: 'Enter an amount and see roughly what it would be worth in another currency before you convert.',
            },
        ],
        feature: {
            eyebrow: 'Travel and spending',
            title: 'Stay oriented wherever you are.',
            body: 'A travel spending view shows how you spend across currencies, and the international use toggle decides whether each demo card works abroad. Simulated conversions between your own accounts use the indicative rate, with no fees modeled.',
            points: [
                'USD, EUR, GBP, MZN and ZAR accounts',
                'Simulated conversion between your own accounts',
                'Same-currency sends to Willow demo customers',
                'An international use toggle on every card',
            ],
        },
        steps: [
            {
                title: 'Open a currency account',
                body: 'Add an account in USD, EUR, GBP, MZN or ZAR. You can hold several currencies on one profile.',
            },
            {
                title: 'Check the indicative rate',
                body: 'Use the conversion estimator to see roughly what an amount would be worth in another currency.',
            },
            {
                title: 'Convert or send',
                body: 'Simulate a conversion between your own accounts, or send the same currency to another Willow demo customer.',
            },
        ],
        faqs: [
            {
                q: 'Are the exchange rates real?',
                a: 'They are indicative rates retrieved from a market-data provider. They may be delayed or temporarily unavailable, and they are not quotes or offers. Willow does not execute real foreign exchange.',
            },
            {
                q: 'Are there fees on conversions?',
                a: 'No fees are modeled in the demo. A simulated conversion uses the indicative rate as shown. Real-world conversions usually involve a spread, a fee or both, so actual costs would be higher.',
            },
            {
                q: 'Can I send money abroad?',
                a: 'You can send money in the same currency to other Willow demo customers, wherever they are. Willow does not connect to SWIFT, SEPA or any other international payment network, so no money leaves the demo.',
            },
            {
                q: 'Why is a rate sometimes unavailable?',
                a: 'Rates come from an external market-data provider. If the provider is slow or unreachable, a rate may be delayed or missing for a while. Willow labels rates as indicative for this reason.',
            },
        ],
        disclosure: 'Exchange rates in Willow are indicative and may be delayed. Currency conversions are simulated at that rate with no fees modeled, and no real foreign exchange takes place.',
        related: ['accounts', 'cards', 'payments'],
    },

    // ----------------------------------------------------------------- Wealth
    {
        slug: 'stocks',
        group: 'wealth',
        path: '/invest/stocks',
        navLabel: 'Stocks',
        navDescription: 'Simulated trading with real market data',
        icon: 'trend',
        metaDescription: 'Practice investing in stocks with $100,000 of simulated cash, delayed market data, interactive charts and company profiles. No real trades take place.',
        eyebrow: 'Willow Wealth',
        headline: 'Practice investing with real market data.',
        lede: 'Explore a curated list of companies with delayed market data, interactive charts and key statistics, then place simulated orders with $100,000 of demo cash.',
        primaryCta: { label: 'Open an account', href: '/register' },
        secondaryCta: { label: 'Explore markets', href: '/login?returnTo=%2Fwealth%2Fmarkets' },
        highlights: [
            {
                icon: 'chart',
                title: 'Interactive charts',
                body: 'Follow price history from a single day to the maximum range available, with key statistics alongside.',
            },
            {
                icon: 'building',
                title: 'Company profiles',
                body: 'Read a short company profile and recent news where available, before you decide to place a simulated order.',
            },
            {
                icon: 'zap',
                title: 'Simulated orders',
                body: 'Buy and sell at the latest available price, set on the server, using cash that exists only in your demo portfolio.',
            },
        ],
        feature: {
            eyebrow: 'Market data',
            title: 'Real data, simulated decisions.',
            body: 'Prices and charts come from Yahoo Finance through the open-source yfinance library. Data may be delayed or briefly unavailable and is intended for prototyping. Orders are simulated, so you can learn how markets move with no real money at stake.',
            points: [
                'Charts from 1D to MAX',
                'Key statistics and company profile',
                'Recent news where available',
                'A watchlist for companies you follow',
            ],
        },
        steps: [
            {
                title: 'Browse the markets',
                body: 'Start with a curated list of well-known companies, each with a price chart and key statistics.',
            },
            {
                title: 'Study a company',
                body: 'Read the company profile, review its price history and check recent news where it is available.',
            },
            {
                title: 'Place a simulated order',
                body: 'Buy or sell with demo portfolio cash. The order is priced on the server at the latest available price.',
            },
        ],
        faqs: [
            {
                q: 'Am I buying real shares?',
                a: 'No. Willow is not a broker. Orders are simulated and priced at the latest available market price, but no real security is bought or sold, and nothing is held on your behalf.',
            },
            {
                q: 'Where does the market data come from?',
                a: 'From Yahoo Finance, retrieved through the open-source yfinance library. The data may be delayed or temporarily unavailable, and it is used here for prototyping and education only.',
            },
            {
                q: 'How is my order price decided?',
                a: 'When you confirm a simulated order, Willow prices it on the server at the latest available price for that stock. The figure on screen before you confirm can differ slightly if newer data has arrived.',
            },
            {
                q: 'Does Willow recommend stocks?',
                a: 'No. Willow does not give investment advice or recommendations. The curated list exists to make the demo easy to explore, not to suggest that any company is a good investment.',
            },
        ],
        disclosure: 'Stock trading in Willow is simulated with $100,000 of demo cash. Willow is not a broker, gives no investment advice and never buys or sells real securities.',
        related: ['etfs', 'portfolio', 'funds'],
    },
    {
        slug: 'etfs',
        group: 'wealth',
        path: '/invest/etfs',
        navLabel: 'ETFs',
        navDescription: 'Exchange-traded funds, simulated',
        icon: 'layers',
        metaDescription: 'Explore exchange-traded funds in the Willow demo with delayed market data, charts and key statistics, and practice with simulated orders only.',
        eyebrow: 'Willow Wealth',
        headline: 'Broad exposure, explained simply.',
        lede: 'Exchange-traded funds hold a basket of investments and trade like a single share. Explore a curated selection with delayed market data and practice with simulated orders.',
        primaryCta: { label: 'Open an account', href: '/register' },
        secondaryCta: { label: 'Explore ETFs', href: '/login?returnTo=%2Fwealth%2Fmarkets%3Ftype%3Detf' },
        highlights: [
            {
                icon: 'layers',
                title: 'Many holdings in one',
                body: 'An ETF can hold dozens or hundreds of securities, which is one reason they are often used to spread risk.',
            },
            {
                icon: 'chart',
                title: 'Charts and statistics',
                body: 'Review price history, trading range and key statistics for each ETF in the curated list.',
            },
            {
                icon: 'pie',
                title: 'See your allocation',
                body: 'Once you hold simulated ETF positions, your portfolio dashboard shows how they fit alongside everything else.',
            },
        ],
        feature: {
            eyebrow: 'How ETFs work',
            title: 'One trade, a whole basket of investments.',
            body: 'An ETF usually tracks an index, a sector or a strategy, and its price moves through the trading day like a stock. Ongoing costs are expressed as an expense ratio, which is worth checking before investing in any real fund.',
            points: [
                'Traded during the day like a single stock',
                'Often built to track an index or sector',
                'Ongoing costs are known as the expense ratio',
                'Diversification does not prevent losses',
            ],
        },
        steps: [
            {
                title: 'Filter for ETFs',
                body: 'Narrow the markets view to exchange-traded funds and see the curated selection in one list.',
            },
            {
                title: 'Compare a few funds',
                body: 'Review the price history and key statistics of each ETF, and read its profile where one is available.',
            },
            {
                title: 'Practice with demo cash',
                body: 'Place a simulated order and follow how the position behaves in your portfolio over time.',
            },
        ],
        faqs: [
            {
                q: 'What is the difference between an ETF and a stock?',
                a: 'A stock is a share in one company. An ETF is a fund that holds many securities and trades on an exchange like a stock, so a single purchase gives exposure to the whole basket.',
            },
            {
                q: 'Are ETFs safer than individual stocks?',
                a: 'Spreading money across many holdings can reduce the impact of any single company, but ETFs still rise and fall with the markets they track. They can lose value, and some are narrowly focused or use complex strategies.',
            },
            {
                q: 'Are the ETF prices live?',
                a: 'Prices come from Yahoo Finance through the open-source yfinance library and may be delayed or unavailable. They are suitable for learning and prototyping, not for making real investment decisions.',
            },
            {
                q: 'Does buying an ETF use my bank balance?',
                a: 'No. Simulated investing uses the $100,000 of demo cash in your separate portfolio. Your bank account balances are never touched by simulated orders, and portfolio cash cannot be moved into your accounts.',
            },
        ],
        disclosure: 'ETF orders in Willow are simulated with demo portfolio cash. Market data may be delayed, and no real fund units are bought, sold or held.',
        related: ['stocks', 'funds', 'portfolio'],
    },
    {
        slug: 'funds',
        group: 'wealth',
        path: '/invest/funds',
        navLabel: 'Funds',
        navDescription: 'Mutual and index funds, simulated',
        icon: 'coins',
        metaDescription: 'Learn how mutual and index funds work, explore a curated list with delayed market data and practice with simulated orders in the Willow demo.',
        eyebrow: 'Willow Wealth',
        headline: 'Patient investing, made easier to understand.',
        lede: 'Mutual and index funds pool money from many investors into one portfolio. Explore a curated list, read the key statistics and practice with simulated orders.',
        primaryCta: { label: 'Open an account', href: '/register' },
        secondaryCta: { label: 'Explore funds', href: '/login?returnTo=%2Fwealth%2Fmarkets%3Ftype%3Dfund' },
        highlights: [
            {
                icon: 'pie',
                title: 'Pooled by design',
                body: 'A fund combines many investments into a single holding, managed to a stated objective or built to follow an index.',
            },
            {
                icon: 'scale',
                title: 'Active and index',
                body: 'Some funds aim to beat a benchmark through active choices. Index funds aim to track one, often at lower cost.',
            },
            {
                icon: 'clock',
                title: 'Priced once a day',
                body: 'Traditional mutual funds are priced once each trading day. Willow uses the latest available price for simulated orders.',
            },
        ],
        feature: {
            eyebrow: 'Long-term thinking',
            title: 'Understand what you own and what it costs.',
            body: 'Every fund has an objective, a set of holdings and ongoing costs. Reading these before investing helps you compare like with like. In Willow, you can explore funds and build a simulated position with no real money at stake.',
            points: [
                'Mutual funds and index funds in one list',
                'Key statistics and price history',
                'Simulated orders at the latest available price',
                'Positions tracked in your demo portfolio',
            ],
        },
        steps: [
            {
                title: 'Explore the fund list',
                body: 'Filter the markets view to mutual and index funds and browse the curated selection.',
            },
            {
                title: 'Read before you choose',
                body: 'Check price history and key statistics, and consider how a fund would sit alongside what you already hold.',
            },
            {
                title: 'Build a simulated position',
                body: 'Place a simulated order with demo portfolio cash and track the fund on your portfolio dashboard.',
            },
        ],
        faqs: [
            {
                q: 'What is an index fund?',
                a: 'An index fund aims to match the performance of a market index by holding the same securities in similar proportions. Because it does not rely on active stock picking, its ongoing costs are often lower.',
            },
            {
                q: 'How are fund orders priced in Willow?',
                a: 'Simulated orders use the latest available price from the market-data provider. Real mutual fund orders are usually filled at the next calculated net asset value, so real results would differ.',
            },
            {
                q: 'Can funds lose value?',
                a: 'Yes. Funds invest in markets, and their value can fall as well as rise, so you may get back less than you put in. In Willow, any gains or losses are simulated and affect only your demo portfolio.',
            },
            {
                q: 'Is Willow a fund manager?',
                a: 'No. Willow does not manage, distribute or recommend any fund. The funds in the curated list are shown with public market data for demonstration and education only.',
            },
        ],
        disclosure: 'Fund investing in Willow is simulated with demo portfolio cash. No real fund units are bought or held, and nothing here is investment advice.',
        related: ['etfs', 'stocks', 'portfolio'],
    },
    {
        slug: 'crypto',
        group: 'wealth',
        path: '/invest/crypto',
        navLabel: 'Crypto',
        navDescription: 'Simulated BTC, ETH, SOL, XRP, ADA and LTC',
        icon: 'bitcoin',
        metaDescription: 'Explore Bitcoin, Ethereum and other cryptoassets with market data, charts and simulated trades, plus a demo wallet with no blockchain or keys.',
        eyebrow: 'Willow Crypto',
        headline: 'Explore crypto with clear eyes.',
        lede: 'Follow six major cryptoassets with market data and price charts, practice simulated trades and learn the risks in plain language. No real coins, keys or blockchain involved.',
        primaryCta: { label: 'Open an account', href: '/register' },
        secondaryCta: { label: 'Sign in to Crypto', href: '/login?returnTo=%2Fcrypto' },
        highlights: [
            {
                icon: 'bitcoin',
                title: 'Six cryptoassets',
                body: 'Explore Bitcoin, Ethereum, Solana, XRP, Cardano and Litecoin in a single market overview.',
            },
            {
                icon: 'wallet',
                title: 'A demo wallet',
                body: 'Hold simulated units and send them to other Willow demo profiles. There are no addresses, keys or withdrawals.',
            },
            {
                icon: 'alert',
                title: 'Risk, in plain words',
                body: 'Read clear education on volatility, security and how crypto differs from money held in a bank account.',
            },
        ],
        feature: {
            eyebrow: 'Simulated trading',
            title: 'Practice the moves, without the exposure.',
            body: 'Buy and sell simulated crypto with your demo portfolio cash at the latest available price. Activity history records every trade and transfer, so you can see how positions change as prices move.',
            points: [
                'Market overview and price charts',
                'Simulated buy and sell orders',
                'Send units between Willow demo profiles',
                'Wallet security notes and risk education',
            ],
        },
        steps: [
            {
                title: 'Read the risks first',
                body: 'Start with the education and risk notes. Crypto prices can move sharply and quickly in either direction.',
            },
            {
                title: 'Follow the market',
                body: 'Use the market overview and price charts to see how each of the six cryptoassets has moved.',
            },
            {
                title: 'Trade or send units',
                body: 'Place simulated trades with demo cash, or send units to another Willow demo profile by email.',
            },
        ],
        faqs: [
            {
                q: 'Can I withdraw crypto to an external wallet?',
                a: 'No. The Willow crypto wallet is simulated. It has no blockchain connection, no addresses and no private keys, so units can only move between Willow demo profiles and can never be withdrawn.',
            },
            {
                q: 'What pays for simulated crypto trades?',
                a: 'Simulated crypto orders use the demo cash in your separate Willow portfolio, never your bank balances. Prices come from the latest available market data, which may be delayed.',
            },
            {
                q: 'Why do crypto prices move so much?',
                a: 'Cryptoassets trade around the clock, and their prices respond quickly to sentiment, liquidity and news. Large rises and falls in a short time are common, and the value of a holding can drop sharply.',
            },
            {
                q: 'Does Willow recommend any cryptoasset?',
                a: 'No. Willow gives no investment advice. The six assets are included to make the demo useful for learning, not because any of them is suitable for you.',
            },
        ],
        disclosure: 'Crypto trading and wallets in Willow are simulated. No real cryptoassets are bought, held or transferred, and no blockchain is used.',
        related: ['portfolio', 'stocks', 'etfs'],
    },
    {
        slug: 'portfolio',
        group: 'wealth',
        path: '/invest/portfolio',
        navLabel: 'Portfolio',
        navDescription: 'Track simulated holdings and returns',
        icon: 'pie',
        metaDescription: 'Track a simulated portfolio funded with $100,000 of demo cash: value, daily change, total return, allocation, holdings and a watchlist in one view.',
        eyebrow: 'Willow Portfolio',
        headline: 'See how your investments fit together.',
        lede: 'One dashboard for your simulated portfolio: value, daily change, total return and allocation, with every holding and order recorded. Start with $100,000 of demo cash.',
        primaryCta: { label: 'Open an account', href: '/register' },
        secondaryCta: { label: 'View your portfolio', href: '/login?returnTo=%2Fwealth' },
        highlights: [
            {
                icon: 'pie',
                title: 'Allocation at a glance',
                body: 'See how your simulated holdings divide across different investments, and notice concentration early.',
            },
            {
                icon: 'trend',
                title: 'Returns in context',
                body: 'Follow total return and daily change for the whole portfolio and for each position you hold.',
            },
            {
                icon: 'eye',
                title: 'A watchlist that waits',
                body: 'Keep an eye on names you are curious about without placing an order, and return when you are ready.',
            },
        ],
        feature: {
            eyebrow: 'Demo portfolio',
            title: '$100,000 of simulated cash, kept separate.',
            body: 'Every profile receives $100,000 of simulated cash in a dedicated demo portfolio. It is entirely separate from your bank balances, so buying and selling never touches your accounts, and bank activity never changes your portfolio.',
            points: [
                'Value, daily change and total return',
                'Allocation and holdings breakdown',
                'Full activity history of simulated orders',
                'A watchlist for future research',
            ],
        },
        steps: [
            {
                title: 'Start with demo cash',
                body: 'Every profile begins with $100,000 of simulated cash in a dedicated portfolio, separate from your accounts.',
            },
            {
                title: 'Build positions',
                body: 'Place simulated orders across stocks, ETFs and funds, and add anything else to your watchlist.',
            },
            {
                title: 'Review the dashboard',
                body: 'Follow value, daily change, total return and allocation, with a full record of every order.',
            },
        ],
        faqs: [
            {
                q: 'Can I move portfolio cash into my bank account?',
                a: 'No. The $100,000 of simulated portfolio cash is kept completely separate from your bank balances. It cannot be transferred into or out of your accounts, and it has no real value.',
            },
            {
                q: 'What does total return show?',
                a: 'Total return shows how much your simulated portfolio has gained or lost overall, based on the latest available prices of what you hold and the results of positions you have sold. It reflects demo activity only.',
            },
            {
                q: 'Why has my portfolio value not changed?',
                a: 'Values depend on market data from Yahoo Finance through the open-source yfinance library. Data may be delayed, and outside market hours or during a provider outage, prices may not update for a while.',
            },
            {
                q: 'Is my portfolio part of my net worth?',
                a: 'Yes. Willow Hub adds your simulated portfolio value and simulated crypto value to your demo bank balances to show a combined net worth. Each part stays separate, and nothing moves between them.',
            },
        ],
        disclosure: 'Your Willow portfolio is simulated. The $100,000 starting cash is demo money, separate from bank balances, and no real securities are bought or held.',
        related: ['stocks', 'crypto', 'savings'],
    },

    // ----------------------------------------------------------------- Borrow
    {
        slug: 'personal-loans',
        group: 'borrow',
        path: '/borrow/personal-loans',
        navLabel: 'Personal loans',
        navDescription: 'Estimate payments and total interest',
        icon: 'calculator',
        metaDescription: 'Estimate the monthly payment and total interest on a personal loan with the Willow calculator. Results are illustrative, and Willow offers no loans.',
        eyebrow: 'Willow Borrow',
        headline: 'Know the numbers before you borrow.',
        lede: 'Enter an amount, a rate and a term to see an estimated monthly payment and the total interest over the life of a loan. A clear starting point for comparing real offers.',
        primaryCta: { label: 'Open an account', href: '/register' },
        secondaryCta: { label: 'Open the calculator', href: '/login?returnTo=%2Floans' },
        highlights: [
            {
                icon: 'calculator',
                title: 'Monthly payment',
                body: 'See an estimated fixed monthly payment for the amount, rate and term you enter, updated as you adjust them.',
            },
            {
                icon: 'percent',
                title: 'Total cost of borrowing',
                body: 'Understand how much interest you would pay in total, and how a longer or shorter term changes that figure.',
            },
            {
                icon: 'file',
                title: 'Save an estimate',
                body: 'Save estimates to your profile and come back to them when you want to compare different scenarios.',
            },
        ],
        feature: {
            eyebrow: 'How estimates work',
            title: 'A transparent view of a fixed-rate loan.',
            body: "The calculator uses standard amortization: each monthly payment covers that month's interest and repays part of the balance. Early payments are mostly interest, later ones mostly principal. Fees and taxes are not included.",
            points: [
                'Estimated monthly payment',
                'Total interest and total repaid',
                'How the term changes the total cost',
                'Saved estimates on your profile',
            ],
        },
        steps: [
            {
                title: 'Enter the amount',
                body: 'Start with the amount you are thinking of borrowing. Try a few figures to see how the payment responds.',
            },
            {
                title: 'Set the rate and term',
                body: 'Use the APR from a real quote if you have one. Willow does not offer or suggest a rate.',
            },
            {
                title: 'Review and save',
                body: 'See the estimated payment and total interest, then save the estimate to your profile to revisit later.',
            },
        ],
        faqs: [
            {
                q: 'Can I apply for a loan with Willow?',
                a: 'No. Willow offers no loans or credit lines, performs no credit checks and makes no lending decisions. The calculator is an educational tool for estimating payments and understanding the cost of borrowing.',
            },
            {
                q: 'What does the estimate leave out?',
                a: 'Estimates assume a fixed rate and equal monthly payments. They do not include origination or late fees, insurance, taxes or the effect of your credit history on the rate a lender would actually offer.',
            },
            {
                q: 'What rate should I enter?',
                a: 'Use the APR from a real quote if you have one. Willow does not publish or suggest rates. Trying a few different rates shows how sensitive the monthly payment is to small changes.',
            },
            {
                q: 'Why is so much of an early payment interest?',
                a: 'Interest is charged on the outstanding balance, which is highest at the start. As you repay principal, the interest portion shrinks and more of each payment goes toward reducing what you owe.',
            },
        ],
        disclosure: 'Loan calculator results are illustrative estimates. Willow offers no loans, performs no credit checks and makes no lending decisions.',
        related: ['credit', 'mortgages', 'savings'],
    },
    {
        slug: 'credit',
        group: 'borrow',
        path: '/borrow/credit',
        navLabel: 'Credit',
        navDescription: 'Plan a credit card payoff',
        icon: 'percent',
        metaDescription: 'Estimate how long it could take to pay off a credit card balance and how much interest it may cost with the Willow payoff calculator. Estimates only.',
        eyebrow: 'Willow Borrow',
        headline: 'A clearer path to paying off a balance.',
        lede: 'Enter a balance, an interest rate and a monthly payment to estimate how long payoff could take and how much interest you might pay along the way. No credit is offered.',
        primaryCta: { label: 'Open an account', href: '/register' },
        secondaryCta: { label: 'Open the payoff calculator', href: '/login?returnTo=%2Floans%23credit' },
        highlights: [
            {
                icon: 'clock',
                title: 'Time to payoff',
                body: 'See roughly how many months it could take to clear a balance at the monthly payment you choose.',
            },
            {
                icon: 'percent',
                title: 'Interest in view',
                body: 'Understand how much of what you repay goes to interest, and how paying a little more changes it.',
            },
            {
                icon: 'file',
                title: 'Saved estimates',
                body: 'Save a payoff estimate to your profile and return to it as your balance or your plan changes.',
            },
        ],
        feature: {
            eyebrow: 'Why the payment matters',
            title: 'Small increases can shorten the road.',
            body: 'Credit card interest is usually charged on the balance you carry from month to month. Paying more than the minimum reduces that balance faster, which lowers the interest charged in every month that follows.',
            points: [
                'Estimated months to payoff',
                'Total interest over the payoff period',
                'Compare different monthly payments',
                'Save estimates to your profile',
            ],
        },
        steps: [
            {
                title: 'Enter your balance',
                body: 'Start with the balance you carry today, as shown on your most recent card statement.',
            },
            {
                title: 'Add rate and payment',
                body: 'Enter the APR from your statement and the amount you plan to pay toward the card each month.',
            },
            {
                title: 'See your payoff path',
                body: 'Review the estimated months to payoff and total interest, then try a higher payment to compare.',
            },
        ],
        faqs: [
            {
                q: 'Does Willow offer credit cards?',
                a: 'No. Willow cards are demo debit cards, and Willow offers no credit cards, credit lines or loans. The payoff calculator is an educational tool that works only with the numbers you enter.',
            },
            {
                q: 'What does the payoff estimate assume?',
                a: 'It assumes a fixed interest rate, a fixed monthly payment and no new purchases, fees or penalty rates. Card issuers often calculate interest daily and rates can change, so real results will differ.',
            },
            {
                q: 'What is APR on a credit card?',
                a: 'APR is the annual percentage rate charged on balances you carry. Issuers usually convert it to a daily or monthly rate. Many cards charge no interest on purchases if the full statement balance is paid on time.',
            },
            {
                q: 'Will using the calculator affect my credit score?',
                a: 'No. Willow performs no credit checks and does not share anything with credit bureaus. The calculator runs only on the figures you enter.',
            },
        ],
        disclosure: 'The credit card payoff calculator produces illustrative estimates. Willow offers no credit cards or credit lines and performs no credit checks.',
        related: ['personal-loans', 'mortgages', 'cards'],
    },
    {
        slug: 'mortgages',
        group: 'borrow',
        path: '/borrow/mortgages',
        navLabel: 'Mortgages',
        navDescription: 'Estimate a monthly home payment',
        icon: 'house',
        metaDescription: 'Estimate a monthly mortgage payment from home price, down payment, rate and term, with optional property tax and insurance. Willow offers no mortgages.',
        eyebrow: 'Willow Borrow',
        headline: 'See what a home could cost each month.',
        lede: 'Bring together home price, down payment, interest rate and term, with optional property tax and insurance, for an estimated monthly payment you can understand and save.',
        primaryCta: { label: 'Open an account', href: '/register' },
        secondaryCta: { label: 'Open the mortgage calculator', href: '/login?returnTo=%2Floans%23mortgage' },
        highlights: [
            {
                icon: 'house',
                title: 'Price and down payment',
                body: 'See how a larger down payment changes the amount you would borrow and the monthly payment that follows.',
            },
            {
                icon: 'calendar',
                title: 'Term and rate',
                body: 'Compare shorter and longer terms to understand the trade-off between monthly cost and total interest.',
            },
            {
                icon: 'receipt',
                title: 'Tax and insurance',
                body: 'Add estimated property tax and home insurance for a fuller picture of monthly housing costs.',
            },
        ],
        feature: {
            eyebrow: 'Beyond the headline rate',
            title: 'A monthly payment has more than one part.',
            body: 'A typical mortgage payment covers principal and interest, and lenders often collect property tax and insurance alongside it. Adding these optional costs gives a more realistic view of what a home could cost each month.',
            points: [
                'Home price, down payment, rate and term',
                'Optional property tax and insurance',
                'Estimated loan amount and monthly payment',
                'Save estimates to your profile',
            ],
        },
        steps: [
            {
                title: 'Enter price and down payment',
                body: 'Start with the home price you are considering and how much you could put down from your own savings.',
            },
            {
                title: 'Add rate and term',
                body: 'Use a rate from a real quote if you have one, and choose a term that matches what lenders offer where you live.',
            },
            {
                title: 'Include the extras',
                body: 'Add estimated property tax and insurance for a fuller monthly figure, then save the estimate.',
            },
        ],
        faqs: [
            {
                q: 'Can Willow give me a mortgage?',
                a: 'No. Willow offers no mortgages, makes no lending decisions and provides no pre-approvals. The calculator is an educational tool for understanding how a mortgage payment is built.',
            },
            {
                q: 'What is included in the estimate?',
                a: 'Principal and interest on a fixed-rate loan, plus property tax and home insurance if you add them. Closing costs, mortgage insurance, association fees and future rate changes are not included.',
            },
            {
                q: 'How much down payment do I need?',
                a: 'Requirements vary by lender, country and loan type. A larger down payment reduces the amount borrowed and the interest paid, and in some markets it can avoid the need for mortgage insurance.',
            },
            {
                q: 'Can I save my estimate?',
                a: 'Yes. When you are signed in, you can save mortgage estimates to your profile and revisit them later. Saved estimates are records of your own inputs, not offers or approvals.',
            },
        ],
        disclosure: 'Mortgage calculator results are illustrative estimates. Willow offers no mortgages, makes no lending decisions and provides no pre-approvals.',
        related: ['personal-loans', 'savings', 'credit'],
    },

    // --------------------------------------------------------------- Business
    {
        slug: 'business',
        group: 'business',
        path: '/business',
        navLabel: 'Business banking',
        navDescription: 'Accounts and tools for a growing business',
        icon: 'building',
        metaDescription: 'Run a demo business account with cards, invoices, a cash flow dashboard and simulated team invitations, built for single owners exploring Willow.',
        eyebrow: 'Willow Business',
        headline: 'Business banking with a clear view.',
        lede: 'A single-owner business checking account with demo cards, invoices and a dashboard that shows revenue, expenses and cash flow at a glance. Everything is simulated.',
        primaryCta: { label: 'Open business banking', href: '/register?type=business' },
        secondaryCta: { label: 'Sign in to Business', href: '/login?returnTo=%2Fbusiness%2Fdashboard' },
        highlights: [
            {
                icon: 'building',
                title: 'Business checking',
                body: 'Open a single-owner business checking account in any of five currencies, kept apart from personal money.',
            },
            {
                icon: 'invoice',
                title: 'Invoices',
                body: 'Create invoices, track what is outstanding and mark them paid to record a simulated payment.',
            },
            {
                icon: 'chart',
                title: 'Cash flow dashboard',
                body: 'See revenue, expenses and upcoming payments together, calculated from your business account activity.',
            },
        ],
        feature: {
            eyebrow: 'Business dashboard',
            title: 'Know where the business stands today.',
            body: 'Revenue is counted from completed credits to your business accounts and expenses from completed debits. Upcoming payments combine scheduled transfers and unpaid invoices, so you can see what is coming before it arrives.',
            points: [
                'Revenue, expenses and cash flow',
                'Upcoming payments and unpaid invoices',
                'Expense categories',
                'Team member invitations, simulated',
            ],
        },
        steps: [
            {
                title: 'Register as a business',
                body: 'Choose business banking when you register. Willow is a demo, so no company documents or checks are requested.',
            },
            {
                title: 'Open business checking',
                body: 'Open a single-owner business checking account in the currency you trade in, then add demo cards.',
            },
            {
                title: 'Run the business view',
                body: 'Create invoices, review expenses and follow revenue and cash flow on the business dashboard.',
            },
        ],
        faqs: [
            {
                q: 'Can more than one person own the business account?',
                a: 'Not in the demo. Business checking is single owner. You can send simulated team invitations to show how a team could work, but invitees do not receive access to the account.',
            },
            {
                q: 'How is revenue calculated?',
                a: 'Revenue on the dashboard is the total of completed credits to your business accounts, and expenses are completed debits. It is a simple cash view of simulated activity, not an accounting statement.',
            },
            {
                q: 'Does marking an invoice paid move money?',
                a: 'Marking an invoice paid records a simulated payment into one of your business accounts. No money is collected from your customer, and no real payment is processed.',
            },
            {
                q: 'Is my business registered or verified?',
                a: 'No. Willow does not verify businesses or perform onboarding checks of any kind. Business details you enter are used only to label your demo experience.',
            },
        ],
        disclosure: 'Willow Business is a demo. Accounts, cards, invoices and payments are simulated, and team invitations do not give anyone access.',
        related: ['business-cards', 'business-payments', 'expenses'],
    },
    {
        slug: 'business-cards',
        group: 'business',
        path: '/business/cards',
        navLabel: 'Business cards',
        navDescription: 'Demo cards with spending controls',
        icon: 'briefcase',
        metaDescription: 'Create physical and virtual demo cards for a Willow business account, with instant freeze, daily limits and spending controls. No card is issued.',
        eyebrow: 'Willow Business Cards',
        headline: 'Business spending, firmly in hand.',
        lede: 'Create physical and virtual demo cards linked to your business checking account, and decide exactly how each one can be used. Freeze, limit or replace a card in moments.',
        primaryCta: { label: 'Open business banking', href: '/register?type=business' },
        secondaryCta: { label: 'Sign in to Cards', href: '/login?returnTo=%2Fcards' },
        highlights: [
            {
                icon: 'card',
                title: 'Virtual for online costs',
                body: 'Create a virtual card for subscriptions and online suppliers, kept separate from the card you carry.',
            },
            {
                icon: 'scale',
                title: 'Limits that fit the role',
                body: 'Set a daily spending limit on each card, so routine costs stay within the range you expect.',
            },
            {
                icon: 'snowflake',
                title: 'Instant freeze',
                body: 'Freeze a business card immediately if it goes missing, then report it lost or request a replacement.',
            },
        ],
        feature: {
            eyebrow: 'Card controls',
            title: 'One set of controls for every business card.',
            body: 'Each business card has its own controls for online payments, contactless, ATM withdrawals and international use, plus a daily spending limit. Change them whenever the needs of the business change.',
            points: [
                'Physical and virtual demo cards',
                'A daily spending limit for each card',
                'Online, contactless, ATM and international toggles',
                'Report lost and replace from one place',
            ],
        },
        steps: [
            {
                title: 'Open business checking',
                body: 'Business cards link to a business checking account. Open one first if you have not already.',
            },
            {
                title: 'Create a card',
                body: 'Choose a physical or virtual demo card and link it to the business account it should draw on.',
            },
            {
                title: 'Set the controls',
                body: 'Set a daily limit and choose which payment types are allowed for that card, then adjust as needs change.',
            },
        ],
        faqs: [
            {
                q: 'Can I give cards to employees?',
                a: 'Not in the demo. Business checking is single owner and team invitations are simulated, so invitees cannot hold cards or access the account. Every business card belongs to the account owner.',
            },
            {
                q: 'Will a physical business card be sent to me?',
                a: 'No. Physical cards are demo cards only. Nothing is manufactured or shipped, and no card number can be used for a real purchase.',
            },
            {
                q: 'Can I use a business card for international spending?',
                a: 'Each card has an international use toggle that you can switch on or off at any time. In the demo this changes a setting only, because no card network is connected.',
            },
            {
                q: 'Are business cards credit cards?',
                a: 'No. They are demo debit cards linked to your business checking account. Willow offers no credit cards, charge cards or credit lines of any kind.',
            },
        ],
        disclosure: 'Willow business cards are demo cards. Nothing is issued or shipped, no card network is connected, and card controls change demo settings only.',
        related: ['business', 'expenses', 'cards'],
    },
    {
        slug: 'business-payments',
        group: 'business',
        path: '/business/payments',
        navLabel: 'Business payments',
        navDescription: 'Invoice and pay Willow demo customers',
        icon: 'invoice',
        metaDescription: 'Send simulated business payments to Willow demo customers, create invoices and record payments received. No real money is sent or collected.',
        eyebrow: 'Willow Business Payments',
        headline: 'Payments that keep the business moving.',
        lede: 'Send payments to other Willow demo customers, create invoices and record what has been paid, all from your business account. A clear record of money in and money out.',
        primaryCta: { label: 'Open business banking', href: '/register?type=business' },
        secondaryCta: { label: 'Sign in to Payments', href: '/login?returnTo=%2Ftransfers' },
        highlights: [
            {
                icon: 'send',
                title: 'Pay by email',
                body: 'Pay suppliers and partners who hold Willow demo profiles, in the same currency as your business account.',
            },
            {
                icon: 'invoice',
                title: 'Invoices, tracked',
                body: 'Create an invoice, follow its status and mark it paid to record a simulated payment into your account.',
            },
            {
                icon: 'globe',
                title: 'Across five currencies',
                body: 'Hold business balances in USD, EUR, GBP, MZN or ZAR and pay Willow demo customers wherever they are.',
            },
        ],
        feature: {
            eyebrow: 'Invoices',
            title: 'From invoice to paid, in one place.',
            body: 'Create an invoice for a customer and an amount, then track it until it is settled. Unpaid invoices appear in upcoming payments on the dashboard, and marking one paid records a simulated payment into your business account.',
            points: [
                'Create and track invoices',
                'Mark paid to record a simulated payment',
                'Pay Willow demo customers by email',
                'Saved payees and a receipt for every payment',
            ],
        },
        steps: [
            {
                title: 'Choose a recipient',
                body: 'Select a saved payee or enter the email address of another Willow demo customer.',
            },
            {
                title: 'Set amount and account',
                body: 'Enter the amount and pick the business account to pay from. Payments are sent in the same currency.',
            },
            {
                title: 'Review and confirm',
                body: 'Check every detail on the review screen, confirm, and keep the receipt with your business records.',
            },
        ],
        faqs: [
            {
                q: 'Can I pay suppliers outside Willow?',
                a: 'No. Business payments can only go to other Willow demo customers. External bank transfers, bill pay, card payments, SWIFT and SEPA are not available in the demo.',
            },
            {
                q: 'What happens when I mark an invoice paid?',
                a: 'Willow records a simulated payment into one of your business accounts and updates the invoice status to paid. No real payment is collected from your customer.',
            },
            {
                q: 'Is there a daily payment limit?',
                a: 'Yes. Outgoing transfers and payments are limited to 25,000 units of the account currency per day, the same limit that applies to personal accounts in the demo.',
            },
            {
                q: 'Can I pay in a different currency?',
                a: 'Payments to other Willow demo customers are sent in the same currency. To pay in another currency, first simulate a conversion between your own currency accounts at the indicative rate.',
            },
        ],
        disclosure: 'Business payments and invoice settlements in Willow are simulated. Payments move only between Willow demo customers, and no real money is sent or collected.',
        related: ['business', 'expenses', 'international'],
    },
    {
        slug: 'expenses',
        group: 'business',
        path: '/business/expenses',
        navLabel: 'Expenses',
        navDescription: 'Categorize and review business costs',
        icon: 'receipt',
        metaDescription: 'Track business expenses by category, follow cash flow and see upcoming payments on the Willow business dashboard. All activity is simulated demo data.',
        eyebrow: 'Willow Business Expenses',
        headline: 'See where the business money goes.',
        lede: 'Expenses are drawn from completed debits on your business accounts and grouped into categories, so costs are easier to understand and cash flow is easier to plan.',
        primaryCta: { label: 'Open business banking', href: '/register?type=business' },
        secondaryCta: { label: 'View the dashboard', href: '/login?returnTo=%2Fbusiness%2Fdashboard' },
        highlights: [
            {
                icon: 'tag',
                title: 'Expense categories',
                body: 'Spending is grouped into categories, so you can see which kinds of cost are adding up fastest.',
            },
            {
                icon: 'refresh',
                title: 'Cash flow, not guesswork',
                body: 'Compare money coming in with money going out to understand how much room the business really has.',
            },
            {
                icon: 'calendar',
                title: 'Upcoming payments',
                body: 'Scheduled transfers and unpaid invoices appear together, so commitments are visible before they arrive.',
            },
        ],
        feature: {
            eyebrow: 'Business dashboard',
            title: 'Costs in context, alongside revenue.',
            body: 'The dashboard counts completed debits from your business accounts as expenses and completed credits as revenue. Seeing both together, with upcoming payments listed alongside, makes pressure on cash easier to spot early.',
            points: [
                'Expenses from completed business debits',
                'Spending grouped by category',
                'Revenue, expenses and net cash flow',
                'Upcoming scheduled transfers and unpaid invoices',
            ],
        },
        steps: [
            {
                title: 'Use your business account',
                body: 'Pay business costs from business checking so they are counted in your expenses automatically.',
            },
            {
                title: 'Review the categories',
                body: 'Open the business dashboard to see how expenses are grouped and which categories are growing.',
            },
            {
                title: 'Plan what comes next',
                body: 'Check upcoming payments and cash flow together before you commit the business to a new cost.',
            },
        ],
        faqs: [
            {
                q: 'What counts as an expense?',
                a: 'Any completed debit from one of your business accounts, such as a payment to another Willow demo customer or a transfer out. Pending, canceled or failed transactions are not included.',
            },
            {
                q: 'Can I use these figures for accounting or taxes?',
                a: 'No. The dashboard is a cash view built from simulated activity. It is not an accounting system or a tax record, and it is no substitute for advice from a qualified accountant.',
            },
            {
                q: 'Can team members see expenses?',
                a: 'No. Team invitations are simulated, and invitees receive no access to the business account, its cards or its dashboard. Only the account owner can see business activity.',
            },
            {
                q: 'Can I download a record of expenses?',
                a: 'You can download a PDF statement for any business account and date range, listing the transactions behind your expenses. Statements are generated from simulated demo activity.',
            },
        ],
        disclosure: 'Expense and cash flow figures in Willow are calculated from simulated demo transactions. They are not accounting records and are not suitable for tax or reporting purposes.',
        related: ['business', 'business-cards', 'business-payments'],
    },
];

module.exports = { groups, products };
