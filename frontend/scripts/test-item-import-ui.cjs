#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════
   Import products, raw materials and recipes — on the screen
   (components/ItemImport, pages/SKUs, pages/RawMaterials, pages/Import).

   Items → Products has Import and Import recipes; Items → Raw materials has
   Import; Settings → Import data opens the same importer. In the window:
   the template downloads as a workbook, a chosen sheet shows its columns,
   the problems listed by row before anything is saved, row by row what
   will happen, and the import button says what it will do. Items already
   on file can be updated or left alone. An imported recipe shows on the
   product's Recipe button.

   Builds its own throwaway company (iiui-*@example.test) and removes it.
   Needs the backend (SCHEDULER=off) and vite. Refuses a deployed host.
     API_BASE=http://localhost:5097 UI_BASE=http://localhost:5176 node scripts/test-item-import-ui.cjs
   ═══════════════════════════════════════════════════════════ */
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const B = path.join(__dirname, '../../backend');
require(path.join(B, 'node_modules/dotenv')).config({ path: path.join(B, '.env') });
const { Client } = require(path.join(B, 'node_modules/pg'));
const ExcelJS = require(path.join(B, 'node_modules/exceljs'));
const { purgeOrg } = require(path.join(B, 'scripts/lib/purgeOrg'));

const API = process.env.API_BASE || 'http://localhost:5099';
const UI = process.env.UI_BASE || 'http://localhost:5173';
if ([API, UI].some(u => /^https:|onrender\.com|vercel\.app|maksops\.co\.in/.test(u))) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}
const SHOTS = process.env.SHOTS_DIR || null;
const stamp = Date.now().toString(36);
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };
const section = (t) => console.log(`\n  ── ${t}`);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const db = () => new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const rows = async (sql, p) => { const c = db(); await c.connect(); try { return (await c.query(sql, p)).rows; } finally { await c.end(); } };

async function cleanup() {
  const c = db(); await c.connect();
  try {
    const { rows: r } = await c.query(`SELECT id FROM users WHERE email LIKE 'iiui-%@example.test'`);
    const ids = r.map(x => x.id); if (!ids.length) return 0;
    for (let i = 0; i < 5; i++) { const x = await purgeOrg(c, ids); if (!x.deleted) break; }
    await c.query('DELETE FROM document_sequences WHERE owner_id = ANY($1)', [ids]).catch(() => {});
    await c.query('DELETE FROM notifications WHERE user_id = ANY($1)', [ids]).catch(() => {});
    return (await c.query(`DELETE FROM users WHERE id = ANY($1) AND email LIKE '%@example.test'`, [ids])).rowCount;
  } finally { await c.end(); }
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'iiui-'));
const downloads = path.join(work, 'downloads'); fs.mkdirSync(downloads);
const file = (name, text) => { const p = path.join(work, name); fs.writeFileSync(p, text); return p; };

