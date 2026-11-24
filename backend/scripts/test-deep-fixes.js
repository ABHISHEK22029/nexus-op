#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   The 20 Nov deep audit: every hole it found, tried again.

   Four read-only reviews (sales, buying, production and stock, and what
   ties the screens together) and a run of awkward-user probes found ~110
   places where a document didn't carry its link forward, a number could
   go wrong, or a click had no way back. This walks each fixed one, the way
   a user would hit it:

     enquiries logged by hand, matched to existing customers, re-opened
     orders edited, deleted only when nothing hangs off them, with their
       documents listed and per-line sent / billed
     challans limited to what is left, per line, with a pull-back that
       re-opens the order
     invoices, payments, credit notes: deletes, twins, caps, tax from the
       original
     vendor bills, payments, receipts, units, sign-off, vendors
     stock cost, rounding, units; production numbering, Make, output cost
     readiness sharing stock, saying what it can't check
     masters, user admin, categories

   Local backend (SCHEDULER=off) and throwaway @example.test companies that
   are deleted at the end. Refuses a deployed host.
     API_BASE=http://localhost:5097 node scripts/test-deep-fixes.js
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
const today = new Date().toISOString().slice(0, 10);
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };
const near = (a, b, d = 0.01) => Math.abs(Number(a) - Number(b)) <= d;
const section = (t) => console.log(`\n  ── ${t}`);
const db = () => new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const q = async (sql, params) => { const c = db(); await c.connect(); try { return (await c.query(sql, params)).rows; } finally { await c.end(); } };
const list = (b) => (Array.isArray(b) ? b : b?.items || []);

async function cleanup() {
  const c = db(); await c.connect();
  try {
    const { rows } = await c.query(`SELECT id, org_id FROM users WHERE email LIKE 'deep-%@example.test'`);
    const ids = [...new Set(rows.flatMap(r => [r.id, r.org_id]).filter(Boolean))];
    if (!ids.length) return 0;
    for (let i = 0; i < 5; i++) { const r = await purgeOrg(c, ids); if (!r.deleted) break; }
    await c.query('DELETE FROM document_sequences WHERE owner_id = ANY($1)', [ids]).catch(() => {});
    await c.query('DELETE FROM notifications WHERE user_id = ANY($1)', [rows.map(r => r.id)]).catch(() => {});
    await c.query(`DELETE FROM users WHERE email LIKE 'deep-%@example.test' AND id <> org_id`);
    return (await c.query(`DELETE FROM users WHERE email LIKE 'deep-%@example.test'`)).rowCount;
  } finally { await c.end(); }
}

