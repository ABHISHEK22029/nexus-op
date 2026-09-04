#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   clean-inventory — the Stock on hand page says 102 items. There are 27.

   Every item has six rows: same owner, no location, no project, no
   category. seed-org.js inserted a fresh inventory row on each run instead
   of adding to the balance that was already there, so "Cam Lock Fitting
   15mm" is six cards reading 3,273 / 4,767 / 1,191 / 2,983 / 861 / 773
   when it is one item and 13,848 of them.

   Six rows for one item is not just cosmetic. It is why "NEEDS ORDERING"
   cannot work: a reorder level set on one of the six is compared against a
   sixth of the stock, so the warning fires on an item you have plenty of.

   Also removes 8 UITEST-* rows left behind by the chain tests, four of
   which sit at quantity -40 and are the entire content of the "NEEDS
   ORDERING 4" figure on the dashboard.

   Merging repoints stock_movements, production_consumption and
   production_output at the surviving row first, so no ledger entry is
   orphaned and the movement history stays complete.

   Usage: node scripts/clean-inventory.js [--apply]     (dry run by default)
   ══════════════════════════════════════════════════════════════════════ */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../db');

const APPLY = process.argv.includes('--apply');

/* Read out of information_schema rather than typed from memory. The
   customer de-dupe named these columns by hand, guessed "customerId" when
   the real column is customer_id, and swallowed every resulting error in a
   try/catch — so it reported "referenced by nothing" for rows it had never
   actually managed to check. */
async function referencingTables() {
  const { rows } = await db.query(`
    SELECT tc.table_name, kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
     WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name = 'inventory'
     ORDER BY 1`);
  return rows;
}

(async () => {
  console.log(`\n  ${APPLY ? 'APPLYING' : 'DRY RUN — nothing will change'}\n`);
  const refs = await referencingTables();
  console.log(`  tables referencing inventory: ${refs.map(r => `${r.table_name}.${r.column_name}`).join(', ')}\n`);

  const client = await db.getClient();
  try {
    if (APPLY) await client.query('BEGIN');

    /* ── 1. test litter ── */
    const { rows: junk } = await client.query(
      `SELECT id, "itemName", quantity FROM inventory
        WHERE "itemName" LIKE 'UITEST-%' OR "itemName" LIKE 'STOCKTEST-%' ORDER BY id`);
    console.log(`  ── ${junk.length} row(s) left behind by tests`);
    for (const j of junk) {
      console.log(`     id ${j.id}  qty ${j.quantity}  ${j.itemName}`);
      if (APPLY) {
        for (const r of refs) {
          await client.query(`DELETE FROM ${r.table_name} WHERE "${r.column_name}" = $1`, [j.id]);
        }
        await client.query('DELETE FROM inventory WHERE id = $1', [j.id]);
      }
    }
    if (APPLY && junk.length) console.log(`     deleted, with their ledger entries`);

    /* ── 2. merge duplicates ── */
    const { rows: dupes } = await client.query(`
      SELECT "itemName" AS name, ARRAY_AGG(id ORDER BY id) ids,
             SUM(quantity)::numeric total, COUNT(*) n
        FROM inventory
       WHERE "itemName" NOT LIKE 'UITEST-%' AND "itemName" NOT LIKE 'STOCKTEST-%'
       GROUP BY "itemName" HAVING COUNT(*) > 1
       ORDER BY "itemName"`);

    console.log(`\n  ── ${dupes.length} item(s) split across duplicate rows`);
    let merged = 0;
    for (const d of dupes) {
      const [keep, ...drop] = d.ids;
      console.log(`     ${d.name}`);
      console.log(`        ${d.n} rows → 1   qty ${d.total}   keeping id ${keep}`);
      if (APPLY) {
        /* Repoint the history BEFORE deleting, so nothing is orphaned. */
        for (const r of refs) {
          await client.query(
            `UPDATE ${r.table_name} SET "${r.column_name}" = $1 WHERE "${r.column_name}" = ANY($2)`,
            [keep, drop]);
        }
        await client.query('UPDATE inventory SET quantity = $1 WHERE id = $2', [d.total, keep]);
        await client.query('DELETE FROM inventory WHERE id = ANY($1)', [drop]);
      }
      merged += drop.length;
    }

    if (APPLY) await client.query('COMMIT');

    const { rows: [after] } = await db.query('SELECT COUNT(*) c FROM inventory');
    const { rows: [names] } = await db.query('SELECT COUNT(DISTINCT "itemName") c FROM inventory');
    const { rows: [neg] } = await db.query('SELECT COUNT(*) c FROM inventory WHERE quantity < 0');
    const { rows: [orph] } = await db.query(
      `SELECT COUNT(*) c FROM stock_movements m
        WHERE m.inventory_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM inventory i WHERE i.id = m.inventory_id)`);

    console.log(`\n  rows ${APPLY ? 'now' : 'would be'}: ${after.c}   distinct items: ${names.c}`);
    console.log(`  rows with negative stock: ${neg.c}`);
    console.log(`  orphaned stock_movements: ${orph.c}`);
    if (!APPLY) console.log(`\n  ${merged} row(s) would be merged away — re-run with --apply\n`);
    else console.log('');
  } catch (e) {
    if (APPLY) await client.query('ROLLBACK');
    throw e;
  } finally { client.release(); }

  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
