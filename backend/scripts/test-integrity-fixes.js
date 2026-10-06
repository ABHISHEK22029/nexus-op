#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   Four bugs found while testing everything else, each now a check:

   1. Purchase order numbers came in two formats off one counter — the
      shortfall planner wrote PO-0004 between PFW/FY2026-27/003 and /005.
   2. A PO and its lines were saved by two separate requests, so a failure
      between them left a purchase order with no lines on it.
   3. The recurring scheduler read due schedules without a lock: two
      passes at once (two instances, or "Run now" during the hourly pass)
      generated the same invoice twice.
   4. A file could be attached to another company's record by its id.

   Runs against a local backend with throwaway accounts it deletes again.
   Refuses to run against a deployed host.
   ══════════════════════════════════════════════════════════════════════ */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Client } = require('pg');
const { purgeOrg } = require('./lib/purgeOrg');
const { allocatePoNumber } = require('../shared/docNumber');

const API = process.env.API_BASE || 'http://localhost:5099';
if (/^https:|onrender\.com|vercel\.app|maksops\.co\.in/.test(API)) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}
const stamp = Date.now().toString(36);
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };
const db = () => new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function cleanup() {
  const c = db(); await c.connect();
  try {
    const { rows } = await c.query(`SELECT id FROM users WHERE email LIKE 'fixes-%@example.test'`);
    const ids = rows.map(r => r.id);
    if (!ids.length) return 0;
    await purgeOrg(c, ids);
    await c.query('DELETE FROM document_sequences WHERE owner_id = ANY($1)', [ids]).catch(() => {});
    return (await c.query(`DELETE FROM users WHERE id = ANY($1) AND email LIKE '%@example.test'`, [ids])).rowCount;
  } finally { await c.end(); }
}

