const express = require('express');
const router = express.Router();
const db = require('../db');
const { notify } = require('../notify');

// List GRN records filtered by projectId
router.get('/', async (req, res) => {
  try {
    let query = 'SELECT * FROM grn';
    let params = [];
    if (req.query.projectId) {
      query += ' WHERE "projectId" = $1';
      params.push(req.query.projectId);
    }
    query += ' ORDER BY date DESC';
    const { rows } = await db.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create GRN: Record inward material, mark PO delivered, update inventory
router.post('/', async (req, res) => {
  const { projectId, workOrderId, poId, vehicleNumber, batchNumber, chainage, receivedQuantity } = req.body;

  if (!poId || receivedQuantity === undefined) {
    return res.status(400).json({ error: 'poId and receivedQuantity are required' });
  }

  try {
    // Step 1: Find PO
    const poResult = await db.query('SELECT * FROM purchase_orders WHERE id = $1', [poId]);
    const po = poResult.rows[0];
    if (!po) return res.status(404).json({ error: 'PO not found' });
    if (po.status === 'Delivered') return res.status(400).json({ error: 'PO is already delivered' });
    if (po.status !== 'Dispatched') return res.status(400).json({ error: 'PO must be Dispatched before receiving GRN' });

    const resolvedProjectId = projectId || po.projectId;
    // workOrderId is now optional — fall back to the PO's, else null (no WO).
    const resolvedWorkOrderId = workOrderId || po.workOrderId || null;

    // Step 2: Insert GRN record
    const grnResult = await db.query(
      `INSERT INTO grn ("projectId", "workOrderId", "poId", "vehicleNumber", "batchNumber", chainage, "receivedQuantity")
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [resolvedProjectId, resolvedWorkOrderId, poId, vehicleNumber || null, batchNumber || null, chainage || null, receivedQuantity]
    );
    const grnId = grnResult.rows[0].id;

    // Step 3: Mark PO as Delivered
    await db.query(`UPDATE purchase_orders SET status = 'Delivered' WHERE id = $1`, [poId]);

    /* Step 4: Add to inventory.
       Match on raw_material_id when we can resolve one — matching on the
       display name alone meant "MS Sheet" and "MS  Sheet" became two separate
       stock rows, and with no unique constraint the code picked one at random.
       Falls back to the name only for stock not yet linked to the master. */
    const norm = (s) => String(s || '').toLowerCase().replace(/[×xX]/g, 'x').replace(/[^a-z0-9]+/g, ' ').trim();

    const material = (await db.query(
      `SELECT id FROM raw_materials
       WHERE btrim(regexp_replace(lower(translate(name, '×X', 'xx')), '[^a-z0-9]+', ' ', 'g')) = $1
       LIMIT 1`,
      [norm(po.itemName)]
    )).rows[0];
    const materialId = material?.id || null;

    const invResult = materialId
      ? await db.query(
        `SELECT * FROM inventory WHERE raw_material_id = $1 AND "projectId" = $2`,
        [materialId, resolvedProjectId])
      : await db.query(
        `SELECT * FROM inventory WHERE "itemName" = $1 AND "projectId" = $2 AND raw_material_id IS NULL`,
        [po.itemName, resolvedProjectId]);

    if (invResult.rows.length > 0) {
      // Backfill the link opportunistically if this row predates the master.
      await db.query(
        `UPDATE inventory
         SET quantity = quantity + $1,
             raw_material_id = COALESCE(raw_material_id, $3)
         WHERE id = $2`,
        [receivedQuantity, invResult.rows[0].id, materialId]
      );
    } else {
      await db.query(
        `INSERT INTO inventory ("projectId", "itemName", quantity, raw_material_id) VALUES ($1, $2, $3, $4)`,
        [resolvedProjectId, po.itemName, receivedQuantity, materialId]
      );
    }

    // Step 5: Log activity
    await db.query(
      `INSERT INTO activities ("projectId", description, type) VALUES ($1, $2, $3)`,
      [resolvedProjectId, `GRN-${String(grnId).padStart(5, '0')} received for PO-${String(poId).padStart(4, '0')} (${receivedQuantity} units of ${po.itemName})`, 'GRN']
    );

    notify('admins', { type: 'GRN_RECEIVED', title: `Goods received · GRN-${String(grnId).padStart(5, '0')}`, message: `${receivedQuantity} of ${po.itemName} received against PO-${poId}`, entityType: 'grn', entityId: grnId, link: `/grn/${grnId}/bill` });
    res.json({ message: 'GRN completed successfully', grnId, poId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
