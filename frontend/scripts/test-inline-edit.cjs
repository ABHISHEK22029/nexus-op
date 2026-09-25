#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   Editing a document from the document itself.

   A build passing proves nothing here: an undefined component is a runtime
   error, not a build error, so the only way to know the pencil works is to
   click it. This opens a real quotation and a real invoice, edits the
   number in place, and checks the server agreed — then issues the invoice
   and checks the field locks rather than failing after you type.

   Refuses to run against a deployed host, and removes what it creates.
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
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('');
  /* Anything an earlier failed run of this test left on the database.
     Cleanup at the bottom of a script never runs when an assertion
     fails, so the next run clears it instead. */
  await sweepStale('editui-');

  const reg = await (await fetch(`${API}/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'EditUI', email: `editui-${stamp}@example.test`, password: 'testpassword123' }),
  })).json();
  const h = { Authorization: `Bearer ${reg.token}`, 'Content-Type': 'application/json' };
  await fetch(`${API}/company-profile`, { method: 'PUT', headers: h,
    body: JSON.stringify({ name: 'Edit UI Co', gstin: '36AAMCK2569F1Z9', stateCode: '36' }) });
  const cust = await (await fetch(`${API}/customers`, { method: 'POST', headers: h,
    body: JSON.stringify({ name: `Buyer ${stamp}`, state: 'Telangana' }) })).json();
  const q = await (await fetch(`${API}/sales-quotations`, { method: 'POST', headers: h,
    body: JSON.stringify({ customerId: cust.id, items: [{ description: 'Cross arm', quantity: 5, rate: 200 }] }) })).json();
  const inv = await (await fetch(`${API}/sales-invoices`, { method: 'POST', headers: h,
    body: JSON.stringify({ customerId: cust.id, items: [{ description: 'Cross arm', quantity: 5, rate: 200 }] }) })).json();

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(`${UI}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(t => localStorage.setItem('nexus_token', t), reg.token);

  const editNumber = async (url, label, newValue) => {
    await page.goto(url, { waitUntil: 'networkidle2' });
    await sleep(2000);
    const pencil = await page.$(`button[aria-label*="Edit ${label}"]`);
    if (!pencil) return { clicked: false };
    await pencil.click();
    await sleep(300);
    const input = await page.$(`input[aria-label="${label}"]`);
    if (!input) return { clicked: true, input: false };
    await input.click({ clickCount: 3 });
    await page.keyboard.type(newValue);
    await page.keyboard.press('Enter');
    await sleep(1200);
    return { clicked: true, input: true };
  };

  console.log('  ── a draft quotation');
  let r = await editNumber(`${UI}/sales-quotations/${q.id}`, 'quote number', `QT-UI-${stamp}`);
  ok(r.clicked, 'the number has a pencil next to it');
  ok(r.input, 'clicking it turns the number into a field');
  const qAfter = await (await fetch(`${API}/sales-quotations/${q.id}`, { headers: h })).json();
  ok(qAfter.quote_number === `QT-UI-${stamp}`,
    `and the server has the new number (${qAfter.quote_number})`);
  ok(await page.evaluate(v => document.body.innerText.includes(v), `QT-UI-${stamp}`),
    'the document shows it without a reload');

  console.log('\n  ── a draft invoice');
  r = await editNumber(`${UI}/sales-invoices/${inv.id}`, 'invoice number', `INV-UI-${stamp}`);
  ok(r.clicked && r.input, 'the invoice number is editable while it is a draft');
  const invAfter = await (await fetch(`${API}/sales-invoices/${inv.id}`, { headers: h })).json();
  ok(invAfter.invoice_number === `INV-UI-${stamp}`, `the server has it (${invAfter.invoice_number})`);

  console.log('\n  ── once the invoice is issued');
  await fetch(`${API}/sales-invoices/${inv.id}/status`, { method: 'PATCH', headers: h, body: JSON.stringify({ status: 'Sent' }) });
  await page.goto(`${UI}/sales-invoices/${inv.id}`, { waitUntil: 'networkidle2' });
  await sleep(2000);
  const locked = await page.evaluate(() => ({
    pencil: !!document.querySelector('button[aria-label*="Edit invoice number"]'),
    padlock: document.body.innerText.includes('🔒'),
  }));
  ok(!locked.pencil, 'the pencil is gone from the invoice number');
  ok(locked.padlock, 'and a padlock explains why, instead of failing after you type');

  ok(errs.length === 0, `no JavaScript errors${errs.length ? ': ' + errs[0].slice(0, 100) : ''}`);
  await browser.close();

  /* ── leave the database as it was found ── */
  const base = path.join(__dirname, '..', '..', 'backend');
  require(path.join(base, 'node_modules', 'dotenv')).config({ path: path.join(base, '.env') });
  const { Client } = require(path.join(base, 'node_modules', 'pg'));
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  await c.query('DELETE FROM sales_quotation_items WHERE sales_quotation_id IN (SELECT id FROM sales_quotations WHERE owner_id=$1)', [reg.user.id]).catch(() => {});
  await c.query('DELETE FROM sales_invoice_items WHERE sales_invoice_id IN (SELECT id FROM sales_invoices WHERE owner_id=$1)', [reg.user.id]).catch(() => {});
  for (const t of ['sales_quotations', 'sales_invoices', 'customers', 'company_profile', 'document_sequences']) {
    await c.query(`DELETE FROM ${t} WHERE owner_id = $1`, [reg.user.id]).catch(() => {});
  }
  await c.query('DELETE FROM users WHERE id = $1', [reg.user.id]).catch(() => {});
  await c.end();

  console.log(`\n   ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('threw:', e.message); process.exit(1); });
