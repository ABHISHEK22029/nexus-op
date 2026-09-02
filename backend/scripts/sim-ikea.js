#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   sim-ikea — drive the WHOLE chain with a real scenario and see what
   actually arrives at each step.

   The previous audit asked "does this route exist". That is a structural
   question, and a structurally complete chain can still be a set of
   disconnected screens: every link present, nothing flowing through it.
   This asks the behavioural question instead — step N runs, then step N+1
   is inspected to see whether N's output actually turned up.

   THE SCENARIO. IKEA orders fabricated furniture components:

     SHELF BRACKET   ×800   needs  1.2kg MS Plate  + 0.4kg MS Angle
     TABLE FRAME     ×200   needs  6.0kg MS Angle  + 8 × M8 Bolt
     BED SLAT RAIL   ×400   needs  2.5kg MS Plate

   Two separate orders, deliberately, both consuming MS Plate — because a
   deficiency engine that can only see one order at a time will under-order
   and nobody notices until the second job stalls.

   Three vendors with different prices, MOQs and lead times. One material
   with NO vendor linked, to check that gets reported rather than dropped.

   Everything created is prefixed IKEA-SIM and removed at the end.
   ══════════════════════════════════════════════════════════════════════ */

const db = require('../db');

const BASE = process.env.SIM_BASE || 'http://localhost:5099';
const EMAIL = process.env.SIM_EMAIL;
const PASSWORD = process.env.SIM_PASSWORD;
if (!EMAIL || !PASSWORD) { console.error('set SIM_EMAIL and SIM_PASSWORD'); process.exit(1); }
if (/onrender|vercel|^https:/.test(BASE)) { console.error('refusing to run against a deployed host'); process.exit(1); }

let TOKEN = '';
const TAG = 'IKEA-SIM';
const made = { customers: [], vendors: [], materials: [], skus: [], orders: [], pos: [], prods: [], challans: [], invoices: [] };

const findings = [];
function finding(severity, area, what, detail) { findings.push({ severity, area, what, detail }); }

const money = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = { _raw: text.slice(0, 200) }; }
  return { ok: res.ok, status: res.status, data };
}
const rows = (d) => (Array.isArray(d) ? d : (d?.items || []));

// ── direct SQL for things with no API, and for verification ──
const sql = (q, p = []) => db.query(q, p).then(r => r.rows);

