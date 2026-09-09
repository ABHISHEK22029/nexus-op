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

  /* Line items and payments hang off their parent by parent_id, not by
     owner_id, so the sweep above cannot see them — and they hold the
     parent in place forever. Clear them first, keyed through the parent
     that IS owned.

     The list is read from the foreign keys rather than written out here:
     a hand-kept version was missing six tables (sales_payments,
     vendor_payments, the three *_items, quote_lines) and the purge
     silently left customers behind because of it. Anything that points
     at an owned table and is not itself owned is a child. */
  const { rows: fks } = await db.query(
    `SELECT tc.table_name AS child, kcu.column_name AS col, ccu.table_name AS parent
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON kcu.constraint_name = tc.constraint_name
       JOIN information_schema.constraint_column_usage ccu
         ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND ccu.table_name <> tc.table_name`
  );
  const ownedSet = new Set(pending);
  const children = fks.filter(f => ownedSet.has(f.parent) && !ownedSet.has(f.child) && f.child !== 'users');

  /* Twice: a child can itself have children (customer_order_items hangs
     off customer_orders, and nothing hangs off it — but sales_invoice_items
     sits under sales_invoices which sits under customer_orders). */
  for (let pass = 0; pass < 2; pass++) {
    for (const f of children) {
      await db.query(
        `DELETE FROM ${f.child} WHERE "${f.col}" IN (SELECT id FROM ${f.parent} WHERE owner_id = ANY($1))`,
        [ids]
      ).catch(() => {});
    }
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
