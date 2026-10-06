#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   Does every document actually print correctly?

   "It builds" proves nothing about paper. Two rounds of complaints, both
   now checks, on EVERY document type — quotation, tax invoice, delivery
   challan, credit note, purchase order and purchase bill — not just one:

   Round one (layout):
     · the app chrome (nav rail, module panel, toolbar) is not on the sheet
     · the document fills the sheet instead of sitting in an 860px column
     · nothing overflows the printable width
     · the item table's header repeats on every page
     · no table row is cut in half by a page break

   Round two (size — "it does not print in the correct manner"):
     · documents printed at SCREEN size: 11–12pt item text in 20px of
       padding, so a 40-line quotation took five pages, eight lines a page.
       Item text must now be at most 9pt and the 40 lines fit in three.
     · the light theme's orange accent bar is position:fixed, so it printed
       across the top of every sheet
     · a red "required" printed on the challan sent to the customer
     · the purchase order printed an empty item table and a 0.00 total for
       any PO whose line lived on the order itself

   Builds long documents on purpose: with four lines everything fits on one
   page and every pagination bug hides.

   Refuses to run against a deployed host, and removes what it creates.
   ══════════════════════════════════════════════════════════════════════ */
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const os = require('os');

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

/* A4 at 96dpi, less the 10mm side margins in print.css. */
const MM = 96 / 25.4;
const PAGE_W = Math.round((210 - 10 - 10) * MM);

/* Cleanup cannot live only at the happy end: a failed assertion exits
   before it. So every run first clears what an earlier one left. */
async function cleanup() {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    const { rows } = await c.query(`SELECT id FROM users WHERE email LIKE 'print-%@example.test'`);
    const ids = rows.map(r => r.id);
    if (!ids.length) return 0;
    await purgeOrg(c, ids);
    await c.query('DELETE FROM document_sequences WHERE owner_id = ANY($1)', [ids]).catch(() => {});
    return (await c.query(`DELETE FROM users WHERE id = ANY($1) AND email LIKE '%@example.test'`, [ids])).rowCount;
  } finally { await c.end(); }
}

