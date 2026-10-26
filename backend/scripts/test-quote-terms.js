#!/usr/bin/env node
/* ═════════════════════════════════════════════════
   shared/quoteTerms: the terms read off a vendor quotation, and the material
   a quoted line is linked to. Pure functions — no server, no database.
     node scripts/test-quote-terms.js
   ═════════════════════════════════════════════════ */
const { readTerms, matchMaterial } = require('../shared/quoteTerms');

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

console.log(`\n   ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
