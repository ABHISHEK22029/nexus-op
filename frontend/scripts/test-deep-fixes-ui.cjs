/* ══════════════════════════════════════════════════════════════════════
   The 20 Nov fixes, clicked through in the app, starting from nothing.

     · a new company adds its first customer from inside the order form,
       and turns a typed line into a product without leaving it
     · the order's panel: readiness offers to add the bill of materials,
       the order is edited in place, "Create challan" opens a prefilled one
     · an enquiry that came by phone is logged and converted
     · the PO form adds a new vendor on the spot
     · an invoice raises its own credit note, prefilled
     · Payables opens the bill; the bill links to its PO

   Builds its own throwaway company (deepui-*@example.test) and removes it.
   Needs the backend (SCHEDULER=off) and vite running. Refuses a deployed
   host.
   ══════════════════════════════════════════════════════════════════════ */
const puppeteer = require('puppeteer');
const path = require('path');
require(path.join(__dirname, '../../backend/node_modules/dotenv')).config({ path: path.join(__dirname, '../../backend/.env') });
const { Client } = require(path.join(__dirname, '../../backend/node_modules/pg'));
const { purgeOrg } = require(path.join(__dirname, '../../backend/scripts/lib/purgeOrg'));

const API = process.env.API_BASE || 'http://localhost:5099';
const UI = process.env.UI_BASE || 'http://localhost:5173';
if ([API, UI].some(u => /^https:|onrender\.com|vercel\.app|maksops\.co\.in/.test(u))) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}
const stamp = Date.now().toString(36);
const today = new Date().toISOString().slice(0, 10);
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function cleanup() {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }); await c.connect();
  try {
    const { rows } = await c.query(`SELECT id FROM users WHERE email LIKE 'deepui-%@example.test'`);
    const ids = rows.map(r => r.id);
    if (!ids.length) return 0;
    for (let i = 0; i < 4; i++) { const r = await purgeOrg(c, ids); if (!r.deleted) break; }
    await c.query('DELETE FROM document_sequences WHERE owner_id = ANY($1)', [ids]).catch(() => {});
    await c.query('DELETE FROM notifications WHERE user_id = ANY($1)', [ids]).catch(() => {});
    return (await c.query(`DELETE FROM users WHERE id = ANY($1) AND email LIKE '%@example.test'`, [ids])).rowCount;
  } finally { await c.end(); }
}

