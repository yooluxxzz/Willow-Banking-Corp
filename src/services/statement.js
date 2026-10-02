/**
 * Statement service — account statements with PDF generation
 */
const PDFDocument = require('pdfkit');
const { getDb } = require('../database');
const { formatCurrency, fromCents } = require('../middleware/validation');

function getStatement(accountId, userId, { dateFrom, dateTo }) {
    if (!Number.isSafeInteger(accountId) || accountId <= 0) return { error: 'Choose a valid account.' };
    const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
    if (!validDate(dateFrom) || !validDate(dateTo) || dateFrom > dateTo) return { error: 'Choose valid dates with the start on or before the end.' };
    if ((Date.parse(dateTo) - Date.parse(dateFrom)) / 86400000 > 365) return { error: 'Choose a period of no more than 366 days.' };
    const db = getDb();

    const account = db.prepare(`
    SELECT a.*, u.full_name, u.email, u.customer_id
    FROM accounts a JOIN users u ON a.user_id = u.id
    WHERE a.id = ? AND a.user_id = ?
  `).get(accountId, userId);

    if (!account) return { error: 'Account not found.' };

    // Reconstruct the opening balance from the current posted balance, retaining
    // any initial demo balance that predates the recorded transaction history.
    const movementSinceStart = db.prepare(`SELECT COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount ELSE -amount END), 0) AS total
        FROM transactions WHERE account_id = ? AND status = 'completed' AND created_at >= ?`).get(accountId, dateFrom).total;
    const openingBalance = account.balance - movementSinceStart;

    // Transactions in period
    const transactions = db.prepare(`
    SELECT t.*, ra.account_number as related_account_number
    FROM transactions t
    LEFT JOIN accounts ra ON t.related_account_id = ra.id
    WHERE t.account_id = ? AND t.status = 'completed' AND t.created_at >= ? AND t.created_at <= ?
    ORDER BY t.created_at ASC, t.id ASC LIMIT 5001
  `).all(accountId, dateFrom, dateTo + ' 23:59:59');

    if (transactions.length > 5000) return { error: 'Too many transactions. Choose a shorter statement period.' };

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
            ...require('./account').formatAccount(account),
            displayName: account.nickname || (account.purpose === 'business' ? 'Business checking' : account.account_type === 'savings' ? 'Savings account' : 'Checking account'),
            maskedNumber: '••••' + account.account_number.slice(-4),
        },
        period: { from: dateFrom, to: dateTo },
        totalCreditsFormatted: formatCurrency(transactions.filter(t => t.direction === 'credit').reduce((sum,t) => sum + t.amount, 0)),
        totalDebitsFormatted: formatCurrency(transactions.filter(t => t.direction === 'debit').reduce((sum,t) => sum + t.amount, 0)),
        openingBalance,
        openingBalanceFormatted: formatCurrency(openingBalance),
        closingBalance,
        closingBalanceFormatted: formatCurrency(closingBalance),
        transactions: formattedTxns,
    };
}

function generateStatementPDF(statementData) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true, info: { Title: 'Willow demo account statement', Author: 'Willow Banking Corp.' } });
        const chunks = [];
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        const green = '#18342E', ink = '#20342F';
        const { account, period } = statementData;
        const header = () => {
            doc.rect(0, 0, doc.page.width, 78).fill(green);
            doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(20).text('Willow Banking Corp.', 50, 22);
            doc.font('Helvetica').fontSize(9).text('DEMO ACCOUNT STATEMENT - SIMULATED FUNDS', 50, 51);
            doc.fillColor(ink);
        };
        const columns = [{name:'Date',x:55,width:62}, {name:'Reference',x:121,width:100}, {name:'Description',x:225,width:145}, {name:'Amount',x:374,width:77,align:'right'}, {name:'Balance',x:455,width:85,align:'right'}];
        const tableHeader = y => {
            doc.rect(50, y, 495, 22).fill(green);
            doc.font('Helvetica-Bold').fontSize(8).fillColor('#FFFFFF');
            for (const col of columns) doc.text(col.name, col.x, y + 7, { width: col.width, align: col.align || 'left', lineBreak: false });
            doc.font('Helvetica').fillColor(ink);
            return y + 28;
        };
        header();
        doc.font('Helvetica').fontSize(10).text(`Account holder: ${account.full_name}`, 50, 100, {width: 495});
        doc.text(`Account: ${account.displayName} (${account.maskedNumber})`, {width:495});
        doc.text(`Period: ${period.from} to ${period.to} (UTC)`, {width:495});
        doc.moveDown(0.8);
        doc.font('Helvetica-Bold').text(`Opening balance: ${statementData.openingBalanceFormatted}    Closing balance: ${statementData.closingBalanceFormatted}`);
        doc.font('Helvetica').text(`Money in: ${statementData.totalCreditsFormatted}    Money out: ${statementData.totalDebitsFormatted}`);
        doc.fontSize(8).text('Completed transactions only. Pending and failed entries are excluded.');
        let y = tableHeader(doc.y + 18);
        for (const [index, txn] of statementData.transactions.entries()) {
            const values = [txn.created_at.slice(0,10), txn.reference, txn.description || txn.type, (txn.direction === 'credit' ? '+' : '-') + txn.amountFormatted, txn.runningBalanceFormatted];
            doc.font('Helvetica').fontSize(8);
            const height = Math.max(22, ...values.map((value,i) => doc.heightOfString(String(value), {width:columns[i].width}) + 12));
            if (y + height > 744) { doc.addPage(); header(); y = tableHeader(98); }
            if (index % 2 === 0) doc.rect(50, y - 4, 495, height).fill('#F0F4F0');
            doc.fillColor(ink);
            values.forEach((value,i) => doc.text(String(value), columns[i].x, y, {width: columns[i].width, align:columns[i].align || 'left'}));
            y += height;
        }
        if (!statementData.transactions.length) doc.fontSize(10).fillColor(ink).text('No completed transactions in this period.', 55, y);
        const range = doc.bufferedPageRange();
        for (let page = 0; page < range.count; page++) {
            doc.switchToPage(page);
            doc.font('Helvetica').fontSize(8).fillColor('#62736A').text('Fictional demo. Not proof of funds or a real bank statement.', 50, 765, {width:495, align:'center'});
            doc.text(`Page ${page + 1} of ${range.count}`, 50, 780, {width:495, align:'center'});
        }
        doc.end();
    });
}

module.exports = { getStatement, generateStatementPDF };
