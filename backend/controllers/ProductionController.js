/* ══════════════════════════════════════════════════════════
   ProductionController — fabrication orders + material yield
   Loop: order -> consume raw -> output finished -> scrap/remnant
   Yield, reconciliation and cost/piece are computed here.
   ══════════════════════════════════════════════════════════ */
const db = require('../db');

const round = (n, d = 2) => (n == null ? null : Math.round(n * 10 ** d) / 10 ** d);

// Compute the full yield/costing picture for one production order.
async function computeYield(orderId) {
  const [cons, out, scrap] = await Promise.all([
    db.query('SELECT * FROM production_consumption WHERE production_order_id = $1', [orderId]),
    db.query('SELECT * FROM production_output WHERE production_order_id = $1', [orderId]),
    db.query('SELECT * FROM production_scrap WHERE production_order_id = $1', [orderId]),
  ]);

  const input        = cons.rows.reduce((s, r) => s + (r.consumed_qty || 0), 0);
  const materialCost = cons.rows.reduce((s, r) => s + (r.consumed_qty || 0) * (r.unit_cost || 0), 0);
  const outputWeight = out.rows.reduce((s, r) => s + (r.output_weight || 0), 0);
  const outputQty    = out.rows.reduce((s, r) => s + (r.output_qty || 0), 0);
  const sellable     = scrap.rows.filter(r => r.scrap_type !== 'remnant').reduce((s, r) => s + (r.scrap_qty || 0), 0);
  const remnant      = scrap.rows.filter(r => r.scrap_type === 'remnant').reduce((s, r) => s + (r.scrap_qty || 0), 0);
  const scrapRecovery= scrap.rows.filter(r => r.is_sold).reduce((s, r) => s + (r.sale_value || 0), 0);

  const loss = input - outputWeight - sellable - remnant;
  const pct  = (n) => (input > 0 ? round((n / input) * 100) : null);
  const netCost = materialCost - scrapRecovery;

  return {
    inputWeight:   round(input),
    outputWeight:  round(outputWeight),
    outputQty:     round(outputQty),
    sellableScrap: round(sellable),
    remnant:       round(remnant),
    unaccountedLoss: round(loss),
    yieldPct:     pct(outputWeight),          // finished ÷ input
    recoveredPct: pct(outputWeight + remnant), // finished + reusable ÷ input
    scrapPct:     pct(sellable),
    lossPct:      pct(loss),
    materialCost:  round(materialCost),
    scrapRecovery: round(scrapRecovery),
    netMaterialCost: round(netCost),
    costPerUnit:   outputQty > 0 ? round(netCost / outputQty) : null,
    balanced:      input > 0 ? Math.abs(loss) < input * 0.001 : true,
  };
}

