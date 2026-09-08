#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   Stock rows that point at nothing.

   A stock row should link to a raw material or a product. Eight do not,
   and an unlinked row is worse than no row: the deficiency engine reads
   "available" from the link, so it reports zero however much is held, and
   the item looks tracked while being invisible to everything that matters.

   They fall into two groups, and only one is safe to remove without asking:

     · four left by my own test runs — FLOW-* and STOCKTEST-* — which
       cleanup missed
     · four from the road-contractor seed data: a Dell server, GSB
       aggregate, bitumen, a foundation bolt. None of them matches any of
       the 235 raw materials or 197 products on this database, so they
       cannot be linked to anything; they are leftovers from a dataset that
       no longer describes the business.

   A row referenced by production is NEVER deleted — a consumption or
   output record pointing at a missing stock row is a hole in the ledger.
   Its movements go with it, so nothing is orphaned.

   Usage: node scripts/clean-unlinked-stock.js [--apply]   (dry run default)
   ══════════════════════════════════════════════════════════════════════ */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../db');

const APPLY = process.argv.includes('--apply');
const TEST_PREFIXES = ['FLOW-%', 'STOCKTEST-%', 'UITEST-%', 'QTEST-%', 'SEQ-%'];

(async () => {
  console.log(`\n  ${APPLY ? 'APPLYING' : 'DRY RUN — nothing will change'}\n`);
  const client = await db.getClient();
  try {
    if (APPLY) await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT id, "itemName", quantity, owner_id
         FROM inventory
        WHERE raw_material_id IS NULL AND sku_id IS NULL
        ORDER BY id`);

    let removed = 0, kept = 0;
    for (const r of rows) {
      /* Referenced by production is the one hard stop. */
      const refs = [];
      for (const t of ['production_consumption', 'production_output']) {
        try {
          const { rows: [c] } = await client.query(
            `SELECT COUNT(*) n FROM ${t} WHERE inventory_id = $1`, [r.id]);
          if (Number(c.n)) refs.push(`${t}:${c.n}`);
        } catch { /* table may not exist on every install */ }
      }
      if (refs.length) {
        kept++;
        console.log(`     id ${String(r.id).padStart(5)}  KEPT — used by ${refs.join(', ')}  ${r.itemName}`);
        continue;
      }

      const isTest = TEST_PREFIXES.some(p =>
        new RegExp('^' + p.replace('%', '')).test(String(r.itemName || '')));
      const why = isTest ? 'left by a test run' : 'no matching material or product';
      console.log(`     id ${String(r.id).padStart(5)}  qty ${String(r.quantity).padStart(7)}  ` +
        `${String(r.itemName).slice(0, 34).padEnd(36)}${APPLY ? 'deleted' : 'would delete'} — ${why}`);

      if (APPLY) {
        await client.query('DELETE FROM stock_movements WHERE inventory_id = $1', [r.id]);
        await client.query('DELETE FROM inventory WHERE id = $1', [r.id]);
      }
      removed++;
    }

    if (APPLY) await client.query('COMMIT');

    const { rows: [after] } = await db.query('SELECT COUNT(*) c FROM inventory');
    const { rows: [unlinked] } = await db.query(
      'SELECT COUNT(*) c FROM inventory WHERE raw_material_id IS NULL AND sku_id IS NULL');
    const { rows: [orphan] } = await db.query(
      `SELECT COUNT(*) c FROM stock_movements m
        WHERE m.inventory_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM inventory i WHERE i.id = m.inventory_id)`);

    console.log(`\n  ${removed} ${APPLY ? 'removed' : 'would be removed'}, ${kept} kept (in use)`);
    console.log(`  stock rows now: ${after.c}   still unlinked: ${unlinked.c}   orphaned movements: ${orphan.c}`);
    if (!APPLY) console.log('\n  re-run with --apply to make these changes\n');
    else console.log('');
  } catch (e) {
    if (APPLY) await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally { client.release(); }
  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
