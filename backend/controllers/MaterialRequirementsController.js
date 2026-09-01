/* ══════════════════════════════════════════════════════════
   MaterialRequirementsController — the deficiency engine.

   The question this answers, for every material:
       how much do we NEED, how much do we HAVE, how much must we BUY?

       Required  = Σ over open order lines: (ordered − produced) × bom qty
       Available = stock on hand
       Shortfall = max(0, Required − Available)
       On Order  = open PO quantities
       Net       = Available + On Order − Required
                   negative = still short · positive = covered, with surplus

   Two things this gets right that a naive version would not:

   1. UNITS. A BOM line may be in kg while stock is held in pieces. Every
      quantity is converted into the material's base unit before anything is
      compared. If a conversion cannot be established the row is flagged
      rather than silently added up — comparing kg to pieces produces a
      confident, wrong answer, which is worse than no answer.

   2. THE BINDING CONSTRAINT. "Can build 3 of 10" is a number. "Blocked by
      Glass" is an action. Buildable is the MINIMUM across every BOM line,
      and we always name the line that limits it.
   ══════════════════════════════════════════════════════════ */
const db = require('../db');
const { convert, loadUoms } = require('../shared/uom');

const r4 = (n) => Math.round((Number(n) || 0) * 10000) / 10000;
const isAdmin = (req) => req.user?.role === 'Admin';

/* Order states that still represent real demand. Delivered/Closed/Cancelled
   orders have already consumed (or released) their material. */
const OPEN_ORDER_STATES = ['Open', 'In Procurement', 'In Production', 'Ready'];

/**
 * Gather demand, supply and stock, and reduce it all to one row per material.
 * Shared by the summary board and the per-order readiness view.
 */