const call = async (who, method, url, body) => {
  const r = await fetch(`${API}${url}`, {
    method, headers: { ...(who?.token ? { Authorization: `Bearer ${who.token}` } : {}), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const register = async (tag) => (await fetch(`${API}/auth/register`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: `Deep ${tag}`, email: `deep-${tag}-${stamp}@example.test`, password: PASS }),
})).json();
const member = async (owner, tag, role) => {
  const inv = await call(owner, 'POST', '/admin/users', { name: `Deep ${tag}`, email: `deep-${tag}-${stamp}@example.test`, role });
  if (!inv.body?.invite?.token) return { error: inv.body?.error || inv.status };
  const acc = await call(null, 'POST', '/auth/accept-invite', { token: inv.body.invite.token, password: PASS });
  return { token: acc.body?.token, id: inv.body.user?.id };
};

(async () => {
  await cleanup();
  const A = await register('a'), B = await register('b');
  try {
    await call(A, 'PUT', '/company-profile', { name: 'Deep Fab Works', gstin: '36ABCDE1234F1Z9', stateCode: '36', setup_completed_at: new Date().toISOString() });
    await call(B, 'PUT', '/company-profile', { name: 'Other Co', setup_completed_at: new Date().toISOString() });
    const custId = (await call(A, 'POST', '/customers', { name: `Apollo ${stamp}`, state: 'Telangana', shipping_state: 'Telangana', phone: '9876543210' })).body.id;
    const ka = (await call(A, 'POST', '/customers', { name: `Karnataka Buyer ${stamp}`, state: 'Karnataka', shipping_state: 'Karnataka', gstin: '29AAACB1234B1Z5' })).body.id;
    const plate = (await call(A, 'POST', '/raw-materials', { name: `MS plate ${stamp}`, unit: 'kg', base_uom: 'kg', standard_rate: 60 })).body.id;
    const bracket = (await call(A, 'POST', '/skus', { sku_code: `BR-${stamp}`, name: `Bracket ${stamp}`, unit: 'nos', price: 500, hsn: '7326' })).body.id;
    const gate = (await call(A, 'POST', '/skus', { sku_code: `GT-${stamp}`, name: `Gate ${stamp}`, unit: 'nos', price: 9000, hsn: '7308' })).body.id;
    await call(A, 'PUT', `/skus/${bracket}/bom`, { lines: [{ rawMaterialId: plate, qtyPerUnit: 10, uom: 'kg' }] });
    await call(A, 'PUT', `/skus/${gate}/bom`, { lines: [{ rawMaterialId: plate, qtyPerUnit: 10, uom: 'kg' }] });
    const vend = (await call(A, 'POST', '/vendors', { name: `Deccan ${stamp}`, type: 'Supplier' })).body.id;

    /* ── enquiries ─────────────────────────────────────────────── */
    section('an enquiry logged by hand, matched to the customer it comes from');
    const enq = await call(A, 'POST', '/enquiries', { name: 'Ravi', company: `Apollo ${stamp}`, phone: '+91 98765 43210', source: 'phone',
      items: [{ skuId: bracket, description: `Bracket ${stamp}`, quantity: 5, unit: 'nos' }] });
    ok(enq.status === 200 && /^ENQ-/.test(enq.body.ref || ''), `a phoned-in enquiry is logged (${enq.body.ref || enq.status})`);
    const enqNoLines = await call(A, 'POST', '/enquiries', { name: 'X', items: [] });
    ok(enqNoLines.status === 400, 'one with nothing asked for is refused');
    const enqView = (await call(A, 'GET', `/enquiries/${enq.body.id}`)).body;
    ok(enqView.likelyCustomer?.id === custId, `it is recognised as Apollo, already a customer (same phone) (${enqView.likelyCustomer?.name})`);
    const conv1 = await call(A, 'POST', `/enquiries/${enq.body.id}/convert`, { customerId: custId });
    ok(conv1.status === 200 && conv1.body.customerId === custId && conv1.body.existingCustomer === true, 'converting it quotes to Apollo, no second Apollo is made');
    const conv2 = await call(A, 'POST', `/enquiries/${enq.body.id}/convert`, {});
    ok(conv2.status === 200 && conv2.body.customerId === custId && conv2.body.prefill?.items?.length === 1, 'the quotation builder was closed: converting again hands back the same prefill');
    const custCount = (await q('SELECT COUNT(*)::int AS n FROM customers WHERE owner_id = $1', [A.user.id]))[0].n;
    ok(custCount === 2, `still two customers, not three (${custCount})`);
    const enqB = await call(B, 'GET', `/enquiries/${enq.body.id}`);
    ok(enqB.status === 404, 'another company cannot read it');

    section('quotation → order: HSN carried, PO ref left for the customer, enquiry won');
    const qt = (await call(A, 'POST', '/sales-quotations', { customerId: custId, enquiryId: enq.body.id, gstRate: 18,
      items: [{ skuId: bracket, description: `Bracket ${stamp}`, hsn: '7326', quantity: 5, rate: 500, uom: 'nos' }] })).body;
    const conv3 = await call(A, 'POST', `/enquiries/${enq.body.id}/convert`, {});
    ok(conv3.status === 409 && /already quoted on/.test(conv3.body.error || ''), `once quoted, the enquiry points to the quotation (${conv3.body.error})`);
    const draftAnswer = await call(A, 'POST', `/sales-quotations/${qt.id}/share-link`);
    await call(A, 'PATCH', `/sales-quotations/${qt.id}/status`, { status: 'Draft' });
    const respondDraft = await call(null, 'POST', `/public/quotations/${draftAnswer.body.token}/respond`, { decision: 'accept', name: 'Ravi' });
    ok(respondDraft.status !== 200, `a quotation set back to Draft can't be accepted online meanwhile (${respondDraft.status})`);
    await call(A, 'PATCH', `/sales-quotations/${qt.id}/status`, { status: 'Accepted' });
    const co = (await call(A, 'POST', `/sales-quotations/${qt.id}/convert`)).body;
    const coRow = (await q('SELECT customer_po_ref FROM customer_orders WHERE id = $1', [co.orderId]))[0];
    const coLine = (await q('SELECT hsn, rate, amount FROM customer_order_items WHERE customer_order_id = $1', [co.orderId]))[0];
    ok(coRow.customer_po_ref == null, `the order's customer PO ref is left empty, not our quotation number (${coRow.customer_po_ref})`);
    ok(coLine.hsn === '7326' && near(coLine.amount, 2500), `the line keeps its HSN and amount (${coLine.hsn}, ${coLine.amount})`);
    const enqAfter = (await q('SELECT status FROM enquiries WHERE id = $1', [enq.body.id]))[0];
    ok(enqAfter.status === 'Won', `the enquiry is Won (${enqAfter.status})`);
    const delConverted = await call(A, 'DELETE', `/sales-quotations/${qt.id}`);
    ok(delConverted.status === 409, 'a quotation that became an order cannot be deleted');
    const enq2 = (await call(A, 'POST', '/enquiries', { name: 'Walk-in', items: [{ description: 'Grill', quantity: 1 }] })).body;
    await call(A, 'POST', `/enquiries/${enq2.id}/convert`, { newCustomer: true });
    const qt2 = (await call(A, 'POST', '/sales-quotations', { customerId: custId, enquiryId: enq2.id, gstRate: 18, items: [{ description: 'Grill', quantity: 1, rate: 100 }] })).body;
    const delQt2 = await call(A, 'DELETE', `/sales-quotations/${qt2.id}`);
    const enq2After = (await q('SELECT quotation_id FROM enquiries WHERE id = $1', [enq2.id]))[0];
    ok(delQt2.status === 200 && enq2After.quotation_id == null, 'a quotation made from an enquiry can be deleted; the enquiry waits for a new one');

    /* ── orders ────────────────────────────────────────────────── */
    section('orders: edited, with their documents, deleted only when bare');
    const ord = (await call(A, 'POST', '/customer-orders', { customerId: custId, items: [
      { skuId: gate, description: `Gate ${stamp}`, quantity: 2, unit: 'nos', rate: 9000 },
      { description: `MS plate cut ${stamp}`, quantity: 1000, unit: 'kg', rate: 70 },
    ] })).body;
    const ed1 = await call(A, 'PATCH', `/customer-orders/${ord.id}`, { customerPoRef: 'APL/PO/77' });
    const ordV = (await call(A, 'GET', `/customer-orders/${ord.id}`)).body;
    ok(ed1.status === 200 && ordV.customer_po_ref === 'APL/PO/77', 'the customer PO number is added after the order was keyed in');
    ok(Array.isArray(ordV.documents?.challans) && ordV.items?.every(i => 'dispatched' in i && 'billed' in i), 'the order lists its documents and each line says how much is sent and billed');

    section('challans: only what is left, per line, a pull-back re-opens the order');
    await call(A, 'POST', '/inventory', { skuId: gate, itemName: `Gate ${stamp}`, quantity: 5, uom: 'nos' });
    const pre1 = (await call(A, 'GET', `/delivery-challans/prefill/${ord.id}`)).body;
    ok(pre1.items?.length === 2 && pre1.items.find(i => i.skuId === gate)?.hsn === '7308', 'the challan prefill carries both lines, and the product\'s HSN');
    const over = await call(A, 'POST', '/delivery-challans', { customerId: custId, customerOrderId: ord.id, challanDate: today,
      items: [{ skuId: gate, description: `Gate ${stamp}`, quantity: 3, uom: 'nos', rate: 9000 }] });
    ok(over.status === 409 && /ordered 2 nos/.test(over.body.error || ''), `3 gates on an order for 2 is refused (${(over.body.error || '').slice(0, 70)}…)`);
    const plateOver = await call(A, 'POST', '/delivery-challans', { customerId: custId, customerOrderId: ord.id, challanDate: today,
      items: [{ description: `MS plate cut ${stamp}`, quantity: 1020, uom: 'kg', rate: 70 }] });
    ok(plateOver.status === 200, '1,020 kg of plate on an order for 1,000 kg is fine (weight runs over)');
    const disp1 = await call(A, 'PATCH', `/delivery-challans/${plateOver.body.id}/status`, { status: 'Dispatched' });
    const ordAfterPlate = (await call(A, 'GET', `/customer-orders/${ord.id}`)).body;
    ok(disp1.status === 200 && ordAfterPlate.status === 'Partially Delivered', `with no gate sent the order is Partially Delivered, not Delivered (${ordAfterPlate.status})`);
    const pre2 = (await call(A, 'GET', `/delivery-challans/prefill/${ord.id}`)).body;
    ok(pre2.items?.length === 1 && pre2.items[0].skuId === gate && Number(pre2.items[0].quantity) === 2, 'the next challan offers only the 2 gates still to go');
    const d1 = (await call(A, 'POST', '/delivery-challans', { customerId: custId, customerOrderId: ord.id, challanDate: today,
      items: [{ skuId: gate, description: `Gate ${stamp}`, quantity: 2, uom: 'nos', rate: 9000 }] })).body;
    const d2 = (await call(A, 'POST', '/delivery-challans', { customerId: custId, customerOrderId: ord.id, challanDate: today,
      items: [{ skuId: gate, description: `Gate ${stamp}`, quantity: 2, uom: 'nos', rate: 9000 }] })).body;
    const dd1 = await call(A, 'PATCH', `/delivery-challans/${d1.id}/status`, { status: 'Dispatched' });
    const dd2 = await call(A, 'PATCH', `/delivery-challans/${d2.id}/status`, { status: 'Dispatched' });
    ok(dd1.status === 200 && dd2.status === 409, 'two drafts for the same 2 gates: the first goes, the second is refused at dispatch');
    const ordDel = (await call(A, 'GET', `/customer-orders/${ord.id}`)).body;
    ok(ordDel.status === 'Delivered', `every line sent: Delivered (${ordDel.status})`);
    const ed2 = await call(A, 'PATCH', `/customer-orders/${ord.id}`, { items: ordDel.items.map(i => ({ id: i.id, skuId: i.sku_id, description: i.description, quantity: i.sku_id ? 1 : i.quantity, unit: i.unit, rate: i.rate })) });
    ok(ed2.status === 409 && /already been sent/.test(ed2.body.error || ''), `a line can't go below what has been sent (${ed2.body.error})`);
    const back = await call(A, 'PATCH', `/delivery-challans/${d1.id}/status`, { status: 'Draft' });
    const ordBack = (await call(A, 'GET', `/customer-orders/${ord.id}`)).body;
    ok(back.status === 200 && ordBack.status === 'Partially Delivered', `the gates' challan pulled back: the order is no longer Delivered (${ordBack.status})`);
    const backPlate = await call(A, 'PATCH', `/delivery-challans/${plateOver.body.id}/status`, { status: 'Draft' });
    const ordOpen = (await call(A, 'GET', `/customer-orders/${ord.id}`)).body;
    ok(backPlate.status === 200 && ordOpen.status === 'Open', `nothing sent any more: back to Open (${ordOpen.status})`);
    await call(A, 'PATCH', `/delivery-challans/${d1.id}/status`, { status: 'Dispatched' });

    section('an order with documents is not deleted; a bare one frees its quotation');
    const delOrd = await call(A, 'DELETE', `/customer-orders/${ord.id}`);
    ok(delOrd.status === 409 && /challan/.test(delOrd.body.error || ''), `refused, naming what hangs off it (${(delOrd.body.error || '').slice(0, 60)}…)`);
    const qt3 = (await call(A, 'POST', '/sales-quotations', { customerId: custId, gstRate: 18, items: [{ description: 'Railing', quantity: 1, rate: 100 }] })).body;
    await call(A, 'PATCH', `/sales-quotations/${qt3.id}/status`, { status: 'Accepted' });
    const co3 = (await call(A, 'POST', `/sales-quotations/${qt3.id}/convert`)).body;
    const delBare = await call(A, 'DELETE', `/customer-orders/${co3.orderId}`);
    const qt3After = (await q('SELECT status, converted_order_id FROM sales_quotations WHERE id = $1', [qt3.id]))[0];
    ok(delBare.status === 200 && qt3After.converted_order_id == null && qt3After.status === 'Accepted', 'a bare order is deleted and its quotation can be converted again');

    /* ── invoices, payments, notes ─────────────────────────────── */
    section('invoices: drafts delete, issued ones cancel; a double payment is asked about');
    const pre = (await call(A, 'GET', `/sales-invoices/prefill/${ord.id}`)).body;
    const inv = (await call(A, 'POST', '/sales-invoices', { customerId: custId, customerOrderId: ord.id, invoiceDate: today, gstRate: 18,
      items: pre.items.filter(i => /Gate/.test(i.description)) })).body;
    await call(A, 'PATCH', `/sales-invoices/${inv.id}/status`, { status: 'Sent' });
    const delSent = await call(A, 'DELETE', `/sales-invoices/${inv.id}`);
    ok(delSent.status === 409 && /Cancel it instead/.test(delSent.body.error || ''), 'a sent invoice is not deleted (its number is on record)');
    const p1 = await call(A, 'POST', `/sales-invoices/${inv.id}/payment`, { amount: 1000, mode: 'Bank' });
    const p2 = await call(A, 'POST', `/sales-invoices/${inv.id}/payment`, { amount: 1000, mode: 'Bank' });
    const p3 = await call(A, 'POST', `/sales-invoices/${inv.id}/payment`, { amount: 1000, mode: 'Bank', confirmDuplicate: true });
    ok(p1.status === 200 && p2.status === 409 && p2.body.duplicate && p3.status === 200, 'the same amount twice in two minutes is asked about, and recorded when confirmed');

    const handOrd = (await call(A, 'POST', '/customer-orders', { customerId: custId, items: [{ description: `Hand job ${stamp}`, quantity: 1, unit: 'nos', rate: 100 }] })).body;
    await call(A, 'PATCH', `/customer-orders/${handOrd.id}/status`, { status: 'Delivered' });
    const hpf = (await call(A, 'GET', `/sales-invoices/prefill/${handOrd.id}`)).body;
    await call(A, 'POST', '/sales-invoices', { customerId: custId, customerOrderId: handOrd.id, invoiceDate: today, gstRate: 18, items: hpf.items });
    const handAfter = (await call(A, 'GET', `/customer-orders/${handOrd.id}`)).body;
    ok(handAfter.status === 'Delivered', `an order marked Delivered by hand (no challans) stays Delivered when invoiced (${handAfter.status})`);

    const noState = (await call(A, 'POST', '/customers', { name: `Stateless ${stamp}` })).body.id;
    const igInv = (await call(A, 'POST', '/sales-invoices', { customerId: noState, invoiceDate: today, gstRate: 18, interstate: true,
      items: [{ description: 'Service', quantity: 1, rate: 1000, uom: 'nos' }] })).body;
    const igEdit = await call(A, 'PATCH', `/sales-invoices/${igInv.id}`, { items: [{ description: 'Service', quantity: 2, rate: 1000, uom: 'nos' }] });
    const igAfter = (await call(A, 'GET', `/sales-invoices/${igInv.id}`)).body;
    ok(igEdit.status === 200 && Number(igAfter.igst) === 360 && Number(igAfter.cgst) === 0, `IGST picked by hand (no state to decide it) stays IGST when the draft is edited (IGST ${igAfter.igst}, CGST ${igAfter.cgst})`);
    /* The edit form sends the IGST/CGST choice with every save. That was
       refused as "This invoice has been issued" — on a draft — so no draft
       could be saved from the form at all (fixed 24 Nov). */
    const formSave = await call(A, 'PATCH', `/sales-invoices/${igInv.id}`, { invoice_number: igAfter.invoice_number, interstate: false, notes: 'Saved from the form',
      items: [{ description: 'Service', quantity: 2, rate: 1000, uom: 'nos' }] });
    const fsAfter = (await call(A, 'GET', `/sales-invoices/${igInv.id}`)).body;
    ok(formSave.status === 200, `a draft saved from the edit form, with its IGST/CGST choice, is accepted (${formSave.status}${formSave.body.error ? `: ${formSave.body.error}` : ''})`);
    ok(Number(fsAfter.cgst) === 180 && Number(fsAfter.igst) === 0 && fsAfter.notes === 'Saved from the form', `with no state to decide it, the choice made on the form stands (CGST ${fsAfter.cgst}, IGST ${fsAfter.igst})`);
    const stated = (await call(A, 'POST', '/sales-invoices', { customerId: custId, invoiceDate: today, gstRate: 18,
      items: [{ description: 'Service', quantity: 1, rate: 1000, uom: 'nos' }] })).body;
    const statedBefore = (await call(A, 'GET', `/sales-invoices/${stated.id}`)).body;
    const statedSave = await call(A, 'PATCH', `/sales-invoices/${stated.id}`, { interstate: !statedBefore.interstate, items: [{ description: 'Service', quantity: 1, rate: 1000, uom: 'nos' }] });
    const statedAfter = (await call(A, 'GET', `/sales-invoices/${stated.id}`)).body;
    ok(statedSave.status === 200 && statedAfter.interstate === statedBefore.interstate, 'when the states decide it, the form cannot overrule them');
    const issuedTry = await call(A, 'PATCH', `/sales-invoices/${inv.id}`, { interstate: true });
    ok(issuedTry.status === 409 || issuedTry.status === 404, `an issued or cancelled invoice still refuses it (${issuedTry.status})`);
    await call(A, 'DELETE', `/sales-invoices/${stated.id}`);
    await call(A, 'DELETE', `/sales-invoices/${igInv.id}`);

    section('credit notes: found by id, same customer, capped, taxed like the original');
    const net = Number(inv.net);
    const cnBig = await call(A, 'POST', '/credit-debit-notes', { noteType: 'credit', partyType: 'customer', partyId: custId, refId: inv.id,
      noteDate: today, reason: 'x', gstRate: 5, items: [{ description: 'Gate', quantity: 10, rate: 9000 }] });
    ok(cnBig.status === 409, `more than the invoice is refused (${(cnBig.body.error || '').slice(0, 60)}…)`);
    const cnNeg = await call(A, 'POST', '/credit-debit-notes', { noteType: 'credit', partyType: 'customer', partyId: custId, refId: inv.id,
      noteDate: today, items: [{ description: 'Gate', quantity: -1, rate: 9000 }] });
    ok(cnNeg.status === 400, 'a negative line is refused');
    const cnWrong = await call(A, 'POST', '/credit-debit-notes', { noteType: 'credit', partyType: 'customer', partyId: ka, refId: inv.id,
      noteDate: today, items: [{ description: 'Gate', quantity: 1, rate: 100 }] });
    ok(cnWrong.status === 400, "another customer's invoice can't be named");
    const cn = await call(A, 'POST', '/credit-debit-notes', { noteType: 'credit', partyType: 'customer', partyId: custId, refId: inv.id,
      noteDate: today, reason: 'one gate short', gstRate: 5, items: [{ description: `Gate ${stamp}`, quantity: 1, rate: 9000 }] });
    const cnV = (await call(A, 'GET', `/credit-debit-notes/${cn.body.id}`)).body;
    ok(cn.status === 200 && cnV.ref_number === inv.invoiceNumber && cnV.ref_date, `named by id, it prints the invoice's number and date (${cnV.ref_number})`);
    ok(Number(cnV.gst_rate) === 18 && near(cnV.total, 10620), `taxed at the invoice's 18%, not the 5% sent (₹${cnV.total})`);
    const dash = (await call(A, 'GET', '/dashboard')).body.sales;
    const expectOwed = net - 2000 - 10620 + 118;     // + the hand-delivered order's ₹118 invoice
    ok(near(dash.outstanding, expectOwed, 1), `the dashboard's outstanding takes the credit note off (₹${dash.outstanding} = ${net} − 2,000 − 10,620 + 118)`);
    const invList = (await call(A, 'GET', '/sales-invoices?limit=50')).body.summary;
    ok(near(invList.outstanding, expectOwed, 1), `so does the invoice list (₹${invList.outstanding})`);

    /* ── buying ────────────────────────────────────────────────── */
    section('buying: per-line receipts, units as vendors write them, bills that keep their money');
    const bolt = (await call(A, 'POST', '/raw-materials', { name: `Bolt M10 ${stamp}`, unit: 'nos', base_uom: 'nos', standard_rate: 6 })).body.id;
    const po = (await call(A, 'POST', '/po', { vendorId: vend, itemName: 'Plate and bolts', quantity: 1020, unitPrice: 60, gstRate: 18,
      items: [{ description: `MS plate ${stamp}`, quantity: 1000, unitPrice: 60, uom: 'Kgs', rawMaterialId: plate },
              { description: `Bolt M10 ${stamp}`, quantity: 20, unitPrice: 6, uom: "No's", rawMaterialId: bolt }] })).body;
    ok(po.id, 'a PO without line numbers and with "Kgs" / "No\'s" is saved (it was a raw database error)');
    const lines = await q('SELECT id, sno, uom, uom_code FROM po_line_items WHERE "poId" = $1 ORDER BY sno', [po.id]);
    ok(lines.map(l => l.sno).join() === '1,2' && lines[0].uom_code === 'kg' && lines[1].uom_code === 'nos', `lines numbered 1, 2; units kept as kg and nos (${lines.map(l => `${l.uom}/${l.uom_code}`).join(', ')})`);
    await call(A, 'PATCH', `/po/${po.id}/approve`); await call(A, 'PATCH', `/po/${po.id}/dispatch`);
    const g0 = await call(A, 'POST', '/grn', { poId: po.id, poLineItemId: lines[0].id, receivedQuantity: 0 });
    ok(g0.status === 400, 'a receipt of 0 is refused');
    const g1 = await call(A, 'POST', '/grn', { poId: po.id, poLineItemId: lines[0].id, receivedQuantity: 1020 });
    const poAfter = (await q('SELECT status FROM purchase_orders WHERE id = $1', [po.id]))[0];
    ok(g1.status === 200 && poAfter.status === 'Partially Received', `1,020 kg of plate with no bolts yet: Partially Received, not Delivered (${poAfter.status})`);
    const g2 = await call(A, 'POST', '/grn', { poId: po.id, poLineItemId: lines[1].id, receivedQuantity: 20 });
    const poDone = (await q('SELECT status FROM purchase_orders WHERE id = $1', [po.id]))[0];
    ok(g2.status === 200 && poDone.status === 'Delivered', `the bolts arrive too: Delivered (${poDone.status})`);
    const bpf = (await call(A, 'GET', `/grn-bills/prefill/${g1.body.grnId || g1.body.id}`)).body;
    ok(Number(bpf.items?.[0]?.quantity) === 1020, `the bill opens at what arrived, 1,020 (${bpf.items?.[0]?.quantity})`);
    const bill = (await call(A, 'POST', '/grn-bills', { grnId: g1.body.grnId || g1.body.id, poId: po.id, vendorId: vend, billDate: today, gstRate: 18, items: bpf.items })).body;
    const paidStatus = await call(A, 'PATCH', `/grn-bills/${bill.id}/status`, { status: 'Paid' });
    ok(paidStatus.status === 400, 'a bill cannot be set to Paid by hand');
    const vp1 = await call(A, 'POST', `/grn-bills/${bill.id}/payment`, { amount: 5000, mode: 'Bank' });
    const vp2 = await call(A, 'POST', `/grn-bills/${bill.id}/payment`, { amount: 5000, mode: 'Bank' });
    ok(vp1.status === 200 && vp2.status === 409 && vp2.body.duplicate, 'a second ₹5,000 straight after is asked about');
    const delPaidBill = await call(A, 'DELETE', `/grn-bills/${bill.id}`);
    ok(delPaidBill.status === 409, 'a bill money has gone against is not deleted');
    const pays = (await call(A, 'GET', `/grn-bills/${bill.id}/payments`)).body;
    const rev = await call(A, 'DELETE', `/grn-bills/${bill.id}/payments/${list(pays)[0]?.id}`, { reason: 'typed against the wrong bill' });
    ok(rev.status === 200 && rev.body.paymentStatus === 'Unpaid', `the payment is reversed with a reason; the bill is Unpaid again (${rev.body.paymentStatus})`);
    const delVendor = await call(A, 'DELETE', `/vendors/${vend}`);
    ok(delVendor.status === 409 && /purchase order/.test(delVendor.body.error || ''), 'a vendor with purchase orders is not deleted');

    section('sign-off: counted, and a rejected PO is not "on order"');
    await call(A, 'PUT', '/automation-settings', { po_approval_threshold: 1000 });
    const big = (await call(A, 'POST', '/po', { vendorId: vend, itemName: `MS plate ${stamp}`, quantity: 500, unitPrice: 60,
      items: [{ description: `MS plate ${stamp}`, quantity: 500, unitPrice: 60, uom: 'kg', rawMaterialId: plate }] })).body;
    const poSum = (await call(A, 'GET', '/po?limit=50')).body.summary;
    ok(Number(poSum?.awaiting_approval) >= 1, `the PO waiting for sign-off is counted (${poSum?.awaiting_approval})`);
    const before = list((await call(A, 'GET', '/material-requirements')).body).find(m => m.raw_material_id === plate);
    await call(A, 'PATCH', `/po/${big.id}/approval`, { decision: 'Rejected' });
    const after = list((await call(A, 'GET', '/material-requirements')).body).find(m => m.raw_material_id === plate);
    ok(Number(after?.on_order ?? 0) <= Number(before?.on_order ?? 0) - 499, `rejected, it stops counting as on order (${before?.on_order} → ${after?.on_order})`);

    /* ── stock ─────────────────────────────────────────────────── */
    section('stock: cost averages, 4 places, units fixed once moved');
    const rows = list((await call(A, 'GET', '/inventory?limit=100')).body);
    const plateRow = rows.find(r => r.raw_material_id === plate);
    ok(near(plateRow?.unit_cost, 60, 0.01), `1,020 kg received at ₹60 costs ₹60 (${plateRow?.unit_cost})`);
    const po2 = (await call(A, 'POST', '/po', { vendorId: vend, itemName: `MS plate ${stamp}`, quantity: 1020, unitPrice: 75,
      items: [{ description: `MS plate ${stamp}`, quantity: 1020, unitPrice: 75, uom: 'kg', rawMaterialId: plate }] })).body;
    await call(A, 'PATCH', `/po/${po2.id}/approval`, { decision: 'Approved' });
    await call(A, 'PATCH', `/po/${po2.id}/approve`); await call(A, 'PATCH', `/po/${po2.id}/dispatch`);
    await call(A, 'POST', '/grn', { poId: po2.id, receivedQuantity: 1020 });
    const plateRow2 = list((await call(A, 'GET', '/inventory?limit=100')).body).find(r => r.id === plateRow.id);
    ok(near(plateRow2?.unit_cost, 67.5, 0.01), `another 1,020 kg at ₹75 averages to ₹67.50 (${plateRow2?.unit_cost})`);
    const nutRm = (await call(A, 'POST', '/raw-materials', { name: `Nut M10 ${stamp}`, unit: 'nos', standard_rate: 2 })).body.id;
    await call(A, 'POST', '/inventory', { rawMaterialId: nutRm, quantity: 100, uom: 'nos', unitCost: 2 });
    await call(A, 'POST', '/inventory', { rawMaterialId: nutRm, quantity: 100, uom: 'nos', unitCost: 4 });
    const nutRow = list((await call(A, 'GET', '/inventory?limit=100')).body).find(r => r.raw_material_id === nutRm);
    ok(nutRow && near(nutRow.quantity, 200) && near(nutRow.unit_cost, 3), `stock added by hand averages too: 100 at ₹2 + 100 at ₹4 = 200 at ₹3 (${nutRow?.quantity} at ₹${nutRow?.unit_cost})`);
    const negStock = await call(A, 'POST', '/inventory', { itemName: `Neg ${stamp}`, quantity: -50, uom: 'nos' });
    ok(negStock.status === 400, 'opening stock of −50 is refused, not turned into +50');
    const uomChange = await call(A, 'PATCH', `/inventory/${plateRow.id}`, { uom: 'nos' });
    ok(uomChange.status === 409, 'a stock row with movements cannot change kg to nos');

    /* ── production ────────────────────────────────────────────── */
    section('production: numbered, Make once, output costed, jobs not deleted with stock moved');
    const bo = (await call(A, 'POST', '/customer-orders', { customerId: custId, items: [{ skuId: bracket, description: `Bracket ${stamp}`, quantity: 10, unit: 'nos', rate: 500 }] })).body;
    const boLine = (await call(A, 'GET', `/customer-orders/${bo.id}`)).body.items[0];
    const mk1 = await call(A, 'POST', `/production/from-order-item/${boLine.id}`, { quantity: 6 });
    const mk2 = await call(A, 'POST', `/production/from-order-item/${boLine.id}`, {});
    const mk3 = await call(A, 'POST', `/production/from-order-item/${boLine.id}`, { again: true });
    ok(mk1.status === 200 && mk2.status === 409 && Number(mk2.body.remaining) === 4, `Make again is asked about, with 4 still unplanned (${mk2.status}, ${mk2.body.remaining})`);
    ok(mk3.status === 200 && Number(mk3.body.plannedQty) === 4, `"start another for the rest" plans the remaining 4 (${mk3.body.plannedQty})`);
    ok(mk1.body.prodNumber !== mk3.body.prodNumber, `two jobs, two numbers (${mk1.body.prodNumber}, ${mk3.body.prodNumber})`);
    const boAfter = (await call(A, 'GET', `/customer-orders/${bo.id}`)).body;
    ok(boAfter.status === 'In Production', `the order is In Production (${boAfter.status})`);
    const issue = await call(A, 'POST', `/production/${mk1.body.id}/consumption`, { inventoryId: plateRow.id, itemName: `MS plate ${stamp}`, consumedQty: 60.125, uom: 'kg' });
    const plateRow3 = list((await call(A, 'GET', '/inventory?limit=100')).body).find(r => r.id === plateRow.id);
    ok(issue.status === 200 && near(plateRow3.quantity, 2040 - 60.125, 0.00005), `60.125 kg issued leaves exactly ${2040 - 60.125} kg (${plateRow3.quantity})`);
    const outNeg = await call(A, 'POST', `/production/${mk1.body.id}/output`, { outputQty: -2, uom: 'nos' });
    ok(outNeg.status === 400, 'a negative output is refused');
    const out = await call(A, 'POST', `/production/${mk1.body.id}/output`, { outputQty: 6, uom: 'nos' });
    const fg = list((await call(A, 'GET', '/inventory?limit=100')).body).find(r => r.sku_id === bracket);
    ok(out.status === 200 && Number(fg?.unit_cost) > 0, `output goes into stock as the product, at its material cost (₹${fg?.unit_cost} each)`);
    const delJob = await call(A, 'DELETE', `/production/${mk1.body.id}`);
    ok(delJob.status === 409, 'a job that moved stock is not deleted');
    const cons = (await call(A, 'GET', `/production/${mk1.body.id}`)).body.consumption[0];
    const [r1, r2] = await Promise.all([
      call(A, 'DELETE', `/production/consumption/line/${cons.id}`), call(A, 'DELETE', `/production/consumption/line/${cons.id}`)]);
    const plateRow4 = list((await call(A, 'GET', '/inventory?limit=100')).body).find(r => r.id === plateRow.id);
    ok([r1.status, r2.status].sort().join() === '200,404' && near(plateRow4.quantity, 2040, 0.00005), `Remove clicked twice at once puts the material back once (${r1.status}, ${r2.status}; ${plateRow4.quantity} kg)`);
    const free = await call(A, 'POST', '/production', { skuId: gate, plannedQty: 3 });
    const freeRow = (await q('SELECT sku_id, product_name FROM production_orders WHERE id = $1', [free.body.id]))[0];
    ok(freeRow?.sku_id === gate && /Gate/.test(freeRow.product_name), 'a production order started from the Production screen can be for a product');

    /* ── readiness ─────────────────────────────────────────────── */
    section('readiness: lines share the stock, unconvertible units are said, not green');
    const ro = (await call(A, 'POST', '/customer-orders', { customerId: custId, items: [
      { skuId: gate, description: `Gate ${stamp}`, quantity: 150, unit: 'nos', rate: 1 },
      { skuId: bracket, description: `Bracket ${stamp}`, quantity: 150, unit: 'nos', rate: 1 },
    ] })).body;
    const rd = (await call(A, 'GET', `/customer-orders/${ro.id}/readiness`)).body;
    const sum = (rd.lines || []).reduce((s, l) => s + l.buildable, 0);
    ok(sum <= 205 && rd.blocked > 0, `the two lines share the plate: ${sum} buildable in all, not both the full amount (${rd.summary})`);
    const rdB = await call(B, 'GET', `/customer-orders/${ro.id}/readiness`);
    ok(rdB.status === 404, "another company asking about this order gets 'not found'");
    const nb = (await call(A, 'POST', '/skus', { name: `No BOM ${stamp}`, unit: 'nos', price: 1 })).body.id;
    const nbo = (await call(A, 'POST', '/customer-orders', { customerId: custId, items: [{ skuId: nb, description: `No BOM ${stamp}`, quantity: 1, unit: 'nos', rate: 1 }] })).body;
    const nbr = (await call(A, 'GET', `/customer-orders/${nbo.id}/readiness`)).body;
    ok(nbr.missingBom?.[0]?.skuId === nb, 'with no bill of materials, readiness names the product that needs one');

    /* ── masters, admin, categories ────────────────────────────── */
    section('masters: names, prices and codes checked; "in use" says where');
    ok((await call(A, 'POST', '/skus', { name: '', price: -5 })).status === 400, 'a product with no name is refused');
    ok((await call(A, 'POST', '/skus', { name: 'Neg', price: -5 })).status === 400, 'a negative price is refused');
    ok((await call(A, 'POST', '/skus', { sku_code: `br-${stamp}`, name: 'Dup' })).status === 409, 'a product code already used (any case) is refused');
    ok((await call(A, 'POST', '/customers', { name: '' })).status === 400, 'a customer with no name is a 400, not a database error');
    const inUse = await call(A, 'DELETE', `/customers/${custId}`);
    ok(inUse.status === 409 && /orders|invoices|quotations|enquiries/.test(inUse.body.error || ''), `deleting a customer in use says where (${inUse.body.error})`);
    ok((await call(A, 'DELETE', `/skus/${bracket}`)).status === 409, 'a product with production orders is not deleted');
    ok((await call(A, 'POST', '/expenses', { description: 'tea', amount: -10 })).status === 400, 'an expense of −10 is refused');

    section('user admin: the founder is safe, other companies stay out of sight');
    const boss = await member(A, 'owner2', 'Owner');
    const sales = await member(A, 'sales', 'Sales');
    ok(!!boss.token && !!sales.token, 'an Owner-role employee and a Sales employee join');
    const takeover = await call(boss, 'POST', `/admin/users/${A.user.id}/reset-password`, { password: 'newpassword123' });
    ok(takeover.status === 403, `an Owner-role employee cannot set the founder's password (${takeover.status})`);
    const self = await call(boss, 'POST', `/admin/users/${boss.id}/reset-password`, { password: 'newpassword123' });
    ok(self.status === 400, 'nor their own, from here');
    const leak = await call(A, 'PATCH', `/admin/users/${sales.id}`, { reports_to: B.user.id });
    ok(leak.status === 400, 'a reports-to in another company is refused');
    const cat = await call(sales, 'POST', '/supply-categories', { name: `Fire doors ${stamp}`, kind: 'customer' });
    ok([200, 201].includes(cat.status), `Sales can add a customer category (${cat.status} ${cat.body.error || ''})`);

    section('numbers in words keep the paise');
    const words = require('../shared/amountInWords').amountInWords(11800.5);
    ok(words === 'Rupees Eleven Thousand Eight Hundred and Fifty Paise Only', `₹11,800.50 → "${words}"`);
  } catch (e) {
    fail++; console.log(`   ❌ stopped: ${e.stack?.split('\n').slice(0, 3).join(' | ')}`);
  } finally {
    const n = await cleanup().catch((e) => { console.log(`   ❌ cleanup failed: ${e.message}`); return -1; });
    ok(n > 0, `throwaway companies removed (${n} accounts)`);
    console.log(`\n   ${pass} passed, ${fail} failed\n`);
    process.exit(fail ? 1 : 0);
  }
})();
