#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   An order is billed once.

   On the live database one ₹19.9 lakh order carried three invoices adding
   up to ₹39 lakh, and two more orders were billed beyond what was ordered:
   nothing knew what was already invoiced. Checks, with every way round it
   that was tried:

   1. The first invoice opens with the order; each line knows its order line.
   2. Billing part of it: the next invoice opens with only what is left —
      line discounts and the order discount shared out — and says where the
      rest was billed.
   3. Billing the same again is refused, naming the line, what was ordered,
      what is invoiced and on which invoice.
   4. Deleting the order's line and typing it again by hand is refused too.
   5. A line not on the order that takes it past its value (a lump sum
      "as per PO") must be confirmed; freight is billed once confirmed.
   6. A fully invoiced order says so, with its invoices.
   7. Cancelling an invoice frees what it billed; an edit does not count the
      invoice against itself, and cannot raise it past what is left.
   8. Two invoices saved at the same instant: one is made, not two.
   9. The same invoice saved twice (a double click) is refused.
   10. An invoice whose order is billed more than ordered says so.
   11. Another company sees none of it.

   Throwaway accounts, deleted again. Refuses to run against a deployed host.
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
const register = async (tag) => {
  const r = await fetch(`${API}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: `Bill ${tag}`, email: `obill-${tag}-${stamp}@example.test`, password: PASS }) });
  const b = await r.json();
  return { token: b.token, id: b.user?.id };
};
const line = (prefill, desc) => prefill.items.find((i) => i.description === desc);
const invoiceFrom = (order, pf, items, extra = {}) => ({ customerId: order.customerId, customerOrderId: order.id, gstRate: 18, items, discount: 0, ...extra });

(async () => {
  await sweepStale('obill-').catch(() => 0);
  const ids = [];
  try {
    const A = await register('a'); ids.push(A.id);
    const B = await register('b'); ids.push(B.id);
    await call(A, 'PUT', '/company-profile', { name: `Billing Works ${stamp}`, gstin: '36ABCDE1234F1Z5', stateCode: '36' });
    const cust = (await call(A, 'POST', '/customers', { name: `Godavari Infra ${stamp}`, state: 'Telangana' })).body;
    const co = await call(A, 'POST', '/customer-orders', {
      customerId: cust.id, discountType: 'flat', discount: 1000,
      items: [
        { description: `Bracket ${stamp}`, quantity: 100, unit: 'nos', rate: 500 },
        { description: `Gate ${stamp}`, quantity: 10, unit: 'nos', rate: 2000, discount: 10, discountType: 'percent' },
      ],
    });
    const order = { id: co.body.id, customerId: cust.id };
    ok(co.status === 200 && order.id, `an order for 100 brackets at ₹500 and 10 gates at ₹2,000 (10% off), ₹1,000 off the order (${co.status})`);

    section('1. the first invoice opens with the order');
    const pf1 = (await call(A, 'GET', `/sales-invoices/prefill/${order.id}`)).body;
    ok(pf1.items?.length === 2 && pf1.items.every((i) => i.customerOrderItemId) && !pf1.billing?.invoices?.length,
      'both lines, each carrying its order line, nothing billed yet');
    ok(Math.abs(Number(pf1.discount) - 3000) < 0.01, `discounts carried: ₹2,000 on the gates + ₹1,000 on the order = ₹${pf1.discount}`);

    section('2. billing part of it');
    const br = line(pf1, `Bracket ${stamp}`), gt = line(pf1, `Gate ${stamp}`);
    const inv1 = await call(A, 'POST', '/sales-invoices', invoiceFrom(order, pf1, [{ ...br, quantity: 60 }, gt]));
    ok(inv1.status === 200, `60 brackets and all 10 gates are invoiced (${inv1.status} ${inv1.body.error || inv1.body.invoiceNumber})`);
    const pf2 = (await call(A, 'GET', `/sales-invoices/prefill/${order.id}`)).body;
    ok(pf2.items?.length === 1 && Number(pf2.items[0].quantity) === 40 && pf2.items[0].description === `Bracket ${stamp}`,
      `the next invoice opens with only what is left: 40 brackets (${pf2.items?.map((i) => `${i.quantity} ${i.description}`).join(', ')})`);
    ok(pf2.billing?.invoices?.includes(inv1.body.invoiceNumber), `and says the rest is on ${inv1.body.invoiceNumber}`);
    /* the order's flat ₹1,000 shared by value: 40×500 = 20,000 of a 68,000 order */
    ok(Math.abs(Number(pf2.discount) - 294.12) < 0.02, `the order discount is shared out by value: ₹1,000 × 20,000 ÷ 68,000 = ₹${pf2.discount}`);

    section('3. billing the same again');
    const again = await call(A, 'POST', '/sales-invoices', invoiceFrom(order, pf1, [br, gt]));
    ok(again.status === 409 && /ordered 100/.test(again.body.error || '') && /already invoiced 60/.test(again.body.error || '')
      && again.body.error.includes(inv1.body.invoiceNumber) && /40 left/.test(again.body.error || ''),
    `refused, line by line: “${(again.body.error || '').slice(0, 150)}…”`);

    section('4. deleting the order line and typing it again');
    const typed = await call(A, 'POST', '/sales-invoices', invoiceFrom(order, pf1, [{ description: `  bracket ${stamp} `, quantity: 100, uom: 'nos', rate: 500 }]));
    ok(typed.status === 409 && /already invoiced 60/.test(typed.body.error || ''), `a hand-typed “bracket …” is counted as the order's bracket line and refused (${typed.status})`);
    const foreign = await call(A, 'POST', '/sales-invoices', invoiceFrom(order, pf1, [{ ...br, customerOrderItemId: 999999999, quantity: 1 }]));
    ok(foreign.status === 400, `a line naming an order line that is not on this order is refused (${foreign.status})`);

    section('5. lines not on the order');
    const lump = await call(A, 'POST', '/sales-invoices', invoiceFrom(order, pf1, [{ description: 'Supply as per your PO', quantity: 1, uom: 'nos', rate: 70000 }]));
    ok(lump.status === 409 && lump.body.needsConfirm === 'above_order_value' && /cancel the earlier invoice/.test(lump.body.error || ''),
      `a lump sum worth the order is held for confirmation: “${(lump.body.error || '').slice(0, 120)}…”`);
    const withFreight = invoiceFrom(order, pf2, [...pf2.items, { description: 'Freight to site', quantity: 1, uom: 'nos', rate: 500 }]);
    const fr1 = await call(A, 'POST', '/sales-invoices', withFreight);
    const fr2 = await call(A, 'POST', '/sales-invoices', { ...withFreight, confirmAboveOrder: true });
    ok(fr1.status === 409 && fr1.body.needsConfirm && fr2.status === 200, `the last 40 brackets with ₹500 freight: asked first (${fr1.status}), billed once confirmed (${fr2.status})`);

    section('6. a fully invoiced order');
    const pf3 = (await call(A, 'GET', `/sales-invoices/prefill/${order.id}`)).body;
    ok(pf3.billing?.fullyInvoiced === true && pf3.items.length === 0 && pf3.billing.onOrder.length === 2,
      `it says it is fully invoiced, and lists its ${pf3.billing?.onOrder?.length} invoices`);
    const one = await call(A, 'POST', '/sales-invoices', invoiceFrom(order, pf1, [{ ...br, quantity: 1 }]));
    ok(one.status === 409, `even one more bracket is refused (${one.status})`);

    section('7. cancelling frees it; an edit does not count itself');
    const cancel = await call(A, 'PATCH', `/sales-invoices/${inv1.body.id}/status`, { status: 'Cancelled' });
    const pf4 = (await call(A, 'GET', `/sales-invoices/prefill/${order.id}`)).body;
    ok(cancel.status === 200 && pf4.items.length === 2 && Number(line(pf4, `Bracket ${stamp}`)?.quantity) === 60,
      `with ${inv1.body.invoiceNumber} cancelled, its 60 brackets and 10 gates can be billed again (${pf4.items.map((i) => i.quantity).join(', ')})`);
    /* With the earlier ₹500 freight, this takes the order to ₹70,500 of a
       ₹70,000 order: asked first, then billed. */
    const ask3 = await call(A, 'POST', '/sales-invoices', invoiceFrom(order, pf4, pf4.items));
    const inv3 = await call(A, 'POST', '/sales-invoices', invoiceFrom(order, pf4, pf4.items, { confirmAboveOrder: true }));
    ok(ask3.status === 409 && /earlier invoice for this order has lines that are not on it/.test(ask3.body.error || '') && inv3.status === 200,
      `and are — after a question, since the earlier freight takes the order past its value (${ask3.status}, ${inv3.status})`);
    const freightOnly = (await call(A, 'GET', `/sales-invoices/${inv3.body.id}`)).body;
    ok(freightOnly.overBilled === null, 'billed ₹70,500 on a ₹70,000 order because of freight: no warning (under 10% over)');
    const inv2 = (await call(A, 'GET', `/sales-invoices/${fr2.body.id}`)).body;
    const keep = inv2.items.map((i) => ({ description: i.description, hsn: i.hsn, uom: i.uom, quantity: i.quantity, rate: i.rate, customerOrderItemId: i.customer_order_item_id }));
    const editSame = await call(A, 'PATCH', `/sales-invoices/${fr2.body.id}`, { items: keep, confirmAboveOrder: true });
    const editMore = await call(A, 'PATCH', `/sales-invoices/${fr2.body.id}`, { items: keep.map((i) => (i.customerOrderItemId ? { ...i, quantity: 41 } : i)), confirmAboveOrder: true });
    ok(editSame.status === 200 && editMore.status === 409, `editing a draft keeps its own 40 (${editSame.status}); raising it to 41 is refused (${editMore.status})`);
    const linkKept = await q('SELECT count(*)::int n FROM sales_invoice_items WHERE sales_invoice_id = $1 AND customer_order_item_id IS NOT NULL', [fr2.body.id]);
    ok(linkKept[0].n === 1, 'and the edited line still knows its order line');

    section('8. two invoices saved at the same instant');
    const co2 = await call(A, 'POST', '/customer-orders', { customerId: cust.id, items: [{ description: `Plate ${stamp}`, quantity: 5, unit: 'nos', rate: 1000 }] });
    const pf5 = (await call(A, 'GET', `/sales-invoices/prefill/${co2.body.id}`)).body;
    const race = await Promise.all([1, 2].map((n) => call(A, 'POST', '/sales-invoices', { customerId: cust.id, customerOrderId: co2.body.id, gstRate: 18, items: pf5.items, notes: `try ${n}` })));
    ok(race.filter((r) => r.status === 200).length === 1 && race.filter((r) => r.status === 409).length === 1,
      `exactly one is made (${race.map((r) => r.status).join(', ')})`);

    section('9. the same invoice saved twice');
    const loose = { customerId: cust.id, gstRate: 18, items: [{ description: 'Site visit', quantity: 1, uom: 'nos', rate: 2500 }] };
    const s1 = await call(A, 'POST', '/sales-invoices', loose);
    const s2 = await call(A, 'POST', '/sales-invoices', loose);
    ok(s1.status === 200 && s2.status === 409 && s2.body.duplicateOf === s1.body.id && s2.body.error.includes(s1.body.invoiceNumber),
      `a double click makes one invoice; the second says “${(s2.body.error || '').slice(0, 80)}…”`);

    section('10. an order billed more than ordered says so');
    /* As an invoice from before the check: one more bracket written straight in. */
    await q('UPDATE sales_invoice_items SET quantity = quantity + 5 WHERE sales_invoice_id = $1 AND customer_order_item_id IS NOT NULL', [inv3.body.id]);
    const shown = (await call(A, 'GET', `/sales-invoices/${inv3.body.id}`)).body;
    ok(shown.overBilled && shown.overBilled.lines.some((l) => l.ordered === 100 && l.billed === 105),
      `the invoice carries the warning: ${shown.overBilled ? `${shown.overBilled.orderNumber}, ${shown.overBilled.invoices.join(', ')}` : 'none'}`);
    const fine = (await call(A, 'GET', `/sales-invoices/${s1.body.id}`)).body;
    ok(fine.overBilled === null, 'an invoice with no order carries none');

    section('12. two order lines with the same name');
    const twin = await call(A, 'POST', '/customer-orders', { customerId: cust.id, items: [
      { description: `Kallax Shelf ${stamp}`, quantity: 400, unit: 'nos', rate: 100 },
      { description: `Kallax Shelf ${stamp}`, quantity: 144, unit: 'nos', rate: 100 },
    ] });
    const both = await call(A, 'POST', '/sales-invoices', { customerId: cust.id, customerOrderId: twin.body.id, gstRate: 18,
      items: [{ description: `Kallax Shelf ${stamp}`, quantity: 544, uom: 'nos', rate: 100 }] });
    const twinPf = (await call(A, 'GET', `/sales-invoices/prefill/${twin.body.id}`)).body;
    const twinInv = (await call(A, 'GET', `/sales-invoices/${both.body.id}`)).body;
    ok(both.status === 200 && twinPf.billing?.fullyInvoiced === true && twinInv.overBilled === null,
      `one line of 544 fills both (400 + 144): billed, fully invoiced, and not called billed twice (${both.status}, ${twinPf.billing?.fullyInvoiced}, ${JSON.stringify(twinInv.overBilled)})`);

    section('13. a lump sum first, then the order line by line');
    const lumpOrder = await call(A, 'POST', '/customer-orders', { customerId: cust.id, items: [{ description: `Pipe ${stamp}`, quantity: 10, unit: 'nos', rate: 1000 }] });
    const lumpInv = await call(A, 'POST', '/sales-invoices', { customerId: cust.id, customerOrderId: lumpOrder.body.id, gstRate: 18,
      items: [{ description: 'Supply as per your PO', quantity: 1, uom: 'nos', rate: 10000 }] });
    const lumpPf = (await call(A, 'GET', `/sales-invoices/prefill/${lumpOrder.body.id}`)).body;
    const byLine = await call(A, 'POST', '/sales-invoices', { customerId: cust.id, customerOrderId: lumpOrder.body.id, gstRate: 18, items: lumpPf.items });
    ok(lumpInv.status === 200 && byLine.status === 409 && byLine.body.needsConfirm && /earlier invoice for this order has lines that are not on it/.test(byLine.body.error || ''),
      `billing the pipes again after a ₹10,000 lump sum asks first (${lumpInv.status}, ${byLine.status}): “${(byLine.body.error || '').slice(0, 90)}…”`);
    const forced = await call(A, 'POST', '/sales-invoices', { customerId: cust.id, customerOrderId: lumpOrder.body.id, gstRate: 18, items: lumpPf.items, confirmAboveOrder: true });
    const lumpShown = (await call(A, 'GET', `/sales-invoices/${lumpInv.body.id}`)).body;
    ok(forced.status === 200 && lumpShown.overBilled && lumpShown.overBilled.billedValue === 20000 && lumpShown.overBilled.orderedValue === 10000
      && lumpShown.overBilled.invoices.length === 2 && lumpShown.overBilled.lines.length === 0,
    `billed anyway, both invoices then warn by value: ₹20,000 against ₹10,000, on ${lumpShown.overBilled?.invoices?.join(', ')}`);

    section('11. another company');
    const bPf = await call(B, 'GET', `/sales-invoices/prefill/${order.id}`);
    const bInv = await call(B, 'POST', '/sales-invoices', { customerId: cust.id, customerOrderId: order.id, items: [{ description: 'x', quantity: 1, rate: 1 }] });
    ok(bPf.status === 404 && bInv.status === 400, `cannot read A's order's billing or bill against it (${bPf.status}, ${bInv.status})`);
  } catch (e) {
    fail++; console.log(`   ❌ crashed: ${e.stack || e.message}`);
  } finally {
    const removed = await purge(ids.filter(Boolean)).catch((e) => { console.log('   cleanup failed:', e.message); return 0; });
    console.log(`\n   ✅ test accounts removed (${removed})`);
    console.log(`\n  ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
})();
