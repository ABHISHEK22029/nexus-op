#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   Editing a document on its own page — the invoice and the quotation —
   and the look of the documents beside them.

   The owner asked (24 Nov) that every document be editable "on the print
   page itself before printing", with the change stored on the server. On
   26 Nov: "it feels like the invoices, quotation, all those edit options
   are not live" — they were not; only the number and dates had a pencil.

   What is promised, as checks:
     · "Edit" (or a click on the piece of the sheet) turns the sheet into
       its own form, in place; print, PDF and email are put away
     · totals and tax follow the typing; the place of supply moves CGST+SGST
       to IGST; lines can be added and removed
     · Save stores it on the server, the page shows what the server holds,
       and so does the printed copy (no edit marks on paper)
     · an issued invoice offers only due date, e-way bill, notes and terms
       (GST corrects the rest with a note); a cancelled one, nothing
     · a refused save keeps what was typed and says why; Cancel and
       leaving the page ask before throwing changes away
     · an invoice line raised from an order keeps its tie to the order line
     · a quotation line takes its specifications, printed one per line
     · the challan, quotation and note sheets: status and copy off the
       paper, the parties in one closed box, the challan's transport
       details in one ruled strip

   Builds its own throwaway company (dedit-*@example.test) and removes it.
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
const q1 = async (sql, p) => { const c = db(); await c.connect(); try { return (await c.query(sql, p)).rows; } finally { await c.end(); } };
const money = (n) => Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function cleanup() {
  const c = db(); await c.connect();
  try {
    const { rows } = await c.query(`SELECT id FROM users WHERE email LIKE 'dedit-%@example.test'`);
    const ids = rows.map(r => r.id); if (!ids.length) return 0;
    for (let i = 0; i < 5; i++) { const r = await purgeOrg(c, ids); if (!r.deleted) break; }
    await c.query('DELETE FROM document_sequences WHERE owner_id = ANY($1)', [ids]).catch(() => {});
    await c.query('DELETE FROM notifications WHERE user_id = ANY($1)', [ids]).catch(() => {});
    return (await c.query(`DELETE FROM users WHERE id = ANY($1) AND email LIKE '%@example.test'`, [ids])).rowCount;
  } finally { await c.end(); }
}

