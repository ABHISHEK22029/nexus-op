#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   A new employee signs in. Do they see the right things?

   Two separate questions, and passing one while failing the other is the
   dangerous case:

     1. Do they see THE COMPANY'S data? Scoping is by organisation, so a
        Sales hire on their first day must find the customers and stock that
        were there before them — not an empty screen. An ERP where each
        person sees only what they typed is not an ERP.

     2. Is what they may DO limited by their role? Sales may write
        customers and must not raise a purchase order. Procurement is the
        other way round. A Viewer writes nothing. And none of them may add
        people — that is the owner's.

   Three employees are invited on three different roles, each accepts, and
   every combination is checked from their own session.
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
  let body; try { body = JSON.parse(txt); } catch { body = { raw: txt.slice(0, 120) }; }
  return { status: res.status, ok: res.ok, body };
};
const rows = (b) => (Array.isArray(b) ? b : (b.items || b.users || []));

(async () => {
  const made = [];
  console.log('');

  /* ── the company, with work already in it ──────────────── */
  const founderEmail = `boss-${stamp}@example.test`;
  const reg = await call('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Boss', email: founderEmail, password: 'testpassword123' }),
  });
  if (!reg.ok) { console.error('register failed:', reg.body); process.exit(1); }
  made.push(reg.body.user.id);
  const owner = reg.body.token;
  const orgId = reg.body.user.id;

  await call('/company-profile', {
    method: 'PUT', body: JSON.stringify({ name: `Kirashi ${stamp}`, setup_completed_at: new Date().toISOString() }),
  }, owner);

  await call('/customers', { method: 'POST', body: JSON.stringify({ name: `Client ${stamp}` }) }, owner);
  await call('/vendors', { method: 'POST', body: JSON.stringify({ name: `Supplier ${stamp}`, type: 'Supplier' }) }, owner);
  await call('/inventory', {
    method: 'POST', body: JSON.stringify({ itemName: `Plate ${stamp}`, quantity: 40, uom: 'nos' }),
  }, owner);
  ok(true, `company set up with a customer, a vendor and stock`);

  /* ── three hires, three roles ──────────────────────────── */
  const hire = async (label, role) => {
    const email = `${label}-${stamp}@example.test`;
    const inv = await call('/admin/users', {
      method: 'POST', body: JSON.stringify({ name: label, email, role }),
    }, owner);
    if (!inv.ok) { ok(false, `could not invite ${role}: ${inv.body.error}`); return null; }
    made.push(inv.body.user.id);
    const acc = await call('/auth/accept-invite', {
      method: 'POST', body: JSON.stringify({ token: inv.body.invite.token, password: 'employeepass1' }),
    });
    if (!acc.ok) { ok(false, `${role} could not accept: ${acc.body.error}`); return null; }
    return { role, email, token: acc.body.token };
  };

  const sales = await hire('sales', 'Sales');
  const proc = await hire('proc', 'Procurement');
  const view = await hire('view', 'Viewer');
  ok(!!(sales && proc && view), 'three employees invited and accepted, on three roles');

  /* ══ 1. THEY SEE THE COMPANY ═══════════════════════════════
     The half that would leave a new hire staring at an empty product. */
  console.log('\n  ── what a new employee finds on day one');
  for (const emp of [sales, proc, view]) {
    if (!emp) continue;
    const cust = rows((await call('/customers?limit=50', {}, emp.token)).body);
    const vend = rows((await call('/vendors?limit=50', {}, emp.token)).body);
    const stk = rows((await call('/inventory?limit=50', {}, emp.token)).body);
    ok(cust.some(c => c.name === `Client ${stamp}`) &&
       vend.some(v => v.name === `Supplier ${stamp}`) &&
       stk.some(s => s.itemName === `Plate ${stamp}`),
      `${emp.role}: sees the customer, vendor and stock that were already there ` +
      `(${cust.length}/${vend.length}/${stk.length})`);
  }

  /* ══ 2. WHAT THEY MAY DO IS LIMITED BY ROLE ════════════════ */
  console.log('\n  ── and what each may change');

  /* Sales: customers yes, purchase orders no. */
  if (sales) {
    const c = await call('/customers', {
      method: 'POST', body: JSON.stringify({ name: `Sold-by-sales ${stamp}` }),
    }, sales.token);
    ok(c.ok, `Sales can add a customer (${c.status})`);

    const po = await call('/po', {
      method: 'POST',
      body: JSON.stringify({ projectId: null, vendorId: 1, itemName: 'x', quantity: 1, unitPrice: 1 }),
    }, sales.token);
    ok(po.status === 403, `Sales cannot raise a purchase order (${po.status})`);

    const v = await call('/vendors', {
      method: 'POST', body: JSON.stringify({ name: 'nope', type: 'Supplier' }),
    }, sales.token);
    ok(v.status === 403, `nor add a vendor — they may read them, not change them (${v.status})`);
  }

  /* Procurement: the mirror image. */
  if (proc) {
    const v = await call('/vendors', {
      method: 'POST', body: JSON.stringify({ name: `Supplier2 ${stamp}`, type: 'Supplier' }),
    }, proc.token);
    ok(v.ok, `Procurement can add a vendor (${v.status})`);

    const c = await call('/customers', {
      method: 'POST', body: JSON.stringify({ name: 'nope' }),
    }, proc.token);
    ok(c.status === 403, `but cannot add a customer (${c.status})`);
  }

  /* Viewer: reads everything, writes nothing. */
  if (view) {
    for (const [path, label] of [['/customers', 'a customer'], ['/vendors', 'a vendor']]) {
      const r = await call(path, { method: 'POST', body: JSON.stringify({ name: 'nope', type: 'Supplier' }) }, view.token);
      ok(r.status === 403, `Viewer cannot create ${label} (${r.status})`);
    }
    const read = await call('/customers?limit=5', {}, view.token);
    ok(read.ok, `but reads them fine (${read.status})`);
  }

  /* ══ 3. NOBODY BUT THE OWNER ADDS PEOPLE ═══════════════════ */
  console.log('\n  ── adding people stays with the owner');
  for (const emp of [sales, proc, view]) {
    if (!emp) continue;
    const r = await call('/admin/users', {
      method: 'POST', body: JSON.stringify({ name: 'Sneak', email: `sneak-${emp.role}-${stamp}@example.test`, role: 'Owner' }),
    }, emp.token);
    ok(r.status === 403, `${emp.role} cannot add an employee (${r.status})`);
    if (r.body?.user?.id) made.push(r.body.user.id);
  }

  /* ══ 4. WORK FLOWS BETWEEN THEM ════════════════════════════
     What one person creates, their colleagues and their employer see. */
  console.log('\n  ── one company, one set of records');
  const ownerSees = rows((await call('/customers?limit=50', {}, owner)).body);
  ok(ownerSees.some(c => c.name === `Sold-by-sales ${stamp}`),
    "the owner sees the customer Sales added");
  if (proc) {
    const procSees = rows((await call('/customers?limit=50', {}, proc.token)).body);
    ok(procSees.some(c => c.name === `Sold-by-sales ${stamp}`),
      'and so does a colleague on a different role');
  }
  if (sales) {
    const salesSees = rows((await call('/vendors?limit=50', {}, sales.token)).body);
    ok(salesSees.some(v => v.name === `Supplier2 ${stamp}`),
      'Sales sees the vendor Procurement added, even though they could not add one');
  }

  /* ── clean up ──────────────────────────────────────────── */
  /* By owner AND by name. Deleting on owner_id alone left four vendors
     behind when POST /vendors was not setting one — the cleanup could not
     match a NULL. */
  for (const t of ['customers', 'vendors', 'inventory', 'company_profile']) {
    await db.query(`DELETE FROM ${t} WHERE owner_id = $1`, [orgId]).catch(() => {});
  }
  for (const [t, col] of [['customers', 'name'], ['vendors', 'name'], ['inventory', '"itemName"']]) {
    await db.query(`DELETE FROM ${t} WHERE ${col} LIKE $1`, [`%${stamp}`]).catch(() => {});
  }
  await db.query('DELETE FROM users WHERE id = ANY($1)', [made]).catch(() => {});
  const { rows: [left] } = await db.query(
    'SELECT COUNT(*) c FROM users WHERE email LIKE $1', [`%${stamp}@example.test`]);
  ok(Number(left.c) === 0, 'test accounts removed');

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('threw:', e.message); process.exit(1); });
