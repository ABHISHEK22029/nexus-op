#!/usr/bin/env node
/* ═════════════════════════════════════════════════
   shared/quoteTerms: the terms read off a vendor quotation, and the material
   a quoted line is linked to. Pure functions — no server, no database.
     node scripts/test-quote-terms.js
   ═════════════════════════════════════════════════ */
const { readTerms, readHeader, matchMaterial } = require('../shared/quoteTerms');
const { num, parseGrid } = require('../shared/quoteParser');

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };
const eq = (got, want, m) => ok(JSON.stringify(got) === JSON.stringify(want), `${m} → ${JSON.stringify(got)}`);

console.log('\n  ── delivery');
eq(readTerms('Delivery: 7 days from PO').lead_time_days, 7, '"Delivery: 7 days"');
eq(readTerms('Lead time 2-3 weeks').lead_time_days, 21, '"2-3 weeks" is the later end');
eq(readTerms('Dispatch within 10 working days').lead_time_days, 10, '"within 10 working days"');
eq(readTerms('Delivery,5 days').lead_time_days, 5, 'a spreadsheet row "Delivery,5 days"');
eq(readTerms('Delivery: Ex-stock').lead_time_days, 0, '"ex-stock" is today');
eq(readTerms('Quantity 160 kg, rate 260').lead_time_days, null, 'nothing said, nothing guessed');

console.log('\n  ── payment');
eq(readTerms('Payment terms: 30 days credit.').payment_terms, '30 days credit', 'as written');
eq(readTerms('Payment - 50% advance, balance before dispatch').payment_terms, '50% advance, balance before dispatch', 'a split, kept whole');
eq(readTerms('Bill payable 45 days from invoice').payment_terms, '45 days credit', '"45 days from invoice" reads as credit');
eq(readTerms('Terms: 100% advance').payment_terms, '100% advance', '"100% advance"');
eq(readTerms('SS304 sheet 2 mm 160 kg').payment_terms, null, 'nothing said, nothing guessed');

console.log('\n  ── freight');
eq(readTerms('Freight: Extra at actuals').freight, 'Extra', '"Freight: Extra"');
eq(readTerms('Freight charges included').freight, 'Included', '"included"');
eq(readTerms('Transportation: to pay').freight, 'Extra', '"to pay" is yours to pay');
eq(readTerms('Prices F.O.R. destination').freight, 'Included', 'F.O.R. destination is delivered');
eq(readTerms('Prices ex-works Hyderabad').freight, 'Extra', 'ex-works leaves the freight to you');
eq(readTerms('Rate per kg 260').freight, null, 'nothing said, nothing guessed');

console.log('\n  ── which material a line is');
const mats = [
  { id: 1, name: 'SS304 sheet 2 mm' }, { id: 2, name: 'SS304 sheet 6 mm' },
  { id: 3, name: 'MS angle 75x75x6' }, { id: 4, name: 'MS flat 50x6' },
];
eq(matchMaterial('SS304 Sheet 2mm', mats), 1, 'the same words, spaced differently');
eq(matchMaterial('Stainless steel sheet SS304, 2 mm thk', mats), 1, 'reworded, same size');
eq(matchMaterial('SS304 sheet 6 mm', mats), 2, 'the 6 mm line is the 6 mm sheet, never the 2 mm one');
eq(matchMaterial('MS Angle 75 × 75 × 6', mats), 3, '× is x');
eq(matchMaterial('SS304 sheet', mats), null, 'no size: two sheets fit, so neither is picked');
eq(matchMaterial('Hex bolt M16 x 65', mats), null, 'a line that is none of them stays unlinked');

/* 26 Nov: an uploaded quotation came back "Not named" with no number,
   though both are at the top of every one. Shaped like the two real ones
   that showed it (a Maks Ops print, and an Excel-made template); the
   names and numbers here are made up. */
console.log('\n  ── who sent it, its number and date');
const printed = 'Sample Fab Works Private Limited\n6-148/1, Bowrampet, Hyderabad 500043\nGSTIN: 36ABCDE1234F1Z9 · State Code: 36\nQUOTATION\nNo.: FY26-27/003.01\nDate: 05 Oct 2026\nValid until: 10 Oct 2026\nQUOTATION FOR\nBuyer Power Private Limited\nGSTIN: 36AAACB1234C1Z5';
const h1 = readHeader(printed);
eq(h1.vendor_name, 'Sample Fab Works Private Limited', 'the letterhead names the vendor');
eq(h1.quote_ref, 'FY26-27/003.01', 'a bare "No.:" at the top is the quote number');
eq(h1.quote_date, '2026-10-05', '"Date: 05 Oct 2026"');
eq(h1.vendor_gstin, '36ABCDE1234F1Z9', 'the letterhead GSTIN, not the buyer\'s printed later');
const sheet = readHeader('Sample Fab Works Pvt Ltd \tQuotation\nGST: 36ABCDE1234F1Z9\nQuote No: FY26-27/003.01\nDate: \t05/10/2026\nValidity: \t10/10/2026');
eq([sheet.vendor_name, sheet.quote_ref, sheet.quote_date], ['Sample Fab Works Pvt Ltd', 'FY26-27/003.01', '2026-10-05'], 'the template: name before a tab, "Quote No:", day-first date');
eq(readHeader('ABC Steels Pvt Ltd\nQuotation No. QT/24-25/118 Date: 12-03-2025').quote_date, '2025-03-12', 'a date in the middle of a line');
eq(readHeader('Deccan Metals\nValid until: 20/03/2026\nDate : Mar 9, 2026').quote_date, '2026-03-09', 'never the "valid until" date');
eq(readHeader('X Industries\nValidity Date: 01/04/2026').quote_date, null, 'a validity date alone is not the quote date');
eq(readHeader('QUOTATION\nSri Balaji Traders\nRef No: SBT-221').vendor_name, 'Sri Balaji Traders', 'a heading above the name is skipped');
eq(readHeader('Price list\nItem 1 200').quote_ref, null, 'nothing printed, nothing guessed');

console.log('\n  ── figures in an Excel-made PDF');
eq(num('( 4,910.00 ) ('), 4910, 'stray template brackets around a price are noise');
eq(num('662,850.00 )'), 662850, 'and so is an unpaired one');
eq(num('(1,234)'), -1234, 'a figure wrapped in brackets is still a negative');
const g = parseGrid([
  ['Description', 'HSN Code', 'Unit', 'Quantity', 'Unit Price(Rs)', 'Total Price(Rs)'],
  ['Stand for SCB', '7308', 'SET', '135', '( 4,910.00 ) (', '662,850.00 )'],
  ['( - ) Thank you for', '', 'your business! Basic', '', '(', '662,850.00 )'],
  ['', '', 'GST', '', '(', '119,313.00 )'],
  ['', '', 'Total Value', '', '', '782,163.00'],
], { base: 'medium' });
eq(g.lines.map(l => [l.description, l.hsn, l.quantity, l.rate, l.amount]), [['Stand for SCB', '7308', 135, 4910, 662850]], 'the one item is read — the "Basic" row is not a second one');
eq([g.totals.subtotal, g.totals.tax, g.totals.grand], [662850, 119313, 782163], '"Basic" is the sub-total, then GST and the total value');

console.log(`\n   ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
