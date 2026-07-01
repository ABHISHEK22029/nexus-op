const express = require('express');
const router = express.Router();
const db = require('../db');

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

    // Step 4: Add to Inventory (Upsert)
    const invResult = await db.query(
      `SELECT * FROM inventory WHERE "itemName" = $1 AND "projectId" = $2`,
      [po.itemName, resolvedProjectId]
    );

    if (invResult.rows.length > 0) {
      await db.query(`UPDATE inventory SET quantity = quantity + $1 WHERE id = $2`, [receivedQuantity, invResult.rows[0].id]);
    } else {
      await db.query(
        `INSERT INTO inventory ("projectId", "itemName", quantity) VALUES ($1, $2, $3)`,
        [resolvedProjectId, po.itemName, receivedQuantity]
      );
    }

    // Step 5: Log activity
    await db.query(
      `INSERT INTO activities ("projectId", description, type) VALUES ($1, $2, $3)`,
      [resolvedProjectId, `GRN-${String(grnId).padStart(5, '0')} received for PO-${String(poId).padStart(4, '0')} (${receivedQuantity} units of ${po.itemName})`, 'GRN']
    );

    res.json({ message: 'GRN completed successfully', grnId, poId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
