/* Notifications. Fire-and-forget; never throws into a request.

     notify({ org }, {...})                         → that organisation's Owners and Administrators
     notify({ org, can: ['po-approval'] }, {...})   → anyone in it whose role may do that
     notify(userId, {...})                          → one user

   There is no "everyone who is an admin" any more. It used to be
   notify('admins'), which read every active user with role 'Admin' in the
   whole database: a purchase order raised in one company was announced to
   the administrators of every other company, and an organisation's own
   Owner — whose role is 'Owner', not the legacy 'Admin' — heard nothing.
   A notification now always names the organisation it belongs to. */
const db = require('./db');
const { can, normaliseRole, WRITE } = require('./shared/roles');

const LEADS = new Set(['Owner', 'Administrator']);

async function recipientsFor(target) {
  if (target == null || target === 'admins') return [];
  if (typeof target !== 'object') return [target];
  if (target.org == null) return [];
  const { rows } = await db.query(
    'SELECT id, role FROM users WHERE org_id = $1 AND is_active = TRUE', [target.org]);
  const [resource, action = WRITE] = target.can || [];
  return rows
    .filter((u) => (resource
      ? can(u.role, resource, action, target.org)
      : LEADS.has(normaliseRole(u.role, target.org))))
    .map((u) => u.id);
}

async function notify(target, { type, title, message, entityType, entityId, link } = {}) {
  try {
    for (const uid of await recipientsFor(target)) {
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

module.exports = { notify, recipientsFor };
