/* ══════════════════════════════════════════════════════════
   ShortfallToPoController — turn "we're short 400kg of plate" into an order.

   The deficiency engine already worked out everything needed to buy: the
   shortfall, the vendor's MOQ, who supplies it and at what price. Its own
   source comment says the shortfall is "one click from a PO". There was no
   click. Somebody read the number off the screen and typed it into the
   purchase order form, which is exactly the re-keying an ERP exists to
   remove — and the step where a 400 becomes a 40.

   GROUPED BY VENDOR, not one PO per material. Six shortfalls from the same
   supplier is one purchase order with six lines; sending six separate
   orders to Jindal on the same morning is not what a buyer does.

   ROUNDED UP TO THE VENDOR'S MOQ, using suggested_order_qty rather than the
   raw shortfall. The minimum belongs to the vendor, not the item — Jindal's
   minimum is not Electrosteel's — and ordering below it gets the order
   rejected or silently rounded at the other end.
   ══════════════════════════════════════════════════════════ */
const db = require('../db');
const { isCrossTenant } = require('../shared/roles');
const { computeRequirements } = require('./MaterialRequirementsController');

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/* computeRequirements takes an options object, not the request — it is
   called from a scheduler too, where there is no req to hand it. */
const reqOpts = (req) => ({
  ownerId: req.user?.id,
  admin: isCrossTenant(req.user?.role),
  orderId: req.query?.orderId || req.body?.orderId || null,
  projectId: req.query?.projectId || req.body?.projectId || null,
});

/* GET /material-requirements/purchase-plan
   What WOULD be raised, grouped by vendor, without raising anything. A
   preview matters here: this creates real purchase orders, and the first
   time somebody runs it they should be able to see the shape of what they
   are about to commit to. */
exports.plan = async (req, res) => {
  try {
    const { materials } = await computeRequirements(reqOpts(req));
    const plan = groupByVendor(materials);
    res.json({
      vendors: plan.byVendor,
      unassigned: plan.unassigned,
      totals: {
        vendors: plan.byVendor.length,
        lines: plan.byVendor.reduce((s, v) => s + v.lines.length, 0),
        value: r2(plan.byVendor.reduce((s, v) => s + v.total, 0)),
        unassignedLines: plan.unassigned.length,
      },
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

/* POST /material-requirements/to-po
   Body: { materialIds?: number[], projectId?: number }
   Raises one PO per vendor. */
exports.create = async (req, res) => {
  const only = Array.isArray(req.body?.materialIds) && req.body.materialIds.length
    ? new Set(req.body.materialIds.map(Number)) : null;

  const client = await db.getClient();
  try {
    const { materials } = await computeRequirements(reqOpts(req));
    const chosen = only ? materials.filter(m => only.has(Number(m.raw_material_id))) : materials;
    const plan = groupByVendor(chosen);

    if (!plan.byVendor.length) {
      return res.status(400).json({
        error: 'Nothing to order',
        detail: plan.unassigned.length
          ? `${plan.unassigned.length} material(s) are short but have no vendor linked. Link a vendor on the Vendors → What they supply tab first.`
          : 'No material is short.',
        unassigned: plan.unassigned,
      });
    }

    await client.query('BEGIN');
    const created = [];

    for (const v of plan.byVendor) {
      const c = await client.query('SELECT COUNT(*) FROM purchase_orders');
      const poNumber = `PO-${String(parseInt(c.rows[0].count) + 1 + created.length).padStart(4, '0')}`;

      /* purchase_orders has no totalValue column — the header value is
         quantity x unitPrice. For a multi-line order the header is a
         summary, so unitPrice is set to the blended rate that reproduces
         the true total rather than whichever line happened to be first. */
      const totalQty = r2(v.lines.reduce((s, l) => s + l.qty, 0));
      const blendedRate = totalQty > 0 ? r2(v.total / totalQty) : 0;

      const { rows } = await client.query(
        `INSERT INTO purchase_orders
           ("projectId", "vendorId", "poNumber", "itemName", quantity, "unitPrice",
            status, owner_id, "quoteRef")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [req.body?.projectId || null, v.vendorId, poNumber,
         /* The header carries a summary of the lines rather than one item's
            name, so a six-line order doesn't masquerade as an order for
            whatever happened to be first. */
         v.lines.length === 1 ? v.lines[0].material : `${v.lines.length} materials (shortfall)`,
         totalQty, blendedRate,
         'Pending', req.user?.id || null, 'Auto: material shortfall']
      );
      const poId = rows[0].id;

      let sort = 0;
      for (const l of v.lines) {
        await client.query(
          `INSERT INTO po_line_items ("poId", sno, description, uom, quantity, "unitPrice")
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [poId, ++sort, l.material, l.uom || 'nos', l.qty, l.rate || 0]
        );
      }

      created.push({
        id: poId, poNumber, vendor: v.vendorName, vendorId: v.vendorId,
        lines: v.lines.length, value: v.total,
      });
    }

    await client.query('COMMIT');
    res.json({
      success: true,
      created,
      /* Reported, never silently dropped. A material that is short but has
         no vendor is the single most useful thing this endpoint can tell
         you — it is the reason the shortfall will still be there tomorrow. */
      skipped: plan.unassigned,
      message: `Raised ${created.length} purchase order(s)` +
        (plan.unassigned.length ? `; ${plan.unassigned.length} material(s) skipped — no vendor linked` : ''),
    });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
};

/** Split short materials into per-vendor baskets, and those with no vendor. */
function groupByVendor(materials) {
  const byVendor = new Map();
  const unassigned = [];

  for (const m of materials) {
    const qty = Number(m.suggested_order_qty) || 0;
    if (qty <= 0) continue;                       // not short, or already on order

    if (!m.preferred_vendor?.id) {
      unassigned.push({
        raw_material_id: m.raw_material_id,
        material: m.material,
        shortfall: m.shortfall,
        reason: 'No vendor linked to this material',
      });
      continue;
    }

    const key = m.preferred_vendor.id;
    if (!byVendor.has(key)) {
      byVendor.set(key, { vendorId: key, vendorName: m.preferred_vendor.name, lines: [], total: 0 });
    }
    const basket = byVendor.get(key);
    const rate = Number(m.preferred_vendor.price) || 0;
    const line = {
      raw_material_id: m.raw_material_id,
      material: m.material,
      shortfall: m.shortfall,
      qty,                                        // already rounded to MOQ
      moq: m.moq, moq_source: m.moq_source,
      /* Fall back through the chain rather than emitting null — a PO line
         reading "1000null" tells the vendor nothing about what unit to
         send. */
      uom: m.purchase_uom || m.base_uom || m.bom_uom || 'nos',
      rate,
      amount: r2(qty * rate),
      lead_time_days: m.lead_time_days,
    };
    basket.lines.push(line);
    basket.total = r2(basket.total + line.amount);
  }

  return { byVendor: [...byVendor.values()], unassigned };
}