/* ── Orders ─────────────────────────────────────────────── */
exports.getOrders = async (req, res) => {
  const { projectId } = req.query;
  if (!projectId) return res.status(400).json({ error: 'projectId required' });
  try {
    const { rows } = await db.query(
      `SELECT po.*, wo.name AS work_order_name
         FROM production_orders po
         LEFT JOIN work_orders wo ON wo.id = po."workOrderId"
        WHERE po."projectId" = $1 ORDER BY po.id DESC`,
      [projectId]
    );
    // attach a compact yield summary per order
    const withYield = await Promise.all(rows.map(async (o) => ({ ...o, yield: await computeYield(o.id) })));
    res.json(withYield);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createOrder = async (req, res) => {
  const { projectId, workOrderId, productName, plannedQty, outputUom, notes } = req.body;
  if (!projectId || !productName) return res.status(400).json({ error: 'projectId and productName are required' });
  try {
    const c = await db.query(`SELECT COUNT(*) FROM production_orders WHERE "projectId" = $1`, [projectId]);
    const prodNumber = `PROD-${String(parseInt(c.rows[0].count) + 1).padStart(4, '0')}`;
    const { rows } = await db.query(
      `INSERT INTO production_orders ("projectId", "workOrderId", prod_number, product_name, planned_qty, output_uom, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [projectId, workOrderId || null, prodNumber, productName, plannedQty || null, outputUom || 'nos', notes || null]
    );
    res.json({ id: rows[0].id, prodNumber });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getOrderById = async (req, res) => {
  try {
    const o = await db.query('SELECT * FROM production_orders WHERE id = $1', [req.params.id]);
    if (!o.rows[0]) return res.status(404).json({ error: 'Production order not found' });
    const [cons, out, scrap] = await Promise.all([
      db.query('SELECT * FROM production_consumption WHERE production_order_id = $1 ORDER BY id', [req.params.id]),
      db.query('SELECT * FROM production_output WHERE production_order_id = $1 ORDER BY id', [req.params.id]),
      db.query('SELECT * FROM production_scrap WHERE production_order_id = $1 ORDER BY id', [req.params.id]),
    ]);
    res.json({
      ...o.rows[0],
      consumption: cons.rows,
      output: out.rows,
      scrap: scrap.rows,
      yield: await computeYield(req.params.id),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateStatus = async (req, res) => {
  const { status } = req.body;
  const allowed = ['Planned', 'In Progress', 'Completed'];
  if (!allowed.includes(status)) return res.status(400).json({ error: `status must be one of ${allowed.join(', ')}` });
  try {
    const r = await db.query(`UPDATE production_orders SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id`, [status, req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteOrder = async (req, res) => {
  try {
    const r = await db.query('DELETE FROM production_orders WHERE id = $1', [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── Consumption (issue raw material, decrement stock) ──── */
exports.addConsumption = async (req, res) => {
  const { inventoryId, itemName, consumedQty, uom, unitCost } = req.body;
  const orderId = req.params.id;
  if (!itemName || consumedQty == null) return res.status(400).json({ error: 'itemName and consumedQty are required' });
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    let cost = unitCost;
    // If linked to a stock item, deduct from inventory and inherit its unit cost.
    if (inventoryId) {
      const inv = await client.query('SELECT * FROM inventory WHERE id = $1', [inventoryId]);
      if (!inv.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Inventory item not found' }); }
      if (cost == null) cost = inv.rows[0].unit_cost || 0;
      await client.query('UPDATE inventory SET quantity = quantity - $1 WHERE id = $2', [consumedQty, inventoryId]);
    }
    const r = await client.query(
      `INSERT INTO production_consumption (production_order_id, inventory_id, item_name, consumed_qty, uom, unit_cost)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [orderId, inventoryId || null, itemName, consumedQty, uom || 'kg', cost || 0]
    );
    await client.query('COMMIT');
    res.json({ id: r.rows[0].id, yield: await computeYield(orderId) });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
};

/* ── Output (finished goods) ────────────────────────────── */
exports.addOutput = async (req, res) => {
  const { itemName, outputQty, uom, outputWeight } = req.body;
  const orderId = req.params.id;
  if (!itemName) return res.status(400).json({ error: 'itemName is required' });
  try {
    const r = await db.query(
      `INSERT INTO production_output (production_order_id, item_name, output_qty, uom, output_weight)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [orderId, itemName, outputQty || null, uom || 'nos', outputWeight || null]
    );
    res.json({ id: r.rows[0].id, yield: await computeYield(orderId) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── Scrap / remnant ────────────────────────────────────── */
exports.addScrap = async (req, res) => {
  const { scrapType, scrapQty, uom, reason, saleValue, isSold } = req.body;
  const orderId = req.params.id;
  if (scrapQty == null) return res.status(400).json({ error: 'scrapQty is required' });
  try {
    const r = await db.query(
      `INSERT INTO production_scrap (production_order_id, scrap_type, scrap_qty, uom, reason, sale_value, is_sold)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [orderId, scrapType || 'sellable', scrapQty, uom || 'kg', reason || null, saleValue || 0, !!isSold]
    );
    res.json({ id: r.rows[0].id, yield: await computeYield(orderId) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Delete a single line (consumption/output/scrap); restores stock if consumption.
exports.deleteLine = async (req, res) => {
  const { kind, lineId } = req.params;
  const tables = { consumption: 'production_consumption', output: 'production_output', scrap: 'production_scrap' };
  const table = tables[kind];
  if (!table) return res.status(400).json({ error: 'invalid line kind' });
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    if (kind === 'consumption') {
      const row = await client.query('SELECT * FROM production_consumption WHERE id = $1', [lineId]);
      if (row.rows[0]?.inventory_id) {
        await client.query('UPDATE inventory SET quantity = quantity + $1 WHERE id = $2', [row.rows[0].consumed_qty, row.rows[0].inventory_id]);
      }
    }
    const r = await client.query(`DELETE FROM ${table} WHERE id = $1 RETURNING production_order_id`, [lineId]);
    await client.query('COMMIT');
    if (!r.rowCount) return res.status(404).json({ error: 'Line not found' });
    res.json({ success: true, yield: await computeYield(r.rows[0].production_order_id) });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
};

// Project-level rollup for dashboard tiles.
exports.getSummary = async (req, res) => {
  const { projectId } = req.query;
  if (!projectId) return res.status(400).json({ error: 'projectId required' });
  try {
    const { rows } = await db.query('SELECT id FROM production_orders WHERE "projectId" = $1', [projectId]);
    const ys = await Promise.all(rows.map(o => computeYield(o.id)));
    const withInput = ys.filter(y => y.inputWeight > 0);
    const avgYield = withInput.length ? round(withInput.reduce((s, y) => s + (y.yieldPct || 0), 0) / withInput.length) : null;
    const scrapRecovered = round(ys.reduce((s, y) => s + (y.scrapRecovery || 0), 0));
    const totalInput = round(ys.reduce((s, y) => s + (y.inputWeight || 0), 0));
    res.json({ orders: rows.length, avgYieldPct: avgYield, scrapRecovered, totalInputWeight: totalInput });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.computeYield = computeYield;
