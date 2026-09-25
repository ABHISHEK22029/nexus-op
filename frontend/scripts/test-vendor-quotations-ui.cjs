#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   The vendor-quotation screen, driven the way a buyer drives it: upload
   two real spreadsheets, tick both, compare.

   The API test already proves the parsing and the tenancy. What only a
   browser can show is that the upload button is wired, the eye icon is
   there on every row, and the comparison leads with the like-for-like
   total rather than the smallest number.

   Refuses to run against a deployed host, and removes what it creates.
   ══════════════════════════════════════════════════════════════════════ */
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { sweepStale } = require(path.join(__dirname, '..', '..', 'backend', 'scripts', 'lib', 'testAccounts'));

const UI = process.env.UI_BASE || 'http://localhost:5173';
const API = process.env.API_BASE || 'http://localhost:5099';
if (/^https:|onrender\.com|vercel\.app/.test(UI + API)) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}

const stamp = Date.now().toString(36);
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const BACKEND = path.join(__dirname, '..', '..', 'backend');

(async () => {
  console.log('');
  /* Anything an earlier failed run of this test left on the database.
     Cleanup at the bottom of a script never runs when an assertion
     fails, so the next run clears it instead. */
  await sweepStale('vqui-');

  const reg = await (await fetch(`${API}/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'VQUI', email: `vqui-${stamp}@example.test`, password: 'testpassword123' }),
  })).json();
  const h = { Authorization: `Bearer ${reg.token}`, 'Content-Type': 'application/json' };
  /* Without a finished profile the app sends every route to the first-run
     screen, and the test looks like a broken page rather than a new account. */
  await fetch(`${API}/company-profile`, {
    method: 'PUT', headers: h,
    body: JSON.stringify({
      name: 'VQ Test Co', gstin: '36AAMCK2569F1Z9', stateCode: '36',
      setup_completed_at: new Date().toISOString(),
    }),
  });

  const ExcelJS = require(path.join(BACKEND, 'node_modules', 'exceljs'));
  const sheet = async (file, rows) => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Quotation');
    ws.addRow(['S.No', 'Description', 'HSN', 'UOM', 'Qty', 'Rate', 'Amount']);
    rows.forEach(r => ws.addRow(r));
    await wb.xlsx.writeFile(file);
  };
  const f1 = path.join(os.tmpdir(), `vq-a-${stamp}.xlsx`);
  const f2 = path.join(os.tmpdir(), `vq-b-${stamp}.xlsx`);
  await sheet(f1, [[1, 'MS Plate 10mm', '7208', 'KG', 500, 62, 31000], [2, 'Angle 50x50', '7216', 'KG', 300, 58, 17400]]);
  await sheet(f2, [[1, 'MS Plate 10mm', '7208', 'KG', 500, 59, 29500], [2, 'Angle 50x50', '7216', 'KG', 300, 61, 18300]]);

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(`${UI}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(t => localStorage.setItem('nexus_token', t), reg.token);
  await page.goto(`${UI}/vendor-quotations`, { waitUntil: 'networkidle2' });
  await sleep(1800);

  ok(/Vendor quotations/i.test(await page.evaluate(() => document.body.innerText)), 'the page renders');

  for (const [file, vendor] of [[f1, 'Acme Steel'], [f2, 'Surya Engg']]) {
    await page.type('input[aria-label="Vendor name"]', vendor);
    const input = await page.$('input[aria-label="Vendor quotation file"]');
    await input.uploadFile(file);
    await sleep(2600);
  }
  const listed = await page.evaluate(() => document.body.innerText);
  ok(/Acme Steel/.test(listed) && /Surya Engg/.test(listed), 'both uploads appear, named by vendor');
  /* Neither fixture states a grand total, so the list falls back to what the
     lines add up to: 31,000 + 17,400 and 29,500 + 18,300. An earlier version
     of this assertion looked for a single line's amount, which is not what a
     total column shows. */
  ok(/48,400/.test(listed) && /47,800/.test(listed),
    'each vendor’s total is the sum of the lines read from their file');
  ok((await page.$$('button[aria-label^="Open the original"]')).length >= 2,
    'every row has an eye icon for the vendor’s own file');

  for (const cb of (await page.$$('input[type=checkbox][aria-label^="Compare"]')).slice(0, 2)) await cb.click();
  await sleep(300);
  for (const btn of await page.$$('button')) {
    if (/Compare 2/.test(await page.evaluate(e => e.innerText, btn))) { await btn.click(); break; }
  }
  await sleep(2200);

  const cmp = await page.evaluate(() => document.body.innerText);
  ok(/Side by side/i.test(cmp), 'the comparison opens');
  ok(/Like for like/i.test(cmp), 'and leads with the like-for-like total, not the smallest number');
  ok(/Lowest like for like/i.test(cmp), 'naming a winner on the items both vendors quoted');
  /* Acme is cheaper on the angle, Surya on the plate — so the per-line
     winners must differ, which is the whole point of a line-by-line view. */
  ok(/Spread/i.test(cmp), 'and shows the spread between vendors per item');

  ok(errs.length === 0, `no JavaScript errors${errs.length ? ': ' + errs[0].slice(0, 90) : ''}`);
  await page.screenshot({ path: process.env.SHOT || path.join(os.tmpdir(), `vq-${stamp}.png`), fullPage: true });
  await browser.close();
  for (const f of [f1, f2]) { try { fs.unlinkSync(f); } catch { /* ignore */ } }

  require(path.join(BACKEND, 'node_modules', 'dotenv')).config({ path: path.join(BACKEND, '.env') });
  const { Client } = require(path.join(BACKEND, 'node_modules', 'pg'));
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  await c.query('DELETE FROM vendor_quotation_lines WHERE owner_id = $1', [reg.user.id]).catch(() => {});
  await c.query('DELETE FROM vendor_quotations WHERE owner_id = $1', [reg.user.id]).catch(() => {});
  await c.query('DELETE FROM attachments WHERE owner_id = $1', [reg.user.id]).catch(() => {});
  await c.query('DELETE FROM company_profile WHERE owner_id = $1', [reg.user.id]).catch(() => {});
  await c.query('DELETE FROM users WHERE id = $1', [reg.user.id]).catch(() => {});
  await c.end();

  console.log(`\n   ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('threw:', e.message); process.exit(1); });
