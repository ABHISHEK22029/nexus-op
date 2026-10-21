#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   A vendor's quotation does not have to follow any template. The reader
   finds the item table by its headings, whatever their order and wording,
   and works out what a file leaves out — and says so when it cannot.

   No server and no database: the reader on its own, on file shapes vendors
   actually send.
     node scripts/test-quote-shapes.js
   ══════════════════════════════════════════════════════════════════════ */
const { parseQuotation } = require('../shared/quoteParser');

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };
const read = (csv) => parseQuotation(Buffer.from(csv), 'text/csv', 'quote.csv');
const lineOf = (r, re) => r.lines.find(l => re.test(l.description)) || {};
const two = (r) => {
  const ss = lineOf(r, /SS304/), ang = lineOf(r, /Angle/);
  return ss.quantity === 180 && ss.rate === 260 && ss.amount === 46800 && ang.quantity === 600 && ang.rate === 58.5 && ang.amount === 35100;
};

(async () => {
  console.log('\n  ── the columns may be in any order, under any usual name');
  let r = await read('Description,HSN,Qty,Unit,Rate,Amount\nSS304 Sheet 2mm,7219,180,kg,260,46800\nMS Angle 50x50x6,7216,600,kg,58.5,35100');
  ok(r.status === 'parsed' && two(r) && lineOf(r, /SS304/).hsn === '7219' && lineOf(r, /SS304/).uom === 'kg', 'the usual order: read in full');
  r = await read('Amount,Rate,Unit,Qty,HSN,Description\n46800,260,kg,180,7219,SS304 Sheet 2mm\n35100,58.5,kg,600,7216,MS Angle 50x50x6');
  ok(r.status === 'parsed' && two(r), 'the columns the other way round: the same reading');
  r = await read('Sl No,Particulars,UOM,Qnty,Basic Rate,Value\n1,SS304 Sheet 2mm,kg,180,260,46800\n2,MS Angle 50x50x6,kg,600,58.5,35100');
  ok(r.status === 'parsed' && two(r), '"Particulars", "Qnty", "Basic Rate", "Value", and a serial-number column: the same reading');

  console.log('\n  ── a column left out is worked out, and marked when it had to be');
  r = await read('Item,Quantity,Unit Price\nSS304 Sheet 2mm,180,260\nMS Angle 50x50x6,600,58.5');
  ok(r.status === 'parsed' && two(r), 'no amount column: quantity × rate');
  r = await read('Description,Qty,Unit,Amount\nSS304 Sheet 2mm,180,kg,46800\nMS Angle 50x50x6,600,kg,35100');
  ok(two(r) && r.lines.every(l => l.confidence === 'medium'), 'no rate column: amount ÷ quantity, marked for a check');
  r = await read('Material,Rate\nSS304 Sheet 2mm,260\nMS Angle 50x50x6,58.5');
  ok(r.status === 'partial' && lineOf(r, /SS304/).rate === 260 && lineOf(r, /SS304/).quantity == null,
    'no quantity (a price list): the rates are kept, the quantity left empty, and the file marked partial for review');

  console.log('\n  ── a real-shaped file');
  r = await read([
    'Deccan Metals Pvt Ltd,,,,', 'Quotation No DM/Q/118 dated 18-10-2026,,,,', ',,,,',
    'Description of Goods,HSN/SAC,Quantity,Rate,Amount',
    'SS304 Sheet 2mm,7219,180,260,55224', 'MS Angle 50x50x6,7216,600,58.5,41418',
    'Sub Total,,,,96642', 'Freight,,,,1500', 'Grand Total,,,,98142'].join('\n'));
  ok(two(r), 'letterhead rows above the table are skipped; amounts that include 18% GST are taken back to the pre-tax rate');
  ok(lineOf(r, /Freight/).amount === 1500, 'freight under the items is kept as a line, not lost');
  ok(r.status === 'parsed' && !r.note, `freight written below the sub-total does not raise "a row was probably missed" (${r.status}${r.note ? `: ${r.note}` : ''})`);
  r = await read('Description,Qty,Rate,Amount\nSS304 Sheet 2mm,180,260,46800\nMS Angle 50x50x6,600,58.5,35100\nSub Total,,,90000\nGrand Total,,,106200');
  ok(r.status === 'partial' && /probably missed/.test(r.note || ''), 'a sub-total the lines really do not reach is still flagged');

  console.log('\n  ── what cannot be read is said, not guessed');
  r = await read('Article,Count,Each\nSS304 Sheet 2mm,180,260');
  ok(r.status === 'failed' && r.lines.length === 0 && /No item table/.test(r.note || ''), `headings it does not know: nothing invented, and it says so (${r.note})`);
  r = await parseQuotation(Buffer.from('x'), 'application/vnd.ms-excel', 'quote.xls');
  ok(r.status === 'failed' && /Save As/.test(r.note || ''), 'the old .xls format: told to save it as .xlsx, CSV or PDF');

  console.log(`\n  ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