(async () => {
  console.log('');
  await cleanup();
  const reg = await (await fetch(`${API}/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'PrintCo', email: `print-${stamp}@example.test`, password: 'testpassword123' }),
  })).json();
  const H = { Authorization: `Bearer ${reg.token}`, 'Content-Type': 'application/json' };
  const api = async (method, url, body) => (await fetch(`${API}${url}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined })).json();
  let browser;
  try {
    await api('PUT', '/company-profile', {
      name: `Print Test Fabricators ${stamp}`, address: 'Plot 14, Phase II, IDA Bowrampet, Hyderabad, Telangana 500043',
      gstin: '36AAMCK2569F1Z9', stateCode: '36', phone: '+91 90304 98359',
      bank_name: 'HDFC Bank', bank_account_no: '50200114304016', bank_ifsc: 'HDFC0005038',
      bank_account_name: 'Print Test Fabricators', bank_branch: 'Alwal', invoice_terms: 'Payment within 30 days.',
    });
    const cust = await api('POST', '/customers', {
      name: `Buyer ${stamp}`, state: 'Telangana', gstin: '36ABCDE1234F1Z5',
      billing_address: 'Plot 42, Phase III, IDA Jeedimetla, Quthbullapur Mandal, Hyderabad 500055',
    });
    const lines = (n) => Array.from({ length: n }, (_, i) => ({
      description: `V-Type Cross Arm, galvanised, 75 x 40 x 6 mm — batch line ${i + 1}`,
      hsn: '7308', uom: 'Nos', quantity: 10 + i, rate: 833 + i,
    }));
    const quote = await api('POST', '/sales-quotations', { customerId: cust.id, items: lines(40) });
    const inv = await api('POST', '/sales-invoices', { customerId: cust.id, items: lines(25) });
    const dc = await api('POST', '/delivery-challans', { customerId: cust.id, vehicleNo: 'TS 09 UB 4471', items: lines(18) });
    const cn = await api('POST', '/credit-debit-notes', { noteType: 'credit', partyType: 'customer', partyId: cust.id, reason: 'Rate difference', gstRate: 18, items: lines(4) });
    const proj = await api('POST', '/projects', { name: `Print project ${stamp}`, clientName: 'HMRL', type: 'Infrastructure' });
    const vendor = await api('POST', '/vendors', { name: `Deccan Metals ${stamp}`, type: 'Supplier', gstin: '36AAACD9999K1Z2' });
    /* No separate lines: the item is on the PO itself, as for a PO raised
       from a shortfall or a customer order. */
    const po = await api('POST', '/po', { projectId: proj.id, vendorId: vendor.id, itemName: 'SS304 sheet, 2 mm', quantity: 180, unitPrice: 260 });
    const bill = await api('POST', '/grn-bills', { vendorId: vendor.id, projectId: proj.id, vendorBillRef: 'DMA/INV/2291', items: lines(8), gstRate: 18 });

    const DOCS = [
      ['quotation (40 lines)', `/sales-quotations/${quote.id}`, 3],
      ['tax invoice (25 lines)', `/sales-invoices/${inv.id}`, 2],
      ['delivery challan (18 lines)', `/delivery-challans/${dc.id}`, 2],
      ['credit note', `/credit-debit-notes/${cn.id}`, 1],
      ['purchase order', `/po/${po.id}`, 1],
      ['purchase bill', `/grn-bills/${bill.id}`, 1],
    ];

    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(`${UI}/login`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(t => localStorage.setItem('nexus_token', t), reg.token);

    for (const [label, url, maxPages] of DOCS) {
      console.log(`\n  ── ${label}`);
      await page.emulateMediaType('screen');
      await page.setViewport({ width: 1440, height: 1000 });
      await page.goto(`${UI}${url}`, { waitUntil: 'networkidle2' });
      await sleep(1500);
      const rows = await page.evaluate(() => document.querySelectorAll('table tbody tr').length);
      ok(rows > 0, `it is on screen (${rows} table rows)`);

      await page.emulateMediaType('print');
      /* Measured at the width of the paper, not of the monitor. */
      await page.setViewport({ width: PAGE_W, height: 1100 });
      await sleep(400);
      const m = await page.evaluate(() => {
        const vis = (el) => el && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
        /* the ITEM table — the one with a header row; the totals table's
           bold grand-total line is meant to be larger */
        const tds = [...document.querySelectorAll('table:has(thead) tbody td')];
        const px = (el) => parseFloat(getComputedStyle(el).fontSize);
        const thead = document.querySelector('table thead');
        const rowsAll = [...document.querySelectorAll('table tbody tr')];
        const before = getComputedStyle(document.body, '::before');
        return {
          chrome: vis(document.querySelector('.nav-rail')) || vis(document.querySelector('.nav-panel')),
          buttons: [...document.querySelectorAll('button')].filter(vis).length,
          scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth,
          maxTd: tds.length ? Math.max(...tds.map(px)) : 0,
          theadRepeats: !thead || getComputedStyle(thead).display === 'table-header-group',
          rowsLoose: rowsAll.filter(r => (getComputedStyle(r).breakInside || getComputedStyle(r).pageBreakInside) !== 'avoid').length,
          accentBar: before.content !== 'none' && before.display !== 'none',
          text: document.body.innerText,
        };
      });
      ok(!m.chrome && m.buttons === 0, `no app chrome or buttons on the sheet (${m.buttons} buttons)`);
      ok(m.scroll <= m.client + 2, `nothing overflows the printable width (${m.scroll}px in ${m.client}px)`);
      /* 12px = 9pt. Screen size was 14–16px. */
      ok(m.maxTd > 0 && m.maxTd <= 12.01, `item text is paper size — at most 9pt (${(m.maxTd * 0.75).toFixed(1)}pt)`);
      ok(m.theadRepeats && m.rowsLoose === 0, 'the item header repeats and no row splits across pages');
      ok(!m.accentBar, 'the orange accent bar is not printed');
      if (label.startsWith('delivery')) ok(!/\brequired\b/.test(m.text), 'no red "required" goes out on the customer\'s copy');
      if (label.startsWith('purchase order')) {
        ok(/SS304 sheet, 2 mm/.test(m.text) && /46,800\.00/.test(m.text), 'the PO prints its item and its real value, not an empty table and 0.00');
        ok(!/Not calculated/.test(m.text) && /Amount in Words: Rupees/.test(m.text), 'and its amount in words');
      }
      if (label.startsWith('tax invoice')) ok(/CGST @ 9%/.test(m.text) && /SGST @ 9%/.test(m.text), 'the tax RATE is printed, not just the amount (Rule 46)');

      await page.setViewport({ width: 1440, height: 1000 });
      const out = path.join(os.tmpdir(), `print-${stamp}.pdf`);
      /* preferCSSPageSize: the print dialog uses the page's own @page rule,
         so the test does too. */
      await page.pdf({ path: out, preferCSSPageSize: true, printBackground: true });
      const bytes = fs.readFileSync(out);
      const pages = (bytes.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
      ok(pages >= 1 && pages <= maxPages, `${pages} page${pages === 1 ? '' : 's'} (at most ${maxPages})`);
      ok(bytes.length < 400 * 1024, `real text, not a bitmap (${(bytes.length / 1024).toFixed(0)} KB)`);
      try { fs.unlinkSync(out); } catch { /* ignore */ }
    }
    ok(errs.length === 0, `no JavaScript errors${errs.length ? ': ' + errs[0].slice(0, 80) : ''}`);
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
