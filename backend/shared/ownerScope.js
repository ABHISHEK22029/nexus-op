/* ══════════════════════════════════════════════════════════
   ownerScope — one place that decides "may this user see this row".

   Migration 031 put owner_id on every business table and the two generic
   CRUD factories were taught to respect it. The hand-written controllers
   were not: their getById handlers still read `WHERE id = $1`, so anyone
   with a login could fetch anyone else's invoice by guessing a number.
   Sequential integer ids make that guessing trivial.

   404 rather than 403 on purpose — "this is not yours" still confirms the
   record exists, which is itself a leak when ids are sequential.
   ══════════════════════════════════════════════════════════ */
const { isCrossTenant } = require('../shared/roles');

/* WHICH ORGANISATION, not which person.
 *
 * These read req.user.id, so a row belonged to whoever typed it in. Add an
 * employee and they would create data their own employer could not see, and
 * see none of the company's customers, vendors or stock — every account was
 * its own island and "add someone to my organisation" could not work.
 *
 * orgId is the founder's id, and a founder's own orgId is their id, so
 * nothing that exists today changes hands. */
const orgOf = (req) => req.user?.orgId ?? req.user?.orgId ?? -1;

/** Build `WHERE id = $1 [AND owner_id = $2]` plus its params. */
function scopedById(req, id) {
  // Admin is the tenant-wide role in this deployment and sees everything.
  if (isCrossTenant(req.user?.role)) return { where: 'id = $1', params: [id] };
  return { where: 'id = $1 AND owner_id = $2', params: [id, orgOf(req)] };
}

/** Append ` AND owner_id = $n` to an existing parameterised query. */
function andOwner(req, params) {
  if (isCrossTenant(req.user?.role)) return '';
  params.push(orgOf(req));
  return ` AND owner_id = $${params.length}`;
}

/**
 * Confirm the caller owns this row before a write touches it.
 *
 * The read path was fixed by threading owner_id into each SELECT. Writes
 * needed something else: a DELETE or an UPDATE keyed on an id has nowhere
 * natural to put the check, so 27 of them simply didn't have one — and a
 * second tenant could close another company's order, or record a payment
 * against their invoice.
 *
 * Deliberately a separate up-front query rather than an extra WHERE clause
 * on each statement. Handlers here do several writes in one transaction
 * (add a payment, recompute the total, set the status), and adding the
 * condition to every one of them means every one is a chance to miss it.
 * One guard at the top either passes or the handler never runs.
 *
 * Returns the row when allowed, or null after sending 404. Callers do:
 *
 *     const inv = await assertOwned(db, req, res, 'sales_invoices', id);
 *     if (!inv) return;
 *
 * 404 rather than 403, for the same reason as the read path: with
 * sequential ids, "forbidden" still confirms the record exists.
 */
async function assertOwned(db, req, res, table, id, { columns = '*' } = {}) {
  const s = scopedById(req, id);
  const { rows } = await db.query(`SELECT ${columns} FROM ${table} WHERE ${s.where}`, s.params);
  if (!rows[0]) {
    res.status(404).json({ error: 'Not found' });
    return null;
  }
  return rows[0];
}

module.exports = { scopedById, andOwner, assertOwned };