/* ══════════════ SETUP ══════════════ */
async function setup() {
  console.log('\n━━ SETUP: an IKEA order book ━━\n');

  const cust = await api('POST', '/customers', {
    name: `${TAG} IKEA India`, gstin: '29AABCI1234M1Z5', state: 'Karnataka',
    shipping_state: 'Karnataka', billing_address: 'Nagasandra, Bengaluru',
    shipping_address: 'IKEA DC, Hoskote', payment_terms_days: 45, credit_limit: 5000000,
  });
  made.customers.push(cust.data.id);

  // Three vendors, deliberately different commercial terms.
  const vendorSpecs = [
    { name: `${TAG} Jindal Steel`, type: 'Material Supply' },
    { name: `${TAG} Electrosteel`, type: 'Material Supply' },
    { name: `${TAG} Fastener Hub`, type: 'Material Supply' },
  ];
  for (const v of vendorSpecs) {
    const r = await api('POST', '/vendors', v);
    made.vendors.push(r.data.id);
  }

  // Four materials. The last one deliberately gets NO vendor.
  const matSpecs = [
    { name: `${TAG} MS Plate 8mm`, uom: 'kg' },
    { name: `${TAG} MS Angle 40x40`, uom: 'kg' },
    { name: `${TAG} M8 Bolt`, uom: 'nos' },
    { name: `${TAG} Powder Coat`, uom: 'kg' },   // no vendor on purpose
  ];
  for (const m of matSpecs) {
    const r = await api('POST', '/raw-materials', { name: m.name, category: 'Sim' });
    made.materials.push(r.data.id);
    await sql('UPDATE raw_materials SET base_uom=$1, purchase_uom=$1 WHERE id=$2', [m.uom, r.data.id]);
  }
  const [PLATE, ANGLE, BOLT, COAT] = made.materials;

  // Vendor supply links: price, MOQ, lead time. Two vendors sell PLATE —
  // the preferred one should win.
  const links = [
    { v: made.vendors[0], m: PLATE, price: 68, moq: 1000, lead: 7, preferred: true },
    { v: made.vendors[1], m: PLATE, price: 64, moq: 2500, lead: 21, preferred: false },
    { v: made.vendors[0], m: ANGLE, price: 72, moq: 500, lead: 7, preferred: true },
    { v: made.vendors[2], m: BOLT, price: 4.5, moq: 5000, lead: 3, preferred: true },
  ];
  for (const l of links) {
    await api('POST', '/vendor-items', {
      vendor_id: l.v, raw_material_id: l.m, price: l.price, price_uom: 'kg',
      moq: l.moq, lead_time_days: l.lead, is_preferred: l.preferred,
    });
  }

  // Three products with bills of materials.
  const products = [
    { name: `${TAG} Shelf Bracket`, bom: [[PLATE, 1.2, 'kg'], [ANGLE, 0.4, 'kg']] },
    { name: `${TAG} Table Frame`, bom: [[ANGLE, 6.0, 'kg'], [BOLT, 8, 'nos']] },
    { name: `${TAG} Bed Slat Rail`, bom: [[PLATE, 2.5, 'kg'], [COAT, 0.05, 'kg']] },
  ];
  for (const p of products) {
    const r = await api('POST', '/skus', { name: p.name, uom: 'nos' });
    made.skus.push(r.data.id);
    for (const [matId, qty, uom] of p.bom) {
      const mat = (await sql('SELECT name FROM raw_materials WHERE id=$1', [matId]))[0];
      await sql(
        'INSERT INTO sku_bom (sku_id, raw_material_id, component_name, qty_per_unit, uom) VALUES ($1,$2,$3,$4,$5)',
        [r.data.id, matId, mat.name, qty, uom]);
    }
  }
  const [BRACKET, FRAME, SLAT] = made.skus;

  // Opening stock: enough plate for a fraction of demand.
  await sql(
    `INSERT INTO inventory ("itemName", quantity, uom, raw_material_id, item_type, owner_id, unit_cost)
     VALUES ($1,$2,$3,$4,'raw',1,$5)`,
    [`${TAG} MS Plate 8mm`, 400, 'kg', PLATE, 66]);
  await sql(
    `INSERT INTO inventory ("itemName", quantity, uom, raw_material_id, item_type, owner_id, unit_cost)
     VALUES ($1,$2,$3,$4,'raw',1,$5)`,
    [`${TAG} MS Angle 40x40`, 100, 'kg', ANGLE, 70]);

  console.log(`  customer, 3 vendors, 4 materials, 3 products with BOMs`);
  console.log(`  opening stock: 400kg plate, 100kg angle, 0 bolts, 0 coating`);

  // TWO orders, both needing plate.
  const o1 = await api('POST', '/customer-orders', {
    customerId: cust.data.id, orderDate: '2026-09-01',
    customerPoRef: 'IKEA-PO-88120', expectedShipmentDate: '2026-10-15',
    paymentTerms: 'Net 45', discount: 5, discountType: 'percent', gstRate: 18,
    terms: 'Delivery to IKEA DC Hoskote. Rejection on dimensional deviation > 2mm.',
    items: [
      { skuId: BRACKET, description: `${TAG} Shelf Bracket`, quantity: 800, rate: 240, unit: 'nos', hsn: '7308' },
      { skuId: SLAT, description: `${TAG} Bed Slat Rail`, quantity: 400, rate: 310, unit: 'nos', hsn: '7308' },
    ],
  });
  made.orders.push(o1.data.id);

  const o2 = await api('POST', '/customer-orders', {
    customerId: cust.data.id, orderDate: '2026-09-02',
    customerPoRef: 'IKEA-PO-88144', expectedShipmentDate: '2026-11-01',
    discount: 0, gstRate: 18,
    items: [
      { skuId: FRAME, description: `${TAG} Table Frame`, quantity: 200, rate: 1450, unit: 'nos', hsn: '9403' },
    ],
  });
  made.orders.push(o2.data.id);

  console.log(`  order 1: 800 brackets + 400 slat rails, 5% discount  -> ${money(o1.data.total)}`);
  console.log(`  order 2: 200 table frames                            -> ${money(o2.data.total)}`);

  return { cust: cust.data.id, PLATE, ANGLE, BOLT, COAT, BRACKET, FRAME, SLAT, o1: o1.data.id, o2: o2.data.id };
}

