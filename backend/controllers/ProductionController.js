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
const { assertRefs } = require('../shared/ownedRefs');
const { convert, loadUoms } = require('../shared/uom');
const { allocate } = require('../shared/docSeries');

const round = (n, d = 2) => (n == null ? null : Math.round(n * 10 ** d) / 10 ** d);

/* The spellings people type for the units in the uom table. */
const UNIT_ALIASES = {
  kgs: 'kg', kilo: 'kg', kilos: 'kg', kilogram: 'kg', kilograms: 'kg',
  gm: 'g', gms: 'g', gram: 'g', grams: 'g',
  t: 'mt', ton: 'mt', tons: 'mt', tonne: 'mt', tonnes: 'mt', mts: 'mt',
  qtl: 'quintal', quintals: 'quintal',
  pc: 'nos', pcs: 'nos', piece: 'nos', pieces: 'nos', no: 'nos', 'nos.': 'nos', numbers: 'nos',
};
const unitCode = (u) => { const k = String(u || '').trim().toLowerCase(); return UNIT_ALIASES[k] || k; };

/* The material a consumption line came from, for converting its quantity:
   sheets issued by the piece have a weight per piece, or dimensions to
   work one out from. */
const materialOf = (r) => ({
  base_uom: r.rm_base_uom, weight_per_piece_kg: r.rm_weight_per_piece_kg,
  length_mm: r.rm_length_mm, width_mm: r.rm_width_mm, thickness_mm: r.rm_thickness_mm, density_kg_m3: r.rm_density_kg_m3,
});

/* One quantity in another unit, for one material; null when it cannot be
   worked out — never a guess. */
function inUnit(qty, from, to, { uoms, item = {}, itemUoms = [] }) {
  const f = unitCode(from || to), t = unitCode(to || from);
  if (f === t) return Number(qty) || 0;
  const c = convert(Number(qty) || 0, f, t, { uoms, item: { ...item, base_uom: unitCode(item.base_uom) }, itemUoms });
  return c.ok ? c.qty : null;
}

/* The yield arithmetic, over rows already in memory.

   Kept separate from the fetching so the single-order and the many-order
   paths compute yield the same way by construction, rather than by two
   people remembering to keep them in step.

   Material issued is a WEIGHT, set against the finished weight. Every
   line's quantity used to be added up whatever its unit, so 500 bolts in
   nos went in beside 180 kg of sheet as 680 "kg" and yield read absurd
   figures. Each line now carries `kg` (computeYields): its weight, or null
   when it has none — those still count towards cost, and are counted in
   `unweighedLines` so the screen can say why they are left out. */
function yieldFrom(consRows, outRows, scrapRows) {
  const kgOf         = (r) => (r.kg !== undefined ? r.kg : unitCode(r.uom || 'kg') === 'kg' ? Number(r.consumed_qty) || 0 : null);
  const input        = consRows.reduce((s, r) => s + (kgOf(r) || 0), 0);
  const unweighed    = consRows.filter(r => kgOf(r) == null).length;
  const materialCost = consRows.reduce((s, r) => s + (r.consumed_qty || 0) * (r.unit_cost || 0), 0);
  const outputWeight = outRows.reduce((s, r) => s + (r.output_weight || 0), 0);
  const outputQty    = outRows.reduce((s, r) => s + (r.output_qty || 0), 0);
  const sellable     = scrapRows.filter(r => r.scrap_type !== 'remnant').reduce((s, r) => s + (r.scrap_qty || 0), 0);
  const remnant      = scrapRows.filter(r => r.scrap_type === 'remnant').reduce((s, r) => s + (r.scrap_qty || 0), 0);
  const scrapRecovery= scrapRows.filter(r => r.is_sold).reduce((s, r) => s + (r.sale_value || 0), 0);

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
    unweighedLines: unweighed,
  };
}

/* Consumption lines with what converting them needs: the stock row's
   material and that material's own unit factors. */
