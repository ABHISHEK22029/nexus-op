#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   audit-customers — the same three questions asked of vendors, asked of
   customers, because "Requirement" was added as a column and every row
   on screen says "not recorded".

   A column nobody has filled is not a delivered feature. Before deciding
   what to do about that, find out whether it is empty because the data was
   never entered, or empty because the write path drops it.
   ══════════════════════════════════════════════════════════════════════ */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../db');

(async () => {
  const one = async (sql, p = []) => (await db.query(sql, p)).rows;

  const [tot] = await one('SELECT COUNT(*) c FROM customers');
  console.log(`\n  customers: ${tot.c}`);

  /* Does the column even exist, and what is its type? */
  const cols = await one(`
    SELECT column_name, data_type FROM information_schema.columns
     WHERE table_name = 'customers'
       AND column_name IN ('requirement','requirement_category')
     ORDER BY column_name`);
  console.log(`\n  ── schema`);
  if (!cols.length) console.log('     NEITHER COLUMN EXISTS — migration 043 did not land');
  cols.forEach(c => console.log(`     ${c.column_name.padEnd(22)} ${c.data_type}`));

  if (cols.length) {
    const [f] = await one(`
      SELECT COUNT(*) FILTER (WHERE COALESCE(TRIM(requirement),'') <> '')          req,
             COUNT(*) FILTER (WHERE COALESCE(TRIM(requirement_category),'') <> '') cat
        FROM customers`);
    console.log(`\n  ── filled`);
    console.log(`     requirement          ${f.req} of ${tot.c}`);
    console.log(`     requirement_category ${f.cat} of ${tot.c}`);
  }

  /* The same two data problems the vendor list had. */
  const nameless = await one(
    `SELECT id FROM customers WHERE name IS NULL OR TRIM(name) = '' ORDER BY id`);
  console.log(`\n  ── ${nameless.length} customer(s) with no name` +
    (nameless.length ? `: ${nameless.map(r => r.id).join(', ')}` : ''));

  const dupes = await one(`
    SELECT name, COUNT(*) n, ARRAY_AGG(id ORDER BY id) ids
      FROM customers WHERE COALESCE(TRIM(name),'') <> ''
     GROUP BY name HAVING COUNT(*) > 1 ORDER BY COUNT(*) DESC, name`);
  console.log(`  ── ${dupes.length} duplicated name(s)`);
  dupes.slice(0, 10).forEach(d => console.log(`     ${d.name}  ×${d.n}  (${d.ids.join(', ')})`));

  /* Is there a customer-kind category list for the picker to offer? */
  try {
    const cats = await one(
      `SELECT name FROM supply_categories WHERE kind = 'customer' ORDER BY name`);
    console.log(`\n  ── ${cats.length} customer requirement categor(ies) defined`);
    cats.forEach(c => console.log(`     ${c.name}`));
  } catch (e) { console.log(`\n  ── supply_categories: ${e.message}`); }

  /* What the list endpoint actually returns for a row — if `requirement`
     is not in the SELECT, the column renders blank no matter what is
     stored. This is exactly how doc_prefix was write-only for weeks. */
  const sample = await one(
    `SELECT id, name, requirement, requirement_category FROM customers ORDER BY id LIMIT 5`);
  console.log(`\n  ── sample rows`);
  sample.forEach(r => console.log(
    `     ${String(r.id).padStart(4)}  ${String(r.name || '').slice(0, 30).padEnd(32)}` +
    `${r.requirement_category || '—'} / ${r.requirement || '—'}`));

  console.log('');
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
