#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   Ready-made views and bulk actions on Orders, Invoices and POs.

     views (?view=): each one picks the right records, counts every view
       over the whole company (not the page, not the search), ignores a
       view name it doesn't know, combines with a search, and stays inside
       the company
     bulk (POST /…/bulk): a dry run says what would be done and what
       skipped and why, and changes nothing; the real run changes only what
       the preview promised, through the same rules as one click; another
       company's records are "not found"; sign-off needs the sign-off
       permission; bad requests are refused plainly

   Local backend (SCHEDULER=off) and throwaway @example.test companies that
   are deleted at the end. Refuses a deployed host.
     API_BASE=http://localhost:5097 node scripts/test-list-tools.js
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
const day = (n) => new Date(Date.now() + 5.5 * 3600000 + n * 86400000).toISOString().slice(0, 10);   // India's date
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };
const section = (t) => console.log(`\n  ── ${t}`);
const db = () => new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const q1 = async (sql, params) => { const c = db(); await c.connect(); try { return (await c.query(sql, params)).rows[0]; } finally { await c.end(); } };

async function cleanup() {
  const c = db(); await c.connect();
  try {
    const { rows } = await c.query(`SELECT id, org_id FROM users WHERE email LIKE 'lt-%@example.test'`);
    const ids = [...new Set(rows.flatMap(r => [r.id, r.org_id]).filter(Boolean))];
    if (!ids.length) return 0;
    for (let i = 0; i < 5; i++) { const r = await purgeOrg(c, ids); if (!r.deleted) break; }
    await c.query('DELETE FROM document_sequences WHERE owner_id = ANY($1)', [ids]).catch(() => {});
    await c.query('DELETE FROM notifications WHERE user_id = ANY($1)', [rows.map(r => r.id)]).catch(() => {});
    await c.query('DELETE FROM automation_settings WHERE owner_id = ANY($1)', [ids]).catch(() => {});
    await c.query(`DELETE FROM users WHERE email LIKE 'lt-%@example.test' AND id <> org_id`);
    return (await c.query(`DELETE FROM users WHERE email LIKE 'lt-%@example.test'`)).rowCount;
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
  body: JSON.stringify({ name: `Lists ${tag}`, email: `lt-${tag}-${stamp}@example.test`, password: PASS }),
})).json();
const member = async (owner, tag, role) => {
  const inv = await call(owner, 'POST', '/admin/users', { name: `Lists ${tag}`, email: `lt-${tag}-${stamp}@example.test`, role });
  if (!inv.body?.invite?.token) return { error: inv.body?.error || inv.status };
  const acc = await call(null, 'POST', '/auth/accept-invite', { token: inv.body.invite.token, password: PASS });
  return { token: acc.body?.token, id: inv.body.user?.id };
};
const list = (who, path, extra = '') => call(who, 'GET', `${path}?limit=50${extra}`);
const nums = (r, key) => (r.body.items || []).map(x => x[key]).sort();

