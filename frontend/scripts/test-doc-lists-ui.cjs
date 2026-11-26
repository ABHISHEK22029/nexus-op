#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   Opening a document from its list.

   Found on 26 Nov: clicking a delivery challan in its list did nothing
   unless the click landed on the challan number itself or the small eye
   icon. The invoice list opened on a click anywhere in the row; challans,
   quotations and credit/debit notes did not. Now every one does, and a
   click on the status picker or a row's buttons still does only that.

   Also: on the challan, the "Order … · Invoiced on …" line sat on the
   letterhead's rule (a negative margin), reading as struck through. It is
   for the person on screen, so it now sits above the sheet, off the paper.

   Builds its own throwaway company (dlist-*@example.test) and removes it.
   Needs the backend (SCHEDULER=off) and vite. Refuses a deployed host.
   ══════════════════════════════════════════════════════════════════════ */
const puppeteer = require('puppeteer');
const path = require('path');
const B = path.join(__dirname, '../../backend');
require(path.join(B, 'node_modules/dotenv')).config({ path: path.join(B, '.env') });
const { Client } = require(path.join(B, 'node_modules/pg'));
const { purgeOrg } = require(path.join(B, 'scripts/lib/purgeOrg'));

const API = process.env.API_BASE || 'http://localhost:5099';
const UI = process.env.UI_BASE || 'http://localhost:5173';
if ([API, UI].some(u => /^https:|onrender\.com|vercel\.app|maksops\.co\.in/.test(u))) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}
const stamp = Date.now().toString(36);
const today = new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };
const section = (t) => console.log(`\n  ── ${t}`);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const db = () => new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function cleanup() {
  const c = db(); await c.connect();
  try {
    const { rows } = await c.query(`SELECT id FROM users WHERE email LIKE 'dlist-%@example.test'`);
    const ids = rows.map(r => r.id); if (!ids.length) return 0;
    for (let i = 0; i < 5; i++) { const r = await purgeOrg(c, ids); if (!r.deleted) break; }
    await c.query('DELETE FROM document_sequences WHERE owner_id = ANY($1)', [ids]).catch(() => {});
    await c.query('DELETE FROM notifications WHERE user_id = ANY($1)', [ids]).catch(() => {});
    return (await c.query(`DELETE FROM users WHERE id = ANY($1) AND email LIKE '%@example.test'`, [ids])).rowCount;
  } finally { await c.end(); }
}