async function computeRequirements({ ownerId, admin, orderId = null, projectId = null }) {
  const uoms = await loadUoms(db);

  // ── 1. Demand: open order lines exploded through the BOM ──
  const params = [];
  const where = [];
  if (!admin) { params.push(ownerId); where.push(`co.owner_id = $${params.length}`); }
  if (orderId) { params.push(orderId); where.push(`co.id = $${params.length}`); }
  else { where.push(`co.status = ANY($${params.push(OPEN_ORDER_STATES)})`); }

  const demand = (await db.query(`
    SELECT
      co.id            AS order_id,
      co.order_number,
      co.status        AS order_status,
      coi.id           AS line_id,
      coi.sku_id,
      coi.description  AS line_description,
      COALESCE(coi.quantity, 0) AS ordered_qty,
      s.name           AS product_name,
      b.raw_material_id,
      b.component_name,
      COALESCE(b.qty_per_unit, 0) AS qty_per_unit,
      COALESCE(b.uom_code, b.uom) AS bom_uom,
      rm.name          AS material_name,
      rm.base_uom, rm.purchase_uom, rm.category, rm.moq, rm.lead_time_days,
      rm.standard_rate, rm.weight_per_piece_kg, rm.length_mm, rm.width_mm,
      rm.thickness_mm, rm.density_kg_m3, rm.is_critical,
      COALESCE((
        SELECT SUM(po_out.output_qty) FROM production_output po_out
        JOIN production_orders po ON po.id = po_out.production_order_id
        WHERE po.customer_order_id = co.id AND po.sku_id = coi.sku_id
      ), 0) AS produced_qty
    FROM customer_orders co
    JOIN customer_order_items coi ON coi.customer_order_id = co.id
    LEFT JOIN skus s      ON s.id = coi.sku_id
    LEFT JOIN sku_bom b   ON b.sku_id = coi.sku_id
    LEFT JOIN raw_materials rm ON rm.id = b.raw_material_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY co.id, coi.id
  `, params)).rows;

  // ── 2. Stock on hand, per material ──
  const stockParams = [];
  let stockWhere = 'raw_material_id IS NOT NULL';
  if (projectId) { stockParams.push(projectId); stockWhere += ` AND "projectId" = $${stockParams.length}`; }
  const stockRows = (await db.query(
    `SELECT raw_material_id, SUM(quantity)::numeric AS qty, MIN(base_uom) AS base_uom
     FROM inventory WHERE ${stockWhere} GROUP BY raw_material_id`, stockParams)).rows;
  const stock = new Map(stockRows.map(r => [r.raw_material_id, Number(r.qty)]));

  // ── 3. Quantities already on order (not yet received) ──
  const onOrderRows = (await db.query(`
    SELECT rm.id AS raw_material_id, SUM(po.quantity)::numeric AS qty
    FROM purchase_orders po
    JOIN raw_materials rm
      ON btrim(regexp_replace(lower(translate(rm.name, '×X', 'xx')), '[^a-z0-9]+', ' ', 'g'))
       = btrim(regexp_replace(lower(translate(po."itemName", '×X', 'xx')), '[^a-z0-9]+', ' ', 'g'))
    WHERE po.status IN ('Pending', 'Approved', 'Dispatched')
    GROUP BY rm.id`)).rows;
  const onOrder = new Map(onOrderRows.map(r => [r.raw_material_id, Number(r.qty)]));

  // ── 4. Per-item conversion factors ──
  const itemUomRows = (await db.query('SELECT raw_material_id, uom_code, qty_in_base FROM item_uom')).rows;
  const itemUoms = {};
  itemUomRows.forEach(r => { (itemUoms[r.raw_material_id] ||= []).push(r); });

  // ── 5. Roll demand up per material, converting into the base unit ──
  const byMaterial = new Map();
  const lines = [];       // per order-line detail, for the readiness view
  const issues = [];      // rows we refuse to guess at

  for (const d of demand) {
    if (!d.raw_material_id) {
      if (d.sku_id) issues.push({ level: 'warn', order: d.order_number, message: `"${d.line_description}" has no bill of materials — its material need cannot be computed.` });
      continue;
    }
    const remaining = Math.max(0, Number(d.ordered_qty) - Number(d.produced_qty));
    const perUnit = Number(d.qty_per_unit) || 0;
    const rawNeed = remaining * perUnit;

    // Convert the BOM quantity into the material's base unit.
    const from = String(d.bom_uom || d.base_uom || '').toLowerCase();
    const to = String(d.base_uom || '').toLowerCase();
    let need = rawNeed, conversion = null;
    if (rawNeed > 0 && from && to && from !== to) {
      const item = {
        base_uom: d.base_uom, weight_per_piece_kg: d.weight_per_piece_kg,
        length_mm: d.length_mm, width_mm: d.width_mm, thickness_mm: d.thickness_mm, density_kg_m3: d.density_kg_m3,
      };
      const c = convert(rawNeed, from, to, { uoms, item, itemUoms: itemUoms[d.raw_material_id] || [] });
      if (c.ok) { need = c.qty; conversion = `${rawNeed} ${from} → ${c.qty} ${to}`; }
      else {
        issues.push({ level: 'error', material: d.material_name, message: `Cannot convert the BOM quantity (${from}) into stock units (${to}). ${c.reason}` });
        need = 0;
      }
    }

    const key = d.raw_material_id;
    if (!byMaterial.has(key)) {
      byMaterial.set(key, {
        raw_material_id: key,
        material: d.material_name || d.component_name,
        category: d.category,
        base_uom: d.base_uom,
        purchase_uom: d.purchase_uom,
        moq: d.moq != null ? Number(d.moq) : null,
        lead_time_days: d.lead_time_days,
        standard_rate: d.standard_rate != null ? Number(d.standard_rate) : null,
        is_critical: !!d.is_critical,
        required: 0,
        available: stock.get(key) || 0,
        on_order: onOrder.get(key) || 0,
        orders: [],
      });
    }
    const m = byMaterial.get(key);
    m.required = r4(m.required + need);
    if (!m.orders.includes(d.order_number)) m.orders.push(d.order_number);

    lines.push({
      order_id: d.order_id, order_number: d.order_number, line_id: d.line_id,
      product: d.product_name || d.line_description,
      ordered: Number(d.ordered_qty), produced: Number(d.produced_qty), remaining,
      raw_material_id: key, material: d.material_name || d.component_name,
      per_unit: perUnit, bom_uom: from, base_uom: to,
      need: r4(need), available: stock.get(key) || 0, conversion,
    });
  }

  // ── 6. Finalise the five columns ──
  const materials = [...byMaterial.values()].map(m => {
    const shortfall = r4(Math.max(0, m.required - m.available));
    const net = r4(m.available + m.on_order - m.required);
    // MOQ rounding: you need 16 but the vendor's minimum is 20.
    const suggested = shortfall > 0 && m.moq > 0
      ? r4(Math.ceil(shortfall / m.moq) * m.moq)
      : shortfall;
    return {
      ...m,
      shortfall,
      net,
      suggested_order_qty: suggested,
      shortfall_value: m.standard_rate != null ? r4(shortfall * m.standard_rate) : null,
      status: shortfall > 0
        ? (m.on_order >= shortfall ? 'Ordered' : 'Short')
        : (net > 0 ? 'Surplus' : 'Covered'),
    };
  }).sort((a, b) => (b.shortfall_value ?? 0) - (a.shortfall_value ?? 0) || b.shortfall - a.shortfall);

  return { materials, lines, issues };
}

