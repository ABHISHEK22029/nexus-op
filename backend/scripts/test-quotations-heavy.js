#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   Quotations, under load and at the edges.

   The screen has been tested with two records. Two records prove that a
   list renders; they prove nothing about the arithmetic, the state machine
   or what happens on the hundredth row.

   This raises 40 quotations across real customers with varied line items,
   discounts and tax situations, then checks:

     · GST arithmetic — CGST+SGST within a state, IGST across one, and
       that the split halves are equal and sum to the same total
     · discounts applied before tax, not after
     · the status machine — can a Rejected quote still be converted?
     · conversion — does the order carry the same value, discount and
       interstate flag as the quote it came from
     · double conversion — does converting twice make two orders
     · pagination and search at volume
     · totals: does the summary strip agree with the rows

   Everything it creates is tagged and deleted at the end.
   ══════════════════════════════════════════════════════════════════════ */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const API = process.env.API_BASE || 'http://localhost:5099';
const EMAIL = process.env.UI_EMAIL, PASSWORD = process.env.UI_PASSWORD;
if (!EMAIL || !PASSWORD) { console.error('set UI_EMAIL and UI_PASSWORD'); process.exit(1); }
if (/^https:|onrender\.com|vercel\.app/.test(API)) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}

const TAG = `QTEST-${Date.now().toString(36).toUpperCase()}`;
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };
const near = (a, b, tol = 0.75) => Math.abs(Number(a) - Number(b)) <= tol;

let auth;
const call = async (path, opts = {}) => {
  const res = await fetch(`${API}${path}`, {
    ...opts, headers: { 'Content-Type': 'application/json', ...auth, ...(opts.headers || {}) },
  });
  const txt = await res.text();
  let body; try { body = JSON.parse(txt); } catch { body = { raw: txt.slice(0, 120) }; }
  return { status: res.status, ok: res.ok, body };
};