/* ══════════════ THE CHAIN ══════════════ */
async function run(ctx) {
  /* ── 1. Does the order store the deal it was given? ── */
  console.log('\n━━ 1. The order as a commercial agreement ━━\n');
  const o1 = (await sql('SELECT * FROM customer_orders WHERE id=$1', [ctx.o1]))[0];
  const expectedSub = r2(800 * 240 + 400 * 310);          // 192000 + 124000 = 316000
  const expectedTotal = r2((expectedSub * 0.95) * 1.18);  // 5% off, +18% GST
  console.log(`  sub_total     ${money(o1.sub_total)}   (expected ${money(expectedSub)})`);
  console.log(`  discount      ${o1.discount}% -> total ${money(o1.total)}   (expected ${money(expectedTotal)})`);
  console.log(`  terms stored  ${o1.terms ? 'yes' : 'NO'}`);
  console.log(`  ship-by       ${o1.expected_shipment_date ? String(o1.expected_shipment_date).slice(0, 10) : 'NOT STORED'}`);
  if (Math.abs(Number(o1.sub_total) - expectedSub) > 1) finding('HIGH', 'Order', 'sub_total wrong', `got ${o1.sub_total}, expected ${expectedSub}`);
  if (Math.abs(Number(o1.total) - expectedTotal) > 1) finding('HIGH', 'Order', 'total wrong', `got ${o1.total}, expected ${expectedTotal}`);

  /* ── 2. Does the deficiency engine aggregate BOTH orders? ── */
  console.log('\n━━ 2. Deficiency across BOTH orders ━━\n');
  const mr = await api('GET', '/material-requirements');
  const mine = rows(mr.data).filter(m => String(m.material).startsWith(TAG));
  const plate = mine.find(m => m.material.includes('Plate'));
  const angle = mine.find(m => m.material.includes('Angle'));
  const bolt = mine.find(m => m.material.includes('Bolt'));
  const coat = mine.find(m => m.material.includes('Coat'));

  //  plate: 800×1.2 + 400×2.5 = 960 + 1000 = 1960 ; angle: 800×0.4 + 200×6 = 320+1200 = 1520
  const want = { plate: 1960, angle: 1520, bolt: 1600, coat: 20 };
  for (const [key, m, expect] of [['plate', plate, want.plate], ['angle', angle, want.angle], ['bolt', bolt, want.bolt], ['coat', coat, want.coat]]) {
    if (!m) { console.log(`  ${key.padEnd(6)} MISSING from requirements`); finding('HIGH', 'Deficiency', `${key} absent from requirements`, 'BOM demand not exploded'); continue; }
    const req = r2(m.required);
    const flag = Math.abs(req - expect) > 1 ? '  ❌' : '  ✅';
    console.log(`${flag} ${key.padEnd(6)} required ${String(req).padStart(7)}  available ${String(r2(m.available)).padStart(6)}  short ${String(r2(m.shortfall)).padStart(7)}  vendor ${m.preferred_vendor ? m.preferred_vendor.name.replace(TAG + ' ', '') : 'NONE'}`);
    if (Math.abs(req - expect) > 1) finding('HIGH', 'Deficiency', `${key} demand not aggregated across orders`, `required ${req}, expected ${expect} (order1 + order2)`);
  }
  // The engine must pick the PREFERRED vendor, not the cheapest.
  if (plate?.preferred_vendor && !plate.preferred_vendor.name.includes('Jindal')) {
    finding('MED', 'Deficiency', 'preferred vendor not honoured', `picked ${plate.preferred_vendor.name}, expected Jindal (is_preferred)`);
  }

  /* ── 3. Shortfall -> POs ── */
  console.log('\n━━ 3. Raise purchase orders from the shortfall ━━\n');
  const plan = await api('GET', '/material-requirements/purchase-plan');
  const myVendors = (plan.data.vendors || []).filter(v => v.vendorName.startsWith(TAG));
  for (const v of myVendors) {
    console.log(`  ${v.vendorName.replace(TAG + ' ', '').padEnd(16)} ${v.lines.length} line(s)  ${money(v.total)}`);
    for (const l of v.lines) console.log(`      ${l.material.replace(TAG + ' ', '').padEnd(18)} ${l.qty}${l.uom} @ ${money(l.rate)}  (MOQ ${l.moq} from ${l.moq_source})`);
  }
  const skipped = (plan.data.unassigned || []).filter(u => u.material.startsWith(TAG));
  if (skipped.length) console.log(`  skipped (no vendor): ${skipped.map(s => s.material.replace(TAG + ' ', '')).join(', ')}`);
  if (!skipped.some(s => s.material.includes('Coat'))) {
    finding('MED', 'Procurement', 'material with no vendor was not reported', 'Powder Coat is short and unlinked but did not appear in `unassigned`');
  }

  const raise = await api('POST', '/material-requirements/to-po', {});
  const createdPos = (raise.data.created || []).filter(c => c.vendor.startsWith(TAG));
  createdPos.forEach(c => made.pos.push(c.id));
  console.log(`  -> raised ${createdPos.length} PO(s): ${createdPos.map(c => c.poNumber).join(', ')}`);
  if (!createdPos.length) finding('HIGH', 'Procurement', 'no PO raised from shortfall', raise.data.error || 'unknown');

  /* ── 4. Does "on order" feed back into the deficiency engine? ── */
  console.log('\n━━ 4. Does the engine know the material is now ON ORDER? ━━\n');
  const mr2 = await api('GET', '/material-requirements');
  const plate2 = rows(mr2.data).find(m => String(m.material).includes('Plate') && String(m.material).startsWith(TAG));
  if (plate2) {
    console.log(`  plate: on_order ${r2(plate2.on_order)}   net ${r2(plate2.net)}   status ${plate2.status}`);
    if (r2(plate2.on_order) <= 0) {
      finding('HIGH', 'Linkage', 'raising a PO does not register as ON ORDER',
        'the engine still shows on_order 0, so it will recommend buying the same shortfall again');
    }
  }

  /* ── 5. Receive the goods ── */
  console.log('\n━━ 5. Goods receipt ━━\n');
  const beforeStock = await stockOf(ctx.PLATE);
  const po = createdPos[0];
  let grn = null;
  if (po) {
    grn = await api('POST', '/grn', { poId: po.id, receivedQuantity: 1000, vehicleNumber: 'KA01AB1234' });
    if (!grn.ok) finding('HIGH', 'Linkage', 'GRN against a shortfall PO failed', JSON.stringify(grn.data).slice(0, 160));
  }
  const afterStock = await stockOf(ctx.PLATE);
  console.log(`  plate stock ${beforeStock} -> ${afterStock}  ${afterStock > beforeStock ? '✅ receipt increased stock' : '❌ stock did not move'}`);
  if (afterStock <= beforeStock) finding('HIGH', 'Linkage', 'goods receipt did not increase stock', `stayed at ${beforeStock}`);

  /* ── 6. Make it ── */
  console.log('\n━━ 6. Production ━━\n');
  const line = (await sql('SELECT id FROM customer_order_items WHERE customer_order_id=$1 ORDER BY id LIMIT 1', [ctx.o1]))[0];
  const prod = await api('POST', `/production/from-order-item/${line.id}`, {});
  if (!prod.ok) {
    finding('HIGH', 'Linkage', 'cannot start production from an order line', JSON.stringify(prod.data).slice(0, 160));
    console.log(`  ❌ production from order line failed: ${JSON.stringify(prod.data).slice(0, 120)}`);
  } else {
    made.prods.push(prod.data.id);
    console.log(`  production order created from the customer order line (id ${prod.data.id})`);

    const inv = (await sql('SELECT id FROM inventory WHERE raw_material_id=$1 LIMIT 1', [ctx.PLATE]))[0];
    await api('POST', `/production/${prod.data.id}/consumption`, {
      inventoryId: inv.id, itemName: `${TAG} MS Plate 8mm`, consumedQty: 240, uom: 'kg',
    });
    const out = await api('POST', `/production/${prod.data.id}/output`, {
      itemName: `${TAG} Shelf Bracket`, outputQty: 200, uom: 'nos',
    });
    const fg = await stockOfName(`${TAG} Shelf Bracket`);
    console.log(`  consumed 240kg plate; produced 200 brackets -> finished stock ${fg} ${fg === 200 ? '✅' : '❌'}`);
    if (fg !== 200) finding('HIGH', 'Linkage', 'production output did not reach finished stock', `stock is ${fg}`);

    /* Does producing against the order REDUCE what the engine still needs? */
    const mr3 = await api('GET', '/material-requirements');
    const plate3 = rows(mr3.data).find(m => String(m.material).includes('Plate') && String(m.material).startsWith(TAG));
    const dropped = plate3 && r2(plate3.required) < want.plate;
    console.log(`  plate still required ${plate3 ? r2(plate3.required) : '?'} (was ${want.plate}) ${dropped ? '✅ produced qty netted off' : '❌ demand unchanged'}`);
    if (!dropped) finding('HIGH', 'Linkage', 'produced quantity does not reduce outstanding demand',
      'the engine keeps asking for material for units already made');
  }

  /* ── 7. Order readiness ── */
  console.log('\n━━ 7. Order readiness ━━\n');
  const ready = await api('GET', `/customer-orders/${ctx.o1}/readiness`);
  if (!ready.ok) { finding('MED', 'Linkage', 'order readiness endpoint failed', JSON.stringify(ready.data).slice(0, 120)); }
  else {
    for (const l of (ready.data.lines || [])) {
      console.log(`  ${String(l.description || l.product || '').replace(TAG + ' ', '').padEnd(20)} remaining ${l.remaining}  buildable ${l.buildable}${l.blocked_by ? `  blocked by ${String(l.blocked_by).replace(TAG + ' ', '')}` : ''}`);
    }
  }

  /* ── 8. Dispatch ── */
  console.log('\n━━ 8. Dispatch ━━\n');
  const pre = await api('GET', `/delivery-challans/prefill/${ctx.o1}`);
  if (!pre.ok) finding('HIGH', 'Linkage', 'challan prefill from order failed', JSON.stringify(pre.data).slice(0, 120));
  const dc = await api('POST', '/delivery-challans', {
    customerId: ctx.cust, customerOrderId: ctx.o1, challanDate: '2026-09-20',
    items: [{ description: `${TAG} Shelf Bracket`, quantity: 200, rate: 240, uom: 'nos' }],
  });
  if (dc.ok) {
    made.challans.push(dc.data.id);
    const before = await stockOfName(`${TAG} Shelf Bracket`);
    await api('PATCH', `/delivery-challans/${dc.data.id}/status`, { status: 'Dispatched' });
    const after = await stockOfName(`${TAG} Shelf Bracket`);
    console.log(`  dispatched 200; finished stock ${before} -> ${after} ${after === before - 200 ? '✅' : '❌'}`);
    if (after !== before - 200) finding('HIGH', 'Linkage', 'dispatch did not reduce finished stock', `${before} -> ${after}`);

    const ord = (await sql('SELECT status FROM customer_orders WHERE id=$1', [ctx.o1]))[0];
    console.log(`  order status now "${ord.status}"`);
    /* 200 of 800 shipped. Marking the whole order Delivered on a partial
       dispatch is worse than leaving it Open — it tells the shop floor the
       job is done. */
    if (ord.status === 'Delivered') {
      finding('HIGH', 'Linkage', 'partial dispatch marks the whole order Delivered',
        '200 of 1200 units shipped, order flipped to Delivered — the remaining 1000 look complete');
    }
  } else finding('HIGH', 'Dispatch', 'could not create a challan', JSON.stringify(dc.data).slice(0, 120));

  /* ── 9. Invoice ── */
  console.log('\n━━ 9. Invoice ━━\n');
  const ipre = await api('GET', `/sales-invoices/prefill/${ctx.o1}`);
  if (!ipre.ok) { finding('HIGH', 'Linkage', 'invoice prefill from order failed', JSON.stringify(ipre.data).slice(0, 120)); }
  else {
    const carriedDiscount = ipre.data.discount ?? null;
    const carriedTerms = ipre.data.terms ?? null;
    console.log(`  prefill carries: discount ${carriedDiscount ?? 'NOT CARRIED'} | terms ${carriedTerms ? 'yes' : 'NOT CARRIED'} | place of supply ${ipre.data.placeOfSupply || '—'}`);
    if (carriedDiscount == null || Number(carriedDiscount) !== 5) {
      finding('HIGH', 'Linkage', 'invoice does not inherit the order\'s negotiated discount',
        'the 5% agreed on the order is absent from the invoice prefill — it gets retyped or lost');
    }
    if (!carriedTerms) {
      finding('MED', 'Linkage', 'invoice does not inherit the order\'s terms',
        'the delivery/rejection terms agreed on the order do not reach the invoice');
    }
  }
  const inv = await api('POST', '/sales-invoices', {
    customerId: ctx.cust, customerOrderId: ctx.o1, invoiceDate: '2026-09-21',
    items: [{ description: `${TAG} Shelf Bracket`, hsn: '7308', uom: 'nos', quantity: 200, rate: 240 }],
    gstRate: 18,
  });
  if (inv.ok) {
    made.invoices.push(inv.data.id);
    console.log(`  invoice ${inv.data.invoiceNumber || inv.data.id} raised, net ${money(inv.data.net || inv.data.netAmount)}`);
    const pay = await api('POST', `/sales-invoices/${inv.data.id}/payment`, { amount: 20000, mode: 'Bank', paidDate: '2026-09-30' });
    if (!pay.ok) finding('MED', 'Linkage', 'recording a payment failed', JSON.stringify(pay.data).slice(0, 120));
  } else finding('HIGH', 'Invoice', 'could not raise an invoice', JSON.stringify(inv.data).slice(0, 160));

  /* ── 10. Does it all show up on the customer? ── */
  console.log('\n━━ 10. Customer 360 ━━\n');
  const sum = await api('GET', `/customers/${ctx.cust}/summary`);
  if (sum.ok) {
    const m = sum.data.metrics;
    console.log(`  orders ${m.orders_count}  billed ${money(m.lifetime_billed)}  received ${money(m.received)}  outstanding ${money(m.outstanding)}`);
    console.log(`  buys: ${(sum.data.buys || []).map(b => b.item.replace(TAG + ' ', '') + ' x' + b.qty).join(', ') || 'nothing'}`);
    if (m.orders_count !== 2) finding('MED', 'Linkage', 'customer summary miscounts orders', `shows ${m.orders_count}, expected 2`);
    if (Number(m.lifetime_billed) <= 0) finding('MED', 'Linkage', 'customer summary shows no billing', 'an invoice exists but lifetime_billed is 0');
  } else finding('MED', 'Linkage', 'customer summary failed', JSON.stringify(sum.data).slice(0, 120));

  /* ── 11. Stock ledger integrity after all that ── */
  console.log('\n━━ 11. Stock ledger reconciliation ━━\n');
  const rec = await api('GET', '/inventory/reconcile');
  console.log(`  ${rec.data.checked} rows checked, ${rec.data.drifted?.length ?? '?'} drifted -> ${rec.data.healthy ? '✅ ledger == balance' : '❌ DRIFT'}`);
  if (!rec.data.healthy) finding('HIGH', 'Stock', 'ledger and balance disagree after the run', JSON.stringify(rec.data.drifted).slice(0, 200));
}

