/* ══════════════════════════════════════════════════════════
   ProductionController — fabrication orders + material yield
   Loop: order -> consume raw -> output finished -> scrap/remnant
   Yield, reconciliation and cost/piece are computed here.
   ══════════════════════════════════════════════════════════ */
const db = require('../db');
const { isCrossTenant } = require('../shared/roles');
const { assertOwned } = require('../shared/ownerScope');
const stock = require('../shared/stock');
const { runList } = require('../shared/listQuery');

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

/* Next PROD- number.

   This counted rows WHERE "projectId" = $1. With projects now optional that
   would count zero every time for an order with no project, and hand out
   PROD-0001 forever. Numbering falls back to the owner's own series, which
   is what a business without projects would expect anyway.

   Still a COUNT, so still racy under concurrent creates — two jobs started
   in the same second can collide. That is a pre-existing issue across every
   document series here and wants a sequence per series; noted, not fixed
   in this change. */
async function nextProdNumber(projectId, ownerId) {
  const { rows } = projectId
    ? await db.query('SELECT COUNT(*) c FROM production_orders WHERE "projectId" = $1', [projectId])
    : await db.query('SELECT COUNT(*) c FROM production_orders WHERE owner_id = $1 AND "projectId" IS NULL', [ownerId ?? -1]);
  return `PROD-${String(parseInt(rows[0].c) + 1).padStart(4, '0')}`;
}

