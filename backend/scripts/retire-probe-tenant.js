/* Deactivate the IDOR probe account and remove the empty project it owns.
   make-probe-tenant.js recreates both on demand, so nothing is lost — an
   account that can sign in should not outlive the test that needed it. */
require('dotenv').config();
const db = require('../db');

const EMAIL = process.env.PROBE_EMAIL || 'probe.tenant@example.invalid';

(async () => {
  const { rows } = await db.query('SELECT id FROM users WHERE email = $1', [EMAIL]);
  if (!rows[0]) { console.log('no probe tenant on this database'); process.exit(0); }
  const id = rows[0].id;

  const { rows: projects } = await db.query('SELECT id, name FROM projects WHERE owner_id = $1', [id]);
  for (const p of projects) {
    // Only remove a project that is genuinely empty — never cascade over data.
    const { rows: [n] } = await db.query(`
      SELECT (SELECT COUNT(*) FROM purchase_orders WHERE "projectId" = $1)
           + (SELECT COUNT(*) FROM bills           WHERE "projectId" = $1)
           + (SELECT COUNT(*) FROM indents         WHERE "projectId" = $1)
           + (SELECT COUNT(*) FROM work_orders     WHERE "projectId" = $1) AS c`, [p.id]);
    if (Number(n.c) === 0) {
      await db.query('DELETE FROM projects WHERE id = $1', [p.id]);
      console.log(`removed empty project ${p.id} (${p.name})`);
    } else {
      console.log(`kept project ${p.id} (${p.name}) — it has ${n.c} dependent record(s)`);
    }
  }

  await db.query('UPDATE users SET is_active = false WHERE id = $1', [id]);
  console.log(`deactivated user ${id} (${EMAIL})`);
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
