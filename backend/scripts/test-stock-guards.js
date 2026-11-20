#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   Stock that cannot lie: the two holes found in the October audit.

   1. "Make" from an order line wrote the bill of materials in as material
      ISSUED — nothing left stock, at ₹0 — so issuing the real material
      counted it twice. It is now the job's PLAN (migration 077): nothing
      moves until the store issues against it, and then through the ledger.
      Yield counts weight only (bolts in nos are not kg), and requirements
      stop calling material short that is already on the shop floor, or
      free when another order's job has it planned.

   2. Dispatch could take stock below zero, and found the stock by the
      line's spelling. Stock now never goes below zero (shared/stock.js),
      a challan line carries its product, and an item with no stock record
      goes without anything being invented for it.

   Runs against a local backend (SCHEDULER=off) with a throwaway account it
   deletes again. Refuses to run against a deployed host.
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
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };
const near = (a, b, d = 0.01) => Math.abs(Number(a) - Number(b)) <= d;
const section = (t) => console.log(`\n  ── ${t}`);
const db = () => new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const q = async (sql, params) => { const c = db(); await c.connect(); try { return (await c.query(sql, params)).rows; } finally { await c.end(); } };

async function cleanup() {
  const c = db(); await c.connect();
  try {
    const { rows } = await c.query(`SELECT id, org_id FROM users WHERE email LIKE 'guard-%@example.test'`);
    const ids = [...new Set(rows.flatMap(r => [r.id, r.org_id]).filter(Boolean))];
    if (!ids.length) return 0;
    for (let i = 0; i < 4; i++) { const r = await purgeOrg(c, ids); if (!r.deleted) break; }
    await c.query('DELETE FROM document_sequences WHERE owner_id = ANY($1)', [ids]).catch(() => {});
    await c.query('DELETE FROM notifications WHERE user_id = ANY($1)', [rows.map(r => r.id)]).catch(() => {});
    await c.query(`DELETE FROM users WHERE email LIKE 'guard-%@example.test' AND id <> org_id`);
    return (await c.query(`DELETE FROM users WHERE email LIKE 'guard-%@example.test'`)).rowCount;
  } finally { await c.end(); }
}

