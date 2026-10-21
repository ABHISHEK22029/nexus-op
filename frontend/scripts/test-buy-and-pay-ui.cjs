#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   Buy and pay — the procurement and cash half of a fabricator's order
   (NEXUS_TEST_SCENARIO_FABRICATION.md, parts D and F–I), clicked through
   the real screens, with what is STORED read back after each step and not
   only what the screen says.

     1  Purchase order from Create PO: vendor, a line, GST, Net 30 terms.
        Numbered in the company's own series; value and GST right; held
        for sign-off above the Automation threshold, then signed off,
        approved and dispatched from the row's own buttons; the PO
        document totals it.
     2  Goods received from the GRN screen, a part load and then the rest.
        Stock on hand rises by exactly what arrived, on the same stock row;
        the list names the PO by its number; the PO says how far along it is.
     3  Vendor bill from "Generate Bill" on the receipt. The bill is for
        what arrived, its CGST + SGST add up to its GST, and it falls due on
        the PO's terms.
     4  Customer invoice from the order's Create invoice; a part payment
        from the invoice page. Received and Balance due to the paisa;
        Partially Paid as stored.
     5  Dashboard money tiles while the invoice and the bill are both open.
     6  Payables: the bill outstanding with its ageing; paid in part, then
        the rest; Unpaid → Partially Paid → Paid as stored.
     7  The invoice's balance received; Paid as stored.
     8  Debit note to the vendor: DN- series, CGST + SGST, total; the
        "missing invoice ref" count once the bill it is against is named.
     9  An expense from the Expenses form, stored as the form showed it.
    10  Reports: the four figures and the margin; CSV exports of sales
        invoices, purchase bills and expenses hold the rows.
    11  Notifications list the PO, its sign-off, the receipt and both
        payments, in words a person can use.
    12  At 390px: /purchase-orders, /grn, /payables, /credit-debit-notes
        (and the new-note form) do not scroll sideways.
    13  A receipt is billed once.
    14  A purchase order with two lines can be received from the GRN screen.
    And no page errors or console errors along the way.

   Its own throwaway company (buypay-*@example.test), removed at the end.
     API_BASE=http://localhost:5098 UI_BASE=http://localhost:5178 node scripts/test-buy-and-pay-ui.cjs
   Screenshots and CSV downloads go to SHOTS_DIR (default <tmp>/buypay-shots).
   ══════════════════════════════════════════════════════════════════════ */
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const os = require('os');
require(path.join(__dirname, '../../backend/node_modules/dotenv')).config({ path: path.join(__dirname, '../../backend/.env') });
const { purge, sweepStale } = require(path.join(__dirname, '../../backend/scripts/lib/testAccounts'));

const API = process.env.API_BASE || 'http://localhost:5099';
const UI = process.env.UI_BASE || 'http://localhost:5173';
if ([API, UI].some(u => /^https:|onrender\.com|vercel\.app|maksops\.co\.in/.test(u))) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}
const SHOTS = process.env.SHOTS_DIR || path.join(os.tmpdir(), 'buypay-shots');
const DL = path.join(SHOTS, 'downloads');
fs.mkdirSync(DL, { recursive: true });

