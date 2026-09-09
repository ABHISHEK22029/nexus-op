#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   Every document lays its line items out the same way: Unit, Qty, Rate,
   Total.

   That is the order a real purchase order is written in. From the one
   Kirashi works against:

       S.NO | DESCRIPTION | UOM | QTY | Unit Price Rs. | Total Amount Rs.

   It is not decoration. Someone reading a delivery note against an invoice
   against the customer's own PO is comparing three pieces of paper column
   by column, and a screen that puts quantity before the unit makes them
   stop and re-read. Seven of fifteen screens disagreed with the other
   eight, which is how the request came in.

   The rule, in order:
     · Unit comes before Qty        — you name what you are counting first
     · Qty comes before the rate    — the two numbers that multiply are adjacent
     · the rate comes before the total

   A screen may legitimately omit a column: an RFQ has no total because the
   price is what vendors reply with, and a delivery challan carries a value
   rather than a rate. Omission is allowed; being out of order is not.
   ══════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src', 'pages');

/* Screens that render a document's line items. A new one has to be added
   here — the alternative is scanning every page for anything resembling a
   table, which finds dashboards and knowledge-base articles. */
const SCREENS = [
  'CustomerOrders.jsx', 'PurchaseOrders.jsx', 'POInvoice.jsx',
  'Quotations.jsx', 'SalesQuotations.jsx', 'SalesQuotationDoc.jsx',
  'SalesInvoiceBuilder.jsx', 'SalesInvoiceDoc.jsx',
  'DeliveryChallans.jsx', 'DeliveryChallanDoc.jsx',
  'CreditDebitNotes.jsx', 'CreditDebitNoteDoc.jsx',
  'GrnBillBuilder.jsx', 'GrnBillDoc.jsx', 'RABillInvoice.jsx',
];

const norm = s => s.replace(/[₹()*]/g, '').replace(/\s+/g, ' ').trim();
const UNIT = /^(uom|unit|units)$/i;
const QTY = /^(qty|quantity)$/i;
const RATE = /^(rate|unit rate|unit price|price)$/i;
const TOTAL = /^(amount|total|value)$/i;

const problems = [];
const checked = [];

for (const file of SCREENS) {
  const full = path.join(SRC, file);
  if (!fs.existsSync(full)) { problems.push({ file, why: 'screen not found — renamed or deleted?' }); continue; }
  const src = fs.readFileSync(full, 'utf8');

  /* Column headings appear as <th> in printed documents and <label> in the
     entry forms. Source order is the visual order in both. */
  const cols = [];
  for (const m of src.matchAll(/<th[^>]*>([^<]{1,26})<\/th>|<label[^>]*>([^<]{1,26})<\/label>/g)) {
    const t = norm(m[1] || m[2] || '');
    if (UNIT.test(t) || QTY.test(t) || RATE.test(t) || TOTAL.test(t)) cols.push(t);
  }
  if (!cols.length) { problems.push({ file, why: 'no line-item columns found' }); continue; }

  const at = re => cols.findIndex(c => re.test(c));
  const u = at(UNIT), q = at(QTY), r = at(RATE), t = at(TOTAL);

  const faults = [];
  if (u < 0) faults.push('no Unit column');
  if (q < 0) faults.push('no Qty column');
  if (u >= 0 && q >= 0 && u > q) faults.push('Qty comes before Unit');
  if (q >= 0 && r >= 0 && q > r) faults.push('rate comes before Qty');
  if (r >= 0 && t >= 0 && r > t) faults.push('total comes before the rate');
  if (r < 0 && q >= 0 && t >= 0 && q > t) faults.push('total comes before Qty');

  checked.push({ file, cols: cols.join(' → ') });
  if (faults.length) problems.push({ file, why: faults.join('; '), cols: cols.join(' → ') });
}

if (problems.length) {
  console.error(`\n❌ ${problems.length} screen(s) lay their line items out differently:\n`);
  for (const p of problems) {
    console.error(`   ${p.file}`);
    console.error(`      ${p.why}`);
    if (p.cols) console.error(`      currently: ${p.cols}`);
  }
  console.error(`\n   Expected order: Unit → Qty → Rate → Total.`);
  console.error(`   A column may be absent; the ones present must be in this order.\n`);
  process.exit(1);
}

console.log(`✅ line-item columns: all ${checked.length} document screens read Unit → Qty → Rate → Total`);