async function stockOf(rawMaterialId) {
  const r = await sql('SELECT COALESCE(SUM(quantity),0) q FROM inventory WHERE raw_material_id=$1', [rawMaterialId]);
  return r2(r[0].q);
}
async function stockOfName(name) {
  const r = await sql('SELECT COALESCE(SUM(quantity),0) q FROM inventory WHERE "itemName"=$1', [name]);
  return r2(r[0].q);
}

/* ══════════════ CLEANUP ══════════════ */
async function cleanup() {
  const like = `${TAG}%`;
  const stmts = [
    [`DELETE FROM stock_movements WHERE item_name LIKE $1`, [like]],
    [`DELETE FROM production_output WHERE production_order_id = ANY($1)`, [made.prods]],
    [`DELETE FROM production_consumption WHERE production_order_id = ANY($1)`, [made.prods]],
    [`DELETE FROM production_scrap WHERE production_order_id = ANY($1)`, [made.prods]],
    [`DELETE FROM production_orders WHERE id = ANY($1)`, [made.prods]],
    [`DELETE FROM sales_payments WHERE sales_invoice_id = ANY($1)`, [made.invoices]],
    [`DELETE FROM sales_invoice_items WHERE sales_invoice_id = ANY($1)`, [made.invoices]],
    [`DELETE FROM sales_invoices WHERE id = ANY($1)`, [made.invoices]],
    [`DELETE FROM delivery_challan_items WHERE delivery_challan_id = ANY($1)`, [made.challans]],
    [`DELETE FROM delivery_challans WHERE id = ANY($1)`, [made.challans]],
    [`DELETE FROM grn WHERE "poId" = ANY($1)`, [made.pos]],
    [`DELETE FROM po_line_items WHERE "poId" = ANY($1)`, [made.pos]],
    [`DELETE FROM purchase_orders WHERE id = ANY($1)`, [made.pos]],
    [`DELETE FROM customer_order_items WHERE customer_order_id = ANY($1)`, [made.orders]],
    [`DELETE FROM customer_orders WHERE id = ANY($1)`, [made.orders]],
    [`DELETE FROM vendor_items WHERE raw_material_id = ANY($1)`, [made.materials]],
    [`DELETE FROM sku_bom WHERE sku_id = ANY($1)`, [made.skus]],
    [`DELETE FROM inventory WHERE "itemName" LIKE $1`, [like]],
    [`DELETE FROM skus WHERE id = ANY($1)`, [made.skus]],
    [`DELETE FROM raw_materials WHERE id = ANY($1)`, [made.materials]],
    [`DELETE FROM vendors WHERE id = ANY($1)`, [made.vendors]],
    [`DELETE FROM customers WHERE id = ANY($1)`, [made.customers]],
  ];
  for (const [q, p] of stmts) { try { await db.query(q, p); } catch (e) { console.error('  cleanup:', e.message.slice(0, 80)); } }
}