(async () => {
  await cleanup();
  const A = await register('a'), B = await register('b');
  try {
    if (!A.token || !B.token) throw new Error('could not register');

    section('Records');
    const cust = (await call(A, 'POST', '/customers', { name: `View Works ${stamp}`, state: 'Telangana', shipping_state: 'Telangana' })).body.id;
    const order = async (ship, desc) => (await call(A, 'POST', '/customer-orders', { customerId: cust, expectedShipmentDate: ship,
      items: [{ description: `${desc} ${stamp}`, quantity: 10, unit: 'nos', rate: 100 }] })).body;
    const late = await order(day(-3), 'Late');
    const soon = await order(day(2), 'Soon');
    const far = await order(day(30), 'Far');
    const sent = await order(day(30), 'Sent');
    const ch = (await call(A, 'POST', '/delivery-challans', { customerId: cust, customerOrderId: sent.id, challanDate: day(0),
      items: [{ description: `Sent ${stamp}`, quantity: 10, uom: 'nos', rate: 100 }] })).body;
    const disp = await call(A, 'PATCH', `/delivery-challans/${ch.id}/status`, { status: 'Dispatched' });
    ok(late.id && soon.id && far.id && sent.id && disp.status === 200, `four orders, one dispatched on a challan (${disp.status} ${disp.body.error || ''})`);

    /* different amounts: three identical invoices in a row is what the
       duplicate guard exists to question */
    const invoice = async (due, rate, what) => {
      const r = await call(A, 'POST', '/sales-invoices', { customerId: cust, invoiceDate: day(-40), dueDate: due, gstRate: 18,
        items: [{ description: `${what} ${stamp}`, quantity: 1, unit: 'nos', rate, hsn: '7308' }] });
      if (!r.body.id) console.log(`      invoice "${what}" not made: ${r.status} ${r.body.error || ''}`);
      return r.body;
    };
    const draftLate = await invoice(day(-5), 1000, 'Late draft');    // a draft, past due: owed and overdue (as on the dashboard)
    const sentOk = await invoice(day(20), 1500, 'Sent');            // sent, not yet due
    await call(A, 'PATCH', `/sales-invoices/${sentOk.id}/status`, { status: 'Sent' });
    const paid = await invoice(day(-5), 2000, 'Paid');              // paid in full: neither
    await call(A, 'PATCH', `/sales-invoices/${paid.id}/status`, { status: 'Sent' });
    const pay = await call(A, 'POST', `/sales-invoices/${paid.id}/payment`, { amount: 2360, mode: 'Bank' });
    const paidNow = await q1('SELECT status FROM sales_invoices WHERE id = $1', [paid.id]);
    ok(draftLate.id && sentOk.id && paidNow?.status === 'Paid', `three invoices, one paid in full (${pay.status} → ${paidNow?.status})`);

    await call(A, 'PUT', '/automation-settings', { po_approval_threshold: 1000 });
    const vend = (await call(A, 'POST', '/vendors', { name: `View Steel ${stamp}`, type: 'Supplier' })).body.id;
    const big = (await call(A, 'POST', '/po', { vendorId: vend, itemName: `Plate ${stamp}`, quantity: 100, unitPrice: 60, gstRate: 18 })).body;
    const small = (await call(A, 'POST', '/po', { vendorId: vend, itemName: `Bolt ${stamp}`, quantity: 1, unitPrice: 50, gstRate: 18 })).body;
    ok(big.approvalStatus === 'Pending Approval' && small.approvalStatus === 'Not Required', `a PO over the limit waits for sign-off, a small one doesn't (${big.approvalStatus} / ${small.approvalStatus})`);

    section('Views on Orders');
    const all = await list(A, '/customer-orders');
    ok(all.status === 200 && all.body.views, `the list says how many are in each view (${JSON.stringify(all.body.views)})`);
    ok(all.body.views?.late === 1 && all.body.views?.due_week === 1 && all.body.views?.to_bill === 1,
      'one late, one due this week, one sent but not billed');
    const lateV = await list(A, '/customer-orders', '&view=late');
    ok(lateV.body.total === 1 && lateV.body.items[0]?.id === late.id && lateV.body.view === 'late', 'Ship date passed shows only the late order');
    ok(nums(await list(A, '/customer-orders', '&view=due_week'), 'id').join() === String(soon.id), 'Due this week shows the order due in two days');
    ok(nums(await list(A, '/customer-orders', '&view=to_bill'), 'id').join() === String(sent.id), 'To bill shows the order sent on a challan');
    const bogus = await list(A, '/customer-orders', '&view=drop_table');
    ok(bogus.status === 200 && bogus.body.total === 4, 'a view name it does not know shows the whole list, not an error');
    const both = await list(A, '/customer-orders', `&view=late&search=${encodeURIComponent(far.order_number || far.orderNumber || 'zz')}`);
    ok(both.body.total === 0 && both.body.views?.late === 1, 'a view and a search narrow together; the tab counts stay put');
    const inv1 = await call(A, 'POST', `/sales-invoices`, { customerId: cust, customerOrderId: sent.id, invoiceDate: day(0), gstRate: 18,
      items: [{ description: `Sent ${stamp}`, quantity: 10, unit: 'nos', rate: 100, hsn: '7308' }] });
    ok((await list(A, '/customer-orders')).body.views?.to_bill === 0, `once billed, it leaves To bill (${inv1.status})`);
    const forBulk = inv1.body.id;

    section('Views on Invoices');
    const iv = (await list(A, '/sales-invoices')).body.views || {};
    ok(iv.unpaid === 3 && iv.overdue === 1 && iv.drafts === 2, `unpaid 3 (the late draft, the sent one, the new bill), overdue 1, not sent 2 (${JSON.stringify(iv)})`);
    ok(nums(await list(A, '/sales-invoices', '&view=overdue'), 'id').join() === String(draftLate.id), 'Overdue is the draft past its due date, as on the dashboard');
    ok(!nums(await list(A, '/sales-invoices', '&view=unpaid'), 'id').includes(paid.id), 'a paid invoice is not unpaid');

    section('Views on Purchase orders');
    const pv = (await list(A, '/po')).body.views || {};
    ok(pv.approval === 1 && pv.to_receive === 0, `one waiting for sign-off, none to receive (${JSON.stringify(pv)})`);
    ok(nums(await list(A, '/po', '&view=approval'), 'id').join() === String(big.id), 'Waiting for sign-off is the big PO');

    section('Another company');
    const bv = (await list(B, '/customer-orders')).body.views || {};
    ok(bv.late === 0 && bv.due_week === 0 && bv.to_bill === 0, 'its view counts are its own: all zero');

    section('Bulk: invoices');
    const Binv = (await call(B, 'POST', '/sales-invoices', { customerId: (await call(B, 'POST', '/customers', { name: `B ${stamp}`, state: 'Telangana' })).body.id,
      invoiceDate: day(0), gstRate: 18, items: [{ description: 'x', quantity: 1, unit: 'nos', rate: 10, hsn: '7308' }] })).body.id;
    ok(Binv && forBulk, `a draft in another company, and the new bill (${Binv} / ${forBulk})`);
    const ids = [draftLate.id, sentOk.id, paid.id, forBulk, Binv];
    const dry = await call(A, 'POST', '/sales-invoices/bulk', { action: 'mark_sent', ids, dryRun: true });
    if (dry.status !== 200) console.log('      preview answered', dry.status, JSON.stringify(dry.body).slice(0, 200));
    const reason = (id) => dry.body.skipped?.find(s => s.id === id)?.reason;
    ok(dry.status === 200 && dry.body.dryRun === true && dry.body.done.map(d => d.id).sort().join() === [draftLate.id, forBulk].sort().join(),
      `the preview would mark the two drafts (${JSON.stringify(dry.body.done?.map(d => d.label))})`);
    ok(reason(sentOk.id) === 'Already sent' && reason(paid.id) === 'It is Paid' && reason(Binv) === 'Not found',
      `and says why the rest are skipped: ${[reason(sentOk.id), reason(paid.id), reason(Binv)].join(' · ')}`);
    ok((await q1('SELECT status FROM sales_invoices WHERE id = $1', [draftLate.id])).status === 'Draft', 'a preview changes nothing');
    const run = await call(A, 'POST', '/sales-invoices/bulk', { action: 'mark_sent', ids });
    ok(run.body.done?.length === 2 && run.body.skipped?.length === 3, `the real run marks two and skips three (${run.body.done?.length}/${run.body.skipped?.length})`);
    ok((await q1('SELECT status FROM sales_invoices WHERE id = $1', [draftLate.id])).status === 'Sent'
      && (await q1('SELECT status FROM sales_invoices WHERE id = $1', [Binv])).status === 'Draft', "they are Sent now; the other company's draft is untouched");

    section('Bulk: orders');
    const close = await call(A, 'POST', '/customer-orders/bulk', { action: 'close', ids: [late.id, soon.id] });
    ok(close.body.done?.length === 2, 'two orders closed');
    const again = await call(A, 'POST', '/customer-orders/bulk', { action: 'close', ids: [late.id], dryRun: true });
    ok(again.body.done?.length === 0 && again.body.skipped?.[0]?.reason === 'Already closed', 'closing again: "Already closed"');
    ok((await list(A, '/customer-orders')).body.views?.late === 0, 'a closed order leaves Ship date passed');

    section('Bulk: sign-off');
    const sales = await member(A, 'sales', 'Sales');
    const salesTry = await call(sales, 'POST', '/po/bulk', { action: 'sign_off', ids: [big.id] });
    ok(salesTry.status === 403, `Sales can't sign off in bulk either (${salesTry.status})`);
    const so = await call(A, 'POST', '/po/bulk', { action: 'sign_off', ids: [big.id, small.id] });
    ok(so.body.done?.map(d => d.id).join() === String(big.id) && so.body.skipped?.[0]?.reason === "Doesn't need sign-off",
      `the big PO is signed off; the small one "Doesn't need sign-off" (${so.body.skipped?.[0]?.reason})`);
    ok((await q1('SELECT approval_status FROM purchase_orders WHERE id = $1', [big.id])).approval_status === 'Approved', 'it is signed off in the database');
    ok((await list(A, '/po')).body.views?.approval === 0, 'and has left Waiting for sign-off');

    section('Bad requests');
    ok((await call(A, 'POST', '/sales-invoices/bulk', { action: 'mark_sent', ids: [] })).status === 400, 'no ids: refused');
    ok((await call(A, 'POST', '/sales-invoices/bulk', { action: 'mark_sent', ids: Array.from({ length: 101 }, (_, i) => i + 1) })).status === 400, 'more than 100: refused');
    ok((await call(A, 'POST', '/sales-invoices/bulk', { action: 'mark_sent', ids: ['1; drop'] })).status === 400, 'an id that is not a number: refused');
    ok((await call(A, 'POST', '/sales-invoices/bulk', { action: 'delete_all', ids: [draftLate.id] })).status === 400, 'an action it does not have: refused');
    ok((await call(null, 'POST', '/sales-invoices/bulk', { action: 'mark_sent', ids: [draftLate.id] })).status === 401, 'not signed in: refused');
  } catch (e) {
    ok(false, `crashed: ${e.message}`);
  } finally {
    const n = await cleanup().catch((e) => { console.log(`   ❌ cleanup failed: ${e.message}`); return -1; });
    console.log(`\n  ${pass} passed, ${fail} failed · cleaned up ${n} throwaway accounts`);
    process.exit(fail ? 1 : 0);
  }
})();