(async () => {
  await cleanup();
  const reg = await (await fetch(`${API}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Deep UI', email: `deepui-${stamp}@example.test`, password: 'testpassword123' }) })).json();
  const H = { Authorization: `Bearer ${reg.token}`, 'Content-Type': 'application/json' };
  const api = async (method, url, body) => {
    const r = await fetch(`${API}${url}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
    return r.json().catch(() => ({}));
  };
  let browser;
  try {
    await api('PUT', '/company-profile', { name: 'Fresh Fab Works', gstin: '36ABCDE1234F1Z9', stateCode: '36', setup_completed_at: new Date().toISOString() });

    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1000 });
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    page.on('dialog', d => d.accept());
    await page.goto(`${UI}/login`);
    await page.evaluate((t) => { localStorage.setItem('nexus_token', t); localStorage.setItem('tutorial_seen', '1'); }, reg.token);
    const go = async (p) => { await page.goto(UI + p, { waitUntil: 'networkidle2' }); await sleep(700); };
    const click = async (sel) => { await page.waitForSelector(sel, { visible: true, timeout: 10000 }); await page.click(sel); };
    const clickText = (re, scope = 'button') => page.evaluate((src, sc) => {
      const b = [...document.querySelectorAll(sc)].find(x => x.offsetParent && new RegExp(src, 'i').test(x.innerText.trim()));
      if (b) b.click(); return !!b;
    }, re.source, scope);
    const text = () => page.evaluate(() => document.body.innerText);

    /* ── first customer, from inside the order form ───────────── */
    console.log('\n  ── a brand-new company takes its first order');
    await go('/customer-orders');
    await clickText(/^New Order$/);
    await click('[data-party-first="customer"]');
    await page.waitForSelector('[data-quick-add="customer"]', { visible: true });
    await page.type('#qa-name', `Apollo ${stamp}`);
    await page.select('#qa-state', '36');
    await click('[data-quick-add-save]');
    await sleep(1200);
    const custVal = await page.$eval('[data-party-select="customer"]', s => s.value);
    ok(custVal && custVal !== '__add_new__', `"+ Add your first customer" adds Apollo and picks it, without leaving the form (${custVal})`);
    await page.type('[aria-label="Line 1 description"]', `Bracket ${stamp}`);
    await page.type('[aria-label="Line 1 quantity"]', '10');
    await page.type('[aria-label="Line 1 unit rate"]', '500');
    await click('[data-save-as-product]');
    await sleep(1500);
    const prodVal = await page.$eval('[aria-label="Line 1 product"]', s => s.value).catch(() => '');
    ok(!!prodVal, `"Save as product" turns the typed line into a product and links it (${prodVal})`);
    await clickText(/^Create Order$/);
    await sleep(1500);
    const orders = (await api('GET', '/customer-orders?limit=10')).items || [];
    const order = orders[0];
    ok(order && /Apollo/.test(order.customer_name || ''), `the order is saved for Apollo (${order?.order_number})`);

    /* ── the order's panel ─────────────────────────────────────── */
    console.log('\n  ── the order panel: bill of materials, editing, challan');
    await go(`/customer-orders?open=${order.id}`);
    await page.waitForSelector(`[data-focus-order="${order.id}"] [data-order-panel]`, { visible: true, timeout: 10000 });
    ok(true, 'an order opened by link shows on its own, with its panel');
    const addBom = await page.$(`[data-focus-order="${order.id}"] [data-add-bom]`);
    ok(!!addBom, 'with no bill of materials, readiness offers "Add bill of materials for Bracket"');
    if (addBom) {
      await addBom.click();
      /* the editor has loaded when its Save button is there */
      await page.waitForSelector('[data-bom-save]', { visible: true, timeout: 10000 });
      ok(true, 'and it opens the recipe editor right there');
      await clickText(/^Cancel$/);
      await page.waitForFunction(() => !document.querySelector('[data-bom-save]'), { timeout: 5000 });
    }
    await click(`[data-focus-order="${order.id}"] [data-edit-order]`);
    await page.waitForSelector('[data-edit-po-ref]', { visible: true });
    await page.type('[data-edit-po-ref]', 'APL/PO/12');
    await click('[data-save-order]');
    await page.waitForFunction(() => /Customer PO:\s*APL\/PO\/12/.test(document.body.innerText), { timeout: 8000 }).catch(() => {});
    ok(/Customer PO:\s*APL\/PO\/12/.test(await text()), 'the customer PO number is added to the order in place');
    await click(`[data-focus-order="${order.id}"] [data-order-challan]`);
    await page.waitForFunction(() => location.pathname === '/delivery-challans', { timeout: 8000 });
    await sleep(1500);
    const qty = await page.$eval('form input[type="number"]', i => i.value).catch(() => '');
    ok(qty === '10', `"Create challan" opens a challan prefilled with what is left to send (${qty})`);

    /* ── an enquiry by phone ───────────────────────────────────── */
    console.log('\n  ── an enquiry that came by phone');
    await go('/enquiries');
    await click('[data-log-enquiry]');
    await page.waitForSelector('[data-log-enquiry-form]', { visible: true });
    await page.type('#le-name', 'Suresh');
    await page.type('#le-company', `Krishna Steels ${stamp}`);
    await page.type('#le-phone', '9000011111');
    await page.type('[aria-label="Line 1 description"]', 'Staircase railing');
    await page.type('[aria-label="Line 1 quantity"]', '2');
    await click('[data-log-enquiry-save]');
    await page.waitForFunction((n) => document.body.innerText.includes(n), { timeout: 8000 }, `Krishna Steels ${stamp}`).catch(() => {});
    ok((await text()).includes(`Krishna Steels ${stamp}`) && /Phone/.test(await text()), 'it is logged and listed, marked as a phone enquiry');
    await page.evaluate((n) => [...document.querySelectorAll('div')].find(d => d.innerText?.startsWith(n) && d.onclick !== undefined)?.click(), `Krishna Steels ${stamp}`);
    await page.evaluate((n) => { const el = [...document.querySelectorAll('div[style*="cursor: pointer"]')].find(d => d.innerText.includes(n)); el?.click(); }, `Krishna Steels ${stamp}`);
    await click('[data-convert-enquiry]');
    await page.waitForFunction(() => location.pathname === '/sales-quotations', { timeout: 10000 }).catch(() => {});
    ok(/sales-quotations/.test(page.url()), 'converting it opens the quotation, prefilled');

    /* ── a new vendor from the PO form ─────────────────────────── */
    console.log('\n  ── the first vendor, from the PO form');
    await go('/purchase-orders');
    await clickText(/Create PO/);
    await page.waitForSelector('select[aria-label="Vendor"]', { visible: true });
    await page.select('select[aria-label="Vendor"]', '__add_new__');
    await page.waitForSelector('[data-quick-add="vendor"]', { visible: true });
    await page.type('#qa-name', `Deccan Metals ${stamp}`);
    await click('[data-quick-add-save]');
    await sleep(1200);
    const vendVal = await page.$eval('select[aria-label="Vendor"]', s => s.value);
    ok(vendVal && vendVal !== '__add_new__', `"+ New vendor…" adds Deccan Metals and picks it (${vendVal})`);

    /* ── invoice → credit note; payables → bill → PO ───────────── */
    console.log('\n  ── an invoice raises its credit note; a bill links back');
    const ipf = await api('GET', `/sales-invoices/prefill/${order.id}`);
    const inv = await api('POST', '/sales-invoices', { customerId: order.customer_id, customerOrderId: order.id, invoiceDate: today, gstRate: 18, items: ipf.items });
    await api('PATCH', `/sales-invoices/${inv.id}/status`, { status: 'Sent' });
    await go(`/sales-invoices/${inv.id}`);
    ok(!!(await page.$('[data-invoice-order-link]')), 'the invoice\'s order reference is a link to the order');
    await click('[data-raise-credit-note]');
    await page.waitForFunction(() => location.pathname === '/credit-debit-notes', { timeout: 8000 });
    await page.waitForSelector('[data-note-ref]', { visible: true, timeout: 8000 });
    await sleep(800);
    const refVal = await page.$eval('[data-note-ref]', i => i.value);
    ok(refVal === inv.invoiceNumber, `"Credit note" opens the note form against ${inv.invoiceNumber} (${refVal})`);

    const plate = await api('POST', '/raw-materials', { name: `MS plate ${stamp}`, unit: 'kg', base_uom: 'kg' });
    const po = await api('POST', '/po', { vendorId: Number(vendVal), itemName: `MS plate ${stamp}`, quantity: 110, unitPrice: 60,
      items: [{ description: `MS plate ${stamp}`, quantity: 100, unitPrice: 60, uom: 'kg', rawMaterialId: plate.id },
              { description: `Bolts ${stamp}`, quantity: 10, unitPrice: 5, uom: 'nos' }] });
    await api('PATCH', `/po/${po.id}/approve`); await api('PATCH', `/po/${po.id}/dispatch`);
    await go('/purchase-orders');
    await click(`[data-po-receive="${po.id}"]`);
    await page.waitForFunction(() => location.pathname === '/grn', { timeout: 8000 });
    await sleep(1500);
    const chosenPo = await page.$eval('select[aria-label="Purchase order"]', s => s.value).catch(() => '');
    ok(chosenPo === String(po.id), `"Receive goods" on a two-line PO opens the receipt form with that PO chosen (${chosenPo})`);
    const poLines = (await api('GET', `/grn/outstanding/${po.id}`)).lines || [];
    const grn = await api('POST', '/grn', { poId: po.id, poLineItemId: poLines[0]?.id, receivedQuantity: 100 });
    const bpf = await api('GET', `/grn-bills/prefill/${grn.grnId || grn.id}`);
    const bill = await api('POST', '/grn-bills', { grnId: grn.grnId || grn.id, poId: po.id, vendorId: Number(vendVal), billDate: today, gstRate: 18, items: bpf.items });
    await go('/payables');
    await click(`[data-payable-bill="${bill.id}"]`);
    await page.waitForFunction((id) => location.pathname === `/grn-bills/${id}`, { timeout: 8000 }, bill.id);
    await sleep(800);
    ok(!!(await page.$('[data-bill-links] a')), 'Payables opens the bill, and the bill links to its purchase order');
    ok(!/Kavuri Hills/.test(await text()), "the bill never prints another company's address");

    ok(errs.length === 0, `no page errors (${errs.slice(0, 3).join(' | ')})`);
  } catch (e) {
    fail++; console.log(`   ❌ stopped: ${e.message}`);
  } finally {
    if (browser) await browser.close();
    const n = await cleanup().catch(() => -1);
    ok(n > 0, `throwaway company removed (${n})`);
    console.log(`\n   ${pass} passed, ${fail} failed\n`);
    process.exit(fail ? 1 : 0);
  }
})();
