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

  /* ── 2. the other organisation sees NONE of it ─────────── */
  console.log('\n  ── a different organisation sees nothing');
  for (const [path, label] of [
    ['/customers?limit=50', 'customers'],
    ['/vendors?limit=50', 'vendors'],
    ['/inventory?limit=50', 'stock'],
    ['/sales-quotations?limit=50', 'quotations'],
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
  for (const t of ['customers', 'company_profile']) {
    await db.query(`DELETE FROM ${t} WHERE owner_id = ANY($1)`, [orgIds]).catch(() => {});
  }
  await db.query('DELETE FROM users WHERE id = ANY($1)', [made.filter(Boolean)]).catch(() => {});
  const { rows: [left] } = await db.query(
    'SELECT COUNT(*) c FROM users WHERE email LIKE $1', [`%${stamp}@example.test`]);
  ok(Number(left.c) === 0, 'test accounts removed');

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('threw:', e.message); process.exit(1); });
