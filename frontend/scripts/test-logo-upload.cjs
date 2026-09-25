#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   Uploading a logo, through the screen a person actually uses.

   The API test already proves the bytes round-trip and stay inside one
   organisation. What it cannot prove is that the button exists, that
   choosing a file does anything, and that the result reaches the place
   the logo is FOR — the letterhead on a document.

   So this drives the real page: pick a file, wait for the preview, then
   open a quotation and check the letterhead renders an image.

   Refuses to run against a deployed host, and removes the account it made.
   ══════════════════════════════════════════════════════════════════════ */
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { sweepStale } = require(path.join(__dirname, '..', '..', 'backend', 'scripts', 'lib', 'testAccounts'));

/* localhost, not 127.0.0.1: Vite binds to localhost, which resolves to ::1
   first on Windows, and the IPv4 literal is refused. */
const UI = process.env.UI_BASE || 'http://localhost:5173';
const API = process.env.API_BASE || 'http://localhost:5099';
if (/^https:|onrender\.com|vercel\.app/.test(UI + API)) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}

const stamp = Date.now().toString(36);
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* A 2x2 red PNG — big enough to see, small enough to inline. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8Dwn4EIwDiqkL4KAcLiBPvH2jUBAAAAAElFTkSuQmCC',
  'base64');

(async () => {
  console.log('');
  /* Anything an earlier failed run of this test left on the database.
     Cleanup at the bottom of a script never runs when an assertion
     fails, so the next run clears it instead. */
  await sweepStale('logo-ui-');

  const reg = await (await fetch(`${API}/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'LogoCo', email: `logo-ui-${stamp}@example.test`, password: 'testpassword123' }),
  })).json();
  const auth = { Authorization: `Bearer ${reg.token}`, 'Content-Type': 'application/json' };
  await fetch(`${API}/company-profile`, {
    method: 'PUT', headers: auth,
    body: JSON.stringify({ name: `Logo Test Co ${stamp}`, address: 'Somewhere', gstin: '36AAAAA0000A1Z5', stateCode: '36' }),
  });

  const file = path.join(os.tmpdir(), `logo-${stamp}.png`);
  fs.writeFileSync(file, PNG);

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.setViewport({ width: 1440, height: 950 });
  await page.goto(`${UI}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(t => localStorage.setItem('nexus_token', t), reg.token);

  console.log('  ── the Company Profile screen');
  await page.goto(`${UI}/company-profile`, { waitUntil: 'networkidle2' });
  await sleep(1800);

  ok(await page.evaluate(() => /Upload logo/i.test(document.body.innerText)),
    'offers to upload a logo, not just paste a link');
  ok(await page.evaluate(() => !!document.querySelector('input[type=file][accept*="image"]')),
    'there is a real file input behind it');
  ok(await page.evaluate(() => /Optional fallback/i.test(document.body.innerText)),
    'and the old URL field is now labelled as the fallback');

  console.log('\n  ── choosing a file');
  const input = await page.$('input[type=file][accept*="image"]');
  await input.uploadFile(file);
  await page.waitForFunction(
    () => /Stored:/.test(document.body.innerText), { timeout: 15000 }).catch(() => {});
  await sleep(600);
  ok(await page.evaluate(() => /Stored:/.test(document.body.innerText)),
    'the page reports what is stored, read back from the server');
  ok(await page.evaluate(() => {
    const img = [...document.querySelectorAll('img')].find(i => /blob:/.test(i.src));
    return !!img && img.naturalWidth > 0;
  }), 'and previews the saved logo');
  ok(await page.evaluate(() => /Replace logo/i.test(document.body.innerText)),
    'the button now offers to replace it');

  console.log('\n  ── does it reach the letterhead?');
  const saved = await (await fetch(`${API}/company-profile/logo/status`, { headers: auth })).json();
  ok(saved.exists === true, `the server holds it (${saved.filename}, ${saved.size_bytes} bytes)`);

  /* A document page renders CompanyHeader; the logo must appear there and
     not only on the settings screen. */
  const cust = await (await fetch(`${API}/customers`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({ name: `Buyer ${stamp}`, state: 'Telangana' }),
  })).json();
  const quote = await (await fetch(`${API}/sales-quotations`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({ customerId: cust.id, items: [{ description: 'Test', quantity: 1, rate: 100 }] }),
  })).json();
  await page.goto(`${UI}/sales-quotations/${quote.id}`, { waitUntil: 'networkidle2' });
  await sleep(2200);
  const onDoc = await page.evaluate(() => {
    const img = [...document.querySelectorAll('img')].find(i => /blob:/.test(i.src));
    return img ? { ok: img.naturalWidth > 0, w: img.naturalWidth, h: img.naturalHeight } : null;
  });
  ok(onDoc && onDoc.ok, onDoc
    ? `the quotation letterhead renders the uploaded logo (${onDoc.w}x${onDoc.h})`
    : 'the quotation letterhead shows NO logo');

  ok(errs.length === 0, `no JavaScript errors${errs.length ? ': ' + errs[0].slice(0, 90) : ''}`);
  await browser.close();
  try { fs.unlinkSync(file); } catch { /* ignore */ }

  /* ── leave the database as it was found ── */
  const base = path.join(__dirname, '..', '..', 'backend');
  require(path.join(base, 'node_modules', 'dotenv')).config({ path: path.join(base, '.env') });
  const { Client } = require(path.join(base, 'node_modules', 'pg'));
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  for (const t of ['sales_quotation_items']) {
    await c.query(`DELETE FROM ${t} WHERE sales_quotation_id IN (SELECT id FROM sales_quotations WHERE owner_id = $1)`, [reg.user.id]).catch(() => {});
  }
  for (const t of ['sales_quotations', 'customers', 'attachments', 'company_profile', 'document_sequences']) {
    await c.query(`DELETE FROM ${t} WHERE owner_id = $1`, [reg.user.id]).catch(() => {});
  }
  await c.query('DELETE FROM users WHERE id = $1', [reg.user.id]).catch(() => {});
  const { rows } = await c.query('SELECT COUNT(*)::int n FROM attachments WHERE owner_id = $1', [reg.user.id]);
  await c.end();
  ok(rows[0].n === 0, 'test data removed — nothing left behind');

  console.log(`\n   ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('threw:', e.message); process.exit(1); });