async function consumptionWithMaterial(where, params) {
  const rows = (await db.query(
    `SELECT pc.*, i.raw_material_id, i.owner_id AS stock_owner,
            COALESCE(rm.base_uom, rm.unit) AS rm_base_uom, rm.weight_per_piece_kg AS rm_weight_per_piece_kg,
            rm.length_mm AS rm_length_mm, rm.width_mm AS rm_width_mm, rm.thickness_mm AS rm_thickness_mm,
            rm.density_kg_m3 AS rm_density_kg_m3
       FROM production_consumption pc
       LEFT JOIN inventory i ON i.id = pc.inventory_id
       LEFT JOIN raw_materials rm ON rm.id = i.raw_material_id
      WHERE ${where} ORDER BY pc.id`, params)).rows;
  const ids = [...new Set(rows.map(r => r.raw_material_id).filter(Boolean))];
  const itemUoms = {};
  if (ids.length) {
    (await db.query('SELECT raw_material_id, uom_code, qty_in_base FROM item_uom WHERE raw_material_id = ANY($1)', [ids]))
      .rows.forEach(r => { (itemUoms[r.raw_material_id] ||= []).push(r); });
  }
  const uoms = await loadUoms(db);
  for (const r of rows) {
    r.kg = inUnit(r.consumed_qty, r.uom || 'kg', 'kg', { uoms, item: materialOf(r), itemUoms: itemUoms[r.raw_material_id] || [] });
  }
  return { rows, uoms, itemUoms };
}

/* Yields for MANY production orders in three queries, not three per order.

   The list endpoint called computeYield() once per row, and each call ran
   three queries — so a 25-row page issued 75, and /production/summary ran
   three for EVERY order in the business: 549 on a database with 183 of them.
   Measured at 4.9s median and 7.9s worst for one page of production orders,
   which is the slowest screen in the product by a wide margin.

   Returns a Map of orderId -> yield. */
async function computeYields(orderIds) {
  /* Numbers, not strings. The detail screen passes req.params.id ("5") and
     the rows come back keyed by the integer 5, so the lookup below found no
     rows and every production order's yield read as nothing issued, nothing
     made — dashes everywhere and "0 kg, balanced" beside real entries. */
  const ids = [...new Set(orderIds.map(Number))].filter(n => Number.isInteger(n) && n > 0);
  const out = new Map();
  if (!ids.length) return out;

  const [cons, outp, scrap] = await Promise.all([
    consumptionWithMaterial('pc.production_order_id = ANY($1)', [ids]),
    db.query('SELECT * FROM production_output      WHERE production_order_id = ANY($1)', [ids]),
    db.query('SELECT * FROM production_scrap       WHERE production_order_id = ANY($1)', [ids]),
  ]);

  const bucket = (rows) => {
    const m = new Map();
    for (const r of rows) {
      const k = r.production_order_id;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    }
    return m;
  };
  const c = bucket(cons.rows), o = bucket(outp.rows), s = bucket(scrap.rows);
  for (const id of ids) {
    out.set(id, yieldFrom(c.get(id) || [], o.get(id) || [], s.get(id) || []));
  }
  return out;
}

/* The material a job is PLANNED to use — the bill of materials "Make"
   copied in — each line with what has been issued against it and the
   stock it can be issued from. Planning moves nothing: the store issues
   against these lines through addConsumption, which takes the stock.

   Issued counts a line from stock of the same material, and a typed-in
   line of the same name (it was recorded as used, from stock or not —
   leaving it out would invite issuing it a second time). */
