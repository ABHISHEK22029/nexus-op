#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   An organisation is a group of people. Two things must both be true.

     1. An employee sees their EMPLOYER'S data — customers, vendors, stock.
        Before migration 052 every account was its own island: owner_id
        meant "whoever typed this in", so an employee created records their
        own company could not see, and saw none of the company's own.

     2. A different organisation sees NONE of it. This is the half that
        must never break. Scoping moved from the acting user to the
        organisation across 52 places, and a mistake in any of them leaks
        one business's customers to another.

   Creates two organisations with an employee each, checks both directions,
   and deletes everything.
   ══════════════════════════════════════════════════════════════════════ */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../db');
const { purgeOrg } = require('./lib/purgeOrg');

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
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  const txt = await res.text();
  let body; try { body = JSON.parse(txt); } catch { body = { raw: txt.slice(0, 120) }; }
  return { status: res.status, ok: res.ok, body };
};
const rows = (b) => (Array.isArray(b) ? b : (b.items || b.users || []));

const signUp = async (label) => {
  const email = `${label}-${stamp}@example.test`;
  const r = await call('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: `${label} founder`, email, password: 'testpassword123' }),
  });
  if (!r.ok) throw new Error(`could not register ${email}: ${r.body.error || r.status}`);
  return { email, token: r.body.token, id: r.body.user?.id };
};

