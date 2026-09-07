#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   fix-integrity — repair what audit-integrity.js found.

   Separate from the audit on purpose: finding and changing should not be
   the same script, so the report can be read before anything moves.

   What this WILL do, and why each is defensible without guessing:

     1. PO 20 — 1250 received against an order for 150. Bolts are counted,
        not weighed, so this is not a unit conversion; there is one receipt,
        no line items and no amendment. The order is the contractual record,
        so the receipt is corrected to match it. The stock correction is
        written as a LEDGER ADJUSTMENT with a reason, not as a silent UPDATE
        — a stock figure that changes with no recorded cause is how people
        stop believing the numbers.

     2. Orphaned goods receipts (GRN 9, 10) pointing at purchase orders
        4846 and 4847, which do not exist. Left behind by my own flow test,
        whose cleanup deleted the POs before the GRNs.

     3. Four stock rows at quantity -40, all named UITEST-*. My chain-test
        litter, and the entire content of the dashboard's "needs ordering".

     4. CO-0001 marked Delivered with nothing dispatched — the selling-side
        twin of PO 4. Returned to 'Open', which is what it is.

     5. Fifteen items each split across six stock rows. Movements are
        repointed at the surviving row before anything is deleted, so no
        ledger entry is orphaned.

   What this will NOT do:

     · Vendor 39 has no name. It belongs to owner 5 — abhisheklancer987@,
       a real account — with two real purchase orders against it. Inventing
       a supplier name would be fabricating a business record. It needs a
       human who knows who they buy from. Migration 049 stops any more being
       created.

   Usage: node scripts/fix-integrity.js [--apply]     (dry run by default)
   ══════════════════════════════════════════════════════════════════════ */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../db');
const stock = require('../shared/stock');

const APPLY = process.argv.includes('--apply');
const say = (s) => console.log(s);

