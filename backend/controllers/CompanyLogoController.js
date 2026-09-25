/* ══════════════════════════════════════════════════════════════════════
   The company's logo, as a file.

   Company Profile only ever had `logo_url` — a link to an image hosted
   somewhere else. That asks a fabrication business to find image hosting
   before it can put its own letterhead on an invoice, and it breaks the
   day that host expires, on every document already issued.

   The bytes live in `attachments`, which already has an upload path, a
   size limit and an owner column — the same store the catalogue
   photographs use. No new table, so no schema change to apply to a running
   database.

   One logo per organisation: uploading replaces the previous one inside a
   transaction, rather than accumulating rows nobody can see or delete.
   `logo_url` keeps working and is used as the fallback when nothing has
   been uploaded, so no existing profile loses its letterhead.
   ══════════════════════════════════════════════════════════════════════ */
const db = require('../db');

const ENTITY = 'company_logo';
const ownerOf = (req) => req.user?.orgId ?? req.user?.id ?? null;

/* Deliberately narrower than the 10MB multer ceiling. A letterhead is
   printed about 40mm wide; anything past this is a camera photo that will
   be downscaled to illegibility anyway, and it is embedded into every
   document render. */
const MAX_BYTES = 2 * 1024 * 1024;
const TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

// POST /company-profile/logo   (multipart, field: file)
exports.upload = async (req, res) => {
  const owner = ownerOf(req);
  if (owner == null) return res.status(401).json({ error: 'Not signed in' });
  if (!req.file) return res.status(400).json({ error: 'No image was uploaded.' });

  const mime = (req.file.mimetype || '').toLowerCase();
  if (!TYPES.includes(mime)) {
    return res.status(400).json({ error: 'That is not a supported image. Use PNG, JPEG, WebP or SVG.' });
  }
  if (req.file.size > MAX_BYTES) {
    return res.status(413).json({
      error: `That image is ${(req.file.size / 1048576).toFixed(1)}MB. Keep a logo under 2MB — it is embedded in every document.`,
    });
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    /* Replace, don't accumulate. entity_id is the organisation, so this is
       scoped by owner twice over — by owner_id and by what it points at. */
    await client.query(
      'DELETE FROM attachments WHERE owner_id = $1 AND entity_type = $2', [owner, ENTITY]);
    const { rows: [att] } = await client.query(
      `INSERT INTO attachments (owner_id, entity_type, entity_id, filename, mime, size_bytes, data)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, filename, mime, size_bytes`,
      [owner, ENTITY, owner, req.file.originalname || 'logo', mime, req.file.size, req.file.buffer]);
    await client.query('COMMIT');
    res.json({ ...att, uploaded: true });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
};

/* GET /company-profile/logo — the bytes, for this organisation only.
   An <img> tag cannot send an Authorization header, so the browser fetches
   this and makes a blob URL, the same way catalogue thumbnails work. */
exports.get = async (req, res) => {
  try {
    const owner = ownerOf(req);
    if (owner == null) return res.status(401).json({ error: 'Not signed in' });
    const { rows: [row] } = await db.query(
      `SELECT mime, data FROM attachments
        WHERE owner_id = $1 AND entity_type = $2
        ORDER BY id DESC LIMIT 1`, [owner, ENTITY]);
    if (!row) return res.status(404).json({ error: 'No logo uploaded' });
    res.setHeader('Content-Type', row.mime || 'application/octet-stream');
    /* private: it is one organisation's mark, and the response is
       owner-scoped — a shared cache must never hand it to another tenant. */
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(row.data);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

/* HEAD-ish check the UI uses to decide between the uploaded logo and
   whatever logo_url holds, without pulling the bytes down twice. */
exports.status = async (req, res) => {
  try {
    const owner = ownerOf(req);
    if (owner == null) return res.status(401).json({ error: 'Not signed in' });
    const { rows: [row] } = await db.query(
      `SELECT id, filename, mime, size_bytes, created_at FROM attachments
        WHERE owner_id = $1 AND entity_type = $2
        ORDER BY id DESC LIMIT 1`, [owner, ENTITY]);
    res.json(row ? { exists: true, ...row } : { exists: false });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// DELETE /company-profile/logo
exports.remove = async (req, res) => {
  try {
    const owner = ownerOf(req);
    if (owner == null) return res.status(401).json({ error: 'Not signed in' });
    const { rowCount } = await db.query(
      'DELETE FROM attachments WHERE owner_id = $1 AND entity_type = $2', [owner, ENTITY]);
    res.json({ removed: rowCount });
  } catch (e) { res.status(500).json({ error: e.message }); }
};
