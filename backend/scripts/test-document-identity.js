#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   Whose name is on the document?

   An invoice draft came out reading "Invoice IN-00036 from role21". role21
   was a different organisation. Sixteen places read the company profile as
   `SELECT * FROM company_profile LIMIT 1` — no owner, no ordering — so with
   more than one organisation on the database, Postgres returned whichever
   row it felt like. An invoice, challan, credit note or RA bill could carry
   another business's name, address and GSTIN.

   On a tax document that is not cosmetic: the GSTIN on it is who the
   government thinks raised it.

   This creates two organisations with deliberately different names and
   GSTINs — in different states, so the tax treatment differs too — and
   raises a document of each kind from each. Every one must carry its own
   company, and be taxed against its own state.
   ══════════════════════════════════════════════════════════════════════ */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../db');

const API = process.env.API_BASE || 'http://localhost:5099';
if (/^https:|onrender\.com|vercel\.app/.test(API)) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}

const stamp = Date.now().toString(36);
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };

const call = async (path, opts = {}, token) => {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts.headers || {}) },
  });
  const txt = await res.text();
  let body; try { body = JSON.parse(txt); } catch { body = { raw: txt.slice(0, 140) }; }
  return { status: res.status, ok: res.ok, body };
};

/* Two states on purpose. 33 is Tamil Nadu, 29 Karnataka — so a customer in
   one is interstate to a supplier in the other, and reading the wrong
   company profile changes the TAX and not merely the letterhead. */
const ORGS = [
  { key: 'A', company: `Kirashi ${stamp}`, gstin: `33AAAAA${stamp.slice(-4).toUpperCase()}1Z5`, state: '33' },
  { key: 'B', company: `Rival ${stamp}`,   gstin: `29BBBBB${stamp.slice(-4).toUpperCase()}1Z5`, state: '29' },
];

