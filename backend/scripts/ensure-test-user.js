/* ══════════════════════════════════════════════════════════
   ensure-test-user — make a throwaway role account usable, whatever state
   it is already in.

   The RBAC suites created their accounts with POST /auth/register and then
   UPDATEd the role. That works exactly once. On the second run the email is
   taken, register refuses, and the password stays whatever it was — so the
   suite could not sign in and aborted with "no token for VIEWER". After the
   committed-credential incident those accounts were also deactivated, which
   made it permanent.

   This upserts instead: sets the password hash, the role, and is_active,
   whether or not the user exists. Idempotent, so the suites are runnable
   repeatedly.

   The password comes from the environment and is never written down here.

   Usage: node scripts/ensure-test-user.js <email> <role>     (RBAC_TEST_PASSWORD)
   ══════════════════════════════════════════════════════════ */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../db');

const [email, role] = process.argv.slice(2);
const password = process.env.RBAC_TEST_PASSWORD;

if (!email || !role) { console.error('usage: ensure-test-user.js <email> <role>'); process.exit(1); }
if (!password) { console.error('set RBAC_TEST_PASSWORD'); process.exit(1); }

/* Refuse to touch anything that is not obviously a test account. These
   scripts run against a live database; a typo in the email argument should
   not be able to reset a real user's password. */
if (!/@(test\.local|example\.invalid)$/.test(email)) {
  console.error(`refusing: "${email}" is not a @test.local / @example.invalid address`);
  process.exit(1);
}

(async () => {
  const hash = await bcrypt.hash(password, 10);
  const { rows } = await db.query('SELECT id FROM users WHERE email = $1', [email]);
  if (rows[0]) {
    await db.query(
      'UPDATE users SET password_hash = $1, role = $2, is_active = true WHERE id = $3',
      [hash, role, rows[0].id]);
    console.log(`  ${email} -> ${role} (updated, id ${rows[0].id})`);
  } else {
    const r = await db.query(
      `INSERT INTO users (name, email, password_hash, role, is_active)
       VALUES ($1,$2,$3,$4,true) RETURNING id`,
      [`${role} Test`, email, hash, role]);
    console.log(`  ${email} -> ${role} (created, id ${r.rows[0].id})`);
  }
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