/* GET /material-requirements  — the deficiency board */
exports.list = async (req, res) => {
  try {
    const { materials, issues } = await computeRequirements({
      ownerId: req.user?.id, admin: isAdmin(req),
      orderId: req.query.orderId || null,
      projectId: req.query.projectId || null,
    });
    let rows = materials;
    if (req.query.status) rows = rows.filter(m => m.status === req.query.status);
    if (req.query.category) rows = rows.filter(m => m.category === req.query.category);
    if (String(req.query.shortOnly) === 'true') rows = rows.filter(m => m.shortfall > 0);

    res.json({
      items: rows,
      total: rows.length,
      summary: {
        materials_short: materials.filter(m => m.status === 'Short').length,
        materials_ordered: materials.filter(m => m.status === 'Ordered').length,
        total_shortfall_value: r4(materials.reduce((s, m) => s + (m.shortfall_value || 0), 0)),
      },
      issues,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

/* GET /customer-orders/:id/readiness — can we build it, and what blocks us? */
exports.orderReadiness = async (req, res) => {
  try {
    const { lines, issues } = await computeRequirements({
      ownerId: req.user?.id, admin: isAdmin(req),
      orderId: req.params.id, projectId: req.query.projectId || null,
    });
    if (!lines.length) {
      return res.json({ buildable: 0, ordered: 0, blocking: null, lines: [], issues,
        message: 'No bill of materials for this order, so material readiness cannot be computed.' });
    }

    // Group by order line: a product may need several materials.
    const byLine = new Map();
    for (const l of lines) {
      if (!byLine.has(l.line_id)) byLine.set(l.line_id, { line_id: l.line_id, product: l.product, ordered: l.ordered, produced: l.produced, remaining: l.remaining, materials: [] });
      const perUnitInBase = l.remaining > 0 ? l.need / l.remaining : 0;
      byLine.get(l.line_id).materials.push({
        raw_material_id: l.raw_material_id, material: l.material,
        per_unit: r4(perUnitInBase), base_uom: l.base_uom,
        available: l.available,
        // How many finished units this ONE material can support.
        can_make: perUnitInBase > 0 ? Math.floor(l.available / perUnitInBase) : Infinity,
      });
    }

    const result = [...byLine.values()].map(line => {
      // The binding constraint: the material that runs out first.
      const blocking = line.materials.reduce((worst, m) => (m.can_make < (worst?.can_make ?? Infinity) ? m : worst), null);
      const buildable = Math.max(0, Math.min(line.remaining, blocking ? blocking.can_make : 0));
      return {
        ...line,
        buildable: Number.isFinite(buildable) ? buildable : line.remaining,
        blocked_by: buildable < line.remaining && blocking ? blocking.material : null,
        materials: line.materials.map(m => ({ ...m, can_make: Number.isFinite(m.can_make) ? m.can_make : null })),
      };
    });

    const totalOrdered = result.reduce((s, l) => s + l.remaining, 0);
    const totalBuildable = result.reduce((s, l) => s + l.buildable, 0);
    const blockers = [...new Set(result.map(l => l.blocked_by).filter(Boolean))];

    res.json({
      buildable: totalBuildable,
      ordered: totalOrdered,
      blocked: Math.max(0, totalOrdered - totalBuildable),
      blocking: blockers.length ? blockers.join(', ') : null,
      summary: blockers.length
        ? `Can build ${totalBuildable} of ${totalOrdered} — blocked by ${blockers.join(', ')}`
        : `All ${totalOrdered} can be built with stock on hand`,
      lines: result,
      issues,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.computeRequirements = computeRequirements;
