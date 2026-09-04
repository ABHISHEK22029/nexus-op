/* ══════════════════════════════════════════════════════════
   SupplyCategoryController — the organisation's own vocabulary.

   Vendors were classified by a `type` picked from a list somebody else
   chose: Civil, Bituminous, IT Hardware. Those are a road contractor's
   categories. A furniture maker buys Board, Laminate and Hardware; a
   fabricator buys Plate, Section and Fasteners. Handing every business the
   same fixed list means most of them classify nothing, and then the vendor
   list cannot be filtered by the thing that actually distinguishes vendors.

   Two vocabularies, because they are genuinely different questions:
     kind='vendor'   — categories of thing we BUY
     kind='customer' — categories of thing we SELL

   Categories are created as they are used. Somebody typing "Fire doors"
   into a customer's requirement should not first have to go and administer
   a list — `ensure()` adds it and moves on, and the Configurator is where
   they get tidied up later.
   ══════════════════════════════════════════════════════════ */
const db = require('../db');
const { isCrossTenant } = require('../shared/roles');
const { assertOwned } = require('../shared/ownerScope');

const KINDS = ['vendor', 'customer'];
const norm = (s) => String(s || '').trim();

/** GET /supply-categories?kind=vendor */
exports.list = async (req, res) => {
  const kind = KINDS.includes(req.query.kind) ? req.query.kind : null;
  try {
    const params = [];
    const where = ['is_active'];
    if (kind) { params.push(kind); where.push(`kind = $${params.length}`); }
    if (!isCrossTenant(req.user?.role)) {
      params.push(req.user?.id ?? -1);
      /* NULL owner_id means a category that shipped with the product rather
         than one this business created. Both are usable. */
      where.push(`(owner_id = $${params.length} OR owner_id IS NULL)`);
    }
    const { rows } = await db.query(
      `SELECT id, kind, name, description, sort_order,
              (SELECT COUNT(*) FROM vendors v   WHERE v.supply_category = sc.name)      AS vendor_count,
              (SELECT COUNT(*) FROM customers c WHERE c.requirement_category = sc.name) AS customer_count
         FROM supply_categories sc
        WHERE ${where.join(' AND ')}
        ORDER BY sort_order, name`, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

/** Create if absent, return the name. Used by the customer and vendor forms
    so a new category costs nobody a trip to Settings. */
async function ensure(ownerId, kind, name) {
  const n = norm(name);
  if (!n || !KINDS.includes(kind)) return null;
  await db.query(
    `INSERT INTO supply_categories (owner_id, kind, name) VALUES ($1,$2,$3)
     ON CONFLICT DO NOTHING`, [ownerId ?? null, kind, n]);
  return n;
}
exports.ensure = ensure;

/** POST /supply-categories  { kind, name, description } */
exports.create = async (req, res) => {
  const { kind, name, description } = req.body || {};
  if (!KINDS.includes(kind)) return res.status(400).json({ error: 'kind must be vendor or customer' });
  if (!norm(name)) return res.status(400).json({ error: 'A name is required' });
  try {
    const { rows } = await db.query(
      `INSERT INTO supply_categories (owner_id, kind, name, description)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT DO NOTHING
       RETURNING id, kind, name, description`,
      [req.user?.id ?? null, kind, norm(name), description || null]);
    if (!rows[0]) return res.status(409).json({ error: 'That category already exists' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

/** PATCH /supply-categories/:id */
exports.update = async (req, res) => {
  try {
    if (!await assertOwned(db, req, res, 'supply_categories', req.params.id, { columns: 'id' })) return;
    const fields = ['name', 'description', 'sort_order', 'is_active'].filter(f => f in (req.body || {}));
    if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });
    const { rows } = await db.query(
      `UPDATE supply_categories SET ${fields.map((f, i) => `${f} = $${i + 1}`).join(', ')}
        WHERE id = $${fields.length + 1} RETURNING id, kind, name, description, is_active`,
      [...fields.map(f => req.body[f]), req.params.id]);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

/** DELETE /supply-categories/:id — deactivates rather than deletes.

    A category in use is referenced by name on vendor and customer rows.
    Deleting it would silently blank a classification somebody chose; making
    it inactive keeps existing rows readable and stops it being offered
    again. */
exports.remove = async (req, res) => {
  try {
    const row = await assertOwned(db, req, res, 'supply_categories', req.params.id, { columns: 'id, name, kind' });
    if (!row) return;
    const { rows: used } = await db.query(
      row.kind === 'vendor'
        ? 'SELECT COUNT(*) c FROM vendors WHERE supply_category = $1'
        : 'SELECT COUNT(*) c FROM customers WHERE requirement_category = $1',
      [row.name]);
    if (Number(used[0].c) > 0) {
      await db.query('UPDATE supply_categories SET is_active = FALSE WHERE id = $1', [req.params.id]);
      return res.json({ success: true, deactivated: true, inUse: Number(used[0].c) });
    }
    await db.query('DELETE FROM supply_categories WHERE id = $1', [req.params.id]);
    res.json({ success: true, deactivated: false });
  } catch (e) { res.status(500).json({ error: e.message }); }
};
