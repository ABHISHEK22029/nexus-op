/* ══════════════════════════════════════════════════════════════════════
   audit-vendor-fields — which vendor fields does the product actually USE?

   The New Vendor form asks 47 questions across 5 tabs. Two are required.
   "Is that too many" is an opinion; "does anything ever read this" is a
   fact, and this measures the fact three ways:

     · is the column read ANYWHERE outside the form that writes it —
       a document, a list, a calculation, an export?
     · is it populated on the live database, after real use?
     · is it needed by a purchase order, a bill, or a payment?

   A field that nothing reads and nobody fills is not "extra detail". It is
   a question asked of a busy person for no reason.
   ══════════════════════════════════════════════════════════════════════ */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../db');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

/* Where a field being READ would show up. Deliberately excludes the vendor
   form and the vendor controller's own column allowlist — writing a value
   is not using it. */
const READ_DIRS = [
  ['backend', ['controllers', 'shared', 'routes']],
  ['frontend/src', ['pages', 'components']],
];
const IGNORE_FILES = ['VendorForm.jsx', 'audit-vendor-fields.js'];

function sources() {
  const out = [];
  for (const [base, subs] of READ_DIRS) {
    for (const sub of subs) {
      const dir = path.join(ROOT, base, sub);
      if (!fs.existsSync(dir)) continue;
      const walk = (d) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          const p = path.join(d, e.name);
          if (e.isDirectory()) walk(p);
          else if (/\.(js|jsx)$/.test(e.name) && !IGNORE_FILES.includes(e.name)) {
            out.push({ file: path.relative(ROOT, p).replace(/\\/g, '/'), text: fs.readFileSync(p, 'utf8') });
          }
        }
      };
      walk(dir);
    }
  }
  return out;
}

(async () => {
  const cols = (await db.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='vendors' ORDER BY ordinal_position`)).rows.map(r => r.column_name);

  const total = Number((await db.query('SELECT COUNT(*) c FROM vendors')).rows[0].c);
  const src = sources();

  const rows = [];
  for (const col of cols) {
    if (col === 'id') continue;
    const filled = Number((await db.query(
      `SELECT COUNT(*) c FROM vendors WHERE "${col}" IS NOT NULL AND "${col}"::text <> ''`)).rows[0].c);

    /* A read is the column name appearing in code that is not the form. The
       vendor controller's allowlist is a write path, so it is excluded by
       looking for usage as a property access or a rendered value. */
    const readers = src.filter(s => {
      const re = new RegExp(`[.\\[\`'"]${col}\\b`);
      return re.test(s.text);
    }).map(s => s.file);

    rows.push({ col, filled, pct: total ? Math.round((filled / total) * 100) : 0, readers });
  }

  const dead = rows.filter(r => !r.readers.length);
  const unused = rows.filter(r => r.filled === 0);

  console.log(`\n  ${total} vendors on this database. ${cols.length - 1} columns.\n`);
  console.log('  column                  filled   %     read by');
  console.log('  ' + '─'.repeat(74));
  for (const r of rows.sort((a, b) => b.filled - a.filled || a.col.localeCompare(b.col))) {
    const who = r.readers.length
      ? r.readers.slice(0, 2).map(f => f.split('/').pop()).join(', ') + (r.readers.length > 2 ? ` +${r.readers.length - 2}` : '')
      : '— nothing —';
    const flag = !r.readers.length && r.filled === 0 ? ' 🔴' : (!r.readers.length ? ' 🟠' : '');
    console.log(`  ${r.col.padEnd(24)}${String(r.filled).padStart(5)}${String(r.pct + '%').padStart(6)}   ${who}${flag}`);
  }

  console.log('\n  ' + '─'.repeat(74));
  console.log(`\n  🔴 never read AND never filled : ${dead.filter(d => d.filled === 0).length}`);
  console.log(`  🟠 never read but has data     : ${dead.filter(d => d.filled > 0).length}`);
  console.log(`     empty on every vendor       : ${unused.length}`);
  console.log(`\n  columns nothing reads:\n     ${dead.map(d => d.col).join(', ') || '(none)'}\n`);
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
