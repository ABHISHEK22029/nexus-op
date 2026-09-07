#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   The eight flows nothing had ever tested.

   Inventory, quotations, sign-up and purchasing have been driven hard.
   These had not been touched, and every flow opened so far has contained
   four or five real faults — so this is written expecting to find some,
   not to confirm they are fine.

     1. delivery challans      stock leaves once; order status follows
     2. credit / debit notes   reverses the right document, GST sign
     3. payables               what is owed, and the ageing
     4. material requirements  demand vs stock vs shortfall
     5. vendor bills           against a purchase order
     6. expenses               posts once, owner-scoped
     7. milestones             create, progress, ordering
     8. BOQ                    quantities against the measurement book

   Each section states the invariant it is checking. Everything created is
   tagged and removed at the end.
   ══════════════════════════════════════════════════════════════════════ */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../db');

const API = process.env.API_BASE || 'http://localhost:5099';
const EMAIL = process.env.UI_EMAIL, PASSWORD = process.env.UI_PASSWORD;
if (!EMAIL || !PASSWORD) { console.error('set UI_EMAIL and UI_PASSWORD'); process.exit(1); }
if (/^https:|onrender\.com|vercel\.app/.test(API)) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}

const TAG = `FLOW8-${Date.now().toString(36).toUpperCase()}`;
let pass = 0, fail = 0;
const findings = [];
const ok = (c, m) => {
  c ? pass++ : fail++;
  console.log(`   ${c ? '✅' : '❌'} ${m}`);
  if (!c) findings.push(m);
};

/* An assertion over an empty set passes without testing anything.
 *
 * "no bill is paid more than it is worth (0)" read as a tick while
 * /payables was returning zero rows — the endpoint was right, but the test
 * was proving nothing and saying so with the same symbol it uses for a real
 * result. A check that examined nothing should say it examined nothing. */
let vacuous = 0;
const okOver = (n, c, m) => {
  if (n === 0) { vacuous++; console.log(`   ◦  ${m} — nothing to check`); return; }
  ok(c, `${m} (over ${n} rows)`);
};
const near = (a, b, t = 0.75) => Math.abs(Number(a) - Number(b)) <= t;

let auth;
const call = async (path, opts = {}) => {
  const res = await fetch(`${API}${path}`, {
    ...opts, headers: { 'Content-Type': 'application/json', ...auth, ...(opts.headers || {}) },
  });
  const txt = await res.text();
  let body; try { body = JSON.parse(txt); } catch { body = { raw: txt.slice(0, 140) }; }
  return { status: res.status, ok: res.ok, body };
};
const rows = (b) => (Array.isArray(b) ? b : (b.items || []));

