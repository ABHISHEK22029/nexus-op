/* ══════════════════════════════════════════════════════════════════════
   Whose company is this?

   `SELECT * FROM company_profile LIMIT 1` appeared in sixteen places. It
   was correct only while the product had exactly one organisation in it.
   The moment a second account exists, every one of those reads returns the
   first organisation's name, GSTIN and bank details — and prints them on
   the second organisation's invoices.

   One function, so there is one place that knows the rule.

   There used to be a fallback here: with no ownerId, return
   `SELECT … ORDER BY id LIMIT 1` — the first profile in the database. It was
   meant for the row that predates owner_id and for callers with no user in
   scope (a cron job, a webhook). It has been removed, because what it
   actually does is hand an arbitrary tenant's name, GSTIN and bank account
   to whoever asks, and the one place that would use it — an unattended
   caller rendering a document — is exactly where nobody is watching the
   output. Every caller today passes an owner, and no row is left with a
   null owner_id, so the fallback had no legitimate user left; it was only a
   way for the next careless call site to print company A's bank details on
   company B's invoice.

   No owner, or no profile for that owner → null. Callers already treat that
   as "profile not set up yet" and leave the letterhead blank, which is the
   safe failure: a missing letterhead is noticed, a wrong one is not.
   ══════════════════════════════════════════════════════════════════════ */

/**
 * @param {object} db      pool or an open client — anything with .query
 * @param {number|null} ownerId  usually req.user?.id
 * @param {string} columns       defaults to everything
 */
async function profileFor(db, ownerId, columns = '*') {
  /* No owner in scope: there is no safe answer, so there is no answer.
     Previously this returned the first profile in the table. */
  if (ownerId == null) return null;

  const { rows } = await db.query(
    `SELECT ${columns} FROM company_profile WHERE owner_id = $1 LIMIT 1`, [ownerId]);
  /* Nothing yet — a new account before the first-run screen. Unset, not
     "borrow somebody else's". */
  return rows[0] || null;
}

/** The same thing, but never null — for document printing, where a missing
 *  profile should leave fields blank rather than throw. */
async function profileOrEmpty(db, ownerId, columns = '*') {
  try { return (await profileFor(db, ownerId, columns)) || {}; }
  catch { return {}; }
}

module.exports = { profileFor, profileOrEmpty };
