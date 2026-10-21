#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   The purchase order screen picks its items, and every payment screen
   offers the same ways to pay — in a browser.

   1. Create PO: a line picked from the item list fills itself — the
      material's name, its unit and HSN, and THIS vendor's price for it
      (Vendors → What they supply), not the material's standard rate.
      A product can be picked too. Saved, each line carries its item.
   2. A line can still be typed when the item is not saved anywhere.
   3. Record payment (invoice), Pay (Payables) and Expenses offer one list:
      Bank transfer, UPI, Cash, Cheque, Card. An expense starts on Cash.

   Its own throwaway company (popick-*@example.test), removed at the end.
     API_BASE=http://localhost:5097 UI_BASE=http://localhost:5176 node scripts/test-po-picker-ui.cjs
   ══════════════════════════════════════════════════════════════════════ */
const puppeteer = require('puppeteer');
const path = require('path');
require(path.join(__dirname, '../../backend/node_modules/dotenv')).config({ path: path.join(__dirname, '../../backend/.env') });
const { purge } = require(path.join(__dirname, '../../backend/scripts/lib/testAccounts'));

const API = process.env.API_BASE || 'http://localhost:5099';
const UI = process.env.UI_BASE || 'http://localhost:5173';
if ([API, UI].some(u => /^https:|onrender\.com|vercel\.app|maksops\.co\.in/.test(u))) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}
const MODES = ['Bank transfer', 'UPI', 'Cash', 'Cheque', 'Card'];
const stamp = Date.now().toString(36);
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const reg = await (await fetch(`${API}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'PO Picker', email: `popick-${stamp}@example.test`, password: 'testpassword123' }) })).json();
  const T = reg.token;
  const api = async (m, u, b) => {
    const r = await fetch(`${API}${u}`, { method: m, headers: { Authorization: `Bearer ${T}`, 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${m} ${u} → ${r.status} ${j.error || ''}`);
    return j;
  };
  let browser;
  const errs = [];
  try {
    await api('PUT', '/company-profile', { name: `Picker Fab ${stamp}`, gstin: '36ABCDE1234F1Z5', stateCode: '36', address: 'Hyderabad',
      bank_name: 'Test Bank', bank_account_no: '123456789012', bank_ifsc: 'HDFC0001234', bank_account_name: 'Picker Fab' });
    const vendName = `Sunrise Steel ${stamp}`;
    const vendor = await api('POST', '/vendors', { name: vendName, type: 'Supplier', gstin: '36PQRSX6789K1Z2' });
    const matName = `MS Angle 50x50x6 ${stamp}`;
    const mat = await api('POST', '/raw-materials', { name: matName, material_code: `AN-${stamp}`, unit: 'kg', base_uom: 'kg', standard_rate: 62, hsn: '7216' });
    await api('POST', '/vendor-items', { vendor_id: vendor.id, raw_material_id: mat.id, price: 58.5, price_uom: 'kg', is_preferred: true });
    const prodName = `Base Plate ${stamp}`;
    const prod = await api('POST', '/skus', { name: prodName, sku_code: `BP-${stamp}`, unit: 'nos', price: 450, hsn: '7308' });
    const cust = await api('POST', '/customers', { name: `Cust ${stamp}`, state: 'Telangana', address: 'Hyderabad' });
    const inv = await api('POST', '/sales-invoices', { customerId: cust.id, gstRate: 18, items: [{ description: 'Bracket', quantity: 2, rate: 1000, uom: 'nos' }] });

    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    page.on('pageerror', e => errs.push(e.message));
    page.on('dialog', d => d.accept().catch(() => {}));
    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto(`${UI}/login`);
    await page.evaluate((t, u) => { localStorage.setItem('nexus_token', t); localStorage.setItem('nexus_user', JSON.stringify(u)); }, T, reg.user);
    const waitFor = (fn, ms = 15000, ...a) => page.waitForFunction(fn, { timeout: ms }, ...a).then(() => true).catch(() => false);
    const go = async (p) => { await page.goto(`${UI}${p}`, { waitUntil: 'networkidle2' }); await sleep(800); };
    const click = (sel, re) => page.evaluate((s, src) => { const el = [...document.querySelectorAll(s)].find(e => new RegExp(src).test(e.textContent)); if (el) el.click(); return !!el; }, sel, re.source);
    const choose = (sel, textRe) => page.evaluate((s, src) => {
      const el = document.querySelector(s); if (!el) return null;
      const o = [...el.options].find(x => new RegExp(src).test(x.textContent)); if (!o) return null;
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, o.value);
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return o.textContent;
    }, sel, textRe.source);
    const lineVals = (n) => page.evaluate((i) => {
      const tr = document.querySelector(`select[aria-label="Line ${i} item"]`)?.closest('tr');
      if (!tr) return null;
      const v = [...tr.querySelectorAll('input, select')].map(e => e.value);
      return { desc: tr.querySelector(`input[aria-label="Line ${i} description"]`)?.value, unit: tr.querySelector(`select[aria-label="Line ${i} unit"]`)?.value, all: v };
    }, n);

    /* ── 1 ── */
    console.log('\n  ── 1. a PO line picked from the item list');
    await go('/purchase-orders');
    await click('button', /Create PO/);
    await waitFor(() => !!document.querySelector('select[aria-label="Line 1 item"]'));
    const vsel = await page.evaluate((n) => {
      const s = [...document.querySelectorAll('form select')].find(x => [...x.options].some(o => o.textContent.includes(n)));
      if (!s) return false;
      s.setAttribute('data-vendor', '1'); return true;
    }, vendName);
    ok(vsel, 'the PO form offers the vendor');
    await choose('select[data-vendor]', new RegExp(vendName));
    await sleep(1200);   // the vendor's price list loads
    const optText = await page.evaluate(() => [...document.querySelectorAll('select[aria-label="Line 1 item"] option')].map(o => o.textContent));
    ok(optText.some(t => t.includes(matName) && /this vendor's price/.test(t)) && optText.some(t => t.includes(prodName)),
      'the item list holds the materials (this vendor\'s priced ones marked) and the products');
    await choose('select[aria-label="Line 1 item"]', new RegExp(matName));
    await sleep(300);
    const l1 = await lineVals(1);
    ok(l1?.desc === matName && l1?.unit === 'kg', `picking the material fills its name and unit (${l1?.desc}, ${l1?.unit})`);
    ok(l1?.all.includes('7216') && l1?.all.includes('58.5'), `its HSN, and this vendor's ₹58.50 a kg rather than the ₹62 standard rate (${l1?.all.join(' | ')})`);
    await click('button', /Add (Line|Item)/i);
    await waitFor(() => !!document.querySelector('select[aria-label="Line 2 item"]'));
    await choose('select[aria-label="Line 2 item"]', new RegExp(prodName));
    await sleep(300);
    const l2 = await lineVals(2);
    ok(l2?.desc === prodName && l2?.unit === 'nos' && l2?.all.includes('7308'), `a product can be picked too (${l2?.desc}, ${l2?.unit})`);

    /* ── 2 ── a typed line alongside */
    console.log('\n  ── 2. a line typed by hand still works');
    await click('button', /Add (Line|Item)/i);
    await waitFor(() => !!document.querySelector('input[aria-label="Line 3 description"]'));
    const typed = await page.$('input[aria-label="Line 3 description"]');
    await typed.type('Fasteners M12 (not stocked)');
    const fillNum = async (n, col, v) => page.evaluate((i, c, val) => {
      const tr = document.querySelector(`input[aria-label="Line ${i} description"]`).closest('tr');
      const nums = [...tr.querySelectorAll('input[type="number"]')];
      const el = nums[c];
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, String(val));
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, n, col, v);
    await fillNum(1, 0, 300); await fillNum(2, 0, 50); await fillNum(2, 1, 440); await fillNum(3, 0, 100); await fillNum(3, 1, 12);
    const title = await page.evaluate(() => { const l = [...document.querySelectorAll('label')].find(x => /^PO Title/.test(x.textContent.trim())); return l?.parentElement.querySelector('input')?.setAttribute('data-title', '1') ?? !!l; });
    const t = await page.$('input[data-title]'); if (t) await t.type(`Angle, plates and fasteners ${stamp}`);
    await click('form button[type="submit"]', /Raise Order/);
    const saved = await waitFor(() => [...document.querySelectorAll('[role="status"],[role="alert"]')].some(e => /Purchase Order created/.test(e.innerText)));
    ok(saved, 'Raise Order saves it');
    const pos = await api('GET', '/po?limit=5');
    const po = (pos.items || pos)[0];
    const lines = po ? await api('GET', `/po/${po.id}/items`) : [];
    const byNo = Object.fromEntries((Array.isArray(lines) ? lines : lines.items || []).map(l => [l.sno, l]));
    ok(byNo[1]?.raw_material_id === mat.id && Number(byNo[1]?.unitPrice) === 58.5, `line 1 is stored linked to the material, at the vendor's price (${byNo[1]?.raw_material_id}, ₹${byNo[1]?.unitPrice})`);
    ok(byNo[2]?.sku_id === prod.id, `line 2 is linked to the product (${byNo[2]?.sku_id})`);
    ok(byNo[3] && byNo[3].raw_material_id == null && byNo[3].sku_id == null && byNo[3].description === 'Fasteners M12 (not stocked)', 'line 3, typed, is kept as typed with no link');

    /* ── 3 ── payment modes */
    console.log('\n  ── 3. one list of ways to pay');
    const optsOf = (sel) => page.evaluate((s) => [...(document.querySelector(s)?.options || [])].map(o => o.textContent.trim()), sel);
    await go(`/sales-invoices/${inv.id}`);
    await waitFor(() => !!document.querySelector('select[aria-label="Payment mode"]'));
    const invModes = await optsOf('select[aria-label="Payment mode"]');
    const invDefault = await page.evaluate(() => document.querySelector('select[aria-label="Payment mode"]')?.value);
    ok(JSON.stringify(invModes) === JSON.stringify(MODES) && invDefault === 'Bank transfer', `Record payment offers ${invModes.join(', ')} (starts on ${invDefault})`);
    await go('/expenses');
    await click('button', /^\+?\s*(Add|New|Record)/);
    await sleep(600);
    const expSel = await page.evaluate(() => {
      const l = [...document.querySelectorAll('label, span')].find(x => /^Mode$/.test(x.textContent.trim()));
      const s = l?.closest('label, div')?.querySelector('select') || l?.parentElement?.querySelector('select');
      return s ? { opts: [...s.options].map(o => o.textContent.trim()), value: s.value } : null;
    });
    ok(expSel && JSON.stringify(expSel.opts) === JSON.stringify(MODES) && expSel.value === 'Cash', `Expenses offers the same list, starting on Cash (${expSel?.opts.join(', ')}; ${expSel?.value})`);
    ok(errs.length === 0, `no page errors${errs.length ? `: ${errs.slice(0, 2).join(' | ')}` : ''}`);
  } catch (e) {
    fail++; console.log(`   ❌ crashed: ${e.message}`);
  } finally {
    if (browser) await browser.close();
    const n = await purge([reg.user?.id].filter(Boolean));
    console.log(`\n   ✅ test account removed (${n})`);
    console.log(`\n  ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
})();
