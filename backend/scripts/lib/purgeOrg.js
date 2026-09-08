/* ══════════════════════════════════════════════════════════════════════
   Remove everything belonging to a test organisation.

   Every test that signs up an organisation has to delete it again, and
   each was carrying its own hand-written list of tables. That list is
   wrong the moment a table grows an owner_id — which is exactly what
   happened when activities did: eleven suites kept passing, and one
   started reporting "test accounts removed ❌" because a single activity
   row held a foreign key on the user.

   So don't keep a list. Ask the database which tables are owned, delete
   from all of them, and repeat while progress is being made — that
   resolves the order between them without hardcoding the dependency
   graph. A table whose parent is still present fails this pass and
   succeeds on the next.
   ══════════════════════════════════════════════════════════════════════ */

/**
 * @param db     the pool wrapper (anything with .query)
 * @param ownerIds  one id or an array of them
 * @returns {deleted, blocked} — blocked is the tables that never cleared,
 *          reported rather than swallowed so litter is visible.
 */
async function purgeOrg(db, ownerIds) {
  const ids = (Array.isArray(ownerIds) ? ownerIds : [ownerIds]).filter(Boolean);
  if (!ids.length) return { deleted: 0, blocked: [] };

  const { rows } = await db.query(
    `SELECT table_name FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'owner_id'
        AND table_name <> 'users'`
  );
  let pending = rows.map(r => r.table_name);
  let deleted = 0;

  /* Line items hang off their parent by parent_id, not owner_id, so they
     are invisible to the sweep and block the parent forever. Clear them
     first, keyed through the parent that IS owned. */
  const CHILDREN = [
    ['bill_line_items', 'bill_id', 'bills'],
    ['po_line_items', '"poId"', 'purchase_orders'],
    ['grn_bill_items', 'grn_bill_id', 'grn_bills'],
  ];
  for (const [child, fk, parent] of CHILDREN) {
    await db.query(
      `DELETE FROM ${child} WHERE ${fk} IN (SELECT id FROM ${parent} WHERE owner_id = ANY($1))`,
      [ids]
    ).catch(() => {});
  }

  /* At most one pass per table: each round must clear at least one or
     there is a cycle, and looping further would not help. */
  for (let round = 0; round < pending.length + 1 && pending.length; round++) {
    const stillPending = [];
    for (const t of pending) {
      try {
        const r = await db.query(`DELETE FROM ${t} WHERE owner_id = ANY($1)`, [ids]);
        deleted += r.rowCount || 0;
      } catch (_) {
        stillPending.push(t);
      }
    }
    if (stillPending.length === pending.length) break;   // no progress
    pending = stillPending;
  }

  return { deleted, blocked: pending };
}

module.exports = { purgeOrg };
