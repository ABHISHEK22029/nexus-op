#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   Vendors from a spreadsheet (POST /vendors/import).

   The Import button on Vendors used to send nothing and say "Import
   queued". Checks: the usual headings are recognised below a title row,
   good rows are added to this company only, bad and duplicate rows are
   skipped with a reason, a re-upload adds nothing, a Viewer can't import,
   and a sheet with no vendor column is refused.

   Run against a local backend with SCHEDULER=off. Throwaway accounts,
   deleted again. Refuses to run against a deployed host.
   ══════════════════════════════════════════════════════════════════════ */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { purge } = require('./lib/testAccounts');

const API = process.env.API_BASE || 'http://localhost:5099';
if (/^https:|onrender\.com|vercel\.app|maksops\.co\.in/.test(API)) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}
const stamp = Date.now().toString(36);
const PASS = 'testpassword123';
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };
const call = async (who, method, url, body) => {
  const r = await fetch(`${API}${url}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${who.token}` }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const send = async (who, name, text) => {
  const fd = new FormData();
  fd.append('file', new Blob([text], { type: 'text/csv' }), name);
  const r = await fetch(`${API}/vendors/import`, { method: 'POST', headers: { Authorization: `Bearer ${who.token}` }, body: fd });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const register = async (tag) => {
  const email = `vimp-${tag}-${stamp}@example.test`;
  const r = await fetch(`${API}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: `Vimp ${tag}`, email, password: PASS }) });
  const b = await r.json();
  return { token: b.token, id: b.user?.id };
};

const SHEET = [
  'Supplier list — Oct 2026,,,,,',
  ',,,,,',
  'Supplier Name,GSTIN No.,Mobile No,Email ID,City,What they supply',
  `Sri Venkateswara Steels ${stamp},36ABCDE1234F1Z5,9000000002,sales@svsteels.example.test,Hyderabad,MS plate; SS304 sheet`,
  `Deccan Fasteners ${stamp},,9000000003,,Secunderabad,Bolts and nuts`,
  `,36ABCDE5678G1Z3,9000000004,,,`,
  `Bad Phone Traders ${stamp},,12345,,,`,
  `Bad GSTIN Traders ${stamp},36ABCDE1234,,,,`,
  `deccan fasteners ${stamp},,9000000005,,,Duplicate by name`,
].join('\n');

(async () => {
  const ids = [];
  try {
    const A = await register('a'); ids.push(A.id);
    const B = await register('b'); ids.push(B.id);

    console.log('\n  ── a supplier list with a title row above the headings');
    const r = await send(A, 'suppliers.csv', SHEET);
    ok(r.status === 200 && r.body.added === 2, `two good rows added (${r.status}, added ${r.body.added}${r.body.error ? `, ${r.body.error}` : ''})`);
    const reasons = (r.body.skipped || []).map((s) => `${s.row}:${s.reason}`);
    ok(reasons.length === 4, `four rows skipped, each with a reason (${reasons.join(' | ')})`);
    ok(reasons.some((x) => /^6:No vendor name/.test(x)), 'a row with no name is skipped');
    ok(reasons.some((x) => /^7:Phone/.test(x)) && reasons.some((x) => /^8:GSTIN/.test(x)), 'a bad phone and a bad GSTIN are skipped with the field named');
    ok(reasons.some((x) => /^9:Already a vendor by this name/.test(x)), 'the same name twice in one sheet is added once');

    const list = await call(A, 'GET', `/vendors?search=${stamp}&limit=50`);
    const rows = list.body.items || list.body;
    const sv = rows.find((v) => /Venkateswara/.test(v.name));
    ok(sv && sv.gstin === '36ABCDE1234F1Z5' && sv.contactPhone === '9000000002' && sv.city === 'Hyderabad' && /SS304/.test(sv.supplies || ''),
      'the columns land in the right fields (GSTIN, phone, city, supplies)');
    ok(sv && sv.type === 'Material Supplier', `a vendor with no type column is a Material Supplier (${sv?.type})`);

    console.log('\n  ── uploading the same list again');
    const again = await send(A, 'suppliers.csv', SHEET);
    ok(again.status === 200 && again.body.added === 0 && (again.body.skipped || []).some((s) => /GSTIN 36ABCDE1234F1Z5/.test(s.reason)),
      `nothing is added twice (added ${again.body.added})`);

    console.log('\n  ── companies and roles');
    const other = await call(B, 'GET', `/vendors?search=${stamp}&limit=50`);
    const otherRows = other.body.items || other.body;
    ok(Array.isArray(otherRows) && otherRows.length === 0, 'another company sees none of them');
    const toB = await send(B, 'suppliers.csv', SHEET);
    ok(toB.body.added === 2, 'and can import the same suppliers for itself');
    const vEmail = `vimp-viewer-${stamp}@example.test`;
    const made = await call(A, 'POST', '/admin/users', { name: 'Viewer', email: vEmail, password: PASS, role: 'Viewer' });
    const vl = await (await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: vEmail, password: PASS }) })).json();
    ids.push(made.body.id ?? made.body.user?.id ?? vl.user?.id);
    const asViewer = await send({ token: vl.token }, 'suppliers.csv', SHEET);
    ok(asViewer.status === 403, `a Viewer can't import (${asViewer.status})`);

    console.log('\n  ── sheets it should refuse');
    const noName = await send(A, 'x.csv', 'Item,Qty,Rate\nBolt,5,10\n');
    ok(noName.status === 400 && /Vendor name/.test(noName.body.error || ''), 'a sheet with no vendor column is refused, saying what it needs');
    const nothing = await fetch(`${API}/vendors/import`, { method: 'POST', headers: { Authorization: `Bearer ${A.token}` } });
    ok(nothing.status === 400, 'no file is refused');
  } catch (e) {
    fail++; console.log(`   ❌ crashed: ${e.stack || e.message}`);
  } finally {
    const removed = await purge(ids.filter(Boolean)).catch((e) => { console.log('   cleanup failed:', e.message); return 0; });
    console.log(`\n   ✅ test accounts removed (${removed})`);
    console.log(`\n  ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
})();
