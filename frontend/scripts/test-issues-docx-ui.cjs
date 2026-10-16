#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   The tester's Word file of 8 Oct (Downloads\Issues.docx), walked through
   again in a browser: each item done the way its screenshot shows, and
   checked for what should happen now. Numbered as in the file.

    1   the page goes stale and needs a manual refresh
    2   the document-numbering note says KBS — should say Maks
    3   "Title / description" — expected a capital D
    4–6 Run now says "Done — 1 expense(s)" on every click; reminders are
        always on; the bell breaks its sentence; Save changes is easy to miss
    6   the product picker says "free text" but offers nothing to pick
    7   the unit looks like a hint but is text; number boxes take letters
    8   a discount bigger than the sub-total went through; "− ₹-21"
    9   discount in ₹ or %
    10  the invoice doesn't show what is still owed; "Rupees undefined…";
        the printed sub-total was rounded
    11  an empty description silently drops the row; any text as a unit
    12  printing: keep the last line items with the totals
        (page by page in test-documents-print.cjs)
    13  big numbers break out of their tiles
    14  number fields (phone, account holder, IFSC) take letters
    15  Add stock: "unable to find existing balance"
    16  production yield tiles show dashes with no labels
    17  "0 of 4 stock rows linked — Fix this", but no way to link

   Its own throwaway company (docx-*@example.test), removed at the end.
     API_BASE=http://localhost:5097 UI_BASE=http://localhost:5176 node scripts/test-issues-docx-ui.cjs
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
const stamp = Date.now().toString(36);
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };
const item = (n, t) => console.log(`\n  ── ${n}. ${t}`);
const call = async (token, method, url, body) => {
  const r = await fetch(`${API}${url}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${url} → ${r.status} ${b.error || ''}`);
  return b;
};
const istDay = (offset = 0) => new Date(Date.now() + 5.5 * 3600e3 + offset * 86400e3).toISOString().slice(0, 10);

