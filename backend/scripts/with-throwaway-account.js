#!/usr/bin/env node
/* ═════════════════════════════════════════════════
   Run a suite that needs a login (UI_EMAIL / UI_PASSWORD) inside a
   throwaway account, then delete everything that account owns.

   test-inventory-flow.js and test-untested-flows.js sign in to an existing
   account and leave their records in it. Pointed at a real company, that
   is test stock, invoices and challans in somebody's books. This makes a
   fresh @example.test organisation for the run and purges it after, pass
   or fail.

     API_BASE=http://localhost:5099 node scripts/with-throwaway-account.js scripts/test-inventory-flow.js [more suites…]

   Local backend only (SCHEDULER=off): refuses deployed hosts.
   ═════════════════════════════════════════════════ */
require('dotenv').config();
const { spawnSync } = require('child_process');
const { Client } = require('pg');
const { purgeOrg } = require('./lib/purgeOrg');

const API = process.env.API_BASE || 'http://localhost:5099';
if (/^https:|onrender\.com|vercel\.app|maksops\.co\.in/.test(API)) {
  console.error(`Refusing to run against ${API} — local backend only.`);
  process.exit(1);
}
const suites = process.argv.slice(2);
if (!suites.length) { console.error('usage: with-throwaway-account.js <suite.js> [more…]'); process.exit(1); }

const stamp = Date.now();
const EMAIL = `throwaway-${stamp}@example.test`;
const PASS = `Throwaway-${stamp}-x9`;
const db = () => new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function purge() {
  const c = db(); await c.connect();
  try {
    const { rows } = await c.query(`SELECT id, org_id FROM users WHERE email LIKE 'throwaway-%@example.test'`);
    const ids = [...new Set(rows.flatMap((r) => [r.id, r.org_id]).filter(Boolean))];
    if (!ids.length) return 0;
    let blocked = [];
    for (let i = 0; i < 5; i++) { const r = await purgeOrg(c, ids); blocked = r.blocked || []; if (!r.deleted) break; }
    await c.query('DELETE FROM document_sequences WHERE owner_id = ANY($1)', [ids]).catch(() => {});
    await c.query('DELETE FROM notifications WHERE user_id = ANY($1)', [rows.map((r) => r.id)]).catch(() => {});
    await c.query(`DELETE FROM users WHERE email LIKE 'throwaway-%@example.test' AND id <> org_id`);
    const n = (await c.query(`DELETE FROM users WHERE email LIKE 'throwaway-%@example.test'`)).rowCount;
    if (blocked.length) console.log(`   ⚠ tables that would not clear: ${blocked.join(', ')}`);
    return n;
  } finally { await c.end(); }
}

(async () => {
  let failed = 0;
  try {
    const r = await fetch(`${API}/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Throwaway Test', email: EMAIL, password: PASS }),
    });
    if (!r.ok) throw new Error(`could not register the throwaway account: ${r.status} ${(await r.text()).slice(0, 120)}`);
    for (const s of suites) {
      console.log(`\n── ${s} (as ${EMAIL})`);
      /* the login under each name the suites use for it; shell suites run in bash */
      const env = { ...process.env, API_BASE: API, BASE_URL: API, UI_EMAIL: EMAIL, UI_PASSWORD: PASS, FLOW_ADMIN_EMAIL: EMAIL, FLOW_ADMIN_PASSWORD: PASS };
      const run = s.endsWith('.sh')
        ? spawnSync('bash', [s], { stdio: 'inherit', env })
        : spawnSync(process.execPath, [s], { stdio: 'inherit', env });
      if (run.status !== 0) failed++;
    }
  } catch (e) {
    console.error(e.message); failed++;
  } finally {
    const n = await purge().catch((e) => { console.error('purge failed:', e.message); return -1; });
    console.log(`\nthrowaway account removed: ${n > 0 ? 'yes' : n === 0 ? 'nothing to remove' : 'NO — check it'}`);
  }
  process.exit(failed ? 1 : 0);
})();
