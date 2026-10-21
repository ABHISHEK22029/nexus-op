#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   A purchase order line knows which material or product it is
   (migration 075), and what is on order is counted line by line.

   1. A line sent with its material keeps the link, whatever its text says;
      another company's material is dropped, not linked.
   2. "On order" in the requirements is per line and per material: a
      two-line PO used to count both lines' quantities against whichever
      material its header named.
   3. Received goods land on the line's own material's stock row, though
      the line's text ("MS Plate 10 mm") is not the material's name
      ("MS Plate 10mm") — the case that used to open a second stock row.
   4. A part-received PO still counts what is left to come.
   5. Tonnes on order are compared with a shortfall in kilograms.
   6. A bought-in product line is stocked on the product's own row.
   7. The shortage planner's purchase orders carry the material too.

   Runs against a local backend (SCHEDULER=off) with throwaway accounts it
   deletes again. Refuses to run against a deployed host.
     API_BASE=http://localhost:5097 node scripts/test-po-item-links.js
   ══════════════════════════════════════════════════════════════════════ */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { purge } = require('./lib/testAccounts');

const API = process.env.API_BASE || 'http://localhost:5099';
if (/^https:|onrender\.com|vercel\.app|maksops\.co\.in/.test(API)) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}
const stamp = Date.now().toString(36);
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 0.001;

