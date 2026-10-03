'use strict';

/*
 * Help center content: searchable FAQs grouped by category.
 *
 * Willow is a demo platform. Answers must stay accurate to what the demo
 * actually does, and be plain about what is simulated. There is no staffed
 * support team, so answers favor self-service steps.
 *
 * `links` may only point at internal paths that exist in the app.
 */

const categories = [
    {
        slug: 'accounts',
        title: 'Accounts',
        icon: 'wallet',
        summary: 'Opening accounts, currencies, simulated balances, statements and transaction history.',
        articles: [
            {
                slug: 'open-another-account',
                question: 'How do I open another account?',
                answer: [
                    'Go to Accounts and choose Open an account. Pick personal checking, savings or business checking, select a currency and add a nickname if you like. The account is ready straight away and starts with a zero balance.',
                    'You can hold up to 10 accounts on one profile. Business checking is available for single owners only.',
                ],
                links: [{ label: 'Open an account', href: '/accounts/new' }],
            },
            {
                slug: 'currency-accounts',
                question: 'Which currencies can I hold?',
                answer: [
                    'Willow accounts can be held in US dollars (USD), euros (EUR), British pounds (GBP), Mozambican metical (MZN) and South African rand (ZAR). You choose the currency when you open the account.',
                    'Each account holds a single currency. To hold several, open an account in each one, then use International to estimate and simulate conversions between them at the indicative rate.',
                ],
                links: [
                    { label: 'Open an account', href: '/accounts/new' },
                    { label: 'Go to International', href: '/international' },
                ],
            },
            {
                slug: 'are-balances-real',
                question: 'Are my balances real money?',
                answer: [
                    'No. Willow is a demonstration platform and every balance is simulated. Accounts are not held at a regulated bank, carry no deposit insurance and cannot be withdrawn to a real bank account.',
                    'New accounts start at zero. Use Add money to place simulated demo funds in an account, so you can try payments, cards and statements.',
                ],
                links: [{ label: 'About the demo', href: '/demo' }],
            },
            {
                slug: 'savings-interest',
                question: 'Do savings accounts earn interest?',
                answer: [
                    'No. Savings accounts in the demo do not earn interest, and Willow does not offer or advertise any interest rate.',
                    'Savings accounts are still useful for keeping money set aside and visible. Pair one with a goal to track progress toward a target you choose.',
                ],
                links: [{ label: 'View your goals', href: '/goals' }],
            },
            {
                slug: 'find-a-transaction',
                question: 'How do I find a specific transaction?',
                answer: [
                    'Open Transactions, or the history of a single account, and use search and filters to narrow the list. Select any transaction to see its full details and reference.',
                ],
                links: [{ label: 'View transactions', href: '/transactions' }],
            },
            {
                slug: 'download-statement',
                question: 'How do I download a statement?',
                answer: [
                    'Go to Statements, choose the account and the date range you need, and download the PDF. Statements are generated from your simulated demo activity.',
                    'They are useful for reviewing activity, but they are not official financial records and should not be used as proof of funds or income.',
                ],
                links: [{ label: 'Go to Statements', href: '/statements' }],
            },
            {
                slug: 'rename-an-account',
                question: 'Can I give an account a nickname?',
                answer: [
                    'Yes. Add or change a nickname from the account details page, so each account is easy to recognize in lists, transfers and statements. A nickname changes how the account is labeled, not its account details.',
                ],
                links: [{ label: 'View your accounts', href: '/accounts' }],
            },
        ],
    },
    {
        slug: 'cards',
        title: 'Cards',
        icon: 'card',
        summary: 'Physical and virtual demo cards, freezing, card controls, limits and replacements.',
        articles: [
            {
                slug: 'freeze-a-card',
                question: 'How do I freeze or unfreeze a card?',
                answer: [
                    'Open Cards, select the card and choose Freeze. The status changes immediately, and you can unfreeze the card the same way. Freezing is a sensible first step if you cannot find a card or notice activity you do not recognize.',
                    'In the demo, freezing changes a setting only. No card network is connected.',
                ],
                links: [{ label: 'Go to Cards', href: '/cards' }],
            },
            {
                slug: 'create-a-virtual-card',
                question: 'How do I create a virtual card?',
                answer: [
                    'In Cards, choose to add a card, select Virtual and pick the account it should be linked to. The new card appears in your cards view straight away, and you can switch between cards to manage each one.',
                    'Virtual cards are demo cards, so their details cannot be used for real online purchases.',
                ],
                links: [{ label: 'Go to Cards', href: '/cards' }],
            },
            {
                slug: 'physical-card-delivery',
                question: 'When will my physical card arrive?',
                answer: [
                    'It will not arrive, because physical cards in Willow are demonstration cards only. Nothing is manufactured, printed or shipped.',
                    'You can still manage a physical demo card in the same way as a virtual one, including freezing it, setting limits and requesting a replacement.',
                ],
            },
            {
                slug: 'mobile-wallet-buttons',
                question: 'Why are the Apple Wallet and Google Wallet buttons disabled?',
                answer: [
                    'They are placeholders that show where mobile wallet setup would appear in a live product. Adding a card to a mobile wallet requires a connected card network and issuer, which the demo does not have.',
                ],
            },
            {
                slug: 'card-controls',
                question: 'What can I control on a card?',
                answer: [
                    'Each card has its own settings for online payments, contactless, ATM withdrawals and international use, plus a daily spending limit and a toggle for card transaction notifications. Change any of them from the card controls.',
                    'Controls change demo settings only. They are not enforced by a card network.',
                ],
                links: [{ label: 'Go to Cards', href: '/cards' }],
            },
            {
                slug: 'lost-card',
                question: 'What should I do if I lose a card?',
                answer: [
                    'Freeze the card first, so nothing new can be approved while you look for it. If it does not turn up, choose Report lost, then request a replacement linked to the same account.',
                    'The replacement is also a demo card, so nothing is manufactured or shipped.',
                ],
                links: [{ label: 'Go to Cards', href: '/cards' }],
            },
        ],
    },
    {
        slug: 'payments',
        title: 'Payments',
        icon: 'send',
        summary: 'Sending money to other Willow demo customers, saved payees, limits and receipts.',
        articles: [
            {
                slug: 'send-to-another-customer',
                question: 'How do I send money to another Willow customer?',
                answer: [
                    'Choose Send money, then enter the email address of another Willow demo customer or select a saved payee. Enter the amount, choose the account to pay from, review the details and confirm. A receipt appears when the payment completes.',
                    'The recipient must already have a Willow demo profile. Payments to other customers are sent in the same currency as the account you pay from.',
                ],
                links: [{ label: 'Send money', href: '/transfers' }],
            },
            {
                slug: 'saved-payees',
                question: 'How do saved payees work?',
                answer: [
                    'A saved payee stores the email address of a Willow demo customer you pay often. Select the payee at the start of a payment to skip entering their details again, and manage your list from Payees.',
                ],
                links: [{ label: 'Manage payees', href: '/payees' }],
            },
            {
                slug: 'pay-outside-willow',
                question: 'Can I pay a bank account outside Willow?',
                answer: [
                    'No. The demo does not connect to any external bank or payment network. Payments to other banks, bill pay, card payments, SWIFT and SEPA transfers are not available.',
                    'You can move money between your own accounts, or send it to another Willow demo customer by email.',
                ],
            },
            {
                slug: 'daily-payment-limit',
                question: 'Is there a daily limit on payments?',
                answer: [
                    'Yes. Outgoing transfers and payments are limited to 25,000 units of the sending account currency per day. For a US dollar account that means $25,000; for a euro account, 25,000 euros.',
                    'If a payment would take you over the limit, it is declined with a message explaining why. The limit applies to simulated balances only.',
                ],
            },
            {
                slug: 'payment-receipts',
                question: 'Where can I find a payment receipt?',
                answer: [
                    'A receipt is shown at the end of every completed payment, with the amount, the accounts involved and a reference. The payment also appears in your transaction history, where you can open its details again at any time.',
                ],
                links: [{ label: 'View transactions', href: '/transactions' }],
            },
            {
                slug: 'sent-to-wrong-person',
                question: 'What if I sent money to the wrong person?',
                answer: [
                    'Completed demo payments cannot be reversed from your side. Because no real money moves, the simplest fix is to ask the recipient to send the same amount back.',
                    'To avoid this, check the recipient and amount carefully on the review screen before you confirm.',
                ],
            },
        ],
    },
    {
        slug: 'transfers',
        title: 'Transfers',
        icon: 'transfer',
        summary: 'Moving money between your own accounts and scheduling one-time transfers.',
        articles: [
            {
                slug: 'transfer-between-accounts',
                question: 'How do I move money between my own accounts?',
                answer: [
                    'Open Transfers, choose the account to move money from and the account to move it to, enter the amount and confirm. Both balances update straight away, and the transfer appears in the history of each account.',
                ],
                links: [{ label: 'Make a transfer', href: '/transfers' }],
            },
            {
                slug: 'schedule-a-transfer',
                question: 'How do I schedule a transfer?',
                answer: [
                    'In Scheduled transfers, choose the two accounts, the amount and a future date, then confirm. The transfer runs once on that date, and the result appears in your scheduled transfers list and your notifications.',
                    'Scheduled transfers move simulated funds between your own accounts only.',
                ],
                links: [{ label: 'Scheduled transfers', href: '/scheduled-transfers' }],
            },
            {
                slug: 'scheduled-transfer-timing',
                question: 'When exactly does a scheduled transfer run?',
                answer: [
                    'Scheduled transfers are dated in Coordinated Universal Time (UTC), not your local time zone. A transfer becomes due at the start of the chosen date in UTC and is processed shortly after.',
                    'If you are west of UTC, such as in the Americas, that can be the evening before your chosen date. If you are east of UTC, it will usually be early on the morning of that date.',
                ],
            },
            {
                slug: 'scheduled-transfer-failed',
                question: 'Why did my scheduled transfer fail?',
                answer: [
                    'A scheduled transfer does not run if the source account lacks enough simulated funds on the day, if it would take you over the daily transfer limit, or if either account is no longer active. The reason is shown on the transfer and sent to you as a notification.',
                    'Nothing moves when a transfer fails. Add simulated funds or adjust the amount, then schedule a new transfer.',
                ],
                links: [{ label: 'Scheduled transfers', href: '/scheduled-transfers' }],
            },
            {
                slug: 'cancel-scheduled-transfer',
                question: 'Can I cancel a scheduled transfer?',
                answer: [
                    'Yes. A pending transfer can be canceled from Scheduled transfers at any time before its scheduled date. Once a transfer has run or failed, it can no longer be canceled.',
                ],
                links: [{ label: 'Scheduled transfers', href: '/scheduled-transfers' }],
            },
            {
                slug: 'recurring-transfers',
                question: 'Can I set up a recurring transfer?',
                answer: [
                    'Not in the demo. Each scheduled transfer runs once. To move money on several dates, create a separate scheduled transfer for each one.',
                ],
            },
        ],
    },
    {
        slug: 'investing',
        title: 'Investing',
        icon: 'chart',
        summary: 'Simulated investing, adding investing cash, order pricing, watchlists and market data.',
        articles: [
            {
                slug: 'investing-cash',
                question: 'How do I get cash to invest?',
                answer: [
                    'Investing cash starts at $0. On the Portfolio page, choose Add cash and move money in from one of your US dollar Willow accounts — the account is debited and the move appears in its history.',
                    'Orders then use that investing cash and never touch your account balances. Choose Withdraw cash to move uninvested cash back; sell holdings first to free up more.',
                ],
                links: [{ label: 'Go to Wealth', href: '/wealth' }],
            },
            {
                slug: 'how-orders-are-priced',
                question: 'How are simulated orders priced?',
                answer: [
                    'When you confirm a simulated buy or sell order, Willow prices it on the server at the latest available market price for that security. The price on screen before you confirm can differ slightly if newer data has arrived.',
                    'Real orders can be affected by trading costs, bid-ask spreads and timing, which the demo does not model, so real results would differ.',
                ],
            },
            {
                slug: 'market-data-delays',
                question: 'Why is market data delayed or unavailable?',
                answer: [
                    'Willow retrieves market data from Yahoo Finance through the open-source yfinance library. The data may be delayed, and the provider can be slow or temporarily unreachable. When that happens, some prices, charts or news may not load.',
                    'This data is for prototyping and education only. It is not a real-time feed and should not be relied on for real investment decisions.',
                ],
                links: [{ label: 'View markets', href: '/markets' }],
            },
            {
                slug: 'is-willow-a-broker',
                question: 'Is Willow a broker?',
                answer: [
                    'No. Willow does not buy, sell or hold real securities, and it gives no investment advice or recommendations. Orders in the demo are simulated, and the curated list of stocks, ETFs and funds exists to make the experience easy to explore.',
                ],
                links: [{ label: 'About simulated investing', href: '/invest/stocks' }],
            },
            {
                slug: 'using-the-watchlist',
                question: 'How do I use the watchlist?',
                answer: [
                    'Add a stock, ETF or fund to your watchlist from its detail page to follow it without placing an order. Your watchlist appears in Wealth, where you can open any item to see its chart and key statistics.',
                ],
                links: [{ label: 'Go to Wealth', href: '/wealth' }],
            },
            {
                slug: 'chart-ranges',
                question: 'What do the chart ranges mean?',
                answer: [
                    'Charts can show price history from a single day (1D) through to the maximum history available (MAX). Shorter ranges show recent movement in detail, while longer ranges show the broader trend.',
                    'Past price movements do not reliably indicate what will happen next.',
                ],
                links: [{ label: 'Explore markets', href: '/wealth/markets' }],
            },
        ],
    },
    {
        slug: 'crypto',
        title: 'Crypto',
        icon: 'bitcoin',
        summary: 'Simulated crypto trading, the demo wallet, sending units between profiles and risk.',
        articles: [
            {
                slug: 'supported-cryptoassets',
                question: 'Which cryptoassets are available?',
                answer: [
                    'The demo includes Bitcoin (BTC), Ethereum (ETH), Solana (SOL), XRP, Cardano (ADA) and Litecoin (LTC). Each has a market overview and price chart based on available market data, which may be delayed.',
                ],
                links: [{ label: 'Go to Crypto', href: '/crypto' }],
            },
            {
                slug: 'send-to-external-wallet',
                question: 'Can I send crypto to an external wallet?',
                answer: [
                    'No. The Willow crypto wallet is simulated and has no blockchain connection, no wallet addresses and no private keys. You can send units only to another Willow demo profile, using the recipient email address.',
                    'Units cannot be withdrawn, deposited from outside Willow or exchanged for real cryptoassets.',
                ],
            },
            {
                slug: 'buy-and-sell-crypto',
                question: 'How do I buy or sell crypto in the demo?',
                answer: [
                    'Open Crypto, choose an asset and place a simulated buy or sell order. Orders use your investing cash and are priced at the latest available price.',
                    'Your bank account balances are never used for simulated crypto trades.',
                ],
                links: [{ label: 'Go to Crypto', href: '/crypto' }],
            },
            {
                slug: 'why-crypto-is-high-risk',
                question: 'Why is crypto considered high risk?',
                answer: [
                    'Crypto prices can rise or fall sharply in a short time, markets trade around the clock and many cryptoassets have no underlying cash flows. Real holdings can also be lost through scams, hacks or lost keys, and are generally not covered by deposit insurance.',
                    'Our guide to crypto risk explains these points in more depth.',
                ],
                links: [{ label: 'Read the guides', href: '/learn' }],
            },
            {
                slug: 'crypto-wallet-security',
                question: 'How should a real crypto wallet be kept secure?',
                answer: [
                    'Never share a recovery phrase or private key, be wary of anyone promising guaranteed returns, and check addresses carefully before sending. Use two-step verification wherever a platform offers it.',
                    'The Willow demo wallet has no keys or addresses, so these risks do not apply here, but the habits are worth learning before you hold any real cryptoassets.',
                ],
            },
            {
                slug: 'crypto-activity',
                question: 'Where can I see my crypto activity?',
                answer: [
                    'The activity history in Crypto lists every simulated trade, send and receive, with the asset, quantity and time. It is a record of demo activity only.',
                ],
                links: [{ label: 'Go to Crypto', href: '/crypto' }],
            },
        ],
    },
    {
        slug: 'loans',
        title: 'Loans and calculators',
        icon: 'calculator',
        summary: 'Loan, mortgage and credit card payoff calculators, and what their estimates include.',
        articles: [
            {
                slug: 'can-i-borrow',
                question: 'Can I apply for a loan with Willow?',
                answer: [
                    'No. Willow offers no loans, mortgages, credit cards or credit lines. It performs no credit checks and makes no lending decisions.',
                    'The Borrow section provides calculators to help you understand how borrowing works and what a loan might cost.',
                ],
                links: [{ label: 'Personal loan calculator', href: '/borrow/personal-loans' }],
            },
            {
                slug: 'what-estimates-include',
                question: 'What does a loan estimate include?',
                answer: [
                    'Personal and business loan estimates show a fixed monthly payment, the total interest and the total repaid, based on the amount, rate and term you enter. They assume a fixed rate and equal monthly payments.',
                    'They exclude fees, insurance, taxes, rate changes and the effect of your credit history on the rate a real lender would offer.',
                ],
                links: [{ label: 'Open the calculators', href: '/loans' }],
            },
            {
                slug: 'mortgage-calculator',
                question: 'What does the mortgage calculator include?',
                answer: [
                    'It uses home price, down payment, interest rate and term to estimate principal and interest, and adds property tax and home insurance if you enter them.',
                    'Closing costs, mortgage insurance, association fees and future rate changes are not included.',
                ],
                links: [{ label: 'Mortgage calculator', href: '/borrow/mortgages' }],
            },
            {
                slug: 'credit-card-payoff',
                question: 'How does the credit card payoff calculator work?',
                answer: [
                    'Enter a balance, an APR and a monthly payment to estimate how many months payoff could take and how much interest you might pay along the way.',
                    'It assumes no new purchases, fees or rate changes. Card issuers often calculate interest daily, so real results will differ.',
                ],
                links: [{ label: 'Open the calculators', href: '/loans' }],
            },
            {
                slug: 'save-an-estimate',
                question: 'How do I save an estimate?',
                answer: [
                    'Sign in, run a calculation and choose to save the estimate. Saved estimates appear in Loans, so you can revisit and compare them later.',
                    'They are records of your own inputs, not offers, quotes or approvals.',
                ],
                links: [{ label: 'Go to Loans', href: '/loans' }],
            },
            {
                slug: 'which-rate-to-use',
                question: 'What interest rate should I enter?',
                answer: [
                    'Use the APR from a real quote or offer if you have one. Willow does not publish, suggest or offer any rate. Trying a few different rates shows how sensitive a payment is to small changes.',
                ],
            },
        ],
    },
    {
        slug: 'security',
        title: 'Security and privacy',
        icon: 'shield',
        summary: 'Two-step verification, recovery codes, sessions, privacy mode and your data.',
        articles: [
            {
                slug: 'two-step-verification',
                question: 'How do I set up two-step verification?',
                answer: [
                    'Go to Security and choose to turn on two-step verification. Add Willow to an authenticator app by scanning the setup code or entering the key, then enter the six-digit code the app shows to confirm.',
                    'From then on, signing in needs your password and a current code from the app. When setup finishes, save your backup recovery codes somewhere safe.',
                ],
                links: [{ label: 'Go to Security', href: '/security' }],
            },
            {
                slug: 'recovery-codes',
                question: 'How do recovery codes work?',
                answer: [
                    'Recovery codes are one-time backup codes that help you get back into your profile if you cannot use your authenticator app or need to reset your password. Each code works once.',
                    'Store them somewhere secure, such as a password manager or a printed copy kept safely at home. If you think they have been exposed, generate a new set, which replaces the old one.',
                ],
                links: [{ label: 'Go to Settings', href: '/settings' }],
            },
            {
                slug: 'sign-out-other-sessions',
                question: 'How do I sign out of other devices?',
                answer: [
                    'Security lists the sessions and devices currently signed in to your profile. Sign out any session you do not recognize, or sign out of all other sessions at once.',
                    'Sign-in history shows recent sign-in activity, so you can spot anything unusual.',
                ],
                links: [{ label: 'Go to Security', href: '/security' }],
            },
            {
                slug: 'privacy-mode',
                question: 'What is privacy mode?',
                answer: [
                    'Privacy mode hides balances and amounts on screen, which is useful in a public place or when you are sharing your screen. It changes only what is displayed, not your data, and you can turn it off at any time.',
                ],
                links: [{ label: 'Go to Settings', href: '/settings' }],
            },
            {
                slug: 'download-your-data',
                question: 'How do I download a copy of my data?',
                answer: [
                    'From Settings, choose to download your data. You receive a JSON file with your profile and demo records, such as accounts and transactions.',
                    'Keep the file private, because it contains details of your Willow demo profile.',
                ],
                links: [
                    { label: 'Go to Settings', href: '/settings' },
                    { label: 'Privacy notice', href: '/privacy' },
                ],
            },
            {
                slug: 'how-passwords-are-stored',
                question: 'How is my password stored?',
                answer: [
                    'Passwords are hashed with bcrypt before they are stored, so Willow never keeps your password in readable form. Use a unique password you do not use anywhere else, and turn on two-step verification for extra protection.',
                    'Willow is a demo and does not claim any independent security certification.',
                ],
            },
            {
                slug: 'something-looks-wrong',
                question: 'What should I do if something looks wrong?',
                answer: [
                    'Freeze any affected card, change your password, sign out of other sessions and review your sign-in history. Turning on two-step verification adds a further layer of protection.',
                    'Willow has no staffed support team, so these self-service steps are the fastest way to secure your demo profile. You can still leave a note through the contact form, which is stored as a demo request.',
                ],
                links: [
                    { label: 'Go to Security', href: '/security' },
                    { label: 'Contact form', href: '/contact' },
                ],
            },
        ],
    },
    {
        slug: 'business',
        title: 'Business',
        icon: 'briefcase',
        summary: 'Business checking, invoices, the business dashboard, expenses and team invitations.',
        articles: [
            {
                slug: 'open-business-banking',
                question: 'How do I open business banking?',
                answer: [
                    'Choose business banking when you register, or open a business checking account from Accounts if you already have a profile. Business checking is single owner and can be held in any supported currency.',
                    'Willow does not verify businesses. Any business details you enter are used only to label your demo experience.',
                ],
                links: [{ label: 'Open an account', href: '/accounts/new' }],
            },
            {
                slug: 'invite-team-members',
                question: 'Can I add team members?',
                answer: [
                    'You can send team invitations from Team, but they are simulated. Invitees receive no access to the business account, its cards or its dashboard.',
                    'The feature shows how team management could work in a live product. The business account remains single owner.',
                ],
                links: [{ label: 'Go to Team', href: '/business/team' }],
            },
            {
                slug: 'create-an-invoice',
                question: 'How do I create and track an invoice?',
                answer: [
                    'In Invoices, create a new invoice with the customer and amount, and save it. The invoice is listed as unpaid and appears in upcoming payments on the business dashboard until you mark it paid.',
                ],
                links: [{ label: 'Go to Invoices', href: '/business/invoices' }],
            },
            {
                slug: 'mark-invoice-paid',
                question: 'What happens when I mark an invoice as paid?',
                answer: [
                    'Willow records a simulated payment into the business account you choose and changes the invoice status to paid. The payment counts toward revenue on your dashboard.',
                    "No real payment is collected from your customer, and no money leaves anyone else's account.",
                ],
                links: [{ label: 'Go to Invoices', href: '/business/invoices' }],
            },
            {
                slug: 'dashboard-figures',
                question: 'How are revenue and expenses calculated?',
                answer: [
                    'Revenue is the total of completed credits to your business accounts, and expenses are completed debits. Cash flow is the difference between the two. Upcoming payments combine scheduled transfers and unpaid invoices.',
                    'These are simple cash figures drawn from simulated activity, not accounting statements.',
                ],
                links: [{ label: 'Business dashboard', href: '/business/dashboard' }],
            },
            {
                slug: 'pay-international-suppliers',
                question: 'Can I pay international suppliers?',
                answer: [
                    'You can send payments in the same currency to other Willow demo customers, wherever they are based. Willow does not connect to SWIFT, SEPA or any external bank, so suppliers outside Willow cannot be paid.',
                ],
                links: [{ label: 'Go to International', href: '/international' }],
            },
        ],
    },
];

module.exports = { categories };