(async () => {
  const ids = [];
  let browser;
  try {
    /* ── the tester's data, as in the screenshots ── */
    const reg = await (await fetch(`${API}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Docx Tester', email: `docx-${stamp}@example.test`, password: 'testpassword123' }) })).json();
    if (!reg.token) throw new Error('could not register');
    ids.push(reg.user.id);
    const T = reg.token;
    await call(T, 'PUT', '/company-profile', { name: `MAKS-Test_OPS ${stamp}`, gstin: '36ABCDE1234F1Z5', stateCode: '36' });
    const cust = await call(T, 'POST', '/customers', { name: `Customer Name 1 ${stamp}`, state: 'Telangana' });
    /* INV-y0001: 1,25,14,80,00,000 + 14,25,41,685 = 1,25,29,05,41,685, ₹21 off, ₹2,50,00,000 received */
    const big = await call(T, 'POST', '/sales-invoices', { customerId: cust.id, gstRate: 18, discount: 21, items: [
      { description: 'Description', quantity: 1251480000, uom: 'nos', rate: 100 },
      { description: 'Description 2', quantity: 558987, uom: 'nos', rate: 255 },
    ] });
    await call(T, 'POST', `/sales-invoices/${big.id}/payment`, { amount: 25000000, mode: 'NEFT', paidDate: istDay() });
    await call(T, 'POST', '/recurring', { docType: 'expense', title: `Generator diesel ${stamp}`, amount: 1000, frequency: 'daily', nextRun: istDay(-3) });
    await call(T, 'POST', '/skus', { name: `Gate ${stamp}`, sku_code: `G-${stamp}`, unit: 'set', price: 25000 });
    await call(T, 'POST', '/inventory', { itemName: `csd ${stamp}`, quantity: 321231, uom: 'nos', unitCost: 3123, minStockLevel: 324 });
    await call(T, 'POST', '/inventory', { itemName: `e32423 ${stamp}`, quantity: 3243242, uom: 'nos', unitCost: 4234, minStockLevel: 1324234234 });
    await call(T, 'POST', '/raw-materials', { name: `Angle 50x50x6 ${stamp}`, material_code: `ANG-${stamp}`, unit: 'kg', base_uom: 'kg' });
    await call(T, 'POST', '/inventory', { itemName: `Angle 50x50x6 ${stamp}`, quantity: 120, uom: 'kg' });
    const prod = await call(T, 'POST', '/production', { productName: `sdfsdfsd ${stamp}`, plannedQty: 40, outputUom: 'nos' });
    await call(T, 'POST', `/production/${prod.id}/consumption`, { itemName: 'MS Plate', consumedQty: 43454, uom: 'kg', unitCost: 60 });
    await call(T, 'POST', `/production/${prod.id}/output`, { itemName: `V-type Bracket ${stamp}`, outputQty: 4324, outputWeight: 40000, uom: 'nos' });

    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    page.on('dialog', d => d.accept().catch(() => {}));
    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto(`${UI}/login`);
    await page.evaluate((t, u) => { localStorage.setItem('nexus_token', t); localStorage.setItem('nexus_user', JSON.stringify(u)); }, T, reg.user);

    const waitFor = (fn, ms = 12000, ...args) => page.waitForFunction(fn, { timeout: ms }, ...args).then(() => true).catch(() => false);
    const waitText = (re, ms = 12000) => waitFor((src) => new RegExp(src).test(document.body.innerText), ms, re.source);
    const click = (sel, re) => page.evaluate((s, src) => { const el = [...document.querySelectorAll(s)].find(e => new RegExp(src).test(e.textContent)); if (el) el.click(); return !!el; }, sel, re.source);
    const settle = (ms = 600) => new Promise(r => setTimeout(r, ms));
    const go = async (p, re) => { await page.goto(`${UI}${p}`, { waitUntil: 'networkidle2' }); if (re) await waitText(re); await settle(); };
    const toastAfter = async (fn) => {
      /* Let the last message fade first, so a repeat of the same words counts as new. */
      await waitFor(() => !document.querySelector('[role="status"], [role="alert"]'), 8000);
      await page.evaluate(() => { window.__before = [...document.querySelectorAll('[role="status"], [role="alert"]')].map(e => e.innerText.trim()); window.__toasts = []; new MutationObserver(() => { for (const el of document.querySelectorAll('[role="status"], [role="alert"]')) { const t = el.innerText.trim(); if (t && !window.__toasts.includes(t) && !window.__before.includes(t)) window.__toasts.push(t); } }).observe(document.body, { childList: true, subtree: true, characterData: true }); });
      await fn(); await settle(2500);
      return page.evaluate(() => window.__toasts.join(' | '));
    };

    /* 1 ─────────────────────────────────────────────────────────────── */
    item('1', 'the page goes stale after a new version is put up');
    await go('/dashboard', /glance|Dashboard/i);
    /* A tab open across a deploy asks for a screen file that no longer
       exists. Fail the Vendors screen's file once, as a deploy would. */
    await page.setRequestInterception(true);
    let failed = 0;
    const onReq = (req) => { if (!failed && /\/src\/pages\/Vendors\.jsx/.test(req.url())) { failed++; req.abort(); } else req.continue(); };
    page.on('request', onReq);
    let reloads = 0;
    page.on('framenavigated', (f) => { if (f === page.mainFrame()) reloads++; });
    await page.evaluate(() => { history.pushState({}, '', '/vendors'); dispatchEvent(new PopStateEvent('popstate')); });
    /* The Vendors page's own sentence: the dashboard's vendor tile also says
       "Who you buy from", so waiting on that passed before the reload had
       happened, and the reload then landed in the middle of the next check. */
    const recovered = await waitText(/Who you buy from, and what each one sells you/, 20000);
    page.off('request', onReq);
    await page.setRequestInterception(false);
    ok(failed === 1 && recovered && reloads >= 1 && new URL(page.url()).pathname === '/vendors',
      `the missing screen file is noticed, the page reloads itself once, and Vendors opens — no manual refresh (${failed} failed, ${reloads} reload)`);

    /* 2 ─────────────────────────────────────────────────────────────── */
    item('2', 'document numbering note');
    await go('/document-numbering', /Document numbering/);
    const note = await page.evaluate(() => document.body.innerText);
    ok(/MAKS\/\{FY\}\//.test(note) && !/KBS/.test(note), 'the example reads MAKS/{FY}/, and KBS is gone');

    /* 3, 4–6 ───────────────────────────────────────────────────────────── */
    item('3', '"Title / Description"');
    await go('/automation', /Recurring transactions/);
    await click('button', /New schedule/);
    ok(await waitText(/Title \/ Description \*/), 'the label reads Title / Description');
    await click('button', /^\s*Cancel\s*$/);

    item('4–6', 'Run now, pressed again and again');
    const first = await toastAfter(() => click('button', /Run now/));
    const second = await toastAfter(() => click('button', /Run now/));
    const third = await toastAfter(() => click('button', /Run now/));
    ok(/4 expenses?|expense/.test(first) && /Nothing was due today/.test(second) && /Nothing was due today/.test(third),
      `the first press catches up the missed days; after that it says nothing was due (“${first.slice(0, 90)}” → “${second.slice(0, 60)}”)`);

    item('4–6', 'reminders can be switched off');
    const sw = 'button[role="switch"][aria-label="Overdue invoice reminders"]';
    const before = await page.$eval(sw, b => b.getAttribute('aria-checked'));
    await page.click(sw); await settle(1200);
    await go('/automation', /Recurring transactions/);
    const afterReload = await page.$eval(sw, b => b.getAttribute('aria-checked'));
    ok(before === 'true' && afterReload === 'false', `a switch, and it stays off after a reload (${before} → ${afterReload})`);
    await page.click(sw); await settle(1200);

    item('4–6', 'the bell sits inside its sentence; Save changes stands out');
    const bell = await page.evaluate(() => {
      const li = [...document.querySelectorAll('li')].find(l => /already notify in real time/.test(l.textContent));
      const svg = li?.querySelector('svg');
      return li && svg ? { lines: Math.round(li.getBoundingClientRect().height / parseFloat(getComputedStyle(li).lineHeight || '20')), inline: getComputedStyle(svg).display } : null;
    });
    ok(bell && bell.inline !== 'block' && bell.lines <= 1, `“…via the 🔔 bell.” stays on one line (${JSON.stringify(bell)})`);
    await go('/company-profile', /Bank details/i);
    const named = await page.evaluateHandle((n) => [...document.querySelectorAll('input')].find(i => i.value === n), `MAKS-Test_OPS ${stamp}`);
    await named.asElement().type(' Pvt Ltd');
    ok(await waitFor(() => { const b = document.querySelector('[data-save-bar]'); return b && /Unsaved changes/.test(b.innerText) && b.getBoundingClientRect().bottom <= innerHeight + 1; }),
      'an edit brings up an “Unsaved changes” bar, in view, with Save on it');

    /* 6–7 ───────────────────────────────────────────────────────────── */
    item('6', 'the product picker on a customer order');
    await go('/customer-orders', /Order value/i);
    await click('button', /New Order/);
    await waitFor(() => !!document.querySelector('select[aria-label="Line 1 product"]'));
    const opts = await page.$$eval('select[aria-label="Line 1 product"] option', os => os.map(o => o.textContent));
    ok(opts.some(t => t.includes(`Gate ${stamp}`)), `saved products are offered, not only free text (${opts.slice(0, 3).join(' | ')})`);

    item('7', 'the unit and the number boxes');
    const unitTag = await page.$eval('select[aria-label="Line 1 unit"]', e => e.tagName).catch(() => 'missing');
    ok(unitTag === 'SELECT', `the unit is picked from a list, not typed (${unitTag})`);
    await page.type('input[aria-label="Line 1 quantity"]', 'abc');
    const qtyVal = await page.$eval('input[aria-label="Line 1 quantity"]', e => e.value);
    ok(qtyVal === '', `letters typed into the quantity go nowhere (“${qtyVal}”)`);

    /* 8–11: the invoice editor and the invoice ───────────────────────── */
    item('8', 'a discount bigger than the sub-total; the double minus');
    await go('/sales-invoices/new', /Line items|Customer/);
    const custVal = await page.$$eval('select[aria-label="Customer"] option', (os, n) => os.find(o => o.textContent.includes(n))?.value, `Customer Name 1 ${stamp}`);
    await page.select('select[aria-label="Customer"]', custVal);
    await settle();
    await page.type('input[aria-label="Line 1 description"]', 'Description');
    await page.type('input[aria-label="Line 1 quantity"]', '10');
    await page.type('input[aria-label="Line 1 rate"]', '100');
    await page.type('input[aria-label="Discount"]', '125290999998');
    const huge = await page.evaluate(() => ({
      alert: [...document.querySelectorAll('[role="alert"]')].map(a => a.innerText).join(' '),
      saveDisabled: [...document.querySelectorAll('button')].find(b => /Save|Create invoice|Issue/.test(b.textContent) && b.className.includes('btn-primary'))?.disabled,
    }));
    ok(/more than the sub-total/.test(huge.alert) && huge.saveDisabled === true, `refused before saving: “${huge.alert.slice(0, 70)}”, Save held`);
    await page.click('input[aria-label="Discount"]', { clickCount: 3 }); await page.keyboard.press('Backspace');
    await page.type('input[aria-label="Discount"]', '21');
    await settle();
    const summary = await page.evaluate(() => [...document.querySelectorAll('div')].find(d => /^Invoice summary/.test(d.innerText) && d.innerText.length < 600)?.innerText || document.body.innerText);
    ok(!/₹-|-₹|−\s*₹?-/.test(summary) && /21\.00/.test(summary), 'the discount shows once as −₹21.00, no double minus');

    item('9', 'discount in ₹ or %');
    const modes = await page.$$eval('select[aria-label="Discount in"] option', os => os.map(o => o.textContent));
    await page.select('select[aria-label="Discount in"]', 'pct');
    await page.click('input[aria-label="Discount"]', { clickCount: 3 }); await page.keyboard.press('Backspace');
    await page.type('input[aria-label="Discount"]', '10');
    ok(modes.join() === '₹,%' && await waitText(/= ₹100(\.00)? off the sub-total/), `₹ or %, and 10% says what it comes to (${modes.join(' / ')})`);

    item('11', 'a line with figures but no description; the unit');
    await click('button', /Add line/);
    await page.type('input[aria-label="Line 2 quantity"]', '5');
    await page.type('input[aria-label="Line 2 rate"]', '10');
    const emptyDesc = await page.evaluate(() => ({
      alert: [...document.querySelectorAll('[role="alert"]')].map(a => a.innerText).join(' '),
      saveDisabled: [...document.querySelectorAll('button.btn-primary')].find(b => /Save|Create|Issue/.test(b.textContent))?.disabled,
      unit: document.querySelector('select[aria-label="Line 1 unit"]')?.tagName,
    }));
    ok(/Describe this item, or remove the line/.test(emptyDesc.alert) && emptyDesc.saveDisabled === true,
      'the row is marked “Describe this item, or remove the line” and Save is held — it is not dropped');
    ok(emptyDesc.unit === 'SELECT', 'the unit is a choice from the list, so “123333…” cannot be entered');

    item('10', 'the invoice: what is still owed, the words, the exact figures');
    await go(`/sales-invoices/${big.id}`, /TAX INVOICE|Tax invoice/i);
    const doc = await page.evaluate(() => document.body.innerText);
    ok(/Balance due/i.test(doc) && /(Amount )?received/i.test(doc), 'Amount received and Balance due are shown');
    ok(/1,25,29,05,41,685\.00/.test(doc) && !/1,25,29,10,00,000/.test(doc), 'the sub-total is exact: 1,25,29,05,41,685.00 (it printed 1,25,29,10,00,000)');
    const words = (doc.match(/Amount in Words:[^\n]*/i) || [''])[0];
    ok(words && !/undefined/i.test(words) && /Crore/.test(words), `amount in words reads properly: “${words.slice(0, 110)}…”`);

    item('12', 'printing: the last line items stay with the totals');
    console.log('   ↪  checked page by page in scripts/test-documents-print.cjs (147 checks), run alongside this one');

    item('13', 'big numbers stay in their tiles');
    await go('/sales-invoices', /Total Billed/i);
    const tiles = await page.evaluate(() => [...document.querySelectorAll('div[title^="₹"]')].map(d => {
      const s = d.firstElementChild; return { text: d.innerText.trim(), title: d.title, fits: !s || s.getBoundingClientRect().width <= d.clientWidth + 1.5 };
    }));
    ok(tiles.length >= 3 && tiles.every(t => t.fits) && tiles.some(t => /Cr$/.test(t.text) && /^₹[\d,]+$/.test(t.title)),
      `the tiles read short (${tiles.map(t => t.text).join(', ')}), exact on hover, and nothing spills out`);
    await go('/inventory', /Stock value/i);
    const cards = await page.evaluate(() => [...document.querySelectorAll('[data-stock-card]')].map(c => {
      const r = c.getBoundingClientRect(); const p = c.querySelector('[data-pill]')?.getBoundingClientRect();
      return !p || (p.right <= r.right + 1 && p.left >= r.left - 1);
    }));
    ok(cards.length >= 2 && cards.every(Boolean) && await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      'stock cards keep their status pill inside, with 32,43,242 on hand');

    /* 14 ────────────────────────────────────────────────────────────── */
    item('14', 'number fields: phone, account holder, IFSC');
    await go('/vendors/new', /New vendor/);
    await page.type('[data-field="name"]', `New vendo1 ${stamp}`);
    await page.type('[data-field="phone"]', '09885300702xdf');
    await page.click('[data-field="gstin"]');
    ok(await waitText(/Use digits only/), 'a phone with letters is called out next to the field');
    await click('button', /Bank details/);
    await page.waitForSelector('[data-field="ifsc"]');
    await page.type('[data-field="accountHolder"]', 'dfaefa132131231231');
    await page.type('[data-field="ifsc"]', 'xdada1');
    await page.click('[data-field="accountNumber"]');
    ok(await waitText(/An IFSC is 11 characters/) && await waitText(/looks like a number/), 'a bad IFSC and an account holder made of digits are each called out');
    await click('button', /Add vendor/);
    ok(await waitText(/Fix .* before saving/), 'Add vendor will not save, and says why');

    /* 15 ────────────────────────────────────────────────────────────── */
    item('15', 'Add stock to an item already held');
    await go('/inventory', /Stock value/i);
    await click('button', /Add stock/);
    await waitText(/Record what you already hold/);
    const nameBox = await page.evaluateHandle(() => [...document.querySelectorAll('input')].find(i => i.placeholder === 'e.g. MDF 16mm 8x4'));
    await nameBox.asElement().type(`csd ${stamp}`);
    ok(await waitText(/You already hold 3,21,231 nos of csd/), 'it says “You already hold 3,21,231 nos of csd …” and that the quantity is added to it');
    ok(await waitText(/Quantity to add/), 'and the box reads “Quantity to add”');
    await page.keyboard.press('Escape');

    /* 16 ────────────────────────────────────────────────────────────── */
    item('16', 'production yield tiles');
    await go(`/production/${prod.id}`, /Yield & Material Balance/);
    const metrics = await page.evaluate(() => document.body.innerText);
    const labels = ['Yield', 'Recovered', 'Scrap', 'Unaccounted Loss', 'Material issued', 'Output', 'Net material cost', 'Cost / Unit'];
    ok(labels.every(l => metrics.toLowerCase().includes(l.toLowerCase())), `every tile is labelled (${labels.join(', ')})`);
    ok(/92\.05%/.test(metrics), 'and worked out: yield 40,000 ÷ 43,454 kg = 92.05%');

    /* 17 ────────────────────────────────────────────────────────────── */
    item('17', '“stock rows linked — Fix this”, and linking one');
    await go('/dashboard', /glance|Dashboard/i);
    await waitText(/Stock rows linked to a material or product/);
    const fixHref = await page.evaluate(() => [...document.querySelectorAll('a')].find(a => /Fix this/.test(a.textContent) && /inventory/.test(a.getAttribute('href')))?.getAttribute('href'));
    ok(fixHref === '/inventory?unlinked=1', `Fix this goes to the unlinked stock rows (${fixHref})`);
    await go('/inventory?unlinked=1', /Show all stock/);
    await page.evaluate((n) => [...document.querySelectorAll('button[aria-label^="Link "]')].find(b => b.getAttribute('aria-label').includes(n))?.click(), `Angle 50x50x6 ${stamp}`);
    await waitFor(() => document.querySelectorAll('[role="option"]').length > 0);
    await click('button', /^\s*Link stock\s*$/);
    ok(await waitText(new RegExp(`is now linked to Angle 50x50x6 ${stamp}`)), 'each row has Link, and Link stock links it and says so');

    console.log('');
    ok(errs.length === 0, `no page errors${errs.length ? `: ${errs.slice(0, 2).join(' | ')}` : ''}`);
  } catch (e) {
    fail++; console.log(`   ❌ crashed: ${e.stack || e.message}`);
  } finally {
    if (browser) await browser.close();
    const removed = await purge(ids.filter(Boolean)).catch(() => 0);
    console.log(`\n   ✅ test account removed (${removed})`);
    console.log(`\n  ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
})();