(async () => {
  await cleanup();
  const reg = await (await fetch(`${API}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Import Screen', email: `iiui-a-${stamp}@example.test`, password: 'testpassword123' }) })).json();
  const org = (await rows('SELECT org_id FROM users WHERE email = $1', [`iiui-a-${stamp}@example.test`]))[0]?.org_id;
  /* A company with a name skips the first-run "Set up your workspace" page. */
  await fetch(`${API}/company-profile`, { method: 'PUT', headers: { Authorization: `Bearer ${reg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Import Screen Works', gstin: '36ABCDE1234F1Z9', stateCode: '36' }) });

  const products = file('products.csv', [
    'Product code,Product name,Unit,Price,HSN code',
    `UI-ARM,Cross arm ${stamp},nos,850,7308`,
    `UI-TRAY,Cable tray ${stamp},m,"1,200",7308`,
    'UI-BAD,Bad price,nos,abc,',
  ].join('\r\n'));
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Materials');
  ws.addRow(['Material code', 'Material name', 'Unit', 'Standard rate']);
  ws.addRow(['UI-ANG', `MS angle ${stamp}`, 'kg', 62]);
  ws.addRow(['UI-BLT', `Hex bolt ${stamp}`, 'nos', 8]);
  const materials = path.join(work, 'materials.xlsx'); await wb.xlsx.writeFile(materials);
  const recipes = file('recipes.csv', [
    'Product code,Material code,Qty per unit,Unit',
    'UI-ARM,UI-ANG,4.2,kg',
    'UI-ARM,UI-BLT,4,nos',
    'UI-TRAY,UI-ANG,1.1,kg',
    'UI-TRAY,UI-NOPE,1,kg',
  ].join('\r\n'));
  const update = file('update.csv', `Product code,Product name,Price\r\nUI-ARM,Cross arm ${stamp},900\r\n`);

  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1000 });
    const cdp = await page.createCDPSession();
    await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(`${UI}/login`);
    await page.evaluate((t) => { localStorage.setItem('nexus_token', t); localStorage.removeItem('nexus_active_project'); }, reg.token);
    const waitFor = (fn, ms = 12000, ...args) => page.waitForFunction(fn, { timeout: ms }, ...args).then(() => true).catch(() => false);
    const waitText = (re, ms = 12000) => waitFor((src) => new RegExp(src).test(document.body.innerText), ms, re.source);
    const click = (sel, re) => page.evaluate((s, src) => {
      const el = [...document.querySelectorAll(s)].find(e => new RegExp(src).test(e.textContent.trim()));
      if (el) el.click();
      return !!el;
    }, sel, re.source);
    const choose = async (p) => { const input = await page.$('input[data-import-file]'); await input.uploadFile(p); };
    const commitButton = () => page.$eval('[data-import-commit]', b => ({ text: b.textContent.trim(), disabled: b.disabled })).catch(() => null);
    const waitCommit = (re, ms = 12000) => waitFor((src) => {
      const b = document.querySelector('[data-import-commit]');
      return !!b && !b.disabled && new RegExp(src).test(b.textContent.trim());
    }, ms, re.source);
    const shot = async (name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); };

    section('Items → Products: the import buttons and the template');
    await page.goto(`${UI}/items`, { waitUntil: 'networkidle2' });
    ok(await waitFor(() => !!document.querySelector('[data-import-open="products"]') && !!document.querySelector('[data-import-open="recipes"]')),
      'Products has “Import” and “Import recipes” beside Add SKU');
    await page.click('[data-import-open="products"]');
    ok(await waitText(/Import products/) && await waitText(/A name for each new product/), 'the window opens and says what the sheet needs');
    const before = await commitButton();
    ok(before && before.disabled, 'nothing to import until a sheet is chosen');
    await page.click('[data-import-template]');
    let got = null;
    for (let i = 0; i < 40 && !got; i++) { await sleep(250); got = fs.readdirSync(downloads).find(f => /products-template\.xlsx$/.test(f)); }
    let tplOk = false;
    if (got) { const t = new ExcelJS.Workbook(); await t.xlsx.readFile(path.join(downloads, got)); tplOk = t.worksheets[0].name === 'Products' && t.worksheets[0].getRow(1).getCell(2).value === 'Product name'; }
    ok(!!got && tplOk, `“Download template” saves a workbook with the Products headings (${got || 'nothing downloaded'})`);

    section('a products sheet: preview, problems first, import');
    await choose(products);
    ok(await waitText(/Headings found on row 1/), 'the headings are found');
    const nameCol = await page.$eval('#ii-col-name', el => el.options[el.selectedIndex].textContent).catch(() => '');
    ok(nameCol === 'Product name', `columns read from their labels (name ← “${nameCol}”)`);
    ok(await waitFor(() => /Row 4/.test(document.querySelector('[data-import-problems]')?.innerText || '') && /Price “abc” is not a number/.test(document.querySelector('[data-import-problems]')?.innerText || '')),
      'the problem is listed by row before importing: “Row 4 — Price “abc” is not a number”');
    ok(await waitCommit(/^Import 2 products$/), `the button says what it will do (${(await commitButton())?.text})`);
    ok(await waitText(/2 of 3 rows will be saved · 1 left out/), 'and the footer counts what goes in and what is left out');
    await shot('import-products-preview');
    await page.click('[data-import-commit]');
    ok(await waitText(/2 products added · 1 left out/), 'imported — the toast says what happened');
    ok(await waitText(new RegExp(`Cable tray ${stamp}`)), 'the new products are on the list without reloading');

    section('Items → Raw materials: an Excel workbook');
    await click('button, a, [role="tab"]', /^Raw materials$/);
    ok(await waitFor(() => !!document.querySelector('[data-import-open="materials"]')), 'Raw materials has its Import button');
    await page.click('[data-import-open="materials"]');
    await waitText(/Import raw materials/);
    await choose(materials);
    ok(await waitText(/of “Materials”/) && await waitCommit(/^Import 2 raw materials$/), 'the workbook is read from its sheet, both rows ready');
    await page.click('[data-import-commit]');
    ok(await waitText(/2 raw materials added/), 'imported');
    ok(await waitText(new RegExp(`Hex bolt ${stamp}`)), 'and listed');

    section('recipes: whole products, the bad one left out');
    await click('button, a, [role="tab"]', /^Products$/);
    await waitFor(() => !!document.querySelector('[data-import-open="recipes"]'));
    await page.click('[data-import-open="recipes"]');
    ok(await waitText(/Import recipes/) && await waitText(/It lists your products and raw materials to copy codes from/), 'the recipes window says its template lists your items');
    await choose(recipes);
    ok(await waitFor(() => /No raw material has the code UI-NOPE/.test(document.querySelector('[data-import-problems]')?.innerText || '')), 'the unknown material is listed as the problem');
    ok(await waitText(/Left out — row 5 has a problem\. A recipe is saved only when every row for it is right\./), 'the tray says why it is left out — the whole recipe, not half');
    ok(await waitCommit(/^Save 1 recipe$/), `one recipe can be saved (${(await commitButton())?.text})`);
    await shot('import-recipes-preview');
    await page.click('[data-import-commit]');
    ok(await waitText(/1 recipe added · 1 left out/), 'saved — the toast says so');
    const bom = await rows(`SELECT b.component_name, b.qty_per_unit FROM sku_bom b JOIN skus s ON s.id = b.sku_id WHERE s.owner_id = $1 AND s.sku_code = 'UI-ARM' ORDER BY b.id`, [org]);
    ok(bom.length === 2, `UI-ARM has its two recipe lines (${bom.map(b => `${b.component_name} ${Number(b.qty_per_unit)}`).join(', ')})`);
    await page.evaluate((name) => {
      const row = [...document.querySelectorAll('tr')].find(tr => tr.innerText.includes(name));
      const btn = row && [...row.querySelectorAll('button')].find(b => /Recipe/.test(b.textContent));
      if (btn) btn.click();
    }, `Cross arm ${stamp}`);
    ok(await waitText(/Recipe \/ Bill of Materials/) && await waitText(new RegExp(`MS angle ${stamp}`)), 'the Recipe button on the product shows the imported lines');
    await page.keyboard.press('Escape');
    await click('button', /^Cancel$/);
    await sleep(400);

    section('a second sheet: update, or leave alone');
    await page.click('[data-import-open="products"]');
    await waitText(/Import products/);
    await choose(update);
    ok(await waitText(/1 product in this sheet is already on file, with different values/), 'it asks what to do with a product already on file');
    ok(await waitText(/Price: ₹850(\.00)? → ₹900(\.00)?/), 'and shows the change: Price ₹850 → ₹900');
    await click('label', /Leave them as they are/);
    ok(await waitFor(() => { const b = document.querySelector('[data-import-commit]'); return b && b.disabled && /Nothing to change/.test(b.textContent); }),
      'leaving them alone, there is nothing to import');
    await click('label', /Update them with the sheet/);
    ok(await waitCommit(/^Import 1 product$/), 'updating, one product');
    await page.click('[data-import-commit]');
    ok(await waitText(/1 updated/), 'updated');
    const price = await rows(`SELECT price FROM skus WHERE owner_id = $1 AND sku_code = 'UI-ARM'`, [org]);
    ok(Number(price[0]?.price) === 900, `the price is now ₹900 (${price[0]?.price})`);

    section('Settings → Import data opens the same importer');
    await page.goto(`${UI}/import`, { waitUntil: 'networkidle2' });
    await page.select('select', 'recipes');
    ok(await waitText(/Import raw materials and products first/), 'choosing Recipes explains the order to import in');
    await page.click('[data-import-open="recipes"]');
    ok(await waitText(/Import recipes/) && await waitFor(() => !!document.querySelector('[data-import-template]')), 'and opens the recipes importer, with its template');
    await shot('import-data-page');

    section('on a phone');
    await page.setViewport({ width: 390, height: 844 });
    await page.goto(`${UI}/items`, { waitUntil: 'networkidle2' });
    await waitFor(() => !!document.querySelector('[data-import-open="products"]'));
    const across = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(across <= 1, `the Items page with its import buttons fits a phone (${across}px over)`);
    await page.click('[data-import-open="products"]');
    await waitText(/Import products/);
    await choose(products);
    await waitCommit(/^Import \d+ products?$|^Nothing to change$/).catch(() => {});
    await waitFor(() => !!document.querySelector('[data-import-table]'));
    const fits = await page.evaluate(() => {
      const dialog = document.querySelector('[data-import-commit]')?.closest('div[style*="max-width"]');
      const r = dialog?.getBoundingClientRect();
      return { pageOver: document.documentElement.scrollWidth - window.innerWidth, dialogFits: !!r && r.left >= 0 && r.right <= window.innerWidth + 1 };
    });
    ok(fits.pageOver <= 1 && fits.dialogFits, `the import window fits too; its table scrolls inside it (${fits.pageOver}px over, window inside: ${fits.dialogFits})`);
    await shot('import-phone');

    ok(!errs.length, `no errors in the page${errs.length ? `: ${errs.slice(0, 2).join(' | ')}` : ''}`);
  } catch (e) {
    fail++; console.log(`   ❌ crashed: ${e.stack || e.message}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    fs.rmSync(work, { recursive: true, force: true });
    const removed = await cleanup().catch((e) => { console.log('   cleanup failed:', e.message); return 0; });
    console.log(`\n   ✅ test accounts removed (${removed})`);
    console.log(`\n  ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
})();
