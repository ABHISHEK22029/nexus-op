#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   Money rules that gave wrong numbers.

   1. An order typed on the Customer Orders screen (price sent as
      targetPrice) is saved at its real value, and the invoice raised from
      it carries no discount it never had — including an order saved at ₹0
      before the fix. A quotation's order invoices exactly as before.
   2. Invoice status means something: Paid and Partially Paid follow the
      payments, a paid invoice cannot go back to Draft or be deleted.
   3. A payment can be reversed, with a reason, and the status follows.
   4. Cancelled: kept for its number, owed nothing, out of the totals and
      the reminders. Drafts stay in: most real invoices are drafts.
   5. The dashboard shows sales from the invoices: this financial year's
      billed and received, outstanding and overdue.
   6. A customer's outstanding is over ALL their invoices, with the
      opening balance and credit notes.
   Another company sees and changes none of it.

   Runs against a local backend (SCHEDULER=off) with throwaway accounts it
   deletes again. Refuses to run against a deployed host.
   ══════════════════════════════════════════════════════════════════════ */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Client } = require('pg');
const { purge, sweepStale } = require('./lib/testAccounts');
const { computeOrder } = require('../shared/orderTotals');

const API = process.env.API_BASE || 'http://localhost:5099';
if (/^https:|onrender\.com|vercel\.app|maksops\.co\.in/.test(API)) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}
const stamp = Date.now().toString(36);
const PASS = 'testpassword123';
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };
const near = (a, b, eps = 0.011) => Math.abs(Number(a) - Number(b)) <= eps;
const db = () => new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const q1 = async (sql, params) => { const c = db(); await c.connect(); try { return (await c.query(sql, params)).rows; } finally { await c.end(); } };

/* Dates as they are in India, which is what the server's year runs on. */
const ist = new Date(Date.now() + 330 * 60000);
const today = ist.toISOString().slice(0, 10);
const fyFrom = ist.getUTCMonth() + 1 < 4 ? ist.getUTCFullYear() - 1 : ist.getUTCFullYear();
const ago = (n) => new Date(ist.getTime() - n * 86400000).toISOString().slice(0, 10);
const ahead = (n) => new Date(ist.getTime() + n * 86400000).toISOString().slice(0, 10);

const call = async (who, method, url, body) => {
  const r = await fetch(`${API}${url}`, {
    method, headers: { Authorization: `Bearer ${who.token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const ids = [];
const register = async (tag) => {
  const r = await (await fetch(`${API}/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `MR ${tag}`, email: `mr-${tag}-${stamp}@example.test`, password: PASS }),
  })).json();
  if (!r.token) throw new Error(`could not register ${tag}: ${JSON.stringify(r).slice(0, 120)}`);
  ids.push(r.user.id);
  /* Tamil Nadu, so a Tamil Nadu customer is CGST+SGST at 18%. */
  await call(r, 'PUT', '/company-profile', { name: `MR ${tag} ${stamp}`, gstin: '33AAAAA0000A1Z5', stateCode: '33', setup_completed_at: new Date().toISOString() });
  return r;
};
const member = async (owner, tag, role) => {
  const email = `mr-${tag}-${stamp}@example.test`;
  const made = await call(owner, 'POST', '/admin/users', { name: `${role} person`, email, password: PASS, role });
  if (![200, 201].includes(made.status)) throw new Error(`could not add a ${role}: ${made.status} ${made.body.error || ''}`);
  const r = await (await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASS }) })).json();
  if (r.user?.id) ids.push(r.user.id);
  return r;
};
const customer = async (who, tag, extra = {}) =>
  (await call(who, 'POST', '/customers', { name: `MR cust ${tag} ${stamp}`, state: 'Tamil Nadu', gstin: '33BBBBB0000B1Z5', ...extra })).body;