const call = async (who, method, url, body) => {
  const r = await fetch(`${API}${url}`, {
    method, headers: { Authorization: `Bearer ${who.token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const register = async (tag) => (await fetch(`${API}/auth/register`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: `Guard ${tag}`, email: `guard-${tag}-${stamp}@example.test`, password: PASS }),
})).json();

(async () => {
  await cleanup();
  const A = await register('a');
  const OWNER = A.user?.org_id ?? A.user?.id;
  try {
    await call(A, 'PUT', '/company-profile', { name: 'Precision Fab Works', gstin: '36ABCDE1234F1Z9', stateCode: '36' });
    /* The create routes answer with the new id only; the names are kept here. */
    const sheet = { name: `SS304 sheet 2 mm ${stamp}` }, bolt = { name: `Hex bolt M10 ${stamp}` }, sku = { name: `SS304 Bracket ${stamp}` };
    sheet.id = (await call(A, 'POST', '/raw-materials', { name: sheet.name, unit: 'kg', base_uom: 'kg', standard_rate: 255 })).body.id;
    bolt.id = (await call(A, 'POST', '/raw-materials', { name: bolt.name, unit: 'nos', base_uom: 'nos', standard_rate: 6 })).body.id;
    sku.id = (await call(A, 'POST', '/skus', { sku_code: `BRK-${stamp}`, name: sku.name, unit: 'nos', price: 2320 })).body.id;
    await call(A, 'PUT', `/skus/${sku.id}/bom`, { lines: [
      { rawMaterialId: sheet.id, qtyPerUnit: 1.5, uom: 'kg' },
      { rawMaterialId: bolt.id, qtyPerUnit: 4, uom: 'nos' },
    ] });
    const sheetRow = (await call(A, 'POST', '/inventory', { rawMaterialId: sheet.id, quantity: 143, uom: 'kg', unitCost: 255 })).body;
    const boltRow = (await call(A, 'POST', '/inventory', { rawMaterialId: bolt.id, quantity: 1000, uom: 'nos', unitCost: 6 })).body;
    const cust = (await call(A, 'POST', '/customers', { name: `Apollo Fabricators ${stamp}`, state: 'Telangana' })).body;
    const order = async (qty) => (await call(A, 'POST', '/customer-orders', {
      customerId: cust.id, items: [{ skuId: sku.id, description: sku.name, quantity: qty, unit: 'nos', rate: 2320 }],
    })).body;
    const stockOf = async (id) => Number((await q('SELECT quantity FROM inventory WHERE id = $1', [id]))[0]?.quantity);
    const sheetId = sheetRow.item?.id, boltId = boltRow.item?.id;
    ok(sheet.id && bolt.id && sku.id && sheetId && boltId && near(await stockOf(sheetId), 143),
      'set up: a bracket of 1.5 kg sheet + 4 bolts; 143 kg of sheet and 1,000 bolts in stock');

    /* ── 1. Make plans; it does not issue ─────────────────────────────── */
    section('1. "Make" plans the material; nothing leaves stock');
    const o1 = await order(120);
    const line1 = (await call(A, 'GET', `/customer-orders/${o1.id}`)).body.items[0];
    const made = await call(A, 'POST', `/production/from-order-item/${line1.id}`, {});
    ok(made.status === 200 && made.body.bomLines === 2, `Make opens a job with its 2 bill-of-materials lines (${made.status}, ${made.body.prodNumber})`);
    const job = async () => (await call(A, 'GET', `/production/${made.body.id}`)).body;
    let j = await job();
    const planSheet = () => j.plan.find(p => p.raw_material_id === sheet.id);
    const planBolt = () => j.plan.find(p => p.raw_material_id === bolt.id);
    ok((j.consumption || []).length === 0, `nothing is recorded as issued (${(j.consumption || []).length} lines)`);
    ok(near(planSheet()?.planned_qty, 180) && near(planBolt()?.planned_qty, 480),
      `the plan: 180 kg of sheet, 480 bolts (${planSheet()?.planned_qty} kg, ${planBolt()?.planned_qty} nos)`);
    ok(near(await stockOf(sheetId), 143) && near(await stockOf(boltId), 1000), 'stock is untouched: 143 kg, 1,000 bolts');
    ok(planSheet()?.stock?.inventoryId === sheetId && near(planSheet()?.suggested_issue_qty, 143),
      `the sheet line offers to issue what is on the shelf: ${planSheet()?.suggested_issue_qty} of 180 kg`);
    ok(near(j.yield.inputWeight, 0) && near(j.yield.materialCost, 0), 'yield and cost wait for the real issue');
    const coStatus = (await q('SELECT status FROM customer_orders WHERE id = $1', [o1.id]))[0]?.status;
    ok(coStatus === 'In Procurement', `the order moves to In Procurement (${coStatus})`);

    /* ── 2. issuing against the plan moves stock ──────────────────────── */
    section('2. issuing against the plan takes it from stock, once');
    const iss = await call(A, 'POST', `/production/${made.body.id}/consumption`,
      { inventoryId: sheetId, itemName: sheet.name, consumedQty: 143, uom: 'kg', unitCost: 255 });
    ok(iss.status === 200 && near(await stockOf(sheetId), 0), `143 kg issued: the sheet leaves stock (${await stockOf(sheetId)} left)`);
    const more = await call(A, 'POST', `/production/${made.body.id}/consumption`, { inventoryId: sheetId, itemName: sheet.name, consumedQty: 1, uom: 'kg' });
    ok(more.status === 409 && /Only 0 kg/.test(more.body.error || ''), `issuing 1 kg more is refused: "${more.body.error}"`);
    await call(A, 'POST', `/production/${made.body.id}/consumption`, { inventoryId: boltId, itemName: bolt.name, consumedQty: 480, uom: 'nos', unitCost: 6 });
    j = await job();
    ok(near(planSheet()?.issued_qty, 143) && near(planSheet()?.remaining_qty, 37) && near(planBolt()?.remaining_qty, 0),
      `the plan shows it: sheet 143 of 180 issued, 37 to go; bolts all issued`);
    ok(near(j.yield.inputWeight, 143) && j.yield.unweighedLines === 1,
      `material issued counts the 143 kg of sheet, not the bolts (${j.yield.inputWeight} kg; ${j.yield.unweighedLines} line in nos left out)`);
    ok(near(j.yield.materialCost, 143 * 255 + 480 * 6), `the cost counts both: ₹${j.yield.materialCost}`);
    const mv = await q(`SELECT COUNT(*)::int AS n, SUM(quantity)::float AS s FROM stock_movements WHERE inventory_id = $1 AND movement_type = 'production_consumption'`, [sheetId]);
    ok(mv[0].n === 1 && near(mv[0].s, -143), `one ledger line of −143 kg for the sheet (${mv[0].n}, ${mv[0].s})`);

    /* ── 3. requirements and readiness ────────────────────────────────── */
    section('3. what is on the floor is not short; what is planned is held');
    const ready1 = (await call(A, 'GET', `/customer-orders/${o1.id}/readiness`)).body;
    const r1Sheet = ready1.lines?.[0]?.materials?.find(m => m.raw_material_id === sheet.id);
    ok(r1Sheet && near(r1Sheet.available, 0) && near(r1Sheet.on_floor, 143) && r1Sheet.can_make === 95,
      `readiness counts the issued sheet for this order: 0 in stock + 143 issued → ${r1Sheet?.can_make} brackets (was 0)`);
    const board = (await call(A, 'GET', `/material-requirements?orderId=${o1.id}`)).body.items || [];
    const bSheet = board.find(m => m.raw_material_id === sheet.id);
    ok(bSheet && near(bSheet.required, 37) && near(bSheet.shortfall, 37) && near(bSheet.on_floor, 143),
      `the board asks for 37 kg more, not 180 again (required ${bSheet?.required}, short ${bSheet?.shortfall}, ${bSheet?.on_floor} on the floor)`);
    const o2 = await order(50);
    const line2 = (await call(A, 'GET', `/customer-orders/${o2.id}`)).body.items[0];
    await call(A, 'POST', `/production/from-order-item/${line2.id}`, {});   // plans 75 kg + 200 bolts, issues nothing
    const o3 = await order(100);
    const ready3 = (await call(A, 'GET', `/customer-orders/${o3.id}/readiness`)).body;
    const r3Bolt = ready3.lines?.[0]?.materials?.find(m => m.raw_material_id === bolt.id);
    ok(r3Bolt && near(r3Bolt.available, 520) && near(r3Bolt.held_elsewhere, 200) && r3Bolt.can_make === 80,
      `a third order sees 520 bolts, 200 of them held for the second order's job → ${r3Bolt?.can_make} brackets, not 130`);

    /* ── 4. dispatch cannot take stock below zero ─────────────────────── */
    section('4. dispatch: by product, never below zero');
    await call(A, 'POST', `/production/${made.body.id}/output`, { itemName: sku.name, outputQty: 95, uom: 'nos', outputWeight: 134.42 });
    j = await job();
    ok(near(j.yield.yieldPct, 94), `95 brackets weighing 134.42 kg from 143 kg of sheet: yield ${j.yield.yieldPct}%`);
    const fg = (await q('SELECT id FROM inventory WHERE owner_id = $1 AND sku_id = $2 ORDER BY id', [OWNER, sku.id]));
    const fgId = fg[0]?.id;
    ok(fg.length === 1 && near(await stockOf(fgId), 95), `95 brackets in finished stock (${fg.length} row)`);
    const pre = (await call(A, 'GET', `/delivery-challans/prefill/${o1.id}`)).body;
    ok(pre.items?.[0]?.skuId === sku.id, 'the challan prefill carries the product');
    const challan = async (items) => (await call(A, 'POST', '/delivery-challans', { customerId: cust.id, customerOrderId: o1.id, items })).body;
    const big = await challan([{ ...pre.items[0], quantity: 120 }]);
    const tooMany = await call(A, 'PATCH', `/delivery-challans/${big.id}/status`, { status: 'Dispatched' });
    ok(tooMany.status === 409 && /Only 95 nos/.test(tooMany.body.error || '') && tooMany.body.shortStock?.short === 25,
      `dispatching 120 with 95 made is refused: "${(tooMany.body.error || '').slice(0, 90)}…"`);
    const bigNow = (await q('SELECT status, stock_applied FROM delivery_challans WHERE id = $1', [big.id]))[0];
    ok(near(await stockOf(fgId), 95) && bigNow.status === 'Draft' && !bigNow.stock_applied, 'nothing moved: 95 in stock, the challan still a draft');

    const typo = await challan([{ description: 'SS304 bracket - 50 mm', skuId: sku.id, quantity: 60, uom: 'nos', rate: 2320 }]);
    const sent = await call(A, 'PATCH', `/delivery-challans/${typo.id}/status`, { status: 'Dispatched' });
    const strays = await q(`SELECT COUNT(*)::int AS n FROM inventory WHERE owner_id = $1 AND LOWER("itemName") = LOWER($2)`, [OWNER, 'SS304 bracket - 50 mm']);
    ok(sent.status === 200 && near(await stockOf(fgId), 35) && strays[0].n === 0,
      `a line spelt differently takes stock by its product: 95 → ${await stockOf(fgId)}, no stray row made`);

    const sample = await challan([{ description: `Sample offcut ${stamp}`, quantity: 2, uom: 'nos', rate: 0 }]);
    const goes = await call(A, 'PATCH', `/delivery-challans/${sample.id}/status`, { status: 'Dispatched' });
    const sampleRows = await q(`SELECT COUNT(*)::int AS n FROM inventory WHERE owner_id = $1 AND "itemName" LIKE 'Sample offcut%'`, [OWNER]);
    ok(goes.status === 200 && goes.body.notInStock?.length === 1 && sampleRows[0].n === 0,
      `an item with no stock record goes, and the reply says so (${JSON.stringify(goes.body.notInStock)}); no −2 row invented`);

    const back = await call(A, 'PATCH', `/delivery-challans/${typo.id}/status`, { status: 'Draft' });
    ok(back.status === 200 && near(await stockOf(fgId), 95), `pulled back to Draft: the 60 return (${await stockOf(fgId)})`);

    const c1 = await challan([{ ...pre.items[0], quantity: 60 }]);
    const c2 = await challan([{ ...pre.items[0], quantity: 60 }]);
    const both = await Promise.all([c1, c2].map(c => call(A, 'PATCH', `/delivery-challans/${c.id}/status`, { status: 'Dispatched' })));
    const codes = both.map(r => r.status).sort().join(',');
    ok(codes === '200,409' && near(await stockOf(fgId), 35), `two challans of 60 against 95, at the same moment: one goes, one is refused (${codes}); ${await stockOf(fgId)} left`);
    const c3 = await challan([{ ...pre.items[0], quantity: 10 }]);
    const twice = await Promise.all([1, 2].map(() => call(A, 'PATCH', `/delivery-challans/${c3.id}/status`, { status: 'Dispatched' })));
    const dmv = await q(`SELECT COUNT(*)::int AS n FROM stock_movements WHERE ref_type = 'delivery_challan' AND ref_id = $1 AND movement_type = 'dispatch'`, [c3.id]);
    ok(twice.every(r => r.status === 200) && dmv[0].n === 1 && near(await stockOf(fgId), 25), `the same challan dispatched twice at once moves stock once (${dmv[0].n} movement, ${await stockOf(fgId)} left)`);
    await call(A, 'PATCH', `/delivery-challans/${c3.id}/status`, { status: 'Draft' });

    /* ── 5. the other ways out of stock ──────────────────────────────── */
    section('5. the same rule everywhere stock leaves');
    const sendAll = await challan([{ ...pre.items[0], quantity: 35 }]);
    await call(A, 'PATCH', `/delivery-challans/${sendAll.id}/status`, { status: 'Dispatched' });
    const outLine = j.output[0];
    const del = await call(A, 'DELETE', `/production/output/line/${outLine.id}`);
    ok(del.status === 409 && /already left stock/.test(del.body.error || '') && near(await stockOf(fgId), 0),
      `the output line of brackets already sent cannot be deleted: "${(del.body.error || '').slice(0, 70)}…"`);
    const neg = await call(A, 'POST', `/inventory/${boltId}/adjust`, { countedQuantity: -5, reason: 'test' });
    ok(neg.status === 400, `a stock count below zero is refused (${neg.status})`);
    const below = await q('SELECT COUNT(*)::int AS n FROM inventory WHERE owner_id = $1 AND quantity < 0', [OWNER]);
    const drift = await q(`SELECT COUNT(*)::int AS n FROM (
        SELECT i.id FROM inventory i LEFT JOIN stock_movements m ON m.inventory_id = i.id
         WHERE i.owner_id = $1 GROUP BY i.id, i.quantity
        HAVING ABS(COALESCE(i.quantity, 0) - COALESCE(SUM(m.quantity), 0)) > 0.001) x`, [OWNER]);
    ok(below[0].n === 0 && drift[0].n === 0, `no stock row below zero, and every balance equals its ledger (${below[0].n} negative, ${drift[0].n} drifted)`);
  } catch (e) {
    ok(false, `stopped: ${e.stack || e.message}`);
  } finally {
    const n = await cleanup();
    console.log(`\n   cleaned up ${n} throwaway account(s)`);
    console.log(`\n   ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
})();
