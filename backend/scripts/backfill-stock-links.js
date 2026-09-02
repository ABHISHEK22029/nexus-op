#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   backfill-stock-links — link existing stock rows to their material.

   Stock is matched to demand through inventory.raw_material_id. Every live
   row has it NULL, so the deficiency engine reports "available: 0" however
   much stock is held — it would say you are short of material sitting in
   your own yard.

   Matching is by NAME, which is a guess, so this is deliberately built to
   be checked rather than trusted:

     · --dry (default) shows what it WOULD do and changes nothing
     · exact name matches are applied
     · near matches are LISTED, never auto-applied — a wrong link is worse
       than no link, because it silently attributes one material's stock to
       another and the engine then under-orders
     · anything unmatched is named, so you know what still needs a decision

   Run:  node scripts/backfill-stock-links.js         (preview)
         node scripts/backfill-stock-links.js --apply (write)
   ══════════════════════════════════════════════════════════════════════ */
const db = require('../db');
const APPLY = process.argv.includes('--apply');

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

(async () => {
  const unlinked = (await db.query(
    `SELECT id, "itemName", quantity, uom, item_type, owner_id
     FROM inventory WHERE raw_material_id IS NULL AND sku_id IS NULL ORDER BY id`)).rows;

  if (!unlinked.length) { console.log('✅ every stock row is already linked'); process.exit(0); }

  const materials = (await db.query('SELECT id, name, base_uom FROM raw_materials')).rows;
  const skus = (await db.query('SELECT id, name, unit FROM skus')).rows;

  const matByName = new Map(materials.map(m => [norm(m.name), m]));
  const skuByName = new Map(skus.map(s => [norm(s.name), s]));

  const exact = [], near = [], none = [];

  for (const row of unlinked) {
    const key = norm(row.itemName);
    const m = matByName.get(key);
    const s = skuByName.get(key);
    if (m) { exact.push({ row, kind: 'material', target: m }); continue; }
    if (s) { exact.push({ row, kind: 'product', target: s }); continue; }

    /* Near match: one name contains the other. Reported for a human to
       confirm, never applied — "MS Plate" and "MS Plate 10mm" are plausibly
       the same thing and plausibly not, and the cost of being wrong is
       silently merging two materials' stock. */
    const cand = [
      ...materials.filter(x => norm(x.name).includes(key) || key.includes(norm(x.name))).map(x => ({ kind: 'material', target: x })),
      ...skus.filter(x => norm(x.name).includes(key) || key.includes(norm(x.name))).map(x => ({ kind: 'product', target: x })),
    ].slice(0, 3);

    if (cand.length) near.push({ row, cand });
    else none.push({ row });
  }

  console.log(`\n${unlinked.length} unlinked stock row(s)\n`);

  if (exact.length) {
    console.log(`── exact name match (${exact.length}) ${APPLY ? '— applying' : '— would apply'} ──`);
    for (const e of exact) {
      console.log(`   #${e.row.id} "${e.row.itemName}" (${e.row.quantity} ${e.row.uom || ''})  ->  ${e.kind} #${e.target.id}`);
      if (APPLY) {
        const col = e.kind === 'material' ? 'raw_material_id' : 'sku_id';
        const type = e.kind === 'material' ? 'raw' : 'finished';
        await db.query(`UPDATE inventory SET ${col} = $1, item_type = $2 WHERE id = $3`, [e.target.id, type, e.row.id]);
        // Keep the ledger consistent with the row it now describes.
        await db.query(
          `UPDATE stock_movements SET ${col} = $1 WHERE inventory_id = $2 AND ${col} IS NULL`,
          [e.target.id, e.row.id]);
      }
    }
    console.log('');
  }

  if (near.length) {
    console.log(`── near match — NOT applied, confirm each (${near.length}) ──`);
    for (const n of near) {
      console.log(`   #${n.row.id} "${n.row.itemName}"`);
      n.cand.forEach(c => console.log(`        could be ${c.kind} #${c.target.id} "${c.target.name}"`));
    }
    console.log('');
  }

  if (none.length) {
    console.log(`── no match at all (${none.length}) ──`);
    none.forEach(n => console.log(`   #${n.row.id} "${n.row.itemName}" (${n.row.quantity} ${n.row.uom || ''})`));
    console.log('   These need a material or product created, or the row deleted.\n');
  }

  if (!APPLY) {
    console.log('Nothing changed. Re-run with --apply to write the exact matches.\n');
  } else {
    const left = (await db.query(
      `SELECT COUNT(*)::int n FROM inventory WHERE raw_material_id IS NULL AND sku_id IS NULL`)).rows[0].n;
    console.log(`✅ applied. ${left} row(s) still unlinked (near/no match — they need a decision).\n`);
  }
  process.exit(0);
})().catch(e => { console.error('❌', e.message); process.exit(1); });