/* An invoice of qty × ₹1,000 + 18%, optionally sent (issued). */
const invoice = async (who, customerId, { qty = 1, sent = true, invoiceDate, dueDate, tag = '' } = {}) => {
  const r = await call(who, 'POST', '/sales-invoices', {
    customerId, invoiceDate, dueDate, gstRate: 18,
    items: [{ description: `Job ${tag}`, uom: 'nos', quantity: qty, rate: 1000 }],
  });
  if (r.status !== 200) throw new Error(`invoice not raised: ${r.status} ${r.body.error || ''}`);
  if (sent) await call(who, 'PATCH', `/sales-invoices/${r.body.id}/status`, { status: 'Sent' });
  return r.body;
};
const getInv = async (who, id) => (await call(who, 'GET', `/sales-invoices/${id}`)).body;

(async () => {
  await sweepStale('mr-').catch(() => 0);
  try {
    const A = await register('a');
    const B = await register('b');

    /* ── 1. orders and their invoices ─────────────────────────────── */
    console.log('\n  ── 1. an order typed on the screen, and its invoice');
    const unit = computeOrder([{ quantity: 2, targetPrice: 50 }], { gstRate: 18 });
    ok(unit.subTotal === 100 && unit.total === 118, `computeOrder reads targetPrice when there is no rate (${unit.subTotal} → ${unit.total})`);
    const cO = await customer(A, 'orders');
    const o1 = await call(A, 'POST', '/customer-orders', {
      customerId: cO.id, items: [{ skuId: '', description: 'Bracket', quantity: '10', unit: 'nos', targetPrice: '1000' }],
    });
    const o1d = (await call(A, 'GET', `/customer-orders/${o1.body.id}`)).body;
    ok(o1.status === 200 && near(o1.body.total, 11800) && near(o1d.sub_total, 10000) && near(o1d.total, 11800) && near(o1d.items?.[0]?.amount, 10000),
      `sent as targetPrice only (the old screen), 10 × ₹1,000 is saved at ₹11,800 (total ${o1d.total}, line ${o1d.items?.[0]?.amount})`);
    const p1 = (await call(A, 'GET', `/sales-invoices/prefill/${o1.body.id}`)).body;
    ok(near(p1.discount, 0) && near(p1.items?.[0]?.rate, 1000), `its invoice opens with no discount, at ₹1,000 a unit (discount ${p1.discount})`);
    const i1 = await call(A, 'POST', '/sales-invoices', { customerId: cO.id, customerOrderId: o1.body.id, items: p1.items, discount: p1.discount, gstRate: p1.gstRate });
    ok(i1.status === 200 && near(i1.body.net, 11800), `and the invoice raised from it is ₹11,800 (${i1.body.net})`);

    const o2 = await call(A, 'POST', '/customer-orders', {
      customerId: cO.id, discount: 5, discountType: 'percent',
      items: [{ description: 'Gate', quantity: 10, unit: 'nos', targetPrice: 1000, rate: 1000, discount: 10 }],
    });
    const p2 = (await call(A, 'GET', `/sales-invoices/prefill/${o2.body.id}`)).body;
    ok(near(o2.body.total, 10089) && near(p2.discount, 1450),
      `10% off the line and 5% off the order: order ₹${o2.body.total}, invoice discount ₹${p2.discount} (₹1,000 + ₹450) — taxable ₹8,550 either way`);

    /* An order saved at ₹0 before the fix: the stored amount must not
       become a discount of the whole line. */
    const o3 = await call(A, 'POST', '/customer-orders', { customerId: cO.id, items: [{ description: 'Frame', quantity: 4, unit: 'nos', targetPrice: 500 }] });
    await q1('UPDATE customer_order_items SET amount = 0 WHERE customer_order_id = $1', [o3.body.id]);
    await q1('UPDATE customer_orders SET sub_total = 0, total = 0 WHERE id = $1 AND owner_id = $2', [o3.body.id, A.user.id]);
    const p3 = (await call(A, 'GET', `/sales-invoices/prefill/${o3.body.id}`)).body;
    ok(near(p3.discount, 0) && near(p3.items?.[0]?.rate, 500),
      `an order saved at ₹0 before the fix still invoices at full value — no invented discount (${p3.discount})`);

    const qt = await call(A, 'POST', '/sales-quotations', {
      customerId: cO.id, discount: 1000, gstRate: 18, items: [{ description: 'Panel', uom: 'nos', quantity: 4, rate: 2500 }],
    });
    const conv = await call(A, 'POST', `/sales-quotations/${qt.body.id}/convert`);
    const p4 = (await call(A, 'GET', `/sales-invoices/prefill/${conv.body.orderId}`)).body;
    ok(conv.status === 200 && near(p4.discount, 1000) && near(p4.items?.[0]?.rate, 2500),
      `an order converted from a quotation keeps the quotation's ₹1,000 discount, as before (${p4.discount})`);
    const bPre = await call(B, 'GET', `/sales-invoices/prefill/${o1.body.id}`);
    ok(bPre.status === 404, `another company cannot prefill from A's order (${bPre.status})`);

    /* ── 2. status rules ──────────────────────────────────────────── */
    console.log('\n  ── 2. status follows the money');
    const cS = await customer(A, 'status');
    const inv = await invoice(A, cS.id, { qty: 10, sent: false, tag: 'status' });
    const paidByHand = await call(A, 'PATCH', `/sales-invoices/${inv.id}/status`, { status: 'Paid' });
    const partByHand = await call(A, 'PATCH', `/sales-invoices/${inv.id}/status`, { status: 'Partially Paid' });
    ok(paidByHand.status === 400 && partByHand.status === 400 && (await getInv(A, inv.id)).status === 'Draft',
      `Paid / Partially Paid cannot be set by hand with ₹0 received (${paidByHand.status}, ${partByHand.status}): "${paidByHand.body.error}"`);
    const sent = await call(A, 'PATCH', `/sales-invoices/${inv.id}/status`, { status: 'Sent' });
    ok(sent.status === 200 && (await getInv(A, inv.id)).status === 'Sent', 'Draft → Sent is allowed');
    const pay1 = await call(A, 'POST', `/sales-invoices/${inv.id}/payment`, { amount: 5000, mode: 'Bank', paidDate: today });
    ok(pay1.status === 200 && pay1.body.status === 'Partially Paid', `₹5,000 received → ${pay1.body.status}`);
    const back = await call(A, 'PATCH', `/sales-invoices/${inv.id}/status`, { status: 'Draft' });
    const cancelPaid = await call(A, 'PATCH', `/sales-invoices/${inv.id}/status`, { status: 'Cancelled' });
    const sentPaid = await call(A, 'PATCH', `/sales-invoices/${inv.id}/status`, { status: 'Sent' });
    ok(back.status === 409 && /Reverse its payments/.test(back.body.error || ''), `with money in, it cannot go back to Draft (${back.status}): "${back.body.error}"`);
    ok(cancelPaid.status === 409 && sentPaid.status === 409 && (await getInv(A, inv.id)).status === 'Partially Paid',
      `nor be cancelled or set to Sent by hand (${cancelPaid.status}, ${sentPaid.status})`);
    const del = await call(A, 'DELETE', `/sales-invoices/${inv.id}`);
    const still = await getInv(A, inv.id);
    ok(del.status === 409 && /Reverse its payments first/.test(del.body.error || '') && still.id === inv.id && still.payments?.length === 1,
      `an invoice with payments cannot be deleted (${del.status}): "${del.body.error}"`);
    const bStatus = await call(B, 'PATCH', `/sales-invoices/${inv.id}/status`, { status: 'Draft' });
    ok(bStatus.status === 404, `another company cannot touch its status (${bStatus.status})`);

    /* ── 3. reversing a payment ───────────────────────────────────── */
    console.log('\n  ── 3. reversing a payment');
    const pay2 = await call(A, 'POST', `/sales-invoices/${inv.id}/payment`, { amount: 6800, mode: 'Cheque', reference: `CHQ-${stamp}`, paidDate: today });
    ok(pay2.body.status === 'Paid', `the balance settles it → ${pay2.body.status}`);
    const pays = (await getInv(A, inv.id)).payments || [];
    const chq = pays.find((p) => near(p.amount, 6800));
    const noReason = await call(A, 'DELETE', `/sales-invoices/${inv.id}/payments/${chq.id}`, {});
    ok(noReason.status === 400, `a reversal needs a reason (${noReason.status})`);
    const bRev = await call(B, 'DELETE', `/sales-invoices/${inv.id}/payments/${chq.id}`, { reason: 'mine now' });
    ok(bRev.status === 404, `another company cannot reverse it (${bRev.status})`);
    const other = await invoice(A, cS.id, { tag: 'other' });
    await call(A, 'POST', `/sales-invoices/${other.id}/payment`, { amount: 100, mode: 'Cash' });
    const otherPay = (await getInv(A, other.id)).payments[0];
    const wrongInv = await call(A, 'DELETE', `/sales-invoices/${inv.id}/payments/${otherPay.id}`, { reason: 'wrong invoice' });
    ok(wrongInv.status === 404 && (await getInv(A, other.id)).payments.length === 1, `a payment of another invoice cannot be reversed through this one (${wrongInv.status})`);
    let viewerNote = '';
    try {
      const V = await member(A, 'viewer', 'Viewer');
      const vRev = await call(V, 'DELETE', `/sales-invoices/${inv.id}/payments/${chq.id}`, { reason: 'viewer' });
      ok(vRev.status === 403, `a Viewer, who may not delete invoices, cannot reverse a payment (${vRev.status})`);
    } catch (e) { viewerNote = e.message; ok(false, `could not test the Viewer: ${e.message}`); }
    const rev1 = await call(A, 'DELETE', `/sales-invoices/${inv.id}/payments/${chq.id}`, { reason: 'Cheque bounced' });
    const afterRev1 = await getInv(A, inv.id);
    ok(rev1.status === 200 && rev1.body.status === 'Partially Paid' && near(afterRev1.amount_paid, 5000) && afterRev1.status === 'Partially Paid' && afterRev1.payments.length === 1,
      `reversing the ₹6,800 cheque: Paid → ${afterRev1.status}, ₹${afterRev1.amount_paid} received`);
    const [act] = await q1(`SELECT description FROM activities WHERE owner_id = $1 AND type = 'PAYMENT_REVERSED' ORDER BY id DESC LIMIT 1`, [A.user.id]);
    ok(/₹6,800/.test(act?.description || '') && act.description.includes(today) && /Cheque bounced/.test(act.description) && act.description.includes(still.invoice_number),
      `the activity log says what, when and why: "${act?.description}"`);
    const rev2 = await call(A, 'DELETE', `/sales-invoices/${inv.id}/payments/${afterRev1.payments[0].id}`, { reason: 'Typed against the wrong invoice' });
    const afterRev2 = await getInv(A, inv.id);
    ok(rev2.status === 200 && afterRev2.status === 'Sent' && near(afterRev2.amount_paid, 0) && !afterRev2.payments.length,
      `reversing the last one: Partially Paid → ${afterRev2.status}, ₹${afterRev2.amount_paid} received`);
    const again = await call(A, 'DELETE', `/sales-invoices/${inv.id}/payments/${chq.id}`, { reason: 'twice' });
    ok(again.status === 404, `the same payment cannot be reversed twice (${again.status})`);

    /* ── 4. cancelled, and drafts ─────────────────────────────────── */
    console.log('\n  ── 4. cancelled — kept for its number, owed nothing');
    const before = (await call(A, 'GET', `/sales-invoices?limit=5&customer_id=${cS.id}`)).body.summary || {};
    const cancel = await call(A, 'PATCH', `/sales-invoices/${inv.id}/status`, { status: 'Cancelled' });
    const cancelled = await getInv(A, inv.id);
    ok(cancel.status === 200 && cancelled.status === 'Cancelled' && cancelled.invoice_number === still.invoice_number,
      `an issued invoice with nothing paid is cancelled, keeping its number ${cancelled.invoice_number}`);
    const after = (await call(A, 'GET', `/sales-invoices?limit=5&customer_id=${cS.id}`)).body.summary || {};
    ok(near(Number(before.billed) - Number(after.billed), 11800) && near(Number(before.outstanding) - Number(after.outstanding), 11800),
      `it drops out of the list's billed and outstanding (billed ₹${before.billed} → ₹${after.billed})`);
    const payCancelled = await call(A, 'POST', `/sales-invoices/${inv.id}/payment`, { amount: 10, mode: 'Cash' });
    const reopenCancelled = await call(A, 'PATCH', `/sales-invoices/${inv.id}/status`, { status: 'Sent' });
    const editCancelled = await call(A, 'PATCH', `/sales-invoices/${inv.id}`, { notes: 'changed' });
    ok(payCancelled.status === 409 && reopenCancelled.status === 409 && editCancelled.status === 409,
      `nothing is received against it, it is not reopened, it is not edited (${payCancelled.status}, ${reopenCancelled.status}, ${editCancelled.status})`);

    const cR = await customer(A, 'reminders');
    const odSent = await invoice(A, cR.id, { invoiceDate: ago(40), dueDate: ago(10), tag: 'od-sent' });
    const odDraft = await invoice(A, cR.id, { sent: false, invoiceDate: ago(40), dueDate: ago(10), tag: 'od-draft' });
    const odCancelled = await invoice(A, cR.id, { invoiceDate: ago(40), dueDate: ago(10), tag: 'od-cancelled' });
    await call(A, 'PATCH', `/sales-invoices/${odCancelled.id}/status`, { status: 'Cancelled' });
    const run = await call(A, 'POST', '/recurring/run-now');
    const per = await q1(`SELECT entity_id, count(*)::int n FROM notifications WHERE user_id = $1 AND type = 'INVOICE_OVERDUE' GROUP BY entity_id`, [A.user.id]);
    const n = (id) => per.find((x) => x.entity_id === id)?.n || 0;
    ok(run.status === 200 && n(odSent.id) === 1 && n(odDraft.id) === 1 && n(odCancelled.id) === 0,
      `overdue reminders: the sent invoice (${n(odSent.id)}) and the draft (${n(odDraft.id)}) are chased, not the cancelled one (${n(odCancelled.id)})`);
    const rs = (await call(A, 'GET', `/sales-invoices?limit=5&customer_id=${cR.id}`)).body.summary || {};
    ok(near(rs.billed, 2360) && near(rs.outstanding, 2360) && rs.count === 3,
      `the list's totals count the sent one and the draft, not the cancelled one (billed ₹${rs.billed}, ${rs.count} listed)`);

    /* ── 5. the dashboard ─────────────────────────────────────────── */
    console.log('\n  ── 5. the dashboard shows sales');
    const C = await register('c');
    const cD = await customer(C, 'dash');
    const lastFy = `${fyFrom - 1}-10-15`;
    const dA = await invoice(C, cD.id, { qty: 10, invoiceDate: today, dueDate: ahead(30), tag: 'this year' });
    await call(C, 'POST', `/sales-invoices/${dA.id}/payment`, { amount: 5000, mode: 'Bank', paidDate: today });
    const dB = await invoice(C, cD.id, { qty: 2, invoiceDate: lastFy, dueDate: `${fyFrom - 1}-11-14`, tag: 'last year' });
    await call(C, 'POST', `/sales-invoices/${dB.id}/payment`, { amount: 360, mode: 'Bank', paidDate: `${fyFrom - 1}-10-20` });
    await invoice(C, cD.id, { sent: false, invoiceDate: today, tag: 'draft' });
    const dD = await invoice(C, cD.id, { invoiceDate: today, tag: 'cancelled' });
    await call(C, 'PATCH', `/sales-invoices/${dD.id}/status`, { status: 'Cancelled' });
    const dash = await call(C, 'GET', '/dashboard');
    const s = dash.body.sales || {};
    const fyLabel = `FY ${fyFrom}-${String(fyFrom + 1).slice(2)}`;
    ok(dash.status === 200 && s.fyLabel === fyLabel && s.fyStart === `${fyFrom}-04-01`, `the year is the Indian financial year: ${s.fyLabel} from ${s.fyStart}`);
    ok(near(s.billed, 12980), `billed this year: ₹${s.billed} — with the draft, without last year's invoice or the cancelled one`);
    ok(near(s.received, 5000), `received this year: ₹${s.received} — last year's ₹360 is not`);
    ok(near(s.outstanding, 9980), `outstanding today: ₹${s.outstanding} (₹6,800 + ₹2,000 + the ₹1,180 draft)`);
    ok(s.overdueCount === 1 && near(s.overdueAmount, 2000), `overdue: ${s.overdueCount} invoice, ₹${s.overdueAmount}`);
    ok(dash.body.hasRaBills === false, 'a company with no RA bills is told so, so the RA tiles stay off');
    const bDash = (await call(B, 'GET', '/dashboard')).body.sales || {};
    ok(bDash.billed === 0 && bDash.received === 0 && bDash.outstanding === 0 && bDash.overdueCount === 0,
      `another company's dashboard shows none of it (${JSON.stringify(bDash)})`);

    /* ── 6. a customer's outstanding ──────────────────────────────── */
    console.log('\n  ── 6. what a customer owes — all of it');
    const cX = await customer(A, 'owes', { opening_balance: 5000, credit_limit: 20000 });
    const made = [];
    for (let i = 0; i < 22; i++) {
      made.push(await invoice(A, cX.id, { dueDate: i < 2 ? ago(5) : ahead(30), tag: `x${i}` }));
    }
    await call(A, 'POST', `/sales-invoices/${made[5].id}/payment`, { amount: 1180, mode: 'Bank' });
    await invoice(A, cX.id, { sent: false, tag: 'x-draft' });
    const xc = await invoice(A, cX.id, { tag: 'x-cancelled' });
    await call(A, 'PATCH', `/sales-invoices/${xc.id}/status`, { status: 'Cancelled' });
    const cn = await call(A, 'POST', '/credit-debit-notes', {
      noteType: 'credit', partyType: 'customer', partyId: cX.id, gstRate: 18, reason: 'Short supply',
      items: [{ description: 'Returned', quantity: 1, rate: 1000 }],
    });
    const sum = await call(A, 'GET', `/customers/${cX.id}/summary`);
    const m = sum.body.metrics || {};
    ok(cn.status === 200 && sum.status === 200, `a credit note of ₹1,180 is raised, and the summary reads (${cn.status}, ${sum.status})`);
    ok(near(m.lifetime_billed, 27140) && m.invoices_count === 23,
      `billed over all 23 invoices (22 sent and a draft), not the latest 20, and not the cancelled one: ₹${m.lifetime_billed} (${m.invoices_count})`);
    ok(near(m.received, 1180) && near(m.opening_balance, 5000) && near(m.credit_notes, 1180), `received ₹${m.received}, opening ₹${m.opening_balance}, credit notes ₹${m.credit_notes}`);
    ok(near(m.outstanding, 29780), `outstanding = 5,000 + 27,140 − 1,180 − 1,180 = ₹${m.outstanding}`);
    ok(m.overdue_count === 2 && near(m.overdue_amount, 2360), `overdue: ${m.overdue_count} invoices, ₹${m.overdue_amount}`);
    ok(m.credit_limit === 20000 && m.over_credit_limit === true, `over the ₹20,000 credit limit: ${m.over_credit_limit}`);
    ok(sum.body.invoices?.length === 20, `the recent-invoices list still shows 20 (${sum.body.invoices?.length})`);
    const bSum = await call(B, 'GET', `/customers/${cX.id}/summary`);
    ok(bSum.status === 404, `another company cannot read it (${bSum.status})`);
    if (viewerNote) console.log(`      (viewer: ${viewerNote})`);
  } catch (e) {
    fail++; console.log(`   ❌ crashed: ${e.stack || e.message}`);
  } finally {
    const removed = await purge(ids).catch((e) => { console.log('   cleanup failed:', e.message); return 0; });
    const [{ left }] = await q1(`SELECT COUNT(*)::int AS left FROM users WHERE email LIKE $1`, [`mr-%-${stamp}@example.test`]).catch(() => [{ left: -1 }]);
    console.log(`\n   ${left === 0 ? '✅' : '❌'} test accounts removed (${removed} deleted, ${left} left)`);
    if (left !== 0) fail++;
    console.log(`\n  ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
})();
