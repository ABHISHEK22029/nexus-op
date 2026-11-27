/* ══════════════════════════════════════════════════════════════════════
   An order already billed twice, on two drafts (27 Nov 2026).

   One order's line sat on two drafts — saved before the "an order is
   billed once" check, or copied. Every save of either draft that touched
   its lines was refused ("already invoiced on the other one"), even
   renaming the line, so neither could be fixed on the page. Now:
     · a draft may keep what it already billed — rename it, re-rate it,
       lower it, change other lines;
     · it may not bill MORE of a line another invoice already holds;
     · it can't be issued, or take a payment, while another invoice bills
       the same line — that is where the duplicate is finally stopped;
     · once the other draft gives the line up, both go through.

   Local only:  API_BASE=http://localhost:5097 node scripts/test-double-billed-drafts.js
   Throwaway @example.test account, removed at the end.
   ══════════════════════════════════════════════════════════════════════ */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Client } = require('pg');
const { purge, sweepStale } = require('./lib/testAccounts');

const API = process.env.API_BASE || 'http://localhost:5099';
if (/^https:|onrender\.com|vercel\.app|maksops\.co\.in/.test(API)) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}
const stamp = Date.now().toString(36);
const PASS = 'testpassword123';
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };
const section = (t) => console.log(`\n  ── ${t}`);
const q = async (sql, params) => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect(); try { return (await c.query(sql, params)).rows; } finally { await c.end(); }
};
const call = async (who, method, url, body) => {
  const r = await fetch(`${API}${url}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${who.token}` }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const short = (s) => String(s || '').slice(0, 150);

(async () => {
  await sweepStale('dbill-').catch(() => 0);
  const ids = [];
  try {
    const r = await fetch(`${API}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Double Bill', email: `dbill-${stamp}@example.test`, password: PASS }) });
    const reg = await r.json();
    const A = { token: reg.token }; ids.push(reg.user?.id);
    await call(A, 'PUT', '/company-profile', { name: `Double Works ${stamp}`, gstin: '36ABCDE1234F1Z5', stateCode: '36' });
    const cust = (await call(A, 'POST', '/customers', { name: `Sahasra Test ${stamp}`, state: 'Telangana' })).body;
    const co = await call(A, 'POST', '/customer-orders', { customerId: cust.id, items: [
      { description: `Clamp ${stamp}`, quantity: 10, unit: 'kg', rate: 100 },
      { description: `Plate ${stamp}`, quantity: 5, unit: 'nos', rate: 200 },
    ] });
    const orderId = co.body.id;
    const pf = (await call(A, 'GET', `/sales-invoices/prefill/${orderId}`)).body;
    const clamp = pf.items.find((i) => i.description === `Clamp ${stamp}`);
    const plate = pf.items.find((i) => i.description === `Plate ${stamp}`);
    const make = (items) => call(A, 'POST', '/sales-invoices', { customerId: cust.id, customerOrderId: orderId, gstRate: 18, discount: 0, items });

    section('setting up: the clamp on two drafts');
    const one = await make([clamp]);
    const two = await make([plate]);
    ok(one.status === 200 && two.status === 200, `${one.body.invoiceNumber} bills the 10 kg clamp, ${two.body.invoiceNumber} the plates (${one.status}, ${two.status})`);
    /* The duplicate as it sits on the live database: the clamp line copied
       onto the second draft, linked to the same order line. */
    const cols = (await q(`SELECT column_name FROM information_schema.columns
                            WHERE table_name = 'sales_invoice_items' AND column_name NOT IN ('id', 'sales_invoice_id')`)).map((c) => `"${c.column_name}"`).join(', ');
    await q(`INSERT INTO sales_invoice_items (sales_invoice_id, ${cols})
             SELECT $1, ${cols} FROM sales_invoice_items WHERE sales_invoice_id = $2 AND customer_order_item_id = $3`,
    [two.body.id, one.body.id, clamp.customerOrderItemId]);
    const shown = (await call(A, 'GET', `/sales-invoices/${one.body.id}`)).body;
    ok(shown.overBilled && shown.overBilled.lines?.length === 1, `the page warns the order is invoiced twice (${shown.overBilled?.lines?.length} line)`);

    const N1 = one.body.invoiceNumber, N2 = two.body.invoiceNumber;
    const clampOn = (qty, extra = {}) => ({ ...clamp, quantity: qty, ...extra });

    section('editing a draft that holds a duplicate');
    const rename = await call(A, 'PATCH', `/sales-invoices/${one.body.id}`, { items: [clampOn(10, { description: 'steel' })] });
    ok(rename.status === 200, `renaming the line saves — it was refused before (${rename.status} ${short(rename.body.error)})`);
    const lower = await call(A, 'PATCH', `/sales-invoices/${one.body.id}`, { items: [clampOn(8)], notes: 'checked' });
    ok(lower.status === 200, `lowering it to 8 kg and adding a note saves (${lower.status} ${short(lower.body.error)})`);
    const more = await call(A, 'PATCH', `/sales-invoices/${one.body.id}`, { items: [clampOn(9)] });
    ok(more.status === 409 && new RegExp(`${N2} \\(draft\\)`).test(more.body.error || '') && /Only one invoice can bill it/.test(more.body.error || ''),
      `billing more of it (9 kg) is refused, naming ${N2} as a draft and the way out (${more.status}): “${short(more.body.error)}…”`);

    section('the duplicate stops at issue and at payment');
    const issue = await call(A, 'PATCH', `/sales-invoices/${one.body.id}/status`, { status: 'Sent' });
    ok(issue.status === 409 && new RegExp(`${N1} can't be issued yet`).test(issue.body.error || '') && issue.body.error.includes(N2),
      `${N1} can't be issued while ${N2} bills the clamp (${issue.status}): “${short(issue.body.error)}…”`);
    const pay = await call(A, 'POST', `/sales-invoices/${one.body.id}/payment`, { amount: 100, mode: 'Bank transfer', paidDate: new Date().toISOString().slice(0, 10) });
    ok(pay.status === 409 && /can't take a payment yet/.test(pay.body.error || ''), `nor take a payment, which would issue it (${pay.status})`);
    const still = (await q('SELECT status, (SELECT COUNT(*)::int FROM sales_payments WHERE sales_invoice_id = $1) AS n FROM sales_invoices WHERE id = $1', [one.body.id]))[0];
    ok(still.status === 'Draft' && still.n === 0, `still a draft with no payment (${still.status}, ${still.n})`);

    section('once the other draft gives the line up');
    const giveUp = await call(A, 'PATCH', `/sales-invoices/${two.body.id}`, { items: [plate] });
    ok(giveUp.status === 200, `${N2} saves with the clamp taken off (${giveUp.status} ${short(giveUp.body.error)})`);
    const issued = await call(A, 'PATCH', `/sales-invoices/${one.body.id}/status`, { status: 'Sent' });
    ok(issued.status === 200, `${N1} is issued with its 8 kg (${issued.status} ${short(issued.body.error)})`);
    const tooMuch = await call(A, 'PATCH', `/sales-invoices/${two.body.id}`, { items: [plate, clampOn(3)] });
    ok(tooMuch.status === 409, `${N2} can't take 3 kg back — only 2 are left (${tooMuch.status})`);
    const rest = await call(A, 'PATCH', `/sales-invoices/${two.body.id}`, { items: [plate, clampOn(2)] });
    const issued2 = await call(A, 'PATCH', `/sales-invoices/${two.body.id}/status`, { status: 'Sent' });
    ok(rest.status === 200 && issued2.status === 200, `the 2 kg left goes on ${N2}, and it is issued (${rest.status}, ${issued2.status} ${short(issued2.body.error)})`);
    const fresh = (await call(A, 'GET', `/sales-invoices/${one.body.id}`)).body;
    ok(!fresh.overBilled, 'and the order is no longer invoiced twice');
  } catch (e) {
    fail++; console.log(`   ❌ crashed: ${e.stack || e.message}`);
  } finally {
    const removed = await purge(ids.filter(Boolean)).catch((e) => { console.log('   cleanup failed:', e.message); return 0; });
    console.log(`\n   ✅ test accounts removed (${removed})`);
    console.log(`\n  ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
})();
