/* Run one SQL statement and print the row count. For tests that need to set
   up a database state no API exposes — deleting the company profile to
   simulate a new install, for instance.

   Deliberately refuses anything that is not a single statement, and refuses
   DROP and TRUNCATE outright. This runs against a live database; a test
   helper should be able to arrange a row, not to take the schema apart.

   Usage: node scripts/sql.js "DELETE FROM company_profile" */
/* Load .env by absolute path, not relative to the caller's cwd.

   A plain dotenv.config() resolves against process.cwd(). Run from
   frontend/ — which is where the browser tests live — it found no .env, so
   DATABASE_URL was undefined, pg fell back to a local default and the error
   came back as "The server does not support SSL connections". Nothing to do
   with SSL; it was talking to the wrong database entirely. */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../db');

const sql = process.argv[2];
if (!sql) { console.error('usage: node scripts/sql.js "<statement>"'); process.exit(1); }

if (/;\s*\S/.test(sql)) { console.error('refusing: one statement at a time'); process.exit(1); }
if (/\b(drop|truncate|alter)\b/i.test(sql)) { console.error('refusing: DROP / TRUNCATE / ALTER'); process.exit(1); }

(async () => {
  try {
    const r = await db.query(sql);
    console.log(`${r.command} ${r.rowCount ?? 0} row(s)`);
    process.exit(0);
  } catch (e) { console.error(e.message); process.exit(1); }
})();