/* ══════════════ MAIN ══════════════ */
(async () => {
  const login = await api('POST', '/auth/login', { email: EMAIL, password: PASSWORD });
  TOKEN = login.data.token;
  if (!TOKEN) { console.error('no token'); process.exit(1); }

  let ctx;
  try {
    ctx = await setup();
    await run(ctx);
  } catch (e) {
    console.error('\n💥 simulation threw:', e.message);
    finding('HIGH', 'Runtime', 'simulation crashed', e.message);
  } finally {
    await cleanup();
    console.log('\n  (simulation data removed)');
  }

  console.log('\n\n══════════════ FINDINGS ══════════════\n');
  if (!findings.length) console.log('  ✅ nothing broken — every step fed the next');
  const bySev = { HIGH: [], MED: [], LOW: [] };
  findings.forEach(f => bySev[f.severity].push(f));
  for (const sev of ['HIGH', 'MED', 'LOW']) {
    if (!bySev[sev].length) continue;
    console.log(`  ${sev === 'HIGH' ? '🔴' : sev === 'MED' ? '🟡' : '⚪'} ${sev}`);
    bySev[sev].forEach((f, i) => {
      console.log(`     ${i + 1}. [${f.area}] ${f.what}`);
      console.log(`        ${f.detail}`);
    });
    console.log('');
  }
  console.log(`  ${findings.length} finding(s)\n`);
  process.exit(0);
})();
