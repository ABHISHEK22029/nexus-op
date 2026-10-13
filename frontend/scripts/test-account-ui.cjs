#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   Two things added on 13 Oct, in a browser.

   Vendors → Import: a CSV is really imported — the toast says how many
   were added and why a row was skipped, and the new vendor is in the list.

   Account menu → Change password: a wrong current password is refused on
   the form, two different new ones are caught before sending, and a good
   change keeps this session signed in while the old session is signed out.
   The form fits at 360px. No page errors.

     API_BASE=http://localhost:5097 UI_BASE=http://localhost:5176 node scripts/test-account-ui.cjs
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
const email = `acctui-${stamp}@example.test`;
const OLD = 'testpassword123';
const NEW = `Fresh${stamp}7`;
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };

(async () => {
  const reg = await (await fetch(`${API}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Account UI', email, password: OLD }) })).json();
  await fetch(`${API}/company-profile`, { method: 'PUT', headers: { Authorization: `Bearer ${reg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Account UI Works' }) });
  const csv = path.join(os.tmpdir(), `vendors-${stamp}.csv`);
  fs.writeFileSync(csv, [
    'Supplier Name,GSTIN,Mobile No,City',
    `Godavari Metals ${stamp},36ABCDE1234F1Z5,9000000002,Hyderabad`,
    `Bad Phone Co ${stamp},,12345,`,
  ].join('\n'));
  let browser;
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const errs = [];
    const page = await browser.newPage();
    page.on('pageerror', e => errs.push(e.message));
    await page.setViewport({ width: 1280, height: 860 });
    const waitText = (re, ms = 10000) => page.waitForFunction((src) => new RegExp(src).test(document.body.innerText), { timeout: ms }, re.source).then(() => true).catch(() => false);

    await page.goto(`${UI}/login`);
    await page.evaluate((t, u) => { localStorage.setItem('nexus_token', t); localStorage.setItem('nexus_user', JSON.stringify(u)); }, reg.token, reg.user);

    console.log('\n  ── Vendors → Import');
    await page.goto(`${UI}/vendors`, { waitUntil: 'networkidle2' });
    const input = await page.$('input[type="file"][accept*=".csv"]');
    ok(!!input, 'the Import button takes a spreadsheet');
    await input.uploadFile(csv);
    ok(await waitText(/1 vendor added, 1 row skipped \(row 3: Phone/), 'the toast says one was added and why row 3 was skipped');
    ok(await waitText(new RegExp(`Godavari Metals ${stamp}`)), 'the imported vendor is in the list');

    console.log('\n  ── Account menu → Change password');
    /* A fresh page: the import's toast sits over the avatar for a few seconds. */
    await page.goto(`${UI}/dashboard`, { waitUntil: 'networkidle2' });
    const openCard = async () => { await page.click('button[aria-label^="Account"]'); await page.waitForFunction(() => /Change password/.test(document.body.innerText)); };
    const clickText = (t) => page.evaluate((txt) => [...document.querySelectorAll('button')].find(b => b.innerText.trim() === txt)?.click(), t);
    await openCard();
    await clickText('Change password');
    await page.waitForSelector('input[autocomplete="current-password"]');
    const fields = await page.$$('input[type="password"]');
    ok(fields.length === 3, 'it asks for the current password and the new one twice');
    await fields[0].type(OLD); await fields[1].type(NEW); await fields[2].type(NEW + 'x');
    await page.click('form button[type="submit"]');
    ok(await waitText(/don't match/), 'two different new passwords are caught before anything is sent');
    for (const f of fields) await f.click({ clickCount: 3 });
    await fields[0].click({ clickCount: 3 }); await fields[0].type('not-my-password');
    await fields[2].click({ clickCount: 3 }); await fields[2].type(NEW);
    await page.click('form button[type="submit"]');
    ok(await waitText(/current password is not right/), 'a wrong current password is refused on the form');
    await fields[0].click({ clickCount: 3 }); await fields[0].type(OLD);
    await page.click('form button[type="submit"]');
    ok(await waitText(/Password changed/), 'a good change says so');
    const tokenNow = await page.evaluate(() => localStorage.getItem('nexus_token'));
    ok(tokenNow && tokenNow !== reg.token, 'this session was handed a fresh token');
    await page.goto(`${UI}/dashboard`, { waitUntil: 'networkidle2' });
    ok(!/\/login/.test(page.url()), `and stays signed in (${new URL(page.url()).pathname})`);
    const oldMe = await fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${reg.token}` } });
    ok(oldMe.status === 401, `the old session is signed out (${oldMe.status})`);
    const relog = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: NEW }) });
    ok(relog.status === 200, 'the new password signs in');

    console.log('\n  ── at phone width');
    await page.setViewport({ width: 360, height: 780 });
    await page.goto(`${UI}/dashboard`, { waitUntil: 'networkidle2' });
    await openCard();
    await clickText('Change password');
    await page.waitForSelector('input[autocomplete="current-password"]');
    const fits = await page.evaluate(() => {
      const f = document.querySelector('form input[autocomplete="current-password"]').closest('div[style*="absolute"]').getBoundingClientRect();
      return f.left >= 0 && f.right <= window.innerWidth && document.documentElement.scrollWidth <= window.innerWidth;
    });
    ok(fits, 'the form fits at 360px, no sideways scroll');
    ok(errs.length === 0, `no page errors${errs.length ? `: ${errs.slice(0, 2).join(' | ')}` : ''}`);
  } catch (e) {
    fail++; console.log(`   ❌ crashed: ${e.stack || e.message}`);
  } finally {
    if (browser) await browser.close();
    fs.rmSync(csv, { force: true });
    const removed = await purge([reg.user?.id].filter(Boolean)).catch(() => 0);
    console.log(`\n   ✅ test account removed (${removed})`);
    console.log(`\n  ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
})();
