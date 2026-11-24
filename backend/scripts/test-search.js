#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   Search everywhere (GET /search) — the Ctrl K box in the top bar.

     every kind of record answers, each with where it opens
     words match in any order, every word must appear
     % and _ are just characters, not wildcards
     only this company's records; another company finds nothing
     only the kinds the role may read: Sales sees no purchase orders
     a few of each kind, with the true count
     no sign-in, no search

   Local backend (SCHEDULER=off) and throwaway @example.test companies that
   are deleted at the end. Refuses a deployed host.
     API_BASE=http://localhost:5097 node scripts/test-search.js
   ══════════════════════════════════════════════════════════════════════ */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Client } = require('pg');
const { purgeOrg } = require('./lib/purgeOrg');

const API = process.env.API_BASE || 'http://localhost:5099';
if (/^https:|onrender\.com|vercel\.app|maksops\.co\.in/.test(API)) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}
const stamp = Date.now().toString(36);
const PASS = 'testpassword123';
const today = new Date().toISOString().slice(0, 10);
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };
const section = (t) => console.log(`\n  ── ${t}`);
const db = () => new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function cleanup() {
  const c = db(); await c.connect();
  try {
    const { rows } = await c.query(`SELECT id, org_id FROM users WHERE email LIKE 'srch-%@example.test'`);
    const ids = [...new Set(rows.flatMap(r => [r.id, r.org_id]).filter(Boolean))];
    if (!ids.length) return 0;
    for (let i = 0; i < 5; i++) { const r = await purgeOrg(c, ids); if (!r.deleted) break; }
    await c.query('DELETE FROM document_sequences WHERE owner_id = ANY($1)', [ids]).catch(() => {});
    await c.query('DELETE FROM notifications WHERE user_id = ANY($1)', [rows.map(r => r.id)]).catch(() => {});
    await c.query(`DELETE FROM users WHERE email LIKE 'srch-%@example.test' AND id <> org_id`);
    return (await c.query(`DELETE FROM users WHERE email LIKE 'srch-%@example.test'`)).rowCount;
  } finally { await c.end(); }
}