(async () => {
  auth = { Authorization: `Bearer ${await (await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })).json().then(d => d.token)}` };

  const cleanup = { challans: [], notes: [], expenses: [], milestones: [], inventory: [] };
  const customerId = (rows((await call('/customers?limit=1')).body)[0] || {}).id;
  const vendorId = (rows((await call('/vendors?limit=1')).body)[0] || {}).id;

  /* ══ 1. DELIVERY CHALLANS ═══════════════════════════════
     Stock must leave exactly once, on dispatch, and the order status must
     follow what has actually shipped. */
  console.log('\n  ── 1. delivery challans');
  const stockRow = await call('/inventory', {
    method: 'POST',
    body: JSON.stringify({ itemName: `${TAG} Panel`, quantity: 100, uom: 'nos', unitCost: 500 }),
  });
  const invId = stockRow.body.item?.id;
  if (invId) cleanup.inventory.push(invId);

  const dc = await call('/delivery-challans', {
    method: 'POST',
    body: JSON.stringify({
      customerId, challanDate: '2026-09-01', notes: TAG,
      items: [{ description: `${TAG} Panel`, quantity: 20, rate: 500, uom: 'nos' }],
    }),
  });
  ok(dc.ok, `a challan can be raised (${dc.status})` + (dc.ok ? '' : ` — ${dc.body.error || ''}`));
  const dcId = dc.body?.id;
  if (dcId) cleanup.challans.push(dcId);

  if (dcId) {
    const beforeQty = (await db.query('SELECT quantity FROM inventory WHERE id=$1', [invId])).rows[0]?.quantity;
    ok(Number(beforeQty) === 100, `stock is untouched while the challan is a draft → ${beforeQty}`);

    await call(`/delivery-challans/${dcId}/status`, {
      method: 'PATCH', body: JSON.stringify({ status: 'Dispatched' }),
    });
    const afterQty = (await db.query('SELECT quantity FROM inventory WHERE id=$1', [invId])).rows[0]?.quantity;
    ok(Number(afterQty) === 80, `stock leaves on dispatch, not before → ${afterQty}`);

    const { rows: mv } = await db.query(
      `SELECT movement_type, quantity FROM stock_movements WHERE inventory_id=$1 AND movement_type='dispatch'`, [invId]);
    ok(mv.length === 1 && Number(mv[0].quantity) === -20,
      `one dispatch movement of -20 on the ledger (${mv.length} entries)`);

    /* Setting Dispatched twice must not move stock twice. */
    await call(`/delivery-challans/${dcId}/status`, {
      method: 'PATCH', body: JSON.stringify({ status: 'Dispatched' }),
    });
    const twice = (await db.query('SELECT quantity FROM inventory WHERE id=$1', [invId])).rows[0]?.quantity;
    ok(Number(twice) === 80, `dispatching twice does not remove the stock twice → ${twice}`);
  }

  /* ══ 2. CREDIT / DEBIT NOTES ════════════════════════════ */
  console.log('\n  ── 2. credit and debit notes');
  const cn = await call('/credit-debit-notes', {
    method: 'POST',
    body: JSON.stringify({
      noteType: 'credit', partyType: 'customer', partyId: customerId,
      noteDate: '2026-09-01', reason: TAG, gstRate: 18,
      items: [{ description: `${TAG} short supply`, quantity: 2, rate: 500 }],
    }),
  });
  ok(cn.ok, `a credit note can be raised (${cn.status})` + (cn.ok ? '' : ` — ${cn.body.error || ''}`));
  if (cn.body?.id) cleanup.notes.push(cn.body.id);
  if (cn.ok) {
    const full = (await call(`/credit-debit-notes/${cn.body.id}`)).body;
    ok(near(full.sub_total, 1000), `its value is quantity × rate → ${full.sub_total}`);
    ok(near(full.gst_total, 180), `GST at 18% → ${full.gst_total}`);
    ok(near(full.total, 1180), `total is value plus GST → ${full.total}`);
    const split = Number(full.cgst) + Number(full.sgst) + Number(full.igst);
    ok(near(split, Number(full.gst_total)), `the GST split sums to the GST total → ${split}`);
  }

  const dn = await call('/credit-debit-notes', {
    method: 'POST',
    body: JSON.stringify({
      noteType: 'debit', partyType: 'vendor', partyId: vendorId,
      noteDate: '2026-09-01', reason: TAG, gstRate: 18,
      items: [{ description: `${TAG} rate correction`, quantity: 1, rate: 250 }],
    }),
  });
  ok(dn.ok, `a debit note against a vendor can be raised (${dn.status})`);
  if (dn.body?.id) cleanup.notes.push(dn.body.id);

  const noteList = (await call('/credit-debit-notes?limit=200')).body;
  const sum = noteList.summary || {};
  ok(sum.credit_total !== undefined && sum.debit_total !== undefined,
    'credit and debit are summarised separately, never netted into one figure');

  /* ══ 3. PAYABLES ════════════════════════════════════════ */
  console.log('\n  ── 3. payables');
  const pay = await call('/payables?limit=50');
  ok(pay.ok, `the payables list answers (${pay.status})`);
  /* /payables answers with a dashboard shape — { bills, vendors, ageing },
     not { items } — so rows() found nothing and every check below passed
     over an empty array. */
  const payRows = pay.body.bills || rows(pay.body);
  const negative = payRows.filter(r => Number(r.outstanding ?? r.balance ?? 0) < -0.01);
  okOver(payRows.length, negative.length === 0, 'nothing is owed a negative amount');
  if (pay.body?.summary) {
    const s = pay.body.summary;
    ok(Number(s.total ?? s.outstanding ?? 0) >= 0, `the outstanding total is not negative → ${s.total ?? s.outstanding}`);
  }

  /* ══ 4. MATERIAL REQUIREMENTS ═══════════════════════════
     Shortfall must be demand minus what is available, never negative. */
  console.log('\n  ── 4. material requirements');
  const mr = await call('/material-requirements?limit=100');
  ok(mr.ok, `the requirements board answers (${mr.status})`);
  const mrRows = rows(mr.body);
  const badShort = mrRows.filter(r => {
    const req = Number(r.required ?? r.demand ?? 0);
    const av = Number(r.available ?? r.in_stock ?? 0);
    const sh = Number(r.shortfall ?? r.short ?? 0);
    return sh > 0 && !near(sh, Math.max(0, req - av), 1);
  });
  okOver(mrRows.length, badShort.length === 0,
    'shortfall equals demand minus stock on every row' +
    (badShort.length ? ` — e.g. ${JSON.stringify(badShort[0]).slice(0, 110)}` : ''));
  const negShort = mrRows.filter(r => Number(r.shortfall ?? r.short ?? 0) < -0.01);
  okOver(mrRows.length, negShort.length === 0, 'no negative shortfall');

  /* ══ 5. VENDOR BILLS ════════════════════════════════════ */
  console.log('\n  ── 5. vendor bills');
  const bills = await call('/bills?limit=50');
  ok(bills.ok, `the bills list answers (${bills.status})`);
  const billRows = rows(bills.body);
  const overPaid = billRows.filter(b =>
    Number(b.amountPaid ?? b.amount_paid ?? 0) > Number(b.netAmount ?? b.net_amount ?? 0) + 0.01);
  okOver(billRows.length, overPaid.length === 0, 'no bill is paid more than it is worth');

  /* ══ 6. EXPENSES ════════════════════════════════════════ */
  console.log('\n  ── 6. expenses');
  const ex = await call('/expenses', {
    method: 'POST',
    body: JSON.stringify({
      category: 'Testing', description: `${TAG} expense`, amount: 1234,
      expense_date: '2026-09-01',
    }),
  });
  ok(ex.ok, `an expense can be recorded (${ex.status})` + (ex.ok ? '' : ` — ${ex.body.error || ''}`));
  if (ex.body?.id) cleanup.expenses.push(ex.body.id);
  if (ex.ok) {
    const back = rows((await call(`/expenses?search=${encodeURIComponent(TAG)}`)).body);
    ok(back.length === 1, `it appears exactly once (${back.length})`);
    ok(near(back[0]?.amount, 1234), `with the amount recorded → ${back[0]?.amount}`);
    const { rows: [o] } = await db.query('SELECT owner_id FROM expenses WHERE id=$1', [ex.body.id]);
    ok(o?.owner_id != null, `and an owner, so it is visible to its owner → ${o?.owner_id}`);
  }

  /* ══ 7. MILESTONES ══════════════════════════════════════ */
  console.log('\n  ── 7. milestones');
  const wo = rows((await call('/work-orders?limit=1')).body)[0];
  if (wo) {
    const ms = await call('/milestones', {
      method: 'POST',
      body: JSON.stringify({ workOrderId: wo.id, name: `${TAG} stage`, plannedPercent: 50 }),
    });
    ok(ms.ok, `a milestone can be created (${ms.status})`);
    if (ms.body?.id) cleanup.milestones.push(ms.body.id);

    const bad = await call('/milestones', {
      method: 'POST',
      body: JSON.stringify({ workOrderId: wo.id, name: `${TAG} bad`, plannedPercent: 150 }),
    });
    ok(!bad.ok, `a planned percentage above 100 is refused (${bad.status})`);
    if (bad.body?.id) cleanup.milestones.push(bad.body.id);

    const noName = await call('/milestones', {
      method: 'POST', body: JSON.stringify({ workOrderId: wo.id, name: '   ' }),
    });
    ok(!noName.ok, `a milestone with no name is refused (${noName.status})`);
  } else ok(false, 'no work order to hang a milestone from');

  /* ══ 8. BOQ ═════════════════════════════════════════════ */
  console.log('\n  ── 8. bill of quantities');
  const boq = await call('/boq?limit=50');
  ok(boq.ok, `the BOQ list answers (${boq.status})`);
  const boqRows = rows(boq.body);
  const badRate = boqRows.filter(b => Number(b.rate ?? 0) < 0 || Number(b.estimatedQuantity ?? 0) < 0);
  okOver(boqRows.length, badRate.length === 0, 'no negative quantity or rate');

  const mb = await call('/mb?limit=50');
  ok(mb.ok, `the measurement book answers (${mb.status})`);

  /* ══ clean up ═══════════════════════════════════════════ */
  for (const id of cleanup.notes)      await call(`/credit-debit-notes/${id}`, { method: 'DELETE' });
  for (const id of cleanup.expenses)   await call(`/expenses/${id}`, { method: 'DELETE' });
  for (const id of cleanup.milestones) await db.query('DELETE FROM milestones WHERE id=$1', [id]).catch(() => {});
  for (const id of cleanup.challans) {
    await db.query('DELETE FROM delivery_challan_items WHERE delivery_challan_id=$1', [id]).catch(() => {});
    await db.query('DELETE FROM delivery_challans WHERE id=$1', [id]).catch(() => {});
  }
  for (const id of cleanup.inventory) {
    await db.query('DELETE FROM stock_movements WHERE inventory_id=$1', [id]).catch(() => {});
    await db.query('DELETE FROM inventory WHERE id=$1', [id]).catch(() => {});
  }

  console.log(`\n  ${pass} passed, ${fail} failed` +
    (vacuous ? `, ${vacuous} had no rows to examine` : ''));
  if (findings.length) {
    console.log('\n  worth looking at:');
    findings.forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
  }
  console.log('');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('threw:', e.message); process.exit(1); });
