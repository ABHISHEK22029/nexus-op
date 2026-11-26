#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   The one-field pencil (components/InlineEdit), where it is still used:
   the e-way bill number on a delivery challan.

   The invoice and the quotation used to have pencils on their number and
   dates; since 26 Nov the whole sheet is edited on the page instead
   (components/DocEdit — scripts/test-doc-edit-ui.cjs). The challan's
   e-way bill keeps its pencil: it is the one thing on a challan typed in
   after it is made, usually at the gate.

   A build passing proves nothing here: an undefined component is a runtime
   error, not a build error, so the only way to know the pencil works is to
   click it. Refuses to run against a deployed host, and removes what it
   creates.
   ══════════════════════════════════════════════════════════════════════ */
const puppeteer = require('puppeteer');
const path = require('path');
const { sweepStale } = require(path.join(__dirname, '..', '..', 'backend', 'scripts', 'lib', 'testAccounts'));

const UI = process.env.UI_BASE || 'http://localhost:5173';
const API = process.env.API_BASE || 'http://localhost:5099';
if (/^https:|onrender\.com|vercel\.app/.test(UI + API)) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}

const stamp = Date.now().toString(36);
const today = new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('');
  await sweepStale('editui-');

  const reg = await (await fetch(`${API}/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'EditUI', email: `editui-${stamp}@example.test`, password: 'testpassword123' }),
  })).json();
  const h = { Authorization: `Bearer ${reg.token}`, 'Content-Type': 'application/json' };
  await fetch(`${API}/company-profile`, { method: 'PUT', headers: h,
    body: JSON.stringify({ name: 'Edit UI Co', gstin: '36ABCDE1234F1Z9', stateCode: '36' }) });
  const cust = await (await fetch(`${API}/customers`, { method: 'POST', headers: h,
    body: JSON.stringify({ name: `Buyer ${stamp}`, state: 'Telangana', billing_address: 'Hyderabad' }) })).json();
  const dc = await (await fetch(`${API}/delivery-challans`, { method: 'POST', headers: h,
    body: JSON.stringify({ customerId: cust.id, challanDate: today, items: [{ description: 'Cross arm', quantity: 200, uom: 'nos', rate: 400 }] }) })).json();

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(`${UI}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(t => localStorage.setItem('nexus_token', t), reg.token);

  console.log('  ── the e-way bill on a challan');
  await page.goto(`${UI}/delivery-challans/${dc.id}`, { waitUntil: 'networkidle2' });
  await page.waitForSelector('.doc-sheet', { timeout: 30000 });
  await sleep(600);
  const pencil = await page.$('button[aria-label*="Edit eway bill no"]');
  ok(!!pencil, 'the e-way bill number has a pencil next to it');
  if (pencil) {
    await pencil.click();
    await sleep(300);
    const input = await page.$('input[aria-label="eway bill no"]');
    ok(!!input, 'clicking it turns it into a field');
    if (input) {
      await input.click({ clickCount: 3 });
      await page.keyboard.type('341028761952');
      await page.keyboard.press('Enter');
      await sleep(1200);
    }
  }
  const after = await (await fetch(`${API}/delivery-challans/${dc.id}`, { headers: h })).json();
  ok(after.eway_bill_no === '341028761952', `and the server has it (${after.eway_bill_no})`);
  ok(await page.evaluate(() => document.querySelector('[data-challan-facts]')?.innerText.includes('341028761952')), 'the challan shows it without a reload');
  await page.click('button[aria-label*="Edit eway bill no"]');
  await sleep(200);
  await page.keyboard.type('x');
  await page.keyboard.press('Escape');
  await sleep(300);
  ok(!(await page.$('input[aria-label="eway bill no"]')) && await page.evaluate(() => document.querySelector('[data-challan-facts]').innerText.includes('341028761952')), 'Escape leaves it as it was');

  ok(errs.length === 0, `no JavaScript errors${errs.length ? ': ' + errs[0].slice(0, 100) : ''}`);
  await browser.close();

  /* ── leave the database as it was found: this run's account too (0 min) ── */
  await sweepStale('editui-', 0);
  console.log(`\n   ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('threw:', e.message); process.exit(1); });
