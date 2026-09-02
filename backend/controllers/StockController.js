/* ══════════════════════════════════════════════════════════
   StockController — the movement history behind every balance.

   "Why is stock 40 when it should be 60" was previously unanswerable:
   inventory held a running number and nothing that produced it. This serves
   the ledger, so a balance can always be traced back to the documents that
   made it.
   ══════════════════════════════════════════════════════════ */
const db = require('../db');
const stock = require('../shared/stock');
const { isCrossTenant } = require('../shared/roles');
const { runList } = require('../shared/listQuery');

// GET /inventory/movements
exports.movements = async (req, res) => {
  try {
    const where = [], params = [];
    if (!isCrossTenant(req.user?.role)) { params.push(req.user.id); where.push(`owner_id = $${params.length}`); }
    const result = await runList(db, {
      table: `(SELECT m.*,
                      CASE WHEN m.quantity >= 0 THEN 'in' ELSE 'out' END AS direction,
                      ABS(m.quantity) AS abs_quantity
                 FROM stock_movements m) AS m`,
      query: req.query,
      searchColumns: ['item_name', 'movement_type', 'ref_number', 'note'],
      filterColumns: ['movement_type', 'inventory_id', 'ref_type', 'direction'],
      allowedSort: ['id', 'created_at', 'item_name', 'quantity'],
      defaultSort: 'id', defaultDir: 'DESC',
      where, params,
      /* In and out kept apart. A net figure would hide whether a week saw
         no activity or a lot of it that happened to cancel out. */
      summary: `COUNT(*)::int AS count,
                COALESCE(SUM(quantity) FILTER (WHERE quantity > 0),0)::numeric AS total_in,
                COALESCE(ABS(SUM(quantity) FILTER (WHERE quantity < 0)),0)::numeric AS total_out,
                COALESCE(SUM(quantity),0)::numeric AS net,
                COUNT(DISTINCT inventory_id)::int AS items_touched`,
    });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// GET /inventory/:id/movements — the ledger for one stock row
exports.forItem = async (req, res) => {
  try {
    const params = [req.params.id];
    let scope = '';
    if (!isCrossTenant(req.user?.role)) { params.push(req.user.id); scope = ` AND owner_id = $${params.length}`; }
    const item = (await db.query(`SELECT * FROM inventory WHERE id = $1${scope}`, params)).rows[0];
    if (!item) return res.status(404).json({ error: 'Stock item not found' });

    const { rows } = await db.query(
      `SELECT * FROM stock_movements WHERE inventory_id = $1 ORDER BY id`, [req.params.id]);

    /* Running balance computed forward, so each line shows what stock was
       after it — which is what someone reconciling actually reads. */
    let running = 0;
    const ledger = rows.map(m => {
      running = Math.round((running + Number(m.quantity)) * 100) / 100;
      return { ...m, balance_after: running };
    });

    res.json({
      item,
      ledger,
      ledgerBalance: running,
      storedBalance: Number(item.quantity || 0),
      drift: Math.round((Number(item.quantity || 0) - running) * 100) / 100,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

/* POST /inventory — create a stock row, or adjust one, THROUGH THE LEDGER.

   There was no create at all: only PATCH on an existing row. So setting up
   opening stock meant writing rows directly, which bypasses stock_movements
   and produces permanent reconciliation drift on day one. It is also how the
   four live inventory rows came to have raw_material_id NULL — created
   outside every code path that would have linked them, which in turn is why
   the deficiency engine reports zero available however much stock is held.

   Linking to a material is REQUIRED for raw stock, not optional. An
   unlinked row is invisible to the engine, and a stock row the engine
   cannot see is worse than no row: it looks like the material is tracked.
   ══════════════════════════════════════════════════════════ */
exports.create = async (req, res) => {
  const {
    itemName, quantity, uom, rawMaterialId, skuId,
    unitCost, minStockLevel, category, location, projectId, note,
  } = req.body || {};

  if (!itemName && !rawMaterialId && !skuId) {
    return res.status(400).json({ error: 'Give the item a name, or link it to a material or product' });
  }
  const qty = Number(quantity) || 0;

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Resolve the name from the linked record when one is given, so a
    // material's stock row is always called what the material is called.
    let name = itemName;
    let baseUom = uom;
    if (rawMaterialId) {
      const m = (await client.query('SELECT name, base_uom FROM raw_materials WHERE id = $1', [rawMaterialId])).rows[0];
      if (!m) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Raw material not found' }); }
      name = name || m.name;
      baseUom = baseUom || m.base_uom;
    }
    if (skuId) {
      const s = (await client.query('SELECT name, unit FROM skus WHERE id = $1', [skuId])).rows[0];
      if (!s) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Product not found' }); }
      name = name || s.name;
      baseUom = baseUom || s.unit;
    }

    const row = await stock.resolveInventoryRow(client, {
      ownerId: req.user?.id,
      skuId: skuId || null,
      rawMaterialId: rawMaterialId || null,
      itemName: name,
      uom: baseUom || 'nos',
      projectId: projectId || null,
      itemType: skuId ? 'finished' : 'raw',
      unitCost,
    });

    // Optional attributes the ledger doesn't own.
    if (unitCost != null || minStockLevel != null || category || location) {
      await client.query(
        `UPDATE inventory SET
           unit_cost = COALESCE($1, unit_cost),
           min_stock_level = COALESCE($2, min_stock_level),
           category = COALESCE($3, category),
           location = COALESCE($4, location)
         WHERE id = $5`,
        [unitCost ?? null, minStockLevel ?? null, category || null, location || null, row.id]);
    }

    /* The quantity arrives as a MOVEMENT, not as a column write, so the
       ledger and the balance agree from the very first row. */
    if (qty !== 0) {
      await stock.stockIn(client, {
        ownerId: req.user?.id, inventoryId: row.id,
        skuId: skuId || null, rawMaterialId: rawMaterialId || null,
        itemName: name, quantity: qty, uom: baseUom, unitCost,
        movementType: 'opening',
        note: note || 'Opening stock',
        userId: req.user?.id,
      });
    }

    await client.query('COMMIT');
    const fresh = (await db.query('SELECT * FROM inventory WHERE id = $1', [row.id])).rows[0];
    res.status(201).json({ item: fresh });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
};

/* POST /inventory/:id/adjust — a counted correction, recorded as one.

   Stock counts differ from the system. Editing the number directly hides
   that a correction happened; a movement with a reason preserves it, which
   is the whole reason the ledger exists. */
exports.adjust = async (req, res) => {
  const { countedQuantity, reason } = req.body || {};
  if (countedQuantity == null) return res.status(400).json({ error: 'countedQuantity is required' });

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const params = [req.params.id];
    let scope = '';
    if (!isCrossTenant(req.user?.role)) { params.push(req.user.id); scope = ` AND owner_id = $${params.length}`; }
    const row = (await client.query(`SELECT * FROM inventory WHERE id = $1${scope}`, params)).rows[0];
    if (!row) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Stock item not found' }); }

    const delta = Number(countedQuantity) - Number(row.quantity || 0);
    if (Math.abs(delta) < 0.0001) {
      await client.query('ROLLBACK');
      return res.json({ success: true, delta: 0, message: 'Counted quantity already matches' });
    }

    await stock.move(client, {
      ownerId: row.owner_id, inventoryId: row.id,
      skuId: row.sku_id, rawMaterialId: row.raw_material_id,
      itemName: row.itemName, quantity: delta, uom: row.uom, unitCost: row.unit_cost,
      movementType: 'adjustment',
      note: reason || `Stock count correction (${Number(row.quantity || 0)} → ${Number(countedQuantity)})`,
      userId: req.user?.id,
    });

    await client.query('COMMIT');
    res.json({ success: true, delta, from: Number(row.quantity || 0), to: Number(countedQuantity) });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
};

/* GET /inventory/reconcile — does the ledger still equal the balance?
   A non-empty result means something wrote to inventory without going
   through shared/stock, which is the only way the two can disagree. */
exports.reconcile = async (req, res) => {
  try {
    const r = await stock.reconcile(db, req.user?.id, isCrossTenant(req.user?.role));
    res.json(r);
  } catch (e) { res.status(500).json({ error: e.message }); }
};
