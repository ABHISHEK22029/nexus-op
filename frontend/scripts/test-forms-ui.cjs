#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   Forms, layout and stock linking, in a browser, at 1440px and 360px.

   What a tester hit, each checked where it happened:
   · Customer Orders — the product picker offered only "— free text —"; the
     unit was a text box that looked like a hint; number boxes took text.
   · Vendor, customer and company forms took any phone, PAN, GSTIN, IFSC,
     account number and account holder — now each says what is wrong next
     to the field, and a blocked save says why.
   · "0 of 4 stock rows linked — Fix this" with no way to link one.
   · The company profile's Save button was easy to miss.
   · ₹1,60,34,50,00,000 ran out of its summary tile, and a big stock
     quantity pushed the status pill out of its card.
   · Production yield showed dashes with no labels and no reason.

   Data is seeded through the API on a throwaway @example.test account and
   removed in a finally. Every page is also checked for: no sideways scroll,
   nothing sticking out of its card, every headline number fitting its tile
   without being clipped, and no page errors. Screenshots go to SHOTS (or a
   temp folder) and their paths are printed.

     API_BASE=http://localhost:5094 UI_BASE=http://localhost:5178 node scripts/test-forms-ui.cjs
   ══════════════════════════════════════════════════════════════════════ */
const puppeteer = require('puppeteer');
const fs = require('fs');
const os = require('os');
const path = require('path');
require(path.join(__dirname, '../../backend/node_modules/dotenv')).config({ path: path.join(__dirname, '../../backend/.env') });
const { purge } = require(path.join(__dirname, '../../backend/scripts/lib/testAccounts'));

const API = process.env.API_BASE || 'http://localhost:5099';
const UI = process.env.UI_BASE || 'http://localhost:5173';
if ([API, UI].some(u => /^https:|onrender\.com|vercel\.app|maksops\.co\.in/.test(u))) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}
const SHOTS = process.env.SHOTS || fs.mkdtempSync(path.join(os.tmpdir(), 'forms-ui-'));
fs.mkdirSync(SHOTS, { recursive: true });
const stamp = Date.now().toString(36);
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };
const shots = [];

