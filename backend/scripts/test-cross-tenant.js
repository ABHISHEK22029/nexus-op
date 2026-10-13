#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   Another company's ids, carried inside a request.

   The record a route is about was owner-checked (ownerScope). The OTHER
   ids in the body, query or URL were not, and several routes read or wrote
   by id alone. Two throwaway companies, A and B, and for each hole:

     · B tries it with A's ids, and is refused — or gets nothing back;
     · A does the same thing with its own ids, and it still works.

   Where a fix has a second lock for rows made before the check existed
   (an invoice already pointing at A's customer, a challan already pointing
   at A's order), that row is made directly in B's own data and the read
   or the side effect is shown not to reach A.

   Also: a goods receipt that moved stock cannot be edited or deleted; a
   challan pulled back to Draft twice puts the goods back once; a dispatched
   challan cannot be deleted until it is pulled back.

   Runs against a local backend (SCHEDULER=off) with throwaway accounts it
   deletes again. Refuses to run against a deployed host.
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

const call = async (who, method, url, body) => {
  const r = await fetch(`${API}${url}`, {
    method, headers: { Authorization: `Bearer ${who.token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 200) }; }
  return { status: r.status, body: json };
};
const post = (who, url, body) => call(who, 'POST', url, body);
const register = async (tag) => {
  const r = await fetch(`${API}/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `XT ${tag}`, email: `xt-${tag}-${stamp}@example.test`, password: PASS }),
  });
  const b = await r.json();
  return { token: b.token, id: b.user?.id };
};
const said = (r, status, text) => r.status === status && (!text || String(r.body.error || '') === text);
const shows = (r) => `${r.status}${r.body.error ? ` ${r.body.error}` : ''}`;
const rowsOf = (b) => (Array.isArray(b) ? b : b.items || []);

