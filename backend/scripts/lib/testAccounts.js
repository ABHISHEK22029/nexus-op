/* ══════════════════════════════════════════════════════════════════════
   Throwaway accounts, and getting rid of them.

   Every test here registers a real account against the real database,
   does its work and deletes it at the end. That is fine until a test
   FAILS: it exits at the failed assertion and the cleanup at the bottom
   never runs. A handful of failing runs during development left ten
   accounts, three company profiles and a stray invoice behind on the live
   database — found only because somebody went looking.

   So cleanup cannot live only at the happy end of a script. Two habits
   fix it:

     sweepStale()  at the START of a run, removing anything an earlier
                   failed run left behind. Self-healing: a failure is
                   cleaned up by the next run rather than accumulating.

     purge(ids)    in a `finally`, so it runs whether the test passed,
                   failed an assertion, or threw.

   Both refuse to touch anything that is not an @example.test address, and
   both leave PROTECTED accounts alone — real fixtures that predate this
   and that other records depend on.
   ══════════════════════════════════════════════════════════════════════ */
const path = require('path');

/* Test accounts from earlier work that other records genuinely depend on.
   Deleting them breaks real customer orders, so they stay. */
const PROTECTED = [41, 93];

/* Child rows first, then the tables keyed by owner_id, then the user. */
const CHILD_SQL = [
  `DELETE FROM sales_invoice_items WHERE sales_invoice_id IN (SELECT id FROM sales_invoices WHERE owner_id = ANY($1))`,
  `DELETE FROM sales_payments      WHERE sales_invoice_id IN (SELECT id FROM sales_invoices WHERE owner_id = ANY($1))`,
  `DELETE FROM sales_quotation_items WHERE sales_quotation_id IN (SELECT id FROM sales_quotations WHERE owner_id = ANY($1))`,
  `DELETE FROM vendor_quotation_lines WHERE owner_id = ANY($1)`,
];
const OWNED_TABLES = [
  'vendor_quotations', 'sales_invoices', 'sales_quotations', 'customers',
  'catalogue_photos', 'catalogue_settings', 'skus', 'inventory',
  'attachments', 'company_profile', 'document_sequences', 'activities',
];

function connect() {
  const base = path.join(__dirname, '..', '..');
  require(path.join(base, 'node_modules', 'dotenv')).config({ path: path.join(base, '.env') });
  const { Client } = require(path.join(base, 'node_modules', 'pg'));
  return new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
}

/** Delete these accounts and everything they own. Safe to call twice. */
async function purge(ids, existingClient = null) {
  const list = (ids || []).map(Number).filter(n => Number.isFinite(n) && !PROTECTED.includes(n));
  if (!list.length) return 0;
  const c = existingClient || connect();
  if (!existingClient) await c.connect();
  try {
    /* Never delete an account that is not a throwaway, whatever was passed. */
    const { rows } = await c.query(
      `SELECT id FROM users WHERE id = ANY($1) AND email LIKE '%@example.test'`, [list]);
    const safe = rows.map(r => r.id);
    if (!safe.length) return 0;
    for (const sql of CHILD_SQL) await c.query(sql, [safe]).catch(() => {});
    for (const t of OWNED_TABLES) await c.query(`DELETE FROM ${t} WHERE owner_id = ANY($1)`, [safe]).catch(() => {});
    const r = await c.query('DELETE FROM users WHERE id = ANY($1)', [safe]);
    return r.rowCount;
  } finally {
    if (!existingClient) await c.end().catch(() => {});
  }
}

/**
 * Remove throwaway accounts an earlier run left behind.
 *
 * @param {string} prefix  only addresses starting with this, so one test
 *                         never sweeps another's account out from under it
 *                         while it is running.
 * @param {number} olderThanMinutes  default 30 — old enough that nothing
 *                         currently running could own it.
 */
async function sweepStale(prefix, olderThanMinutes = 30) {
  const c = connect();
  await c.connect();
  try {
    const { rows } = await c.query(
      `SELECT id FROM users
        WHERE email LIKE $1 AND email LIKE '%@example.test'
          AND created_at < NOW() - ($2 || ' minutes')::interval
          AND NOT (id = ANY($3))`,
      [`${prefix}%`, String(olderThanMinutes), PROTECTED]);
    if (!rows.length) return 0;
    const n = await purge(rows.map(r => r.id), c);
    if (n) console.log(`   (swept ${n} account(s) left by an earlier failed run)`);
    return n;
  } finally { await c.end().catch(() => {}); }
}

module.exports = { purge, sweepStale, PROTECTED };