(async () => {
  await cleanup();
  const reg = await (await fetch(`${API}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Lists', email: `dlist-${stamp}@example.test`, password: 'testpassword123' }) })).json();
  const H = { Authorization: `Bearer ${reg.token}`, 'Content-Type': 'application/json' };
  const api = async (m, u, b) => { const r = await fetch(`${API}${u}`, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, ...(await r.json().catch(() => ({}))) }; };
  let browser;
  try {
    await api('PUT', '/company-profile', { name: 'List Fab Works', gstin: '36ABCDE1234F1Z9', stateCode: '36', address: 'Bowrampet, Hyderabad', setup_completed_at: new Date().toISOString() });
    const cust = await api('POST', '/customers', { name: `Row Click Infra ${stamp}`, gstin: '36AAACS1234C1Z5', state: 'Telangana', shipping_state: 'Telangana', billing_address: 'Kukatpally, Hyderabad' });
    const lines = [{ description: 'MS bracket', hsn: '7308', quantity: 40, uom: 'nos', rate: 450 }];
    const inv = await api('POST', '/sales-invoices', { customerId: cust.id, gstRate: 18, items: lines });
    const qt = await api('POST', '/sales-quotations', { customerId: cust.id, items: lines });
    const ord = await api('POST', '/customer-orders', { customerId: cust.id, items: [{ ...lines[0], targetPrice: 500 }] });
    const pf = await api('GET', `/delivery-challans/prefill/${ord.id}`);
    const dc = await api('POST', '/delivery-challans', { customerId: cust.id, customerOrderId: ord.id, challanDate: today, items: pf.items, vehicleNo: 'TS09AB1234' });
    const note = await api('POST', '/credit-debit-notes', { noteType: 'credit', partyType: 'customer', partyId: cust.id, gstRate: 18, reason: 'Short supply', items: [{ description: 'MS bracket', quantity: 2, rate: 450 }] });
    ok([inv, qt, ord, dc, note].every(x => x.id), `an invoice, quotation, order, challan and credit note (${[inv, qt, ord, dc, note].map(x => x.status).join(' ')})`);

    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(`${UI}/login`);
    await page.evaluate((t, u) => { localStorage.setItem('nexus_token', t); localStorage.setItem('nexus_user', JSON.stringify(u)); localStorage.setItem('tutorial_seen', '1'); localStorage.setItem('nexus-theme', 'light'); localStorage.setItem('maks_app_dialogs', '1'); }, reg.token, reg.user);

    /* Click a cell that is not the number and not a button: the customer. */
    const LISTS = [
      { name: 'Invoices', list: '/sales-invoices', doc: `/sales-invoices/${inv.id}` },
      { name: 'Quotations', list: '/sales-quotations', doc: `/sales-quotations/${qt.id}` },
      { name: 'Delivery challans', list: '/delivery-challans', doc: `/delivery-challans/${dc.id}` },
      { name: 'Credit & debit notes', list: '/credit-debit-notes', doc: `/credit-debit-notes/${note.id}` },
    ];
    for (const L of LISTS) {
      section(L.name);
      await page.goto(`${UI}${L.list}`, { waitUntil: 'networkidle2' });
      const cell = await page.waitForFunction((name) => {
        const td = [...document.querySelectorAll('tbody td')].find(t => t.textContent.trim().startsWith(name));
        return td || null;
      }, { timeout: 15000 }, `Row Click Infra ${stamp}`).catch(() => null);
      ok(!!cell, 'the document is listed');
      if (!cell) continue;
      const pointer = await page.evaluate(el => getComputedStyle(el.closest('tr')).cursor, cell);
      ok(pointer === 'pointer', `the row says it can be clicked (cursor: ${pointer})`);
      await cell.asElement().click();
      const went = await page.waitForFunction((p) => location.pathname === p, { timeout: 8000 }, L.doc).then(() => true).catch(() => false);
      ok(went, `clicking the customer's name opens it (${await page.evaluate(() => location.pathname)})`);
    }

    section('A click on a row\'s own controls does only that');
    await page.goto(`${UI}/delivery-challans`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('[data-challan-row] select', { timeout: 15000 });
    await page.click('[data-challan-row] select');
    await sleep(500);
    ok(await page.evaluate(() => location.pathname === '/delivery-challans'), 'opening the status picker stays on the list');
    await page.keyboard.press('Escape');
    await page.goto(`${UI}/sales-quotations`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('[data-quote-row] select', { timeout: 15000 });
    await page.click('[data-quote-row] select');
    await sleep(500);
    ok(await page.evaluate(() => location.pathname === '/sales-quotations'), 'and so does the quotation\'s');
    await page.keyboard.press('Escape');

    section('The challan: its order and invoice line, off the paper');
    await page.goto(`${UI}/delivery-challans/${dc.id}`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('[data-challan-links]', { timeout: 15000 });
    const pos = await page.evaluate(() => {
      const el = document.querySelector('[data-challan-links]');
      const links = el.getBoundingClientRect();
      const sheet = document.querySelector('.doc-sheet').getBoundingClientRect();
      return { outside: !el.closest('.doc-sheet') && links.bottom <= sheet.top, text: el.textContent };
    });
    ok(pos.outside, 'it sits above the sheet, clear of the letterhead and off the printed copy');
    ok(/Order\s*CO-/.test(pos.text), `and names the order ("${pos.text.trim()}")`);

    ok(errs.length === 0, `no page errors${errs.length ? `: ${errs.slice(0, 2).join(' | ')}` : ''}`);
  } catch (e) {
    fail++; console.log(`   ❌ threw: ${e.message}`);
  } finally {
    if (browser) await browser.close();
    console.log(`\n   removed ${await cleanup()} test account(s)`);
    console.log(`\n   ${pass} passed, ${fail} failed\n`);
    process.exit(fail ? 1 : 0);
  }
})();
