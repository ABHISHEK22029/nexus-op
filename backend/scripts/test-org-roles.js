#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   A company defines its own role.

   role_definitions and role_permissions were global, so every organisation
   shared one set of seven roles. An Owner widening "Sales" would have
   widened it for every other business on the install — which is why
   /admin/roles was closed to them, and why a fabricator who wants a "Store
   keeper" had to ask a developer.

   Since migration 055 a role belongs to an organisation, or to nobody.
   This checks both halves:

     · a company can create a role, grant it, assign it, and the person
       holding it is actually limited to those grants
     · that role is invisible and untouchable to every other company, and
       a built-in shared by everyone still cannot be edited from here
   ══════════════════════════════════════════════════════════════════════ */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../db');

const API = process.env.API_BASE || 'http://localhost:5099';
if (/^https:|onrender\.com|vercel\.app/.test(API)) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}

const stamp = Date.now().toString(36);
const ROLE = `Storekeeper${stamp.slice(-4).toUpperCase()}`;
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };

const call = async (path, opts = {}, token) => {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts.headers || {}) },
  });
  const txt = await res.text();
  let body; try { body = JSON.parse(txt); } catch { body = { raw: txt.slice(0, 130) }; }
  return { status: res.status, ok: res.ok, body };
};
const rows = (b) => (Array.isArray(b) ? b : (b.items || b.roles || []));

const signUp = async (label) => {
  const email = `${label}-${stamp}@example.test`;
  const r = await call('/auth/register', {
    method: 'POST', body: JSON.stringify({ name: label, email, password: 'testpassword123' }),
  });
  if (!r.ok) throw new Error(`register ${email}: ${r.body.error || r.status}`);
  return { email, token: r.body.token, id: r.body.user.id };
};

(async () => {
  const made = [];
  console.log('');

  const a = await signUp('rolea');
  const b = await signUp('roleb');
  made.push(a.id, b.id);
  await call('/company-profile', {
    method: 'PUT', body: JSON.stringify({ name: `Kirashi ${stamp}`, setup_completed_at: new Date().toISOString() }),
  }, a.token);
  await call('/customers', { method: 'POST', body: JSON.stringify({ name: `Client ${stamp}` }) }, a.token);
  await call('/vendors', { method: 'POST', body: JSON.stringify({ name: `Supplier ${stamp}`, type: 'Supplier' }) }, a.token);
  ok(true, 'two organisations, each with an owner');

  /* ── the owner defines a role ───────────────────────────── */
  console.log('\n  ── a company defines its own role');
  const create = await call('/admin/roles', {
    method: 'POST',
    body: JSON.stringify({
      role: ROLE, label: 'Store keeper',
      description: 'Counts and issues stock. Reads the rest.',
      permissions: { inventory: ['read', 'write'], vendors: ['read'], customers: ['read'] },
    }),
  }, a.token);
  ok(create.ok, `an Owner can create a role — this used to be refused (${create.status})` +
    (create.ok ? '' : ` — ${create.body.error || ''}`));

  const listA = rows((await call('/admin/roles', {}, a.token)).body);
  const mine = listA.find(r => r.role === ROLE);
  ok(!!mine, `it appears in their own role list (${listA.length} roles)`);
  ok(mine?.isOwn === true, 'marked as theirs rather than built-in');
  ok(mine?.editable === true, 'and editable, unlike a built-in');
  const builtIn = listA.find(r => r.role === 'Sales');
  ok(builtIn && builtIn.editable === false,
    'a built-in role is listed but NOT editable — it is shared by every organisation');

  /* ── the other company cannot see or touch it ──────────── */
  console.log('\n  ── and it belongs to them alone');
  const listB = rows((await call('/admin/roles', {}, b.token)).body);
  ok(!listB.some(r => r.role === ROLE),
    `the other organisation does not see it (${listB.length} roles, none custom)`);

  const steal = await call(`/admin/roles/${ROLE}`, {
    method: 'PATCH', body: JSON.stringify({ permissions: { po: ['read', 'write', 'delete'] } }),
  }, b.token);
  ok(!steal.ok, `nor can they edit it (${steal.status})`);

  const widen = await call('/admin/roles/Sales', {
    method: 'PATCH', body: JSON.stringify({ permissions: { po: ['read', 'write', 'delete'] } }),
  }, a.token);
  ok(widen.status === 403,
    `and nobody can widen a built-in from here — it would widen it for every company (${widen.status})`);

  /* ── somebody holds it, and is limited by it ───────────── */
  console.log('\n  ── the person holding it is limited to those grants');
  const inv = await call('/admin/users', {
    method: 'POST',
    body: JSON.stringify({ name: 'Keeper', email: `keeper-${stamp}@example.test`, role: ROLE }),
  }, a.token);
  ok(inv.ok, `an employee can be given the new role (${inv.status})` +
    (inv.ok ? '' : ` — ${inv.body.error || ''}`));
  if (inv.body?.user?.id) made.push(inv.body.user.id);

  if (inv.ok) {
    const acc = await call('/auth/accept-invite', {
      method: 'POST', body: JSON.stringify({ token: inv.body.invite.token, password: 'keeperpass123' }),
    });
    ok(acc.ok, 'they accept and sign in');
    const t = acc.body?.token;

    const stock = await call('/inventory', {
      method: 'POST', body: JSON.stringify({ itemName: `Bolt ${stamp}`, quantity: 10, uom: 'nos' }),
    }, t);
    ok(stock.ok, `they can write stock, which the role grants (${stock.status})`);

    const cust = await call('/customers', {
      method: 'POST', body: JSON.stringify({ name: 'nope' }),
    }, t);
    ok(cust.status === 403, `but not customers, which it grants read-only (${cust.status})`);

    const po = await call('/po', {
      method: 'POST', body: JSON.stringify({ projectId: null, vendorId: 1, itemName: 'x', quantity: 1, unitPrice: 1 }),
    }, t);
    ok(po.status === 403, `and not purchase orders, which it does not grant at all (${po.status})`);

    const seen = rows((await call('/customers?limit=20', {}, t)).body);
    ok(seen.some(c => c.name === `Client ${stamp}`),
      `while still seeing the company's customers, as read allows (${seen.length})`);
  }

  /* ── clean up ──────────────────────────────────────────── */
  await db.query('DELETE FROM role_permissions WHERE role = $1', [ROLE]).catch(() => {});
  await db.query('DELETE FROM role_definitions WHERE role = $1', [ROLE]).catch(() => {});
  for (const o of [a.id, b.id]) {
    for (const t of ['customers', 'vendors', 'inventory', 'company_profile']) {
      await db.query(`DELETE FROM ${t} WHERE owner_id = $1`, [o]).catch(() => {});
    }
  }
  for (const [t, col] of [['customers', 'name'], ['vendors', 'name'], ['inventory', '"itemName"']]) {
    await db.query(`DELETE FROM ${t} WHERE ${col} LIKE $1`, [`%${stamp}`]).catch(() => {});
  }
  await db.query('DELETE FROM users WHERE id = ANY($1)', [made]).catch(() => {});
  const { rows: [left] } = await db.query(
    'SELECT COUNT(*) c FROM role_definitions WHERE role = $1', [ROLE]);
  ok(Number(left.c) === 0, 'test role and accounts removed');

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('threw:', e.message); process.exit(1); });
