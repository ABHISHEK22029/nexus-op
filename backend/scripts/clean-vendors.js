#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   clean-vendors — three things wrong with the vendor list, all visible.

   1. TWO VENDORS WITH NO NAME. They render as blank rows at the top of the
      directory. Nothing can be bought from a vendor with no name.

   2. EIGHT DUPLICATED NAMES — Afcons, Dell EMC, Larsen & Toubro and five
      others each appear twice. seed_sample.sql was loaded more than once.

   3. FOURTEEN VENDORS WHOSE "supplies" READS "Structures, Earthworks".
      That is road-contractor demo text, and it is in the new field because
      migration 043 copied capability_tags into supplies to avoid losing
      anything. For a furniture manufacturer it is nonsense, and "what does
      this vendor actually sell us" is exactly the question the column exists
      to answer — so wrong text there is worse than none.

   Deletes are refused for any vendor referenced by a purchase order, bill,
   quote or price-list row. A duplicate that has been transacted with is not
   a duplicate any more; it is history.

   Usage: node scripts/clean-vendors.js [--apply]      (dry run by default)
   ══════════════════════════════════════════════════════════════════════ */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../db');

const APPLY = process.argv.includes('--apply');

/* Everything that can point at a vendor. A row here means "do not delete". */
const REFS = [
  ['purchase_orders', '"vendorId"'],
  ['vendor_items', 'vendor_id'],
  ['quote_lines', 'vendor_id'],
  ['vendor_payments', 'vendor_id'],
  ['work_orders', '"vendorId"'],
];

async function refCount(id) {
  let n = 0;
  const where = [];
  for (const [table, col] of REFS) {
    try {
      const { rows } = await db.query(`SELECT COUNT(*) c FROM ${table} WHERE ${col} = $1`, [id]);
      const c = Number(rows[0].c);
      if (c) { n += c; where.push(`${table}:${c}`); }
    } catch { /* table may not exist on every install */ }
  }
  return { n, where };
}

(async () => {
  console.log(`\n  ${APPLY ? 'APPLYING' : 'DRY RUN — nothing will change'}\n`);

  /* ── 1. nameless ── */
  const { rows: nameless } = await db.query(
    `SELECT id FROM vendors WHERE name IS NULL OR TRIM(name) = '' ORDER BY id`);
  console.log(`  ── ${nameless.length} vendor(s) with no name`);
  for (const v of nameless) {
    const r = await refCount(v.id);
    if (r.n) { console.log(`     id ${v.id}: KEPT — referenced by ${r.where.join(', ')}`); continue; }
    if (APPLY) await db.query('DELETE FROM vendors WHERE id = $1', [v.id]);
    console.log(`     id ${v.id}: ${APPLY ? 'deleted' : 'would delete'}`);
  }

  /* ── 2. duplicates ── */
  const { rows: dupes } = await db.query(`
    SELECT name, ARRAY_AGG(id ORDER BY id) ids
      FROM vendors WHERE name IS NOT NULL AND TRIM(name) <> ''
     GROUP BY name HAVING COUNT(*) > 1 ORDER BY name`);
  console.log(`\n  ── ${dupes.length} duplicated name(s)`);
  for (const d of dupes) {
    /* Keep the one that has been used; failing that, the oldest. Deleting the
       transacted copy would orphan a purchase order. */
    const scored = [];
    for (const id of d.ids) scored.push({ id, ...(await refCount(id)) });
    scored.sort((a, b) => b.n - a.n || a.id - b.id);
    const keep = scored[0];
    const drop = scored.slice(1).filter(s => s.n === 0);
    const stuck = scored.slice(1).filter(s => s.n > 0);

    console.log(`     ${d.name}: keep id ${keep.id}${keep.n ? ` (${keep.where.join(', ')})` : ''}`);
    for (const s of drop) {
      if (APPLY) await db.query('DELETE FROM vendors WHERE id = $1', [s.id]);
      console.log(`        id ${s.id}: ${APPLY ? 'deleted' : 'would delete'}`);
    }
    for (const s of stuck) console.log(`        id ${s.id}: KEPT — referenced by ${s.where.join(', ')}`);
  }

  /* ── 3. demo text in `supplies` ── */
  const DEMO = ['Structures, Earthworks', 'Servers'];
  const { rows: junk } = await db.query(
    `SELECT COUNT(*) c FROM vendors WHERE supplies = ANY($1)`, [DEMO]);
  console.log(`\n  ── ${junk[0].c} vendor(s) whose "supplies" is demo text`);
  if (APPLY) {
    /* Cleared, not rewritten. We do not know what these vendors actually
       supply, and inventing an answer is worse than an honest blank that
       somebody fills in. capability_tags keeps the old value, so nothing is
       destroyed. */
    const r = await db.query(
      `UPDATE vendors SET supplies = NULL WHERE supplies = ANY($1)`, [DEMO]);
    console.log(`     cleared on ${r.rowCount} vendor(s) — capability_tags still holds the original`);
  } else {
    console.log(`     would clear (capability_tags keeps the original)`);
  }

  const { rows: after } = await db.query('SELECT COUNT(*) c FROM vendors');
  console.log(`\n  vendors now: ${after[0].c}\n`);
  if (!APPLY) console.log('  re-run with --apply to make these changes\n');
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
