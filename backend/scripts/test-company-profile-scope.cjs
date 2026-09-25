#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   The company profile is owner-scoped, with no fallback to anybody else's.

   Guards the fix to shared/companyProfile.js. That function used to end
   with `SELECT … FROM company_profile ORDER BY id LIMIT 1` whenever no
   owner was passed — which returns the FIRST profile in the database.
   Any caller without a user in scope (a cron job, a webhook, a background
   document render) would have printed another tenant's name, GSTIN and
   bank account on an invoice, unattended, with nobody watching the output.

   Read-only. This test writes nothing and creates no accounts; it reads
   whatever profiles exist and checks the rule holds for each.
   ══════════════════════════════════════════════════════════════════════ */
const path = require('path');
require(path.join(__dirname, '..', 'node_modules', 'dotenv'))
  .config({ path: path.join(__dirname, '..', '.env') });
const { Client } = require(path.join(__dirname, '..', 'node_modules', 'pg'));
const { profileFor, profileOrEmpty } = require('../shared/companyProfile');

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };

(async () => {
  console.log('');
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  const { rows: owners } = await c.query(
    'SELECT owner_id FROM company_profile WHERE owner_id IS NOT NULL ORDER BY owner_id LIMIT 3');

  ok(await profileFor(c, null) === null,
    'no owner in scope → null, never the first tenant’s profile');
  ok(await profileFor(c, undefined) === null, 'undefined owner → null');

  const empty = await profileOrEmpty(c, null);
  ok(empty && Object.keys(empty).length === 0,
    'profileOrEmpty gives {} — a blank letterhead, which gets noticed; a wrong one does not');

  /* An id far past anything real: a brand-new account before first-run. */
  ok(await profileFor(c, 2147483000) === null,
    'an owner with no profile yet → null, not a borrowed one');

  for (const { owner_id } of owners) {
    const row = await profileFor(c, owner_id);
    ok(row && Number(row.owner_id) === Number(owner_id),
      `owner ${owner_id} gets their own row back (${row?.name || 'unnamed'})`);
  }
  if (owners.length >= 2) {
    const a = await profileFor(c, owners[0].owner_id);
    const b = await profileFor(c, owners[1].owner_id);
    ok(a.name !== b.name || a.owner_id !== b.owner_id,
      'two different owners get two different profiles');
  }

  await c.end();
  console.log(`\n   ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('threw:', e.message); process.exit(1); });