const call = async (who, method, url, body) => {
  const r = await fetch(`${API}${url}`, {
    method, headers: { ...(who?.token ? { Authorization: `Bearer ${who.token}` } : {}), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const register = async (tag) => (await fetch(`${API}/auth/register`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: `Search ${tag}`, email: `srch-${tag}-${stamp}@example.test`, password: PASS }),
})).json();
const member = async (owner, tag, role) => {
  const inv = await call(owner, 'POST', '/admin/users', { name: `Search ${tag}`, email: `srch-${tag}-${stamp}@example.test`, role });
  if (!inv.body?.invite?.token) return { error: inv.body?.error || inv.status };
  const acc = await call(null, 'POST', '/auth/accept-invite', { token: inv.body.invite.token, password: PASS });
  return { token: acc.body?.token, id: inv.body.user?.id };
};
const search = (who, q, extra = '') => call(who, 'GET', `/search?q=${encodeURIComponent(q)}${extra}`);
const kinds = (r) => (r.body.groups || []).map(g => g.kind);
const group = (r, k) => (r.body.groups || []).find(g => g.kind === k);

(async () => {
  await cleanup();
  const A = await register('a'), B = await register('b');
  try {
    if (!A.token || !B.token) throw new Error(`could not register: ${A.error || B.error}`);
    const T = `zq${stamp}`;      // one word nothing else in the database has

    section('Records to find');
    const cust = (await call(A, 'POST', '/customers', { name: `Zephyr Works ${T}`, state: 'Telangana', shipping_state: 'Telangana' })).body;
    const vend = (await call(A, 'POST', '/vendors', { name: `Zephyr Steel ${T}`, type: 'Supplier' })).body;
    const sku = (await call(A, 'POST', '/skus', { sku_code: `SK-${T}`, name: `Gate ${T}`, unit: 'nos', price: 900, hsn: '7308' })).body;
    const mat = (await call(A, 'POST', '/raw-materials', { name: `Plate ${T}`, unit: 'kg', base_uom: 'kg', standard_rate: 60 })).body;
    const ord = (await call(A, 'POST', '/customer-orders', { customerId: cust.id, customerPoRef: `REF-${T}`,
      items: [{ description: `Gate ${T}`, quantity: 2, unit: 'nos', rate: 900 }] })).body;
    const inv = (await call(A, 'POST', '/sales-invoices', { customerId: cust.id, invoiceDate: today, gstRate: 18,
      items: [{ description: `Gate ${T}`, quantity: 1, unit: 'nos', rate: 900, hsn: '7308' }] })).body;
    const po = (await call(A, 'POST', '/po', { vendorId: vend.id, itemName: `Plate ${T}`, quantity: 10, unitPrice: 60, gstRate: 18 })).body;
    const enq = (await call(A, 'POST', '/enquiries', { name: 'Ravi', company: `Zephyr Works ${T}`, phone: '9000000000', source: 'phone',
      items: [{ description: `Gate ${T}`, quantity: 2 }] })).body;
    ok(cust.id && vend.id && sku.id && mat.id && ord.id && inv.id && po.id && enq.id,
      `made a customer, vendor, product, material, order, invoice, PO and enquiry (${[cust.id, vend.id, sku.id, mat.id, ord.id, inv.id, po.id, enq.id].map(Boolean).join(',')})`);

    section('Every kind answers');
    const all = await search(A, T);
    ok(all.status === 200, `one word finds across kinds (HTTP ${all.status}${all.body.error ? `: ${all.body.error}` : ''})`);
    for (const k of ['customer', 'vendor', 'product', 'material', 'customer_order', 'sales_invoice', 'purchase_order', 'enquiry']) {
      ok(kinds(all).includes(k), `${k} found`);
    }
    const o = group(all, 'customer_order')?.items?.[0];
    ok(o && o.href === `/customer-orders?open=${ord.id}` && o.party === `Zephyr Works ${T}`,
      `an order opens on its own panel and names its customer (${o?.href} · ${o?.party})`);
    const i = group(all, 'sales_invoice')?.items?.[0];
    ok(i && i.href === `/sales-invoices/${inv.id}` && i.amount > 0 && i.date, 'an invoice opens its document, with amount and date');
    ok((all.body.groups || []).every(g => g.items.every(it => typeof it.href === 'string' && it.href.startsWith('/'))), 'every result says where it opens');
    ok(all.body.total === (all.body.groups || []).reduce((s, g) => s + g.total, 0), 'the total is the sum of the groups');

    section('Words and characters');
    ok(kinds(await search(A, `${T} zephyr`)).includes('customer'), 'words in any order, any case');
    ok(kinds(await search(A, `REF-${T}`)).includes('customer_order'), "an order is found by the customer's PO reference");
    ok((await search(A, `${T} nosuchword`)).body.total === 0, 'every word must appear');
    ok((await search(A, '')).body.total === 0 && (await search(A, '   ')).body.groups.length === 0, 'an empty search finds nothing');
    const pct = await search(A, '%'), und = await search(A, '_');
    ok(pct.status === 200 && pct.body.total === 0 && und.body.total === 0, '% and _ are not wildcards');
    ok((await search(A, `zephyr' OR 1=1 --`)).status === 200, 'quotes in the search are just text');

    section('Only what you may see');
    const other = await search(B, T);
    ok(other.status === 200 && other.body.total === 0, "another company's search finds none of it");
    const sales = await member(A, 'sales', 'Sales');
    if (sales.token) {
      const s = await search(sales, T);
      ok(s.status === 200 && kinds(s).includes('customer_order'), 'Sales finds the order');
      ok(!kinds(s).includes('purchase_order'), 'Sales does not see purchase orders');
    } else ok(false, `could not add a Sales member: ${sales.error}`);
    ok((await call(null, 'GET', `/search?q=${T}`)).status === 401, 'no sign-in, no search');

    section('A few of each, with the true count');
    for (let n = 0; n < 6; n++) await call(A, 'POST', '/customers', { name: `Crowd ${n} ${T}`, state: 'Telangana' });
    const crowd = group(await search(A, `crowd ${T}`), 'customer');
    ok(crowd && crowd.total === 6 && crowd.items.length === 5, `six match, five shown, count says six (${crowd?.total}/${crowd?.items?.length})`);
    const only = await search(A, T, '&kinds=customer');
    ok(kinds(only).length === 1 && kinds(only)[0] === 'customer', 'kinds= narrows to one kind');
  } catch (e) {
    ok(false, `crashed: ${e.message}`);
  } finally {
    const n = await cleanup().catch((e) => { console.log(`   ❌ cleanup failed: ${e.message}`); return -1; });
    console.log(`\n  ${pass} passed, ${fail} failed · cleaned up ${n} throwaway accounts`);
    process.exit(fail ? 1 : 0);
  }
})();