async function planFor(order, cons, orgId) {
  const lines = (await db.query(
    `SELECT p.*, COALESCE(rm.base_uom, rm.unit) AS rm_base_uom, rm.weight_per_piece_kg AS rm_weight_per_piece_kg,
            rm.length_mm AS rm_length_mm, rm.width_mm AS rm_width_mm, rm.thickness_mm AS rm_thickness_mm,
            rm.density_kg_m3 AS rm_density_kg_m3
       FROM production_material_plan p LEFT JOIN raw_materials rm ON rm.id = p.raw_material_id
      WHERE p.production_order_id = $1 ORDER BY p.sort_order, p.id`, [order.id])).rows;
  if (!lines.length) return [];

  const owner = order.owner_id ?? orgId ?? null;
  const ids = [...new Set(lines.map(l => l.raw_material_id).filter(Boolean))];
  const names = [...new Set(lines.filter(l => !l.raw_material_id).map(l => String(l.item_name).toLowerCase()))];
  const itemUoms = {};
  if (ids.length) {
    (await db.query('SELECT raw_material_id, uom_code, qty_in_base FROM item_uom WHERE raw_material_id = ANY($1)', [ids]))
      .rows.forEach(r => { (itemUoms[r.raw_material_id] ||= []).push(r); });
  }
  /* This company's stock of each material: rows holding something first,
     the main stock before a named stock list. */
  const stockRows = (await db.query(
    `SELECT i.id, i."itemName", i.quantity, i.uom, i.unit_cost, i.raw_material_id, sl.name AS stock_list_name
       FROM inventory i LEFT JOIN stock_lists sl ON sl.id = i.stock_list_id
      WHERE i.owner_id IS NOT DISTINCT FROM $1
        AND (i.raw_material_id = ANY($2::int[]) OR (i.raw_material_id IS NULL AND LOWER(i."itemName") = ANY($3::text[])))
      ORDER BY (i.quantity > 0) DESC, (i.stock_list_id IS NULL) DESC, i.quantity DESC, i.id`,
    [owner, ids, names])).rows;

  const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
  return lines.map(l => {
    const ctx = { uoms: cons.uoms, item: materialOf(l), itemUoms: itemUoms[l.raw_material_id] || [] };
    const against = cons.rows.filter(r => (l.raw_material_id && r.raw_material_id === l.raw_material_id)
      || (!r.inventory_id && same(r.item_name, l.item_name))
      || (!l.raw_material_id && same(r.item_name, l.item_name)));
    let issued = 0, unconverted = 0;
    for (const r of against) {
      const q = inUnit(r.consumed_qty, r.uom || l.uom, l.uom, ctx);
      if (q == null) unconverted++; else issued += q;
    }
    const remaining = Math.max(0, Number(l.planned_qty) - issued);
    const s = stockRows.find(r => (l.raw_material_id ? r.raw_material_id === l.raw_material_id : same(r.itemName, l.item_name)));
    const remainingInStockUnit = s ? inUnit(remaining, l.uom, s.uom || l.uom, ctx) : null;
    return {
      id: l.id, raw_material_id: l.raw_material_id, item_name: l.item_name, uom: l.uom,
      planned_qty: round(Number(l.planned_qty), 4),
      issued_qty: round(issued, 4),
      remaining_qty: round(remaining, 4),
      issued_unconverted_lines: unconverted,
      stock: s ? { inventoryId: s.id, itemName: s.itemName, quantity: Number(s.quantity) || 0, uom: s.uom, unitCost: s.unit_cost, stockListName: s.stock_list_name || null } : null,
      /* What the Issue button offers: the rest of the plan, in the stock
         row's own unit, no more than is on the shelf. */
      suggested_issue_qty: s && remainingInStockUnit != null
        ? round(Math.max(0, Math.min(remainingInStockUnit, Number(s.quantity) || 0)), 4) : null,
    };
  });
}