(async () => {
  const db = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  let A = {}, B = {}, connected = false;
  try {
    await sweepStale('xt-');
    await db.connect(); connected = true;
    A = await register('a');
    B = await register('b');
    if (!A.token || !B.token) throw new Error('could not register the test accounts');
    const q = async (sql, params) => (await db.query(sql, params)).rows;

    /* ── each company's own records ────────────────────────────────── */
    section('setting up two companies');
    const rmName = `XT Plate ${stamp}`;
    const cA = (await post(A, '/customers', { name: `XT Customer A ${stamp}`, state: 'Telangana' })).body;
    const vA = (await post(A, '/vendors', { name: `XT Vendor A ${stamp}`, type: 'Supplier' })).body;
    const rmA = (await post(A, '/raw-materials', { material_code: `XT-RM-${stamp}`, name: rmName, unit: 'kg', base_uom: 'kg' })).body;
    const skA = (await post(A, '/skus', { sku_code: `XT-SKU-${stamp}`, name: `XT Bracket ${stamp}`, unit: 'nos', price: 500 })).body;
    const pA = (await post(A, '/projects', { name: `XT Site A ${stamp}`, clientName: 'XT client', type: 'Civil', status: 'Active' })).body;
    const woA = (await post(A, '/work-orders', { projectId: pA.id, vendorId: vA.id, name: `XT WO A ${stamp}` })).body;
    const bqA = (await post(A, '/boq', { projectId: pA.id, itemCode: `XT-BQ-${stamp}`, description: `XT Excavation ${stamp}`, unit: 'Cum', estimatedQuantity: 100, rate: 200 })).body;
    ok([cA, vA, rmA, skA, pA, woA, bqA].every(r => r.id), 'A has a customer, vendor, material, product, project, work order and BOQ line');

    const cB = (await post(B, '/customers', { name: `XT Customer B ${stamp}` })).body;
    const vB = (await post(B, '/vendors', { name: `XT Vendor B ${stamp}`, type: 'Supplier' })).body;
    const rmB = (await post(B, '/raw-materials', { material_code: `XT-RMB-${stamp}`, name: `XT B steel ${stamp}`, unit: 'kg', base_uom: 'kg' })).body;
    const pB = (await post(B, '/projects', { name: `XT Site B ${stamp}`, clientName: 'XT client', type: 'Civil', status: 'Active' })).body;
    const woB = (await post(B, '/work-orders', { projectId: pB.id, vendorId: vB.id, name: `XT WO B ${stamp}` })).body;
    const bqB = (await post(B, '/boq', { projectId: pB.id, itemCode: `XT-BQB-${stamp}`, description: 'XT B item', unit: 'Cum', estimatedQuantity: 10, rate: 10 })).body;
    ok([cB, vB, rmB, pB, woB, bqB].every(r => r.id), 'B has its own of each');

    const line = (description = `XT Bracket ${stamp}`, quantity = 10, rate = 500) => ({ description, quantity, rate, uom: 'nos' });

    /* ── customer orders ───────────────────────────────────────────── */
    section('customer orders: the customer and the products must be yours');
    const coB1 = await post(B, '/customer-orders', { customerId: cA.id, items: [line()] });
    ok(said(coB1, 400, 'Customer not found'), `B cannot take an order for A's customer (${shows(coB1)})`);
    const coB2 = await post(B, '/customer-orders', { customerId: cB.id, items: [{ ...line(), skuId: skA.id }] });
    ok(said(coB2, 400, 'Product not found'), `nor put A's product on its own order (${shows(coB2)})`);
    const coA = await post(A, '/customer-orders', { customerId: cA.id, items: [{ ...line(), skuId: skA.id, unit: 'nos' }] });
    const coA2 = await post(A, '/customer-orders', { customerId: cA.id, items: [{ ...line(), skuId: skA.id, unit: 'nos' }] });
    ok(coA.status === 200 && coA2.status === 200, `A takes orders for its own customer and product (${coA.status}, ${coA2.status})`);
    const orderOf = async (id) => (await call(A, 'GET', `/customer-orders/${id}`)).body;
    ok((await orderOf(coA.body.id)).customer?.id === cA.id, 'and reads its customer back on the order');

    /* ── 1. sales invoices ─────────────────────────────────────────── */
    section('1. sales invoices');
    const invB1 = await post(B, '/sales-invoices', { customerId: cA.id, items: [line()] });
    ok(said(invB1, 400, 'Customer not found') && !JSON.stringify(invB1.body).includes(`XT Customer A ${stamp}`),
      `B cannot invoice A's customer, and learns nothing about them (${shows(invB1)})`);
    const invB2 = await post(B, '/sales-invoices', { customerId: cB.id, customerOrderId: coA.body.id, items: [line()] });
    ok(said(invB2, 400, 'Customer order not found'), `nor invoice against A's order (${shows(invB2)})`);
    const invA = await post(A, '/sales-invoices', { customerId: cA.id, customerOrderId: coA.body.id, items: [line()] });
    const invADoc = invA.body.id ? (await call(A, 'GET', `/sales-invoices/${invA.body.id}`)).body : {};
    ok(invA.status === 200 && invADoc.customer?.id === cA.id && invADoc.order?.order_number,
      `A invoices its own customer against its own order (${shows(invA)})`);
    const invB = await post(B, '/sales-invoices', { customerId: cB.id, items: [line()] });
    const reB = await call(B, 'PATCH', `/sales-invoices/${invB.body.id}`, { customer_id: cA.id });
    ok(invB.status === 200 && said(reB, 400, 'Customer not found'), `B's draft cannot be switched to A's customer (${shows(reB)})`);
    const reA = await call(A, 'PATCH', `/sales-invoices/${invA.body.id}`, { customer_id: cA.id, notes: 'XT' });
    ok(reA.status === 200, `A can re-save its own draft with its own customer (${shows(reA)})`);
    /* An invoice made before the check, already pointing at A's customer. */
    await db.query('UPDATE sales_invoices SET customer_id = $1, customer_order_id = $2 WHERE id = $3 AND owner_id = $4',
      [cA.id, coA.body.id, invB.body.id, B.id]);
    const oldInv = (await call(B, 'GET', `/sales-invoices/${invB.body.id}`)).body;
    ok(!oldInv.customer && !oldInv.order, 'an older invoice of B\'s pointing at A\'s customer and order prints neither');

    /* ── 2. delivery challans ──────────────────────────────────────── */
    section('2. delivery challans');
    const dcB1 = await post(B, '/delivery-challans', { customerId: cA.id, items: [line()] });
    ok(said(dcB1, 400, 'Customer not found'), `B cannot send a challan to A's customer (${shows(dcB1)})`);
    const dcB2 = await post(B, '/delivery-challans', { customerId: cB.id, customerOrderId: coA.body.id, items: [line()] });
    ok(said(dcB2, 400, 'Customer order not found'), `nor against A's order (${shows(dcB2)})`);
    /* A challan of B's made before the check, already pointing at A's order. */
    const dcB = await post(B, '/delivery-challans', { customerId: cB.id, items: [line(`XT B goods ${stamp}`, 10, 1)] });
    await db.query('UPDATE delivery_challans SET customer_order_id = $1 WHERE id = $2 AND owner_id = $3', [coA.body.id, dcB.body.id, B.id]);
    const bDispatch = await call(B, 'PATCH', `/delivery-challans/${dcB.body.id}/status`, { status: 'Dispatched' });
    const afterB = await orderOf(coA.body.id);
    ok(bDispatch.status === 200 && afterB.status === 'Open', `dispatching it does not move A's order (A's order: ${afterB.status})`);
    await call(B, 'PATCH', `/delivery-challans/${dcB.body.id}/status`, { status: 'Draft' });
    const dcA = await post(A, '/delivery-challans', { customerId: cA.id, customerOrderId: coA.body.id, items: [line()] });
    const aDispatch = await call(A, 'PATCH', `/delivery-challans/${dcA.body.id}/status`, { status: 'Dispatched' });
    const afterA = await orderOf(coA.body.id);
    ok(dcA.status === 200 && aDispatch.status === 200 && afterA.status === 'Delivered',
      `A's own challan delivers A's own order (${afterA.status})`);
    const bDelA = await call(B, 'DELETE', `/delivery-challans/${dcA.body.id}`);
    ok(bDelA.status === 404, `B cannot delete A's challan (${bDelA.status})`);

    section('2b. pulling a challan back, twice, and deleting a dispatched one');
    const widget = `XT Widget ${stamp}`;
    const stockRow = await post(A, '/inventory', { itemName: widget, quantity: 500, uom: 'nos' });
    const invId = stockRow.body.item?.id;
    const held = async () => Number((await q('SELECT quantity FROM inventory WHERE id = $1', [invId]))[0]?.quantity);
    const dcR = await post(A, '/delivery-challans', { customerId: cA.id, items: [line(widget, 50, 10)] });
    const setDc = (st) => call(A, 'PATCH', `/delivery-challans/${dcR.body.id}/status`, { status: st });
    const seen = [];
    for (const st of ['Dispatched', 'Draft', 'Dispatched', 'Draft']) { await setDc(st); seen.push(await held()); }
    ok(invId && JSON.stringify(seen) === '[450,500,450,500]',
      `dispatch → draft → dispatch → draft leaves the shelf where it started: ${seen.join(' → ')}`);
    /* Each undo names the movement it reverses (migration 072), and the
       database will not take a second reversal of the same movement. */
    const led = await q(`SELECT id, quantity, reverses_movement_id FROM stock_movements
                           WHERE ref_type = 'delivery_challan' AND ref_id = $1 ORDER BY id`, [dcR.body.id]);
    const outs = led.filter((m) => Number(m.quantity) < 0 && !m.reverses_movement_id);
    const backs = led.filter((m) => m.reverses_movement_id);
    ok(outs.length === 2 && backs.length === 2 && backs.every((b) => outs.some((o) => o.id === b.reverses_movement_id)),
      `two dispatches, two undos, each linked to the dispatch it undid (${backs.map((b) => '#' + b.reverses_movement_id).join(', ')})`);
    const again = await q(`INSERT INTO stock_movements (owner_id, inventory_id, item_name, quantity, movement_type, ref_type, ref_id, reverses_movement_id)
                           SELECT owner_id, inventory_id, item_name, 50, 'adjustment', ref_type, ref_id, $1 FROM stock_movements WHERE id = $1 RETURNING id`,
      [outs[0]?.id]).then(() => 'taken', (e) => e.code);
    ok(again === '23505', `the database refuses a second undo of the same dispatch (${again})`);
    const rec = (await call(A, 'GET', '/inventory/reconcile')).body;
    ok(rec.healthy === true, `and the ledger still explains every balance (${(rec.drifted || []).length} drifted)`);
    await setDc('Dispatched');
    const delDispatched = await call(A, 'DELETE', `/delivery-challans/${dcR.body.id}`);
    ok(delDispatched.status === 409 && /Pull it back to Draft first/.test(delDispatched.body.error || '') && await held() === 450,
      `a dispatched challan cannot be deleted — "${delDispatched.body.error}"`);
    await setDc('Draft');
    const delDraft = await call(A, 'DELETE', `/delivery-challans/${dcR.body.id}`);
    ok(delDraft.status === 200 && await held() === 500, `pulled back to Draft, it can, and the stock is whole (${await held()})`);

    /* ── vendor comparison → PO → the customer order ──────────────── */
    section('3. a PO raised from a comparison moves only your own order');
    const itemA2 = (await orderOf(coA2.body.id)).items?.[0]?.id;
    const qB1 = await post(B, '/quotations', { partDescription: 'XT part', quantity: 1, customerOrderItemId: itemA2 });
    ok(said(qB1, 400, 'Customer order line not found'), `B cannot quote against A's order line (${shows(qB1)})`);
    /* A comparison of B's made before the check, pointing at A's order line. */
    const qB = await post(B, '/quotations', { partDescription: `XT B part ${stamp}`, quantity: 1 });
    await db.query('UPDATE quotations SET customer_order_item_id = $1 WHERE id = $2 AND owner_id = $3', [itemA2, qB.body.id, B.id]);
    const lineB = await post(B, `/quotations/${qB.body.id}/quote`, { vendorId: vB.id, vendorName: 'B', unitPrice: 5 });
    await post(B, `/quotations/${qB.body.id}/select`, { quoteLineId: lineB.body.id });
    const poFromB = await post(B, `/quotations/${qB.body.id}/generate-po`, {});
    ok(poFromB.status === 200 && !poFromB.body.customerOrderId && (await orderOf(coA2.body.id)).status === 'Open',
      `B's PO from it does not touch A's order (A's order: ${(await orderOf(coA2.body.id)).status})`);
    const qA = await post(A, '/quotations', { partDescription: `XT part ${stamp}`, quantity: 1, customerOrderItemId: itemA2 });
    const lineA = await post(A, `/quotations/${qA.body.id}/quote`, { vendorId: vA.id, vendorName: 'A', unitPrice: 5 });
    await post(A, `/quotations/${qA.body.id}/select`, { quoteLineId: lineA.body.id });
    const poFromA = await post(A, `/quotations/${qA.body.id}/generate-po`, {});
    ok(poFromA.status === 200 && (await orderOf(coA2.body.id)).status === 'In Procurement',
      `A's own comparison moves A's order to In Procurement (${shows(poFromA)})`);

    /* ── 4. sales quotations ───────────────────────────────────────── */
    section('4. sales quotations');
    const sqB1 = await post(B, '/sales-quotations', { customerId: cA.id, items: [line()] });
    ok(said(sqB1, 400, 'Customer not found'), `B cannot quote A's customer (${shows(sqB1)})`);
    const sqB2 = await post(B, '/sales-quotations', { customerId: cB.id, items: [{ ...line(), skuId: skA.id }] });
    ok(said(sqB2, 400, 'Product not found'), `nor quote A's product (${shows(sqB2)})`);
    const sqB = await post(B, '/sales-quotations', { customerId: cB.id, items: [line()] });
    const sqB3 = await call(B, 'PATCH', `/sales-quotations/${sqB.body.id}`, { customer_id: cA.id });
    ok(sqB.status === 200 && said(sqB3, 400, 'Customer not found'), `nor switch its own draft to A's customer (${shows(sqB3)})`);
    const sqA = await post(A, '/sales-quotations', { customerId: cA.id, items: [{ ...line(), skuId: skA.id }] });
    ok(sqA.status === 200, `A quotes its own customer and product (${shows(sqA)})`);

    /* ── 5. credit / debit notes ───────────────────────────────────── */
    section('5. credit and debit notes');
    const noteLine = [{ description: 'XT return', quantity: 1, rate: 100 }];
    const cnB = await post(B, '/credit-debit-notes', { noteType: 'credit', partyType: 'customer', partyId: cA.id, gstRate: 18, items: noteLine });
    const dnB = await post(B, '/credit-debit-notes', { noteType: 'debit', partyType: 'vendor', partyId: vA.id, gstRate: 18, items: noteLine });
    ok(said(cnB, 400, 'Customer not found') && said(dnB, 400, 'Vendor not found'),
      `B cannot raise a note against A's customer or vendor (${shows(cnB)}; ${shows(dnB)})`);
    const cnA = await post(A, '/credit-debit-notes', { noteType: 'credit', partyType: 'customer', partyId: cA.id, gstRate: 18, items: noteLine });
    const dnA = await post(A, '/credit-debit-notes', { noteType: 'debit', partyType: 'vendor', partyId: vA.id, gstRate: 18, items: noteLine });
    ok(cnA.status === 200 && dnA.status === 200, `A can, against its own (${cnA.status}, ${dnA.status})`);

    /* ── 6. purchase orders ────────────────────────────────────────── */
    section('6. purchase orders');
    const poB1 = await post(B, '/po', { vendorId: vA.id, itemName: 'XT x', quantity: 1, unitPrice: 1 });
    ok(said(poB1, 400, 'Vendor not found'), `B cannot raise a PO on A's vendor (${shows(poB1)})`);
    const poLine = (description, quantity, unitPrice) => ({ sno: 1, description, uom: 'kg', quantity, unitPrice });
    const poA = await post(A, '/po', { vendorId: vA.id, itemName: rmName, quantity: 100, unitPrice: 50, items: [poLine(rmName, 100, 50)] });
    ok(poA.status === 200, `A raises a PO on its own vendor (${shows(poA)})`);
    /* A PO of B's made before the check, already naming A's vendor. */
    const poB = await post(B, '/po', { vendorId: vB.id, itemName: 'XT y', quantity: 1, unitPrice: 1 });
    await db.query('UPDATE purchase_orders SET "vendorId" = $1 WHERE id = $2 AND owner_id = $3', [vA.id, poB.body.id, B.id]);
    const poBDoc = (await call(B, 'GET', `/po/${poB.body.id}`)).body;
    ok(!poBDoc.vendorName && !poBDoc.vendorGstin, 'an older PO of B\'s naming A\'s vendor does not print A\'s vendor');

    /* ── goods received ────────────────────────────────────────────── */
    section('goods receipts: the PO, and the material it lands on');
    await call(A, 'PATCH', `/po/${poA.body.id}/approve`);
    await call(A, 'PATCH', `/po/${poA.body.id}/dispatch`);
    const outB = await call(B, 'GET', `/grn/outstanding/${poA.body.id}`);
    const outA = await call(A, 'GET', `/grn/outstanding/${poA.body.id}`);
    ok(outB.status === 404 && outA.status === 200 && Number(outA.body.outstanding) === 100,
      `only A can see what its PO still owes (B ${outB.status}, A ${outA.status}: ${outA.body.outstanding} outstanding)`);
    const grnB = await post(B, '/grn', { poId: poA.body.id, receivedQuantity: 1 });
    ok(grnB.status === 404, `B cannot book a receipt against A's PO (${shows(grnB)})`);
    const grnA = await post(A, '/grn', { poId: poA.body.id, receivedQuantity: 100, vehicleNumber: 'XT 01' });
    const grnId = grnA.body.grnId;
    const [aStock] = await q(`SELECT id, raw_material_id, quantity FROM inventory WHERE owner_id = $1 AND "itemName" = $2`, [A.id, rmName]);
    ok(grnA.status === 200 && aStock?.raw_material_id === rmA.id && Number(aStock.quantity) === 100,
      `A receives 100 kg onto its own material (${shows(grnA)})`);
    /* B receives goods called by A's material's name: by name alone the
       lookup found A's material and linked B's stock to it. */
    const poBSame = await post(B, '/po', { vendorId: vB.id, itemName: rmName, quantity: 5, unitPrice: 1, items: [poLine(rmName, 5, 1)] });
    await call(B, 'PATCH', `/po/${poBSame.body.id}/approve`);
    await call(B, 'PATCH', `/po/${poBSame.body.id}/dispatch`);
    const grnBSame = await post(B, '/grn', { poId: poBSame.body.id, receivedQuantity: 5 });
    const [bStock] = await q(`SELECT id, raw_material_id FROM inventory WHERE owner_id = $1 AND "itemName" = $2`, [B.id, rmName]);
    ok(grnBSame.status === 200 && bStock && bStock.raw_material_id == null,
      `B receiving goods with the same name as A's material does not link to A's material (${bStock?.raw_material_id ?? 'unlinked'})`);

    section('4b. a receipt that moved stock is not edited or deleted');
    const MOVED = "A goods receipt that has moved stock can't be edited or deleted. Record a correction with a stock count instead.";
    const grnEdit = await call(A, 'PATCH', `/grn/${grnId}`, { receivedQuantity: 1 });
    const grnDel = await call(A, 'DELETE', `/grn/${grnId}`);
    ok(said(grnEdit, 409, MOVED) && said(grnDel, 409, MOVED), `editing or deleting it is refused (${grnEdit.status}, ${grnDel.status})`);
    const grnRead = await call(A, 'GET', `/grn/${grnId}`);
    const [aStockAfter] = await q('SELECT quantity FROM inventory WHERE id = $1', [aStock.id]);
    ok(grnRead.status === 200 && Number(grnRead.body.receivedQuantity) === 100 && Number(aStockAfter.quantity) === 100,
      'reading it still works, and the receipt and the stock are unchanged');
    const grnBEdit = await call(B, 'PATCH', `/grn/${grnId}`, { vehicleNumber: 'X' });
    const grnBDel = await call(B, 'DELETE', `/grn/${grnId}`);
    ok(grnBEdit.status === 404 && grnBDel.status === 404, `B gets 404 for A's receipt either way (${grnBEdit.status}, ${grnBDel.status})`);

    /* ── 7. purchase bills ─────────────────────────────────────────── */
    section('7. purchase bills');
    const billLine = [{ description: rmName, quantity: 100, rate: 50 }];
    const gbB1 = await post(B, '/grn-bills', { vendorId: vA.id, items: billLine });
    const gbB2 = await post(B, '/grn-bills', { grnId, items: billLine });
    const gbB3 = await post(B, '/grn-bills', { poId: poA.body.id, items: billLine });
    ok(said(gbB1, 400, 'Vendor not found') && said(gbB2, 400, 'Goods receipt not found') && said(gbB3, 400, 'Purchase order not found'),
      `B cannot bill A's vendor, receipt or PO (${[gbB1, gbB2, gbB3].map(r => r.status).join(', ')})`);
    const preB = await call(B, 'GET', `/grn-bills/prefill/${grnId}`);
    const preA = await call(A, 'GET', `/grn-bills/prefill/${grnId}`);
    ok(preB.status === 404 && !preB.body.vendor && preA.status === 200 && preA.body.vendor?.id === vA.id,
      `only A can prefill a bill from its receipt — B gets ${preB.status} and no vendor row`);
    const gbA = await post(A, '/grn-bills', { grnId, poId: poA.body.id, vendorId: vA.id, items: billLine, gstRate: 18 });
    ok(gbA.status === 200, `A bills its own receipt (${shows(gbA)})`);
    const payA = await post(A, `/grn-bills/${gbA.body.id}/payment`, { amount: 100 });
    const paysB = await call(B, 'GET', `/grn-bills/${gbA.body.id}/payments`);
    const paysA = await call(A, 'GET', `/grn-bills/${gbA.body.id}/payments`);
    ok(payA.status === 200 && paysB.status === 404 && rowsOf(paysA.body).length === 1,
      `B cannot list the payments on A's bill (${paysB.status}); A sees its one`);
    const apA = (await call(A, 'GET', '/payables?limit=200')).body;
    const apB = (await call(B, 'GET', '/payables?limit=200')).body;
    ok((apA.bills || []).some(b => b.id === gbA.body.id), 'Payables lists A\'s bill though it has no project');
    ok(!(apB.bills || []).some(b => b.id === gbA.body.id), 'and B\'s Payables does not');

    /* ── 8. indents, measurements, work orders ─────────────────────── */
    section('8. indents, measurements and work orders');
    const indentBody = (o) => ({ requestedQuantity: 5, requiredDate: '2026-12-01', chainage: `CH ${stamp}`, ...o });
    const inB1 = await post(B, '/indent', indentBody({ projectId: pB.id, workOrderId: woB.id, boqId: bqA.id }));
    const inB2 = await post(B, '/indent', indentBody({ projectId: pB.id, workOrderId: woA.id, boqId: bqB.id }));
    ok(said(inB1, 400, 'BOQ item not found') && said(inB2, 400, 'Work order not found'),
      `B cannot raise an indent on A's BOQ line or work order (${inB1.status}, ${inB2.status})`);
    const inB = await post(B, '/indent', indentBody({ projectId: pB.id, workOrderId: woB.id, boqId: bqB.id }));
    const inBEdit = await call(B, 'PATCH', `/indent/${inB.body.id}`, { boqId: bqA.id });
    ok(inB.status === 200 && said(inBEdit, 400, 'BOQ item not found'), `nor move its own indent onto A's BOQ line (${shows(inBEdit)})`);
    const mbB = await post(B, '/mb', { projectId: pB.id, workOrderId: woA.id, boqId: bqA.id, chainage: 'x', measuredQuantity: 1 });
    const woBNew = await post(B, '/work-orders', { projectId: pB.id, vendorId: vA.id, name: 'XT steal' });
    const woBEdit = await call(B, 'PATCH', `/work-orders/${woB.id}`, { vendorId: vA.id });
    ok(mbB.status === 400 && said(woBNew, 400, 'Vendor not found') && said(woBEdit, 400, 'Vendor not found'),
      `nor measure against A's work, or bind A's subcontractor (${mbB.status}, ${woBNew.status}, ${woBEdit.status})`);
    const prodB = await post(B, '/production', { productName: 'XT steal', plannedQty: 1, workOrderId: woA.id });
    const prodA = await post(A, '/production', { productName: `XT make ${stamp}`, plannedQty: 1, workOrderId: woA.id });
    ok(said(prodB, 400, 'Work order not found') && prodA.status === 200,
      `a production order names only your own work order (B ${prodB.status}, A ${prodA.status})`);
    const indA = await post(A, '/indent', indentBody({ projectId: pA.id, workOrderId: woA.id, boqId: bqA.id }));
    const mbA = await post(A, '/mb', { projectId: pA.id, workOrderId: woA.id, boqId: bqA.id, chainage: `CH ${stamp}`, length: 2, width: 2, depth: 2.5, measuredQuantity: 10 });
    ok(indA.status === 200 && mbA.status === 200, `A raises its own indent and measurement (${indA.status}, ${mbA.status})`);

    /* ── reads and writes by id alone ──────────────────────────────── */
    section('RA bills');
    const raA = await post(A, '/bills/generate', { projectId: pA.id, workOrderId: woA.id });
    const raId = raA.body.billId;
    const raReadB = await call(B, 'GET', `/bills/${raId}`);
    const raReadA = await call(A, 'GET', `/bills/${raId}`);
    ok(raA.status === 200 && raReadB.status === 404 && !raReadB.body.vendorName && raReadA.status === 200,
      `B cannot read A's RA bill (${raReadB.status}); A can (${raReadA.status})`);
    const sub = await call(A, 'PATCH', `/bills/${raId}/submit`);
    const tries = [];
    for (const act of ['approve', 'pay', 'reject', 'submit']) tries.push((await call(B, 'PATCH', `/bills/${raId}/${act}`)).status);
    const raDelB = await call(B, 'DELETE', `/bills/${raId}`);
    const raNow = (await call(A, 'GET', `/bills/${raId}`)).body;
    ok(sub.status === 200 && tries.every(s => s === 404) && raDelB.status === 404 && raNow.status === 'Under Review',
      `B cannot approve, pay, reject, submit or delete it (${[...tries, raDelB.status].join(', ')}) — still ${raNow.status}`);
    const appr = await call(A, 'PATCH', `/bills/${raId}/approve`);
    await post(A, '/mb', { projectId: pA.id, workOrderId: woA.id, boqId: bqA.id, chainage: `CH2 ${stamp}`, measuredQuantity: 5 });
    const ra2 = await post(A, '/bills/generate', { projectId: pA.id, workOrderId: woA.id });
    const delA = await call(A, 'DELETE', `/bills/${ra2.body.billId}`);
    ok(appr.status === 200 && ra2.status === 200 && delA.status === 200,
      `A can approve its own, and delete its own draft (${appr.status}, ${delA.status})`);
    /* Rejecting used to fail with a 500 for everybody: the table's CHECK
       had no 'Rejected' (fixed by migration 072). */
    await post(A, '/mb', { projectId: pA.id, workOrderId: woA.id, boqId: bqA.id, chainage: `CH3 ${stamp}`, measuredQuantity: 4 });
    const ra3 = await post(A, '/bills/generate', { projectId: pA.id, workOrderId: woA.id });
    await call(A, 'PATCH', `/bills/${ra3.body.billId}/submit`);
    const rej = await call(A, 'PATCH', `/bills/${ra3.body.billId}/reject`);
    const rejNow = (await call(A, 'GET', `/bills/${ra3.body.billId}`)).body;
    const payRejected = await call(A, 'PATCH', `/bills/${ra3.body.billId}/pay`);
    const delRejected = await call(A, 'DELETE', `/bills/${ra3.body.billId}`);
    ok(ra3.status === 200 && rej.status === 200 && rejNow.status === 'Rejected' && payRejected.status === 409 && delRejected.status === 200,
      `an RA bill under review can be rejected (${rej.status}, now ${rejNow.status}); a rejected bill can't be paid (${payRejected.status}) but can be deleted (${delRejected.status})`);

    section('indent status, milestones');
    const stB = await call(B, 'PUT', `/indent/${indA.body.id}/status`, { status: 'Approved' });
    const stA = await call(A, 'PUT', `/indent/${indA.body.id}/status`, { status: 'Approved' });
    ok(stB.status === 404 && !stB.body.indentData && stA.status === 200, `only A approves A's indent (B ${stB.status}, A ${stA.status})`);
    const ms = await post(A, '/milestones', { workOrderId: woA.id, name: `XT milestone ${stamp}`, plannedPercent: 50 });
    const msB = await call(B, 'PATCH', `/milestones/${ms.body.id}`, { actualPercent: 99 });
    const msA = await call(A, 'PATCH', `/milestones/${ms.body.id}`, { actualPercent: 40 });
    const [msRow] = await q('SELECT "actualPercent" FROM milestones WHERE id = $1', [ms.body.id]);
    ok(ms.body.id && msB.status === 404 && msA.status === 200 && Number(msRow.actualPercent) === 40,
      `only A moves A's milestone (B ${msB.status}, A ${msA.status} → ${msRow?.actualPercent}%)`);

    section('a product\'s bill of materials');
    const bomA = await call(A, 'PUT', `/skus/${skA.id}/bom`, { lines: [{ componentName: rmName, rawMaterialId: rmA.id, qtyPerUnit: 2, uom: 'kg' }] });
    const bomReadB = await call(B, 'GET', `/skus/${skA.id}/bom`);
    const bomPutB = await call(B, 'PUT', `/skus/${skA.id}/bom`, { lines: [] });
    const bomForeign = await call(A, 'PUT', `/skus/${skA.id}/bom`, { lines: [{ componentName: 'x', rawMaterialId: rmB.id, qtyPerUnit: 1 }] });
    const bomReadA = await call(A, 'GET', `/skus/${skA.id}/bom`);
    ok(bomA.status === 200 && bomReadB.status === 404 && bomPutB.status === 404,
      `B can neither read nor replace A's BOM (${bomReadB.status}, ${bomPutB.status})`);
    ok(said(bomForeign, 400, 'Raw material not found') && rowsOf(bomReadA.body).length === 1 && rowsOf(bomReadA.body)[0].raw_material_id === rmA.id,
      `A's BOM cannot name B's material, and A's recipe is intact (${rowsOf(bomReadA.body).length} line)`);

    section('who supplies what');
    const linkA = await post(A, '/vendor-items', { vendor_id: vA.id, raw_material_id: rmA.id, price: 50, is_preferred: true });
    const supB = await call(B, 'GET', `/raw-materials/${rmA.id}/vendors`);
    ok(linkA.status === 200 && supB.status === 404, `B cannot see who supplies A's material (${supB.status})`);
    const viB1 = await post(B, '/vendor-items', { vendor_id: vB.id, raw_material_id: rmA.id, price: 1, is_preferred: true });
    const viB2 = await post(B, '/vendor-items', { vendor_id: vA.id, raw_material_id: rmB.id, price: 1 });
    const supA = (await call(A, 'GET', `/raw-materials/${rmA.id}/vendors`)).body;
    ok(said(viB1, 400, 'Raw material not found') && said(viB2, 400, 'Vendor not found'),
      `B cannot link to A's material or A's vendor (${viB1.status}, ${viB2.status})`);
    ok(supA.items?.length === 1 && supA.items[0].vendor_id === vA.id && supA.items[0].is_preferred === true,
      'A\'s preferred supplier is still A\'s, and still preferred');
    const linkB = await post(B, '/vendor-items', { vendor_id: vB.id, raw_material_id: rmB.id, price: 1 });
    const viB3 = await call(B, 'PATCH', `/vendor-items/${linkB.body.id}`, { vendor_id: vA.id });
    const viB4 = await call(B, 'PATCH', `/vendor-items/${linkA.body.id}`, { price: 1 });
    ok(linkB.status === 200 && said(viB3, 400, 'Vendor not found') && viB4.status === 404,
      `nor re-point its own link at A's vendor, or edit A's (${viB3.status}, ${viB4.status})`);

    section('material requirements count only your own');
    /* A needs 10 brackets × 2 kg = 20 kg, holds 100 kg (the receipt) and has
       7 kg on order. B — with no business in A's numbers — has: an open PO
       for 1,000 kg under the same name, its 5 kg of stock linked to A's
       material (as the name lookup used to do), and a cheaper link to A's
       material from B's vendor. */
    await post(A, '/po', { vendorId: vA.id, itemName: rmName, quantity: 7, unitPrice: 50, items: [poLine(rmName, 7, 50)] });
    await post(B, '/po', { vendorId: vB.id, itemName: rmName, quantity: 1000, unitPrice: 1, items: [poLine(rmName, 1000, 1)] });
    await db.query('UPDATE inventory SET raw_material_id = $1 WHERE id = $2 AND owner_id = $3', [rmA.id, bStock.id, B.id]);
    await call(A, 'PATCH', `/vendor-items/${linkA.body.id}`, { is_preferred: false });
    await db.query(`INSERT INTO vendor_items (owner_id, vendor_id, raw_material_id, price) VALUES ($1, $2, $3, 1)`, [B.id, vB.id, rmA.id]);
    const mrA = (await call(A, 'GET', '/material-requirements')).body;
    const row = (mrA.items || []).find(m => m.raw_material_id === rmA.id);
    ok(row && Number(row.required) === 20, `A's requirement is its own order's (${row?.required} kg)`);
    ok(row && Number(row.available) === 100, `available is A's stock only: ${row?.available} kg (B's 5 kg not counted)`);
    ok(row && Number(row.on_order) === 7, `on order is A's POs only: ${row?.on_order} kg (B's 1,000 kg not counted)`);
    ok(row?.preferred_vendor?.id === vA.id, `the supplier offered is A's own (${row?.preferred_vendor?.name})`);
    const mrB = (await call(B, 'GET', '/material-requirements')).body;
    ok(!(mrB.items || []).some(m => m.raw_material_id === rmA.id), 'and B\'s board shows nothing of A\'s');

    section('a project id in the query does not cover a different one in the body');
    const smuggle = await call(B, 'POST', `/indent?projectId=${pB.id}`, indentBody({ projectId: pA.id, workOrderId: woB.id, boqId: bqB.id }));
    const viaSnake = await post(B, '/expenses', { project_id: pA.id, category: 'Misc', description: 'XT', amount: 1, expense_date: '2026-10-01' });
    const listMixed = await call(B, 'GET', `/boq?projectId=${pB.id}&project_id=${pA.id}`);
    ok(smuggle.status === 403 && viaSnake.status === 403 && listMixed.status === 403,
      `B is refused with A's project in the body, as project_id, or beside its own (${smuggle.status}, ${viaSnake.status}, ${listMixed.status})`);
    const expA = await post(A, '/expenses', { project_id: pA.id, category: 'Misc', description: 'XT', amount: 1, expense_date: '2026-10-01' });
    const ownBoth = await call(B, 'GET', `/boq?projectId=${pB.id}&project_id=${pB.id}`);
    ok(expA.status === 200 && ownBoth.status === 200, `with its own project it works (${expA.status}, ${ownBoth.status})`);

    section('deleting a vendor quote from a comparison');
    const qDel = await post(A, '/quotations', { partDescription: `XT del ${stamp}`, quantity: 1 });
    const qLine = await post(A, `/quotations/${qDel.body.id}/quote`, { vendorId: vA.id, vendorName: 'A', unitPrice: 9 });
    const delQB = await call(B, 'DELETE', `/quotations/quote/${qLine.body.id}`);
    const linesAfterB = (await call(A, 'GET', `/quotations/${qDel.body.id}`)).body.lines || [];
    ok(delQB.status === 404 && linesAfterB.length === 1, `B cannot delete A's vendor quote (${delQB.status})`);
    const delQA = await call(A, 'DELETE', `/quotations/quote/${qLine.body.id}`);
    const linesAfterA = (await call(A, 'GET', `/quotations/${qDel.body.id}`)).body.lines || [];
    ok(delQA.status === 200 && linesAfterA.length === 0, `A can delete its own — it used to 404 every time (${shows(delQA)})`);
  } catch (e) {
    fail++; console.log(`   ❌ crashed: ${e.stack || e.message}`);
  } finally {
    let removed = 0;
    try {
      if (!connected) { await db.connect(); connected = true; }
      removed = await purge([A.id, B.id].filter(Boolean), db);
      const [left] = (await db.query(`SELECT COUNT(*)::int AS n FROM users WHERE email LIKE $1`, [`xt-%-${stamp}@example.test`])).rows;
      ok(left.n === 0, `test companies removed (${removed} account(s), ${left.n} left)`);
    } catch (e) { fail++; console.log(`   ❌ cleanup failed: ${e.message}`); }
    await db.end().catch(() => {});
    console.log(`\n  ${pass} passed, ${fail} failed\n`);
    process.exit(fail ? 1 : 0);
  }
})();
