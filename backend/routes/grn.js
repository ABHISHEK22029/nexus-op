const express = require('express');
const router = express.Router();
const db = require('../db');
const { convert, loadUoms } = require('../shared/uom');
const stock = require('../shared/stock');
const { notify } = require('../notify');
const { runList } = require('../shared/listQuery');

/* List GRN records, scoped to a project.

   The searchable columns are the ones written on the paperwork at the gate —
   the vehicle that brought the load, the batch stencilled on it, and where it
   was tipped. Those are what someone has in hand when they come looking for a
   receipt. Without a `limit` this still returns a plain array. */
router.get('/', async (req, res) => {
  try {
    const where = [], params = [];
    if (req.query.projectId) {
      params.push(req.query.projectId);
      where.push(`"projectId" = $${params.length}`);
    }
    const result = await runList(db, {
      table: 'grn',
      query: req.query,
      searchColumns: ['vehicleNumber', 'batchNumber', 'chainage'],
      allowedSort: ['id', 'date', 'receivedQuantity', 'vehicleNumber'],
      defaultSort: 'date',
      defaultDir: 'DESC',
      where, params,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create GRN: Record inward material, mark PO delivered, update inventory
router.post('/', async (req, res) => {
  // receivedUomCode: the unit the goods actually arrived in (e.g. 'mt').
  // Defaults to the PO line's unit, then the material's purchase unit.
  const { projectId, workOrderId, poId, vehicleNumber, batchNumber, chainage, receivedQuantity, receivedUomCode } = req.body;

  if (!poId || receivedQuantity === undefined) {
    return res.status(400).json({ error: 'poId and receivedQuantity are required' });
  }

  /* One transaction for the whole receipt.

     This ran as eight independent statements. A failure after step 3 left
     the purchase order marked Delivered with no stock added and no way to
     retry — the PO is no longer Dispatched, so the guard above refuses a
     second attempt. The goods are in the yard and the system says they were
     never received. */
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    // Step 1: Find PO
    const poResult = await client.query('SELECT * FROM purchase_orders WHERE id = $1', [poId]);
    const po = poResult.rows[0];
    /* Now that this runs in a transaction, a bare `return` here would leave
       it open until the pool reclaimed the connection. On a pooler capped at
       15 sessions, a few refused receipts would exhaust it. */
    const refuse = async (code, error) => {
      await client.query('ROLLBACK');
      res.status(code).json({ error });
    };
    if (!po) return await refuse(404, 'PO not found');
    if (po.status === 'Delivered') return await refuse(400, 'PO is already delivered');
    if (po.status !== 'Dispatched') return await refuse(400, 'PO must be Dispatched before receiving GRN');

    const resolvedProjectId = projectId || po.projectId;
    // workOrderId is now optional — fall back to the PO's, else null (no WO).
    const resolvedWorkOrderId = workOrderId || po.workOrderId || null;

    // Step 2: Insert GRN record
    const grnResult = await client.query(
      `INSERT INTO grn ("projectId", "workOrderId", "poId", "vehicleNumber", "batchNumber", chainage, "receivedQuantity")
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [resolvedProjectId, resolvedWorkOrderId, poId, vehicleNumber || null, batchNumber || null, chainage || null, receivedQuantity]
    );
    const grnId = grnResult.rows[0].id;

    // Step 3: Mark PO as Delivered
    await client.query(`UPDATE purchase_orders SET status = 'Delivered' WHERE id = $1`, [poId]);

    /* Step 4: Add to inventory.
       Match on raw_material_id when we can resolve one — matching on the
       display name alone meant "MS Sheet" and "MS  Sheet" became two separate
       stock rows, and with no unique constraint the code picked one at random.
       Falls back to the name only for stock not yet linked to the master. */
    const norm = (s) => String(s || '').toLowerCase().replace(/[×xX]/g, 'x').replace(/[^a-z0-9]+/g, ' ').trim();

    const material = (await client.query(
      `SELECT * FROM raw_materials
       WHERE btrim(regexp_replace(lower(translate(name, '×X', 'xx')), '[^a-z0-9]+', ' ', 'g')) = $1
       LIMIT 1`,
      [norm(po.itemName)]
    )).rows[0];
    const materialId = material?.id || null;

    /* Convert the received quantity into the unit stock is actually held in.
       A vendor invoices 5 MT; the warehouse counts 168 sheets. Adding 5 to a
       pieces column would be silently, badly wrong. */
    let stockQty = Number(receivedQuantity);
    let uomNote = null;
    if (material) {
      const poLine = (await client.query(
        `SELECT uom, uom_code FROM po_line_items WHERE "poId" = $1 ORDER BY sno LIMIT 1`, [poId]
      )).rows[0];
      const receivedUom = String(
        receivedUomCode || poLine?.uom_code || poLine?.uom || material.purchase_uom || material.base_uom || ''
      ).toLowerCase();
      const baseUom = String(material.base_uom || material.unit || '').toLowerCase();

      if (receivedUom && baseUom && receivedUom !== baseUom) {
        const uoms = await loadUoms(db);
        const itemUoms = (await client.query(
          'SELECT uom_code, qty_in_base FROM item_uom WHERE raw_material_id = $1', [materialId]
        )).rows;
        const conv = convert(receivedQuantity, receivedUom, baseUom, { uoms, item: material, itemUoms });
        if (conv.ok) {
          stockQty = conv.qty;
          uomNote = `${receivedQuantity} ${receivedUom} = ${conv.qty} ${baseUom}`;
        } else {
          // Refuse rather than silently add the wrong number.
          return await refuse(400,
            `Cannot convert ${receivedQuantity} ${receivedUom} into ${baseUom} for "${material.name}". ${conv.reason}`);
        }
      }
    }

    /* Find the stock row this receipt belongs to.

       This used to match on `"projectId" = $2`. Stock became company-level
       when migration 034 made that column nullable, and 97 of 105 rows now
       hold NULL — and in SQL `NULL = NULL` is not true, so the lookup missed
       every time and the branch below INSERTed a fresh row on every single
       receipt. Receive the same material six times and you have six rows,
       each holding a sixth of the stock, which is exactly what this database
       looks like. It also breaks the reorder level: a threshold set on one
       row is compared against a fraction of what is actually held.

       Matched on owner and material instead — the two things that actually
       identify a stock balance. */
    const ownerId = req.user?.id || null;
    const invResult = materialId
      ? await client.query(
        `SELECT * FROM inventory
          WHERE raw_material_id = $1 AND owner_id IS NOT DISTINCT FROM $2
          ORDER BY id LIMIT 1`,
        [materialId, ownerId])
      : await client.query(
        `SELECT * FROM inventory
          WHERE "itemName" = $1 AND raw_material_id IS NULL
            AND owner_id IS NOT DISTINCT FROM $2
          ORDER BY id LIMIT 1`,
        [po.itemName, ownerId]);

    let inventoryId;
    if (invResult.rows.length > 0) {
      inventoryId = invResult.rows[0].id;
      // Backfill the link opportunistically if this row predates the master.
      await client.query(
        `UPDATE inventory SET raw_material_id = COALESCE(raw_material_id, $2) WHERE id = $1`,
        [inventoryId, materialId]);
    } else {
      /* owner_id was not set here. Once the stock list became owner-scoped,
         a row without one is invisible to everybody — so goods you had just
         received vanished from Stock on hand, and /inventory/reconcile could
         not see them either, which is why it reported a clean database while
         a drifting row sat right there. */
      inventoryId = (await client.query(
        `INSERT INTO inventory ("projectId", "itemName", quantity, raw_material_id, uom, unit_cost, owner_id)
         VALUES ($1, $2, 0, $3, $4, $5, $6) RETURNING id`,
        [resolvedProjectId, po.itemName, materialId,
         material?.base_uom || material?.unit || null, po.unitPrice ?? null, ownerId]
      )).rows[0].id;
    }

    /* Through the ledger, not around it.

       The quantity used to move with a bare `UPDATE inventory SET quantity =
       quantity + $1`, writing no stock_movements row. So a receipt appeared
       nowhere in the item's history, and the balance stopped being explained
       by its own movements. `grn` has been a permitted movement_type in the
       schema since migration 034 and had never once been written. */
    await stock.move(client, {
      ownerId,
      inventoryId,
      rawMaterialId: materialId,
      itemName: po.itemName,
      quantity: stockQty,              // positive: goods coming in
      uom: material?.base_uom || material?.unit || null,
      unitCost: po.unitPrice ?? null,
      movementType: 'grn',
      refType: 'grn',
      refId: grnId,
      refNumber: `GRN-${String(grnId).padStart(5, '0')}`,
      note: uomNote,
      userId: req.user?.id,
    });

    // Step 5: Log activity
    await client.query(
      `INSERT INTO activities ("projectId", description, type) VALUES ($1, $2, $3)`,
      [resolvedProjectId, `GRN-${String(grnId).padStart(5, '0')} received for PO-${String(poId).padStart(4, '0')} (${receivedQuantity} units of ${po.itemName})`, 'GRN']
    );

    await client.query('COMMIT');
    notify('admins', { type: 'GRN_RECEIVED', title: `Goods received · GRN-${String(grnId).padStart(5, '0')}`, message: `${receivedQuantity} of ${po.itemName} received against PO-${poId}`, entityType: 'grn', entityId: grnId, link: `/grn/${grnId}/bill` });
    res.json({ message: 'GRN completed successfully', grnId, poId, stockQty, uomNote });
  } catch (err) {
    /* Everything or nothing — the GRN row, the PO status change and the
       stock movement stand or fall together. */
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
