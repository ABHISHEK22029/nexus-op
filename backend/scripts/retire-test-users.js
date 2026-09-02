/* Deactivate every throwaway test account.

   The RBAC and configurator suites need these accounts active while they
   run; nothing needs them active afterwards. ensure-test-user.js reactivates
   and re-passwords them on the next run, so leaving them disabled costs
   nothing and means a live database is not carrying a set of accounts that
   exist only for testing.

   Scoped to @test.local / @example.invalid — it cannot touch a real user.

   Usage: node scripts/retire-test-users.js [--dry] */
require('dotenv').config();
const db = require('../db');

const DRY = process.argv.includes('--dry');

(async () => {
  const { rows } = await db.query(
    `SELECT id, email, role, is_active FROM users
      WHERE email LIKE '%@test.local' OR email LIKE '%@example.invalid'
      ORDER BY id`);

  if (!rows.length) { console.log('no test accounts on this database'); process.exit(0); }

  for (const u of rows) {
    console.log(`  ${u.is_active ? 'active  ' : 'inactive'}  ${String(u.id).padStart(3)}  ${u.email.padEnd(30)} ${u.role}`);
  }

  if (DRY) { console.log('\n  dry run — nothing changed'); process.exit(0); }

  const r = await db.query(
    `UPDATE users SET is_active = false
      WHERE (email LIKE '%@test.local' OR email LIKE '%@example.invalid') AND is_active`);
  console.log(`\n  deactivated ${r.rowCount} account(s)`);
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