(async () => {
  await cleanup();
  const reg = async (tag) => (await fetch(`${API}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Fix', email: `fixes-${tag}-${stamp}@example.test`, password: 'testpassword123' }) })).json();
  const A = await reg('a'), B = await reg('b');
  const H = (r) => ({ Authorization: `Bearer ${r.token}`, 'Content-Type': 'application/json' });
  const api = async (who, method, url, body) => {
    const r = await fetch(`${API}${url}`, { method, headers: H(who), body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  try {
    await api(A, 'PUT', '/company-profile', { name: 'Precision Fab Works', gstin: '36AAMCK2569F1Z9', stateCode: '36' });
    const proj = (await api(A, 'POST', '/projects', { name: `Fix project ${stamp}`, clientName: 'C', type: 'Infrastructure' })).body;
    const vendor = (await api(A, 'POST', '/vendors', { name: `Fix vendor ${stamp}`, type: 'Supplier' })).body;

    console.log('\n  ── 1. one purchase order series');
    const c = db(); await c.connect();
    const owner = A.user.id;
    const n1 = await allocatePoNumber(c, owner);
    const n2 = await allocatePoNumber(c, owner);
    await c.end();
    const shape = /^[A-Z0-9-]+\/FY\d{4}(-\d{2})?\/\d{3,}$/;
    ok(shape.test(n1) && shape.test(n2), `every path numbers POs the same way: ${n1}, ${n2}`);
    ok(Number(n2.split('/').pop()) === Number(n1.split('/').pop()) + 1, 'consecutive, off the one counter');
    const viaScreen = (await api(A, 'POST', '/po', { projectId: proj.id, vendorId: vendor.id, itemName: 'SS304 sheet', quantity: 10, unitPrice: 260,
      items: [{ sno: 1, description: 'SS304 sheet, 2 mm', uom: 'Kg', quantity: 10, unitPrice: 260 }] })).body;
    ok(shape.test(viaScreen.poNumber || '') && Number(viaScreen.poNumber.split('/').pop()) === Number(n2.split('/').pop()) + 1,
      `the PO screen continues the same series (${viaScreen.poNumber})`);
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'controllers', 'ShortfallToPoController.js'), 'utf8');
    ok(/allocatePoNumber\(/.test(src) && !/`PO-\$\{/.test(src), 'and the shortfall planner uses it too — no more PO-0004 in the middle');

    console.log('\n  ── 2. a PO and its lines, all or nothing');
    ok(viaScreen.linesSaved === true, 'the lines are saved in the same request as the PO');
    const lines = (await api(A, 'GET', `/po/${viaScreen.id}/items`)).body;
    ok(Array.isArray(lines) && lines.length === 1 && Number(lines[0].unitPrice) === 260, 'and they are there');
    const count = async () => { const k = db(); await k.connect(); const r = await k.query('SELECT count(*)::int n FROM purchase_orders WHERE owner_id = $1', [owner]); await k.end(); return r.rows[0].n; };
    const before = await count();
    const broken = await api(A, 'POST', '/po', { projectId: proj.id, vendorId: vendor.id, itemName: 'Bad', quantity: 1, unitPrice: 1,
      items: [{ sno: 1, description: 'Bad line', uom: 'Nos', quantity: 'not-a-number', unitPrice: 5 }] });
    ok(broken.status === 400 && /quantity/.test(broken.body.error || '') && (await count()) === before, `a bad line is refused with a reason and no PO is left behind (${broken.status}: ${broken.body.error})`);
    const legacy = await api(A, 'POST', '/po', { projectId: proj.id, vendorId: vendor.id, itemName: 'Header only', quantity: 2, unitPrice: 50 });
    ok(legacy.status === 200 && !legacy.body.linesSaved, 'a PO sent without lines still works, as before');

    console.log('\n  ── 3. the scheduler cannot generate twice');
    const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
    const prof = await api(A, 'POST', '/recurring', { docType: 'expense', title: `Rent ${stamp}`, amount: 4500, frequency: 'monthly', nextRun: today });
    ok(prof.status === 200, 'a schedule due today is set up');
    const [r1, r2] = await Promise.all([api(A, 'POST', '/recurring/run-now'), api(A, 'POST', '/recurring/run-now')]);
    const k = db(); await k.connect();
    const runs = (await k.query('SELECT count(*)::int n FROM recurring_runs WHERE profile_id = $1', [prof.body.id])).rows[0].n;
    const next = (await k.query('SELECT next_run FROM recurring_profiles WHERE id = $1', [prof.body.id])).rows[0].next_run;
    await k.query('DELETE FROM recurring_runs WHERE profile_id = $1', [prof.body.id]);
    await k.end();
    ok(runs === 1 && (r1.body.generated || 0) + (r2.body.generated || 0) === 1,
      `two passes at once generate it exactly once (${runs} run, ${(r1.body.generated || 0) + (r2.body.generated || 0)} generated)`);
    ok(new Date(next) > new Date(today), 'and the schedule has moved on to its next date');

    console.log('\n  ── 4. attachments belong to their record\'s owner');
    const cust = (await api(A, 'POST', '/customers', { name: `Fix customer ${stamp}`, state: 'Telangana', billing_address: 'Hyderabad' })).body;
    const inv = (await api(A, 'POST', '/sales-invoices', { customerId: cust.id, items: [{ description: 'Bracket', quantity: 1, rate: 100 }] })).body;
    const attach = async (who, type, id) => {
      const fd = new FormData();
      fd.append('file', new Blob(['%PDF-1.4 test']), 'po.pdf'); fd.append('entityType', type); fd.append('entityId', String(id));
      const r = await fetch(`${API}/attachments`, { method: 'POST', headers: { Authorization: `Bearer ${who.token}` }, body: fd });
      return r.status;
    };
    ok(await attach(A, 'sales_invoice', inv.id) === 200, 'a file attaches to your own invoice');
    ok(await attach(B, 'sales_invoice', inv.id) === 404, 'but not to another company\'s');
    ok(await attach(A, 'anything_at_all', inv.id) === 400, 'and not to a record type that does not exist');
  } catch (e) {
    fail++; console.log('   ❌ threw:', e.message);
  } finally {
    const n = await cleanup();
    ok(n === 2, `test accounts removed (${n})`);
  }
  console.log(`\n   ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
