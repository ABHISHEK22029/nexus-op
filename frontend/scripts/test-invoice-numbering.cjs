#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   Can a business number its own invoices — and edit an invoice properly?

   The complaint: "the serial number should be customizable to any number
   as this is important … I was trying to edit the invoice number but it
   was not working." What was actually wrong, each now a check:

     · the series could not be set — every invoice was INV-0001 onwards,
       so a business on invoice 147 in Tally could not carry on from 148
     · renaming an invoice by hand left the counter behind — the next one
       still came out as INV-0002
     · the builder never sent the due date, place of supply, bill-to or
       ship-to, and dropped every line's HSN; the order's discounts and GST
       rate were lost on the way to the invoice
     · an issued invoice showed a padlock with no way forward

   Runs against a local backend with a throwaway account it deletes again.
   Refuses to run against a deployed host.
   ══════════════════════════════════════════════════════════════════════ */
const puppeteer = require('puppeteer');
const path = require('path');

const UI = process.env.UI_BASE || 'http://localhost:5173';
const API = process.env.API_BASE || 'http://localhost:5099';
if (/^https:|onrender\.com|vercel\.app|maksops\.co\.in/.test(UI + API)) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}
const B = path.join(__dirname, '..', '..', 'backend');
require(path.join(B, 'node_modules', 'dotenv')).config({ path: path.join(B, '.env') });
const { Client } = require(path.join(B, 'node_modules', 'pg'));
const { purgeOrg } = require(path.join(B, 'scripts', 'lib', 'purgeOrg'));

const stamp = Date.now().toString(36);
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* Remove every invnum- account: this run's, and any a failed run left. */
async function cleanup() {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    const { rows } = await c.query(`SELECT id FROM users WHERE email LIKE 'invnum-%@example.test'`);
    const ids = rows.map(r => r.id);
    if (!ids.length) return 0;
    const r = await purgeOrg(c, ids);
    await c.query(`DELETE FROM document_sequences WHERE owner_id = ANY($1)`, [ids]).catch(() => {});
    const d = await c.query(`DELETE FROM users WHERE id = ANY($1) AND email LIKE '%@example.test'`, [ids]);
    if (r.blocked.length) console.log('   (cleanup blocked on', r.blocked.join(', '), ')');
    return d.rowCount;
  } finally { await c.end(); }
}

