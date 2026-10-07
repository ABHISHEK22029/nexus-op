#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   The links in the order-to-cash chain that were missing, each now a check.
   Found while scripting the product film, which may only show what works.

   1. Convert to quotation opened an empty form: the enquiry's lines were
      saved for the quotation builder and never read. Now carried across,
      with the product link and HSN, and the enquiry is linked to the
      quotation made from it.
   2. An uploaded vendor quotation could be compared but not ordered from.
      POST /vendor-quotations/:id/to-po raises the PO from its lines.
   3. Issuing material to production never left stock. It now does, through
      the stock ledger, and cannot issue more than is on hand.
   4. notify('admins') told every company's administrators about every
      company's purchase orders, and an organisation's own Owner nothing.
   5. A project was required to raise a PO by hand, receive goods or list
      production — so a fabricator without projects could not.
   Plus the holes closed on the way: approve / sign-off / dispatch of
   another company's PO, and reading or writing another company's
   production order, by id.

   Runs against a local backend (SCHEDULER=off) with throwaway accounts it
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
const db = () => new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const q1 = async (sql, params) => { const c = db(); await c.connect(); try { return (await c.query(sql, params)).rows; } finally { await c.end(); } };

async function cleanup() {
  const c = db(); await c.connect();
  try {
    const { rows } = await c.query(`SELECT id, org_id FROM users WHERE email LIKE 'gaps-%@example.test'`);
    const ids = [...new Set(rows.flatMap(r => [r.id, r.org_id]).filter(Boolean))];
    if (!ids.length) return 0;
    /* Links between owned tables (an enquiry points at the quotation made
       from it, which points at the customer) can need more than one pass. */
    for (let i = 0; i < 4; i++) { const r = await purgeOrg(c, ids); if (!r.deleted) break; }
    await c.query('DELETE FROM document_sequences WHERE owner_id = ANY($1)', [ids]).catch(() => {});
    await c.query('DELETE FROM notifications WHERE user_id = ANY($1)', [rows.map(r => r.id)]).catch(() => {});
    const members = (await c.query(`DELETE FROM users WHERE email LIKE 'gaps-%@example.test' AND id <> org_id`)).rowCount;
    return members + (await c.query(`DELETE FROM users WHERE email LIKE 'gaps-%@example.test'`)).rowCount;
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
  body: JSON.stringify({ name: `Gaps ${tag}`, email: `gaps-${tag}-${stamp}@example.test`, password: PASS }),
})).json();
const member = async (owner, tag, role) => {
  const email = `gaps-${tag}-${stamp}@example.test`;
  const made = await call(owner, 'POST', '/admin/users', { name: `${role} person`, email, password: PASS, role });
  if (![200, 201].includes(made.status)) throw new Error(`could not add a ${role}: ${made.status} ${made.body.error || ''}`);
  const r = await (await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASS }) })).json();
  return { ...r, id: made.body.id ?? r.user?.id };
};
const uploadQuote = async (who, { vendorId, vendorName, csv }) => {
  const fd = new FormData();
  fd.append('file', new Blob([csv], { type: 'text/csv' }), 'quote.csv');
  if (vendorId) fd.append('vendorId', String(vendorId));
  if (vendorName) fd.append('vendorName', vendorName);
  const r = await fetch(`${API}/vendor-quotations`, { method: 'POST', headers: { Authorization: `Bearer ${who.token}` }, body: fd });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const QUOTE_CSV = 'Description,Qty,Unit,Rate,Amount\nSS304 sheet 2 mm,180,kg,260,46800\n';

(async () => {
  await cleanup();
  const A = await register('a'), B = await register('b');
  try {
    await call(A, 'PUT', '/company-profile', { name: 'Precision Fab Works', gstin: '36AAMCK2569F1Z9', stateCode: '36' });
    await call(B, 'PUT', '/company-profile', { name: 'Other Works', gstin: '29AABCO1234F1Z5', stateCode: '29' });
    const FIN = await member(A, 'fin', 'Finance');
    const PROD = await member(A, 'prod', 'Production');

    /* ── 1 ─────────────────────────────────────────────────────────── */
    console.log('\n  ── 1. an enquiry becomes a quotation with its lines');
    const sku = (await call(A, 'POST', '/skus', { sku_code: `BRK-${stamp}`, name: 'SS304 Mounting Bracket', unit: 'nos', price: 2320, hsn: '7326' })).body;
    const [enq] = await q1(`INSERT INTO enquiries (owner_id, ref, name, company, phone, email, message, status, source)
      VALUES ($1,$2,'Ravi','Acme Engineering Pvt. Ltd.','9000000000','ravi@acme.example','Brushed finish, delivery in 4 weeks','New','catalogue') RETURNING id`,
      [A.user.id, `ENQ-T${stamp}`]);
    await q1(`INSERT INTO enquiry_items (enquiry_id, sku_id, description, quantity, unit, sort_order) VALUES ($1,$2,'SS304 Mounting Bracket',120,'nos',0)`, [enq.id, sku.id]);
    const conv = await call(A, 'POST', `/enquiries/${enq.id}/convert`);
    const pf = conv.body.prefill || {};
    ok(conv.status === 200 && pf.enquiryId === enq.id && pf.message === 'Brushed finish, delivery in 4 weeks',
      'converting hands over which enquiry it was and what the customer wrote');
    ok(pf.items?.length === 1 && String(pf.items[0].skuId) === String(sku.id) && pf.items[0].hsn === '7326' && Number(pf.items[0].quantity) === 120 && pf.items[0].rate === '',
      'and its lines, with the product and its HSN — the rate left for a person to set');
    const qt = await call(A, 'POST', '/sales-quotations', {
      customerId: pf.customerId, enquiryId: pf.enquiryId,
      items: pf.items.map(i => ({ ...i, rate: 2320 })),
    });
    const [linked] = await q1('SELECT quotation_id FROM enquiries WHERE id = $1', [enq.id]);
    ok(qt.status === 200 && linked.quotation_id === qt.body.id, `the quotation is linked back to the enquiry (${qt.body.quoteNumber})`);
    const [enq2] = await q1(`INSERT INTO enquiries (owner_id, ref, name, message, status, source) VALUES ($1,$2,'X','—','New','catalogue') RETURNING id`, [A.user.id, `ENQ-U${stamp}`]);
    const bCust = (await call(B, 'POST', '/customers', { name: `B customer ${stamp}`, state: 'Karnataka', billing_address: 'Bengaluru' })).body;
    await call(B, 'POST', '/sales-quotations', { customerId: bCust.id, enquiryId: enq2.id, items: [{ description: 'x', quantity: 1, rate: 1 }] });
    const [still] = await q1('SELECT quotation_id FROM enquiries WHERE id = $1', [enq2.id]);
    ok(still.quotation_id === null, 'another company cannot attach its quotation to your enquiry');

    /* ── 2 ─────────────────────────────────────────────────────────── */
    console.log('\n  ── 2. order straight from a vendor\'s quotation');
    const vendor = (await call(A, 'POST', '/vendors', { name: `Deccan Metals ${stamp}`, type: 'Supplier', gstin: '36AAACD9999K1Z2' })).body;
    await call(A, 'PUT', '/automation-settings', { po_approval_threshold: 40000 });
    const vq = await uploadQuote(A, { vendorId: vendor.id, csv: QUOTE_CSV });
    ok(vq.status === 200 && vq.body.id, `a vendor's quotation is uploaded and read (${vq.body.parse_status || vq.body.parseStatus || vq.status})`);
    const vqId = vq.body.id;
    const byProd = await call(PROD, 'POST', `/vendor-quotations/${vqId}/to-po`);
    ok(byProd.status === 403, `someone who may not create purchase orders cannot raise one from it (${byProd.status})`);
    const byB = await call(B, 'POST', `/vendor-quotations/${vqId}/to-po`);
    ok(byB.status === 404, `nor can another company (${byB.status})`);
    const raised = await call(A, 'POST', `/vendor-quotations/${vqId}/to-po`);
    const shape = /^[A-Z0-9-]+\/FY\d{4}-\d{2}\/\d{3,}$/;
    ok(raised.status === 200 && shape.test(raised.body.poNumber || ''), `"Raise PO" makes a purchase order in the company's series (${raised.body.poNumber})`);
    const poId = raised.body.id;
    const lines = (await call(A, 'GET', `/po/${poId}/items`)).body;
    ok(Array.isArray(lines) && lines.length === 1 && Number(lines[0].quantity) === 180 && Number(lines[0].unitPrice) === 260,
      'with the quotation\'s own line: 180 kg at ₹260, nothing retyped');
    ok(raised.body.approvalStatus === 'Pending Approval', 'and ₹46,800 over a ₹40,000 limit is held for sign-off');
    const again = await call(A, 'POST', `/vendor-quotations/${vqId}/to-po`);
    ok(again.status === 409 && again.body.poNumber === raised.body.poNumber, `a second click does not order twice (${again.status})`);
    const cmpA = await uploadQuote(A, { vendorId: vendor.id, csv: QUOTE_CSV.replace('260,46800', '270,48600') });
    const cmp = await call(A, 'GET', `/vendor-quotations/compare?ids=${vqId},${cmpA.body.id}`);
    const shown = (cmp.body.quotations || []).find(x => x.id === vqId);
    ok(shown?.poNumber === raised.body.poNumber, 'the comparison shows which quotation was ordered from');
    await q1(`UPDATE vendor_quotation_lines SET confidence = 'medium' WHERE vendor_quotation_id = $1`, [cmpA.body.id]);
    const unchecked = await call(A, 'POST', `/vendor-quotations/${cmpA.body.id}/to-po`);
    ok(unchecked.status === 400 && /Check the lines/.test(unchecked.body.error || ''), 'a line nobody has checked cannot go onto a PO');
    const loose = await uploadQuote(A, { vendorName: 'Someone on WhatsApp', csv: QUOTE_CSV });
    const noVendor = await call(A, 'POST', `/vendor-quotations/${loose.body.id}/to-po`);
    ok(noVendor.status === 400 && /Link this quotation to a vendor/.test(noVendor.body.error || ''), 'nor a quotation not linked to a vendor');

    /* ── 4 (notifications, on the PO just raised) ─────────────────── */
    console.log('\n  ── 4. notifications reach the right people, in the right company');
    const notes = async (uid) => (await q1('SELECT type FROM notifications WHERE user_id = $1 AND entity_type = $2 AND entity_id = $3', [uid, 'po', poId])).map(r => r.type);
    const toOwner = await notes(A.user.id), toFin = await notes(FIN.id), toProd = await notes(PROD.id), toB = await notes(B.user.id);
    ok(toOwner.includes('PO_CREATED') && toOwner.includes('APPROVAL_NEEDED'), `the Owner hears of it (${toOwner.join(', ')})`);
    ok(toFin.includes('APPROVAL_NEEDED') && !toFin.includes('PO_CREATED'), `Finance, who may sign it off, is asked to (${toFin.join(', ')})`);
    ok(!toProd.length, 'Production, who may not, is not');
    ok(!toB.length, 'and nobody in another company hears anything');
    const legacyAdmins = await q1(`SELECT COUNT(*)::int n FROM notifications nt JOIN users u ON u.id = nt.user_id
       WHERE nt.entity_type = 'po' AND nt.entity_id = $1 AND u.org_id <> $2`, [poId, A.user.id]);
    ok(legacyAdmins[0].n === 0, 'not even a platform administrator elsewhere');

    /* ── extra: approve / sign-off / dispatch are yours only ──────── */
    console.log('\n  ── approve, sign-off and dispatch: your own POs only');
    const bSign = await call(B, 'PATCH', `/po/${poId}/approval`, { decision: 'Approved' });
    ok(bSign.status === 404, `another company cannot sign off your PO (${bSign.status})`);
    const finSign = await call(FIN, 'PATCH', `/po/${poId}/approval`, { decision: 'Approved' });
    ok(finSign.status === 200, 'your Finance can');
    const bApprove = await call(B, 'PATCH', `/po/${poId}/approve`);
    const bDispatch = await call(B, 'PATCH', `/po/${poId}/dispatch`);
    ok(bApprove.status === 404 && bDispatch.status === 404, `nor approve or dispatch it (${bApprove.status}, ${bDispatch.status})`);
    const appr = await call(A, 'PATCH', `/po/${poId}/approve`);
    const disp = await call(A, 'PATCH', `/po/${poId}/dispatch`);
    ok(appr.status === 200 && disp.status === 200, 'you can');

    /* ── 5 ─────────────────────────────────────────────────────────── */
    console.log('\n  ── 5. no project needed');
    const grn = await call(A, 'POST', '/grn', { poId, receivedQuantity: 180, vehicleNumber: 'TS09 UB 4521' });
    ok(grn.status === 200, `goods are received against a PO that belongs to no project (${grn.status} ${grn.body.error || ''})`);
    const grnList = (await call(A, 'GET', '/grn?limit=50')).body;
    const grnRows = Array.isArray(grnList) ? grnList : grnList.items || [];
    ok(grnRows.some(g => Number(g.poId) === poId), 'and listed with no project chosen');
    const bGrn = (await call(B, 'GET', '/grn?limit=50')).body;
    ok(!(Array.isArray(bGrn) ? bGrn : bGrn.items || []).some(g => Number(g.poId) === poId), 'but not to another company');
    const manual = await call(A, 'POST', '/po', { vendorId: vendor.id, itemName: 'MS angle 50x50', quantity: 10, unitPrice: 90,
      items: [{ sno: 1, description: 'MS angle 50x50', uom: 'kg', quantity: 10, unitPrice: 90 }] });
    ok(manual.status === 200 && manual.body.linesSaved, `a PO is raised by hand without a project (${manual.status} ${manual.body.error || ''})`);

    /* ── 3 ─────────────────────────────────────────────────────────── */
    console.log('\n  ── 3. material issued to production leaves stock');
    const stockRow = (await call(A, 'POST', '/inventory', { itemName: `MS plate 10mm ${stamp}`, quantity: 50, uom: 'kg', unitCost: 70 })).body;
    const invId = stockRow.id ?? stockRow.item?.id ?? stockRow.inventory?.id;
    const order = (await call(A, 'POST', '/production', { productName: 'Bracket', plannedQty: 10 })).body;
    ok(order.id && order.prodNumber, `a production order is opened without a project (${order.prodNumber})`);
    const prodList = (await call(A, 'GET', '/production?limit=50')).body;
    ok((prodList.items || prodList).some(o => o.id === order.id), 'and listed with no project chosen');
    const issued = await call(A, 'POST', `/production/${order.id}/consumption`, { inventoryId: invId, itemName: `MS plate 10mm ${stamp}`, consumedQty: 20, uom: 'kg' });
    const [after] = await q1('SELECT quantity FROM inventory WHERE id = $1', [invId]);
    ok(issued.status === 200 && Number(after.quantity) === 30, `issuing 20 kg takes it off stock (${after.quantity} kg left)`);
    const [mv] = await q1(`SELECT quantity, owner_id, ref_number FROM stock_movements WHERE inventory_id = $1 AND movement_type = 'production_consumption'`, [invId]);
    ok(mv && Number(mv.quantity) === -20 && mv.owner_id === A.user.id && mv.ref_number === order.prodNumber,
      'through the stock ledger, against the production order');
    const tooMuch = await call(A, 'POST', `/production/${order.id}/consumption`, { inventoryId: invId, itemName: 'x', consumedQty: 40, uom: 'kg' });
    ok(tooMuch.status === 409, `it cannot issue more than is on hand (${tooMuch.status})`);
    const bRead = await call(B, 'GET', `/production/${order.id}`);
    const bOut = await call(B, 'POST', `/production/${order.id}/output`, { itemName: 'x', outputQty: 1 });
    const bScrap = await call(B, 'POST', `/production/${order.id}/scrap`, { scrapQty: 1 });
    const bDel = await call(B, 'DELETE', `/production/consumption/line/${issued.body.id}`);
    ok([bRead, bOut, bScrap, bDel].every(r => r.status === 404),
      `another company cannot read it, add to it or delete its lines (${[bRead, bOut, bScrap, bDel].map(r => r.status).join(', ')})`);
    const del = await call(A, 'DELETE', `/production/consumption/line/${issued.body.id}`);
    const [back] = await q1('SELECT quantity FROM inventory WHERE id = $1', [invId]);
    const [rev] = await q1(`SELECT owner_id FROM stock_movements WHERE inventory_id = $1 AND movement_type = 'adjustment' AND ref_type = 'production_consumption'`, [invId]);
    ok(del.status === 200 && Number(back.quantity) === 50 && rev?.owner_id === A.user.id, 'deleting the line puts it back, on the ledger, for the right company');

    /* ── shortfall planner ─────────────────────────────────────────── */
    console.log('\n  ── the shortfall planner');
    const sfProd = await call(PROD, 'POST', '/material-requirements/to-po', {});
    ok(sfProd.status === 403, `Production may plan requirements but not raise POs from them (${sfProd.status})`);
    const sfOwner = await call(A, 'POST', '/material-requirements/to-po', {});
    ok([200, 400].includes(sfOwner.status), `the Owner can (${sfOwner.status}: ${sfOwner.body.message || sfOwner.body.error})`);
  } catch (e) {
    fail++; console.log('   ❌ threw:', e.message);
  } finally {
    const n = await cleanup();
    ok(n === 4, `test accounts removed (${n})`);
  }
  console.log(`\n   ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