const call = async (token, method, url, body) => {
  const r = await fetch(`${API}${url}`, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${url} → ${r.status} ${b.error || ''}`);
  return b;
};

/* ── what "fits" means, measured in the page ── */
function layoutProblems() {
  const out = [];
  const visible = (el) => { const s = getComputedStyle(el); return s.display !== 'none' && s.visibility !== 'hidden'; };
  /* 1. Anything card-shaped (rounded, bordered) whose content sticks out of it,
        unless something in between clips or scrolls it on purpose. */
  const cards = [...document.querySelectorAll('main *')].filter(el => {
    const s = getComputedStyle(el);
    return parseFloat(s.borderTopLeftRadius) >= 8 && parseFloat(s.borderTopWidth) >= 1 && el.offsetWidth > 60 && s.overflowX === 'visible' && visible(el);
  });
  for (const c of cards) {
    const r = c.getBoundingClientRect();
    for (const d of c.querySelectorAll('*')) {
      let clipped = false;
      for (let a = d.parentElement; a && a !== c; a = a.parentElement) { if (getComputedStyle(a).overflowX !== 'visible') { clipped = true; break; } }
      if (clipped) continue;
      const s = getComputedStyle(d);
      if (s.position === 'fixed' || s.position === 'absolute' || !visible(d)) continue;
      const dr = d.getBoundingClientRect();
      if (!dr.width || !dr.height) continue;
      if (dr.right > r.right + 1.5 || dr.left < r.left - 1.5) {
        out.push(`${(d.textContent || d.tagName).trim().slice(0, 40)} sticks out of “${(c.textContent || '').trim().slice(0, 30)}” by ${Math.round(Math.max(dr.right - r.right, r.left - dr.left))}px`);
        break;
      }
    }
  }
  /* 2. A headline number that had to be clipped (FitNumber at its floor). */
  for (const box of document.querySelectorAll('div[style*="text-overflow: ellipsis"]')) {
    const span = box.firstElementChild;
    if (!span || span.tagName !== 'SPAN') continue;
    if (span.getBoundingClientRect().width > box.clientWidth + 1.5) out.push(`“${span.textContent.trim()}” is clipped in its tile`);
  }
  /* 3. Sideways scroll on the page itself. */
  const side = document.documentElement.scrollWidth - window.innerWidth;
  if (side > 0) out.push(`the page scrolls sideways by ${side}px`);
  return [...new Set(out)];
}

(async () => {
  const ids = [];
  let browser;
  try {
    /* ── seed ─────────────────────────────────────────────────────────── */
    const reg = await (await fetch(`${API}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Forms UI', email: `formsui-${stamp}@example.test`, password: 'testpassword123' }) })).json();
    if (!reg.token) throw new Error('could not register');
    ids.push(reg.user?.id);
    const T = reg.token;
    await call(T, 'PUT', '/company-profile', { name: 'Forms UI Works', gstin: '36AAMCK2569F1Z9', stateCode: '36' });

    const cust = await call(T, 'POST', '/customers', { name: `Customer Name ${stamp}`, state: 'Telangana' });
    /* ₹1,60,34,50,00,000 billed, ₹2,52,23,500 received — the tester's figures. */
    const inv = await call(T, 'POST', '/sales-invoices', { customerId: cust.id, gstRate: 0, items: [{ description: 'Structural steel works', quantity: 1, uom: 'nos', rate: 160345000000 }] });
    await call(T, 'POST', `/sales-invoices/${inv.id}/payment`, { amount: 25223500, mode: 'NEFT', paidDate: '2026-10-08' });
    await call(T, 'POST', '/customer-orders', { customerId: cust.id, items: [{ description: 'Gates', quantity: 1000, unit: 'nos', targetPrice: 160345000 }] });
    await call(T, 'POST', '/expenses', { description: 'Plant and machinery', amount: 16034500000, category: 'Capital' });

    /* Stock: huge quantities, one low, and unlinked rows to link. */
    await call(T, 'POST', '/inventory', { itemName: `csd ${stamp}`, quantity: 321231, uom: 'nos', unitCost: 8500000 });
    await call(T, 'POST', '/inventory', { itemName: `e32423 ${stamp}`, quantity: 3243242, uom: 'nos', unitCost: 843000, minStockLevel: 1324234234 });
    await call(T, 'POST', '/inventory', { itemName: `Bolts ${stamp}`, quantity: 2000000000, uom: 'nos', unitCost: 1 });
    const angleMat = await call(T, 'POST', '/raw-materials', { name: `Angle 50x50x6 ${stamp}`, material_code: `ANG-${stamp}`, unit: 'kg', base_uom: 'kg' });
    await call(T, 'POST', '/raw-materials', { name: `Flat bar 40x6 ${stamp}`, material_code: `FB-${stamp}`, unit: 'kg', base_uom: 'kg' });
    await call(T, 'POST', '/inventory', { itemName: `Angle 50x50x6 ${stamp}`, quantity: 120, uom: 'kg' });
    await call(T, 'POST', '/inventory', { itemName: `Flat bar 40x6 ${stamp}`, quantity: 75, uom: 'nos' });
    await call(T, 'POST', '/inventory', { itemName: `Gasket ring ${stamp}`, quantity: 40, uom: 'nos' });

    /* Production: one with everything recorded, one with nothing yet. */
    const full = await call(T, 'POST', '/production', { productName: `V-type Bracket ${stamp}`, plannedQty: 40, outputUom: 'nos' });
    await call(T, 'POST', `/production/${full.id}/consumption`, { itemName: 'MS Plate', consumedQty: 43454, uom: 'kg', unitCost: 60 });
    await call(T, 'POST', `/production/${full.id}/output`, { itemName: `V-type Bracket ${stamp}`, outputQty: 4324, outputWeight: 40000, uom: 'nos' });
    await call(T, 'POST', `/production/${full.id}/scrap`, { scrapType: 'sellable', scrapQty: 3000, uom: 'kg', saleValue: 423423, isSold: true });
    const empty = await call(T, 'POST', '/production', { productName: `Empty order ${stamp}`, plannedQty: 10, outputUom: 'nos' });
    /* Booking output puts the finished goods in stock too, so count the
       unlinked rows rather than assume them. */
    const N = (await call(T, 'GET', '/inventory/unmatched')).total;

    /* ── browser ──────────────────────────────────────────────────────── */
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    let dialogs = [];
    page.on('dialog', d => { dialogs.push(d.message()); d.dismiss().catch(() => {}); });
    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto(`${UI}/login`);
    await page.evaluate((t) => { localStorage.setItem('nexus_token', t); localStorage.removeItem('nexus_active_project'); }, T);

    const waitFor = (fn, ms = 12000, ...args) => page.waitForFunction(fn, { timeout: ms }, ...args).then(() => true).catch(() => false);
    const waitText = (re, ms = 12000) => waitFor((src) => new RegExp(src).test(document.body.innerText), ms, re.source);
    const click = (sel, re) => page.evaluate((s, src) => {
      const el = [...document.querySelectorAll(s)].find(e => new RegExp(src).test(e.textContent));
      if (el) el.click();
      return !!el;
    }, sel, re.source);
    const shot = async (name) => { const p = path.join(SHOTS, `${name}.png`); await page.screenshot({ path: p, fullPage: false }); shots.push(p); return p; };
    const fullShot = async (name) => { const p = path.join(SHOTS, `${name}.png`); await page.screenshot({ path: p, fullPage: true }); shots.push(p); return p; };
    const settle = () => new Promise(r => setTimeout(r, 600));
    /* The app scrolls inside its main pane, not the document, so a phone
       screenshot needs the thing it is of scrolled into view first. */
    const into = (sel) => page.evaluate((s) => document.querySelector(s)?.scrollIntoView({ block: 'start' }), sel).then(settle);
    const fits = async (where) => {
      const probs = await page.evaluate(layoutProblems);
      ok(probs.length === 0, `${where}: nothing overflows its card, no sideways scroll${probs.length ? ` — ${probs.slice(0, 3).join('; ')}` : ''}`);
    };
    const at = async (w, h) => { await page.setViewport({ width: w, height: h }); await settle(); };
    const go = async (p, re) => { await page.goto(`${UI}${p}`, { waitUntil: 'networkidle2' }); if (re) await waitText(re); await settle(); };

    /* ── 6. big numbers: Sales Invoices tiles ── */
    console.log('\n  Big numbers in tiles and cards');
    await go('/sales-invoices', /Total Billed/i);
    const tiles = await page.evaluate(() => [...document.querySelectorAll('div[title^="₹"]')].map(d => ({ text: d.innerText.trim(), title: d.title, label: d.getAttribute('aria-label') })));
    ok(tiles.some(t => t.text === '₹16,034.5 Cr' && t.title === '₹1,60,34,50,00,000'), `Total billed reads ₹16,034.5 Cr, exact ₹1,60,34,50,00,000 on hover (${tiles.map(t => t.text).join(' | ')})`);
    ok(tiles.some(t => t.text === '₹2.52 Cr' && t.title === '₹2,52,23,500' && t.label === '₹2,52,23,500'), 'Received reads ₹2.52 Cr, the exact figure in its tooltip and aria-label');
    await fits('Sales Invoices at 1440px');
    await shot('01-sales-invoice-tiles-1440');
    await at(360, 780);
    await fits('Sales Invoices at 360px');
    await shot('02-sales-invoice-tiles-360');
    await at(1440, 1000);

    /* ── Stock on hand: tiles, cards, unlinked rows ── */
    await go('/inventory', /Stock value/i);
    const stockTile = await page.evaluate(() => { const t = document.querySelector('[data-tile="stock-value"] div[title]'); return t ? { text: t.innerText.trim(), title: t.title } : null; });
    ok(stockTile && /Cr$/.test(stockTile.text) && /^₹[\d,]+$/.test(stockTile.title), `stock value is compact (${stockTile?.text}), exact on hover (${stockTile?.title})`);
    const cardsOk = await page.evaluate(() => [...document.querySelectorAll('[data-stock-card]')].map(c => {
      const r = c.getBoundingClientRect(); const p = c.querySelector('[data-pill]').getBoundingClientRect(); const q = c.querySelector('[data-qty]');
      return { qty: q.textContent.trim(), title: q.parentElement.title, inside: p.right <= r.right + 1 && p.left >= r.left - 1 };
    }));
    ok(cardsOk.length >= 6 && cardsOk.every(c => c.inside), `every status pill stays inside its card (${cardsOk.filter(c => !c.inside).length} outside)`);
    ok(cardsOk.some(c => c.qty === '32.43 L' && /^32,43,242 nos$/.test(c.title)), 'a quantity of 32,43,242 reads 32.43 L on the card, exact on hover');
    ok(cardsOk.some(c => c.qty === '200 Cr'), 'two hundred crore units read 200 Cr');
    await fits('Stock on hand at 1440px');
    await fullShot('03-stock-cards-1440');
    await at(360, 780);
    await fits('Stock on hand at 360px');
    await page.evaluate(() => [...document.querySelectorAll('[data-stock-card]')].find(c => /32.43 L/.test(c.innerText))?.scrollIntoView({ block: 'start' }));
    await settle();
    await shot('04-stock-cards-360');
    await at(1440, 1000);

    /* ── 4. linking stock ── */
    console.log('\n  Linking stock to items');
    const unlinkedCards = await page.$$eval('[data-unlinked]', els => els.map(e => e.innerText));
    ok(N >= 6 && unlinkedCards.length === N && unlinkedCards.every(t => /Not linked to an item/.test(t) && /Link/.test(t)), `all ${N} unlinked rows say “Not linked to an item” with a Link button (${unlinkedCards.length})`);
    ok(await waitText(new RegExp(`${N} of ${N} stock rows are not linked`)), 'the page says how many rows shortfalls cannot count');

    await go('/dashboard', /Everything at a glance|Executive dashboard/i);
    await waitText(/Stock rows linked to a material or product/);
    const fixHref = await page.evaluate(() => {
      const row = [...document.querySelectorAll('a')].find(a => /Fix this/.test(a.textContent) && /inventory/.test(a.getAttribute('href')));
      return row ? row.getAttribute('href') : null;
    });
    ok(fixHref === '/inventory?unlinked=1', `the setup banner's Fix this goes to Stock on hand, unlinked rows (${fixHref})`);
    await fits('Dashboard at 1440px');
    await shot('05-dashboard-1440');
    await at(360, 780); await fits('Dashboard at 360px'); await at(1440, 1000);

    await page.evaluate(() => [...document.querySelectorAll('a')].find(a => a.getAttribute('href') === '/inventory?unlinked=1')?.click());
    await waitText(/Show all stock/);
    await settle();
    const filtered = await page.$$eval('[data-stock-card]', els => els.length);
    ok(page.url().endsWith('/inventory?unlinked=1') && filtered === N, `it lands on Stock on hand showing only the ${N} unlinked rows (${filtered})`);

    /* the suggested match */
    await page.evaluate((n) => [...document.querySelectorAll('button[aria-label^="Link "]')].find(b => b.getAttribute('aria-label').includes(n))?.click(), `Angle 50x50x6 ${stamp}`);
    ok(await waitText(/Shortfalls only count stock that is linked/), 'Link opens the dialog');
    await waitFor(() => document.querySelectorAll('[role="option"]').length > 0);
    const first = await page.evaluate(() => { const o = document.querySelector('[role="option"]'); return { text: o.innerText, selected: o.getAttribute('aria-selected') }; });
    ok(/Angle 50x50x6/.test(first.text) && /Suggested/.test(first.text) && first.selected === 'true', 'the matching raw material is first, marked Suggested, and chosen');
    await shot('06-link-dialog-suggested');
    await page.type('input[aria-label="Search raw materials and products"]', 'flat');
    const searched = await page.$$eval('[role="option"]', els => els.map(e => e.innerText.split('\n')[0]));
    ok(searched.length === 1 && /Flat bar/.test(searched[0]), `the list is searchable (${searched.join(', ')})`);
    await page.evaluate(() => { const i = document.querySelector('input[aria-label="Search raw materials and products"]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, ''); i.dispatchEvent(new Event('input', { bubbles: true })); });
    await click('button', /^\s*Link stock\s*$/);
    ok(await waitText(new RegExp(`is now linked to Angle 50x50x6 ${stamp}`)), 'Link stock links it, and says so');
    await waitFor((n) => document.querySelectorAll('[data-stock-card]').length === n, 10000, N - 1);
    const left5 = await page.$$eval('[data-stock-card]', els => els.length);
    ok(left5 === N - 1, `the linked row leaves the unlinked list (${left5} left)`);

    /* a unit clash is refused */
    await page.evaluate((n) => [...document.querySelectorAll('button[aria-label^="Link "]')].find(b => b.getAttribute('aria-label').includes(n))?.click(), `Flat bar 40x6 ${stamp}`);
    await waitFor(() => document.querySelectorAll('[role="option"]').length > 0);
    const clash = await page.evaluate(() => ({
      warn: (document.querySelector('[role="alert"]') || {}).innerText || '',
      disabled: [...document.querySelectorAll('button')].find(b => /Link stock/.test(b.textContent))?.disabled,
    }));
    ok(/counted in nos/.test(clash.warn) && /kept in kg/.test(clash.warn) && clash.disabled === true, 'linking 75 nos to a material kept in kg is refused, and says why');
    await shot('07-link-dialog-unit-clash');
    await click('button', /^\s*Cancel\s*$/);
    await settle();

    /* add as a new raw material */
    await page.evaluate((n) => [...document.querySelectorAll('button[aria-label^="Link "]')].find(b => b.getAttribute('aria-label').includes(n))?.click(), `Gasket ring ${stamp}`);
    await waitText(/Add it as a new raw material/);
    await click('button', /Add it as a new raw material/);
    ok(await waitText(/is now linked to a new raw material, kept in nos/), 'Add it as a new raw material makes one from the row’s name and unit and links it');
    await at(360, 780);
    await go('/inventory?unlinked=1', /Show all stock/);
    await fits('Stock on hand (unlinked) at 360px');
    await page.evaluate(() => document.querySelector('button[aria-label^="Link "]')?.click());
    await waitFor(() => document.querySelectorAll('[role="option"]').length > 0);
    await fits('Link dialog at 360px');
    await shot('08-link-dialog-360');
    await page.keyboard.press('Escape');
    await at(1440, 1000);
    const left = await call(T, 'GET', '/inventory/unmatched');
    ok(left.total === N - 2 && !left.items.some(i => i.itemName === `Angle 50x50x6 ${stamp}`), `the server agrees: ${N - 2} rows left to link (${left.total})`);
    void angleMat;

    /* ── 1 + 2. Customer Orders ── */
    console.log('\n  Customer Orders');
    await go('/customer-orders', /Order value/i);
    const orderTile = await page.evaluate(() => [...document.querySelectorAll('div[title^="₹"]')].map(d => d.innerText.trim()));
    ok(orderTile.includes('₹16,034.5 Cr'), `the Order value tile is compact (${orderTile.join(', ')})`);
    await click('button', /New Order/);
    await waitText(/No saved products/);
    const emptyState = await page.evaluate(() => {
      const a = [...document.querySelectorAll('a')].find(x => /add products/.test(x.textContent));
      return { href: a?.getAttribute('href'), select: !!document.querySelector('select[aria-label="Line 1 product"]') };
    });
    ok(emptyState.href === '/skus' && !emptyState.select, 'with no saved products: “No saved products. Type the item, or add products” linking to /skus, and no empty list');
    await shot('09-order-no-products');
    await call(T, 'POST', '/skus', { name: `Gate ${stamp}`, sku_code: `G-${stamp}`, unit: 'set', price: 25000 });
    await go('/customer-orders', /Order value/i);
    await click('button', /New Order/);
    await waitFor(() => !!document.querySelector('select[aria-label="Line 1 product"]'));
    const picker = await page.$$eval('select[aria-label="Line 1 product"] option', os => os.map(o => o.textContent));
    ok(picker.some(t => t === `Gate ${stamp} · G-${stamp}`), `the product picker lists saved products as name · code (${picker.join(' | ')})`);
    await page.select('select[aria-label="Line 1 product"]', (await page.$$eval('select[aria-label="Line 1 product"] option', os => os[1].value)));
    await settle();
    const line = await page.evaluate(() => {
      const unit = document.querySelector('select[aria-label="Line 1 unit"]');
      const qty = document.querySelector('input[aria-label="Line 1 quantity"]');
      const rate = document.querySelector('input[aria-label="Line 1 unit rate"]');
      return {
        unitIsSelect: unit?.tagName === 'SELECT', unit: unit?.value, units: unit ? [...unit.options].map(o => o.value) : [],
        desc: document.querySelector('input[aria-label="Line 1 description"]')?.value, rate: rate?.value,
        qty: { inputMode: qty?.inputMode, auto: qty?.autocomplete, min: qty?.min, type: qty?.type },
        rateAttrs: { inputMode: rate?.inputMode, auto: rate?.autocomplete, min: rate?.min },
      };
    });
    ok(line.desc === `Gate ${stamp}` && line.unit === 'set' && line.rate === '25000', `picking a product fills the description, unit (set) and rate (${line.desc}, ${line.unit}, ${line.rate})`);
    ok(line.unitIsSelect && ['nos', 'kg', 'm', 'sqft', 'ltr'].every(u => line.units.includes(u)), 'the unit is a choice from the standard list, not a text box');
    ok(line.qty.inputMode === 'decimal' && line.qty.auto === 'off' && line.qty.min === '0' && line.qty.type === 'number', 'quantity: number, decimal keypad, no autocomplete, min 0');
    ok(line.rateAttrs.inputMode === 'decimal' && line.rateAttrs.auto === 'off' && line.rateAttrs.min === '0', 'unit rate: decimal keypad, no autocomplete, min 0');
    await page.type('input[aria-label="Line 1 quantity"]', '12');
    await shot('10-order-line-1440');
    await fits('Customer Orders form at 1440px');
    await at(360, 780);
    await fits('Customer Orders form at 360px');
    await into('select[aria-label="Line 1 product"]');
    await shot('11-order-line-360');
    await at(1440, 1000);

    /* the same unit control on the other line-item screens */
    await go('/delivery-challans', /Value dispatched/i);
    await click('button', /New Challan/);
    ok(await waitFor(() => document.querySelector('select[aria-label="Line 1 unit"]')?.tagName === 'SELECT'), 'delivery challan lines pick their unit from the list');
    await go('/credit-debit-notes', /Credit notes/i);
    await click('button', /New Note/);
    ok(await waitFor(() => document.querySelector('select[aria-label="Line 1 unit"]')?.tagName === 'SELECT'), 'credit/debit note lines pick their unit from the list');

    /* ── 3. validation: vendor ── */
    console.log('\n  Validation');
    await go('/vendors/new', /New vendor/);
    await page.type('[data-field="name"]', `New vendo1 ${stamp}`);
    await page.type('[data-field="phone"]', '09885300702xdf');
    await page.click('[data-field="gstin"]');
    ok(await waitText(/Use digits only \(spaces and hyphens are fine\)/), 'a phone with letters is called out next to the field when you leave it');
    await click('button', /Add vendor/);
    ok(await waitText(/Fix Phone before saving — it is marked in red/), 'pressing Add vendor says why it will not save');
    await shot('12-vendor-phone-error');
    await page.click('[data-field="phone"]', { clickCount: 3 });
    await page.type('[data-field="phone"]', '98850 00000');
    await click('button', /Bank details/);
    await page.waitForSelector('[data-field="ifsc"]');
    await page.type('[data-field="accountHolder"]', 'dfaefa132131231231');
    await page.type('[data-field="ifsc"]', 'xdada1');
    await page.click('[data-field="accountNumber"]');
    const ifscVal = await page.$eval('[data-field="ifsc"]', e => e.value);
    ok(ifscVal === 'XDADA1', 'the IFSC is upper-cased as it is typed');
    ok(await waitText(/An IFSC is 11 characters/) && await waitText(/looks like a number/), 'a bad IFSC and an account holder with digits are each called out');
    await page.type('[data-field="accountNumber"]', '1234');
    await click('button', /Add vendor/);
    ok(await waitText(/Fix the 3 fields marked in red before saving: Account holder, Account number, IFSC/), 'the save explains all three');
    await fullShot('13-vendor-bank-errors');
    for (const [f, v] of [['accountHolder', 'Kalinga Board & Co'], ['ifsc', 'HDFC0001234'], ['accountNumber', '50100012345678']]) {
      await page.click(`[data-field="${f}"]`, { clickCount: 3 }); await page.keyboard.press('Backspace');
      await page.type(`[data-field="${f}"]`, v);
    }
    await click('button', /Add vendor/);
    ok(await waitFor(() => location.pathname === '/vendors', 15000), 'with every field right, the vendor saves');
    await at(360, 780);
    await go('/vendors/new', /New vendor/);
    await page.type('[data-field="phone"]', 'abc'); await page.click('[data-field="gstin"]');
    await waitText(/Use digits only/);
    await fits('Vendor form with an error at 360px');
    await at(1440, 1000);

    /* customer: GSTIN and PAN must agree */
    await go('/customers', /Customers/);
    await click('button', /Add Customer/);
    await page.waitForSelector('[data-field="gstin"]');
    await page.type('[data-field="name"]', `Mismatch ${stamp}`);
    await page.type('[data-field="gstin"]', '33aabcn1234m1z7');
    await page.type('[data-field="pan"]', 'AAACT1234C');
    await page.type('[data-field="phone"]', '12345');
    await click('button', /^\s*Add\s*$/);
    ok(await waitText(/This PAN does not match the GSTIN, which holds AABCN1234M/) && await waitText(/Enter a 10-digit mobile number/), 'the customer form says the PAN and GSTIN disagree, and the phone is short');
    ok(await waitText(/Fix the 2 fields marked in red before saving: PAN, Phone/), 'and the save says which two');
    const gst = await page.$eval('[data-field="gstin"]', e => e.value);
    ok(gst === '33AABCN1234M1Z7', 'the GSTIN is upper-cased as typed');
    await shot('14-customer-gstin-pan');

    /* ── 5. company profile: the save bar ── */
    console.log('\n  Company profile');
    await go('/company-profile', /Company Profile/);
    ok(!(await page.$('[data-save-bar]')), 'no save bar while nothing has changed');
    await page.type('[data-field="phone"]', '12345');
    await settle();
    const bar = await page.evaluate(() => { const b = document.querySelector('[data-save-bar]'); if (!b) return null; const r = b.getBoundingClientRect(); return { text: b.innerText, bottom: r.bottom, h: window.innerHeight }; });
    ok(bar && /Unsaved changes/.test(bar.text) && /Discard/.test(bar.text) && /Save changes/.test(bar.text), 'a change brings up “Unsaved changes · Discard · Save changes”');
    ok(bar && bar.bottom <= bar.h && bar.bottom > bar.h - 120, `the bar sits at the foot of the screen, in view (${Math.round(bar?.bottom)} of ${bar?.h})`);
    await page.evaluate(() => [...document.querySelectorAll('[data-save-bar] button')].find(b => /Save changes/.test(b.textContent)).click());
    ok(await waitText(/Fix Phone before saving — it is marked in red/), 'saving with a bad phone says why, in the bar');
    await shot('15-profile-save-bar-error');
    dialogs = [];
    const linkTo = await page.evaluate(() => { const a = [...document.querySelectorAll('aside a[href]')].find(x => x.getAttribute('href') !== '/company-profile'); a?.click(); return a?.getAttribute('href'); });
    await settle();
    ok(dialogs.some(m => /unsaved changes/i.test(m)) && page.url().endsWith('/company-profile'), `leaving by a sidebar link (${linkTo}) asks first, and staying keeps you here (${dialogs[0] || 'no dialog'})`);
    dialogs = [];
    await page.evaluate(() => document.querySelector('nav.nav-rail .nav-rail-item:not(.is-active)')?.click());
    await settle();
    ok(dialogs.length === 1 && page.url().endsWith('/company-profile'), 'so does a sidebar module button');
    await page.click('[data-field="phone"]', { clickCount: 3 }); await page.keyboard.press('Backspace');
    await page.type('[data-field="phone"]', '040 2345 6789');
    await page.click('[data-field="bank_ifsc"]', { clickCount: 3 }); await page.keyboard.press('Backspace');
    await page.type('[data-field="bank_ifsc"]', 'hdfc0001234');
    await page.evaluate(() => [...document.querySelectorAll('[data-save-bar] button')].find(b => /Save changes/.test(b.textContent)).click());
    ok(await waitText(/Saved — new documents will use these details/), 'after saving it says “Saved”');
    await shot('16-profile-saved');
    const saved = await call(T, 'GET', '/company-profile');
    ok(saved.phone === '040 2345 6789' && saved.bank_ifsc === 'HDFC0001234', 'and the server has the new phone and the upper-cased IFSC');
    await page.type('[data-field="email"]', 'x');
    await waitFor(() => !!document.querySelector('[data-save-bar]') && /Unsaved/.test(document.querySelector('[data-save-bar]').innerText));
    await page.evaluate(() => [...document.querySelectorAll('[data-save-bar] button')].find(b => /Discard/.test(b.textContent)).click());
    ok(await waitFor(() => !document.querySelector('[data-save-bar]') || !/Unsaved/.test(document.querySelector('[data-save-bar]').innerText)), 'Discard puts it back and the bar goes');
    await at(360, 780);
    await page.type('[data-field="phone"]', '9');
    await settle();
    await fits('Company profile with the save bar at 360px');
    await shot('17-profile-save-bar-360');
    await page.evaluate(() => [...document.querySelectorAll('[data-save-bar] button')].find(b => /Discard/.test(b.textContent))?.click());
    await at(1440, 1000);

    /* ── 7. production yield ── */
    console.log('\n  Production yield');
    await go(`/production/${full.id}`, /Yield & Material Balance/);
    const metrics = await page.$$eval('[data-metric]', els => els.map(e => ({ name: e.getAttribute('data-metric'), text: e.innerText })));
    const names = ['Yield', 'Recovered', 'Scrap', 'Unaccounted Loss', 'Material issued', 'Output', 'Net material cost', 'Cost / Unit'];
    ok(names.every(n => metrics.some(m => m.name === n && m.text.toUpperCase().includes(n.toUpperCase()))), 'all eight figures have their names on screen');
    ok(/Finished weight ÷ material issued/.test(metrics.find(m => m.name === 'Yield')?.text || '') && /Net material cost ÷ pieces made/.test(metrics.find(m => m.name === 'Cost / Unit')?.text || ''), 'each says where it comes from');
    ok(/92\.05%/.test(metrics.find(m => m.name === 'Yield')?.text || ''), `yield is worked out: 40,000 ÷ 43,454 kg = ${(metrics.find(m => m.name === 'Yield')?.text || '').split('\n')[1]}`);
    ok(!metrics.some(m => /^—$/m.test(m.text)), 'no bare dashes');
    await shot('18-production-yield');
    await at(360, 780); await fits('Production order at 360px');
    await into('[data-metric="Yield"]');
    await shot('18b-production-yield-360');
    await at(1440, 1000);
    await go(`/production/${empty.id}`, /Yield & Material Balance/);
    const emptyM = await page.$$eval('[data-metric]', els => els.map(e => e.innerText).join('\n'));
    ok(/Issue material and record output to see yield/.test(emptyM) && /Nothing issued yet/.test(emptyM) && /No output recorded yet/.test(emptyM), 'with nothing recorded, each figure says what is missing');
    await shot('19-production-yield-empty');

    /* ── other pages with tiles ── */
    console.log('\n  Other pages with summary tiles');
    for (const [p, re] of [['/expenses', /Expenses/], ['/reports', /Total Sales Invoiced/i], ['/payables', /Total payable|Could not load payables/i], [`/customers/${cust.id}`, /Lifetime billed/i], ['/purchase-orders', /Order Value/i], ['/material-requirements', /Material/i], ['/production', /Production/i]]) {
      await go(p, re);
      await fits(`${p} at 1440px`);
      await at(360, 780); await settle();
      await fits(`${p} at 360px`);
      if (p === '/reports' || p.startsWith('/customers/')) await shot(`20-${p.replace(/\W+/g, '-').replace(/^-|-$/g, '')}-360`);
      await at(1440, 1000);
    }
    const custTile = await (async () => { await go(`/customers/${cust.id}`, /Lifetime billed/i); return page.evaluate(() => [...document.querySelectorAll('div[title^="₹"]')].map(d => d.innerText.trim())); })();
    ok(custTile.includes('₹16,034.5 Cr'), `customer detail: lifetime billed is compact (${custTile.join(', ')})`);

    ok(!errs.length, `no page errors${errs.length ? `: ${errs.slice(0, 3).join(' | ')}` : ''}`);
  } catch (e) {
    fail++; console.log(`   ❌ crashed: ${e.stack || e.message}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    /* The shared pooler can be full for a moment; retry rather than leave the account. */
    let removed = 0;
    for (let i = 0; i < 10; i++) {
      try { removed = await purge(ids.filter(Boolean)); break; } catch (e) { console.log(`   cleanup retry ${i + 1}: ${e.message}`); await new Promise(r => setTimeout(r, 3000)); }
    }
    console.log(`\n   test account removed (${removed})`);
    console.log(`\n   screenshots in ${SHOTS}`);
    console.log(`\n  ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
})();
