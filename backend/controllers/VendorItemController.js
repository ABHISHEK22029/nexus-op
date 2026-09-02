/* ══════════════════════════════════════════════════════════
   VendorItemController — who supplies what.

   Answers the question that made raising a PO a memory exercise:
   "which of my 200 vendors actually sells MS sheet?"

   Manageable from both directions — a Supplies list on the vendor, and a
   Vendors list on the material — because users approach it from whichever
   end they happen to be looking at.
   ══════════════════════════════════════════════════════════ */
const db = require('../db');
const { assertOwned } = require('../shared/ownerScope');
const { isCrossTenant } = require('../shared/roles');
const { runList } = require('../shared/listQuery');
const isAdmin = (req) => isCrossTenant(req.user?.role);

const COLS = ['vendor_id', 'raw_material_id', 'vendor_item_code', 'price', 'price_uom', 'moq', 'lead_time_days', 'is_preferred', 'last_quoted_at', 'notes'];

/* GET /vendor-items?vendorId=&materialId=
   Joined both ways so one endpoint serves both views. */
exports.list = async (req, res) => {
  try {
    /* Same owner scoping as before — own links plus the unowned (seeded)
       ones — just expressed against the subquery instead of the raw table.
       The `$$` in these template literals is load-bearing: `$${params.length}`
       emits the bind placeholder $1; `${params.length}` would emit the
       literal 1 and quietly hand back another tenant's links. */
    const where = [], params = [];
    if (!isAdmin(req)) { params.push(req.user.id); where.push(`(owner_id = $${params.length} OR owner_id IS NULL)`); }
    if (req.query.vendorId) { params.push(req.query.vendorId); where.push(`vendor_id = $${params.length}`); }
    if (req.query.materialId) { params.push(req.query.materialId); where.push(`raw_material_id = $${params.length}`); }

    const result = await runList(db, {
      table: `(SELECT vi.*,
                      v.name  AS vendor_name, v.gstin AS vendor_gstin, v.city AS vendor_city,
                      rm.name AS material_name, rm.category, rm.base_uom, rm.purchase_uom,
                      rm.standard_rate
                 FROM vendor_items vi
                 JOIN vendors v        ON v.id  = vi.vendor_id
                 JOIN raw_materials rm ON rm.id = vi.raw_material_id) AS vi`,
      query: req.query,
      searchColumns: ["vendor_name", "material_name", "vendor_item_code", "category", "vendor_city", "notes"],
      filterColumns: ["vendor_id", "raw_material_id", "is_preferred", "category"],
      allowedSort: ["id", "vendor_name", "material_name", "price", "moq", "lead_time_days", "is_preferred", "last_quoted_at"],
      /* Preferred supplier first, as before. The helper orders on one column,
         so the old price/name tiebreakers are now reachable via ?sort. */
      defaultSort: 'is_preferred', defaultDir: 'DESC',
      where, params,
      /* Coverage, not money: this page answers "who can supply this, and do
         we know what they charge". `missing_price` is the gap that makes a
         link useless when a PO is being raised. */
      summary: `COUNT(*)::int AS count,
                COUNT(DISTINCT vendor_id)::int AS vendors,
                COUNT(DISTINCT raw_material_id)::int AS materials,
                COUNT(*) FILTER (WHERE is_preferred)::int AS preferred,
                COUNT(*) FILTER (WHERE price IS NULL)::int AS missing_price`,
    });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

/* GET /raw-materials/:id/vendors
   The list that populates a PO / RFQ vendor picker — only vendors who
   actually supply this material, best option first. */
exports.vendorsForMaterial = async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT vi.id AS vendor_item_id, v.id AS vendor_id, v.name, v.gstin, v.city, v.state,
             vi.price, vi.price_uom, vi.moq, vi.lead_time_days, vi.is_preferred, vi.vendor_item_code
      FROM vendor_items vi
      JOIN vendors v ON v.id = vi.vendor_id
      WHERE vi.raw_material_id = $1
      ORDER BY vi.is_preferred DESC, vi.price NULLS LAST, vi.lead_time_days NULLS LAST`,
      [req.params.id]);

    // Nothing linked yet: say so plainly so the UI can offer the full list
    // rather than silently showing an empty dropdown.
    res.json({
      items: rows,
      total: rows.length,
      hasLinks: rows.length > 0,
      message: rows.length ? null : 'No vendors are linked to this material yet.',
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

/* POST /vendor-items — link a vendor to a material */
exports.create = async (req, res) => {
  const { vendor_id, raw_material_id } = req.body;
  if (!vendor_id || !raw_material_id) return res.status(400).json({ error: 'Pick both a vendor and a material' });
  try {
    // Only one preferred vendor per material; setting a new one clears the old.
    if (req.body.is_preferred) {
      await db.query('UPDATE vendor_items SET is_preferred = FALSE WHERE raw_material_id = $1', [raw_material_id]);
    }
    const cols = COLS.filter(c => c in req.body);
    const values = cols.map(c => (req.body[c] === '' ? null : req.body[c]));
    const { rows } = await db.query(
      `INSERT INTO vendor_items (owner_id, ${cols.map(c => `"${c}"`).join(', ')})
       VALUES ($1, ${cols.map((_, i) => `$${i + 2}`).join(', ')})
       ON CONFLICT (vendor_id, raw_material_id) DO UPDATE
         SET ${cols.filter(c => !['vendor_id', 'raw_material_id'].includes(c)).map(c => `"${c}" = EXCLUDED."${c}"`).join(', ') || 'vendor_id = EXCLUDED.vendor_id'}
       RETURNING *`,
      [req.user?.id || null, ...values]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

/* PATCH /vendor-items/:id */
exports.update = async (req, res) => {
  const sets = COLS.filter(c => c in req.body);
  if (!sets.length) return res.status(400).json({ error: 'No fields to update' });
  try {
    if (!await assertOwned(db, req, res, 'vendor_items', req.params.id, { columns: 'id' })) return;
    if (req.body.is_preferred) {
      const cur = (await db.query('SELECT raw_material_id FROM vendor_items WHERE id = $1', [req.params.id])).rows[0];
      if (cur) await db.query('UPDATE vendor_items SET is_preferred = FALSE WHERE raw_material_id = $1 AND id <> $2', [cur.raw_material_id, req.params.id]);
    }
    const clause = sets.map((c, i) => `"${c}" = $${i + 1}`).join(', ');
    const { rows } = await db.query(
      `UPDATE vendor_items SET ${clause} WHERE id = $${sets.length + 1} RETURNING *`,
      [...sets.map(c => (req.body[c] === '' ? null : req.body[c])), req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Link not found' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

/* DELETE /vendor-items/:id */
exports.remove = async (req, res) => {
  try {
    if (!await assertOwned(db, req, res, 'vendor_items', req.params.id, { columns: 'id' })) return;
    const { rowCount } = await db.query('DELETE FROM vendor_items WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Link not found' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
};