(async () => {
  say(`\n  ${APPLY ? 'APPLYING' : 'DRY RUN — nothing will change'}\n`);
  const client = await db.getClient();

  try {
    if (APPLY) await client.query('BEGIN');

    /* ── 1. PO 20 ─────────────────────────────────────────── */
    const { rows: [po20] } = await client.query(
      `SELECT id, quantity, received_quantity, "itemName" FROM purchase_orders WHERE id = 20`);
    if (po20 && Number(po20.received_quantity) > Number(po20.quantity)) {
      const ordered = Number(po20.quantity);
      const excess = Number(po20.received_quantity) - ordered;
      say(`  ── PO 20 — received ${po20.received_quantity} against an order for ${ordered}`);
      say(`     correcting the receipt to ${ordered}, and writing off ${excess} from stock`);

      if (APPLY) {
        await client.query(
          `UPDATE grn SET "receivedQuantity" = $1 WHERE "poId" = 20`, [ordered]);
        await client.query(
          `UPDATE purchase_orders SET received_quantity = $1, status = 'Delivered' WHERE id = 20`,
          [ordered]);

        /* Correct the stock through the ledger, so the correction is part of
           the item's history rather than an unexplained jump. */
        const { rows: [inv] } = await client.query(
          `SELECT id, owner_id, quantity, uom, unit_cost, raw_material_id
             FROM inventory WHERE "itemName" = $1 ORDER BY id LIMIT 1`, [po20.itemName]);
        if (inv && Number(inv.quantity) > ordered) {
          await stock.move(client, {
            ownerId: inv.owner_id,
            inventoryId: inv.id,
            rawMaterialId: inv.raw_material_id,
            itemName: po20.itemName,
            quantity: -(Number(inv.quantity) - ordered),
            uom: inv.uom, unitCost: inv.unit_cost,
            movementType: 'adjustment',
            refType: 'purchase_order', refId: 20,
            note: `Correction: receipt recorded 1250 against a purchase order for ${ordered}`,
          });
          say(`     stock ${inv.quantity} → ${ordered}, recorded as an adjustment`);
        }
      }
    } else say('  ── PO 20 — already consistent');

    /* ── 2. orphaned goods receipts ───────────────────────── */
    const { rows: orphanGrn } = await client.query(
      `SELECT g.id, g."poId", g."receivedQuantity" FROM grn g
        WHERE g."poId" IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM purchase_orders p WHERE p.id = g."poId")`);
    say(`\n  ── ${orphanGrn.length} goods receipt(s) against a purchase order that no longer exists`);
    for (const g of orphanGrn) {
      say(`     GRN ${g.id} → PO ${g.poId} (qty ${g.receivedQuantity}) ${APPLY ? 'deleted' : 'would delete'}`);
      if (APPLY) await client.query('DELETE FROM grn WHERE id = $1', [g.id]);
    }

    /* ── 3. test litter at negative stock ─────────────────── */
    const { rows: junk } = await client.query(
      `SELECT id, "itemName", quantity FROM inventory
        WHERE "itemName" LIKE 'UITEST-%' OR "itemName" LIKE 'STOCKTEST-%'
           OR "itemName" LIKE 'FLOW-%'   OR "itemName" LIKE 'QTEST-%'`);
    say(`\n  ── ${junk.length} stock row(s) left by tests`);
    for (const j of junk) {
      say(`     id ${j.id}  qty ${j.quantity}  ${j.itemName}  ${APPLY ? 'deleted' : 'would delete'}`);
      if (APPLY) {
        await client.query('DELETE FROM stock_movements WHERE inventory_id = $1', [j.id]);
        await client.query('DELETE FROM production_consumption WHERE inventory_id = $1', [j.id]).catch(() => {});
        await client.query('DELETE FROM production_output      WHERE inventory_id = $1', [j.id]).catch(() => {});
        await client.query('DELETE FROM inventory WHERE id = $1', [j.id]);
      }
    }

    /* ── 4. an order Delivered with nothing dispatched ────── */
    const { rows: badOrders } = await client.query(
      `SELECT o.id, o.order_number FROM customer_orders o
        WHERE o.status = 'Delivered'
          AND COALESCE((SELECT SUM(dci.quantity)
                          FROM delivery_challan_items dci
                          JOIN delivery_challans d ON d.id = dci.delivery_challan_id
                         WHERE d.customer_order_id = o.id
                           AND d.status IN ('Dispatched','Delivered')),0) <= 0`);
    say(`\n  ── ${badOrders.length} customer order(s) Delivered with nothing dispatched`);
    for (const o of badOrders) {
      say(`     ${o.order_number} → Open  ${APPLY ? '(set)' : '(would set)'}`);
      if (APPLY) await client.query(`UPDATE customer_orders SET status = 'Open' WHERE id = $1`, [o.id]);
    }

    /* ── 5. one item, six rows ────────────────────────────── */
    const { rows: dupes } = await client.query(
      `SELECT "itemName" AS name, ARRAY_AGG(id ORDER BY id) ids, SUM(quantity)::numeric total
         FROM inventory
        WHERE "itemName" NOT LIKE 'UITEST-%' AND "itemName" NOT LIKE 'STOCKTEST-%'
          AND "itemName" NOT LIKE 'FLOW-%'   AND "itemName" NOT LIKE 'QTEST-%'
        GROUP BY "itemName" HAVING COUNT(*) > 1 ORDER BY "itemName"`);
    say(`\n  ── ${dupes.length} item(s) split across duplicate stock rows`);
    let merged = 0;
    for (const d of dupes) {
      const [keep, ...drop] = d.ids;
      say(`     ${d.name}: ${d.ids.length} rows → 1, qty ${d.total}, keeping id ${keep}`);
      if (APPLY) {
        for (const tbl of ['stock_movements', 'production_consumption', 'production_output']) {
          await client.query(
            `UPDATE ${tbl} SET inventory_id = $1 WHERE inventory_id = ANY($2)`, [keep, drop])
            .catch(() => {});
        }
        await client.query('UPDATE inventory SET quantity = $1 WHERE id = $2', [d.total, keep]);
        await client.query('DELETE FROM inventory WHERE id = ANY($1)', [drop]);
      }
      merged += drop.length;
    }

    if (APPLY) await client.query('COMMIT');

    say(`\n  ${APPLY ? 'applied' : 'would remove'} ${merged} duplicate row(s)`);
    if (!APPLY) say('\n  re-run with --apply to make these changes\n');
    else say('\n  done — re-run scripts/audit-integrity.js to confirm\n');
  } catch (e) {
    if (APPLY) await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally { client.release(); }

  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
