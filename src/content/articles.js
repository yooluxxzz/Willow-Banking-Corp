'use strict';

/*
 * Editorial content: education guides (served at /learn/:slug) and
 * insights (served at /insights/:slug).
 *
 * Content is general financial education, not advice. It must not cite
 * specific market numbers, studies or statistics, or name real people.
 * Willow is mentioned only where it helps, and always as a demo.
 */

const articles = [
    // ----------------------------------------------------------------- Guides
    {
        slug: 'stocks-etfs-and-funds',
        kind: 'guide',
        category: 'Investing',
        title: "Stocks, ETFs and funds: what's the difference",
        dek: 'Three of the most common ways to invest, explained in plain terms: what you actually own, how each one is priced and traded, and the trade-offs between them.',
        readingMinutes: 4,
        level: 'Beginner',
        icon: 'layers',
        sections: [
            {
                heading: 'What a stock represents',
                paragraphs: [
                    'A stock, or share, is a small piece of ownership in a company. If a company has issued a million shares and you own one, you own one millionth of it. As a shareholder you may receive part of the profits through dividends, if the company pays them, and you can often vote on certain company decisions.',
                    'The price of a stock is set by buyers and sellers on an exchange. It moves throughout the trading day as expectations about the company, its industry and the wider economy change. Over long periods a share price tends to reflect how the business performs, but in the short term it can move sharply for reasons that have little to do with the company itself.',
                    'Owning a single stock concentrates your money in one business. If that company does well, your holding can grow substantially. If it struggles, your holding can lose much or all of its value.',
                ],
            },
            {
                heading: 'What a fund does',
                paragraphs: [
                    'A fund pools money from many investors and invests it according to a stated objective. Instead of buying shares in one company, you buy a portion of the whole pool. A single purchase can give you exposure to dozens, hundreds or even thousands of underlying investments.',
                    "Funds are run by a manager who follows a mandate. Active funds rely on the manager's decisions to try to outperform a benchmark. Index funds aim to match a benchmark by holding the same securities in similar proportions, which usually means fewer decisions and lower ongoing costs.",
                    'Traditional mutual funds are bought and sold through the fund company rather than on an exchange. Orders placed during the day are usually filled at a single price, the net asset value, calculated after the market closes.',
                ],
            },
            {
                heading: 'How ETFs fit in',
                paragraphs: [
                    'An exchange-traded fund, or ETF, is a fund that trades on an exchange like a stock. You can buy or sell it at any point during the trading day, at the market price at that moment. Many ETFs track an index, though some follow a sector, a theme or an actively managed strategy.',
                    'Because they combine the diversification of a fund with the flexibility of a stock, ETFs have become a common building block in many portfolios. They are not automatically simple, though. Some use borrowed money or complex strategies that can behave very differently from the index they reference, especially over longer periods.',
                ],
            },
            {
                heading: 'Comparing the three',
                paragraphs: [
                    'No option is better in every situation. Each makes different trade-offs between concentration, cost and control, and the main differences come down to four things.',
                ],
                list: [
                    'Diversification: a single stock is concentrated, while a fund or ETF spreads money across many holdings.',
                    'Pricing: stocks and ETFs trade continuously during market hours; mutual funds are typically priced once a day.',
                    'Costs: funds and ETFs charge an ongoing fee, expressed as an expense ratio; a stock has no ongoing fee once bought.',
                    'Control: owning stocks directly means choosing each company yourself; a fund delegates those choices to its manager or its index.',
                ],
            },
            {
                heading: 'Questions worth asking before you invest',
                paragraphs: [
                    'Whichever you choose, remember that diversification can reduce the damage from any one company performing badly, but it does not remove market risk. When markets fall broadly, diversified funds fall too.',
                    'A few questions help clarify what you are actually buying. What does it hold, and how concentrated is it? What does it cost each year? How easily can you sell it? And how would you feel if its value dropped significantly in a short time?',
                    'It also helps to think about time. Money you may need in the next year or two is usually poorly suited to investments that can fall sharply, while money set aside for many years has more time to recover from downturns.',
                    'In the Willow demo, you can explore a curated list of stocks, ETFs and funds with delayed market data and practice with simulated orders using cash you move in from your own accounts. It is a low-pressure way to see how each type behaves, with no real money at stake. This guide is general information, not financial advice.',
                ],
            },
        ],
        keyTakeaways: [
            'A stock is ownership in one company; a fund pools money across many investments.',
            'ETFs trade like stocks during the day, while mutual funds usually price once after the close.',
            'Diversification reduces single-company risk but does not protect against broad market falls.',
        ],
        related: ['how-compound-growth-works', 'reading-a-volatile-market-day'],
    },
    {
        slug: 'how-compound-growth-works',
        kind: 'guide',
        category: 'Saving',
        title: 'How compound growth works',
        dek: 'Compound growth is what happens when returns begin to earn returns of their own. Here is how it works, why time matters so much and where it can work against you.',
        readingMinutes: 4,
        level: 'Beginner',
        icon: 'trend',
        sections: [
            {
                heading: 'Growth on top of growth',
                paragraphs: [
                    'Simple growth applies a return only to the amount you started with. Compound growth applies it to the starting amount plus everything it has already earned. Each period the base gets a little larger, so the same rate produces a slightly bigger increase than it did before.',
                    'An illustration helps. Imagine an amount growing at a steady 5 percent a year. In the first year it grows by 5 percent of the original. In the second year it grows by 5 percent of that larger figure. The difference is small at first, but because it keeps building on itself, the gap between simple and compound growth widens every year.',
                    'The rates in this guide are purely illustrative. Real returns vary from year to year, and investments can fall in value as well as rise.',
                ],
            },
            {
                heading: 'Why time does most of the work',
                paragraphs: [
                    'Because each period builds on the last, compounding is slow at the start and faster later on. The early years can feel unrewarding, with balances barely moving. The later years are where most of the visible growth tends to appear.',
                    'This is why starting earlier often matters more than starting bigger. Someone who sets aside a modest amount for many years can end up with more than someone who sets aside larger amounts for a shorter period, simply because their money had longer to compound.',
                    'Time also gives you room for setbacks. A plan that starts early can absorb a missed contribution or a weak year more easily than one that starts late and depends on everything going right.',
                    'A useful shortcut is the rule of 72. Divide 72 by an annual growth rate to estimate roughly how many years it takes for an amount to double. At 6 percent that is about 12 years; at 3 percent, about 24. It is an approximation, but it makes the combined effect of rate and time easy to picture.',
                ],
            },
            {
                heading: 'Frequency, contributions and reinvestment',
                paragraphs: [
                    'Three things shape how strongly compounding works in practice: how often growth is added, whether you keep adding money and whether earnings stay invested.',
                    'Frequency is also why the annual percentage yield, or APY, on a savings product can be slightly higher than its stated interest rate. APY reflects the effect of compounding within the year, which makes it a fairer basis for comparing accounts.',
                ],
                list: [
                    'Compounding frequency: interest added monthly compounds slightly faster than interest added once a year at the same stated rate.',
                    'Regular contributions: adding money on a schedule gives each new deposit its own time to grow.',
                    'Reinvestment: interest or dividends that are reinvested keep compounding, while amounts withdrawn stop.',
                ],
            },
            {
                heading: 'When compounding works against you',
                paragraphs: [
                    'Compounding is neutral. It applies just as powerfully to debt as it does to savings. Interest on an unpaid credit card balance is added to what you owe, and the next month interest is charged on that larger amount. Left alone, a balance can grow faster than many people expect.',
                    'Costs compound too. An annual fee on an investment reduces the amount left to grow, every year. A difference that looks small in a single year can add up to a meaningful sum over decades.',
                    'Inflation is the third force. If prices rise faster than your money grows, its purchasing power shrinks, even while the balance itself is going up.',
                    'The practical lesson is that the same patience that helps savings grow can let debts and costs grow quietly in the background. Checking the rates on what you owe, and the fees on what you hold, is one of the simplest ways to put compounding back on your side.',
                ],
            },
            {
                heading: 'Putting it to work',
                paragraphs: [
                    'Understanding compounding points toward a few practical habits: start as early as you reasonably can, contribute regularly, keep an eye on costs and pay down high-interest debt promptly. None of these require predicting markets.',
                    'It also helps to keep expectations realistic. Compounding rewards patience, but it does not smooth out the path. Investments that compound over long periods usually do so unevenly, with good years, flat years and losing years along the way.',
                    'In the Willow demo, savings accounts do not earn interest, but you can use goals to track progress toward a target and the Borrow calculators to see how interest builds on a loan or card balance. This guide is general information, not financial advice.',
                ],
            },
        ],
        keyTakeaways: [
            'Compounding means returns start earning returns, so growth accelerates over time.',
            'Time is often the most powerful input, which is why starting early can matter more than starting big.',
            'The same effect applies to debt and fees, so high-interest balances and costs deserve attention.',
        ],
        related: ['building-an-emergency-fund', 'automating-your-savings'],
    },
    {
        slug: 'understanding-crypto-risk',
        kind: 'guide',
        category: 'Crypto',
        title: 'Understanding crypto risk before you invest',
        dek: 'Cryptoassets can move faster and further than most other investments. Before putting money in, it helps to understand where the risks come from and how they differ from a bank account.',
        readingMinutes: 4,
        level: 'Beginner',
        icon: 'bitcoin',
        sections: [
            {
                heading: 'What you are actually buying',
                paragraphs: [
                    'A cryptoasset is a digital token recorded on a blockchain, a shared ledger maintained by a network of computers. Some, such as Bitcoin, were designed primarily as a form of digital money. Others, such as Ethereum or Solana, power networks on which applications can run.',
                    'Unlike a share in a company, most cryptoassets do not represent a claim on profits or assets. Their price depends largely on what other people are willing to pay, which in turn depends on adoption, sentiment and expectations about the future. That makes them difficult to value with the tools used for stocks or bonds.',
                    'Some cryptoassets, known as stablecoins, aim to hold a steady value by tracking a currency such as the US dollar. They are designed to reduce volatility, but they carry risks of their own, including whether the reserves behind them are sufficient and how those reserves are managed.',
                ],
            },
            {
                heading: 'Volatility is the norm, not the exception',
                paragraphs: [
                    'Crypto prices can rise or fall by large amounts in a single day, and long, deep declines have happened several times in the history of the market. Trading never stops, so prices can move sharply overnight or at weekends, when you are not watching.',
                    'Volatility cuts both ways. The same movements that create the possibility of large gains can also lead to large and rapid losses. It is sensible to assume that any amount put into crypto could fall significantly in value, and that it might not recover on any timeline you would choose.',
                    'Crypto markets can also be thinner than they appear. During periods of stress, prices on different platforms can diverge, and selling quickly may mean accepting a noticeably lower price than the one last displayed.',
                ],
            },
            {
                heading: 'Risks beyond the price',
                paragraphs: [
                    'Price movement is only one part of the picture. Holding real crypto involves several other risks that are less visible but just as important.',
                    'None of them shows up on a price chart, which is why they are easy to underestimate until something goes wrong. The main ones are these.',
                ],
                list: [
                    'Custody: if you lose the private key or recovery phrase to a wallet you control, the assets are usually unrecoverable.',
                    'Fraud: scams promising guaranteed returns, fake support agents and impersonation are common.',
                    'Platform failure: exchanges and lenders can fail, and customers may lose access to their holdings.',
                    'Protection: crypto held on a platform is generally not covered by deposit insurance in the way bank deposits can be.',
                    'Rules: regulation varies widely between countries and continues to change.',
                    'Irreversibility: a transaction sent to the wrong address usually cannot be reversed.',
                ],
            },
            {
                heading: 'Questions to ask yourself first',
                paragraphs: [
                    'Before buying any cryptoasset, it helps to be honest about a few things. Could you afford to lose this money entirely without it affecting your essential plans? Do you understand what the asset is for and why it might hold value? Do you know how and where it would be stored, and who could access it?',
                    'Many people who choose to hold crypto keep it to a small share of their overall finances, so that a severe fall would be painful but not damaging. Your own situation, timeline and tolerance for risk should guide any decision, and a qualified adviser can help you think it through.',
                    'It is also worth thinking about how you would react to a large fall. If a sharp drop would push you to sell in a panic, or keep you checking prices late into the night, that is useful information about how much exposure feels manageable.',
                ],
            },
            {
                heading: 'Practicing without real exposure',
                paragraphs: [
                    'In the Willow demo, you can follow six major cryptoassets with market data and price charts, place simulated trades with your investing cash and send units to other Willow profiles. There is no blockchain, no keys and no real money involved, which makes it a safe place to see how volatility feels before making any real decisions.',
                    'Pay attention to how simulated gains and losses make you feel, not just to the numbers. That reaction is often the most useful thing a practice portfolio can teach.',
                    'This guide is general information, not financial advice.',
                ],
            },
        ],
        keyTakeaways: [
            'Most cryptoassets have no underlying cash flows, so prices rest heavily on sentiment and adoption.',
            'Sharp, round-the-clock price swings are normal, and large losses can happen quickly.',
            'Custody, fraud and platform failure are risks in their own right, separate from price.',
        ],
        related: ['stocks-etfs-and-funds', 'reading-a-volatile-market-day'],
    },
    {
        slug: 'how-loan-payments-are-calculated',
        kind: 'guide',
        category: 'Borrowing',
        title: 'APR, terms and how loan payments are calculated',
        dek: 'A fixed monthly loan payment hides a steady shift from interest to principal. Understanding APR, term and amortization makes it easier to compare offers and see the true cost.',
        readingMinutes: 4,
        level: 'Intermediate',
        icon: 'calculator',
        sections: [
            {
                heading: 'Interest rate versus APR',
                paragraphs: [
                    'The interest rate is the cost of borrowing the principal, expressed as a yearly percentage. The annual percentage rate, or APR, is broader. It combines the interest rate with certain fees and charges required to take out the loan, spread over the term and expressed as a yearly rate.',
                    'Because APR captures more of the cost, it is generally the better figure for comparing loans of the same amount and term. Two offers with the same interest rate can have different APRs if one carries higher upfront fees. The exact fees included depend on local rules, so it is worth checking what a lender has counted.',
                    'APR is most useful for comparing like with like. It is less helpful for comparing a short loan with a long one, or a fixed rate with a variable one, because the total cost also depends on how long you borrow and how rates move.',
                ],
            },
            {
                heading: 'How a fixed payment is worked out',
                paragraphs: [
                    'Most personal loans and many mortgages are amortizing loans. You repay them in equal monthly payments that cover both interest and principal, so the balance reaches zero at the end of the term.',
                    "The payment is calculated from three inputs: the amount borrowed, the monthly interest rate (the annual rate divided by twelve) and the number of monthly payments. In words, the formula finds the single fixed payment that, month after month, pays each month's interest and leaves exactly nothing owed after the final payment.",
                    'Each month, interest is charged on the outstanding balance. The payment covers that interest first, and whatever is left reduces the principal. The next month, interest is charged on a slightly smaller balance, so a little more of the same payment goes toward principal.',
                    'Because the payment never changes, the loan feels the same from month to month. What changes underneath is the mix, which is why two borrowers with identical payments can owe very different amounts if one is near the start of the term and the other near the end.',
                ],
            },
            {
                heading: 'Why early payments are mostly interest',
                paragraphs: [
                    'At the start of a loan the balance is at its highest, so the interest portion of each payment is at its largest. As the balance falls, the interest portion shrinks and the principal portion grows. An amortization schedule, which lists every payment with its interest and principal split, shows this shift clearly.',
                    'This has practical consequences. If you sell a home or repay a loan early, you may find you have repaid less principal than expected, because the early years were weighted toward interest. Conversely, extra payments made early in a loan, where the lender allows them, reduce the balance on which all future interest is charged.',
                    'Some loans charge a fee for repaying early, so it is worth checking the terms before making extra payments.',
                ],
            },
            {
                heading: 'The trade-off in the term',
                paragraphs: [
                    'Choosing a term is a balance between monthly affordability and total cost. The general pattern looks like this.',
                ],
                list: [
                    'A longer term lowers the monthly payment, because the principal is spread over more months.',
                    'A longer term usually increases total interest, because the balance stays higher for longer.',
                    'A shorter term raises the monthly payment but typically reduces the total paid over the life of the loan.',
                    'Lenders may price different terms at different rates, so compare each option on its own APR.',
                ],
            },
            {
                heading: 'Using a calculator well',
                paragraphs: [
                    'A useful exercise is to calculate the payment and total interest for two or three terms side by side. Seeing the monthly saving next to the extra interest it costs makes the trade-off concrete, and helps you find the shortest term whose payment still sits comfortably in your budget.',
                    "A payment calculator is a helpful starting point, but it simplifies. Real offers depend on your credit history, income and the lender's own criteria. Arrangement fees, late or early repayment charges, insurance products and variable rates can all change the true cost.",
                    'In the Willow demo, the personal loan, mortgage and business loan calculators use this standard amortization approach to estimate payments and total interest, and the credit card payoff calculator applies the same month-by-month logic of interest on the outstanding balance. Willow offers no loans and suggests no rates, so use figures from real quotes where you have them. This guide is general information, not financial advice.',
                ],
            },
        ],
        keyTakeaways: [
            'APR includes certain fees as well as interest, making it the better figure for comparing offers.',
            'Fixed payments shift from mostly interest to mostly principal as the balance falls.',
            'Longer terms lower monthly payments but usually raise the total interest paid.',
        ],
        related: ['mortgage-basics', 'how-compound-growth-works'],
    },
    {
        slug: 'mortgage-basics',
        kind: 'guide',
        category: 'Borrowing',
        title: 'Mortgage basics: down payment, term and rate',
        dek: 'A mortgage is one of the largest financial commitments many people make. Here is how the down payment, term and rate work together, and what else belongs in a housing budget.',
        readingMinutes: 4,
        level: 'Beginner',
        icon: 'house',
        sections: [
            {
                heading: 'What a mortgage is',
                paragraphs: [
                    'A mortgage is a loan used to buy property, secured against that property. If the borrower cannot keep up repayments, the lender may ultimately be able to take possession of the home to recover what is owed. That security is one reason mortgage rates are usually lower than rates on unsecured personal loans, and also why missed payments carry such serious consequences.',
                    'Most mortgages are repaid in monthly installments over a long term. Each payment covers interest and part of the principal, following the same amortization pattern as other installment loans.',
                    'Because a mortgage usually runs for many years, details in the terms, such as how the rate is set and what happens if you want to repay early, can matter as much as the headline payment.',
                ],
            },
            {
                heading: 'The down payment',
                paragraphs: [
                    'The down payment is the share of the purchase price you pay upfront. The rest is borrowed. A larger down payment means a smaller loan, lower monthly payments and less interest overall. It can also improve the terms a lender is willing to offer.',
                    "Lenders often describe this with the loan-to-value ratio, which compares the loan amount with the property's value. A lower ratio represents less risk to the lender. In some markets, borrowing a high share of the property's value requires mortgage insurance, which adds to the monthly cost and typically protects the lender rather than the borrower.",
                    'Saving a down payment takes time. Keeping it in a separate savings account, away from everyday spending, can make progress easier to see and harder to spend by accident.',
                ],
            },
            {
                heading: 'The term',
                paragraphs: [
                    'The term is how long you have to repay the loan. Long terms are common, though typical lengths vary by country and lender. A longer term lowers the monthly payment but means paying interest for longer, so the total cost is usually higher. A shorter term costs more each month but builds ownership faster and usually reduces total interest.',
                    'The term also interacts with how long you expect to stay in the home. If you are likely to move within a few years, the total interest over a full term matters less than the payments, fees and equity built up during the years you actually hold the loan.',
                ],
            },
            {
                heading: 'The rate',
                paragraphs: [
                    'Mortgage rates come in a few broad forms, and the right one depends on how much certainty you want and how long you expect to keep the loan.',
                ],
                list: [
                    'Fixed rate: the rate stays the same for the whole term or an agreed period, so payments are predictable.',
                    'Variable or adjustable rate: the rate can change with a benchmark, so payments can rise or fall.',
                    'Introductory or hybrid rate: a fixed period followed by a variable rate, which needs careful planning for the change.',
                ],
            },
            {
                heading: 'Comparing offers',
                paragraphs: [
                    'Even a small difference in rate can make a large difference to total interest over a long term, which is why comparing APRs from several lenders is worthwhile.',
                    'When comparing rates, look at what is attached to them. A lower rate that requires paying points or arrangement fees upfront may or may not work out cheaper, depending on how long you keep the loan.',
                ],
            },
            {
                heading: 'Beyond principal and interest',
                paragraphs: [
                    'The loan payment is only part of the cost of owning a home. Property taxes and homeowners insurance are often collected alongside the mortgage payment. Maintenance, utilities, association fees where relevant, and one-off closing costs all deserve a place in the budget.',
                    'A careful approach is to work out what payment feels comfortable alongside your other commitments, rather than starting from the largest amount a lender might offer. Leaving room for an emergency fund matters too, since homes come with unexpected costs.',
                    'Before speaking to a lender, it can help to gather a few figures: what you have saved for the down payment and closing costs, your regular income and commitments, and a realistic monthly housing budget. These make any offer you receive easier to understand.',
                    'The Willow mortgage calculator brings home price, down payment, rate and term together with optional property tax and insurance, so you can see an estimated monthly figure. Results are illustrative, and Willow offers no mortgages. This guide is general information, not financial advice.',
                ],
            },
        ],
        keyTakeaways: [
            'A larger down payment reduces the loan, the monthly payment and the total interest paid.',
            'Longer terms lower each payment but usually increase the total cost of the loan.',
            'Budget for property tax, insurance, maintenance and closing costs, not just the loan payment.',
        ],
        related: ['how-loan-payments-are-calculated', 'building-an-emergency-fund'],
    },
    {
        slug: 'building-an-emergency-fund',
        kind: 'guide',
        category: 'Saving',
        title: 'Building an emergency fund',
        dek: 'An emergency fund turns a sudden expense from a crisis into an inconvenience. Here is how to decide how much to keep, where to keep it and how to build it steadily.',
        readingMinutes: 4,
        level: 'Beginner',
        icon: 'savings',
        sections: [
            {
                heading: 'What an emergency fund is for',
                paragraphs: [
                    'An emergency fund is money set aside for genuine surprises: a job loss, an urgent repair, a medical bill or an unexpected trip. Its purpose is not to grow quickly but to be there when you need it, so you do not have to rely on high-interest borrowing or sell investments at a bad moment.',
                    'Having that cushion changes how financial shocks feel. A broken water heater or a gap between jobs is still unwelcome, but it no longer has to spiral into debt.',
                    'It also buys time to think. When an unexpected bill can be paid from savings, decisions about what comes next can be made calmly rather than under pressure.',
                ],
            },
            {
                heading: 'How much is enough',
                paragraphs: [
                    'A widely used guideline is to hold three to six months of essential expenses. Essential means what you genuinely need to cover, such as housing, utilities, food, transport, insurance and minimum debt payments, rather than your full current spending.',
                    'The right figure depends on your circumstances. People with variable income, a single household income, dependents or less job security may want more. Those with very stable income and other safety nets may be comfortable with less. If the full target feels distant, a first milestone of one month of essentials, or even a smaller fixed amount, is a meaningful start.',
                    'To find your number, look back at a few months of spending and separate the essentials from everything else. Multiply the monthly essentials by the number of months you want to cover, and you have a target to work toward. It does not need to be precise to be useful.',
                ],
            },
            {
                heading: 'Where to keep it',
                paragraphs: [
                    'An emergency fund is usually not the place to chase higher returns. Its job is to be reliable on the day you need it. Interest earned on real savings is a welcome bonus and can help offset inflation, but access and stability come first.',
                    'In practice, that points to a few qualities worth looking for, ideally in an account kept separate from everyday spending so the money is not used by accident.',
                ],
                list: [
                    'Accessible: you should be able to reach the money within a day or two, without penalties.',
                    'Stable: avoid investments whose value could fall just when you need the money.',
                    'Separate: a dedicated savings account makes it less tempting to dip into for non-emergencies.',
                    'Protected: for real savings, check whether deposits are covered by a deposit insurance scheme where you live.',
                ],
            },
            {
                heading: 'Building it steadily',
                paragraphs: [
                    'Most emergency funds are built gradually. Choosing a fixed amount to move into savings each time you are paid, and treating it like any other bill, turns good intentions into a routine. Automating that transfer removes the need to decide each month.',
                    'Windfalls can speed things up. Tax refunds, bonuses or gifts can go straight to the fund until it reaches its target. Once it does, those regular contributions can be redirected toward other goals.',
                    'Progress matters more than speed. Seeing the balance rise, even slowly, is motivating, and tracking it against a clear target helps the habit stick. If a month is tight, a smaller contribution keeps the routine alive without adding pressure.',
                ],
            },
            {
                heading: 'Using it, and refilling it',
                paragraphs: [
                    'When a genuine emergency happens, use the fund without guilt. That is what it is for. Afterward, return to your regular contributions until it is back at the target level.',
                    'It helps to decide in advance what counts as an emergency. Planned costs, such as vacations, annual subscriptions or a new phone, are better handled with their own savings goals so the emergency fund stays intact.',
                    'It is also worth revisiting the target from time to time. A new home, a change in income or a growing family can all change what several months of essentials actually means.',
                    'In the Willow demo, you can open a separate savings account and create an emergency fund goal to track progress toward a target you choose. Goal progress is self-reported and balances are simulated, but the habit of keeping safety money visibly apart is the same. This guide is general information, not financial advice.',
                ],
            },
        ],
        keyTakeaways: [
            'Aim to cover several months of essential expenses, starting with a smaller first milestone.',
            'Keep the fund accessible, stable and separate from everyday spending.',
            'Regular automatic contributions build the fund steadily; refill it after you use it.',
        ],
        related: ['automating-your-savings', 'how-compound-growth-works'],
    },

    // --------------------------------------------------------------- Insights
    {
        slug: 'cash-flow-over-budget',
        kind: 'insight',
        category: 'Business',
        title: 'Why cash flow matters more than a budget for small businesses',
        dek: 'A budget describes what a business intends to happen. Cash flow describes what is happening. For small businesses, the gap between the two is where trouble often starts.',
        readingMinutes: 4,
        level: null,
        icon: 'briefcase',
        sections: [
            {
                heading: 'Profitable on paper, short of cash',
                paragraphs: [
                    'Many small business owners know the feeling of a good month on paper and a struggle to pay the bills. Sales have been made and invoices sent, but the money has not arrived. Meanwhile, rent, payroll and suppliers are due on fixed dates.',
                    'This is the difference between profit and cash. Profit measures whether income exceeds costs over a period. Cash flow measures whether money actually arrives before it needs to leave. A business can be profitable and still run out of cash if the timing goes wrong.',
                    'The pressure is sharpest for businesses that deliver work before they are paid, such as consultancies, trades and wholesalers. In effect, they are lending to their customers for the length of their payment terms, whether or not they think of it that way.',
                ],
            },
            {
                heading: 'What a budget can and cannot tell you',
                paragraphs: [
                    'A budget is a plan. It sets out expected revenue and planned spending for a month, a quarter or a year, and it is valuable for setting priorities and noticing when costs drift.',
                    'But a budget is usually built on totals, not timing. It may show that annual revenue covers annual costs comfortably while hiding the fact that most income arrives in the second half of the year and most expenses fall in the first. It also cannot account for the customer who pays late, or the supplier who suddenly asks for payment upfront.',
                    'A budget is also only as current as the day it was written. As the year unfolds, real figures drift away from the plan, and the most important differences are often in when money moved rather than how much.',
                ],
            },
            {
                heading: 'Why timing matters so much',
                paragraphs: [
                    'For a small business with limited reserves, timing differences can matter more than the totals.',
                    'The usual causes are ordinary, and none of them signals a failing business. Together, though, they explain why healthy businesses can still find themselves short at exactly the wrong moment.',
                ],
                list: [
                    'Payment terms: invoices paid weeks after work is delivered leave a gap the business has to fund.',
                    'Seasonality: revenue that clusters in certain months needs reserves to carry the quieter ones.',
                    'Growth: winning more work often means paying for materials and time before the customer pays you.',
                    'Lumpy costs: annual insurance, tax payments or equipment purchases can drain cash in a single month.',
                    'Tax timing: amounts collected or owed may fall due in a single payment, long after the sales that created them.',
                ],
            },
            {
                heading: 'Habits that keep cash visible',
                paragraphs: [
                    'The most useful habit is simply looking at cash regularly: what came in, what went out and what is due next. A short weekly review often catches problems that a monthly budget meeting would miss.',
                    'It also helps to keep a running view of commitments. Scheduled payments and unpaid invoices together describe the next few weeks more honestly than a bank balance alone. Following up on overdue invoices promptly, agreeing clear payment terms and keeping a reserve for quieter months all improve resilience without changing the underlying business.',
                    'A simple forecast helps too. Listing expected receipts and payments week by week for the next couple of months, then updating it as things change, turns cash flow from something you react to into something you can see coming.',
                    'Separating business and personal money makes all of this easier. When every business transaction runs through business accounts, the picture of cash in and cash out becomes far clearer.',
                ],
            },
            {
                heading: 'Using both, in the right order',
                paragraphs: [
                    'None of this means abandoning the budget. A budget sets direction; cash flow keeps the business standing while it gets there. The two work best together, with cash flow reviewed more often.',
                    'When a shortfall does appear on the horizon, early sight of it widens the options. There is time to chase payments, talk to suppliers, delay a discretionary purchase or arrange financing on considered terms, rather than in a hurry.',
                    'In the Willow demo, the business dashboard shows revenue from completed credits, expenses from completed debits, net cash flow and upcoming payments made up of scheduled transfers and unpaid invoices. The figures come from simulated activity, but the view reflects the questions worth asking of any real business account.',
                ],
            },
        ],
        keyTakeaways: [
            'Profit and cash are different: a profitable business can still run short if money arrives late.',
            'Budgets plan totals; cash flow reveals timing, which is where small businesses feel pressure.',
            'A regular review of cash in, cash out and upcoming commitments catches problems early.',
        ],
        related: ['your-whole-financial-picture', 'automating-your-savings'],
    },
    {
        slug: 'automating-your-savings',
        kind: 'insight',
        category: 'Saving',
        title: 'The quiet power of automating your savings',
        dek: 'Saving is rarely limited by knowledge. It is limited by the number of decisions it takes. Automation removes most of them, which is why it can be such an effective habit.',
        readingMinutes: 4,
        level: null,
        icon: 'repeat',
        sections: [
            {
                heading: 'The problem is deciding, not knowing',
                paragraphs: [
                    'Most people already know that saving regularly is a good idea. The difficulty is that every transfer to savings is a small decision, made at a moment when there are usually more pressing things competing for the same money. Each one is easy to postpone.',
                    'Timing works against you as well. By the end of the month, after bills and everyday spending, the amount left to save is often smaller than planned, or gone entirely. Saving last means saving whatever survives.',
                    'Over time, those postponed decisions add up. Months pass with good intentions and little progress, not because of a lack of discipline, but because the system relies on remembering and choosing every single time.',
                ],
            },
            {
                heading: 'Paying yourself first',
                paragraphs: [
                    'Automation reverses the order. Instead of saving whatever is left at the end of the month, a set amount moves to savings shortly after income arrives, before everyday spending begins. What remains is what is available to spend.',
                    'This approach, often called paying yourself first, makes saving the default rather than the exception. It does not require a large amount. A modest, consistent transfer often achieves more over a year than occasional larger ones, because it actually happens.',
                    'It also changes how spending feels. When savings have already been set aside, the money left in a checking account can be spent with more confidence, because the important part has been handled.',
                ],
            },
            {
                heading: 'Why defaults are so powerful',
                paragraphs: [
                    'People tend to stay with whatever is already set up. That tendency can work against good intentions, but automation turns it into an advantage. Once a regular transfer exists, keeping it running takes no effort, while stopping it takes a deliberate choice.',
                    'The same idea shows up across personal finance: the choices that need no ongoing effort are the ones most likely to last.',
                    'Automation also takes some of the emotion out of the process. Saving no longer depends on how a particular week has gone, or on how the balance happens to look on a given day. The decision is made once, calmly, and then carried forward.',
                ],
            },
            {
                heading: 'Setting it up well',
                paragraphs: [
                    'A few practical choices make automated saving easier to sustain. None of them needs to be perfect at the start; the value comes from the habit existing at all, and it can be refined as you learn what works.',
                ],
                list: [
                    'Time it with income, so the transfer happens soon after money arrives.',
                    'Start smaller than you think you can, then increase the amount when it feels easy.',
                    'Send savings to a separate account, so they are not mixed with spending money.',
                    'Give each pot a purpose, such as an emergency fund, a home or a trip.',
                    'Review the amount a few times a year, especially when income or costs change.',
                ],
            },
            {
                heading: 'A tool, not a substitute for attention',
                paragraphs: [
                    'Automated transfers still need occasional review. A transfer that leaves an account short before a bill is due can cause more trouble than it solves. Checking that the amount still fits your situation keeps the habit helpful rather than stressful.',
                    'Automation works best with predictable amounts. If income varies from month to month, a smaller automated base, topped up by hand in stronger months, can keep the habit steady without risking an overdraft.',
                    'Over time, it is worth revisiting both the amount and the destination. As an emergency fund reaches its target, the same transfer can be pointed at a new goal, so the habit keeps working even as priorities change.',
                    'Savings with a named purpose, whether a safety net or a specific plan, are easier to protect than a general balance that could be used for anything. And raising the amount when income rises, even slightly, is one of the easiest ways to make progress without feeling a difference day to day.',
                    'In the Willow demo, you can schedule a one-time transfer between your own accounts for a future date and track savings goals alongside your balances. Recurring transfers are not available in the demo, and all balances are simulated, but the principle is the same: decide once, then let the system carry the decision forward.',
                ],
            },
        ],
        keyTakeaways: [
            'Saving often stalls because each transfer is a fresh decision that is easy to postpone.',
            'Moving money to savings soon after income arrives makes saving the default, not the exception.',
            'Start small, keep savings separate and review the amount when circumstances change.',
        ],
        related: ['building-an-emergency-fund', 'how-compound-growth-works'],
    },
    {
        slug: 'reading-a-volatile-market-day',
        kind: 'insight',
        category: 'Investing',
        title: 'Reading a volatile market day without overreacting',
        dek: 'Sharp market moves make headlines and invite quick decisions. A calmer reading starts with perspective: what moved, why it might have moved and whether it changes your plan.',
        readingMinutes: 4,
        level: null,
        icon: 'chart',
        sections: [
            {
                heading: 'Volatility is part of investing',
                paragraphs: [
                    'Markets move every day, and some days they move a lot. Prices reflect the combined expectations of a vast number of participants, and those expectations shift with economic data, company results, interest rate news, geopolitics and sometimes nothing more than a change in mood.',
                    'Large daily moves can feel alarming, especially when they are described in dramatic terms. But volatility is not a malfunction. It is the uncertainty investors accept in exchange for the possibility of higher long-term returns than cash, with no guarantee that those returns arrive.',
                    'Volatility also tends to come in clusters. Calm periods can last a long time, and turbulent ones can arrive suddenly and persist for weeks. Neither state lasts forever, which is easy to forget while you are in the middle of one.',
                    'News coverage adds to the effect. A large move is newsworthy; a steady month is not. That imbalance can make markets feel more chaotic than a longer view suggests.',
                ],
            },
            {
                heading: 'Look at the size, not the headline',
                paragraphs: [
                    'A headline saying that an index lost a large number of points tells you very little on its own. Percentage moves are more meaningful than point moves, and a single day is more meaningful when compared with how far the market has risen or fallen over months or years.',
                    'It helps to remember what a broad index represents: the combined value of many companies. A sharp move in the index means expectations have shifted, not that all of those businesses changed overnight.',
                    'Switching a chart from one day to a longer range is a simple way to regain perspective. A move that looks like a cliff on an intraday chart can look like a small dip on a five-year view. The reverse is also true, so the point is context rather than reassurance.',
                ],
            },
            {
                heading: 'Ask what actually changed',
                paragraphs: [
                    'Before acting, it can help to separate the noise from anything that genuinely affects your plans.',
                ],
                list: [
                    'Is this move about one company, one sector or the whole market?',
                    'Has anything changed about why you hold this investment?',
                    'Has your time horizon or your need for the money changed?',
                    'Would you make the same decision if the market were closed for a week?',
                ],
            },
            {
                heading: 'The cost of reacting quickly',
                paragraphs: [
                    'If the honest answer to each of those questions is no, the most reasonable response is often to do nothing at all.',
                    'Selling after a sharp fall turns a paper loss into a real one that might otherwise have been temporary. Buying in a rush after a sharp rise can mean paying a high price on enthusiasm. Strong and weak days often arrive close together, so stepping out and back in risks missing the recovery as well as the fall.',
                    'None of this means markets always recover on any particular timeline, or that every investment will. It means that decisions made in the heat of a single day are rarely better than decisions made with a plan.',
                    'Frequent checking can make this harder. Watching prices minute by minute magnifies every move and makes doing nothing feel like negligence. For long-term money, looking less often is sometimes the more disciplined choice.',
                ],
            },
            {
                heading: 'Building a plan before the next one',
                paragraphs: [
                    'The best time to decide how to respond to volatility is before it happens. Knowing why you hold each investment, how long you intend to hold it and how much of your money is exposed to market risk makes a turbulent day easier to read calmly.',
                    'Some investors write down why they hold each investment and what circumstances would lead them to sell. Reading that note on a difficult day is a simple way to separate a considered decision from a reaction.',
                    'Diversification and a sensible cash buffer also help. When money you might need soon is not tied up in volatile assets, a falling market becomes something to observe rather than something to escape.',
                    'In the Willow demo, you can follow a simulated portfolio through real market movements using delayed data, with no money at stake. It is a useful place to notice your own reactions. This is general information, not financial advice.',
                ],
            },
        ],
        keyTakeaways: [
            'Volatility is a normal feature of markets, not a sign that something is broken.',
            'Percentages and longer time ranges give far better context than a single headline.',
            'Deciding how to respond before a turbulent day makes calm decisions easier.',
        ],
        related: ['stocks-etfs-and-funds', 'understanding-crypto-risk'],
    },
    {
        slug: 'indicative-exchange-rates',
        kind: 'insight',
        category: 'International',
        title: 'What an indicative exchange rate does and does not tell you',
        dek: 'The exchange rate quoted online is rarely the rate you receive. Understanding what an indicative rate represents helps you judge the real cost of moving money between currencies.',
        readingMinutes: 4,
        level: null,
        icon: 'globe',
        sections: [
            {
                heading: 'A reference point, not a price',
                paragraphs: [
                    'An indicative exchange rate is a reference figure for how one currency compares with another at a point in time. It is typically drawn from wholesale markets, where banks and large institutions trade currencies with each other in very large amounts.',
                    'Indicative rates are useful for orientation. They tell you roughly what a currency is worth and how it has moved. What they do not do is promise that you can exchange money at that rate. They are not a quote, and they are not an offer.',
                    'Different sources may show slightly different indicative rates for the same currency pair at the same moment, depending on where the data comes from and how often it is updated. Small differences between sources are normal.',
                ],
            },
            {
                heading: 'The mid-market rate',
                paragraphs: [
                    'Many indicative rates are close to the mid-market rate: the midpoint between the price at which the market is willing to buy a currency and the price at which it is willing to sell. It is a fair summary of where the market sits, but it is not a rate most individuals or small businesses can trade at directly.',
                    'Retail providers usually exchange money at a rate that differs from the mid-market rate, and they may also charge explicit fees. The difference between the rate you receive and the mid-market rate is effectively part of the cost, even when it is not labeled as a fee.',
                ],
            },
            {
                heading: 'Why the rate you get differs',
                paragraphs: [
                    'Several factors explain the gap between an indicative rate and the rate offered for a real transfer.',
                    "Some are within a provider's control and some are not, but all of them affect how much actually arrives at the other end. The main ones are these.",
                ],
                list: [
                    'Spread: providers build a margin into the rate they offer.',
                    'Fees: some providers charge a fixed or percentage fee on top of the rate.',
                    'Timing: rates move continuously, and a quote is only valid for a short window.',
                    'Liquidity: less widely traded currency pairs can carry wider spreads.',
                    'Delay: an indicative rate may be minutes or hours old by the time you see it.',
                ],
            },
            {
                heading: 'Comparing the real cost',
                paragraphs: [
                    'The most reliable way to compare currency providers is to ask a simple question: for this amount, exactly how much will arrive at the other end? Comparing the final amount received, after the rate and all fees, cuts through differences in how costs are presented.',
                    'It is also worth looking at the rate itself, not just the fee. A provider advertising no fees may still offer a less favorable rate, which can cost more than a transparent fee elsewhere. For currencies that are less widely traded, comparing a few options is particularly worthwhile, since the gap between indicative and real rates can be wider.',
                    'Card payments abroad deserve a mention too. When paying in a foreign currency, you may be offered the option of paying in your home currency instead. This conversion, often called dynamic currency conversion, can come with a less favorable rate, so it is worth understanding before you accept it.',
                ],
            },
            {
                heading: 'Timing a conversion',
                paragraphs: [
                    'It is tempting to wait for a better rate before converting. Exchange rates are difficult to predict, even for professionals, and waiting can just as easily lead to a worse rate as a better one.',
                    'For amounts with a deadline, such as tuition or a property purchase, certainty about the final figure can matter more than the chance of a slightly better rate. Some providers offer ways to fix a rate in advance for a future transfer, which reduces that uncertainty, usually at a cost.',
                ],
            },
            {
                heading: 'How Willow uses indicative rates',
                paragraphs: [
                    'In the Willow demo, exchange rates for USD, EUR, GBP, MZN and ZAR are retrieved from a market-data provider and shown as indicative. They may be delayed or temporarily unavailable. The conversion estimator and simulated conversions between your own currency accounts use that rate with no fees modeled, which makes the numbers easy to follow but more generous than a real transfer is likely to be.',
                    'Treat the estimator as a way to understand rough values, and expect real-world costs to be somewhat higher.',
                    'No real foreign exchange takes place in the demo. This is general information, not financial advice.',
                ],
            },
        ],
        keyTakeaways: [
            'An indicative rate is a reference point drawn from wholesale markets, not a price you can trade at.',
            'Spreads, fees, timing and delays explain why real rates differ from indicative ones.',
            'Compare providers on the final amount received, after the rate and every fee.',
        ],
        related: ['your-whole-financial-picture', 'everyday-security-habits'],
    },
    {
        slug: 'your-whole-financial-picture',
        kind: 'insight',
        category: 'Everyday money',
        title: 'Seeing your whole financial picture in one place',
        dek: 'Accounts, investments and goals often live in separate places, and decisions get made with only part of the picture. Bringing them together changes the questions you can answer.',
        readingMinutes: 4,
        level: null,
        icon: 'hub',
        sections: [
            {
                heading: 'The cost of a fragmented view',
                paragraphs: [
                    'For many people, money is spread across several places: a checking account for daily spending, savings somewhere else, investments in another app and goals tracked in a spreadsheet, or not at all. Each part makes sense on its own. Together, they are hard to see.',
                    'When the picture is fragmented, decisions tend to be made locally. A balance looks healthy in one account while another is running low. Investments feel like a separate world from the emergency fund. Questions that matter, such as whether your overall position is improving, become surprisingly difficult to answer.',
                    'Fragmentation also hides overlaps and gaps. Two savings pots may be doing the same job, while a goal that matters has nothing set aside for it at all. Without a single view, these are easy to miss for a long time.',
                ],
            },
            {
                heading: 'Net worth as a starting point',
                paragraphs: [
                    'Net worth is the simplest summary: what you own minus what you owe. It is not a measure of success, and it can move for reasons outside your control, such as market prices. But tracked over time, it shows direction, and direction is often more useful than any single figure.',
                    'Seeing net worth broken into its parts adds context. Knowing how much sits in cash, how much is invested and how much is owed tells you more than a total ever could, and it shows where a change actually came from.',
                    'Including debts matters as much as including assets. A picture that shows savings and investments but leaves out a loan or a card balance can look healthier than it really is.',
                    'For most people, the most useful comparison is with their own past, not with anyone else. A net worth that is slowly rising, or a debt that is steadily shrinking, is a sign that everyday decisions are adding up in the right direction.',
                ],
            },
            {
                heading: 'Following money as it moves',
                paragraphs: [
                    'A whole picture also shows flow, not just position. Looking at how money moves over a month answers a handful of practical questions.',
                ],
                list: [
                    'How much came in, and how much went out?',
                    'Which categories of spending are growing?',
                    'How much moved into savings and investments?',
                    'Are goals moving closer, or standing still?',
                ],
            },
            {
                heading: 'Information, not instruction',
                paragraphs: [
                    'Patterns become visible quickly once those questions have answers in one place, and they often prompt more useful conversations than a single balance does.',
                    'A monthly review does not need to be long. A short session looking at income, spending and progress toward goals is often enough to notice what is changing and decide whether anything needs attention.',
                    'A good overview informs decisions without making them for you. Spending categories, trends and summaries are most helpful when they prompt a question, such as why a category has grown, rather than when they try to tell you what to do. Your own circumstances, priorities and plans are what turn information into a decision.',
                    'It also matters where the information comes from. An overview is only as reliable as the data behind it, so it is worth knowing which accounts are included and how each figure is calculated.',
                    'Automated categories and summaries deserve a light touch of skepticism too. They are a useful starting point, but they rely on patterns in transaction descriptions and can misclassify spending. A quick sense-check keeps the overview honest.',
                ],
            },
            {
                heading: 'How Willow approaches it',
                paragraphs: [
                    'In Willow, the Net worth page brings your account balances, your investing and crypto, and the assets and debts you record together into a single figure. It shows money movement across income, expenses, savings and investments, groups spending into categories inferred from transaction descriptions and displays your goals alongside.',
                    'Ask Willow can answer questions such as how much you spent this month or which debt costs you most, using only your own records — in its own words with a local AI model through Ollama, or as quick answers calculated from your figures without one. It offers information rather than advice and does not make predictions or recommendations.',
                    'Because the picture is built only from what you record, it is a safe way to explore how these views work, and what questions they can answer, before you look at your real finances the same way.',
                ],
            },
        ],
        keyTakeaways: [
            'Money spread across separate places makes overall direction hard to see.',
            'Net worth, tracked over time and broken into parts, shows direction better than any single balance.',
            'The most useful overviews prompt good questions rather than telling you what to do.',
        ],
        related: ['cash-flow-over-budget', 'automating-your-savings'],
    },
    {
        slug: 'everyday-security-habits',
        kind: 'insight',
        category: 'Security',
        title: 'Everyday security habits that protect your money',
        dek: 'Many account compromises start with familiar weaknesses: reused passwords, convincing messages and unattended devices. A handful of steady habits closes off much of that risk.',
        readingMinutes: 4,
        level: null,
        icon: 'lock',
        sections: [
            {
                heading: 'Start with passwords',
                paragraphs: [
                    'A strong, unique password for every financial account is the foundation. Reused passwords are a common route into accounts, because a password leaked from one service can be tried on many others. A password manager makes unique passwords practical by remembering them for you.',
                    'Length matters more than complexity. A long passphrase made of several unrelated words is generally both stronger and easier to remember than a short string of symbols.',
                    'Your email account deserves particular care. It is often the key to resetting passwords elsewhere, so protecting it with a strong password and two-step verification protects many other accounts at the same time.',
                ],
            },
            {
                heading: 'Add a second step',
                paragraphs: [
                    'Two-step verification means that a password alone is not enough to sign in. An authenticator app generates a short code that changes every 30 seconds or so, and signing in requires both the password and the current code. Even if a password is exposed, someone without your device is stopped.',
                    "Authenticator apps are generally considered more secure than codes sent by text message, because they are not tied to a phone number that could be moved to someone else's SIM card.",
                    'Backup recovery codes are the safety net for this setup. Store them somewhere secure and separate from your phone, so you can still get in if the device is lost or replaced.',
                ],
            },
            {
                heading: 'Recognize the pressure tactics',
                paragraphs: [
                    'Scams often succeed not through technical skill but through urgency and trust. Messages that appear to come from a bank, a delivery company or a government agency may ask you to act immediately, confirm details or move money to keep it safe.',
                    'Scammers increasingly use convincing details, such as your name, the last digits of a card or a recent purchase, to seem legitimate. Knowing some details about you does not prove that a caller or sender is who they claim to be.',
                    'A genuine organization will not be harmed by you pausing to check, so taking a few minutes is almost always the safer choice. A few simple rules help.',
                ],
                list: [
                    'Be wary of any message that asks you to act urgently or keep something secret.',
                    'Never share one-time codes, passwords or recovery codes, including with someone claiming to be from your bank.',
                    'Check links before you open them, or go to the website directly instead.',
                    'If a call feels wrong, hang up and contact the organization using details you already trust.',
                ],
            },
            {
                heading: 'Watch your accounts and devices',
                paragraphs: [
                    'Regularly reviewing transactions and sign-in activity helps you notice problems early. Alerts for card use, transfers and new sign-ins mean that unusual activity reaches you quickly rather than at the end of the month.',
                    'Devices matter too. Keep operating systems and apps up to date, use a screen lock and sign out of shared or public computers. If a card goes missing, freezing it straight away buys time while you work out what happened.',
                    'Take care on public Wi-Fi as well. Where possible, use mobile data or a trusted network for banking, and avoid signing in on devices you do not control. Lock screen notifications are worth a look too, since codes or balances shown on a locked phone can be read by anyone nearby.',
                ],
            },
            {
                heading: 'If something does go wrong',
                paragraphs: [
                    'Act quickly but calmly. Freeze any affected cards, change your passwords starting with your email, sign out of other sessions and contact your provider through its official channels. Then review recent activity to understand what happened.',
                    'Reporting suspected fraud promptly usually gives the best chance of limiting the damage, and it helps your provider protect other customers too.',
                ],
            },
            {
                heading: 'Practicing these habits in Willow',
                paragraphs: [
                    'The Willow demo includes the tools these habits depend on. Passwords are hashed with bcrypt, two-step verification works with an authenticator app, and one-time recovery codes are available. You can review signed-in sessions and sign-in history, sign out other devices, freeze a demo card instantly, set alert preferences and use privacy mode to hide balances on screen.',
                    'Trying these tools in a demo, with no real money involved, is a low-stakes way to build the routine before you rely on it.',
                    'Willow is a demo and does not claim any independent security certification. The habits, though, apply to every real account you hold.',
                ],
            },
        ],
        keyTakeaways: [
            'Use a unique, long password for each financial account, ideally stored in a password manager.',
            'Turn on two-step verification and keep recovery codes somewhere safe and separate.',
            'Treat urgency and requests for codes as warning signs, and review activity regularly.',
        ],
        related: ['understanding-crypto-risk', 'your-whole-financial-picture'],
    },
];

module.exports = articles;
