#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   Editing on the page, part two: the delivery challan, the purchase order,
   the vendor bill and the credit/debit note (components/DocEdit, the same
   editor as the invoice and quotation — scripts/test-doc-edit-ui.cjs).

   What each lets you change follows where it has got to, and the server
   holds the line whatever the page sends:
     challan   draft: all of it · dispatched: transport, e-way bill, notes
     PO        pending: lines, GST, quote ref, terms · approved: ref, terms
     bill      draft: all of it · approved: vendor's invoice no., due, notes
     note      issued when made: reason, notes, the original's date (and its
               number when typed by hand) — the amounts stay; another note
               corrects them

   Builds its own throwaway company (dedit2-*@example.test) and removes it.
   Needs the backend (SCHEDULER=off) and vite. Refuses a deployed host.
   ══════════════════════════════════════════════════════════════════════ */
const puppeteer = require('puppeteer');
const path = require('path');
const B = path.join(__dirname, '../../backend');
require(path.join(B, 'node_modules/dotenv')).config({ path: path.join(B, '.env') });
const { Client } = require(path.join(B, 'node_modules/pg'));
const { purgeOrg } = require(path.join(B, 'scripts/lib/purgeOrg'));

const API = process.env.API_BASE || 'http://localhost:5099';
const UI = process.env.UI_BASE || 'http://localhost:5173';
if ([API, UI].some(u => /^https:|onrender\.com|vercel\.app|maksops\.co\.in/.test(u))) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}
const stamp = Date.now().toString(36);
const today = new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };
const section = (t) => console.log(`\n  ── ${t}`);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const db = () => new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const rows = async (sql, p) => { const c = db(); await c.connect(); try { return (await c.query(sql, p)).rows; } finally { await c.end(); } };
const money = (n) => Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function cleanup() {
  const c = db(); await c.connect();
  try {
    const { rows: r } = await c.query(`SELECT id FROM users WHERE email LIKE 'dedit2-%@example.test'`);
    const ids = r.map(x => x.id); if (!ids.length) return 0;
    for (let i = 0; i < 5; i++) { const x = await purgeOrg(c, ids); if (!x.deleted) break; }
    await c.query('DELETE FROM document_sequences WHERE owner_id = ANY($1)', [ids]).catch(() => {});
    await c.query('DELETE FROM notifications WHERE user_id = ANY($1)', [ids]).catch(() => {});
    return (await c.query(`DELETE FROM users WHERE id = ANY($1) AND email LIKE '%@example.test'`, [ids])).rowCount;
  } finally { await c.end(); }
}

