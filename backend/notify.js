/* Phase 1 — notification helper. Fire-and-forget; never throws into a request.
   notify('admins', {...})  → all active admins
   notify(userId,  {...})   → one user */
const db = require('./db');

async function notify(target, { type, title, message, entityType, entityId, link } = {}) {
  try {
    let recipients = [];
    if (target === 'admins' || target == null) {
      const { rows } = await db.query("SELECT id FROM users WHERE role = 'Admin' AND is_active = TRUE");
      recipients = rows.map(r => r.id);
    } else {
      recipients = [target];
    }
    for (const uid of recipients) {
      await db.query(
        `INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id, link)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [uid, type || null, title, message || null, entityType || null, entityId || null, link || null]
      );
    }
  } catch (e) {
    console.error('notify error:', e.message);
  }
}

module.exports = { notify };