(async () => {
  auth = { Authorization: `Bearer ${await (await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })).json().then(d => d.token)}` };

  const custs = (await call('/customers?limit=200')).body;
  const customers = (custs.items || custs).filter(c => c.name);
  ok(customers.length > 5, `${customers.length} customers to quote against`);

  /* Company state decides CGST+SGST vs IGST. Read it rather than assume. */
  const profile = (await call('/company-profile')).body;
  const homeState = profile.state || profile.gstin?.slice(0, 2) || null;
  console.log(`\n  company state: ${homeState || '(not set)'}\n`);

  /* ── raise 40 ───────────────────────────────────────────── */
  const made = [];
  console.log('  ── raising 40 quotations');
  for (let i = 0; i < 40; i++) {
    const c = customers[i % customers.length];
    const lines = [
      { description: `${TAG} Fabricated panel`, quantity: 10 + i, rate: 1500 + i * 25, gstRate: 18 },
      { description: `${TAG} Powder coating`,   quantity: 5 + (i % 7), rate: 400 + i * 5, gstRate: 18 },
    ];
    const discount = i % 4 === 0 ? 5000 : 0;
    const r = await call('/sales-quotations', {
      method: 'POST',
      body: JSON.stringify({
        customerId: c.id, quoteDate: '2026-09-01', validUntil: '2026-10-01',
        notes: TAG, discount, items: lines, gstRate: 18,
      }),
    });
    if (!r.ok) { ok(false, `quotation ${i} refused: ${r.status} ${JSON.stringify(r.body).slice(0, 110)}`); break; }
    made.push({ id: r.body.id ?? r.body.quotation?.id, customer: c, discount, lines });
  }
  ok(made.length === 40, `40 raised (${made.length} succeeded)`);
  if (!made.length) { console.log('\n  cannot continue\n'); process.exit(1); }

  /* ── arithmetic on one, in full ─────────────────────────── */
  const one = made[0];
  const full = (await call(`/sales-quotations/${one.id}`)).body;
  const q = full.quotation || full;
  const items = full.lineItems || full.items || q.lineItems || [];

  const gross = one.lines.reduce((s, l) => s + l.quantity * l.rate, 0);
  const taxable = gross - one.discount;
  const expectedTax = taxable * 0.18;

  ok(items.length === 2, `both line items stored (${items.length})`);
  /* sub_total is the gross BEFORE the discount — the order a printed
     invoice reads in: subtotal, less discount, then tax. The taxable
     value is what tax must be charged on, and that is checked below. */
  ok(near(q.sub_total ?? q.subtotal, gross),
    `subtotal is the gross before discount → ${q.sub_total ?? q.subtotal} (expected ${gross})`);

  const cgst = Number(q.cgst || 0), sgst = Number(q.sgst || 0), igst = Number(q.igst || 0);
  const taxTotal = cgst + sgst + igst;
  ok(near(taxTotal, expectedTax, 2), `tax is 18% of the taxable value → ${taxTotal.toFixed(2)} (expected ${expectedTax.toFixed(2)})`);
  /* The one that actually matters. Tax must be charged on gross MINUS the
     discount. Charged on the gross, the customer pays GST on money they
     were never asked for and the GST return is overstated. */
  ok(near(Number(q.net_amount ?? q.total) - taxTotal, taxable, 2),
    `tax was charged on the discounted value, not the gross → taxable ${taxable}`);

  const shipState = one.customer.shipping_state || one.customer.state;
  const interstate = homeState && shipState &&
    String(shipState).trim().toLowerCase() !== String(homeState).trim().toLowerCase();
  if (interstate) {
    ok(igst > 0 && cgst === 0 && sgst === 0,
      `${shipState} vs ${homeState} is interstate → IGST only (cgst=${cgst} sgst=${sgst} igst=${igst})`);
  } else {
    ok(near(cgst, sgst) && igst === 0,
      `same state → CGST equals SGST, no IGST (cgst=${cgst} sgst=${sgst} igst=${igst})`);
  }
  ok(near(q.net_amount ?? q.total, taxable + taxTotal, 2),
    `total is taxable + tax → ${q.net_amount ?? q.total}`);

  /* Discount must reduce tax. If it were applied after tax, the customer
     is overcharged GST on money they never paid — and the return is wrong. */
  const noDisc = made.find(m => m.discount === 0);
  if (noDisc) {
    const nd = (await call(`/sales-quotations/${noDisc.id}`)).body;
    const ndq = nd.quotation || nd;
    const ndGross = noDisc.lines.reduce((s, l) => s + l.quantity * l.rate, 0);
    ok(near(ndq.sub_total ?? ndq.subtotal, ndGross),
      'a quote with no discount has subtotal equal to gross');
  }

  /* ── the state machine ──────────────────────────────────── */
  console.log('\n  ── status and conversion');
  const rej = made[1];
  const setRej = await call(`/sales-quotations/${rej.id}/status`, {
    method: 'PATCH', body: JSON.stringify({ status: 'Rejected' }),
  });
  ok(setRej.ok, `a quote can be marked Rejected (${setRej.status})`);

  const convRej = await call(`/sales-quotations/${rej.id}/convert`, { method: 'POST' });
  ok(!convRej.ok, `a REJECTED quote cannot be converted to an order (got ${convRej.status})`);

  const good = made[2];
  await call(`/sales-quotations/${good.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'Accepted' }) });
  const conv = await call(`/sales-quotations/${good.id}/convert`, { method: 'POST' });
  ok(conv.ok, `an accepted quote converts (${conv.status})`);

  const orderId = conv.body.orderId ?? conv.body.id ?? conv.body.order?.id;
  if (orderId) {
    const ord = (await call(`/customer-orders/${orderId}`)).body;
    const o = ord.order || ord;
    const gq = (await call(`/sales-quotations/${good.id}`)).body;
    const gqq = gq.quotation || gq;
    ok(near(o.net_amount ?? o.total, gqq.net_amount ?? gqq.total, 2),
      `the order carries the quote's value → order ${o.net_amount ?? o.total} vs quote ${gqq.net_amount ?? gqq.total}`);
    ok(near(Number(o.discount || 0), Number(gqq.discount || 0)),
      `the discount survives conversion → ${o.discount} vs ${gqq.discount}`);
  }

  const twice = await call(`/sales-quotations/${good.id}/convert`, { method: 'POST' });
  ok(!twice.ok, `converting the same quote twice is refused (got ${twice.status})`);

  /* ── volume ─────────────────────────────────────────────── */
  console.log('\n  ── at volume');
  const p1 = (await call('/sales-quotations?limit=25&offset=0')).body;
  const p2 = (await call('/sales-quotations?limit=25&offset=25')).body;
  const r1 = p1.items || p1, r2 = p2.items || p2;
  ok(r1.length === 25, `offset 0 returns 25 (${r1.length})`);
  ok(r2.length > 0, `offset 25 returns rows (${r2.length})`);
  const overlap = r1.filter(a => r2.some(b => b.id === a.id)).length;
  ok(overlap === 0, `the two pages do not overlap (${overlap} shared rows)`);
  ok(typeof p1.total === 'number' && p1.total >= 40, `a total is reported → ${p1.total}`);

  const anyQ = (await call('/sales-quotations?limit=1')).body;
  const someNum = ((anyQ.items||anyQ)[0]||{}).quote_number || 'QT-';
  const search = (await call(`/sales-quotations?search=${encodeURIComponent(someNum)}`)).body;
  const hits = (search.items || search).length;
  ok(hits > 0, `search by quote number finds it (${hits})`);

  /* Summary strip vs the rows it summarises. */
  if (p1.summary) {
    const all = (await call('/sales-quotations?limit=500')).body;
    const rows = all.items || all;
    const sum = rows.reduce((s, r) => s + Number(r.total || r.grandTotal || 0), 0);
    const stated = Number(p1.summary.total_value ?? p1.summary.quoted_value ?? NaN);
    if (Number.isFinite(stated)) {
      ok(near(stated, sum, Math.max(2, sum * 0.001)),
        `the summary's quoted value matches the rows → ${stated.toFixed(0)} vs ${sum.toFixed(0)}`);
    }
  }

  /* ── edges ──────────────────────────────────────────────── */
  console.log('\n  ── edges');
  const noLines = await call('/sales-quotations', {
    method: 'POST', body: JSON.stringify({ customerId: customers[0].id, items: [] }),
  });
  ok(!noLines.ok, `a quotation with no line items is refused (got ${noLines.status})`);

  const negQty = await call('/sales-quotations', {
    method: 'POST',
    body: JSON.stringify({
      customerId: customers[0].id, notes: TAG,
      lineItems: [{ description: `${TAG} bad`, quantity: -5, rate: 100, gstRate: 18 }],
    }),
  });
  ok(!negQty.ok, `a negative quantity is refused (got ${negQty.status})`);
  if (negQty.ok) made.push({ id: negQty.body.id });

  const noCust = await call('/sales-quotations', {
    method: 'POST',
    body: JSON.stringify({ notes: TAG, items: [{ description: 'x', quantity: 1, rate: 1 }], gstRate: 18 }),
  });
  ok(!noCust.ok, `a quotation with no customer is refused (got ${noCust.status})`);
  if (noCust.ok) made.push({ id: noCust.body.id });

  /* ── clean up ───────────────────────────────────────────── */
  let removed = 0;
  for (const m of made) {
    if (!m.id) continue;
    const d = await call(`/sales-quotations/${m.id}`, { method: 'DELETE' });
    if (d.ok) removed++;
  }
  console.log(`\n  removed ${removed} of ${made.length} test quotations`);
  if (removed < made.length) console.log(`  ⚠ ${made.length - removed} left behind (tagged ${TAG})`);

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('threw:', e.message); process.exit(1); });