(async () => {
  await cleanup();
  const reg = await (await fetch(`${API}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Doc Edit Two', email: `dedit2-${stamp}@example.test`, password: 'testpassword123' }) })).json();
  const H = { Authorization: `Bearer ${reg.token}`, 'Content-Type': 'application/json' };
  const api = async (m, u, b) => { const r = await fetch(`${API}${u}`, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, ...(await r.json().catch(() => ({}))) }; };
  let browser;
  try {
    await api('PUT', '/company-profile', { name: 'Edit Two Works Pvt Ltd', address: 'Plot 9, IDA Bowrampet, Hyderabad', gstin: '36ABCDE1234F1Z9', stateCode: '36', setup_completed_at: new Date().toISOString() });
    const cust = await api('POST', '/customers', { name: `Site Builders ${stamp}`, gstin: '36AAACS1234C1Z5', state: 'Telangana', shipping_state: 'Telangana', billing_address: 'Kukatpally, Hyderabad', shipping_address: 'Plot 7, Shamshabad' });
    const vend = await api('POST', '/vendors', { name: `Deccan Steels ${stamp}`, gstin: '36AABCD1234E1Z2', state: 'Telangana', type: 'Supplier' });
    const dcDraft = await api('POST', '/delivery-challans', { customerId: cust.id, challanDate: today, vehicleNo: 'TS09AB1234', items: [{ description: 'MS bracket', hsn: '7308', quantity: 40, uom: 'nos', rate: 450 }] });
    const dcGone = await api('POST', '/delivery-challans', { customerId: cust.id, challanDate: today, items: [{ description: 'Base plate', quantity: 10, uom: 'nos', rate: 700 }] });
    await api('PATCH', `/delivery-challans/${dcGone.id}/status`, { status: 'Dispatched' });
    const poOpen = await api('POST', '/po', { vendorId: vend.id, itemName: 'SS304 sheet', quantity: 100, gstRate: 18, items: [{ description: 'SS304 sheet 2 mm', uom: 'kg', quantity: 100, unitPrice: 260 }] });
    const poDone = await api('POST', '/po', { vendorId: vend.id, itemName: 'MS angle', quantity: 50, gstRate: 18, items: [{ description: 'MS angle 50x50x5', uom: 'kg', quantity: 50, unitPrice: 70 }] });
    await api('PATCH', `/po/${poDone.id}/approve`);
    const billDraft = await api('POST', '/grn-bills', { vendorId: vend.id, billDate: today, gstRate: 18, items: [{ description: 'SS304 sheet 2 mm', hsn: '7219', uom: 'kg', quantity: 100, rate: 260 }] });
    const billDone = await api('POST', '/grn-bills', { vendorId: vend.id, billDate: today, gstRate: 18, items: [{ description: 'MS angle', uom: 'kg', quantity: 50, rate: 70 }] });
    await api('PATCH', `/grn-bills/${billDone.id}/status`, { status: 'Approved' });
    const inv = await api('POST', '/sales-invoices', { customerId: cust.id, gstRate: 18, items: [{ description: 'MS bracket', quantity: 40, rate: 450 }] });
    await api('PATCH', `/sales-invoices/${inv.id}/status`, { status: 'Sent' });
    const noteLinked = await api('POST', '/credit-debit-notes', { noteType: 'credit', partyType: 'customer', partyId: cust.id, refId: inv.id, gstRate: 18, reason: 'Short supply', items: [{ description: 'MS bracket', quantity: 2, rate: 450 }] });
    const noteManual = await api('POST', '/credit-debit-notes', { noteType: 'credit', partyType: 'customer', partyId: cust.id, refNumber: 'OLD/22', gstRate: 18, reason: 'Rate difference', items: [{ description: 'Rate difference', quantity: 1, rate: 500 }] });
    const made = { dcDraft, dcGone, poOpen, poDone, billDraft, billDone, inv, noteLinked, noteManual };
    const missing = Object.entries(made).filter(([, x]) => !x.id).map(([k, x]) => `${k} (${x.status}: ${x.error || ''})`);
    ok(!missing.length, `a challan, POs, bills and notes to edit${missing.length ? ` — not made: ${missing.join('; ')}` : ''}`);

    section('The server holds the line');
    ok((await api('PATCH', `/delivery-challans/${dcGone.id}`, { items: [{ description: 'x', quantity: 1 }] })).status === 409, 'a dispatched challan refuses new lines');
    ok((await api('PATCH', `/po/${poDone.id}`, { gstRate: 5 })).status === 409, 'an approved PO refuses a new GST rate');
    ok((await api('PATCH', `/grn-bills/${billDone.id}`, { discount: 100 })).status === 409, 'an approved bill refuses a discount');
    ok((await api('PATCH', `/credit-debit-notes/${noteLinked.id}`, { ref_number: 'X/1' })).status === 409, 'a note linked to its invoice refuses a typed-in number');
    ok((await api('PATCH', `/credit-debit-notes/${noteLinked.id}`, { total: 1 })).status === 409, 'and no note takes new amounts');
    ok((await api('PATCH', `/delivery-challans/${dcDraft.id}`, { eway_bill_no: '12345' })).status === 400, 'an e-way bill number must be 12 digits');

    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    page.on('dialog', d => d.dismiss());
    await page.setViewport({ width: 1366, height: 1000 });
    await page.goto(`${UI}/login`);
    await page.evaluate((t, u) => { localStorage.setItem('nexus_token', t); localStorage.setItem('nexus_user', JSON.stringify(u)); localStorage.setItem('tutorial_seen', '1'); localStorage.setItem('nexus-theme', 'light'); localStorage.setItem('maks_app_dialogs', '1'); }, reg.token, reg.user);

    const go = async (u) => { await page.goto(`${UI}${u}`, { waitUntil: 'networkidle2' }); await page.waitForSelector('.doc-sheet, .invoice-mock', { timeout: 30000 }); await sleep(500); };
    const open = async () => { await page.click('[data-doc-edit]'); await page.waitForSelector('[data-de-bar]', { timeout: 8000 }); await sleep(250); };
    const typeIn = async (sel, text) => { await page.click(sel, { clickCount: 3 }); await page.keyboard.press('Backspace'); if (text !== '') await page.keyboard.type(String(text)); };
    const setDate = (sel, v) => page.evaluate((s, val) => { const i = document.querySelector(s); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, val); i.dispatchEvent(new Event('input', { bubbles: true })); }, sel, v);
    const save = async () => { await page.click('[data-de-save]'); await page.waitForFunction(() => !document.querySelector('[data-de-bar]'), { timeout: 15000 }).catch(() => {}); await sleep(600); };
    const has = (labels) => page.evaluate((ls) => ls.filter(l => document.querySelector(`[aria-label="${l}"]`)), labels);
    const barError = () => page.evaluate(() => document.querySelector('[data-de-error]')?.textContent || '');

    section('A draft delivery challan');
    await go(`/delivery-challans/${dcDraft.id}`);
    await open();
    const dcf = await has(['Challan number', 'Challan date', 'Ship To address', 'Dispatch through', 'Vehicle No.', 'LR / Docket', 'Place of supply', 'E-way Bill No.', 'Driver', 'Transporter GSTIN', 'Line 1 description', 'Line 1 quantity', 'Line 1 rate', 'Notes']);
    ok(dcf.length === 14, `every part of a draft challan is a field (${dcf.length} of 14)`);
    await typeIn('[aria-label="Vehicle No."]', 'ts10ab9999');
    await typeIn('[aria-label="LR / Docket"]', 'LR-5521');
    await typeIn('[aria-label="Line 1 quantity"]', '50');
    await page.click('[data-de-add-line]'); await sleep(300);
    await page.keyboard.type('Packing crate');
    await typeIn('[aria-label="Line 2 quantity"]', '2');
    await typeIn('[aria-label="Line 2 rate"]', '300');
    await sleep(200);
    ok((await page.evaluate(() => document.querySelector('[data-de-total]')?.textContent || '')).includes(money(50 * 450 + 600)), 'the total value follows the lines as they are typed');
    await typeIn('[aria-label="Notes"]', 'Deliver to gate 2');
    await save();
    const dcSrv = await api('GET', `/delivery-challans/${dcDraft.id}`);
    ok(dcSrv.vehicle_no === 'TS10AB9999' && dcSrv.lr_no === 'LR-5521' && dcSrv.notes === 'Deliver to gate 2', 'the server has the transport and notes (vehicle number in capitals)');
    ok(dcSrv.items?.length === 2 && Number(dcSrv.items[0].quantity) === 50 && Number(dcSrv.total_value) === 50 * 450 + 600, 'and the lines and their total value');
    ok((await page.evaluate(() => document.querySelector('[data-challan-notes]')?.textContent || '')).includes('Deliver to gate 2'), 'the challan prints its notes');

    section('A dispatched challan');
    await go(`/delivery-challans/${dcGone.id}`);
    await open();
    const gone = { on: await has(['Vehicle No.', 'LR / Docket', 'E-way Bill No.', 'Notes']), off: await has(['Challan number', 'Line 1 quantity', 'Ship To address', 'Place of supply']) };
    ok(gone.on.length === 4 && gone.off.length === 0, `only the transport, e-way bill and notes are fields${gone.off.length ? ` — also open: ${gone.off.join(', ')}` : ''}`);
    await typeIn('[aria-label="E-way Bill No."]', '1234');
    await page.click('[data-de-save]'); await sleep(400);
    ok(/12 digits/.test(await barError()), 'a short e-way bill number is caught before saving');
    await typeIn('[aria-label="E-way Bill No."]', '341028761952');
    await save();
    ok((await api('GET', `/delivery-challans/${dcGone.id}`)).eway_bill_no === '341028761952', 'the e-way bill number is stored');

    section('A purchase order before sign-off');
    await go(`/po/${poOpen.id}`);
    await open();
    const pof = await has(['Vendor quote reference', 'Line 1 description', 'Line 1 quantity', 'Line 1 unit price', 'GST rate', 'Payment terms', 'Price', 'P&F, Insurance', 'Loading & Unloading', 'Warranty / Terms']);
    ok(pof.length === 10, `its lines, GST and terms are fields (${pof.length} of 10)`);
    await typeIn('[aria-label="Line 1 unit price"]', '255');
    await typeIn('[aria-label="GST rate"]', '12');
    await typeIn('[aria-label="Payment terms"]', '30 days from delivery');
    await typeIn('[aria-label="Price"]', 'FOR our works');
    await typeIn('[aria-label="Vendor quote reference"]', 'DS/Q/118');
    await sleep(200);
    ok((await page.evaluate(() => document.querySelector('[data-de-total]')?.textContent || '')).includes(money(100 * 255 * 1.12)), 'the PO value follows the price and GST as they are typed');
    await save();
    const poSrv = await api('GET', `/po/${poOpen.id}`);
    const poLines = await api('GET', `/po/${poOpen.id}/items`);
    const pl = Array.isArray(poLines) ? poLines : Object.values(poLines).filter(x => x && typeof x === 'object' && 'unitPrice' in x);
    ok(Number(poSrv.gst_rate) === 12 && poSrv.paymentTerms === '30 days from delivery' && poSrv.priceBasis === 'FOR our works' && poSrv.quoteRef === 'DS/Q/118', 'the server has the GST rate, terms and quote reference');
    const dbLines = await rows('SELECT "unitPrice" FROM po_line_items WHERE "poId" = $1', [poOpen.id]);
    ok(dbLines.length === 1 && Number(dbLines[0].unitPrice) === 255, `and the new price on its line (${dbLines.map(l => l.unitPrice).join(', ')})`);

    section('An approved purchase order');
    await go(`/po/${poDone.id}`);
    await open();
    const pod = { on: await has(['Vendor quote reference', 'Payment terms', 'Warranty / Terms']), off: await has(['Line 1 unit price', 'GST rate', 'Line 1 quantity']) };
    ok(pod.on.length === 3 && pod.off.length === 0, `only the quote reference and terms are fields — the signed-off amounts are not${pod.off.length ? ` (also open: ${pod.off.join(', ')})` : ''}`);
    await typeIn('[aria-label="Warranty / Terms"]', '12 months from supply');
    await save();
    ok((await api('GET', `/po/${poDone.id}`)).warranty === '12 months from supply', 'its warranty terms are stored');

    section('A draft vendor bill');
    await go(`/grn-bills/${billDraft.id}`);
    await open();
    const bf = await has(['Bill date', 'Due date', "Vendor's invoice number", 'Line 1 rate', 'Freight', 'Other charges', 'Discount', 'GST rate', 'Tax split', 'Round off', 'Notes']);
    ok(bf.length === 11, `every part of a draft bill is a field (${bf.length} of 11)`);
    await typeIn("[aria-label=\"Vendor's invoice number\"]", 'DS/INV/2026/0457');
    await typeIn('[aria-label="Line 1 rate"]', '258');
    await typeIn('[aria-label="Freight"]', '1200');
    await sleep(200);
    const expectBill = Math.round((100 * 258 + 1200) * 1.18 * 100) / 100;
    ok((await page.evaluate(() => document.querySelector('[data-de-total]')?.textContent || '')).includes(money(expectBill)), 'the net payable follows the rate and freight as they are typed');
    await save();
    const bSrv = await api('GET', `/grn-bills/${billDraft.id}`);
    ok(bSrv.vendor_bill_ref === 'DS/INV/2026/0457' && Number(bSrv.items?.[0]?.rate) === 258 && Number(bSrv.freight) === 1200 && Math.abs(Number(bSrv.net_amount) - expectBill) < 0.01, 'the server has the vendor\'s invoice number, the rate, the freight and the new total');

    section('An approved vendor bill');
    await go(`/grn-bills/${billDone.id}`);
    await open();
    const bd = { on: await has(["Vendor's invoice number", 'Due date', 'Notes']), off: await has(['Line 1 rate', 'Discount', 'Bill date']) };
    ok(bd.on.length === 3 && bd.off.length === 0, `only the vendor's invoice number, due date and notes are fields${bd.off.length ? ` — also open: ${bd.off.join(', ')}` : ''}`);
    await setDate('[aria-label="Due date"]', '2026-12-31');
    await typeIn('[aria-label="Notes"]', 'Paid by RTGS');
    await save();
    const bdSrv = await api('GET', `/grn-bills/${billDone.id}`);
    ok(String(bdSrv.due_date).slice(0, 10) === '2026-12-31' && bdSrv.notes === 'Paid by RTGS', 'its due date and notes are stored');

    section('Credit notes');
    await go(`/credit-debit-notes/${noteLinked.id}`);
    await open();
    const nl = { on: await has(['Reason', 'Notes', 'Original document date']), off: await has(['Original document number', 'Line 1 rate']) };
    ok(nl.on.length === 3 && nl.off.length === 0, 'a note linked to its invoice: the reason, notes and the original\'s date — its number comes from the invoice');
    await typeIn('[aria-label="Reason"]', '2 sets short-supplied on 24 Nov');
    await setDate('[aria-label="Original document date"]', today);
    await save();
    const nlSrv = await api('GET', `/credit-debit-notes/${noteLinked.id}`);
    ok(nlSrv.reason === '2 sets short-supplied on 24 Nov' && String(nlSrv.ref_date).slice(0, 10) === today, 'the reason and the original\'s date are stored');
    await go(`/credit-debit-notes/${noteManual.id}`);
    await open();
    ok((await has(['Original document number'])).length === 1, 'a note with a typed-in reference can have that number corrected');
    await typeIn('[aria-label="Original document number"]', 'KBS/25-26/022');
    await save();
    ok((await api('GET', `/credit-debit-notes/${noteManual.id}`)).ref_number === 'KBS/25-26/022', 'and it is stored');

    ok(errs.length === 0, `no page errors${errs.length ? `: ${errs.slice(0, 2).join(' | ')}` : ''}`);
  } catch (e) {
    fail++; console.log(`   ❌ threw: ${e.message}`);
  } finally {
    if (browser) await browser.close();
    console.log(`\n   removed ${await cleanup()} test account(s)`);
    console.log(`\n   ${pass} passed, ${fail} failed\n`);
    process.exit(fail ? 1 : 0);
  }
})();