const stamp = Date.now().toString(36);
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); return !!c; };
const step = (n, t) => console.log(`\n  ── ${n}. ${t}`);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const num = (s) => Number(String(s ?? '').replace(/[^\d.-]/g, ''));
const inr = (n) => `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const istDay = (offset = 0) => new Date(Date.now() + 5.5 * 3600e3 + offset * 86400e3).toISOString().slice(0, 10);
const FY = (() => {
  const d = new Date(Date.now() + 5.5 * 3600e3);
  const y = d.getUTCFullYear() - (d.getUTCMonth() < 3 ? 1 : 0);
  return `FY${y}-${String((y + 1) % 100).padStart(2, '0')}`;
})();

/* A small CSV reader: quoted fields, doubled quotes, commas and newlines inside quotes. */
function parseCsv(text) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
    else if (c !== '\r') f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  const [head = [], ...body] = rows;
  return { head, rows: body.map(r => Object.fromEntries(head.map((h, i) => [h, r[i]]))) };
}

let TOKEN = null;
const raw = async (method, url, body) => {
  const r = await fetch(`${API}${url}`, { method, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const api = async (method, url, body) => {
  const { status, body: b } = await raw(method, url, body);
  if (status >= 400) throw new Error(`${method} ${url} → ${status} ${b.error || ''}`);
  return b;
};
/* Poll the API until fn returns something truthy (or time runs out). */
const until = async (fn, ms = 15000) => {
  const end = Date.now() + ms; let v = null;
  while (Date.now() < end) { v = await fn().catch(() => null); if (v) return v; await sleep(600); }
  return v;
};

(async () => {
  const ids = [];
  let browser;
  try {
    await sweepStale('buypay-').catch(() => 0);
    const reg = await (await fetch(`${API}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Priya (Buy & Pay)', email: `buypay-${stamp}@example.test`, password: 'testpassword123' }) })).json();
    if (!reg.token) throw new Error(`could not register: ${JSON.stringify(reg).slice(0, 200)}`);
    ids.push(reg.user.id);
    TOKEN = reg.token;

    /* ── masters, through the API ── */
    const vendName = `Sunrise Steel Supplies ${stamp}`;
    const custName = `BuildRight Infra ${stamp}`;
    const bpName = `Base Plate ${stamp}`;
    const caName = `V-Type Cross-Arm ${stamp}`;
    const angleName = `MS Angle 50x50x6 ${stamp}`;
    await api('PUT', '/company-profile', {
      name: 'Shakti Steel Fabricators Pvt. Ltd.', gstin: '36ABCDE1234F1Z5', pan: 'ABCDE1234F', stateCode: '36',
      address: 'Plot 7, IDA Balanagar, Hyderabad, Telangana 500037', phone: '040 2345 6789', email: 'accounts@shakti.example.test',
      bank_name: 'HDFC Bank', bank_account_name: 'Shakti Steel Fabricators', bank_account_no: '50200012345678',
      bank_ifsc: 'HDFC0001234', bank_branch: 'Balanagar', setup_completed_at: new Date().toISOString(),
    });
    /* POs above ₹20,000 wait for sign-off. */
    await api('PUT', '/automation-settings', { po_approval_threshold: 20000 });
    const cust = await api('POST', '/customers', { name: custName, gstin: '36AABCB1234C1Z1', state: 'Telangana',
      billing_address: 'Plot 12, IDA Jeedimetla, Hyderabad 500055', payment_terms_days: 30 });
    const vend = await api('POST', '/vendors', { name: vendName, type: 'Supplier', gstin: '36PQRSX6789K1Z2', pan: 'PQRSX6789K',
      state: 'Telangana', city: 'Hyderabad' });
    await api('POST', '/raw-materials', { name: angleName, material_code: `ANG-${stamp}`, unit: 'kg', base_uom: 'kg', standard_rate: 62, hsn: '7216' });
    const skuCA = await api('POST', '/skus', { sku_code: `CA-VT-${stamp}`, name: caName, unit: 'nos', price: 850, hsn: '7308' });
    const skuBP = await api('POST', '/skus', { sku_code: `BP-01-${stamp}`, name: bpName, unit: 'nos', price: 450, hsn: '7308' });
    /* Five base plates already on the shelf, so a receipt has a row to add to. */
    await api('POST', '/inventory', { skuId: skuBP.id, quantity: 5, unitCost: 440 });
    const stockRow = async () => {
      const d = await api('GET', `/inventory?limit=200&search=${encodeURIComponent(bpName)}`);
      return (d.items || d).filter(r => r.itemName === bpName);
    };

    /* ── the browser ── */
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const errs = [], consoleErrs = [], expectedFailures = [];
    page.on('pageerror', e => errs.push(e.message));
    page.on('console', m => {
      if (m.type() !== 'error') return;
      const url = m.location()?.url || '';
      if (/Failed to load resource/.test(m.text()) && expectedFailures.some(rx => rx.test(url))) return;
      consoleErrs.push(`${m.text().replace(/\s+/g, ' ').slice(0, 220)}${url ? ` @ ${url}` : ''}`);
    });
    const dialogs = [];
    page.on('dialog', d => { dialogs.push(d.message()); d.accept().catch(() => {}); });
    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto(`${UI}/login`);
    await page.evaluate((t, u) => { localStorage.setItem('nexus_token', t); localStorage.setItem('nexus_user', JSON.stringify(u)); localStorage.removeItem('nexus_active_project'); }, TOKEN, reg.user);

    const waitFor = (fn, ms = 15000, ...a) => page.waitForFunction(fn, { timeout: ms }, ...a).then(() => true).catch(() => false);
    const waitText = (re, ms = 15000) => waitFor((src) => new RegExp(src).test(document.body.innerText), ms, re.source);
    const settle = (ms = 700) => sleep(ms);
    const go = async (p, re) => { await page.goto(`${UI}${p}`, { waitUntil: 'networkidle2' }); if (re) await waitText(re); await settle(); };
    const click = (sel, re) => page.evaluate((s, src) => {
      const el = [...document.querySelectorAll(s)].find(e => new RegExp(src).test(e.textContent));
      if (el) el.click();
      return !!el;
    }, sel, re.source);
    /* A button in the table row that shows `rowRe`. */
    const rowClick = (rowRe, btnRe) => page.evaluate((r, b) => {
      const tr = [...document.querySelectorAll('tr')].find(t => new RegExp(r).test(t.innerText));
      const btn = tr && [...tr.querySelectorAll('button')].find(x => new RegExp(b).test(x.textContent));
      if (btn) btn.click();
      return !!btn;
    }, rowRe.source, btnRe.source);
    const rowText = (rowRe) => page.evaluate((r) => [...document.querySelectorAll('tr')].find(t => new RegExp(r).test(t.innerText))?.innerText.replace(/\s+/g, ' ').trim() || '', rowRe.source);
    /* Mark the form (or panel) that contains `re`, so fields can be found inside it. */
    const mark = (sel, re, name) => page.evaluate((s, src, n) => {
      const el = [...document.querySelectorAll(s)].reverse().find(e => new RegExp(src).test(e.innerText));
      if (el) el.setAttribute('data-bp', n);
      return !!el;
    }, sel, re.source, name);
    /* The input or select a label names, inside a marked scope. */
    const ctl = async (scope, labelRe) => {
      const h = await page.evaluateHandle((sc, src) => {
        const root = document.querySelector(`[data-bp="${sc}"]`) || document;
        const lab = [...root.querySelectorAll('label')].find(l => new RegExp(src).test(l.textContent.trim()));
        if (!lab) return null;
        const n = lab.nextElementSibling;
        if (n && /^(INPUT|SELECT|TEXTAREA)$/.test(n.tagName)) return n;
        return lab.parentElement.querySelector('input,select,textarea');
      }, scope, labelRe.source);
      const el = h.asElement();
      if (!el) throw new Error(`no field labelled ${labelRe} in ${scope}`);
      return el;
    };
    const fill = async (el, v) => {
      await el.click({ clickCount: 3 });
      await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control');
      await page.keyboard.press('Backspace');
      if (v !== '') await el.type(String(v));
    };
    /* Dates go in through the value setter: typing into a date box depends on the browser's locale. */
    const setValue = (el, v) => el.evaluate((e, val) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, val);
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    }, v);
    const pickOption = async (sel, textRe) => {
      const v = await sel.evaluate((s, src) => [...s.options].find(o => new RegExp(src).test(o.textContent))?.value, textRe.source);
      if (v == null) throw new Error(`no option ${textRe}`);
      await sel.select(v);
      return v;
    };
    const toasts = () => page.evaluate(() => [...document.querySelectorAll('[role="status"],[role="alert"]')].map(e => e.innerText.trim()).filter(Boolean));
    const waitToast = (re, ms = 15000) => waitFor((src) => [...document.querySelectorAll('[role="status"],[role="alert"]')].some(e => new RegExp(src).test(e.innerText)), ms, re.source);
    /* A figure shown under its label: label div → the value next to it (text, and the exact figure in its title). */
    const tile = (label) => page.evaluate((l) => {
      const d = [...(document.querySelector('main') || document.body).querySelectorAll('div,span')].find(x => x.textContent.trim() === l && x.nextElementSibling);
      const v = d?.nextElementSibling;
      return v ? { text: v.textContent.trim(), exact: v.getAttribute('title') || v.querySelector('[title]')?.getAttribute('title') || v.textContent.trim() } : null;
    }, label);
    const shot = (n) => page.screenshot({ path: path.join(SHOTS, `${n}.png`), fullPage: true }).catch(() => {});
    /* Elements that push the page wider than the screen, outside any scrolling box of their own. */
    const overflow = () => page.evaluate(() => {
      const w = innerWidth;
      const culprits = [...document.querySelectorAll('body *')].filter(e => {
        const r = e.getBoundingClientRect();
        if (r.right <= w + 1 || r.width === 0) return false;
        if (getComputedStyle(e).position === 'fixed') return false;
        for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) {
          if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(a).overflowX)) return false;
        }
        return true;
      });
      const outer = culprits.filter(e => !culprits.includes(e.parentElement)).slice(0, 3)
        .map(e => `<${e.tagName.toLowerCase()}> “${(e.innerText || e.value || '').replace(/\s+/g, ' ').slice(0, 40)}” right=${Math.round(e.getBoundingClientRect().right)}`);
      return { sw: document.documentElement.scrollWidth, w, outer };
    });

    /* ═════════════════════════════════════════════════════════════════ */
    step(1, 'Purchase order, from Create PO');
    await go('/purchase-orders', /Order from your vendors/);
    await click('button', /Create PO/);
    ok(await waitFor(() => [...document.querySelectorAll('form')].some(f => /New Purchase Order/.test(f.innerText))), 'Create PO opens the order form');
    await mark('form', /New Purchase Order/, 'po');
    await waitFor((n) => [...document.querySelectorAll('[data-bp="po"] select option')].some(o => o.textContent.includes(n)), 15000, vendName);
    await pickOption(await ctl('po', /^Vendor/), new RegExp(esc(vendName)));
    const poTitle = `Base plates for BuildRight ${stamp}`;
    await fill(await ctl('po', /^GST Rate/), '18');
    await fill(await ctl('po', /^PO Title/), poTitle);
    await fill(await ctl('po', /^Quote Reference/), 'SSS/Q/2026/112');
    {
      const row = await page.$('[data-bp="po"] tbody tr');
      const [desc, hsn] = await row.$$('input[type="text"]');
      const [qty, rate] = await row.$$('input[type="number"]');
      await fill(desc, bpName); await fill(hsn, '7308'); await fill(qty, '50'); await fill(rate, '451.15');
    }
    await (await ctl('po', /^Payment Terms/)).select('Net 30 Days');
    await settle(400);
    const poForm = await page.evaluate(() => {
      const f = document.querySelector('[data-bp="po"]');
      return { note: f.innerText.match(/Intra-state[^\n]*|Inter-state[^\n]*/)?.[0] || '', summary: f.querySelector('.w-64')?.innerText || '' };
    });
    ok(/Intra-state \(CGST 9% \+ SGST 9%\)/.test(poForm.note), `a Telangana vendor for a Telangana company is intra-state: “${poForm.note}”`);
    const poFig = poForm.summary.match(/₹[\d,]+(\.\d+)?/g) || [];
    ok(/PO Value:\s*₹26,617\.85/.test(poForm.summary), `the form shows the PO value with GST, ₹26,617.85 (${poForm.summary.replace(/\s+/g, ' ')})`);
    ok(poFig.length >= 4 && poFig.every(f => /^₹[\d,]+(\.\d{2})?$/.test(f)),
      `and every figure in the totals is written to the paisa, two decimals (${poFig.join(' · ')})`);
    ok(poFig.length === 4 && r2(num(poFig[0]) + num(poFig[1]) + num(poFig[2])) === num(poFig[3]),
      `and the lines add up: ${poFig.slice(0, 3).join(' + ')} = ${inr(r2(num(poFig[0]) + num(poFig[1]) + num(poFig[2])))} against a PO value of ${poFig[3]}`);
    await shot('01-po-form');
    await click('[data-bp="po"] button[type="submit"]', /Raise Order/);
    ok(await waitToast(/Purchase Order created/), 'Raise Order says “Purchase Order created”');
    const po = await until(async () => (await api('GET', '/po?limit=50')).items.find(p => p.itemName === poTitle));
    if (!po) throw new Error('the PO was not saved');
    const poLines = await api('GET', `/po/${po.id}/items`);
    ok(new RegExp(`^SSF/${FY}/001$`).test(po.poNumber), `numbered in the company's series: ${po.poNumber} (expected SSF/${FY}/001)`);
    const l1 = poLines[0] || {};
    ok(poLines.length === 1 && l1.description === bpName && Number(l1.quantity) === 50 && Number(l1.unitPrice) === 451.15 && l1.hsn === '7308' && l1.uom === 'nos',
      `its line is stored as entered: ${l1.quantity} ${l1.uom} × ₹${l1.unitPrice}, HSN ${l1.hsn}`);
    const poSub = r2(poLines.reduce((s, l) => s + Number(l.quantity) * Number(l.unitPrice), 0));
    ok(Number(po.gst_rate) === 18 && poSub === 22557.5 && r2(poSub + r2(poSub * 0.18)) === 26617.85,
      `GST 18% on ₹22,557.50 → ₹26,617.85 (stored gst_rate ${po.gst_rate})`);
    ok(po.paymentTerms === 'Net 30 Days' && po.quoteRef === 'SSS/Q/2026/112', `terms and quote ref kept (${po.paymentTerms}, ${po.quoteRef})`);
    ok(po.approval_status === 'Pending Approval', `₹22,557.50 is over the ₹20,000 limit, so it waits for sign-off (${po.approval_status})`);
    const poSummary = (await api('GET', '/po?limit=25')).summary || {};
    ok(r2(poSummary.value) === poSub, `the list's Order Value counts this PO's ₹22,557.50 (summary.value = ${poSummary.value}; header unitPrice = ${po.unitPrice})`);
    await waitFor((n) => document.body.innerText.includes(n), 15000, po.poNumber);
    const ovTile = await tile('Order Value');
    ok(ovTile && num(ovTile.exact) === poSub, `the Order Value tile on screen reads ₹22,557.50 (shows ${ovTile?.text})`);
    const row1 = await rowText(new RegExp(esc(po.poNumber)));
    ok(/Needs sign-off/.test(row1) && /Sign off/.test(row1), `the row shows its number and “Needs sign-off”, with Sign off (${row1.slice(0, 120)})`);

    await rowClick(new RegExp(esc(po.poNumber)), /Sign off/);
    const signed = await until(async () => (await api('GET', `/po/${po.id}`)).approval_status === 'Approved');
    ok(signed, 'Sign off on the row records the sign-off');
    await waitToast(/PO /, 5000);
    const signToast = (await toasts()).join(' | ');
    console.log(`   ↪  Sign off said “${signToast}”; the PO is still ${(await api('GET', `/po/${po.id}`)).status} and needs Approve next`);
    await waitFor((n) => [...document.querySelectorAll('tr')].some(t => t.innerText.includes(n) && [...t.querySelectorAll('button')].some(b => b.textContent.trim() === 'Approve')), 15000, po.poNumber);
    await rowClick(new RegExp(esc(po.poNumber)), /^\s*Approve\s*$/);
    ok(await until(async () => (await api('GET', `/po/${po.id}`)).status === 'Approved'), 'Approve on the row moves it to Approved');
    await waitFor((n) => [...document.querySelectorAll('tr')].some(t => t.innerText.includes(n) && /Dispatch/.test(t.innerText)), 15000, po.poNumber);
    await rowClick(new RegExp(esc(po.poNumber)), /Dispatch/);
    ok(await until(async () => (await api('GET', `/po/${po.id}`)).status === 'Dispatched'), 'Dispatch on the row moves it to Dispatched');
    await waitToast(/PO dispatch/);
    const dispToast = (await toasts()).find(t => /PO dispatch/.test(t)) || '';
    ok(dispToast === 'PO dispatched', `and says so in English: “${dispToast}”`);
    await shot('01-po-list');
    await go(`/po/${po.id}`);
    ok(await waitText(/26,617\.85/), 'the PO document totals ₹26,617.85');

    /* ═════════════════════════════════════════════════════════════════ */
    step(2, 'Goods received, a part load and then the rest');
    const [s0] = await stockRow();
    ok(s0 && Number(s0.quantity) === 5, `${bpName}: ${s0?.quantity} on hand before the delivery`);
    const receive = async (qty, vehicle, batch) => {
      await go('/grn', /Book what arrived at the gate/);
      await waitFor((id) => [...document.querySelectorAll('form select option')].some(o => o.value === String(id)), 15000, po.id);
      await page.select('select[aria-label="Purchase order"]', String(po.id));
      await waitFor(() => /to come/.test(document.querySelector('input[aria-label="Quantity received"]')?.placeholder || ''), 10000);
      await fill(await page.$('input[placeholder="TS 09 EU 1234"]'), vehicle);
      await fill(await page.$('input[placeholder="B-2026"]'), batch);
      await fill(await page.$('input[aria-label="Quantity received"]'), String(qty));
      await settle(300);
      const warn = await page.evaluate(() => document.body.innerText.match(/Less than the [^\n]*still to come[^\n]*/)?.[0] || '');
      await click('form button', /Generate GRN/);
      const done = await waitToast(/GRN generated/);
      return { warn, done };
    };
    const g1 = await receive(30, 'TS09EU1234', 'B-2610-A');
    ok(g1.done, 'Generate GRN with 30 of 50 says “GRN generated”');
    ok(/Less than the 50\b/.test(g1.warn), `and said first that it is less than the 50 still to come (“${g1.warn}”)`);
    const grn1 = await until(async () => (await api('GET', '/grn')).find(g => g.poId === po.id && Number(g.receivedQuantity) === 30));
    ok(grn1 && grn1.vehicleNumber === 'TS09EU1234' && grn1.batchNumber === 'B-2610-A', `the receipt is stored with its vehicle and batch (${grn1?.vehicleNumber}, ${grn1?.batchNumber})`);
    const s1 = await until(async () => { const r = await stockRow(); return r.length && Number(r[0].quantity) === 35 ? r : null; }) || await stockRow();
    ok(s1.length === 1 && s1[0].id === s0.id && Number(s1[0].quantity) === 35, `stock on hand rose by exactly 30, on the same row: 5 → ${s1.map(r => r.quantity).join(' + ')}`);
    const po1 = await api('GET', `/po/${po.id}`);
    ok(po1.status === 'Partially Received' && Number(po1.received_quantity) === 30, `the PO is Partially Received, 30 of 50 (${po1.status}, ${po1.received_quantity})`);
    await waitFor((n) => (document.querySelector('table')?.innerText || '').includes(n), 15000, po.poNumber);
    const grnRow = await rowText(/TS09EU1234/);
    ok(grnRow.includes(po.poNumber), `the GRN list names the PO by its number (${grnRow.slice(0, 90)})`);
    ok(/^GRN-0*1\b/.test(grnRow), `and the receipt is the company's first in its own series, GRN-00001 (shows ${grnRow.split(' ')[0]}, the database id ${grn1?.id})`);
    const led = await api('GET', `/inventory/${s0.id}/movements`);
    const mv = (led.ledger || []).find(m => m.ref_type === 'grn' && m.ref_id === grn1?.id);
    ok(mv && Number(mv.unit_cost) === 451.15, `the receipt is costed at the PO rate, ₹451.15 a plate (stock movement unit_cost = ${mv?.unit_cost})`);
    await shot('02-grn-part');
    await go('/purchase-orders', /Order from your vendors/);
    await waitFor((n) => document.body.innerText.includes(n), 15000, po.poNumber);
    const pr = await rowText(new RegExp(esc(po.poNumber)));
    ok(/Partially Received/i.test(pr), `the PO list shows it Partially Received (row: “${pr.slice(0, 110)}”)`);
    await shot('02-po-list-partially-received');

    const g2 = await receive(20, 'TS09EU5678', 'B-2610-B');
    ok(g2.done, 'the remaining 20 are received');
    ok(!g2.warn, `with no short-delivery warning, as 30 + 20 is the whole order (it said “${g2.warn}”)`);
    const s2 = await until(async () => { const r = await stockRow(); return r.length && Number(r[0].quantity) === 55 ? r : null; }) || await stockRow();
    ok(s2.length === 1 && Number(s2[0].quantity) === 55, `stock rose by exactly 20 more: ${s2.map(r => r.quantity).join(' + ')}`);
    const po2 = await api('GET', `/po/${po.id}`);
    ok(po2.status === 'Delivered' && Number(po2.received_quantity) === 50, `the PO is Delivered, 50 of 50 (${po2.status})`);
    await go('/grn', /Book what arrived at the gate/);
    await settle(1500);
    ok(await page.evaluate((id) => ![...document.querySelectorAll('form select option')].some(o => o.value === String(id)), po.id), 'and is no longer offered for a receipt');

    /* ═════════════════════════════════════════════════════════════════ */
    step(3, 'The vendor bill, from Generate Bill on the receipt');
    await waitFor(() => /TS09EU1234/.test(document.querySelector('table')?.innerText || ''));
    await rowClick(/TS09EU1234/, /Generate Bill/);
    ok(await waitFor(() => /\/grn\/\d+\/bill$/.test(location.pathname)) && await waitText(/Vendor bill/), 'Generate Bill opens the bill builder');
    const head = await page.evaluate(() => [...document.querySelectorAll('p')].find(p => /For GRN-/.test(p.innerText))?.innerText || '');
    ok(head.includes(po.poNumber) && head.includes(vendName), `it says which PO and vendor (“${head}”)`);
    await mark('div', /Bill Date[\s\S]*GST Type/, 'billhead');
    const pre = await page.evaluate(() => [...document.querySelectorAll('tbody tr')].map(tr => [...tr.querySelectorAll('input')].map(i => i.value)));
    ok(pre.length === 1 && pre[0][0] === bpName && Number(pre[0][3]) === 451.15, `the line comes from the PO: ${pre.map(r => `${r[2]} × ${r[0]} @ ${r[3]}`).join('; ')}`);
    ok(pre.length === 1 && Number(pre[0][2]) === 30, `and is for what this receipt brought, 30 (prefilled ${pre[0]?.[2]})`);
    const gstRateVal = await (await ctl('billhead', /^GST Rate/)).evaluate(e => e.value);
    const gstType = await (await ctl('billhead', /^GST Type/)).evaluate(e => e.value);
    ok(Number(gstRateVal) === 18 && gstType === 'cgstsgst', `GST 18%, intra-state, taken from the PO (${gstRateVal}%, ${gstType})`);
    await setValue(await ctl('billhead', /^Bill Date/), istDay());
    await fill(await ctl('billhead', /^Vendor Bill Ref/), 'SSS/INV/2026/0457');
    {
      const qtyIn = (await (await page.$('tbody tr')).$$('input[type="number"]'))[0];
      await fill(qtyIn, '30');
    }
    await mark('div', /Charges & Adjustments[\s\S]*Freight/, 'charges');
    await fill(await ctl('charges', /^Freight/), '500');
    await settle(400);
    const netShown = await page.evaluate(() => [...document.querySelectorAll('div')].find(d => /^Net Payable/.test(d.innerText.trim()) && d.children.length === 2)?.children[1]?.innerText || '');
    ok(netShown === '₹16,560.71', `Net Payable: 30 × ₹451.15 + ₹500 freight + 18% GST = ₹16,560.71 (shows ${netShown})`);
    await shot('03-bill-builder');
    await click('button', /^\s*Create Bill\s*$/);
    ok(await waitFor(() => /\/grn-bills\/\d+$/.test(location.pathname)), 'Create Bill saves it and opens the bill');
    const billId = Number(page.url().match(/grn-bills\/(\d+)/)?.[1]);
    const bill = await api('GET', `/grn-bills/${billId}`);
    ok(bill.bill_number === 'GB-0001', `numbered ${bill.bill_number} (the company's first)`);
    ok(r2(bill.sub_total) === 13534.5 && r2(bill.freight) === 500 && r2(bill.gst_total) === 2526.21 && r2(bill.net_amount) === 16560.71,
      `stored: sub-total ${bill.sub_total}, freight ${bill.freight}, GST ${bill.gst_total}, net payable ${bill.net_amount}`);
    ok(r2(Number(bill.cgst) + Number(bill.sgst)) === r2(bill.gst_total) && Number(bill.igst) === 0,
      `CGST + SGST add up to the GST: ${bill.cgst} + ${bill.sgst} = ${r2(Number(bill.cgst) + Number(bill.sgst))} against ${bill.gst_total}`);
    ok(bill.vendor_bill_ref === 'SSS/INV/2026/0457' && bill.bill_date === istDay() && bill.vendor_id === vend.id && bill.po_id === po.id && bill.grn_id === grn1?.id,
      'the vendor’s bill ref, the date, the vendor, PO and receipt are on it');
    ok(bill.due_date === istDay(30), `it falls due on the PO's terms, Net 30 → ${istDay(30)} (due_date = ${bill.due_date})`);
    ok(await waitText(/16,560\.71/), 'the bill page shows the net payable');
    const printed = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.inv-totals-table tr')]
      .map(tr => [tr.querySelector('.tl')?.textContent.trim().replace(/ @ .*$/, ''), tr.querySelector('.tv')?.textContent.trim()])));
    const printedSum = r2(['SUB-TOTAL', 'FREIGHT', 'CGST', 'SGST'].reduce((s, k) => s + num(printed[k]), 0));
    ok(printedSum === num(printed['NET PAYABLE']),
      `and the printed bill adds up: ${['SUB-TOTAL', 'FREIGHT', 'CGST', 'SGST'].map(k => printed[k]).join(' + ')} = ${printedSum.toFixed(2)} against NET PAYABLE ${printed['NET PAYABLE']}`);
    await shot('03-bill-doc');

    /* ═════════════════════════════════════════════════════════════════ */
    step(4, 'Customer invoice from the order, and a part payment');
    const order = await api('POST', '/customer-orders', { customerId: cust.id, orderDate: istDay(), items: [
      { skuId: skuCA.id, description: caName, quantity: 200, unit: 'nos', rate: 850, hsn: '7308' },
      { skuId: skuBP.id, description: bpName, quantity: 50, unit: 'nos', rate: 452.35, hsn: '7308' },
    ] });
    await go(`/customer-orders/${order.id}/invoice`);
    await waitFor(() => !!document.querySelector('input[aria-label="Line 2 description"]'));
    await settle(800);
    await page.evaluate(() => [...document.querySelectorAll('button.btn-primary')].find(b => /Create invoice/.test(b.textContent))?.click());
    ok(await waitFor(() => /\/sales-invoices\/\d+$/.test(location.pathname), 20000), 'Create invoice on the order saves it and opens the invoice');
    const invId = Number(page.url().match(/sales-invoices\/(\d+)/)?.[1]);
    const inv = await api('GET', `/sales-invoices/${invId}`);
    ok(inv.invoice_number === 'INV-0001' && r2(inv.sub_total) === 192617.5 && r2(inv.gst_total) === 34671.15 && r2(inv.net_amount) === 227288.65,
      `${inv.invoice_number}: ₹1,92,617.50 + 18% GST = ₹2,27,288.65 (stored ${inv.sub_total} + ${inv.gst_total} = ${inv.net_amount})`);
    ok(!inv.interstate && r2(Number(inv.cgst) + Number(inv.sgst)) === r2(inv.gst_total) && Number(inv.igst) === 0 && /Telangana/.test(inv.place_of_supply || ''),
      `CGST + SGST for a Telangana customer: ${inv.cgst} + ${inv.sgst}, place of supply ${inv.place_of_supply}`);
    await waitText(/Record payment/);
    const tiles = async () => ({ total: await tile('Invoice Total'), received: await tile('Received'), due: await tile('Balance Due'),
      status: await page.evaluate(() => { const e = document.querySelector('[aria-label="Invoice status"]'); return e?.tagName === 'SELECT' ? e.value : e?.textContent.trim(); }) });
    let t0 = await tiles();
    ok(t0.total?.text === '₹2,27,288.65' && t0.received?.text === '₹0.00' && t0.due?.text === '₹2,27,288.65',
      `before any payment: total ${t0.total?.text}, received ${t0.received?.text}, balance due ${t0.due?.text}`);
    const pay = async (amount, mode, ref) => {
      await fill(await page.$('input[aria-label="Payment amount"]'), String(amount));
      await page.select('select[aria-label="Payment mode"]', mode);
      await fill(await page.$('input[aria-label="Payment reference"]'), ref);
      await setValue(await page.$('input[aria-label="Payment date"]'), istDay());
      await click('button.btn-primary', /^\s*Add\s*$/);
    };
    await pay(100000, 'Bank transfer', 'UTR-HDFC-771');
    ok(await waitToast(/Payment recorded — Partially Paid/), 'Add records ₹1,00,000 and says “Partially Paid”');
    await waitFor(() => /1,00,000\.00/.test(document.body.innerText));
    t0 = await tiles();
    ok(t0.received?.text === '₹1,00,000.00' && t0.due?.text === '₹1,27,288.65', `Received ${t0.received?.text}, Balance due ${t0.due?.text}`);
    ok(r2(num(t0.total?.text) - num(t0.received?.text)) === num(t0.due?.text), 'Balance due is the total less what was received, to the paisa');
    ok(t0.status === 'Partially Paid', `the status reads ${t0.status}`);
    const invP = await api('GET', `/sales-invoices/${invId}`);
    const p1 = (invP.payments || [])[0] || {};
    ok(invP.status === 'Partially Paid' && r2(invP.amount_paid) === 100000 && p1.mode === 'Bank transfer' && p1.reference === 'UTR-HDFC-771' && p1.paid_date === istDay(),
      `stored: ${invP.status}, ₹${invP.amount_paid} received, ${p1.mode} ${p1.reference} on ${p1.paid_date}`);
    await shot('04-invoice-part-paid');

    /* ═════════════════════════════════════════════════════════════════ */
    step(5, 'Dashboard, with the invoice and the bill both open');
    await go('/dashboard', /Everything at a glance/);
    await waitFor(() => [...document.querySelectorAll('.dash-kpi-value')].some(v => /₹/.test(v.textContent)), 20000);
    await settle(800);
    const kpis = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.dash-kpi')].map(k => [
      k.querySelector('.dash-kpi-label')?.textContent.trim(),
      { text: k.querySelector('.dash-kpi-value')?.textContent.trim(), exact: k.querySelector('.dash-kpi-value [title]')?.getAttribute('title') || k.querySelector('.dash-kpi-value')?.textContent.trim() }])));
    ok(num(kpis['Billed this year']?.exact) === 227288.65, `Billed this year ${kpis['Billed this year']?.text} (exact ${kpis['Billed this year']?.exact})`);
    ok(num(kpis['Received this year']?.exact) === 100000, `Received this year ${kpis['Received this year']?.text}`);
    ok(num(kpis.Outstanding?.exact) === 127288.65, `Outstanding (owed by customers) ${kpis.Outstanding?.text} (exact ${kpis.Outstanding?.exact})`);
    const owedTile = Object.entries(kpis).find(([k]) => /payable|owe|vendor bills|to pay/i.test(k));
    ok(owedTile && num(owedTile[1].exact) === 16560.71, `and what is owed to vendors, ₹16,560.71 (${owedTile ? `${owedTile[0]}: ${owedTile[1].text}` : `no such tile; tiles are: ${Object.keys(kpis).join(', ')}`})`);
    await shot('05-dashboard');

    /* ═════════════════════════════════════════════════════════════════ */
    step(6, 'Payables: the bill outstanding, paid in part and then in full');
    await go('/payables', /What you owe your vendors/);
    await waitFor(() => /GB-0001/.test(document.body.innerText));
    const tp = await tile('Total payable');
    const age = await tile('0-30 days');
    ok(num(tp?.exact) === 16560.71 && num(age?.exact) === 16560.71, `Total payable ${tp?.text}, all of it in the 0-30 days bucket (${age?.text})`);
    let br = await rowText(/GB-0001/);
    ok(br.includes(vendName) && br.includes('₹16,560.71') && /Unpaid/.test(br), `the row: ${br}`);
    const payBill = async (amount, mode, ref) => {
      await rowClick(/GB-0001/, /^\s*Pay\s*$/);
      await waitFor(() => [...document.querySelectorAll('div')].some(d => d.textContent.trim() === 'Record payment'));
      await mark('div', /^Record payment[\s\S]*Amount ₹/, 'paymodal');
      const amt = await ctl('paymodal', /^Amount/);
      const prefilled = await amt.evaluate(e => e.value);
      if (amount != null) await fill(amt, String(amount));
      await (await ctl('paymodal', /^Mode/)).select(mode);
      await setValue(await ctl('paymodal', /^Date/), istDay());
      await fill(await ctl('paymodal', /^Reference/), ref);
      await click('[data-bp="paymodal"] button', /^\s*Record payment\s*$/);
      return prefilled;
    };
    const pre1 = await payBill(10000, 'Bank transfer', 'UTR-NEFT-0001');
    ok(Number(pre1) === 16560.71, `Pay opens with the outstanding amount filled in (${pre1})`);
    ok(await waitToast(/bill is now Partially Paid/), 'paying ₹10,000 says “bill is now Partially Paid”');
    const b1 = await until(async () => { const b = await api('GET', `/grn-bills/${billId}`); return b.payment_status === 'Partially Paid' ? b : null; });
    const ap1 = await api('GET', '/payables');
    ok(b1 && r2(b1.amount_paid) === 10000 && r2(ap1.totalOutstanding) === 6560.71, `stored: Partially Paid, ₹${b1?.amount_paid} paid, ₹${ap1.totalOutstanding} still owed`);
    await waitFor(() => /6,560\.71/.test(document.body.innerText));
    br = await rowText(/GB-0001/);
    ok(/₹10,000/.test(br) && /₹6,560\.71/.test(br) && /Partially Paid/.test(br), `the row now: ${br}`);
    const pre2 = await payBill(null, 'Cheque', 'CHQ 004512');
    ok(Number(pre2) === 6560.71, `Pay again opens with the ₹6,560.71 left (${pre2})`);
    ok(await waitToast(/bill is now Paid/), 'paying it says “bill is now Paid”');
    const b2 = await until(async () => { const b = await api('GET', `/grn-bills/${billId}`); return b.payment_status === 'Paid' ? b : null; });
    ok(b2 && r2(b2.amount_paid) === 16560.71 && (b2.payments || []).map(p => `${p.mode}:${p.amount}`).join() === 'Bank transfer:10000,Cheque:6560.71',
      `stored: Paid, ₹${b2?.amount_paid}, payments ${(b2?.payments || []).map(p => `${p.mode} ₹${p.amount}`).join(' + ')}`);
    ok(await waitText(/Nothing outstanding/), 'and Payables has nothing outstanding');
    await shot('06-payables-paid');

    /* ═════════════════════════════════════════════════════════════════ */
    step(7, 'The invoice balance received');
    await go(`/sales-invoices/${invId}`, /Record payment/);
    await pay(127288.65, 'UPI', 'UPI-REF-99812');
    ok(await waitToast(/Payment recorded — Paid/), 'Add records the ₹1,27,288.65 balance and says “Paid”');
    await waitFor(() => /2,27,288\.65[\s\S]*2,27,288\.65/.test(document.body.innerText) && !document.querySelector('input[aria-label="Payment amount"]'));
    const t2 = await tiles();
    ok(t2.received?.text === '₹2,27,288.65' && t2.due?.text === '₹0.00' && r2(num(t2.total?.text) - num(t2.received?.text)) === num(t2.due?.text),
      `Received ${t2.received?.text}, Balance due ${t2.due?.text} — total less received, to the paisa`);
    ok(t2.status === 'Paid' && !(await page.$('input[aria-label="Payment amount"]')), `the status reads ${t2.status} and there is no payment box left`);
    const invF = await api('GET', `/sales-invoices/${invId}`);
    ok(invF.status === 'Paid' && r2(invF.amount_paid) === 227288.65 && (invF.payments || []).length === 2, `stored: ${invF.status}, ₹${invF.amount_paid} in ${invF.payments?.length} payments`);
    await shot('07-invoice-paid');

    /* ═════════════════════════════════════════════════════════════════ */
    step(8, 'A debit note to the vendor — one plate arrived damaged');
    await go('/credit-debit-notes', /Credit & Debit Notes/);
    await click('button', /New Note/);
    await waitFor(() => [...document.querySelectorAll('form')].some(f => /Debit Note/.test(f.innerText)));
    await click('form button', /Debit Note/);
    await settle(300);
    await mark('form', /Debit Note/, 'note');
    const partySel = await ctl('note', /^Vendor/);
    await waitFor((n) => [...document.querySelectorAll('[data-bp="note"] select option')].some(o => o.textContent.includes(n)), 15000, vendName);
    await pickOption(partySel, new RegExp(esc(vendName)));
    await fill(await ctl('note', /^Against/), 'GB-0001');
    await setValue(await ctl('note', /^Note date$/), istDay());
    await fill(await ctl('note', /^GST %/), '18');
    await fill(await ctl('note', /^Reason/), '1 base plate damaged');
    await fill(await ctl('note', /^Description/), `${bpName} — damaged in transit`);
    await fill(await ctl('note', /^HSN/), '7308');
    await fill(await ctl('note', /^Qty/), '1');
    await fill(await ctl('note', /^Rate/), '451.15');
    await settle(300);
    const noteTotal = await page.evaluate(() => document.querySelector('[data-bp="note"]').innerText.match(/Total \(incl\. GST\):\s*(₹[\d,.]+)/)?.[1]);
    ok(noteTotal === '₹532.36', `the form totals ₹451.15 + 18% = ₹532.36 (shows ${noteTotal})`);
    await shot('08-debit-note-form');
    await click('[data-bp="note"] button[type="submit"]', /Create Note/);
    ok(await waitToast(/DN-0001 created/), 'Create Note says “DN-0001 created”');
    const notes = await until(async () => { const d = await api('GET', '/credit-debit-notes?limit=25'); return d.items?.length ? d : null; });
    const dn = notes?.items?.[0] || {};
    ok(dn.note_number === 'DN-0001' && dn.note_type === 'debit' && dn.party_type === 'vendor' && dn.party_id === vend.id,
      `stored as ${dn.note_number}, a ${dn.note_type} note to the vendor`);
    ok(r2(dn.sub_total) === 451.15 && r2(dn.gst_total) === 81.21 && r2(dn.total) === 532.36 && !dn.interstate && r2(Number(dn.cgst) + Number(dn.sgst)) === 81.21 && Number(dn.igst) === 0,
      `₹${dn.sub_total} + GST ₹${dn.gst_total} (CGST ${dn.cgst} + SGST ${dn.sgst}) = ₹${dn.total}`);
    ok(dn.ref_number === 'GB-0001' && dn.reason === '1 base plate damaged' && dn.note_date === istDay(), `against ${dn.ref_number}, “${dn.reason}”, dated ${dn.note_date}`);
    ok(r2(notes.summary?.debit_total) === 532.36, `the Debit notes tile counts it (₹${notes.summary?.debit_total})`);
    ok(Number(notes.summary?.unreferenced) === 0,
      `naming the bill it is against clears “Missing invoice ref” (still counts ${notes.summary?.unreferenced}: the form has no field for the original's date, and ref_date stays ${dn.ref_date})`);
    await shot('08-debit-note-list');

    /* ═════════════════════════════════════════════════════════════════ */
    step(9, 'An expense, from the Expenses form');
    await go('/expenses', /Off-PO costs/);
    await click('button', /Add Expense/);
    await waitFor(() => [...document.querySelectorAll('form')].some(f => /New Expense/.test(f.innerText)));
    await mark('form', /New Expense/, 'exp');
    await setValue(await ctl('exp', /^Date/), istDay());
    await (await ctl('exp', /^Category/)).select('Freight / Transport');
    await fill(await ctl('exp', /^Amount/), '3450.50');
    await fill(await ctl('exp', /^Paid To/), 'VRL Logistics');
    const modeShown = await (await ctl('exp', /^Mode/)).evaluate(s => s.options[s.selectedIndex]?.textContent);
    await fill(await ctl('exp', /^Reference/), 'LR-88231');
    const expDesc = `Freight to BuildRight site ${stamp}`;
    await fill(await ctl('exp', /^Description/), expDesc);
    await shot('09-expense-form');
    await click('[data-bp="exp"] button[type="submit"]', /Add/);
    ok(await waitToast(/Expenses added/), 'Add says the expense was added');
    const exp = await until(async () => (await api('GET', '/expenses')).find(e => e.description === expDesc));
    ok(exp && r2(exp.amount) === 3450.5 && exp.category === 'Freight / Transport' && exp.expense_date === istDay() && exp.paid_to === 'VRL Logistics' && exp.reference === 'LR-88231',
      `stored: ₹${exp?.amount}, ${exp?.category}, ${exp?.expense_date}, paid to ${exp?.paid_to}, ref ${exp?.reference}`);
    ok(exp && exp.payment_mode === modeShown, `the mode is stored as the form showed it, “${modeShown}” (stored ${JSON.stringify(exp?.payment_mode)})`);
    await waitFor((d) => document.body.innerText.includes(d), 15000, expDesc);
    const er = await rowText(new RegExp(esc(expDesc)));
    ok(/₹3,450\.50/.test(er), `the list shows the amount to the paisa, ₹3,450.50 (row: ${er})`);

    /* ═════════════════════════════════════════════════════════════════ */
    step(10, 'Reports, and their CSV exports');
    await go('/reports', /Export registers/);
    await waitFor(() => /1 record/.test(document.body.innerText), 20000);
    await settle(800);
    const rep = {
      sales: await tile('Total Sales Invoiced'), recv: await tile('Receivables Outstanding'),
      purch: await tile('Purchase Bills'), exp: await tile('Expenses'),
    };
    const margin = await page.evaluate(() => [...document.querySelectorAll('span')].find(s => /^Operational Margin/.test(s.textContent.trim()))?.nextElementSibling?.getAttribute('title'));
    ok(num(rep.sales?.exact) === 227288.65, `Total Sales Invoiced ${rep.sales?.text} (exact ${rep.sales?.exact})`);
    ok(num(rep.recv?.exact) === 0, `Receivables Outstanding ${rep.recv?.text}`);
    ok(num(rep.purch?.exact) === 16560.71, `Purchase Bills ${rep.purch?.text}`);
    ok(num(rep.exp?.exact) === 3450.5, `Expenses ${rep.exp?.text}`);
    ok(num(margin) === r2(227288.65 - 16560.71 - 3450.5), `Operational margin ${margin} = sales − purchases − expenses (₹2,07,277.44)`);
    await shot('10-reports');
    const cdp = await browser.target().createCDPSession();
    await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL, eventsEnabled: true });
    const download = async (label, file) => {
      const fp = path.join(DL, file);
      try { fs.unlinkSync(fp); } catch { /* not there */ }
      await page.evaluate((l) => {
        const rowEl = [...document.querySelectorAll('div')].find(d => d.children.length === 2 && d.firstElementChild?.firstElementChild?.textContent.trim() === l);
        rowEl?.querySelector('button')?.click();
      }, label);
      const end = Date.now() + 15000;
      while (Date.now() < end) { if (fs.existsSync(fp) && fs.statSync(fp).size > 0) return parseCsv(fs.readFileSync(fp, 'utf8')); await sleep(300); }
      return null;
    };
    const csvS = await download('Sales Invoices', 'sales-invoices.csv');
    const sRow = csvS?.rows.find(r => r.invoice_number === 'INV-0001');
    ok(csvS && csvS.rows.length === 1 && sRow && Number(sRow.net_amount) === 227288.65 && Number(sRow.amount_paid) === 227288.65 && sRow.status === 'Paid' && sRow.customer_name === custName,
      `sales-invoices.csv: ${csvS ? `${csvS.rows.length} row — ${sRow?.invoice_number}, ${sRow?.customer_name}, ${sRow?.net_amount}, ${sRow?.status}` : 'no file'}`);
    const csvB = await download('Purchase (GRN) Bills', 'purchase-bills.csv');
    const bRow = csvB?.rows.find(r => r.bill_number === 'GB-0001');
    ok(csvB && csvB.rows.length === 1 && bRow && Number(bRow.net_amount) === 16560.71 && bRow.payment_status === 'Paid' && bRow.vendor_name === vendName,
      `purchase-bills.csv: ${csvB ? `${csvB.rows.length} row — ${bRow?.bill_number}, ${bRow?.vendor_name}, ${bRow?.net_amount}, ${bRow?.payment_status}` : 'no file'}`);
    const csvE = await download('Expenses', 'expenses.csv');
    const eRow = csvE?.rows.find(r => r.description === expDesc);
    ok(csvE && csvE.rows.length === 1 && eRow && Number(eRow.amount) === 3450.5 && eRow.category === 'Freight / Transport',
      `expenses.csv: ${csvE ? `${csvE.rows.length} row — ${eRow?.description}, ${eRow?.amount}` : 'no file'}`);

    /* ═════════════════════════════════════════════════════════════════ */
    step(11, 'Notifications');
    await go('/dashboard', /Everything at a glance/);
    await page.click('button[aria-label^="Account"]');
    await waitFor(() => !!document.querySelector('[data-open-notifications]'));
    await page.click('[data-open-notifications]');
    await waitFor(() => !!document.querySelector('[data-notifications]'));
    await settle(600);
    const nt = await page.evaluate(() => document.querySelector('[data-notifications]')?.innerText || '');
    ok(nt.includes(`PO ${po.poNumber} raised`), `the PO raised (“PO ${po.poNumber} raised”)`);
    ok(nt.includes(`Approval needed · ${po.poNumber}`) && nt.includes(`PO ${po.poNumber} approved`), 'its sign-off asked for and given');
    ok(/Goods received · GRN-/.test(nt), 'the goods received');
    ok(/Vendor payment · GB-0001/.test(nt) && /Payment received · INV-0001/.test(nt), 'the vendor paid, and the customer’s payment received');
    const grnNote = nt.match(/\d+(?: \S+)? of [^\n]*received against [^\n]*/)?.[0] || '';
    ok(grnNote.includes(po.poNumber), `the receipt names the PO by its number (“${grnNote}”)`);
    await shot('11-notifications');

    /* ═════════════════════════════════════════════════════════════════ */
    step(12, 'At 390px wide');
    await page.setViewport({ width: 390, height: 844 });
    for (const [p, re] of [['/purchase-orders', /Order from your vendors/], ['/grn', /Book what arrived/], ['/payables', /What you owe/], ['/credit-debit-notes', /Credit & Debit Notes/]]) {
      await go(p, re);
      await settle(800);
      const o = await overflow();
      ok(o.sw <= o.w, `${p} fits (${o.sw}px wide on a ${o.w}px screen${o.outer.length ? `; sticking out: ${o.outer.join(' | ')}` : ''})`);
      await shot(`12-m390${p.replace(/\//g, '-')}`);
    }
    await click('button', /New Note/);
    await waitFor(() => [...document.querySelectorAll('form')].some(f => /Debit Note/.test(f.innerText)));
    await settle(500);
    const on = await overflow();
    ok(on.sw <= on.w, `the new-note form fits too (${on.sw}px on ${on.w}px${on.outer.length ? `; sticking out: ${on.outer.join(' | ')}` : ''})`);
    await shot('12-m390-credit-debit-notes-form');
    await page.setViewport({ width: 1440, height: 1000 });

    /* ═════════════════════════════════════════════════════════════════ */
    step(13, 'A receipt is billed once');
    await go(`/grn/${grn1.id}/bill`, /already billed/);
    await settle(600);
    const warnsBilled = await page.evaluate(() => /already billed/i.test(document.body.innerText) && /GB-0001/.test(document.body.innerText) && ![...document.querySelectorAll('button')].some(b => /Create Bill/.test(b.textContent)));
    ok(warnsBilled, 'opening the billed receipt\'s bill page says it is already billed as GB-0001, with no Create Bill');
    const again = await fetch(`${API}/grn-bills`, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ grnId: grn1.id, poId: po.id, vendorId: vend.id, items: [{ description: bpName, quantity: 30, rate: 451.15 }] }) });
    const againBody = await again.json().catch(() => ({}));
    ok(again.status === 409 && /already billed as GB-0001/.test(againBody.error || ''), `and the server refuses a second bill for it (${again.status} ${againBody.error || ''})`);
    const listRow = await (async () => { await go('/grn', /Book what arrived at the gate/); await settle(600); return rowText(/TS09EU1234/); })();
    ok(/GB-0001/.test(listRow) && !/Generate Bill/.test(listRow), `the receipt's row opens GB-0001 instead of offering another bill (“${listRow.slice(0, 120)}”)`);
    const bills = (await api('GET', '/grn-bills')).filter(b => b.grn_id === grn1.id);
    ok(bills.length === 1, `and Create Bill does not bill it a second time (${bills.length} bills for GRN ${grn1.id}: ${bills.map(b => `${b.bill_number} ₹${b.net_amount}`).join(', ')})`);
    await shot('13-billed-twice');

    /* ═════════════════════════════════════════════════════════════════ */
    step(14, 'A purchase order with two lines, received from the GRN screen');
    await go('/purchase-orders', /Order from your vendors/);
    await click('button', /Create PO/);
    await waitFor(() => [...document.querySelectorAll('form')].some(f => /New Purchase Order/.test(f.innerText)));
    await mark('form', /New Purchase Order/, 'po2');
    await waitFor((n) => [...document.querySelectorAll('[data-bp="po2"] select option')].some(o => o.textContent.includes(n)), 15000, vendName);
    await pickOption(await ctl('po2', /^Vendor/), new RegExp(esc(vendName)));
    const po2Title = `Plates and angle ${stamp}`;
    await fill(await ctl('po2', /^PO Title/), po2Title);
    await click('[data-bp="po2"] button', /Add Line Item/);
    await waitFor(() => document.querySelectorAll('[data-bp="po2"] tbody tr').length === 2);
    {
      const rows = await page.$$('[data-bp="po2"] tbody tr');
      const fillRow = async (r, d, q, p, unit) => {
        const [desc] = await r.$$('input[type="text"]');
        const [qty, rate] = await r.$$('input[type="number"]');
        await fill(desc, d); await fill(qty, q); await fill(rate, p);
        if (unit) await (await r.$('select')).select(unit);
      };
      await fillRow(rows[0], bpName, '10', '451.15');
      await fillRow(rows[1], angleName, '100', '62.35', 'kg');
    }
    await click('[data-bp="po2"] button[type="submit"]', /Raise Order/);
    await waitToast(/Purchase Order created/);
    const poB = await until(async () => (await api('GET', '/po?limit=50')).items.find(p => p.itemName === po2Title));
    const poBLines = poB ? await api('GET', `/po/${poB.id}/items`) : [];
    ok(poB && poB.poNumber === `SSF/${FY}/002` && poBLines.length === 2 && poB.approval_status === 'Not Required',
      `${poB?.poNumber}: two lines, ₹10,746.50, under the limit so no sign-off (${poB?.approval_status})`);
    /* Not dispatched yet, so nothing can be received against it. */
    await go('/grn', /Book what arrived at the gate/);
    await settle(1500);
    const offeredEarly = await page.evaluate((id) => [...document.querySelectorAll('form select option')].find(o => o.value === String(id))?.textContent || null, poB.id);
    ok(!offeredEarly, `the GRN screen does not offer a PO that is still Pending (offers “${offeredEarly}”)`);
    await go('/purchase-orders', /Order from your vendors/);
    await waitFor((n) => [...document.querySelectorAll('tr')].some(t => t.innerText.includes(n) && [...t.querySelectorAll('button')].some(b => b.textContent.trim() === 'Approve')), 15000, poB?.poNumber);
    await rowClick(new RegExp(esc(poB.poNumber)), /^\s*Approve\s*$/);
    await until(async () => (await api('GET', `/po/${poB.id}`)).status === 'Approved');
    await waitFor((n) => [...document.querySelectorAll('tr')].some(t => t.innerText.includes(n) && /Dispatch/.test(t.innerText)), 15000, poB.poNumber);
    await rowClick(new RegExp(esc(poB.poNumber)), /Dispatch/);
    ok(await until(async () => (await api('GET', `/po/${poB.id}`)).status === 'Dispatched'), 'approved and dispatched from the row');
    await go('/grn', /Book what arrived at the gate/);
    await waitFor((id) => [...document.querySelectorAll('form select option')].some(o => o.value === String(id)), 15000, poB.id);
    await page.select('select[aria-label="Purchase order"]', String(poB.id));
    await waitFor(() => !!document.querySelector('select[aria-label="Line of the purchase order"]'), 10000);
    await settle(300);
    const lineChoice = await page.evaluate(() => {
      const f = document.querySelector('form');
      return { selects: f.querySelectorAll('select').length, text: f.innerText };
    });
    ok(lineChoice.selects > 1 || /which line|Line 1|Line 2/i.test(lineChoice.text), `the form asks which of the two lines arrived (${lineChoice.selects} select${lineChoice.selects === 1 ? '' : 's'} in the form)`);
    await fill(await page.$('input[placeholder="TS 09 EU 1234"]'), 'TS09EU9999');
    await page.evaluate(() => {
      const sel = document.querySelector('select[aria-label="Line of the purchase order"]');
      const opt = [...sel.options].find(o => /Base/i.test(o.textContent));
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(sel, opt.value);
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await settle(300);
    await fill(await page.$('input[aria-label="Quantity received"]'), '10');
    await click('form button', /Generate GRN/);
    await waitFor(() => !!document.querySelector('[role="alert"],[role="status"]'), 10000);
    await settle(800);
    const said = (await toasts()).join(' | ');
    const recB = (await api('GET', '/grn')).filter(g => g.poId === poB.id);
    ok(recB.length === 1, `10 base plates are received against it (${recB.length} receipts; the screen said “${said.slice(0, 200)}”)`);
    await shot('14-two-line-grn');

    console.log('');
    ok(errs.length === 0, `no page errors${errs.length ? `: ${errs.slice(0, 3).join(' | ')}` : ''}`);
    /* The letterhead asks for an uploaded logo and takes a 404 to mean "none"
       (components/CompanyLogo.jsx). The browser logs that 404 as a console
       error on every document page — counted on its own, so the general
       check still catches anything else. */
    const logo404 = consoleErrs.filter(e => /404/.test(e) && /\/company-profile\/logo$/.test(e));
    const otherErrs = consoleErrs.filter(e => !logo404.includes(e));
    ok(otherErrs.length === 0, `no console errors${otherErrs.length ? ` (${otherErrs.length}): ${[...new Set(otherErrs)].slice(0, 4).join(' | ')}` : ''}`);
    ok(logo404.length === 0, `a company with no logo does not log an error on its document pages (${logo404.length}× “404 /company-profile/logo”)`);
    if (dialogs.length) console.log(`   ↪  dialogs seen: ${dialogs.map(d => d.slice(0, 80)).join(' | ')}`);
  } catch (e) {
    fail++; console.log(`   ❌ crashed: ${e.stack || e.message}`);
  } finally {
    if (browser) await browser.close();
    const removed = await purge(ids.filter(Boolean)).catch(() => 0);
    console.log(`\n   ${removed === ids.length ? '✅' : '❌'} test account removed (${removed})`);
    console.log(`\n  ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
})();