// One order's yield. Still used by the detail screen, where one is all you need.
async function computeYield(orderId) {
  return (await computeYields([orderId])).get(Number(orderId))
      || yieldFrom([], [], []);
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
async function nextProdNumber(exec, ownerId) {
  return allocate(exec, { ownerId: ownerId ?? null, docType: 'production_order' });
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
      params.push(req.user?.orgId ?? -1);
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
    const yields = await computeYields(rows.map(o => o.id));
    const withYield = rows.map(o => ({ ...o, yield: yields.get(o.id) }));
    res.json(Array.isArray(result) ? withYield : { ...result, items: withYield });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createOrder = async (req, res) => {
  const { projectId, workOrderId, plannedQty, outputUom, notes, skuId } = req.body;
  let { productName } = req.body;
  /* A product from the list, or a name typed in. Typed in only, the
     finished goods went into stock under that name, and a challan made from
     a customer order — which looks for the PRODUCT — could not find them. */
  const sku = Number(skuId) > 0 ? Number(skuId) : null;
  if (!productName && !sku) return res.status(400).json({ error: 'Say what is being made: pick a product or type its name.' });
  if (plannedQty != null && plannedQty !== '' && (!Number.isFinite(Number(plannedQty)) || Number(plannedQty) <= 0)) {
    return res.status(400).json({ error: 'The quantity to make must be more than zero.' });
  }
  try {
    /* The production list shows the work order's name; it must be yours. */
    if (!await assertRefs(db, req, res, { work_orders: [workOrderId], skus: sku ? [sku] : [] })) return;
    let unit = outputUom;
    if (sku) {
      const p = (await db.query('SELECT name, unit FROM skus WHERE id = $1', [sku])).rows[0];
      productName = productName || p?.name;
      unit = unit || p?.unit;
    }
    const prodNumber = await nextProdNumber(db, req.user?.orgId);
    const { rows } = await db.query(
      `INSERT INTO production_orders ("projectId", "workOrderId", prod_number, product_name, planned_qty, output_uom, notes, owner_id, sku_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      /* owner_id was never set here. The column existed, nothing populated
         it, so every production order was unowned — invisible to owner
         scoping and the reason finished goods landed on a NULL-owner stock
         row while dispatch used the challan owner. */
      [projectId || null, workOrderId || null, prodNumber, productName, plannedQty || null, unit || 'nos', notes || null, req.user?.orgId || null, sku]
    );
    res.json({ id: rows[0].id, prodNumber });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getOrderById = async (req, res) => {
  /* Yours only: this route had no ownership check, so any signed-in user
     could read another company's production order by its id. */
  if (!await assertOwned(db, req, res, 'production_orders', req.params.id, { columns: 'id' })) return;
  try {
    const o = await db.query('SELECT * FROM production_orders WHERE id = $1', [req.params.id]);
    if (!o.rows[0]) return res.status(404).json({ error: 'Production order not found' });
    const [cons, out, scrap] = await Promise.all([
      consumptionWithMaterial('pc.production_order_id = $1', [req.params.id]),
      db.query('SELECT * FROM production_output WHERE production_order_id = $1 ORDER BY id', [req.params.id]),
      db.query('SELECT * FROM production_scrap WHERE production_order_id = $1 ORDER BY id', [req.params.id]),
    ]);
    const plan = await planFor(o.rows[0], cons, req.user?.orgId);
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
      plan,
      consumption: cons.rows,
      output: out.rows,
      scrap: scrap.rows,
      sourceOrder,
      yield: yieldFrom(cons.rows, out.rows, scrap.rows),
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
    if (!await assertOwned(db, req, res, 'production_orders', req.params.id, { columns: 'id, prod_number' })) return;
    /* Not while stock moved for it. Its lines went with it and the material
       issued and goods made stayed moved, with nothing to say why. Removing
       each line puts its stock back; then the job can go. */
    const { rows: [m] } = await db.query(
      `SELECT (SELECT COUNT(*) FROM production_consumption WHERE production_order_id = $1 AND inventory_id IS NOT NULL)::int AS issued,
              (SELECT COUNT(*) FROM production_output WHERE production_order_id = $1 AND stock_applied)::int AS made`, [req.params.id]);
    if (m.issued || m.made) {
      return res.status(409).json({ error: `Material was issued or goods were made on this job, so it can't be deleted yet. Remove those lines first — that puts the stock back — then delete it.` });
    }
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
  const qty = Number(consumedQty);
  if (!Number.isFinite(qty) || qty <= 0) return res.status(400).json({ error: 'The quantity issued must be a number above 0.' });
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    let cost = unitCost;
    /* Linked to a stock row, the issue comes off stock — through the ledger,
       as every stock movement does, so the stock-on-hand screen and the
       movement history agree. It used to be a bare UPDATE with no ledger
       row, and the screen never sent a stock row at all, so material issued
       to production never left stock. */
    let inv = null;
    if (inventoryId) {
      inv = (await client.query('SELECT * FROM inventory WHERE id = $1 FOR UPDATE', [inventoryId])).rows[0];
      const theirs = inv && !isCrossTenant(req.user?.role)
        && String(inv.owner_id) !== String(req.user?.orgId ?? req.user?.id);
      if (!inv || theirs) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Inventory item not found' }); }
      const onHand = Number(inv.quantity) || 0;
      if (qty > onHand + 1e-9) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: `Only ${onHand} ${inv.uom || uom || 'kg'} of ${inv.itemName} is in stock. Receive the material first, or issue less.`,
          onHand,
        });
      }
      if (cost == null || cost === '') cost = inv.unit_cost || 0;
    }
    const r = await client.query(
      `INSERT INTO production_consumption (production_order_id, inventory_id, item_name, consumed_qty, uom, unit_cost)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [orderId, inventoryId || null, itemName, qty, uom || inv?.uom || 'kg', cost || 0]
    );
    if (inv) {
      const prod = (await client.query('SELECT prod_number FROM production_orders WHERE id = $1', [orderId])).rows[0];
      await stock.stockOut(client, {
        ownerId: inv.owner_id, inventoryId: inv.id, rawMaterialId: inv.raw_material_id, skuId: inv.sku_id,
        itemName: inv.itemName || itemName, quantity: qty, uom: inv.uom || uom, unitCost: cost || 0,
        movementType: 'production_consumption', refType: 'production_consumption', refId: r.rows[0].id,
        refNumber: prod?.prod_number || null, note: 'Issued to production', userId: req.user?.id,
      });
    }
    await client.query('COMMIT');
    res.json({ id: r.rows[0].id, yield: await computeYield(orderId) });
  } catch (err) {
    await client.query('ROLLBACK');
    /* Someone issued the same stock a moment earlier: the check above read
       a balance that the ledger then refused to take below zero. */
    if (stock.isShortStock(err)) return res.status(409).json({ error: `${err.message} Receive the material first, or issue less.`, onHand: err.detail.onHand });
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
};

/* ── Output (finished goods) ────────────────────────────── */
exports.addOutput = async (req, res) => {
  const { outputQty, uom, outputWeight } = req.body;
  let { itemName } = req.body;
  const orderId = req.params.id;
  /* Made means more than zero. A negative "produced" raised what the
     requirements thought was still to make and turned cost per unit
     negative. */
  if (!Number.isFinite(Number(outputQty)) || Number(outputQty) <= 0) {
    return res.status(400).json({ error: 'Enter how many were made — more than zero.' });
  }
  if (outputWeight != null && outputWeight !== '' && (!Number.isFinite(Number(outputWeight)) || Number(outputWeight) < 0)) {
    return res.status(400).json({ error: 'The weight must be a number, 0 or more.' });
  }
  /* Yours only: this route had no ownership check, so any signed-in user
     could add output to another company's production order by its id. */
  if (!await assertOwned(db, req, res, 'production_orders', orderId, { columns: 'id' })) return;
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const order = (await client.query(
      'SELECT id, owner_id, sku_id, prod_number, product_name, "projectId" FROM production_orders WHERE id = $1 FOR UPDATE', [orderId]
    )).rows[0];
    if (!order) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Production order not found' }); }
    /* What the job makes, unless the screen named something else. */
    itemName = String(itemName || '').trim() || order.product_name;
    if (!itemName) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Say what was made.' }); }
    /* Finished goods carry the material that went into them. Without a cost
       they entered stock at ₹0, so stock value missed every finished item.
       Material issued so far, spread over everything made so far. */
    const { rows: [c] } = await client.query(
      `SELECT COALESCE((SELECT SUM(consumed_qty * COALESCE(unit_cost, 0)) FROM production_consumption WHERE production_order_id = $1), 0) AS material,
              COALESCE((SELECT SUM(output_qty) FROM production_output WHERE production_order_id = $1), 0) AS made`, [orderId]);
    const madeAfter = Number(c.made) + Number(outputQty);
    const unitCost = Number(c.material) > 0 && madeAfter > 0 ? Math.round((Number(c.material) / madeAfter) * 10000) / 10000 : null;

    /* Find or create the stock row for this finished item. The first run of
       a new product has no inventory row yet, and refusing the output
       because of that would be the same "output goes nowhere" bug wearing a
       different hat. */
    const invRow = await stock.resolveInventoryRow(client, {
      ownerId: order.owner_id || req.user?.orgId || null,
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
        ownerId: order.owner_id || req.user?.orgId || null,
        inventoryId: invRow.id,
        skuId: order.sku_id || null,
        itemName,
        quantity: outputQty,
        uom: uom || 'nos',
        unitCost,
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
  if (!Number.isFinite(Number(scrapQty)) || Number(scrapQty) <= 0) return res.status(400).json({ error: 'Enter the scrap quantity — more than zero.' });
  if (saleValue != null && saleValue !== '' && (!Number.isFinite(Number(saleValue)) || Number(saleValue) < 0)) {
    return res.status(400).json({ error: 'The sale value must be a number, 0 or more.' });
  }
  /* Yours only: this route had no ownership check, so any signed-in user
     could add scrap to another company's production order by its id. */
  if (!await assertOwned(db, req, res, 'production_orders', orderId, { columns: 'id' })) return;
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
  if (!/^\d+$/.test(String(lineId))) return res.status(400).json({ error: 'invalid line id' });
  /* The line's production order must be yours. Without this, any signed-in
     user could delete another company's lines by id — and a consumption
     line's delete puts material back on that company's shelf. */
  const parent = (await db.query(`SELECT production_order_id FROM ${table} WHERE id = $1`, [lineId]).catch(() => ({ rows: [] }))).rows[0];
  if (!parent) return res.status(404).json({ error: 'Line not found' });
  if (!await assertOwned(db, req, res, 'production_orders', parent.production_order_id, { columns: 'id' })) return;
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    /* Locked, and gone-already checked first: a double click on Remove put
       the material back on the shelf twice. */
    const still = (await client.query(`SELECT id FROM ${table} WHERE id = $1 FOR UPDATE`, [lineId])).rows[0];
    if (!still) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'That line has already been removed.' }); }
    if (kind === 'consumption') {
      /* The stock row's owner: production_consumption has no owner_id of its
         own, and reading row.owner_id wrote the return with no organisation. */
      const row = (await client.query(
        `SELECT pc.*, i.owner_id AS stock_owner FROM production_consumption pc
           LEFT JOIN inventory i ON i.id = pc.inventory_id WHERE pc.id = $1`, [lineId])).rows[0];
      if (row?.inventory_id) {
        // Material goes back on the shelf.
        await stock.stockIn(client, {
          ownerId: row.stock_owner, inventoryId: row.inventory_id, itemName: row.item_name,
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
      /* The owner from the stock row: production_output has no owner of its
         own, so the reversal was written with none and vanished from the
         company's stock history. */
      const row = (await client.query(
        `SELECT po.*, i.owner_id AS stock_owner, i.sku_id AS stock_sku FROM production_output po
           LEFT JOIN inventory i ON i.id = po.inventory_id WHERE po.id = $1`, [lineId])).rows[0];
      if (row?.inventory_id && row.stock_applied) {
        await stock.stockOut(client, {
          ownerId: row.stock_owner, inventoryId: row.inventory_id, skuId: row.stock_sku || null, itemName: row.item_name,
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
    /* Output that has already left — dispatched, or used — cannot be
       taken back off the shelf: it is not on it. */
    if (stock.isShortStock(err)) {
      const d = err.detail, u = d.uom ? ` ${d.uom}` : '';
      return res.status(409).json({ error: `These goods have already left stock: ${d.onHand}${u} of ${d.itemName} is left, and this line made ${d.needed}${u}. Pull back the challan that sent them first, or correct the count on Stock on hand.` });
    }
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
        : await db.query('SELECT id FROM production_orders WHERE owner_id = $1', [req.user?.orgId ?? -1]);
    const ys = [...(await computeYields(rows.map(o => o.id))).values()];
    /* Weighted by what went in, and only jobs that have made something:
       a plain average counted every job still in progress as 0%. */
    const withInput = ys.filter(y => y.inputWeight > 0 && Number(y.yieldPct) > 0);
    const inSum = withInput.reduce((s, y) => s + y.inputWeight, 0);
    const avgYield = inSum > 0 ? round(withInput.reduce((s, y) => s + y.yieldPct * y.inputWeight, 0) / inSum) : null;
    const scrapRecovered = round(ys.reduce((s, y) => s + (y.scrapRecovery || 0), 0));
    const totalInput = round(ys.reduce((s, y) => s + (y.inputWeight || 0), 0));
    res.json({ orders: rows.length, avgYieldPct: avgYield, scrapRecovered, totalInputWeight: totalInput });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /production/from-order-item/:itemId — fabricate a customer-order line,
// planning its raw material from the SKU's Bill of Materials.
exports.createFromOrderItem = async (req, res) => {
  const { projectId } = req.body;   // optional — the order line is the context
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    /* An order LINE carries no owner; it inherits from its order. Scoping on
       the line's own id is impossible, so the check joins up to the order —
       otherwise anyone could start production against a competitor's line
       and read the product and quantity back out of the result. */
    const item = (await client.query(
      `SELECT coi.* FROM customer_order_items coi
       JOIN customer_orders co ON co.id = coi.customer_order_id
       WHERE coi.id = $1${isCrossTenant(req.user?.role) ? '' : ' AND co.owner_id = $2'}`,
      isCrossTenant(req.user?.role) ? [req.params.itemId] : [req.params.itemId, req.user?.orgId]
    )).rows[0];
    if (!item) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Order line not found' }); }
    /* Make, again? Every press opened another job for the full quantity,
       and the second job's plan held the same material a second time. A
       line that already has a job is said, and made again only when asked;
       a new job plans what is not already planned. */
    const others = (await client.query(
      `SELECT prod_number, status, COALESCE(planned_qty, 0) AS planned FROM production_orders
        WHERE customer_order_id = $1 AND owner_id IS NOT DISTINCT FROM $2
          AND (($3::int IS NOT NULL AND sku_id = $3) OR ($3::int IS NULL AND LOWER(TRIM(product_name)) = LOWER(TRIM($4))))
        ORDER BY id`, [item.customer_order_id, req.user?.orgId ?? null, item.sku_id || null, item.description])).rows;
    const already = others.reduce((s, o) => s + Number(o.planned), 0);
    const asked = Number(req.body?.quantity);
    const qty = asked > 0 ? asked : Math.max(0, (Number(item.quantity) || 0) - already);
    if (others.length && !req.body?.again) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: `${others.map(o => `${o.prod_number} (${o.status})`).join(', ')} already make${others.length === 1 ? 's' : ''} this line${already ? ` — ${already} of ${Number(item.quantity) || 0} planned` : ''}. Open ${others.length === 1 ? 'it' : 'them'}, or start another job for the rest.`,
        existing: others.map(o => o.prod_number), remaining: Math.max(0, (Number(item.quantity) || 0) - already),
      });
    }
    if (!(qty > 0)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: `All ${Number(item.quantity) || 0} on this line are already planned (${others.map(o => o.prod_number).join(', ')}).` });
    }
    const prodNumber = await nextProdNumber(client, req.user?.orgId);
    /* owner_id is set here for the same reason createOrder sets it: an
       unowned production order is invisible to owner scoping, and its
       finished goods land on a NULL-owner stock row while dispatch looks up
       the challan's owner — one item, two rows, and a ledger that balances
       against the wrong one. createOrder was fixed for this; this path was
       not, so every production order started from the "Make" button on an
       order line — the normal way to start one — was still unowned. */
    const po = await client.query(
      `INSERT INTO production_orders ("projectId", prod_number, product_name, planned_qty, output_uom, customer_order_id, sku_id, owner_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [projectId || null, prodNumber, item.description, qty, item.unit || 'nos',
       item.customer_order_id, item.sku_id, req.user?.orgId || null]
    );
    const prodId = po.rows[0].id;
    /* The bill of materials is the PLAN, not an issue. It was written into
       production_consumption — material issued — so the job showed 800 kg
       issued that never left the shelf, at ₹0, and the real issue from
       stock then counted it twice. The store issues against these lines
       on the job's screen, and that is when stock moves (migration 077). */
    let bomLines = 0;
    if (item.sku_id) {
      const bom = (await client.query(
        'SELECT *, COALESCE(uom_code, uom) AS unit FROM sku_bom WHERE sku_id = $1 ORDER BY id', [item.sku_id])).rows;
      for (const b of bom) {
        await client.query(
          `INSERT INTO production_material_plan (production_order_id, raw_material_id, item_name, planned_qty, uom, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [prodId, b.raw_material_id || null, b.component_name, round((Number(b.qty_per_unit) || 0) * qty, 4),
           b.unit || 'kg', bomLines++]
        );
      }
    }
    /* It is being made, which is what the order now says. */
    await client.query(`UPDATE customer_orders SET status = 'In Production' WHERE id = $1 AND status IN ('Open', 'In Procurement')`, [item.customer_order_id]);
    await client.query('COMMIT');
    res.json({ id: prodId, prodNumber, bomLines, plannedQty: qty, noBom: !!item.sku_id && bomLines === 0, noProduct: !item.sku_id });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
};

exports.computeYield = computeYield;
