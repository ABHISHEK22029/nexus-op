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
const { isCrossTenant } = require('../shared/roles');
const { convert, loadUoms } = require('../shared/uom');

const r4 = (n) => Math.round((Number(n) || 0) * 10000) / 10000;
const isAdmin = (req) => isCrossTenant(req.user?.role);

/* Order states that still represent real demand. Delivered/Closed/Cancelled
   orders have already consumed (or released) their material. */
/* A part-delivered order still has units outstanding, so its remaining
   demand must keep reaching the engine. Omitting it would make the
   material for the unshipped balance vanish from requirements the moment
   the first truck left. */
const OPEN_ORDER_STATES = ['Open', 'In Procurement', 'In Production', 'Ready', 'Partially Delivered'];

/**
 * Gather demand, supply and stock, and reduce it all to one row per material.
 * Shared by the summary board and the per-order readiness view.
 */
async function computeRequirements({ ownerId, admin, orderId = null, projectId = null }) {
  const uoms = await loadUoms(db);

  /* Every input below is this organisation's. Only the demand was scoped:
     the materials, stock, open purchase orders and supplier links were read
     across every company, so another company's same-named material, stock
     or open PO quietly changed this one's shortfalls — and its preferred
     vendor could be offered as the one to raise a PO with. A cross-tenant
     Administrator still sees the whole install, as before. */
  const own = (col, list) => (admin ? '' : ` AND ${col} = $${list.push(ownerId)}`);

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
      /* The material's own columns — name, category, dimensions, rate —
         used to be selected here. They describe the MATERIAL, not the
         order line, so every one of them was repeated on all 1990 rows
         for the 16 materials that actually came back.

         The query executes in 10ms; sending the result took 3,054ms and
         1.1MB. Almost none of that was the answer. The material master is
         read once below instead. */
      COALESCE((
        SELECT SUM(po_out.output_qty) FROM production_output po_out
        JOIN production_orders po ON po.id = po_out.production_order_id
        WHERE po.customer_order_id = co.id AND po.sku_id = coi.sku_id
      ), 0) AS produced_qty
    FROM customer_orders co
    JOIN customer_order_items coi ON coi.customer_order_id = co.id
    LEFT JOIN skus s      ON s.id = coi.sku_id
    LEFT JOIN sku_bom b   ON b.sku_id = coi.sku_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY co.id, coi.id
  `, params)).rows;

  /* The material master, once. 235 rows here against 1990 there, and the
     wide columns travel a single time each. Keyed by id so the loop below
     reads exactly what the join used to give it.

     A material that has been deleted while a BOM still points at it is
     simply absent, which is what the LEFT JOIN produced too — the loop
     already falls back to the BOM's component_name. */
  const materialParams = [];
  const materialRows = (await db.query(
    /* base_uom falls back to unit: the materials screen and its API write
       `unit`, and a material with no base_uom made every shortfall line —
       and the purchase order raised from it — read "nos": 1,000 nos of
       steel sheet instead of 1,000 kg. */
    `SELECT id, name, COALESCE(base_uom, unit) AS base_uom,
            COALESCE(purchase_uom, base_uom, unit) AS purchase_uom, category, moq, lead_time_days,
            standard_rate, weight_per_piece_kg, length_mm, width_mm,
            thickness_mm, density_kg_m3, is_critical
       FROM raw_materials WHERE TRUE${own('owner_id', materialParams)}`, materialParams)).rows;
  const materialById = new Map(materialRows.map(r => [r.id, r]));

  // ── 2. Stock on hand, per material ──
  const stockParams = [];
  let stockWhere = 'raw_material_id IS NOT NULL';
  if (projectId) { stockParams.push(projectId); stockWhere += ` AND "projectId" = $${stockParams.length}`; }
  stockWhere += own('owner_id', stockParams);
  const stockRows = (await db.query(
    `SELECT raw_material_id, SUM(quantity)::numeric AS qty, MIN(base_uom) AS base_uom
     FROM inventory WHERE ${stockWhere} GROUP BY raw_material_id`, stockParams)).rows;
  const stock = new Map(stockRows.map(r => [r.raw_material_id, Number(r.qty)]));

  // ── 3. Quantities already on order (not yet received) ──
  /* Per LINE, and only what is still to come. This read the PO header —
     its first line's name, and every line's quantity added together — so a
     two-line PO counted all of it against one material, and a part-received
     PO dropped out of "on order" altogether although half of it was still on
     the road. A line linked to its material (migration 075) counts against
     that material; an unlinked one is matched by name, within the company
     (another company's open PO for "MS Plate 10mm" is not on order for this
     one). Converted into each material's stock unit in 4a, below. */
  const onOrderParams = [];
  const normed = (col) => `btrim(regexp_replace(lower(translate(${col}, '×X', 'xx')), '[^a-z0-9]+', ' ', 'g'))`;
  const OPEN = `('Pending', 'Approved', 'Dispatched', 'Partially Received')`;
  const onOrderRows = (await db.query(`
    SELECT COALESCE(li.raw_material_id, rm.id) AS raw_material_id, li.uom,
           GREATEST(COALESCE(li.quantity, 0) - COALESCE(li.received_quantity, 0), 0)::numeric AS qty
      FROM purchase_orders po
      JOIN po_line_items li ON li."poId" = po.id
      LEFT JOIN raw_materials rm
        ON li.raw_material_id IS NULL AND li.sku_id IS NULL
       AND rm.owner_id IS NOT DISTINCT FROM po.owner_id
       AND ${normed('rm.name')} = ${normed('li.description')}
     WHERE po.status IN ${OPEN}${own('po.owner_id', onOrderParams)}
       AND COALESCE(li.raw_material_id, rm.id) IS NOT NULL
    UNION ALL
    SELECT rm.id, NULL, GREATEST(COALESCE(po.quantity, 0) - COALESCE(po.received_quantity, 0), 0)::numeric
      FROM purchase_orders po
      JOIN raw_materials rm
        ON rm.owner_id IS NOT DISTINCT FROM po.owner_id
       AND ${normed('rm.name')} = ${normed('po."itemName"')}
     WHERE po.status IN ${OPEN}${own('po.owner_id', onOrderParams)}
       AND NOT EXISTS (SELECT 1 FROM po_line_items x WHERE x."poId" = po.id)`, onOrderParams)).rows;

  // ── 4. Per-item conversion factors ──
  const itemUomParams = [];
  const itemUomRows = (await db.query(
    `SELECT raw_material_id, uom_code, qty_in_base FROM item_uom
      WHERE TRUE${admin ? '' : ` AND raw_material_id IN (SELECT id FROM raw_materials WHERE TRUE${own('owner_id', itemUomParams)})`}`,
    itemUomParams)).rows;
  const itemUoms = {};
  itemUomRows.forEach(r => { (itemUoms[r.raw_material_id] ||= []).push(r); });

  /* ── 4a. On order, in each material's stock unit ──
     5 MT on order and a shortfall in kg are compared in kg. A line whose
     unit cannot be converted is counted as written, as it always was. */
  const onOrder = new Map();
  for (const r of onOrderRows) {
    let qty = Number(r.qty) || 0;
    if (!qty) continue;
    const rm = materialById.get(r.raw_material_id);
    const from = String(r.uom || '').toLowerCase(), to = String(rm?.base_uom || '').toLowerCase();
    if (rm && from && to && from !== to) {
      const c = convert(qty, from, to, { uoms, item: rm, itemUoms: itemUoms[r.raw_material_id] || [] });
      if (c.ok) qty = c.qty;
    }
    onOrder.set(r.raw_material_id, (onOrder.get(r.raw_material_id) || 0) + qty);
  }

  /* ── 4b. Preferred supplier per material ──
     MOQ belongs to the vendor, not the item: Jindal's minimum is not
     Electrosteel's. Where a preferred vendor exists we round the shortfall
     to THEIR minimum and quote THEIR price and lead time, falling back to
     the item-level defaults when nothing is linked yet. */
  /* Your links to your vendors: this vendor is the one a shortfall PO is
     raised against. Unowned links are seeded ones, as in /vendor-items. */
  const supplierParams = [];
  const supplierRows = (await db.query(`
    SELECT DISTINCT ON (vi.raw_material_id)
           vi.raw_material_id, vi.vendor_id, vi.price, vi.moq, vi.lead_time_days, vi.is_preferred,
           v.name AS vendor_name
    FROM vendor_items vi
    JOIN vendors v ON v.id = vi.vendor_id
    WHERE TRUE${own('v.owner_id', supplierParams)}${admin ? '' : ' AND (vi.owner_id = $1 OR vi.owner_id IS NULL)'}
    ORDER BY vi.raw_material_id, vi.is_preferred DESC, vi.price NULLS LAST, vi.lead_time_days NULLS LAST
  `, supplierParams)).rows;
  const supplier = new Map(supplierRows.map(r => [r.raw_material_id, r]));

  /* ── 4c. Everyone who could supply it, and what they last quoted ──
     The preferred vendor is a default, not a verdict. Every vendor linked
     to the material is an option, and so is every vendor whose quotation
     (checked, from the last 120 days) has a line for it — the latest one
     from each. The lowest of those, in the material's own unit, is who to
     buy from: the comparison's winner, not whoever was ticked preferred. */
  const optionParams = [];
  const supplyOptions = (await db.query(`
    SELECT vi.raw_material_id, vi.vendor_id, v.name AS vendor_name, vi.price, vi.moq, vi.lead_time_days, vi.is_preferred
      FROM vendor_items vi JOIN vendors v ON v.id = vi.vendor_id
     WHERE TRUE${own('v.owner_id', optionParams)}${admin ? '' : ' AND (vi.owner_id = $1 OR vi.owner_id IS NULL)'}`, optionParams)).rows;
  const quoteParams = [];
  const quoteRows = (await db.query(`
    SELECT DISTINCT ON (l.raw_material_id, vq.vendor_id)
           l.raw_material_id, vq.vendor_id, v.name AS vendor_name, l.rate, l.uom,
           vq.id AS quotation_id, COALESCE(vq.quote_date, vq.created_at::date) AS quoted_on,
           vq.lead_time_days, vq.payment_terms, vq.freight
      FROM vendor_quotation_lines l
      JOIN vendor_quotations vq ON vq.id = l.vendor_quotation_id
      JOIN vendors v ON v.id = vq.vendor_id
     WHERE l.raw_material_id IS NOT NULL AND l.rate IS NOT NULL
       AND l.confidence IN ('high', 'checked')
       AND vq.created_at > NOW() - INTERVAL '120 days'${own('vq.owner_id', quoteParams)}
     ORDER BY l.raw_material_id, vq.vendor_id, vq.created_at DESC`, quoteParams)).rows;
  const unitKey = (u) => String(u || '').toLowerCase().replace(/[.']/g, '').replace(/s$/, '').trim();
  const optionsByMaterial = new Map();
  const addOption = (id, o) => {
    const list = optionsByMaterial.get(id) || [];
    const at = list.findIndex(x => x.vendor_id === o.vendor_id);
    if (at < 0) list.push(o); else list[at] = { ...list[at], ...Object.fromEntries(Object.entries(o).filter(([, v]) => v != null)) };
    optionsByMaterial.set(id, list);
  };
  for (const s of supplyOptions) {
    addOption(s.raw_material_id, {
      vendor_id: s.vendor_id, name: s.vendor_name, price: s.price != null ? Number(s.price) : null,
      moq: s.moq != null ? Number(s.moq) : null, lead_time_days: s.lead_time_days, is_preferred: !!s.is_preferred, source: 'supplies',
    });
  }
  for (const q of quoteRows) {
    const rm = materialById.get(q.raw_material_id);
    const sameUnit = !q.uom || !rm || [rm.base_uom, rm.purchase_uom].some(u => unitKey(u) === unitKey(q.uom));
    addOption(q.raw_material_id, {
      vendor_id: q.vendor_id, name: q.vendor_name,
      /* a quote in another unit (per tonne against per kg) is shown, but
         not priced against the others */
      quoted_rate: Number(q.rate), quoted_uom: q.uom, comparable: sameUnit,
      quotation_id: q.quotation_id, quoted_on: q.quoted_on,
      quoted_lead_time_days: q.lead_time_days, payment_terms: q.payment_terms, freight: q.freight,
    });
  }

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

    /* What the LEFT JOIN used to attach to every row. Empty rather than
       undefined so each field below reads the same as a NULL from the
       join did. */
    const rm = materialById.get(d.raw_material_id) || {};

    // Convert the BOM quantity into the material's base unit.
    const from = String(d.bom_uom || rm.base_uom || '').toLowerCase();
    const to = String(rm.base_uom || '').toLowerCase();
    let need = rawNeed, conversion = null;
    if (rawNeed > 0 && from && to && from !== to) {
      const item = {
        base_uom: rm.base_uom, weight_per_piece_kg: rm.weight_per_piece_kg,
        length_mm: rm.length_mm, width_mm: rm.width_mm, thickness_mm: rm.thickness_mm, density_kg_m3: rm.density_kg_m3,
      };
      const c = convert(rawNeed, from, to, { uoms, item, itemUoms: itemUoms[d.raw_material_id] || [] });
      if (c.ok) { need = c.qty; conversion = `${rawNeed} ${from} → ${c.qty} ${to}`; }
      else {
        issues.push({ level: 'error', material: rm.name, message: `Cannot convert the BOM quantity (${from}) into stock units (${to}). ${c.reason}` });
        need = 0;
      }
    }

    const key = d.raw_material_id;
    if (!byMaterial.has(key)) {
      byMaterial.set(key, {
        raw_material_id: key,
        material: rm.name || d.component_name,
        category: rm.category,
        base_uom: rm.base_uom,
        purchase_uom: rm.purchase_uom,
        moq: rm.moq != null ? Number(rm.moq) : null,
        lead_time_days: rm.lead_time_days,
        standard_rate: rm.standard_rate != null ? Number(rm.standard_rate) : null,
        is_critical: !!rm.is_critical,
        required: 0,
        available: stock.get(key) || 0,
        on_order: onOrder.get(key) || 0,
        orders: [],
        order_ids: [],
      });
    }
    const m = byMaterial.get(key);
    m.required = r4(m.required + need);
    if (!m.orders.includes(d.order_number)) m.orders.push(d.order_number);
    if (need > 0 && !m.order_ids.includes(d.order_id)) m.order_ids.push(d.order_id);

    lines.push({
      order_id: d.order_id, order_number: d.order_number, line_id: d.line_id,
      product: d.product_name || d.line_description,
      ordered: Number(d.ordered_qty), produced: Number(d.produced_qty), remaining,
      raw_material_id: key, material: rm.name || d.component_name,
      per_unit: perUnit, bom_uom: from, base_uom: to,
      need: r4(need), available: stock.get(key) || 0, conversion,
    });
  }

  /* Each material's vendors, cheapest first at the price they would charge
     now (their latest comparable quote, else their listed rate), and who to
     buy from: the lowest comparable quote if there is one, else the
     preferred vendor. */
  const buyingOptions = (materialId, sup) => {
    const list = (optionsByMaterial.get(materialId) || []).map(o => {
      const quoted = o.quoted_rate != null && o.comparable !== false;
      return {
        ...o,
        price_now: quoted ? o.quoted_rate : o.price,
        price_source: quoted ? 'quote' : (o.price != null ? 'supplies' : null),
        lead_time_now: o.quoted_lead_time_days ?? o.lead_time_days ?? null,
      };
    }).sort((a, b) => (a.price_now ?? Infinity) - (b.price_now ?? Infinity) || (a.lead_time_now ?? 999) - (b.lead_time_now ?? 999));
    const quotes = list.filter(o => o.price_source === 'quote');
    const best = quotes[0] || null;
    const pick = best || (sup ? list.find(o => o.vendor_id === sup.vendor_id) : null);
    const buyFrom = pick
      ? { id: pick.vendor_id, name: pick.name, price: pick.price_now ?? (sup?.price != null ? Number(sup.price) : null),
          source: best ? 'quote' : 'preferred', quotation_id: pick.quotation_id || null, quoted_on: pick.quoted_on || null,
          lead_time_days: pick.lead_time_now, payment_terms: pick.payment_terms || null, freight: pick.freight || null, moq: pick.moq ?? null }
      : (sup ? { id: sup.vendor_id, name: sup.vendor_name, price: sup.price != null ? Number(sup.price) : null, source: 'preferred', moq: sup.moq != null ? Number(sup.moq) : null } : null);
    return {
      vendor_options: list,
      best_quote: best ? { id: best.vendor_id, name: best.name, price: best.price_now, quotation_id: best.quotation_id, quoted_on: best.quoted_on } : null,
      buy_from: buyFrom,
    };
  };

  // ── 6. Finalise the five columns ──
  const materials = [...byMaterial.values()].map(m => {
    const shortfall = r4(Math.max(0, m.required - m.available));
    const net = r4(m.available + m.on_order - m.required);

    // The supplier's minimum wins over the item default — that's the number
    // you can actually place an order against.
    const sup = supplier.get(m.raw_material_id) || null;
    const effectiveMoq = sup?.moq != null ? Number(sup.moq) : m.moq;
    const rate = sup?.price != null ? Number(sup.price) : m.standard_rate;

    /* To ORDER: what neither the stock nor the orders already placed will
       cover — not the whole shortfall. It was the shortfall, so "Raise
       purchase orders" ordered again what was already on its way: 1,110 kg
       of angle with 100 kg of it on order, where 1,010 kg was needed.
       Rounded up to the minimum order the supplier will take. */
    const uncovered = r4(Math.max(0, -net));
    const suggested = uncovered > 0 && effectiveMoq > 0
      ? r4(Math.ceil(uncovered / effectiveMoq) * effectiveMoq)
      : uncovered;

    return {
      ...m,
      shortfall,
      net,
      moq: effectiveMoq,
      moq_source: sup?.moq != null ? 'vendor' : (m.moq != null ? 'item' : null),
      lead_time_days: sup?.lead_time_days ?? m.lead_time_days,
      uncovered,
      suggested_order_qty: suggested,
      order_value: rate != null ? r4(suggested * rate) : null,
      // Who to actually buy this from, so a shortfall is one click from a PO.
      preferred_vendor: sup ? { id: sup.vendor_id, name: sup.vendor_name, price: sup.price != null ? Number(sup.price) : null } : null,
      ...buyingOptions(m.raw_material_id, sup),
      shortfall_value: rate != null ? r4(shortfall * rate) : null,
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
      ownerId: req.user?.orgId, admin: isAdmin(req),
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
        /* The UNFILTERED count, so the screen can tell "we computed the
           requirements and none are short" apart from "there was nothing to
           compute". Without it the page keyed its empty state off the
           shortOnly checkbox and told anyone with no open orders that
           "every material for the open orders is covered by stock" — which
           reads as reassurance when the truth is that the engine had no
           input at all. */
        materials_total: materials.length,
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
      ownerId: req.user?.orgId, admin: isAdmin(req),
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
