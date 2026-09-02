/* ══════════════════════════════════════════════════════════
   make-probe-tenant — a second, non-admin tenant for IDOR probes.

   Password comes from PROBE_PASSWORD. Never hard-code one here: a
   throwaway account is still an account on the live database, and this
   repository is public.
   ══════════════════════════════════════════════════════════ */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../db');

const EMAIL = process.env.PROBE_EMAIL || 'probe.tenant@example.invalid';
const PASSWORD = process.env.PROBE_PASSWORD;
if (!PASSWORD) { console.error('set PROBE_PASSWORD'); process.exit(1); }

(async () => {
  const hash = await bcrypt.hash(PASSWORD, 10);
  const { rows: existing } = await db.query('SELECT id FROM users WHERE email = $1', [EMAIL]);

  let id;
  if (existing[0]) {
    id = existing[0].id;
    await db.query(
      `UPDATE users SET password_hash = $1, role = 'Purchase Officer', is_active = true WHERE id = $2`,
      [hash, id]);
    console.log(`reused user ${id}`);
  } else {
    const { rows } = await db.query(
      `INSERT INTO users (name, email, password_hash, role, is_active)
       VALUES ('Probe Tenant', $1, $2, 'Purchase Officer', true) RETURNING id`,
      [EMAIL, hash]);
    id = rows[0].id;
    console.log(`created user ${id}`);
  }

  // Give them one project of their own so "their" data is distinguishable.
  const { rows: proj } = await db.query(
    `SELECT id FROM projects WHERE owner_id = $1 LIMIT 1`, [id]);
  if (!proj[0]) {
    const { rows: p } = await db.query(
      `INSERT INTO projects (name, "clientName", type, status, owner_id)
       VALUES ('Probe Tenant Project', 'Probe Co', 'Fabrication', 'Active', $1) RETURNING id`, [id]);
    console.log(`created project ${p[0].id} for them`);
  } else console.log(`they already own project ${proj[0].id}`);

  console.log(`\nuser id ${id}, role Purchase Officer, email ${EMAIL}`);
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
