#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   Stock on hand → Upload sheet, in a browser.

   A sheet is chosen, its columns are read and shown, the rows are reviewed
   (a bad row says why), and saving puts the items on the page. The next
   sheet with items already held asks what to do — and "keep it as a
   separate stock list" makes a list the page can filter by, with the item's
   total across lists shown. Also: no horizontal scroll at 360px, no page
   errors.

     API_BASE=http://localhost:5097 UI_BASE=http://localhost:5174 node scripts/test-stock-upload-ui.cjs
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
const stamp = Date.now().toString(36);
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };

(async () => {
  const reg = await (await fetch(`${API}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Upload UI', email: `suui-${stamp}@example.test`, password: 'testpassword123' }) })).json();
  const ids = [reg.user?.id].filter(Boolean);
  /* A company with a name skips the first-run "Set up your workspace" page. */
  await fetch(`${API}/company-profile`, { method: 'PUT', headers: { Authorization: `Bearer ${reg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Upload UI Works', gstin: '36AAMCK2569F1Z9', stateCode: '36' }) });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'su-ui-'));
  const sheet = (name, text) => { const p = path.join(dir, name); fs.writeFileSync(p, text); return p; };
  const first = sheet('stock.csv', [
    'Stock as on 8 Oct', '',
    'Item Name,Closing Qty,UOM,Rate (₹)',
    `Angle 50x50x6 ${stamp},120,Nos,410`,
    `Flat bar 40x6 ${stamp},"1,250",Kgs,68`,
    `Broken row ${stamp},abc,nos,`,
  ].join('\r\n'));
  const second = sheet('site.csv', `Item Name,Qty,Unit\r\nAngle 50x50x6 ${stamp},30,nos\r\n`);
  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1000 });
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(`${UI}/login`);
    await page.evaluate((t) => { localStorage.setItem('nexus_token', t); localStorage.removeItem('nexus_active_project'); }, reg.token);
    const waitFor = (fn, ms = 10000, ...args) => page.waitForFunction(fn, { timeout: ms }, ...args).then(() => true).catch(() => false);
    const waitText = (re, ms = 10000) => waitFor((src) => new RegExp(src).test(document.body.innerText), ms, re.source);
    const click = (sel, re) => page.evaluate((s, src) => {
      const el = [...document.querySelectorAll(s)].find(e => new RegExp(src).test(e.textContent));
      if (el) el.click();
      return !!el;
    }, sel, re.source);
    const choose = async (file) => { const input = await page.$('input[type="file"]'); await input.uploadFile(file); };
    const saveButton = () => page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x => /^Save( \d+ items?)?/.test(x.textContent.trim()));
      return b ? { text: b.textContent.trim(), disabled: b.disabled } : null;
    });

    await page.goto(`${UI}/inventory`, { waitUntil: 'networkidle2' });
    ok(await waitText(/Upload your stock sheet/), 'an empty Stock on hand offers the upload');
    ok(await click('button', /Upload sheet/), 'the Upload sheet button opens it');
    ok(await waitText(/Upload stock sheet/), 'the upload dialog is open');

    await choose(first);
    ok(await waitText(/Headings found on row 3/), 'the headings are found under the title row');
    const qtyCol = await page.$eval('#su-col-quantity', (el) => el.options[el.selectedIndex].textContent);
    const rateCol = await page.$eval('#su-col-unitCost', (el) => el.options[el.selectedIndex].textContent);
    ok(qtyCol === 'Closing Qty' && rateCol === 'Rate (₹)', `columns read from their labels (${qtyCol}, ${rateCol})`);
    ok(await waitText(/Quantity “abc” is not a number/), 'a bad row says why it is left out');
    ok(await waitText(/2 new items are not in your item list yet/), 'new items: asked whether to add them as raw materials');
    let sb = await saveButton();
    ok(sb && !sb.disabled && /Save 2 items to Main stock/.test(sb.text), `the button says what it will do (${sb?.text})`);
    await click('button', /^Save 2 items/);
    ok(await waitText(/Main stock: 2 new/), 'saved — the toast says what happened');
    ok(await waitText(new RegExp(`Flat bar 40x6 ${stamp}`)) && await waitText(/1,250/), 'the items are on the page with their quantities');

    /* the next sheet: items already held */
    await click('button', /Upload sheet/);
    await waitText(/Upload stock sheet/);
    await choose(second);
    ok(await waitText(/One item in this sheet is already in Main stock\. What should this sheet do\?/), 'items already held: it asks what the sheet should do');
    sb = await saveButton();
    ok(sb && sb.disabled, 'and will not save until that is chosen');
    await click('label', /Keep this sheet as a separate stock list/);
    ok(await waitFor(() => !!document.querySelector('input[aria-label="New stock list name"]')), 'keeping it apart asks for the list name');
    await page.type('input[aria-label="New stock list name"]', 'Site store');
    /* The label follows the typing at once; the button only enables when the
       review for that name has arrived. */
    ok(await waitFor(() => [...document.querySelectorAll('button')].some(b => /^Save 1 item to Site store/.test(b.textContent.trim()) && !b.disabled), 12000),
      'the review now goes to the new list, and only then can it be saved');
    await click('button', /^Save 1 item to Site store/);
    ok(await waitText(/Site store: 1 new/), 'saved into Site store');
    ok(await waitFor(() => [...document.querySelectorAll('[aria-label="Stock list"] button')].map(b => b.textContent).join('|').includes('Site store')),
      'the page now offers All lists · Main stock · Site store');
    await click('[aria-label="Stock list"] button', /All lists/);
    ok(await waitText(/150 nos across 2 lists|150 Nos across 2 lists/), 'an item in two lists shows its total across them (120 + 30)');
    await click('[aria-label="Stock list"] button', /^Site store/);
    const shown = await page.evaluate(() => document.body.innerText.includes('Flat bar'));
    ok(!shown, 'filtering to Site store shows only what is held there');

    /* phone width */
    await page.setViewport({ width: 360, height: 780 });
    await click('button', /Upload sheet/);
    await waitText(/Upload stock sheet/);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(overflow <= 0, `no sideways scroll at 360px with the dialog open (${overflow}px)`);
    ok(!errs.length, `no page errors${errs.length ? `: ${errs[0]}` : ''}`);
  } catch (e) {
    fail++; console.log(`   ❌ crashed: ${e.stack || e.message}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
    const removed = await purge(ids).catch(() => 0);
    console.log(`\n   test account removed (${removed})`);
    console.log(`\n  ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
})();