/* ── Orders ─────────────────────────────────────────────── */
exports.getOrders = async (req, res) => {
  const { projectId } = req.query;
  /* A project is optional now. Without one this lists every production order
     the caller owns rather than refusing — a fabricator running no projects
     could otherwise never open this screen. */
  try {
    /* With a projectId this is scoped to that project, which
       scopeProjectAccess has already checked the caller owns. Without one it
       falls back to owner scoping — "all my production" — rather than
       filtering on a NULL projectId, which would match nothing and render an
       empty screen that looks broken.

       The work order and (where the job came from a sale) the customer are
       joined in so the shop floor can search by "who is this for". */
    const params = [];
    const where = [];
    if (projectId) {
      params.push(projectId);
      where.push(`"projectId" = $${params.length}`);
    } else if (!isCrossTenant(req.user?.role)) {
      params.push(req.user?.id ?? -1);
      where.push(`owner_id = $${params.length}`);
    }
    const result = await runList(db, {
      table: `(SELECT po.*, wo.name AS work_order_name,
                      co.order_number AS customer_order_number, c.name AS customer_name
                 FROM production_orders po
                 LEFT JOIN work_orders wo ON wo.id = po."workOrderId"
                 LEFT JOIN customer_orders co ON co.id = po.customer_order_id
                 LEFT JOIN customers c ON c.id = co.customer_id) AS po`,
      query: req.query,
      searchColumns: ["prod_number", "product_name", "work_order_name", "customer_name", "customer_order_number", "status"],
      filterColumns: ["status", "workOrderId", "customer_order_id", "sku_id"],
      allowedSort: ["id", "prod_number", "product_name", "planned_qty", "status", "created_at", "updated_at"],
      defaultSort: 'id', defaultDir: 'DESC',
      where, params,
      /* `no_output` is the needs-attention count: an order that is not
         Completed and has nothing booked against it yet — material may be
         issued with nothing to show for it. Yield percentages are
         deliberately not averaged here; /production/summary already does
         that properly, weighted by input. */
      summary: `COUNT(*)::int AS count,
                COUNT(*) FILTER (WHERE status = 'Planned')::int AS planned,
                COUNT(*) FILTER (WHERE status = 'In Progress')::int AS in_progress,
                COUNT(*) FILTER (WHERE status = 'Completed')::int AS completed,
                COALESCE(SUM(planned_qty),0)::numeric AS planned_qty,
                COUNT(*) FILTER (WHERE COALESCE(status,'') <> 'Completed'
                                   AND NOT EXISTS (SELECT 1 FROM production_output o
                                                    WHERE o.production_order_id = po.id))::int AS no_output`,
    });

    // attach a compact yield summary per order
    const rows = Array.isArray(result) ? result : result.items;
    const withYield = await Promise.all(rows.map(async (o) => ({ ...o, yield: await computeYield(o.id) })));
    res.json(Array.isArray(result) ? withYield : { ...result, items: withYield });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createOrder = async (req, res) => {
  const { projectId, workOrderId, productName, plannedQty, outputUom, notes } = req.body;
  /* productName is the only genuine requirement. A production order does not
     need a project: "make 200 brackets for Apollo" is a complete instruction. */
  if (!productName) return res.status(400).json({ error: 'productName is required' });
  try {
    const prodNumber = await nextProdNumber(projectId, req.user?.id);
    const { rows } = await db.query(
      `INSERT INTO production_orders ("projectId", "workOrderId", prod_number, product_name, planned_qty, output_uom, notes, owner_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      /* owner_id was never set here. The column existed, nothing populated
         it, so every production order was unowned — invisible to owner
         scoping and the reason finished goods landed on a NULL-owner stock
         row while dispatch used the challan owner. */
      [projectId || null, workOrderId || null, prodNumber, productName, plannedQty || null, outputUom || 'nos', notes || null, req.user?.id || null]
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
    // Traceability: if this was made from a customer order, surface its number + customer.
    let sourceOrder = null;
    if (o.rows[0].customer_order_id) {
      const so = await db.query(
        `SELECT co.id, co.order_number, c.name AS customer_name
         FROM customer_orders co LEFT JOIN customers c ON c.id = co.customer_id
         WHERE co.id = $1`, [o.rows[0].customer_order_id]);
      sourceOrder = so.rows[0] || null;
    }
    res.json({
      ...o.rows[0],
      consumption: cons.rows,
      output: out.rows,
      scrap: scrap.rows,
      sourceOrder,
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
    if (!await assertOwned(db, req, res, 'production_orders', req.params.id, { columns: 'id' })) return;
    const r = await db.query(`UPDATE production_orders SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING id`, [status, req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteOrder = async (req, res) => {
  try {
    if (!await assertOwned(db, req, res, 'production_orders', req.params.id, { columns: 'id' })) return;
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
  /* Issuing material against another tenant's production order would draw
     down their stock. Checked before the transaction opens. */
  if (!await assertOwned(db, req, res, 'production_orders', orderId, { columns: 'id' })) return;
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
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const order = (await client.query(
      'SELECT id, owner_id, sku_id, prod_number, "projectId" FROM production_orders WHERE id = $1', [orderId]
    )).rows[0];
    if (!order) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Production order not found' }); }

    /* Find or create the stock row for this finished item. The first run of
       a new product has no inventory row yet, and refusing the output
       because of that would be the same "output goes nowhere" bug wearing a
       different hat. */
    const invRow = await stock.resolveInventoryRow(client, {
      ownerId: order.owner_id || req.user?.id || null,
      skuId: order.sku_id || null,
      itemName,
      uom: uom || 'nos',
      projectId: order.projectId || null,
      itemType: 'finished',
    });

    const r = await client.query(
      `INSERT INTO production_output (production_order_id, item_name, output_qty, uom, output_weight, inventory_id, stock_applied)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE) RETURNING id`,
      [orderId, itemName, outputQty || null, uom || 'nos', outputWeight || null, invRow ? invRow.id : null]
    );

    /* Finished goods ENTER STOCK here. They never did before: output was
       written to production_output and inventory was left untouched, so you
       could fabricate 200 cross-arms and the system would still report zero
       on hand. Raw material was tracked correctly the whole time, which is
       what made it easy to miss — the half that worked looked like the whole. */
    if (invRow && Number(outputQty) > 0) {
      await stock.stockIn(client, {
        ownerId: order.owner_id || req.user?.id || null,
        inventoryId: invRow.id,
        skuId: order.sku_id || null,
        itemName,
        quantity: outputQty,
        uom: uom || 'nos',
        movementType: 'production_output',
        refType: 'production_order',
        refId: Number(orderId),
        refNumber: order.prod_number || null,
        note: 'Finished goods from production',
        userId: req.user?.id,
      });
    }

    await client.query('COMMIT');
    res.json({ id: r.rows[0].id, inventoryId: invRow ? invRow.id : null, yield: await computeYield(orderId) });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
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
      const row = (await client.query('SELECT * FROM production_consumption WHERE id = $1', [lineId])).rows[0];
      if (row?.inventory_id) {
        // Material goes back on the shelf.
        await stock.stockIn(client, {
          ownerId: row.owner_id, inventoryId: row.inventory_id, itemName: row.item_name,
          quantity: row.consumed_qty, uom: row.uom, unitCost: row.unit_cost,
          movementType: 'adjustment', refType: 'production_consumption', refId: Number(lineId),
          note: 'Consumption line deleted — material returned to stock', userId: req.user?.id,
        });
      }
    }

    /* Output lines must reverse too. Now that output ADDS to stock, deleting
       one without taking it back out again would leave goods on hand that
       were never made — the mirror image of the bug just fixed, and harder
       to spot because the balance would be too HIGH rather than too low. */
    if (kind === 'output') {
      const row = (await client.query('SELECT * FROM production_output WHERE id = $1', [lineId])).rows[0];
      if (row?.inventory_id && row.stock_applied) {
        await stock.stockOut(client, {
          ownerId: row.owner_id, inventoryId: row.inventory_id, itemName: row.item_name,
          quantity: row.output_qty, uom: row.uom,
          movementType: 'adjustment', refType: 'production_output', refId: Number(lineId),
          note: 'Output line deleted — finished goods removed from stock', userId: req.user?.id,
        });
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
  const { projectId } = req.query;   // optional — see getOrders
  try {
    /* Same fallback as getOrders: with no project, summarise everything the
       caller owns rather than everything with a NULL projectId. */
    const { rows } = projectId
      ? await db.query('SELECT id FROM production_orders WHERE "projectId" = $1', [projectId])
      : isCrossTenant(req.user?.role)
        ? await db.query('SELECT id FROM production_orders')
        : await db.query('SELECT id FROM production_orders WHERE owner_id = $1', [req.user?.id ?? -1]);
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

// POST /production/from-order-item/:itemId — fabricate a customer-order line,
// pre-filling raw-material consumption from the SKU's Bill of Materials.
exports.createFromOrderItem = async (req, res) => {
  const { projectId } = req.body;   // optional — the order line is the context
  try {
    /* An order LINE carries no owner; it inherits from its order. Scoping on
       the line's own id is impossible, so the check joins up to the order —
       otherwise anyone could start production against a competitor's line
       and read the product and quantity back out of the result. */
    const item = (await db.query(
      `SELECT coi.* FROM customer_order_items coi
       JOIN customer_orders co ON co.id = coi.customer_order_id
       WHERE coi.id = $1${isCrossTenant(req.user?.role) ? '' : ' AND co.owner_id = $2'}`,
      isCrossTenant(req.user?.role) ? [req.params.itemId] : [req.params.itemId, req.user?.id]
    )).rows[0];
    if (!item) return res.status(404).json({ error: 'Order line not found' });
    const prodNumber = await nextProdNumber(projectId, req.user?.id);
    /* owner_id is set here for the same reason createOrder sets it: an
       unowned production order is invisible to owner scoping, and its
       finished goods land on a NULL-owner stock row while dispatch looks up
       the challan's owner — one item, two rows, and a ledger that balances
       against the wrong one. createOrder was fixed for this; this path was
       not, so every production order started from the "Make" button on an
       order line — the normal way to start one — was still unowned. */
    const po = await db.query(
      `INSERT INTO production_orders ("projectId", prod_number, product_name, planned_qty, output_uom, customer_order_id, sku_id, owner_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [projectId || null, prodNumber, item.description, item.quantity || null, item.unit || 'nos',
       item.customer_order_id, item.sku_id, req.user?.id || null]
    );
    const prodId = po.rows[0].id;
    let bomLines = 0;
    if (item.sku_id) {
      const bom = (await db.query('SELECT * FROM sku_bom WHERE sku_id = $1', [item.sku_id])).rows;
      for (const b of bom) {
        const consumedQty = round((b.qty_per_unit || 0) * (item.quantity || 0));
        await db.query(
          `INSERT INTO production_consumption (production_order_id, item_name, consumed_qty, uom) VALUES ($1,$2,$3,$4)`,
          [prodId, b.component_name, consumedQty, b.uom || 'kg']
        );
        bomLines++;
      }
    }
    await db.query(`UPDATE customer_orders SET status = 'In Procurement' WHERE id = $1 AND status = 'Open'`, [item.customer_order_id]);
    res.json({ id: prodId, prodNumber, bomLines });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.computeYield = computeYield;
