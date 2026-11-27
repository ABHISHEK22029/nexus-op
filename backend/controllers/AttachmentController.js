/* ══════════════════════════════════════════════════════════
   AttachmentController — files on any record (Phase 0)
   Stored in Postgres (bytea). Download is authenticated, so the
   frontend fetches with its token and turns the response into a blob.
   ══════════════════════════════════════════════════════════ */
const db = require('../db');
const fileSafety = require('../shared/fileSafety');
const { assertOwned } = require('../shared/ownerScope');
const { isCrossTenant, can, READ, WRITE } = require('../shared/roles');

/* The records a file can be attached to, and the table each lives in.
   An upload used to accept any type and any id, so a file could be hung on
   another company's invoice by guessing its number. Nothing leaked — the
   list is owner-scoped, so they never saw it — but the record has to be
   yours to attach to it. */
const ENTITY_TABLES = {
  customer: 'customers', expense: 'expenses', raw_material: 'raw_materials', sku: 'skus',
  sales_quotation: 'sales_quotations', sales_invoice: 'sales_invoices', purchase_order: 'purchase_orders',
  delivery_challan: 'delivery_challans', credit_debit_note: 'credit_debit_notes', grn_bill: 'grn_bills',
};

/* A file on a record is part of that record, so it takes that record's
   permission. /attachments is ungated in index.js (it spans every kind of
   record), and the only check here was the company — so a Viewer, meant
   for auditors and the bank, could delete a signed PO scan, and Production
   could list and download vendor-bill files it cannot open. Reading the
   list or a file needs read on the record; adding or removing one needs
   write (removing a file is an edit to the record, not deleting it). */
const ENTITY_RESOURCE = {
  customer: 'customers', expense: 'expenses', raw_material: 'raw-materials', sku: 'skus',
  sales_quotation: 'sales-quotations', sales_invoice: 'sales-invoices', purchase_order: 'po',
  delivery_challan: 'delivery-challans', credit_debit_note: 'credit-debit-notes', grn_bill: 'grn-bills',
};
function permitted(req, res, entityType, action) {
  const resource = ENTITY_RESOURCE[entityType];
  if (resource && can(req.user?.role, resource, action, req.user?.orgId)) return true;
  res.status(403).json({ error: `Your role can't ${action === READ ? 'see' : 'change'} the files on this record.` });
  return false;
}

// POST /attachments  (multipart: file + entityType + entityId)
exports.create = async (req, res) => {
  const { entityType, entityId } = req.body;
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  if (!entityType || !entityId) return res.status(400).json({ error: 'entityType and entityId are required' });
  const table = ENTITY_TABLES[entityType];
  if (!table) return res.status(400).json({ error: `Files cannot be attached to "${entityType}".` });
  if (!/^\d+$/.test(String(entityId))) return res.status(400).json({ error: 'entityId must be a record id' });
  if (!permitted(req, res, entityType, WRITE)) return;
  try {
    if (!await assertOwned(db, req, res, table, entityId, { columns: 'id' })) return;
    /* What the file really is, from its own bytes — not what the browser
       said. An HTML or SVG "attachment" would otherwise run inside the app. */
    const kind = fileSafety.detect(req.file.originalname, req.file.buffer);
    if (!kind) return res.status(400).json({ error: `That kind of file can't be attached — ${fileSafety.ACCEPTED} only.` });
    req.file.mimetype = kind.mime;
    const { rows } = await db.query(
      `INSERT INTO attachments (owner_id, entity_type, entity_id, filename, mime, size_bytes, data)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, filename, mime, size_bytes, created_at`,
      [req.user?.orgId || null, entityType, entityId, req.file.originalname, req.file.mimetype, req.file.size, req.file.buffer]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// GET /attachments?entityType=&entityId=   (metadata only — never the blob)
exports.list = async (req, res) => {
  const { entityType, entityId } = req.query;
  if (!entityType || !entityId) return res.status(400).json({ error: 'entityType and entityId are required' });
  if (!permitted(req, res, entityType, READ)) return;
  try {
    /* Owner-scoped. entity_type + entity_id is not a secret — ids are small
       integers — so without this, naming any (type, id) pair listed another
       company's uploaded documents. `remove` already checked ownership;
       only the two read paths were open, which is the wrong way round. */
    const params = [entityType, entityId];
    let scope = '';
    if (!isCrossTenant(req.user?.role)) {
      params.push(req.user?.orgId ?? req.user?.id ?? -1);
      scope = ` AND owner_id = $${params.length}`;
    }
    const { rows } = await db.query(
      `SELECT id, filename, mime, size_bytes, created_at
         FROM attachments WHERE entity_type = $1 AND entity_id = $2${scope} ORDER BY id DESC`,
      params
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// GET /attachments/:id/download  (streams the file)
exports.download = async (req, res) => {
  try {
    /* The most serious of the three: this streams the FILE, not a row.
       Fetching by id alone meant counting up from 1 handed over every
       document any business had uploaded — signed POs, invoices, whatever
       was attached. `remove` was checked and both reads were not. */
    const own = await assertOwned(db, req, res, 'attachments', req.params.id, { columns: 'id, entity_type' });
    if (!own) return;
    if (!permitted(req, res, own.entity_type, READ)) return;
    const { rows } = await db.query('SELECT filename, mime, data FROM attachments WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    const f = rows[0];
    fileSafety.send(res, { filename: f.filename, data: f.data, cache: null });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// DELETE /attachments/:id
exports.remove = async (req, res) => {
  try {
    // attachments carries owner_id, so this is a direct check.
    const own = await assertOwned(db, req, res, 'attachments', req.params.id, { columns: 'id, entity_type' });
    if (!own) return;
    if (!permitted(req, res, own.entity_type, WRITE)) return;
    const r = await db.query('DELETE FROM attachments WHERE id = $1', [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
};
