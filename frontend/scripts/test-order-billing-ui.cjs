#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   An order is billed once — in a browser.

   · Create Invoice on a part-billed order opens with only what is left, and
     says where the rest was billed.
   · Saving the same lines again is refused with the reason on screen.
   · A line not on the order that takes it past its value asks first; Cancel
     keeps you on the form, OK bills it.
   · A fully invoiced order shows "fully invoiced" with its invoices, and no
     form to bill it again.
   · An invoice whose order is billed more than ordered says so on the page.
   Its own throwaway company (obui-*@example.test), removed at the end.
     API_BASE=http://localhost:5097 UI_BASE=http://localhost:5176 node scripts/test-order-billing-ui.cjs
   ══════════════════════════════════════════════════════════════════════ */
const puppeteer = require('puppeteer');
const path = require('path');
require(path.join(__dirname, '../../backend/node_modules/dotenv')).config({ path: path.join(__dirname, '../../backend/.env') });
const { Client } = require(path.join(__dirname, '../../backend/node_modules/pg'));
const { purge } = require(path.join(__dirname, '../../backend/scripts/lib/testAccounts'));

const API = process.env.API_BASE || 'http://localhost:5099';
const UI = process.env.UI_BASE || 'http://localhost:5173';
if ([API, UI].some(u => /^https:|onrender\.com|vercel\.app|maksops\.co\.in/.test(u))) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}
const stamp = Date.now().toString(36);
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };
const call = async (token, method, url, body) => {
  const r = await fetch(`${API}${url}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

(async () => {
  const ids = [];
  let browser;
  try {
    const reg = await (await fetch(`${API}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Billing UI', email: `obui-${stamp}@example.test`, password: 'testpassword123' }) })).json();
    ids.push(reg.user.id);
    const T = reg.token;
    await call(T, 'PUT', '/company-profile', { name: `Billing UI Works ${stamp}`, gstin: '36ABCDE1234F1Z5', stateCode: '36' });
    const cust = (await call(T, 'POST', '/customers', { name: `Krishna Fabs ${stamp}`, state: 'Telangana' })).body;
    const order = (await call(T, 'POST', '/customer-orders', { customerId: cust.id, items: [
      { description: `Bracket ${stamp}`, quantity: 100, unit: 'nos', rate: 500 },
      { description: `Gate ${stamp}`, quantity: 10, unit: 'nos', rate: 2000 },
    ] })).body;
    const pf = (await call(T, 'GET', `/sales-invoices/prefill/${order.id}`)).body;
    const first = (await call(T, 'POST', '/sales-invoices', { customerId: cust.id, customerOrderId: order.id, gstRate: 18,
      items: pf.items.map(i => (/Bracket/.test(i.description) ? { ...i, quantity: 60 } : i)) })).body;

    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    let dialogs = [];
    let answer = false;
    page.on('dialog', d => { dialogs.push(d.message()); (answer ? d.accept() : d.dismiss()).catch(() => {}); });
    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto(`${UI}/login`);
    await page.evaluate((t, u) => { localStorage.setItem('nexus_token', t); localStorage.setItem('nexus_user', JSON.stringify(u)); }, T, reg.user);
    const waitFor = (fn, ms = 12000, ...a) => page.waitForFunction(fn, { timeout: ms }, ...a).then(() => true).catch(() => false);
    const waitText = (re, ms = 12000) => waitFor((src) => new RegExp(src).test(document.body.innerText), ms, re.source);
    const settle = (ms = 700) => new Promise(r => setTimeout(r, ms));
    const save = () => page.evaluate(() => [...document.querySelectorAll('button.btn-primary')].find(b => /Create invoice|Save/.test(b.textContent))?.click());

    console.log('\n  ── a part-billed order');
    await page.goto(`${UI}/customer-orders/${order.id}/invoice`, { waitUntil: 'networkidle2' });
    ok(await waitText(new RegExp(`already billed on ${first.invoiceNumber}`)), `it says part of the order is already billed on ${first.invoiceNumber}`);
    const lines = await page.evaluate(() => [1, 2].map(n => ({
      d: document.querySelector(`input[aria-label="Line ${n} description"]`)?.value,
      q: document.querySelector(`input[aria-label="Line ${n} quantity"]`)?.value,
    })).filter(l => l.d != null));
    ok(lines.length === 1 && /Bracket/.test(lines[0].d) && Number(lines[0].q) === 40, `and opens with only what is left: ${lines.map(l => `${l.q} × ${l.d}`).join(', ')}`);

    console.log('\n  ── billing the same again');
    await page.click('input[aria-label="Line 1 quantity"]', { clickCount: 3 });
    await page.type('input[aria-label="Line 1 quantity"]', '100');
    await save();
    ok(await waitText(/already invoiced 60 on/), 'raising it to 100 is refused, and the reason is on screen');
    ok(/\/invoice$/.test(page.url()), 'and you stay on the form');

    console.log('\n  ── a line not on the order');
    await page.click('input[aria-label="Line 1 quantity"]', { clickCount: 3 });
    await page.type('input[aria-label="Line 1 quantity"]', '40');
    await page.evaluate(() => [...document.querySelectorAll('button')].find(b => /Add line/.test(b.textContent))?.click());
    await page.type('input[aria-label="Line 2 description"]', 'Freight to site');
    await page.type('input[aria-label="Line 2 quantity"]', '1');
    await page.type('input[aria-label="Line 2 rate"]', '1500');
    answer = false; dialogs = [];
    await save(); await settle(1500);
    ok(dialogs.length === 1 && /Bill it anyway\?/.test(dialogs[0]) && /not on the order/.test(dialogs[0]), `it asks first: “${(dialogs[0] || '').slice(0, 110)}…”`);
    ok(/\/invoice$/.test(page.url()), 'Cancel keeps you on the form');
    answer = true; dialogs = [];
    await save();
    ok(await waitFor(() => /\/sales-invoices\/\d+$/.test(location.pathname)), 'OK bills it and opens the invoice');

    console.log('\n  ── a fully invoiced order');
    await page.goto(`${UI}/customer-orders/${order.id}/invoice`, { waitUntil: 'networkidle2' });
    ok(await waitFor(() => !!document.querySelector('[data-fully-invoiced]')), 'it shows “fully invoiced”');
    const full = await page.evaluate(() => ({
      text: document.querySelector('[data-fully-invoiced]')?.innerText || '',
      form: !!document.querySelector('input[aria-label="Line 1 description"]'),
    }));
    ok(new RegExp(`Open ${first.invoiceNumber}`).test(full.text) && (full.text.match(/Open /g) || []).length === 2 && !full.form,
      'with a button for each of its two invoices, and no form to bill it again');

    console.log('\n  ── an invoice whose order is billed twice');
    /* as before the check: a line on the first invoice raised straight in the database */
    const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    await c.connect();
    await c.query("UPDATE sales_invoice_items SET quantity = quantity + 100 WHERE sales_invoice_id = $1 AND description LIKE 'Bracket%'", [first.id]);
    await c.end();
    await page.goto(`${UI}/sales-invoices/${first.id}`, { waitUntil: 'networkidle2' });
    ok(await waitFor(() => /is invoiced more than it was ordered/.test(document.querySelector('[data-over-billed]')?.innerText || '')),
      'the invoice page says the order is invoiced more than it was ordered, and on which invoices');
    await page.setViewport({ width: 360, height: 780 }); await settle();
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'and the warning fits at 360px');
    ok(errs.length === 0, `no page errors${errs.length ? `: ${errs[0]}` : ''}`);
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
