#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   What does the reader make of these vendor quotations?

     node scripts/check-quote-files.js <folder> [--lines]

   Runs every .xlsx, .csv, .pdf and .docx in the folder through the same
   reader the upload uses, and prints what it read: how many item lines,
   their total, the totals the document states, and whether it would show
   "Read" or "Check it". With --lines, every line too.

   Nothing is uploaded and nothing touches the database — this is for
   trying real vendors' files before trusting the comparison with them.
   ══════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { parseQuotation } = require('../shared/quoteParser');

const dir = process.argv[2];
const showLines = process.argv.includes('--lines');
if (!dir || !fs.existsSync(dir)) {
  console.error('usage: node scripts/check-quote-files.js <folder> [--lines]');
  process.exit(1);
}

const inr = (n) => (n == null ? '—' : '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 }));
const SHOWN = { parsed: 'Read', reviewed: 'Checked', partial: 'Check it', failed: 'Not read' };

(async () => {
  const files = fs.readdirSync(dir).filter(f => /\.(xlsx|csv|pdf|docx|xls|doc)$/i.test(f)).sort();
  if (!files.length) { console.log('No .xlsx, .csv, .pdf or .docx files in', dir); return; }
  for (const f of files) {
    const r = await parseQuotation(fs.readFileSync(path.join(dir, f)), '', f);
    const sum = r.lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
    const t = r.totals || {};
    console.log(`\n${f}`);
    console.log(`  ${SHOWN[r.status] || r.status} · ${r.lines.length} item line${r.lines.length === 1 ? '' : 's'} · lines total ${inr(sum)}`
      + (t.subtotal != null ? ` · subtotal ${inr(t.subtotal)}` : '')
      + (t.tax != null ? ` · tax ${inr(t.tax)}` : '')
      + (t.discount != null ? ` · discount ${inr(t.discount)}` : '')
      + (t.grand != null ? ` · grand total ${inr(t.grand)}` : ''));
    if (r.note) console.log(`  note: ${r.note}`);
    if (showLines) {
      for (const l of r.lines) {
        console.log(`    · ${l.description}${l.hsn ? ` [${l.hsn}]` : ''} — ${l.quantity ?? '?'} ${l.uom || ''} × ${inr(l.rate)} = ${inr(l.amount)}${l.confidence === 'high' ? '' : `  (${l.confidence})`}`);
      }
    }
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
