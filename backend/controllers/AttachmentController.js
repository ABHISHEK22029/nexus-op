/* ══════════════════════════════════════════════════════════
   AttachmentController — files on any record (Phase 0)
   Stored in Postgres (bytea). Download is authenticated, so the
   frontend fetches with its token and turns the response into a blob.
   ══════════════════════════════════════════════════════════ */
const db = require('../db');

// POST /attachments  (multipart: file + entityType + entityId)
exports.create = async (req, res) => {
  const { entityType, entityId } = req.body;
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  if (!entityType || !entityId) return res.status(400).json({ error: 'entityType and entityId are required' });
  try {
    const { rows } = await db.query(
      `INSERT INTO attachments (owner_id, entity_type, entity_id, filename, mime, size_bytes, data)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, filename, mime, size_bytes, created_at`,
      [req.user?.id || null, entityType, entityId, req.file.originalname, req.file.mimetype, req.file.size, req.file.buffer]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// GET /attachments?entityType=&entityId=   (metadata only — never the blob)
exports.list = async (req, res) => {
  const { entityType, entityId } = req.query;
  if (!entityType || !entityId) return res.status(400).json({ error: 'entityType and entityId are required' });
  try {
    const { rows } = await db.query(
      `SELECT id, filename, mime, size_bytes, created_at
         FROM attachments WHERE entity_type = $1 AND entity_id = $2 ORDER BY id DESC`,
      [entityType, entityId]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// GET /attachments/:id/download  (streams the file)
exports.download = async (req, res) => {
  try {
    const { rows } = await db.query('SELECT filename, mime, data FROM attachments WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    const f = rows[0];
    res.setHeader('Content-Type', f.mime || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${(f.filename || 'file').replace(/"/g, '')}"`);
    res.send(f.data);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// DELETE /attachments/:id
exports.remove = async (req, res) => {
  try {
    const r = await db.query('DELETE FROM attachments WHERE id = $1', [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
};