(async () => {
  await cleanup();
  const reg = await (await fetch(`${API}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Doc Edit', email: `dedit-${stamp}@example.test`, password: 'testpassword123' }) })).json();
  const H = { Authorization: `Bearer ${reg.token}`, 'Content-Type': 'application/json' };
  const api = async (m, u, b) => { const r = await fetch(`${API}${u}`, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, ...(await r.json().catch(() => ({}))) }; };
  let browser;
  try {
    await api('PUT', '/company-profile', {
      name: 'Edit Fab Works Pvt Ltd', address: 'Plot 14, IDA Bowrampet, Hyderabad 500043', gstin: '36ABCDE1234F1Z9', stateCode: '36',
      bank_name: 'HDFC Bank', bank_account_no: '50200110000001', bank_ifsc: 'HDFC0000001', invoice_terms: 'Payment within 30 days.',
      setup_completed_at: new Date().toISOString(),
    });
    const L = await api('POST', '/customers', { name: `Local Infra ${stamp}`, gstin: '36AAACS1234C1Z5', state: 'Telangana', shipping_state: 'Telangana', billing_address: 'Kukatpally, Hyderabad' });
    const K = await api('POST', '/customers', { name: `Karnataka Builders ${stamp}`, gstin: '29AAACB1234C1Z5', state: 'Karnataka', shipping_state: 'Karnataka', billing_address: 'MG Road, Bengaluru' });
    const lines = [{ description: 'MS bracket', hsn: '7308', quantity: 10, uom: 'nos', rate: 450 }, { description: 'Base plate', hsn: '7308', quantity: 4, uom: 'nos', rate: 700 }];
    const draft = await api('POST', '/sales-invoices', { customerId: L.id, gstRate: 18, items: lines });
    const other = await api('POST', '/sales-invoices', { customerId: L.id, gstRate: 18, items: [{ ...lines[0], quantity: 11 }] });
    const sent = await api('POST', '/sales-invoices', { customerId: L.id, gstRate: 18, items: [{ ...lines[0], quantity: 12 }] });
    await api('PATCH', `/sales-invoices/${sent.id}/status`, { status: 'Sent' });
    const gone = await api('POST', '/sales-invoices', { customerId: L.id, gstRate: 18, items: [{ ...lines[0], quantity: 13 }] });
    await api('PATCH', `/sales-invoices/${gone.id}/status`, { status: 'Cancelled' });
    const ord = await api('POST', '/customer-orders', { customerId: L.id, items: [{ description: 'Grill', hsn: '7308', quantity: 20, uom: 'nos', rate: 1000 }] });
    const ipf = await api('GET', `/sales-invoices/prefill/${ord.id}`);
    const fromOrder = await api('POST', '/sales-invoices', { customerId: L.id, customerOrderId: ord.id, gstRate: 18, items: (ipf.items || []).map(it => ({ ...it, quantity: 5 })) });
    const qd = await api('POST', '/sales-quotations', { customerId: L.id, items: [{ description: 'Stand for SCB', hsn: '7308', quantity: 100, uom: 'set', rate: 4910 }] });
    const qs = await api('POST', '/sales-quotations', { customerId: L.id, items: [{ description: 'Canopy', quantity: 2, rate: 1000 }] });
    await api('PATCH', `/sales-quotations/${qs.id}/status`, { status: 'Sent' });
    const qc = await api('POST', '/sales-quotations', { customerId: L.id, items: [{ description: 'Rafter', quantity: 2, rate: 1000 }] });
    const qcv = await api('POST', `/sales-quotations/${qc.id}/convert`);
    const dpf = await api('GET', `/delivery-challans/prefill/${ord.id}`);
    const dc = await api('POST', '/delivery-challans', { customerId: L.id, customerOrderId: ord.id, challanDate: today, items: dpf.items, vehicleNo: 'TS09AB1234' });
    const note = await api('POST', '/credit-debit-notes', { noteType: 'credit', partyType: 'customer', partyId: L.id, refId: sent.id, gstRate: 18, reason: 'Short supply', items: [{ description: 'MS bracket', quantity: 1, rate: 450 }] });
    const made = { draft, other, sent, gone, fromOrder, qd, qs, qc, dc, note };
    const missing = Object.entries(made).filter(([, x]) => !x.id).map(([k, x]) => `${k} (${x.status}: ${x.error || ''})`);
    ok(!missing.length, `a company with invoices, quotations, a challan and a note to edit${missing.length ? ` — not made: ${missing.join('; ')}` : ''}`);
    const otherNo = (await api('GET', `/sales-invoices/${other.id}`)).invoice_number;

    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const errs = []; let nativeDialogs = 0;
    page.on('pageerror', e => errs.push(e.message));
    page.on('dialog', async d => { nativeDialogs++; await d.dismiss(); });
    await page.setViewport({ width: 1366, height: 1000 });
    await page.goto(`${UI}/login`);
    await page.evaluate((t, u) => { localStorage.setItem('nexus_token', t); localStorage.setItem('nexus_user', JSON.stringify(u)); localStorage.setItem('tutorial_seen', '1'); localStorage.setItem('nexus-theme', 'light'); localStorage.setItem('maks_app_dialogs', '1'); }, reg.token, reg.user);

    const go = async (u, sel = '.doc-sheet, .invoice-mock') => { await page.goto(`${UI}${u}`, { waitUntil: 'networkidle2' }); await page.waitForSelector(sel, { timeout: 30000 }); await sleep(500); };
    const byText = (tag, re) => page.evaluateHandle((t, src) => [...document.querySelectorAll(t)].find(b => new RegExp(src).test(b.textContent)) || null, tag, re.source);
    const clickText = async (tag, re) => { const h = await byText(tag, re); const el = h.asElement(); if (!el) return false; await el.click(); return true; };
    const typeIn = async (sel, text) => { await page.click(sel, { clickCount: 3 }); await page.keyboard.press('Backspace'); if (text !== '') await page.keyboard.type(String(text)); };
    const text = (sel) => page.evaluate(s => document.querySelector(s)?.textContent.replace(/\s+/g, ' ').trim() || '', sel);
    const editing = () => page.evaluate(() => !!document.querySelector('[data-de-bar]'));
    const quiet = () => page.waitForFunction(() => !document.querySelector('[data-toast]'), { timeout: 8000 }).catch(() => {});

    /* ── the draft invoice ── */
    section('A draft invoice, edited on its own page');
    await go(`/sales-invoices/${draft.id}`);
    ok(!!(await page.$('[data-doc-edit]')), 'it has an "Edit invoice" button');
    await page.click('[data-doc-edit]');
    await page.waitForSelector('[data-de-bar]', { timeout: 5000 });
    const bar = await text('[data-de-bar]');
    ok(/Editing/.test(bar) && /draft/i.test(bar), `the sheet opens for editing, and says what can change ("${bar.slice(0, 70)}…")`);
    const hidden = await page.evaluate(() => !document.querySelector('[data-add-payment]') && ![...document.querySelectorAll('button')].some(b => /^\s*(Print|Download PDF|Email)\s*$/.test(b.textContent)));
    ok(hidden, 'Print, PDF, Email and Record payment are put away while editing');
    const fields = await page.evaluate(() => ['Invoice number', 'Invoice date', 'Due date', 'Bill To name', 'Bill To address', 'Ship To address', 'Place of supply', 'Reverse charge', 'E-way bill number', 'Line 1 description', 'Line 2 rate', 'Discount', 'GST rate', 'Round off', 'Notes', 'Terms']
      .filter(l => !document.querySelector(`[aria-label="${l}"]`)));
    ok(fields.length === 0, `every part of a draft is a field, in place${fields.length ? ` — missing: ${fields.join(', ')}` : ''}`);
    const inSheet = await page.evaluate(() => !!document.querySelector('.invoice-mock [aria-label="Line 2 rate"]') && !!document.querySelector('.invoice-mock [aria-label="Bill To name"]'));
    ok(inSheet, 'the fields sit on the sheet itself, not in a separate form');

    await typeIn('[aria-label="Line 2 rate"]', '900');
    await sleep(200);
    let total = await text('[data-de-total]');
    ok(total === money(10 * 450 + 4 * 900 + (10 * 450 + 4 * 900) * 0.18), `the total follows the typing (₹${total})`);
    await page.select('[aria-label="Place of supply"]', '29');
    await sleep(200);
    const inter = await page.evaluate(() => document.querySelector('[data-de-totals]').innerText);
    ok(/IGST/.test(inter) && !/CGST/.test(inter), 'moving the place of supply to Karnataka turns CGST + SGST into IGST');
    await page.click('[data-de-add-line]');
    await sleep(300);
    const focusedNew = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
    ok(focusedNew === 'Line 3 description', `"Add line" adds one and puts the cursor in it (${focusedNew})`);
    await page.keyboard.type('Installation\nAt site, two days');
    await typeIn('[aria-label="Line 3 quantity"]', '1');
    await typeIn('[aria-label="Line 3 rate"]', '2500');
    await typeIn('[aria-label="Discount"]', '100');
    await typeIn('[aria-label="Notes"]', 'Delivered in two lots');
    await sleep(200);
    const expectNet = Math.round(((10 * 450 + 4 * 900 + 2500 - 100) * 1.18) * 100) / 100;
    total = await text('[data-de-total]');
    ok(total === money(expectNet), `discount and the new line are in the total (₹${total})`);
    ok(/Not saved yet/.test(await text('[data-de-state]')), 'the bar says the changes are not saved yet');

    await page.click('[data-de-save]');
    await page.waitForFunction(() => !document.querySelector('[data-de-bar]'), { timeout: 15000 }).catch(() => {});
    await sleep(800);
    const srv = await api('GET', `/sales-invoices/${draft.id}`);
    ok(!(await editing()), 'Save closes the editor');
    ok(srv.items?.length === 3 && Number(srv.items[1].rate) === 900 && /At site, two days/.test(srv.items[2].description), 'the server has the lines as edited — the new rate and the new line');
    ok(Number(srv.discount) === 100 && Number(srv.igst) > 0 && Number(srv.cgst) === 0 && srv.place_of_supply_code === '29', 'and the discount and IGST for Karnataka');
    ok(Math.abs(Number(srv.net_amount) - expectNet) < 0.01, `its total is the one the page showed while typing (₹${money(srv.net_amount)})`);
    ok(srv.notes === 'Delivered in two lots', 'and the notes');
    const shown = await page.evaluate(() => document.querySelector('.invoice-mock').innerText);
    ok(shown.includes('Delivered in two lots') && shown.includes(money(expectNet)) && /IGST/.test(shown), 'the page shows what the server stored, without a reload');
    ok(/At site, two days/.test(await text('.invoice-mock tbody tr:nth-child(3) .doc-item-more')), 'the new line\'s second line prints under its name');
    await page.emulateMediaType('print');
    const paper = await page.evaluate(() => ({ fields: document.querySelectorAll('.invoice-mock input, .invoice-mock textarea, .invoice-mock select').length, text: document.querySelector('.invoice-mock').innerText }));
    await page.emulateMediaType('screen');
    ok(paper.fields === 0 && paper.text.includes('Delivered in two lots'), 'the printed copy shows the saved values, with no edit marks on it');

    section('A click on the sheet opens the editor there');
    await page.evaluate(() => { const s = [...document.querySelectorAll('.invoice-mock [data-de-field="notes"]')][0]; s && s.click(); });
    await sleep(500);
    ok(await editing(), 'clicking the notes opens the editor');
    ok(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')) === 'Notes', 'with the cursor in the notes');

    section('What stops a save, and what a refusal keeps');
    await quiet();
    await typeIn('[aria-label="Line 1 description"]', '');
    await page.click('[data-de-save]');
    await sleep(500);
    const caught = { err: await text('[data-de-error]'), val: await page.evaluate(() => document.querySelector('[aria-label="Line 1 description"]')?.value) };
    ok(/Line 1 has a quantity or rate but no description/.test(caught.err) && await editing(), `a line with figures but no description is caught before saving, and it stays open ("${caught.err.slice(0, 70)}" / typed "${caught.val}")`);
    ok(await page.evaluate(() => document.querySelector('[aria-label="Line 1 description"]').getAttribute('aria-invalid') === 'true'), 'the field in question is marked');
    await typeIn('[aria-label="Line 1 description"]', 'MS bracket');
    await typeIn('[aria-label="Invoice number"]', otherNo);
    await page.click('[data-de-save]');
    await page.waitForFunction(() => /already used/.test(document.querySelector('[data-de-error]')?.textContent || ''), { timeout: 8000 }).catch(() => {});
    ok(/already used/.test(await text('[data-de-error]')), `the server refuses a number in use, and the bar says so ("${(await text('[data-de-error]')).slice(0, 60)}")`);
    ok(await page.evaluate(() => document.querySelector('[aria-label="Invoice number"]').value) === otherNo && await editing(), 'and what was typed stays, to be put right');
    await page.click('a, button').catch(() => {});
    await clickText('button', /All Invoices/);
    await sleep(600);
    ok(nativeDialogs >= 1 && /\/sales-invoices\/\d+$/.test(await page.evaluate(() => location.pathname)), 'leaving with unsaved changes asks first (and staying keeps them)');
    await page.click('[data-de-cancel]');
    await page.waitForSelector('[role="alertdialog"]', { timeout: 5000 }).catch(() => {});
    ok(/Discard your changes/.test(await text('[role="alertdialog"]')), 'Cancel with changes asks before throwing them away');
    await clickText('[role="alertdialog"] button', /Discard changes/);
    await sleep(500);
    ok(!(await editing()) && (await text('.invoice-mock')).includes(srv.invoice_number), 'and discarding puts the saved invoice back');

    section('An issued invoice');
    await go(`/sales-invoices/${sent.id}`);
    await page.click('[data-doc-edit]');
    await page.waitForSelector('[data-de-bar]');
    const issued = await page.evaluate(() => ({
      on: ['Due date', 'E-way bill number', 'Notes', 'Terms'].filter(l => document.querySelector(`[aria-label="${l}"]`)),
      off: ['Invoice number', 'Invoice date', 'Line 1 rate', 'Discount', 'Bill To name', 'Place of supply'].filter(l => document.querySelector(`[aria-label="${l}"]`)),
      scope: document.querySelector('[data-de-bar]').innerText,
    }));
    ok(issued.on.length === 4 && issued.off.length === 0, `only the due date, e-way bill, notes and terms are fields${issued.off.length ? ` — also open: ${issued.off.join(', ')}` : ''}`);
    ok(/credit or debit note|reopen it as a draft/i.test(issued.scope), 'and the bar says how the rest is changed');
    await typeIn('[aria-label="E-way bill number"]', '341028761952');
    await page.evaluate(() => { const i = document.querySelector('[aria-label="Due date"]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, '2026-12-31'); i.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.keyboard.down('Control'); await page.keyboard.press('s'); await page.keyboard.up('Control');
    await page.waitForFunction(() => !document.querySelector('[data-de-bar]'), { timeout: 15000 }).catch(() => {});
    const sentNow = await api('GET', `/sales-invoices/${sent.id}`);
    const why = (await editing()) ? ` — still editing: "${await text('[data-de-error]')}" e-way "${await page.evaluate(() => document.querySelector('[aria-label="E-way bill number"]')?.value)}" due "${await page.evaluate(() => document.querySelector('[aria-label="Due date"]')?.value)}"` : ` — server: ${sentNow.eway_bill_no} / ${sentNow.due_date}`;
    ok(sentNow.eway_bill_no === '341028761952' && String(sentNow.due_date).slice(0, 10) === '2026-12-31', `Ctrl+S saves the e-way bill and due date on an issued invoice${sentNow.eway_bill_no === '341028761952' ? '' : why}`);
    await go(`/sales-invoices/${gone.id}`);
    ok(!(await page.$('[data-doc-edit]')), 'a cancelled invoice has nothing to edit');

    section('An invoice raised from an order');
    await go(`/sales-invoices/${fromOrder.id}`);
    await page.click('[data-doc-edit]');
    await page.waitForSelector('[aria-label="Line 1 rate"]');
    await typeIn('[aria-label="Line 1 rate"]', '1050');
    await page.click('[data-de-save]');
    await page.waitForFunction(() => !document.querySelector('[data-de-bar]'), { timeout: 15000 }).catch(() => {});
    const tie = await q1('SELECT rate, customer_order_item_id FROM sales_invoice_items WHERE sales_invoice_id = $1', [fromOrder.id]);
    ok(tie.length === 1 && Number(tie[0].rate) === 1050 && tie[0].customer_order_item_id != null, 'its line keeps its tie to the order line when saved (so "billed against ordered" still counts it)');

    /* ── quotations ── */
    section('A draft quotation');
    await go(`/sales-quotations/${qd.id}`);
    await page.click('[data-doc-edit]');
    await page.waitForSelector('[aria-label="Line 1 description"]');
    await typeIn('[aria-label="Line 1 description"]', 'Stand for SCB\nSpecifications:\nColumn - 2mm C Perling\nCanopy Rafter - 50 x 50 x 5 Angle');
    await typeIn('[aria-label="Line 1 quantity"]', '135');
    await typeIn('[aria-label="Delivery days"]', '15');
    await typeIn('[aria-label="Delivery note"]', 'Incoterms: FOR Jadcherla');
    await typeIn('[aria-label="Payment terms days"]', '30');
    await page.waitForFunction(() => document.querySelector('[aria-label="Customer"] option:nth-child(2)'), { timeout: 8000 }).catch(() => {});
    await page.select('[aria-label="Customer"]', String(K.id));
    await sleep(300);
    const qPreview = await page.evaluate(() => document.querySelector('[data-de-totals]').innerText);
    ok(/IGST/.test(qPreview), 'moving it to a customer in another state shows IGST straight away');
    ok((await text('[data-de-total]')).includes(money(135 * 4910 * 1.18)), `the total follows the quantity (${await text('[data-de-total]')})`);
    await page.click('[data-de-save]');
    await page.waitForFunction(() => !document.querySelector('[data-de-bar]'), { timeout: 15000 }).catch(() => {});
    await sleep(600);
    const qsrv = await api('GET', `/sales-quotations/${qd.id}`);
    ok(Number(qsrv.items?.[0]?.quantity) === 135 && /Column - 2mm C Perling/.test(qsrv.items?.[0]?.description) && qsrv.customer_id === K.id && qsrv.interstate === true, 'the server has the lines, the specifications, the new customer and IGST');
    ok(qsrv.delivery_days === 15 && qsrv.delivery_note === 'Incoterms: FOR Jadcherla' && qsrv.payment_terms_days === 30, 'and the delivery promise and payment terms');
    const specs = await page.evaluate(() => [...document.querySelectorAll('.doc-sheet .doc-item-more')].map(e => e.innerText));
    ok(specs.some(s => /Specifications:\s*\n\s*Column - 2mm C Perling\s*\n\s*Canopy Rafter/.test(s)), 'the specifications print one per line under the item, as on the company\'s own quotations');
    ok(/within 15 days of order\. Incoterms: FOR Jadcherla/.test(await text('.doc-sheet')) && /30 days from invoice/.test(await text('.doc-sheet')), 'the page shows the delivery and payment terms that were saved');

    section('A sent quotation, and a converted one');
    await go(`/sales-quotations/${qs.id}`);
    await page.click('[data-doc-edit]');
    await page.waitForSelector('[data-de-bar]');
    const qsent = await page.evaluate(() => ({ on: ['Quotation number', 'Quotation date', 'Valid until', 'Notes', 'Terms'].filter(l => document.querySelector(`[aria-label="${l}"]`)), off: ['Line 1 rate', 'Discount', 'Delivery days'].filter(l => document.querySelector(`[aria-label="${l}"]`)) }));
    ok(qsent.on.length === 5 && qsent.off.length === 0, `sent: its number and date, how long it holds, the notes and the terms (${qsent.on.length}/5)${qsent.off.length ? ` — also open: ${qsent.off.join(', ')}` : ''}`);
    await page.evaluate(() => { const i = document.querySelector('[aria-label="Valid until"]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, '2026-12-20'); i.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.click('[data-de-save]');
    await page.waitForFunction(() => !document.querySelector('[data-de-bar]'), { timeout: 15000 }).catch(() => {});
    ok(String((await api('GET', `/sales-quotations/${qs.id}`)).valid_until).slice(0, 10) === '2026-12-20', 'its validity is extended and stored');
    /* Converted (26 Nov 2026): "the quote no. should be changeable". Its
       number, date, notes and terms still change; its lines and prices are
       the order's, changed there. */
    await go(`/sales-quotations/${qc.id}`);
    ok(!!(await page.$('[data-doc-edit]')), 'a converted quotation can be edited');
    await page.click('[data-doc-edit]');
    await page.waitForSelector('[data-de-bar]');
    const qconv = await page.evaluate(() => ({ on: ['Quotation number', 'Quotation date', 'Notes', 'Terms'].filter(l => document.querySelector(`[aria-label="${l}"]`)), off: ['Valid until', 'Line 1 rate', 'Discount', 'Delivery days'].filter(l => document.querySelector(`[aria-label="${l}"]`)) }));
    ok(qconv.on.length === 4 && qconv.off.length === 0, `converted: its number, date, notes and terms (${qconv.on.length}/4)${qconv.off.length ? ` — also open: ${qconv.off.join(', ')}` : ''}`);
    ok(/lines and prices are on the order/i.test(await text('[data-de-bar]')), 'and the bar says lines and prices are changed on the order');
    const renamed = `QT-R-${stamp}`.toUpperCase();
    await page.evaluate((v) => { const i = document.querySelector('[aria-label="Quotation number"]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, v); i.dispatchEvent(new Event('input', { bubbles: true })); }, renamed);
    await page.click('[data-de-save]');
    await page.waitForFunction(() => !document.querySelector('[data-de-bar]'), { timeout: 15000 }).catch(() => {});
    await sleep(500);
    ok((await api('GET', `/sales-quotations/${qc.id}`)).quote_number === renamed && (await text('.doc-sheet')).includes(renamed), `its number changes and the sheet shows it (${renamed})`);
    const ordNotes = String((await api('GET', `/customer-orders/${qcv.orderId}`)).notes || '');
    ok(ordNotes.includes(`Converted from quotation ${renamed}`), `the order made from it names the new number (${ordNotes.slice(0, 60)})`);
    const lineTry = await api('PATCH', `/sales-quotations/${qc.id}`, { items: [{ description: 'Rafter', quantity: 3, rate: 1000 }] });
    ok(lineTry.status === 409 && /on the order/.test(lineTry.error || ''), 'its lines are refused, pointing at the order');
    const dupTry = await api('PATCH', `/sales-quotations/${qc.id}`, { quote_number: qs.quoteNumber });
    ok(dupTry.status === 409 && /already used/.test(dupTry.error || ''), 'a number another quotation has is refused');
    const blankTry = await api('PATCH', `/sales-quotations/${qc.id}`, { quote_number: '  ' });
    ok(blankTry.status === 400, 'a blank number is refused');

    /* ── the look of the sheets ── */
    section('The documents look like one set');
    for (const [name, url] of [['Challan', `/delivery-challans/${dc.id}`], ['Quotation', `/sales-quotations/${qd.id}`], ['Credit note', `/credit-debit-notes/${note.id}`]]) {
      await go(url, '.doc-sheet');
      const look = await page.evaluate(() => {
        const sheet = document.querySelector('.doc-sheet');
        const head = sheet.querySelector('.inv-header').getBoundingClientRect();
        const box = sheet.querySelector('.doc-parties');
        const s = getComputedStyle(sheet);
        const innerLeft = sheet.getBoundingClientRect().left + parseFloat(s.paddingLeft);
        const firstText = sheet.querySelector('.inv-company-name').getBoundingClientRect().left;
        return {
          aligned: Math.abs(firstText - innerLeft) < 60 && Math.abs(head.left - innerLeft) < 2,
          boxed: !!box && getComputedStyle(box).borderLeftStyle === 'solid' && getComputedStyle(box).borderRightStyle === 'solid',
          statusOnSheet: /Status:/.test(sheet.innerText),
          pickerOnSheet: !!sheet.querySelector('[data-copy-picker]'),
          pill: !!document.querySelector('[data-doc-status]'),
        };
      });
      ok(look.aligned && look.boxed && !look.statusOnSheet && !look.pickerOnSheet && look.pill,
        `${name}: letterhead in line, parties in a closed box, status and copy picker off the paper`);
    }
    await go(`/delivery-challans/${dc.id}`, '.doc-sheet');
    const facts = await page.evaluate(() => { const f = document.querySelector('[data-challan-facts]'); return f && { cells: f.children.length, rows: new Set([...f.children].map(c => Math.round(c.getBoundingClientRect().top))).size }; });
    ok(facts && facts.cells >= 5 && facts.rows === 1, `the challan's transport details sit in one ruled strip (${facts?.cells} cells, ${facts?.rows} row)`);

    section('On a phone');
    await page.setViewport({ width: 390, height: 844 });
    await go(`/sales-invoices/${draft.id}`);
    await page.click('[data-doc-edit]');
    await page.waitForSelector('[data-de-bar]');
    const phone = await page.evaluate(() => ({ wide: document.documentElement.scrollWidth - innerWidth, save: (() => { const r = document.querySelector('[data-de-save]').getBoundingClientRect(); return r.right <= innerWidth && r.height >= 32; })() }));
    ok(phone.wide <= 0 && phone.save, 'the bar fits, Save is reachable, and the page never scrolls sideways');
    await page.click('[data-de-cancel]');

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
