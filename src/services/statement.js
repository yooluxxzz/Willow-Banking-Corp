/**
 * Statement service — account statements with PDF generation
 */
const PDFDocument = require('pdfkit');
const { getDb } = require('../database');
const { formatCurrency, fromCents } = require('../middleware/validation');

function getStatement(accountId, userId, { dateFrom, dateTo }) {
    const db = getDb();

    const account = db.prepare(`
    SELECT a.*, u.full_name, u.email, u.customer_id
    FROM accounts a JOIN users u ON a.user_id = u.id
    WHERE a.id = ? AND a.user_id = ?
  `).get(accountId, userId);

    if (!account) return { error: 'Account not found.' };

    // Opening balance: balance at start of period
    const debitsBeforePeriod = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total FROM transactions
    WHERE account_id = ? AND direction = 'debit' AND created_at < ?
  `).get(accountId, dateFrom).total;

    const creditsBeforePeriod = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total FROM transactions
    WHERE account_id = ? AND direction = 'credit' AND created_at < ?
  `).get(accountId, dateFrom).total;

    const openingBalance = creditsBeforePeriod - debitsBeforePeriod;

    // Transactions in period
    const transactions = db.prepare(`
    SELECT t.*, ra.account_number as related_account_number
    FROM transactions t
    LEFT JOIN accounts ra ON t.related_account_id = ra.id
    WHERE t.account_id = ? AND t.created_at >= ? AND t.created_at <= ?
    ORDER BY t.created_at ASC
  `).all(accountId, dateFrom, dateTo + ' 23:59:59');

    // Calculate running totals
    let runningBalance = openingBalance;
    const formattedTxns = transactions.map(t => {
        if (t.direction === 'credit') {
            runningBalance += t.amount;
        } else {
            runningBalance -= t.amount;
        }
        return {
            ...t,
            amountFormatted: formatCurrency(t.amount),
            amountDollars: fromCents(t.amount),
            runningBalance,
            runningBalanceFormatted: formatCurrency(runningBalance),
        };
    });

    const closingBalance = runningBalance;

    return {
        account: {
            ...account,
            maskedNumber: '••••' + account.account_number.slice(-4),
        },
        period: { from: dateFrom, to: dateTo },
        openingBalance,
        openingBalanceFormatted: formatCurrency(openingBalance),
        closingBalance,
        closingBalanceFormatted: formatCurrency(closingBalance),
        transactions: formattedTxns,
    };
}

function generateStatementPDF(statementData) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const chunks = [];

        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const green = '#1B4332';
        const darkGreen = '#2D6A4F';
        const charcoal = '#1A1A2E';
        const lightGray = '#F5F5F5';

        // Header
        doc.rect(0, 0, 595.28, 80).fill(green);
        doc.fontSize(22).fillColor('#FFFFFF').text('Willow Banking Corp.', 50, 25);
        doc.fontSize(10).fillColor('#D4D4D4').text('Account Statement', 50, 52);

        doc.moveDown(3);

        // Account info
        const { account, period } = statementData;
        doc.fillColor(charcoal);
        doc.fontSize(11).text(`Account Holder: ${account.full_name}`, 50);
        doc.text(`Account: ${account.maskedNumber} (${account.account_type})`);
        doc.text(`Customer ID: ${account.customer_id}`);
        doc.text(`Statement Period: ${period.from} to ${period.to}`);
        doc.moveDown();

        // Summary
        doc.fontSize(10).fillColor(darkGreen);
        doc.text(`Opening Balance: ${statementData.openingBalanceFormatted}`);
        doc.text(`Closing Balance: ${statementData.closingBalanceFormatted}`);
        doc.moveDown();

        // Table header
        const tableTop = doc.y;
        doc.rect(50, tableTop, 495, 20).fill(green);
        doc.fillColor('#FFFFFF').fontSize(8);
        doc.text('Date', 55, tableTop + 5, { width: 80 });
        doc.text('Reference', 135, tableTop + 5, { width: 80 });
        doc.text('Description', 215, tableTop + 5, { width: 170 });
        doc.text('Amount', 385, tableTop + 5, { width: 70, align: 'right' });
        doc.text('Balance', 455, tableTop + 5, { width: 85, align: 'right' });

        let y = tableTop + 25;
        doc.fillColor(charcoal).fontSize(8);

        statementData.transactions.forEach((txn, i) => {
            if (y > 750) {
                doc.addPage();
                y = 50;
            }

            if (i % 2 === 0) {
                doc.rect(50, y - 3, 495, 16).fill(lightGray);
                doc.fillColor(charcoal);
            }

            const dateStr = txn.created_at.split('T')[0] || txn.created_at.slice(0, 10);
            const sign = txn.direction === 'debit' ? '-' : '+';

            doc.text(dateStr, 55, y, { width: 80 });
            doc.text(txn.reference.slice(0, 14), 135, y, { width: 80 });
            doc.text((txn.description || txn.type).slice(0, 30), 215, y, { width: 170 });
            doc.text(`${sign}${txn.amountFormatted}`, 385, y, { width: 70, align: 'right' });
            doc.text(txn.runningBalanceFormatted, 455, y, { width: 85, align: 'right' });

            y += 16;
        });

        if (statementData.transactions.length === 0) {
            doc.text('No transactions in this period.', 55, y);
        }

        // Footer
        doc.moveDown(3);
        doc.fontSize(7).fillColor('#888888');
        doc.text('This is a demo statement from Willow Banking Corp. — a fictional banking system.', 50, 780, { align: 'center' });

        doc.end();
    });
}

module.exports = { getStatement, generateStatementPDF };
