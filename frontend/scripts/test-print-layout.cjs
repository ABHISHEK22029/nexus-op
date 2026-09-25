#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   Does a document actually print correctly?

   "It builds" proves nothing about paper. The complaint was that the
   export covered the whole page and the next page broke apart, so the
   things worth checking are the things that were wrong:

     · the app chrome (nav rail, module panel, toolbar) is not on the sheet
     · the document fills the sheet instead of sitting in an 860px column
     · nothing overflows the page width
     · a long document runs to several pages
     · the item table's header repeats on every one of them
     · no table row is cut in half by a page break

   It builds a 40-line quotation on purpose: with four lines everything
   fits on one page and every pagination bug hides.

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

/* A4 at 96dpi, less the 12mm/14mm margins in print.css. */
const MM = 96 / 25.4;
const PAGE_H = (297 - 12 - 14) * MM;
const PAGE_W = (210 - 10 - 10) * MM;

(async () => {
  console.log('');
  /* Anything an earlier failed run of this test left on the database.
     Cleanup at the bottom of a script never runs when an assertion
     fails, so the next run clears it instead. */
  await sweepStale('print-');

  const reg = await (await fetch(`${API}/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'PrintCo', email: `print-${stamp}@example.test`, password: 'testpassword123' }),
  })).json();
  const auth = { Authorization: `Bearer ${reg.token}`, 'Content-Type': 'application/json' };
  await fetch(`${API}/company-profile`, {
    method: 'PUT', headers: auth,
    body: JSON.stringify({
      name: `Print Test Fabricators ${stamp}`, address: 'Bowrampet, Hyderabad, Telangana 500043',
      gstin: '36AAMCK2569F1Z9', stateCode: '36', phone: '+91 90304 98359',
      bank_name: 'HDFC Bank', bank_account_no: '50200114304016', bank_ifsc: 'HDFC0005038',
      bank_account_name: 'Print Test Fabricators', bank_branch: 'Alwal',
    }),
  });
  const cust = await (await fetch(`${API}/customers`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({ name: `Buyer ${stamp}`, state: 'Telangana', billing_address: 'Plot 12, Industrial Estate, Hyderabad' }),
  })).json();

  /* Forty lines — enough to run past one page. */
  const items = Array.from({ length: 40 }, (_, i) => ({
    description: `V-Type Cross Arm, galvanised, 75 x 40 x 6 mm — batch line ${i + 1}`,
    hsn: '7308', uom: 'Nos', quantity: 10 + i, rate: 833 + i,
  }));
  const quote = await (await fetch(`${API}/sales-quotations`, {
    method: 'POST', headers: auth, body: JSON.stringify({ customerId: cust.id, items }),
  })).json();

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(`${UI}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(t => localStorage.setItem('nexus_token', t), reg.token);
  await page.goto(`${UI}/sales-quotations/${quote.id}`, { waitUntil: 'networkidle2' });
  await sleep(2200);
  ok(await page.evaluate(() => document.querySelectorAll('table tbody tr').length) >= 40,
    'a 40-line quotation is on screen');

  console.log('\n  ── under print rules');
  await page.emulateMediaType('print');
  await sleep(400);

  const m = await page.evaluate(() => {
    const vis = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      const cs = getComputedStyle(el);
      return cs.display !== 'none' && cs.visibility !== 'hidden';
    };
    const sheet = document.querySelector('.app-page > div');
    const thead = document.querySelector('table thead');
    return {
      rail: vis('.nav-rail'), panel: vis('.nav-panel'),
      buttons: [...document.querySelectorAll('button')].filter(b => getComputedStyle(b).display !== 'none').length,
      sheetMaxWidth: sheet ? getComputedStyle(sheet).maxWidth : null,
      sheetWidth: sheet ? Math.round(sheet.getBoundingClientRect().width) : 0,
      theadDisplay: thead ? getComputedStyle(thead).display : null,
      docWidth: Math.round(document.documentElement.scrollWidth),
    };
  });
  ok(!m.rail && !m.panel, 'the nav rail and module panel are not printed');
  ok(m.buttons === 0, `no buttons on the sheet (${m.buttons} visible)`);
  ok(m.sheetMaxWidth === 'none', `the document fills the sheet, not an 860px column (max-width: ${m.sheetMaxWidth})`);
  ok(m.theadDisplay === 'table-header-group',
    `the item table header is set to repeat on every page (${m.theadDisplay})`);

  console.log('\n  ── the PDF itself');
  const out = path.join(os.tmpdir(), `print-${stamp}.pdf`);
  await page.pdf({ path: out, format: 'A4', printBackground: true,
    margin: { top: '12mm', bottom: '14mm', left: '10mm', right: '10mm' } });
  const bytes = fs.readFileSync(out);
  /* Page objects in the PDF — crude, but it is the real file, not a guess. */
  const pages = (bytes.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  ok(bytes.length > 2000, `a PDF was produced (${(bytes.length / 1024).toFixed(0)} KB)`);
  ok(pages > 1, `it runs to ${pages} pages, so pagination is actually exercised`);
  /* html2canvas produced ~1MB of bitmap for a page like this. Real text is
     an order of magnitude smaller, and stays sharp. */
  ok(bytes.length < 400 * 1024, `and it is text, not a bitmap (${(bytes.length / 1024).toFixed(0)} KB)`);

  console.log('\n  ── page breaks');
  /* A DOM cannot be asked where the page breaks are: the document is one
     continuous box and only the print engine paginates it. So check the
     property that engine obeys — break-inside on the rows and on the blocks
     that must arrive whole. Measuring row coordinates against a page height
     (an earlier version of this test) measures the screen layout and proves
     nothing about paper. */
  const breaks = await page.evaluate(() => {
    const val = (el) => {
      const cs = getComputedStyle(el);
      return cs.breakInside || cs.pageBreakInside;
    };
    const rows = [...document.querySelectorAll('table tbody tr')];
    const blocks = [...document.querySelectorAll('.inv-totals, .inv-bank, .inv-sig, .inv-footer, .doc-keep')];
    return {
      rows: rows.length,
      rowsLoose: rows.filter(r => val(r) !== 'avoid').length,
      blocks: blocks.length,
      blocksLoose: blocks.filter(b => val(b) !== 'avoid').length,
      theadRepeats: getComputedStyle(document.querySelector('table thead')).display === 'table-header-group',
    };
  });
  ok(breaks.rowsLoose === 0,
    `every one of the ${breaks.rows} table rows refuses to be split across pages`);
  ok(breaks.blocksLoose === 0,
    `and so do the ${breaks.blocks} totals/bank/signature blocks`);

  /* Overflow has to be measured at the width of the paper, not the width of
     the monitor the test happens to run on. */
  await page.setViewport({ width: Math.round(PAGE_W), height: Math.round(PAGE_H) });
  await sleep(400);
  const fit = await page.evaluate(() => ({
    scroll: Math.round(document.documentElement.scrollWidth),
    client: Math.round(document.documentElement.clientWidth),
  }));
  ok(fit.scroll <= fit.client + 2,
    `nothing overflows the printable width (content ${fit.scroll}px in ${fit.client}px)`);

  ok(errs.length === 0, `no JavaScript errors${errs.length ? ': ' + errs[0].slice(0, 80) : ''}`);
  await browser.close();
  try { fs.unlinkSync(out); } catch { /* ignore */ }

  /* ── leave the database as it was found ── */
  const base = path.join(__dirname, '..', '..', 'backend');
  require(path.join(base, 'node_modules', 'dotenv')).config({ path: path.join(base, '.env') });
  const { Client } = require(path.join(base, 'node_modules', 'pg'));
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  await c.query('DELETE FROM sales_quotation_items WHERE sales_quotation_id IN (SELECT id FROM sales_quotations WHERE owner_id = $1)', [reg.user.id]).catch(() => {});
  for (const t of ['sales_quotations', 'customers', 'attachments', 'company_profile', 'document_sequences']) {
    await c.query(`DELETE FROM ${t} WHERE owner_id = $1`, [reg.user.id]).catch(() => {});
  }
  await c.query('DELETE FROM users WHERE id = $1', [reg.user.id]).catch(() => {});
  await c.end();

  console.log(`\n   ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('threw:', e.message); process.exit(1); });