(async () => {
  const made = [];
  console.log('');

  /* ── two organisations ─────────────────────────────────── */
  const orgA = await signUp('orga');
  const orgB = await signUp('orgb');
  made.push(orgA.id, orgB.id);
  ok(!!orgA.token && !!orgB.token, 'two founders registered');

  /* Each names their company. */
  for (const [o, name] of [[orgA, `Kirashi ${stamp}`], [orgB, `Rival ${stamp}`]]) {
    await call('/company-profile', {
      method: 'PUT',
      body: JSON.stringify({ name, employee_count: '2–10', setup_completed_at: new Date().toISOString() }),
    }, o.token);
  }

  /* ── the founder is the one who administers ────────────── */
  const meA = (await call('/auth/me', {}, orgA.token)).body;
  ok(['Owner', 'Administrator'].includes(meA.role),
    `the founder can administer their own organisation → role ${meA.role}`);

  /* ── founder A adds an employee ────────────────────────── */
  const empEmail = `emp-${stamp}@example.test`;
  const add = await call('/admin/users', {
    method: 'POST',
    body: JSON.stringify({ name: 'Ramesh', email: empEmail, password: 'employeepass123', role: 'Sales' }),
  }, orgA.token);
  ok(add.ok, `the founder can add an employee (${add.status})` + (add.ok ? '' : ` — ${add.body.error || ''}`));
  const empId = add.body?.user?.id;
  if (empId) made.push(empId);

  /* Granting the cross-tenant platform role must be refused. */
  const escalate = await call('/admin/users', {
    method: 'POST',
    body: JSON.stringify({ name: 'Sneaky', email: `esc-${stamp}@example.test`, password: 'password12345', role: 'Administrator' }),
  }, orgA.token);
  ok(!escalate.ok, `a founder cannot grant the platform-wide Administrator role (${escalate.status})`);
  if (escalate.body?.user?.id) made.push(escalate.body.user.id);

  const empLogin = await call('/auth/login', {
    method: 'POST', body: JSON.stringify({ email: empEmail, password: 'employeepass123' }),
  });
  ok(empLogin.ok, 'the employee can sign in');
  const empToken = empLogin.body?.token;

  /* ── org A creates a customer ──────────────────────────── */
  const custA = await call('/customers', {
    method: 'POST', body: JSON.stringify({ name: `Customer of A ${stamp}` }),
  }, orgA.token);
  ok(custA.ok, `the founder creates a customer (${custA.status})`);

  /* ── 1. the employee SEES their employer's data ────────── */
  console.log('\n  ── an employee sees the company');
  const empSees = rows((await call('/customers?limit=50', {}, empToken)).body);
  ok(empSees.some(c => c.name === `Customer of A ${stamp}`),
    `the employee sees the customer their employer created (${empSees.length} visible)`);

  /* And what the employee creates belongs to the company, not to them. */
  const custByEmp = await call('/customers', {
    method: 'POST', body: JSON.stringify({ name: `Customer by employee ${stamp}` }),
  }, empToken);
  ok(custByEmp.ok, 'the employee can create a customer');
  const founderSees = rows((await call('/customers?limit=50', {}, orgA.token)).body);
  ok(founderSees.some(c => c.name === `Customer by employee ${stamp}`),
    'and the founder sees what the employee created');

  /* ── the contracting chain, so there is something to leak ──
     These four lists — BOQ, the measurement book, indents and RA bills —
     had NO ownership condition at all, and this test passed anyway: it
     swept them for org A's records and found none, because org A had
     never created any. An isolation check over an empty table proves
     nothing. So build the chain first and assert org A can see its own,
     which turns a vacuous pass into a real one.

     A project, a work order against a vendor, a BOQ line, a measurement
     against it, an indent, and the RA bill the measurement generates. */
  const projA = await call('/projects', {
    method: 'POST', body: JSON.stringify({
      name: `Site A ${stamp}`, clientName: `Client A ${stamp}`, type: 'Civil', status: 'Active',
    }),
  }, orgA.token);
  const vendA = await call('/vendors', {
    /* `type` is required — without it the vendor create 400s, the work
       order then inserts a null vendorId and 500s, and everything
       downstream fails for a reason three steps removed from the cause. */
    method: 'POST', body: JSON.stringify({ name: `Subcontractor A ${stamp}`, type: 'Subcontractor' }),
  }, orgA.token);
  const woA = await call('/work-orders', {
    method: 'POST', body: JSON.stringify({
      projectId: projA.body?.id, vendorId: vendA.body?.id, name: `Earthworks A ${stamp}`,
    }),
  }, orgA.token);
  const boqA = await call('/boq', {
    method: 'POST', body: JSON.stringify({
      projectId: projA.body?.id, itemCode: `BQ-${stamp}`, description: `Excavation ${stamp}`,
      unit: 'Cum', estimatedQuantity: 500, rate: 240,
    }),
  }, orgA.token);
  const mbA = await call('/mb', {
    method: 'POST', body: JSON.stringify({
      projectId: projA.body?.id, workOrderId: woA.body?.id, boqId: boqA.body?.id,
      chainage: `CH ${stamp}`, length: 10, width: 4, depth: 2.5, measuredQuantity: 100,
    }),
  }, orgA.token);
  const indA = await call('/indent', {
    method: 'POST', body: JSON.stringify({
      projectId: projA.body?.id, workOrderId: woA.body?.id, boqId: boqA.body?.id,
      requestedQuantity: 60, requiredDate: '2026-12-01', chainage: `CH ${stamp}`,
    }),
  }, orgA.token);
  const billA = await call('/bills/generate', {
    method: 'POST', body: JSON.stringify({
      projectId: projA.body?.id, workOrderId: woA.body?.id,
    }),
  }, orgA.token);
  ok(woA.ok && boqA.ok && mbA.ok && indA.ok,
    `org A builds a contracting chain — WO ${woA.status}, BOQ ${boqA.status}, MB ${mbA.status}, indent ${indA.status}`);
  ok(billA.ok, `and an RA bill against the measurement (${billA.status})`);

  /* A list being scoped is not the same as a record being protected. Ids
     are small integers, so org B can simply name org A's work order.
     Generating a bill against it would hand back org A's measured
     quantities, rates and subcontractor.

     Note the shape: org B's OWN project id with org A's work order id.
     Sending org A's project too is refused by the existing project guard,
     which makes the test pass without the work order ever being checked —
     a green light for a hole that is still open. This pairing is the one
     that reaches the work-order lookup. */
  const projB = await call('/projects', {
    method: 'POST', body: JSON.stringify({
      name: `Site B ${stamp}`, clientName: `Client B ${stamp}`, type: 'Civil', status: 'Active',
    }),
  }, orgB.token);
  const steal = await call('/bills/generate', {
    method: 'POST', body: JSON.stringify({
      projectId: projB.body?.id, workOrderId: woA.body?.id,
    }),
  }, orgB.token);
  ok(steal.status === 404,
    `org B cannot bill against org A's work order by id (${steal.status})`);

  /* Org A must see its own — otherwise the "org B sees nothing" checks
     below are satisfied by the records being invisible to everyone. */
  for (const [path, label, needle] of [
    ['/boq?limit=50', 'its BOQ line', `Excavation ${stamp}`],
    ['/mb?limit=50', 'its measurement', `CH ${stamp}`],
    ['/indent?limit=50', 'its indent', `CH ${stamp}`],
    ['/bills?limit=50', 'its RA bill', stamp],
  ]) {
    const mine = rows((await call(path, {}, orgA.token)).body);
    ok(mine.some(r => JSON.stringify(r).includes(needle)),
      `org A sees ${label} (${mine.length} rows)`);
  }

  /* ── 2. the other organisation sees NONE of it ─────────── */
  console.log('\n  ── a different organisation sees nothing');
  for (const [path, label] of [
    ['/customers?limit=50', 'customers'],
    ['/vendors?limit=50', 'vendors'],
    ['/inventory?limit=50', 'stock'],
    ['/sales-quotations?limit=50', 'quotations'],
    /* The four that were open. An RA bill carries what a subcontractor
       is owed and what was deducted from them — the most private thing
       in the contracting set, and it was readable by anyone. */
    ['/boq?limit=50', 'bills of quantities'],
    ['/mb?limit=50', 'the measurement book'],
    ['/indent?limit=50', 'indents'],
    ['/bills?limit=50', 'RA bills'],
  ]) {
    const seen = rows((await call(path, {}, orgB.token)).body);
    const leaked = seen.filter(r => JSON.stringify(r).includes(stamp));
    ok(leaked.length === 0,
      `${label}: org B sees none of org A's records (${seen.length} rows, ${leaked.length} leaked)`);
  }

  const bUsers = rows((await call('/admin/users', {}, orgB.token)).body);
  const leakedPeople = bUsers.filter(u => String(u.email || '').includes(stamp) && !String(u.email).startsWith('orgb-'));
  ok(leakedPeople.length === 0,
    `org B's people directory shows only its own staff (${bUsers.length} rows, ${leakedPeople.length} foreign)`);

  /* ── 3. org B cannot act on org A's people ─────────────── */
  if (empId) {
    const steal = await call(`/admin/users/${empId}/reset-password`, {
      method: 'POST', body: JSON.stringify({ password: 'hijacked12345' }),
    }, orgB.token);
    ok(!steal.ok, `org B cannot reset the password of org A's employee (${steal.status})`);

    const reRole = await call(`/admin/users/${empId}/role`, {
      method: 'PATCH', body: JSON.stringify({ role: 'Viewer' }),
    }, orgB.token);
    ok(!reRole.ok, `nor change their role (${reRole.status})`);
  }

  /* ── clean up ──────────────────────────────────────────── */
  const orgIds = [orgA.id, orgB.id].filter(Boolean);
  /* Child rows before parents, or a foreign key holds the whole chain in
     place and the accounts survive the run — which is how a test leaves
     litter in a shared database. The order is worked out from the schema
     rather than listed here, so it stays right as tables are added. */
  const { blocked } = await purgeOrg(db, orgIds);
  if (blocked.length) console.log(`   ⚠️  could not clear: ${blocked.join(', ')}`);
  await db.query('DELETE FROM users WHERE id = ANY($1)', [made.filter(Boolean)]).catch(() => {});
  const { rows: [left] } = await db.query(
    'SELECT COUNT(*) c FROM users WHERE email LIKE $1', [`%${stamp}@example.test`]);
  ok(Number(left.c) === 0, 'test accounts removed');

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('threw:', e.message); process.exit(1); });
