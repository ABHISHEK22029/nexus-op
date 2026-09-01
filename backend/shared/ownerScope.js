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

/** Build `WHERE id = $1 [AND owner_id = $2]` plus its params. */
function scopedById(req, id) {
  // Admin is the tenant-wide role in this deployment and sees everything.
  if (req.user?.role === 'Admin') return { where: 'id = $1', params: [id] };
  return { where: 'id = $1 AND owner_id = $2', params: [id, req.user?.id ?? -1] };
}

/** Append ` AND owner_id = $n` to an existing parameterised query. */
function andOwner(req, params) {
  if (req.user?.role === 'Admin') return '';
  params.push(req.user?.id ?? -1);
  return ` AND owner_id = $${params.length}`;
}

module.exports = { scopedById, andOwner };
