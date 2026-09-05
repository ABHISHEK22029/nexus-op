/* ══════════════════════════════════════════════════════════════════════
   Whose company is this?

   `SELECT * FROM company_profile LIMIT 1` appeared in sixteen places. It
   was correct only while the product had exactly one organisation in it.
   The moment a second account exists, every one of those reads returns the
   first organisation's name, GSTIN and bank details — and prints them on
   the second organisation's invoices.

   One function, so there is one place that knows the rule.

   `LIMIT 1` is kept as a fallback for the row that predates owner_id and
   for callers that genuinely have no user in scope (a cron job, a webhook).
   That fallback is the old behaviour, so nothing regresses; it simply stops
   being the only behaviour.
   ══════════════════════════════════════════════════════════════════════ */

/**
 * @param {object} db      pool or an open client — anything with .query
 * @param {number|null} ownerId  usually req.user?.id
 * @param {string} columns       defaults to everything
 */
async function profileFor(db, ownerId, columns = '*') {
  if (ownerId != null) {
    const { rows } = await db.query(
      `SELECT ${columns} FROM company_profile WHERE owner_id = $1 LIMIT 1`, [ownerId]);
    if (rows[0]) return rows[0];
  }
  /* No profile of their own yet — a brand new account before it has been
     through the first-run screen. Returning the install's original row
     here would hand them somebody else's company identity, so a caller
     with an ownerId gets null and must treat the profile as unset. */
  if (ownerId != null) return null;

  const { rows } = await db.query(`SELECT ${columns} FROM company_profile ORDER BY id LIMIT 1`);
  return rows[0] || null;
}

/** The same thing, but never null — for document printing, where a missing
 *  profile should leave fields blank rather than throw. */
async function profileOrEmpty(db, ownerId, columns = '*') {
  try { return (await profileFor(db, ownerId, columns)) || {}; }
  catch { return {}; }
}

module.exports = { profileFor, profileOrEmpty };