(async () => {
  const made = [];
  console.log('');

  for (const o of ORGS) {
    const email = `doc${o.key.toLowerCase()}-${stamp}@example.test`;
    const reg = await call('/auth/register', {
      method: 'POST', body: JSON.stringify({ name: `Owner ${o.key}`, email, password: 'testpassword123' }),
    });
    if (!reg.ok) { console.error('register failed:', reg.body); process.exit(1); }
    o.token = reg.body.token; o.id = reg.body.user.id; made.push(o.id);

    await call('/company-profile', {
      method: 'PUT',
      body: JSON.stringify({
        name: o.company, gstin: o.gstin, stateCode: o.state,
        address: `${o.key} Road, Somewhere`, setup_completed_at: new Date().toISOString(),
      }),
    }, o.token);

    /* Each org's customer is in org A's state (33), so the SAME customer
       state is interstate for B and intra-state for A. If a document reads
       the wrong profile, the tax split flips. */
    const cust = await call('/customers', {
      method: 'POST',
      body: JSON.stringify({ name: `Buyer of ${o.key} ${stamp}`, gstin: `33ZZZZZ1234Z1Z5`, state: 'Tamil Nadu' }),
    }, o.token);
    o.customerId = cust.body?.id;
  }
  ok(ORGS.every(o => o.token && o.customerId), 'two organisations, different names, GSTINs and states');

  /* ── a quotation from each ─────────────────────────────── */
  console.log('\n  ── every document carries its own company');
  for (const o of ORGS) {
    const q = await call('/sales-quotations', {
      method: 'POST',
      body: JSON.stringify({
        customerId: o.customerId, gstRate: 18, notes: stamp,
        items: [{ description: 'Panel', quantity: 2, rate: 1000 }],
      }),
    }, o.token);
    if (!q.ok) { ok(false, `${o.key}: quotation refused — ${q.body.error}`); continue; }
    const full = (await call(`/sales-quotations/${q.body.id}`, {}, o.token)).body;
    ok(full.company?.name === o.company,
      `${o.key}: the quotation names ${o.company} → ${JSON.stringify(full.company?.name)}`);
    ok(full.company?.gstin === o.gstin,
      `${o.key}: and carries its own GSTIN → ${full.company?.gstin}`);

    /* The customer is in state 33. Org A is 33 (intra-state, CGST+SGST);
       org B is 29 (interstate, IGST). Reading the wrong profile flips it. */
    const expectInterstate = o.state !== '33';
    ok(!!full.interstate === expectInterstate,
      `${o.key}: taxed against its OWN state — ${expectInterstate ? 'IGST' : 'CGST+SGST'} ` +
      `(cgst ${full.cgst} sgst ${full.sgst} igst ${full.igst})`);
  }

  /* ── a delivery challan from each ──────────────────────── */
  for (const o of ORGS) {
    const dc = await call('/delivery-challans', {
      method: 'POST',
      body: JSON.stringify({
        customerId: o.customerId, notes: stamp,
        items: [{ description: 'Panel', quantity: 1, rate: 1000, uom: 'nos' }],
      }),
    }, o.token);
    if (!dc.ok) { ok(false, `${o.key}: challan refused — ${dc.body.error}`); continue; }
    const full = (await call(`/delivery-challans/${dc.body.id}`, {}, o.token)).body;
    ok(full.company?.name === o.company,
      `${o.key}: the challan names ${o.company} → ${JSON.stringify(full.company?.name)}`);
  }

  /* ── a credit note from each ───────────────────────────── */
  for (const o of ORGS) {
    const cn = await call('/credit-debit-notes', {
      method: 'POST',
      body: JSON.stringify({
        noteType: 'credit', partyType: 'customer', partyId: o.customerId,
        reason: stamp, gstRate: 18,
        items: [{ description: 'Short supply', quantity: 1, rate: 500 }],
      }),
    }, o.token);
    if (!cn.ok) { ok(false, `${o.key}: credit note refused — ${cn.body.error}`); continue; }
    const full = (await call(`/credit-debit-notes/${cn.body.id}`, {}, o.token)).body;
    ok(full.company?.name === o.company,
      `${o.key}: the credit note names ${o.company} → ${JSON.stringify(full.company?.name)}`);
  }

  /* ── the readiness banner reports YOUR setup ───────────── */
  console.log('\n  ── and readiness reports your own company');
  /* Org A fills in bank details; org B does not. B must still be told its
     bank details are missing — the counts used to be unscoped, so one
     company completing its profile marked every other company complete. */
  await call('/company-profile', {
    method: 'PUT',
    body: JSON.stringify({ bank_name: 'A Bank', bank_account_no: '111222333', bank_ifsc: 'AAAA0000111' }),
  }, ORGS[0].token);

  const rdyA = (await call('/setup/readiness', {}, ORGS[0].token)).body;
  const rdyB = (await call('/setup/readiness', {}, ORGS[1].token)).body;
  const bankDone = (r) => JSON.stringify(r).match(/"company_?[Bb]ank"?\s*:\s*(true|false|\d+)/)?.[1];
  ok(JSON.stringify(rdyA) !== JSON.stringify(rdyB),
    'the two organisations get different readiness answers');
  const bStillMissing = /bank/i.test(JSON.stringify(rdyB.items || rdyB.blockers || rdyB));
  ok(bStillMissing,
    "org B is still told its bank details are missing, though org A filled theirs in");

  /* ── clean up ──────────────────────────────────────────── */
  for (const o of ORGS) {
    for (const t of ['sales_quotations', 'delivery_challans', 'credit_debit_notes',
                     'customers', 'company_profile']) {
      await db.query(`DELETE FROM ${t} WHERE owner_id = $1`, [o.id]).catch(() => {});
    }
  }
  await db.query('DELETE FROM users WHERE id = ANY($1)', [made]).catch(() => {});
  const { rows: [left] } = await db.query(
    'SELECT COUNT(*) c FROM users WHERE email LIKE $1', [`%${stamp}@example.test`]);
  ok(Number(left.c) === 0, 'test organisations removed');

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('threw:', e.message); process.exit(1); });