(async () => {
  await cleanup();
  const reg = await (await fetch(`${API}/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'NumCo', email: `invnum-${stamp}@example.test`, password: 'testpassword123' }),
  })).json();
  const H = { Authorization: `Bearer ${reg.token}`, 'Content-Type': 'application/json' };
  const api = async (method, url, body) => {
    const r = await fetch(`${API}${url}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  let browser;
  try {
    await api('PUT', '/company-profile', {
      name: `Numbering Test Works ${stamp}`, address: 'Bowrampet, Hyderabad', gstin: '36AAMCK2569F1Z9', stateCode: '36',
      bank_name: 'HDFC Bank', bank_account_no: '5020011', bank_ifsc: 'HDFC0005038', invoice_terms: 'Payment within 30 days.',
    });

    console.log('\n  ── Settings → Document numbering');
    const list = await api('GET', '/document-series');
    const inv0 = (list.body || []).find(s => s.docType === 'sales_invoice');
    ok(list.status === 200 && list.body.length === 6, `six series are listed (${list.body.length})`);
    ok(inv0?.nextNumber === 'INV-0001', `a new business starts at INV-0001, as before (${inv0?.nextNumber})`);

    const fy = (() => { const d = new Date(); const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; return `${y}-${String((y + 1) % 100).padStart(2, '0')}`; })();
    const setS = await api('PUT', '/document-series/sales_invoice', { prefix: 'KBS/{FY}/', pad: 3, nextSeq: '148' });
    ok(setS.status === 200 && setS.body.nextNumber === `KBS/${fy}/148`,
      `carry on from 148 in your own format → ${setS.body.nextNumber}`);
    const bad1 = await api('PUT', '/document-series/sales_invoice', { prefix: 'KBS_INV#', pad: 3 });
    ok(bad1.status === 400, `a prefix GST does not allow is refused ("${bad1.body.error}")`);
    const bad2 = await api('PUT', '/document-series/sales_invoice', { prefix: 'KIRASHIBUILD/{FY}/', pad: 4 });
    ok(bad2.status === 400 && /16/.test(bad2.body.error || ''), `so is one that makes numbers over 16 characters`);
    const bad3 = await api('PUT', '/document-series/sales_invoice', { nextSeq: 'abc' });
    ok(bad3.status === 400, 'and a next number that is not a number');

    console.log('\n  ── from an order: the prefill carries everything');
    const cust = (await api('POST', '/customers', {
      name: `Deccan Projects ${stamp}`, state: 'Maharashtra', billing_address: 'MIDC Bhosari, Pune', gstin: '27AABCD1234E1Z5', payment_terms_days: 45,
    })).body;
    const order = (await api('POST', '/customer-orders', {
      customerId: cust.id, customerPoRef: 'DP/PO/7713', gstRate: 12, discount: 5, discountType: 'percent',
      items: [
        { description: 'SS304 Mounting Bracket', hsn: '7326', quantity: 120, unit: 'nos', rate: 2320, discount: 10, discountType: 'percent' },
        { description: 'Cross Arm, galvanised', hsn: '7308', quantity: 40, unit: 'nos', rate: 833 },
      ],
    })).body;
    const pf = (await api('GET', `/sales-invoices/prefill/${order.id}`)).body;
    ok(pf.items?.[0]?.hsn === '7326' && pf.items?.[1]?.hsn === '7308', 'every line keeps its HSN (it was blanked)');
    ok(Number(pf.gstRate) === 12, `the order's GST rate comes across — 12%, not a hardcoded 18 (${pf.gstRate})`);
    /* 120 × 2320 = 2,78,400 less 10% = 27,840 → 2,50,560; plus 33,320 = 2,83,880;
       5% of that = 14,194 → discount 27,840 + 14,194 = 42,034 */
    ok(Math.abs(Number(pf.discount) - 42034) < 0.01, `line and order discounts become the invoice discount — ₹42,034 (${pf.discount})`);
    ok(pf.nextNumber === `KBS/${fy}/148`, `and the number offered is the next in the series (${pf.nextNumber})`);
    ok(/DP\/PO\/7713/.test(pf.notes || ''), 'the customer\'s PO reference is carried into the notes');

    console.log('\n  ── the builder, in a browser');
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto(`${UI}/login`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(t => localStorage.setItem('nexus_token', t), reg.token);
    await page.goto(`${UI}/customer-orders/${order.id}/invoice`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('input[aria-label="Invoice number"]', { timeout: 15000 });
    const shown = await page.evaluate(() => ({
      number: document.querySelector('input[aria-label="Invoice number"]').value,
      due: document.querySelector('input[type="date"]:nth-of-type(1)') && [...document.querySelectorAll('input[type="date"]')].map(i => i.value),
      pos: document.querySelector('select[aria-label="Place of supply"]').value,
      text: document.body.innerText,
      hsn: document.querySelector('input[aria-label="Line 1 HSN"]').value,
    }));
    ok(shown.number === `KBS/${fy}/148`, `the number box is prefilled with ${shown.number}`);
    ok(shown.due?.[1] && shown.due[1] > shown.due[0], `the due date is filled from the customer's 45-day terms (${shown.due?.[1]})`);
    ok(shown.pos === '27' && /Inter-state · IGST/.test(shown.text), 'Maharashtra customer → place of supply 27, IGST, worked out from the states');
    ok(shown.hsn === '7326', 'HSN is on the line, editable');
    await page.evaluate(() => [...document.querySelectorAll('button')].find(b => /^Create invoice/.test(b.textContent)).click());
    await page.waitForFunction(() => /\/sales-invoices\/\d+$/.test(location.pathname), { timeout: 15000 });
    await sleep(1200);
    const doc1 = await page.evaluate(() => document.body.innerText);
    const inv1Id = Number((await page.url()).match(/(\d+)$/)[1]);
    ok(doc1.includes(`KBS/${fy}/148`), 'the invoice is raised as KBS/…/148');
    ok(/IGST @ 12%/.test(doc1), 'with IGST at the order\'s 12%');
    ok(/Order Ref:\s*CO-/.test(doc1) && /DP\/PO\/7713/.test(doc1), 'the face shows the order NUMBER and the customer\'s PO, not a database id');
    ok(/Due:\s*\d/.test(doc1), 'and a due date');

    console.log('\n  ── numbers: next, typed, duplicate, invalid');
    const next1 = (await api('POST', '/sales-invoices', { customerId: cust.id, items: [{ description: 'Service', quantity: 1, rate: 100 }] })).body;
    ok(next1.invoiceNumber === `KBS/${fy}/149`, `the next invoice follows on: ${next1.invoiceNumber}`);
    const typed = await api('POST', '/sales-invoices', { customerId: cust.id, invoiceNumber: `KBS/${fy}/200`, items: [{ description: 'Service', quantity: 1, rate: 100 }] });
    ok(typed.status === 200 && typed.body.invoiceNumber === `KBS/${fy}/200`, `any number can be typed: ${typed.body.invoiceNumber}`);
    const after = (await api('POST', '/sales-invoices', { customerId: cust.id, items: [{ description: 'Service', quantity: 1, rate: 100 }] })).body;
    ok(after.invoiceNumber === `KBS/${fy}/201`, `and the series carries on from it, not from where it was (${after.invoiceNumber})`);
    const dup = await api('POST', '/sales-invoices', { customerId: cust.id, invoiceNumber: `KBS/${fy}/200`, items: [{ description: 'x', quantity: 1, rate: 1 }] });
    ok(dup.status === 409, `a number already used is refused (${dup.body.error})`);
    const long = await api('POST', '/sales-invoices', { customerId: cust.id, invoiceNumber: 'KBS/2026-27/000149', items: [{ description: 'x', quantity: 1, rate: 1 }] });
    ok(long.status === 400 && /16/.test(long.body.error || ''), 'a number over 16 characters is refused (GST Rule 46)');
    const chars = await api('POST', '/sales-invoices', { customerId: cust.id, invoiceNumber: 'INV_12#', items: [{ description: 'x', quantity: 1, rate: 1 }] });
    ok(chars.status === 400, 'and so are characters GST does not allow');
    const settings = (await api('GET', '/document-series')).body.find(s => s.docType === 'sales_invoice');
    ok(settings.nextNumber === `KBS/${fy}/202`, `Settings shows the true next number (${settings.nextNumber})`);

    console.log('\n  ── editing a draft, in a browser');
    await page.goto(`${UI}/sales-invoices/${inv1Id}`, { waitUntil: 'networkidle2' });
    await sleep(800);
    ok(await page.evaluate(() => [...document.querySelectorAll('button')].some(b => /Edit invoice/.test(b.textContent))), 'a draft has an "Edit invoice" button');
    await page.evaluate(() => [...document.querySelectorAll('button')].find(b => /Edit invoice/.test(b.textContent)).click());
    await page.waitForSelector('input[aria-label="Invoice number"]', { timeout: 15000 });
    await sleep(500);
    await page.click('input[aria-label="Invoice number"]', { clickCount: 3 });
    await page.keyboard.type(`KBS/${fy}/300`);
    await page.select('select[aria-label="Place of supply"]', '36');
    await page.click('input[aria-label="Line 2 rate"]', { clickCount: 3 });
    await page.keyboard.type('900');
    await page.evaluate(() => [...document.querySelectorAll('button')].find(b => /Save changes/.test(b.textContent)).click());
    await page.waitForFunction(() => /\/sales-invoices\/\d+$/.test(location.pathname), { timeout: 15000 });
    await sleep(1200);
    const doc2 = await page.evaluate(() => document.body.innerText);
    ok(doc2.includes(`KBS/${fy}/300`), 'the number was changed from the edit screen');
    ok(/CGST/.test(doc2) && /SGST/.test(doc2) && !/IGST @/.test(doc2), 'moving the place of supply to Telangana switched IGST to CGST + SGST');
    ok(/900\.00/.test(doc2), 'and a line rate was changed');
    const nextAfterEdit = (await api('GET', '/sales-invoices/next-number')).body.number;
    ok(nextAfterEdit === `KBS/${fy}/301`, `renaming moved the series on too (${nextAfterEdit})`);

    console.log('\n  ── issued invoices');
    await api('PATCH', `/sales-invoices/${inv1Id}/status`, { status: 'Sent' });
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(800);
    const issued = await page.evaluate(() => ({
      pencil: !!document.querySelector('button[aria-label="Edit invoice number"]'),
      reopen: [...document.querySelectorAll('button')].some(b => /Reopen as draft/.test(b.textContent)),
    }));
    ok(!issued.pencil && issued.reopen, 'a sent invoice locks the number, and offers "Reopen as draft" instead of a dead end');
    const refuse = await api('PATCH', `/sales-invoices/${inv1Id}`, { invoice_number: `KBS/${fy}/999` });
    ok(refuse.status === 409, 'the server still refuses to renumber an issued invoice directly');
    page.on('dialog', d => d.accept());
    await page.evaluate(() => [...document.querySelectorAll('button')].find(b => /Reopen as draft/.test(b.textContent)).click());
    await page.waitForFunction(() => /\/edit$/.test(location.pathname), { timeout: 15000 });
    ok(true, 'reopening goes straight to the edit screen');
    await api('PATCH', `/sales-invoices/${inv1Id}/status`, { status: 'Sent' });
    await api('POST', `/sales-invoices/${inv1Id}/payment`, { amount: 1000, mode: 'Bank' });
    await page.goto(`${UI}/sales-invoices/${inv1Id}`, { waitUntil: 'networkidle2' });
    await sleep(800);
    ok(!(await page.evaluate(() => [...document.querySelectorAll('button')].some(b => /Reopen as draft/.test(b.textContent)))),
      'once money is received it cannot be reopened — that is a credit note');
    const ewb = await api('PATCH', `/sales-invoices/${inv1Id}`, { eway_bill_no: '341028761952', due_date: '2026-12-31' });
    ok(ewb.status === 200, 'the e-way bill and due date can still be added after issue');

    console.log('\n  ── an invoice with no order');
    await page.goto(`${UI}/sales-invoices/new?customer=${cust.id}`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('input[aria-label="Line 1 description"]', { timeout: 15000 });
    await page.type('input[aria-label="Line 1 description"]', 'Laser cutting — job work');
    await page.type('input[aria-label="Line 1 HSN"]', '998898');
    await page.type('input[aria-label="Line 1 quantity"]', '1');
    await page.type('input[aria-label="Line 1 rate"]', '15000');
    await page.evaluate(() => [...document.querySelectorAll('button')].find(b => /^Create invoice/.test(b.textContent)).click());
    await page.waitForFunction(() => /\/sales-invoices\/\d+$/.test(location.pathname), { timeout: 15000 });
    await sleep(1000);
    ok(/Laser cutting/.test(await page.evaluate(() => document.body.innerText)), 'a one-off job is invoiced without inventing an order');

    console.log('\n  ── the other series follow the same rules');
    await api('PUT', '/document-series/quotation', { prefix: 'Q/{FY}/', pad: 3, nextSeq: '41' });
    const qt = (await api('POST', '/sales-quotations', { customerId: cust.id, items: [{ description: 'Bracket', quantity: 1, rate: 10 }] })).body;
    const qtRow = (await api('GET', `/sales-quotations/${qt.id}`)).body;
    ok(qtRow.quote_number === `Q/${fy}/041`, `quotations use their own series (${qtRow.quote_number})`);
    const dcDefault = (await api('GET', '/document-series')).body.find(s => s.docType === 'delivery_challan');
    ok(dcDefault.nextNumber === 'DC-0001', `and an untouched series is exactly what it always was (${dcDefault.nextNumber})`);

    ok(errs.length === 0, `no JavaScript errors${errs.length ? ': ' + errs[0].slice(0, 100) : ''}`);
  } catch (e) {
    fail++; console.log('   ❌ threw:', e.message);
  } finally {
    if (browser) await browser.close();
    const n = await cleanup();
    ok(n >= 1, `test account removed (${n})`);
  }
  console.log(`\n   ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