const register = async (tag) => (await fetch(`${API}/auth/register`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: `Links ${tag}`, email: `polinks-${tag}-${stamp}@example.test`, password: 'testpassword123' }),
})).json();
const call = async (who, method, url, body) => {
  const r = await fetch(`${API}${url}`, {
    method, headers: { Authorization: `Bearer ${who.token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const must = async (who, method, url, body) => {
  const r = await call(who, method, url, body);
  if (r.status >= 300) throw new Error(`${method} ${url} → ${r.status} ${r.body.error || ''}`);
  return r.body;
};
const list = (b) => (Array.isArray(b) ? b : b.items || []);

(async () => {
  const A = await register('a'), B = await register('b');
  try {
    await must(A, 'PUT', '/company-profile', { name: `Links Fab ${stamp}`, gstin: '36ABCDE1234F1Z5', stateCode: '36', address: 'Hyderabad' });
    await must(B, 'PUT', '/company-profile', { name: `Other Fab ${stamp}`, gstin: '29AABCO1234F1Z5', stateCode: '29', address: 'Bengaluru' });
    const plate = await must(A, 'POST', '/raw-materials', { name: `MS Plate 10mm ${stamp}`, material_code: `PL-${stamp}`, unit: 'kg', base_uom: 'kg', standard_rate: 70 });
    const angle = await must(A, 'POST', '/raw-materials', { name: `MS Angle 50x50x6 ${stamp}`, material_code: `AN-${stamp}`, unit: 'kg', base_uom: 'kg', standard_rate: 62 });
    const foreign = await must(B, 'POST', '/raw-materials', { name: `B material ${stamp}`, material_code: `BM-${stamp}`, unit: 'kg', base_uom: 'kg' });
    const arm = await must(A, 'POST', '/skus', { name: `Cross-Arm ${stamp}`, sku_code: `CA-${stamp}`, unit: 'nos', price: 850 });
    await must(A, 'PUT', `/skus/${arm.id}/bom`, { lines: [
      { rawMaterialId: angle.id, componentName: angle.name, qtyPerUnit: 4, uom: 'kg' },
      { rawMaterialId: plate.id, componentName: plate.name, qtyPerUnit: 1, uom: 'kg' },
    ] });
    const baseplate = await must(A, 'POST', '/skus', { name: `Base Plate ${stamp}`, sku_code: `BP-${stamp}`, unit: 'nos', price: 450 });
    const cust = await must(A, 'POST', '/customers', { name: `BuildRight ${stamp}`, state: 'Telangana', address: 'Hyderabad' });
    /* A product line sent without a description takes the product's name;
       one with a quantity and rate but nothing to say what it is is refused. */
    const order = await must(A, 'POST', '/customer-orders', { customerId: cust.id, gstRate: 18,
      items: [{ skuId: arm.id, quantity: 200, rate: 850, unit: 'nos' }] });
    const od = await must(A, 'GET', `/customer-orders/${order.id}`);
    ok((od.items || []).length === 1 && od.items[0].description === `Cross-Arm ${stamp}` && Number(od.total) === 200600,
      `an order line naming a product takes its name, and the order's ₹2,00,600 is made of its lines (${(od.items || []).map(i => i.description).join(', ')})`);
    const half = await call(A, 'POST', '/customer-orders', { customerId: cust.id, items: [{ quantity: 5, rate: 100 }] });
    ok(half.status === 400 && /no description/.test(half.body.error || ''), `a line with a quantity and a rate but no description is refused, not dropped (${half.status} ${half.body.error || ''})`);
    const vendor = await must(A, 'POST', '/vendors', { name: `Sunrise Steel ${stamp}`, type: 'Supplier', gstin: '36PQRSX6789K1Z2' });
    const req = async () => Object.fromEntries(list((await must(A, 'GET', '/material-requirements')).items || [])
      .map(m => [m.raw_material_id, m]));

    const r0 = await req();
    ok(near(r0[angle.id]?.required, 800) && near(r0[plate.id]?.required, 200),
      `200 cross-arms need 800 kg of angle and 200 kg of plate (${r0[angle.id]?.required}, ${r0[plate.id]?.required})`);

    /* ── 1 ── */
    console.log('\n  ── 1. a line keeps the material it was picked from');
    const po = await must(A, 'POST', '/po', { vendorId: vendor.id, itemName: 'Plate and angle', quantity: 300, gstRate: 18, paymentTerms: 'Net 30',
      items: [
        { sno: 1, description: `MS Plate 10 mm ${stamp} (cut to size)`, uom: 'kg', quantity: 100, unitPrice: 70, rawMaterialId: plate.id },
        { sno: 2, description: 'Angle, 50 x 50 x 6', uom: 'mt', quantity: 0.2, unitPrice: 62000, rawMaterialId: angle.id },
      ] });
    const lines = list(await must(A, 'GET', `/po/${po.id}/items`));
    const lPlate = lines.find(l => l.sno === 1), lAngle = lines.find(l => l.sno === 2);
    ok(lPlate?.raw_material_id === plate.id && lAngle?.raw_material_id === angle.id,
      `both lines carry their material although neither text is its name (${lPlate?.raw_material_id}, ${lAngle?.raw_material_id})`);
    const sneaky = await must(A, 'POST', '/po', { vendorId: vendor.id, itemName: 'x', quantity: 1,
      items: [{ sno: 1, description: 'x', uom: 'kg', quantity: 1, unitPrice: 1, rawMaterialId: foreign.id }] });
    const sl = list(await must(A, 'GET', `/po/${sneaky.id}/items`))[0];
    ok(sl && sl.raw_material_id === null, `another company's material is not linked (${sl?.raw_material_id})`);
    await must(A, 'DELETE', `/po/${sneaky.id}`).catch(() => {});

    /* ── 2 & 5 ── */
    console.log('\n  ── 2. on order, line by line — tonnes counted as kilograms');
    const r1 = await req();
    ok(near(r1[plate.id]?.on_order, 100), `100 kg of plate is on order (${r1[plate.id]?.on_order})`);
    ok(near(r1[angle.id]?.on_order, 200), `0.2 t of angle is 200 kg on order (${r1[angle.id]?.on_order})`);

    /* ── 3 & 4 ── */
    console.log('\n  ── 3. received onto the line\'s own material');
    await must(A, 'PATCH', `/po/${po.id}/approve`);
    await must(A, 'PATCH', `/po/${po.id}/dispatch`);
    const g = await call(A, 'POST', '/grn', { poId: po.id, poLineItemId: lPlate.id, receivedQuantity: 40, vehicleNumber: 'TS09EU1234' });
    ok(g.status === 200 && /^GRN-0*1$/.test(g.body.grnNumber || ''), `40 kg of plate received, as the company's first receipt (${g.status} ${g.body.grnNumber || g.body.error || ''})`);
    const stock = list(await must(A, 'GET', '/inventory?limit=100'));
    const rows = stock.filter(s => s.raw_material_id === plate.id);
    ok(rows.length === 1 && near(rows[0].quantity, 40) && rows[0].itemName === `MS Plate 10mm ${stamp}`,
      `it is on the plate's own stock row, under the material's name: ${rows.map(r => `${r.itemName} ${r.quantity}`).join(', ')}`);
    ok(!stock.some(s => s.itemName === lPlate.description && s.raw_material_id !== plate.id),
      'no second row was opened for the line\'s differently-typed name');
    const r2 = await req();
    ok(near(r2[plate.id]?.on_order, 60), `the PO is part-received and the 60 kg still to come stays on order (${r2[plate.id]?.on_order})`);
    ok(near(r2[plate.id]?.available, 40), `and the 40 kg received is in stock (${r2[plate.id]?.available}; ${Object.keys(r2[plate.id] || {}).join(',')})`);

    /* ── 6 ── */
    console.log('\n  ── 6. a bought-in product, on the product\'s row');
    const po2 = await must(A, 'POST', '/po', { vendorId: vendor.id, itemName: 'Base plates', quantity: 50, gstRate: 18,
      items: [{ sno: 1, description: 'Base plate 150x150', uom: 'nos', quantity: 50, unitPrice: 450, skuId: baseplate.id }] });
    const l2 = list(await must(A, 'GET', `/po/${po2.id}/items`))[0];
    ok(l2?.sku_id === baseplate.id && l2?.raw_material_id === null, `the line carries the product (${l2?.sku_id})`);
    await must(A, 'PATCH', `/po/${po2.id}/approve`);
    await must(A, 'PATCH', `/po/${po2.id}/dispatch`);
    const g2 = await call(A, 'POST', '/grn', { poId: po2.id, receivedQuantity: 50 });
    ok(g2.status === 200 && /^GRN-0*2$/.test(g2.body.grnNumber || ''), `received as GRN-00002 (${g2.body.grnNumber || g2.body.error})`);
    const bp = list(await must(A, 'GET', '/inventory?limit=100')).filter(s => s.sku_id === baseplate.id);
    ok(bp.length === 1 && near(bp[0].quantity, 50) && bp[0].itemName === `Base Plate ${stamp}`, `50 on the product's own stock row, under its name (${bp.map(r => `${r.itemName} ${r.quantity}`).join(', ')})`);

    /* ── 7 ── */
    console.log('\n  ── 7. the shortage planner\'s orders carry the material');
    await must(A, 'POST', '/vendor-items', { vendor_id: vendor.id, raw_material_id: angle.id, price: 61, price_uom: 'kg', is_preferred: true });
    const plan = await call(A, 'POST', '/material-requirements/to-po', { materialIds: [angle.id] });
    const madeId = plan.body?.created?.[0]?.id ?? plan.body?.purchaseOrders?.[0]?.id ?? plan.body?.pos?.[0]?.id;
    const pl = madeId ? list(await must(A, 'GET', `/po/${madeId}/items`)) : [];
    /* 800 kg needed, none in stock, 200 kg (0.2 t) already on order: 600 kg
       to order, not the 800 kg shortfall. */
    ok(pl.length === 1 && near(pl[0].quantity, 600), `and only what is not already on order: 800 needed − 200 on order = 600 kg (ordered ${pl[0]?.quantity})`);
    ok(plan.status === 200 && pl.length && pl.every(l => l.raw_material_id === angle.id),
      `the angle shortfall is ordered with its material linked (${plan.status}, ${pl.map(l => `${l.description}→${l.raw_material_id}`).join(', ') || JSON.stringify(plan.body).slice(0, 160)})`);
  } catch (e) {
    fail++; console.log(`   ❌ crashed: ${e.message}`);
  } finally {
    const n = await purge([A.user?.id, B.user?.id].filter(Boolean));
    console.log(`\n   ✅ test accounts removed (${n})`);
    console.log(`\n  ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
})();
