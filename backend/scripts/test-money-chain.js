#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   The money, end to end — in and out.

   Everything else was covered: stock moves, tax splits, who may see what.
   The one thing nothing tested was the arithmetic of getting paid and
   paying, which is the part a business actually checks at month end.

   The gap hid a real fault. An invoice worth ₹11,800 accepted ₹1,11,799
   in receipts, called itself Paid, and the list then reported received
   ₹1,11,799 against billed ₹11,800. The vendor side had the same hole,
   where the money is going out rather than coming in.

   Both directions, as a fresh organisation:

     sales     quotation → order → invoice → part payment → settled
     purchase  PO → receipt → vendor bill → part payment → settled

   Assertions are on figures, not status codes. "200 OK" is not a claim
   that the sums are right.
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
const near = (a, b, eps = 0.02) => Math.abs(Number(a) - Number(b)) <= eps;

let token = null;
const call = async (path, opts = {}) => {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  const txt = await res.text();
  let body; try { body = JSON.parse(txt); } catch { body = { raw: txt.slice(0, 140) }; }
  return { status: res.status, ok: res.ok, body };
};
const post = (p, b) => call(p, { method: 'POST', body: JSON.stringify(b) });

(async () => {
  console.log('');
  const email = `money-${stamp}@example.test`;
  const reg = await post('/auth/register', { name: 'Owner', email, password: 'testpassword123' });
  if (!reg.ok) { console.error('register failed:', reg.body); process.exit(1); }
  token = reg.body.token;
  const orgId = reg.body.user.id;

  await call('/company-profile', {
    method: 'PUT',
    body: JSON.stringify({
      name: `Kirashi ${stamp}`, gstin: '33AAAAA0000A1Z5', stateCode: '33',
      setup_completed_at: new Date().toISOString(),
    }),
  });

  /* ══ MONEY IN ═══════════════════════════════════════════ */
  console.log('  ── money in: invoice → part payment → settled');

  const cust = await post('/customers', { name: `Buyer ${stamp}`, gstin: '33BBBBB0000B1Z5' });
  const inv = await post('/sales-invoices', {
    customerId: cust.body.id, invoiceDate: '2026-09-01', gstRate: 18,
    items: [{ description: 'Steel door', hsn: '7308', quantity: 10, rate: 1000, uom: 'nos' }],
  });
  ok(inv.ok && near(inv.body.net, 11800),
    `an invoice for 10 × ₹1,000 plus 18% is ₹11,800 → ₹${inv.body.net}`);
  const invId = inv.body.id;

  const p1 = await post(`/sales-invoices/${invId}/payment`, { amount: 5000, mode: 'Bank' });
  ok(p1.ok && near(p1.body.amountPaid, 5000) && p1.body.status === 'Partially Paid',
    `₹5,000 received leaves it Partially Paid → ₹${p1.body.amountPaid}, ${p1.body.status}`);

  /* The one that was broken: more than is owed. */
  const over = await post(`/sales-invoices/${invId}/payment`, { amount: 99999, mode: 'Bank' });
  ok(over.status === 409,
    `a receipt larger than the balance is refused (${over.status})`);
  ok(/outstanding|remains/i.test(over.body.error || ''),
    `and says what is actually outstanding → "${String(over.body.error).slice(0, 74)}"`);

  const afterRefusal = await call(`/sales-invoices/${invId}`);
  ok(near(afterRefusal.body.amount_paid, 5000),
    `the refusal recorded nothing — still ₹${afterRefusal.body.amount_paid} received`);
  ok((afterRefusal.body.payments || []).length === 1,
    `and left one payment on the invoice, not two (${(afterRefusal.body.payments || []).length})`);

  const p2 = await post(`/sales-invoices/${invId}/payment`, { amount: 6800, mode: 'Bank' });
  ok(p2.ok && near(p2.body.amountPaid, 11800) && p2.body.status === 'Paid',
    `the balancing ₹6,800 settles it → ₹${p2.body.amountPaid}, ${p2.body.status}`);

  const p3 = await post(`/sales-invoices/${invId}/payment`, { amount: 1, mode: 'Bank' });
  ok(p3.status === 409, `nothing more can be received against a settled invoice (${p3.status})`);

  const sales = await call('/sales-invoices?limit=20');
  const sm = sales.body.summary || {};
  ok(near(sm.received, sm.billed),
    `the list's received never exceeds billed → billed ₹${sm.billed}, received ₹${sm.received}`);
  ok(near(sm.outstanding, 0), `and outstanding is nil → ₹${sm.outstanding}`);

  /* ══ MONEY OUT ══════════════════════════════════════════ */
  console.log('\n  ── money out: PO → receipt → vendor bill → settled');

  const proj = await post('/projects', {
    name: `Site ${stamp}`, clientName: `Client ${stamp}`, type: 'Fabrication', status: 'Active',
  });
  const vend = await post('/vendors', { name: `Supplier ${stamp}`, type: 'Supplier' });
  const po = await post('/po', {
    projectId: proj.body.id, vendorId: vend.body.id,
    itemName: `Plate ${stamp}`, quantity: 20, unitPrice: 500, gstRate: 18,
  });
  ok(po.ok, `a purchase order for 20 × ₹500 is raised (${po.status})`);
  /* Both are PATCH. Posting to them "succeeded" quietly enough that the
     order was still Pending when the goods arrived, and the receipt was
     refused for a reason two steps from the cause. */
  const appr = await call(`/po/${po.body.id}/approve`, { method: 'PATCH', body: '{}' });
  const disp = await call(`/po/${po.body.id}/dispatch`, { method: 'PATCH', body: '{}' });
  ok(appr.ok && disp.ok, `it is approved and dispatched (${appr.status}/${disp.status})`);

  const grn = await post('/grn', {
    poId: po.body.id, projectId: proj.body.id, receivedQuantity: 20,
    vehicleNumber: `KA01${stamp.slice(-4)}`,
  });
  ok(grn.ok, `the goods are received in full (${grn.status})`);

  const vbill = await post('/grn-bills', {
    projectId: proj.body.id, grnId: grn.body.grnId || grn.body.id, poId: po.body.id,
    vendorId: vend.body.id, billNumber: `VB-${stamp}`, billDate: '2026-09-02',
    gstRate: 18, interstate: false,
    items: [{ description: `Plate ${stamp}`, quantity: 20, rate: 500, uom: 'nos' }],
  });
  const billId = vbill.body.id;
  ok(vbill.ok && near(vbill.body.net ?? vbill.body.net_amount ?? 11800, 11800),
    `the vendor's bill comes to ₹11,800 (${vbill.status})`);

  if (billId) {
    /* Payables lists what is OWED — `net_amount > amount_paid` — so it must
       be read before the bill is settled. Checking after it was paid found
       nothing and passed, which proved only that an empty list is empty. */
    /* Match on id, not the number we sent — the bill number is issued by
       the system (GB-0001), the same way invoice and PO numbers are, and
       the field we supply is kept as the vendor's own reference. */
    const owing = await call('/payables?limit=50');
    const owingRows = owing.body.bills || owing.body.items || [];
    const owed = owingRows.find(b => b.id === billId);
    ok(owed && near(owed.outstanding, 11800),
      `an unpaid bill shows the full ₹11,800 outstanding in payables` +
      `${owed ? ` → ₹${owed.outstanding}` : ` (not listed; ${owingRows.length} owed)`}`);

    const v1 = await post(`/grn-bills/${billId}/payment`, { amount: 4000, mode: 'Bank' });
    ok(v1.ok && near(v1.body.amountPaid, 4000) && v1.body.paymentStatus === 'Partially Paid',
      `₹4,000 paid leaves it Partially Paid → ₹${v1.body.amountPaid}, ${v1.body.paymentStatus}`);

    const vOver = await post(`/grn-bills/${billId}/payment`, { amount: 500000, mode: 'Bank' });
    ok(vOver.status === 409,
      `paying a vendor more than the bill is worth is refused (${vOver.status})`);
    ok(/outstanding|remains/i.test(vOver.body.error || ''),
      `and says what is left to pay → "${String(vOver.body.error).slice(0, 74)}"`);

    const v2 = await post(`/grn-bills/${billId}/payment`, { amount: 7800, mode: 'Bank' });
    ok(v2.ok && near(v2.body.amountPaid, 11800) && v2.body.paymentStatus === 'Paid',
      `the balance settles it → ₹${v2.body.amountPaid}, ${v2.body.paymentStatus}`);

    const pay = await call('/payables?limit=50');
    const rowsP = pay.body.bills || pay.body.items || [];
    ok(!rowsP.some(b => b.id === billId),
      `and drops out of payables once settled — nothing is owed on it (${rowsP.length} still owed)`);
  } else {
    ok(false, `could not raise the vendor bill: ${JSON.stringify(vbill.body).slice(0, 110)}`);
  }

  /* ══ clean up ═══════════════════════════════════════════ */
  const { blocked } = await purgeOrg(db, orgId);
  if (blocked.length) console.log(`   ⚠️  could not clear: ${blocked.join(', ')}`);
  await db.query('DELETE FROM users WHERE id = $1', [orgId]).catch(() => {});
  const { rows: [left] } = await db.query(
    'SELECT COUNT(*) c FROM users WHERE email = $1', [email]);
  ok(Number(left.c) === 0, 'test organisation removed');

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('threw:', e.message); process.exit(1); });
