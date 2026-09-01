/* ══════════════════════════════════════════════════════════
   stock — the only way stock is allowed to move.

   Before this, `UPDATE inventory SET quantity = quantity ± $1` was written
   inline in four places, and two more places that should have written it
   didn't — production output and dispatch. That is the predictable outcome
   of having no single function to call: the ones somebody remembered got
   written, the ones nobody remembered silently didn't happen.

   Every function here does both halves in ONE transaction: it writes the
   ledger row and it moves the balance. Neither can happen without the
   other, so the reconciliation check can only ever fail because of a bug
   in this file rather than because of a caller that forgot.

   Callers pass their own client so the movement joins the caller's
   transaction — a dispatch that fails partway must not leave stock removed.
   ══════════════════════════════════════════════════════════ */

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Record one stock movement and apply it to the balance.
 *
 * @param client        an open pg client, already inside a transaction
 * @param {object} m
 * @param m.inventoryId    stock row to move (required unless resolving)
 * @param m.itemName       for the ledger, and for creating a row if needed
 * @param m.quantity       SIGNED: positive in, negative out
 * @param m.movementType   one of the CHECK values in migration 034
 * @param m.refType/refId/refNumber   the document that caused it
 */
async function move(client, m) {
  const qty = Number(m.quantity);
  if (!Number.isFinite(qty) || qty === 0) return null;   // nothing to record
  if (!m.inventoryId) throw new Error('stock.move needs an inventoryId');

  const { rows } = await client.query(
    `INSERT INTO stock_movements
       (owner_id, inventory_id, sku_id, raw_material_id, item_name, quantity,
        uom, unit_cost, movement_type, ref_type, ref_id, ref_number, note, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
    [m.ownerId || null, m.inventoryId, m.skuId || null, m.rawMaterialId || null,
     m.itemName || '', r2(qty), m.uom || null, m.unitCost ?? null,
     m.movementType, m.refType || null, m.refId || null, m.refNumber || null,
     m.note || null, m.userId || null]
  );

  await client.query(
    `UPDATE inventory SET quantity = COALESCE(quantity,0) + $1, last_movement_at = NOW() WHERE id = $2`,
    [r2(qty), m.inventoryId]
  );

  return rows[0].id;
}

/**
 * Find the stock row for an item, creating it if this is the first time we
 * have seen it.
 *
 * Finished goods need this: a product's first production run has no
 * inventory row yet, and refusing to record the output because the row is
 * missing would be the same "output goes nowhere" bug in a new costume.
 *
 * Matching is by sku_id first, then raw_material_id, then name within the
 * same owner — name last because two owners may legitimately both have
 * "MS Plate 10mm" and they are not the same stock.
 */
async function resolveInventoryRow(client, { ownerId, skuId, rawMaterialId, itemName, uom, projectId, itemType, unitCost }) {
  const owner = ownerId ?? null;

  /* Matching is `owner = mine OR owner IS NULL`, not `IS NOT DISTINCT FROM`.
     The strict version split one item into two rows and cost an afternoon:
     production output ran with production_orders.owner_id — which nothing
     was setting, so NULL — while dispatch ran with the challan's owner_id of
     1. Same name, two rows. The ledger was perfectly correct and reconciled
     clean the whole time; the balance simply moved on a row nobody was
     looking at. A correct ledger pointing at the wrong row is the most
     convincing kind of wrong.

     Unowned rows are pre-tenancy leftovers, so the first owner to touch one
     claims it (below) rather than forking a parallel row beside it. */
  const tries = [];
  if (skuId) tries.push(['sku_id = $1 AND (owner_id = $2 OR owner_id IS NULL)', [skuId, owner]]);
  if (rawMaterialId) tries.push(['raw_material_id = $1 AND (owner_id = $2 OR owner_id IS NULL)', [rawMaterialId, owner]]);
  if (itemName) tries.push(['LOWER("itemName") = LOWER($1) AND (owner_id = $2 OR owner_id IS NULL)', [itemName, owner]]);

  for (const [where, params] of tries) {
    // Prefer an exactly-owned row over an unowned one when both exist.
    const { rows } = await client.query(
      `SELECT * FROM inventory WHERE ${where} ORDER BY (owner_id IS NULL), id LIMIT 1`, params);
    if (rows[0]) {
      if (rows[0].owner_id == null && owner != null) {
        await client.query('UPDATE inventory SET owner_id = $1 WHERE id = $2', [owner, rows[0].id]);
        rows[0].owner_id = owner;
      }
      return rows[0];
    }
  }

  const { rows } = await client.query(
    `INSERT INTO inventory ("projectId", "itemName", quantity, uom, item_type,
                            unit_cost, sku_id, raw_material_id, owner_id)
     VALUES ($1,$2,0,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [projectId || null, itemName || 'Unnamed item', uom || 'nos',
     itemType || (skuId ? 'finished' : 'raw'), unitCost ?? null,
     skuId || null, rawMaterialId || null, ownerId || null]
  );
  return rows[0];
}

/** Convenience: goods in. */
const stockIn = (client, m) => move(client, { ...m, quantity: Math.abs(Number(m.quantity) || 0) });

/** Convenience: goods out. Sign is applied here so callers can't forget. */
const stockOut = (client, m) => move(client, { ...m, quantity: -Math.abs(Number(m.quantity) || 0) });

/**
 * Undo every movement made by a document, by writing compensating entries.
 *
 * Deliberately NOT a delete. A challan dispatched in error and reversed is
 * two real events, and a stock ledger that erases its own history cannot
 * answer the question it exists to answer.
 */
async function reverseFor(client, { refType, refId, movementType, reversalType, userId }) {
  const { rows } = await client.query(
    `SELECT * FROM stock_movements
     WHERE ref_type = $1 AND ref_id = $2 AND movement_type = $3`,
    [refType, refId, movementType]
  );
  for (const m of rows) {
    await move(client, {
      ownerId: m.owner_id, inventoryId: m.inventory_id, skuId: m.sku_id,
      rawMaterialId: m.raw_material_id, itemName: m.item_name,
      quantity: -Number(m.quantity),           // opposite sign
      uom: m.uom, unitCost: m.unit_cost,
      movementType: reversalType || 'adjustment',
      refType, refId, refNumber: m.ref_number,
      note: `Reversal of movement #${m.id}`, userId,
    });
  }
  return rows.length;
}

/** Ledger sum vs stored balance, per stock row. Any row where they differ
    is a bug in this file or a write that bypassed it. */
async function reconcile(db, ownerId, isAdmin) {
  const params = [];
  let scope = '';
  if (!isAdmin) { params.push(ownerId); scope = ` WHERE i.owner_id = $${params.length}`; }
  const { rows } = await db.query(
    `SELECT i.id, i."itemName" AS item_name, i.uom,
            COALESCE(i.quantity,0)::numeric        AS balance,
            COALESCE(SUM(m.quantity),0)::numeric   AS ledger,
            (COALESCE(i.quantity,0) - COALESCE(SUM(m.quantity),0))::numeric AS drift
     FROM inventory i
     LEFT JOIN stock_movements m ON m.inventory_id = i.id
     ${scope}
     GROUP BY i.id, i."itemName", i.uom, i.quantity
     ORDER BY ABS(COALESCE(i.quantity,0) - COALESCE(SUM(m.quantity),0)) DESC`,
    params
  );
  const drifted = rows.filter(r => Math.abs(Number(r.drift)) > 0.001);
  return { checked: rows.length, drifted, healthy: drifted.length === 0 };
}

module.exports = { move, stockIn, stockOut, resolveInventoryRow, reverseFor, reconcile };
