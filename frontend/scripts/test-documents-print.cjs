#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   Documents on paper: where the pages break, and what the invoice says
   is still owed.

   A tester's report of 8 Oct, made into checks:

   · "the last line item should be moved below": the totals, amount in
     words, bank details, terms and signature printed on a sheet of their
     own, and were themselves split between two sheets. Now, on EVERY page
     break of every long document, printed and downloaded:
       - the closing block is on one page, and that page also carries the
         last two item rows;
       - no row is split (its first and last words are on the same page);
       - every page with rows starts with the table header;
   · "we are not showing the actual payment which should be paid": a
     part-paid invoice shows Amount received and Balance due under the
     totals, on screen, in print and in the PDF; an unpaid one does not; the
     invoice list shows the same balance.
   · the quotation had no PDF: "Download PDF" saves a real A4 file named
     "Quotation QT-0001 - Customer.pdf"; the invoice's does the same.
   · amounts stay on one line, right-aligned, in figures of equal width,
     even at ₹14,25,41,68,500.00; long terms wrap inside their box; nothing
     overflows the paper (which is what makes Chrome shrink a whole page).
   · "Reverse Charge: Yes" follows the box in the invoice form, both ways.
   · the quotation prints its promised delivery when there is one.

   Builds documents of several lengths on purpose: with four lines
   everything fits on one page and every pagination bug hides.

     API_BASE=http://localhost:5096 UI_BASE=http://localhost:5176 node scripts/test-documents-print.cjs

   Refuses to run against a deployed host. Creates one throwaway
   docs-print-…@example.test account and purges it in a finally.
   ══════════════════════════════════════════════════════════════════════ */
const puppeteer = require('puppeteer');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const B = path.join(__dirname, '..', '..', 'backend');
require(path.join(B, 'node_modules', 'dotenv')).config({ path: path.join(B, '.env') });
const { purge, sweepStale } = require(path.join(B, 'scripts', 'lib', 'testAccounts'));

const API = process.env.API_BASE || 'http://localhost:5099';
const UI = process.env.UI_BASE || 'http://localhost:5173';
if ([API, UI].some(u => /^https:|onrender\.com|vercel\.app|maksops\.co\.in/.test(u))) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}
const stamp = Date.now().toString(36);
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-print-'));
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const flat = (s) => String(s).replace(/\s+/g, '').toLowerCase();
const inr = (n) => Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const A4 = { w: 595.28, h: 841.89 };
const PRINT_W = Math.round((210 - 20) * 96 / 25.4);   // the printable width, 10mm margins

/* Text of each PDF page, with positions, read by pdf.js (the backend has it). */
let pdfjs;
async function readPdf(file) {
  pdfjs = pdfjs || await import(pathToFileURL(path.join(B, 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.mjs')).href);
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)), disableFontFace: true }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const p = await doc.getPage(i);
    const tc = await p.getTextContent();
    const items = tc.items.filter(t => t.str && t.str.trim()).map(t => ({ s: flat(t.str), y: t.transform[5] }));
    pages.push({ size: p.view.slice(2), items, text: flat(items.map(t => t.s).join('')) });
  }
  return pages;
}

/* The rules, checked on one PDF. `rows` is the number of item lines;
   each line's description starts with Q07A and ends with Q07Z. */
function checkPages(label, pages, { rows, closing, minPages = 1 }) {
  const pad = (i) => String(i).padStart(2, '0');
  const pageOf = (needle) => pages.map((p, i) => (p.text.includes(flat(needle)) ? i : -1)).filter(i => i >= 0);
  ok(pages.length >= minPages, `${label}: ${pages.length} A4 page${pages.length > 1 ? 's' : ''}`);
  ok(pages.every(p => Math.abs(p.size[0] - A4.w) < 2 && Math.abs(p.size[1] - A4.h) < 2), `${label}: every page is A4`);

  const split = [];
  for (let i = 1; i <= rows; i++) {
    const a = pageOf(`Q${pad(i)}A`), z = pageOf(`Q${pad(i)}Z`);
    if (a.length !== 1 || z.length !== 1 || a[0] !== z[0]) split.push(i);
  }
  ok(split.length === 0, `${label}: no row is split across pages${split.length ? ` (rows ${split.join(', ')})` : ''}`);

  const where = closing.map(c => pageOf(c));
  const P = where[0][0];
  const whole = where.every(w => w.length === 1 && w[0] === P);
  ok(whole, `${label}: totals → signature on one page (${closing.map((c, i) => `${c}: p${where[i].map(x => x + 1).join('/') || '–'}`).join(', ')})`);
  const carried = [rows, rows - 1].filter(i => i >= 1).every(i => pageOf(`Q${pad(i)}Z`)[0] === P);
  ok(whole && carried, `${label}: the last ${Math.min(2, rows)} row(s) are on that page with it`);

  const headless = [];
  pages.forEach((p, i) => {
    const marks = p.items.filter(t => /^q\d\d[az]/.test(t.s) || /q\d\d[az]/.test(t.s));
    if (!marks.length) return;
    const head = p.items.find(t => t.s.includes('description'));
    if (!head || head.y <= Math.max(...marks.map(t => t.y))) headless.push(i + 1);
  });
  ok(headless.length === 0, `${label}: every page with rows starts with the table header${headless.length ? ` (not on p${headless.join(', p')})` : ''}`);
  return P;
}

(async () => {
  console.log('');
  await sweepStale('docs-print-', 30).catch(() => 0);
  const reg = await (await fetch(`${API}/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Docs Print', email: `docs-print-${stamp}@example.test`, password: 'testpassword123' }),
  })).json();
  const ids = [reg.user?.id].filter(Boolean);
  const H = { Authorization: `Bearer ${reg.token}`, 'Content-Type': 'application/json' };
  const api = async (method, url, body) => {
    const r = await fetch(`${API}${url}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${method} ${url} → ${r.status} ${j.error || ''}`);
    return j;
  };
  let browser;
  try {
    /* A company with a name skips the first-run page. */
    await api('PUT', '/company-profile', {
      name: `Deccan Steel Fabricators ${stamp}`, address: 'Plot 14, Phase II, IDA Bowrampet, Medchal-Malkajigiri, Telangana 500043',
      gstin: '36AAMCK2569F1Z9', stateCode: '36', phone: '+91 90304 98359',
      bank_name: 'HDFC Bank', bank_account_no: '50200114304016', bank_ifsc: 'HDFC0005038',
      bank_account_name: 'Deccan Steel Fabricators', bank_branch: 'Alwal', invoice_terms: 'Payment within 30 days.',
    });
    const cust = await api('POST', '/customers', {
      name: `Sahasra Infra ${stamp}`, state: 'Telangana', gstin: '36ABCDE1234F1Z5',
      billing_address: '6th Floor, Flat 602, Plot 292, Shivam Tower, Toklo Road, Kukatpally, Hyderabad 500072',
    });
    /* Long terms with a 140-character word in them: it used to run out of
       its box and over the bank details. */
    const terms = ['*'.repeat(140) + 'Payment: 50% advance with the order, balance within 15 days of invoice.',
      'Interest at 18% a year on payments made after the due date.',
      'Prices ex-works Bowrampet; freight, unloading and insurance at actuals.',
      'Delivery within 4 weeks of a confirmed order and approved drawings.',
      'Galvanising to IS 4759, with a thickness certificate for each lot.',
      'Any dispute is subject to Hyderabad jurisdiction only.'].join('\n');
    const pad = (i) => String(i).padStart(2, '0');
    const lines = (n) => Array.from({ length: n }, (_, k) => {
      const i = k + 1;
      return i === 1
        ? { description: `Q${pad(i)}A Fabrication of galvanised structural steel as per the annexure, cutting, drilling and welding Q${pad(i)}Z`, hsn: '7308', uom: 'kg', quantity: 1, rate: 14254168500 }
        : { description: `Q${pad(i)}A V-Type cross arm, galvanised, 75 x 40 x 6 mm, punched Q${pad(i)}Z`, hsn: '7308', uom: 'nos', quantity: 25858, rate: 25858 };
    });

    const QSIZES = [25, 14, 18, 22];
    const ISIZES = [25, 12, 16, 20];
    const quotes = [];
    for (const n of QSIZES) {
      const q = await api('POST', '/sales-quotations', { customerId: cust.id, items: lines(n), terms, validUntil: '2026-12-31', ...(n === 25 ? { deliveryDays: 21, deliveryNote: 'Part deliveries allowed.' } : {}) });
      quotes.push({ id: q.id, n });
    }
    const invs = [];
    for (const n of ISIZES) {
      const inv = await api('POST', '/sales-invoices', { customerId: cust.id, items: lines(n), terms });
      invs.push({ id: inv.id, n });
    }
    /* Part-paid: ₹2,50,00,000 received against the 25-line invoice. */
    const paidInv = invs[0];
    await api('POST', `/sales-invoices/${paidInv.id}/payment`, { amount: 25000000, mode: 'Bank', reference: 'UTR-1', paidDate: '2026-10-08' });
    const paidRow = await api('GET', `/sales-invoices/${paidInv.id}`);
    const due = Math.round((paidRow.net_amount - paidRow.amount_paid) * 100) / 100;
    const unpaid = await api('POST', '/sales-invoices', { customerId: cust.id, items: [
      { description: 'MS angle 50x50x6', hsn: '7216', uom: 'kg', quantity: 1200, rate: 68.5 },
      { description: 'Galvanising charges', hsn: '9988', uom: 'kg', quantity: 1200, rate: 22 },
    ] });
    const shortQuote = await api('POST', '/sales-quotations', { customerId: cust.id, items: lines(3) });

    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    const cdp = await page.createCDPSession();
    await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: OUT });
    await page.goto(`${UI}/login`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(t => { localStorage.setItem('nexus_token', t); localStorage.setItem('maks_nav_panel_open', 'closed'); }, reg.token);

    const open = async (url, width = 1440) => {
      await page.emulateMediaType('screen');
      await page.setViewport({ width, height: 900 });
      await page.goto(`${UI}${url}`, { waitUntil: 'networkidle2' });
      await page.waitForFunction(() => document.querySelectorAll('table tbody tr').length > 0, { timeout: 15000 });
      await sleep(300);
    };
    const printPdf = async (name) => {
      await page.emulateMediaType('print');
      await page.setViewport({ width: 1440, height: 900 });
      const file = path.join(OUT, `${name}-print.pdf`);
      await page.pdf({ path: file, format: 'A4', printBackground: true, preferCSSPageSize: true });
      await page.emulateMediaType('screen');
      return readPdf(file);
    };
    /* "Download PDF" — the file that lands, and its name. Tried twice: a
       Vite dev server answers the first lazy import of a new dependency
       with a reload. */
    const download = async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        const before = new Set(fs.readdirSync(OUT));
        const clicked = await page.evaluate(() => {
          const b = [...document.querySelectorAll('button')].find(x => /Download PDF/.test(x.textContent));
          if (b) b.click();
          return !!b;
        });
        if (!clicked) return null;
        for (let i = 0; i < 80; i++) {
          await sleep(250);
          const f = fs.readdirSync(OUT).find(x => !before.has(x) && x.endsWith('.pdf'));
          if (f) { await sleep(200); return f; }
        }
        await page.reload({ waitUntil: 'networkidle2' });
      }
      return null;
    };
    /* In print, at the width of the paper: nothing wider than the sheet
       (Chrome shrinks the whole page to fit one wide thing), amounts on one
       line and right-aligned, terms inside their box. */
    const paperChecks = async (label, { screen = false } = {}) => {
      if (!screen) {
        await page.emulateMediaType('print');
        await page.setViewport({ width: PRINT_W, height: 1100 });
        await sleep(300);
      }
      const m = await page.evaluate(() => {
        const money = /^₹?-?[\d,]+\.\d{2}$/;
        const cells = [...document.querySelectorAll('table td, table th')].filter(td => money.test(td.textContent.trim()));
        const oneLine = (el) => {
          const r = document.createRange(); r.selectNodeContents(el);
          const tops = new Set([...r.getClientRects()].filter(x => x.width > 0).map(x => Math.round(x.top)));
          return tops.size <= 1;
        };
        const bad = cells.filter(td => {
          const cs = getComputedStyle(td);
          return !(cs.textAlign === 'right' || cs.textAlign === 'end') || cs.whiteSpace !== 'nowrap' || !oneLine(td) || !/tabular-nums/.test(cs.fontVariantNumeric);
        }).map(td => td.textContent.trim());
        const wraps = [...document.querySelectorAll('.doc-wrap')].filter(el => el.scrollWidth > el.clientWidth + 1).length;
        const td = document.querySelector('.doc-items tbody td');
        return {
          cells: cells.length, bad,
          scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth,
          wraps, tdPx: td ? parseFloat(getComputedStyle(td).fontSize) : 0,
        };
      });
      ok(m.cells > 0 && m.bad.length === 0, `${label}: ${m.cells} amounts right-aligned, on one line, tabular${m.bad.length ? ` — not: ${m.bad.slice(0, 3).join(' | ')}` : ''}`);
      if (screen) return;
      ok(m.scroll <= m.client + 2, `${label}: nothing wider than the paper, so nothing is shrunk (${m.scroll}px in ${m.client}px)`);
      ok(m.wraps === 0, `${label}: terms and descriptions wrap inside their boxes`);
      ok(m.tdPx >= 10 && m.tdPx <= 12.01, `${label}: item text is ${(m.tdPx * 0.75).toFixed(1)}pt — paper size, not shrunk`);
      await page.emulateMediaType('screen');
    };

    /* ── Quotations ─────────────────────────────────────────────────── */
    const QCLOSE = ['Sub-total', 'In words', 'IFSC', 'Authorized Signatory', 'This is a quotation, not a tax invoice'];
    for (const q of quotes) {
      console.log(`\n  ── quotation, ${q.n} lines`);
      await open(`/sales-quotations/${q.id}`);
      if (q.n === 25) {
        const shown = await page.evaluate(() => document.body.innerText);
        ok(/Delivery:\s*within 21 days of order\. Part deliveries allowed\./.test(shown), 'the promised delivery is on the quotation');
        await paperChecks('quotation on screen', { screen: true });
        await paperChecks('quotation print');
      }
      const printed = await printPdf(`quote-${q.n}`);
      checkPages('print', printed, { rows: q.n, closing: QCLOSE, minPages: q.n === 25 ? 2 : 1 });
      if (q.n === 25) {
        ok(printed.length <= 3, `print: 25 lines take ${printed.length} pages, not five`);
        ok(printed.some(p => p.text.includes(flat('Delivery: within 21 days of order'))), 'print: the delivery promise is printed');
      }
      const file = await download();
      ok(!!file, `Download PDF saves a file${file ? `: “${file}”` : ''}`);
      if (!file) continue;
      ok(/^Quotation QT-\d+ - Sahasra Infra [a-z0-9]+\.pdf$/.test(file), 'named “Quotation <number> - <customer>.pdf”');
      const pdf = await readPdf(path.join(OUT, file));
      checkPages('PDF', pdf, { rows: q.n, closing: QCLOSE, minPages: q.n === 25 ? 2 : 1 });
      if (q.n === 25) ok(pdf.some(p => p.text.includes(flat('Delivery: within 21 days of order. Part deliveries allowed.'))), 'PDF: the delivery promise is in it');
    }
    console.log('\n  ── quotation with no delivery promise');
    await open(`/sales-quotations/${shortQuote.id}`);
    ok(!/Delivery:/.test(await page.evaluate(() => document.body.innerText)), 'no “Delivery:” line when none was promised');

    /* ── Invoices ───────────────────────────────────────────────────── */
    const ICLOSE = ['SUB-TOTAL', 'Amount in Words', 'IFSC', 'Authorized Signatory', 'Bank Details for Payment'];
    for (const inv of invs) {
      const paid = inv === paidInv;
      console.log(`\n  ── tax invoice, ${inv.n} lines${paid ? ', part paid' : ''}`);
      await open(`/sales-invoices/${inv.id}`);
      if (paid) {
        const t = await page.evaluate(() => [...document.querySelectorAll('.inv-totals-table tr')].map(r => r.innerText.replace(/\s+/g, ' ').trim()));
        ok(t.includes('AMOUNT RECEIVED -2,50,00,000.00'), `on screen: “Amount received -2,50,00,000.00” under the total`);
        ok(t.includes(`BALANCE DUE ${inr(due)}`), `on screen: “Balance due ${inr(due)}” = total − received`);
        ok(t.indexOf('INVOICE TOTAL ' + inr(paidRow.net_amount)) >= 0 && t.indexOf('INVOICE TOTAL ' + inr(paidRow.net_amount)) < t.indexOf(`BALANCE DUE ${inr(due)}`), 'and they come after the invoice total');
        const tiles = await page.evaluate(() => document.body.innerText);
        ok(tiles.includes(`₹${inr(due)}`), 'the Balance Due tile above the invoice says the same');
        await paperChecks('invoice on screen', { screen: true });
        await paperChecks('invoice print');
      }
      const printed = await printPdf(`inv-${inv.n}`);
      const P = checkPages('print', printed, { rows: inv.n, closing: ICLOSE, minPages: inv.n === 25 ? 2 : 1 });
      if (paid) {
        ok(printed[P]?.text.includes(flat('AMOUNT RECEIVED-2,50,00,000.00')) && printed[P]?.text.includes(flat(`BALANCE DUE${inr(due)}`)),
          'print: amount received and balance due are printed with the totals');
      }
      const file = await download();
      ok(!!file, `Download PDF saves a file${file ? `: “${file}”` : ''}`);
      if (!file) continue;
      ok(/^Tax Invoice INV-\d+ - Sahasra Infra [a-z0-9]+\.pdf$/.test(file), 'named “Tax Invoice <number> - <customer>.pdf”');
      const pdf = await readPdf(path.join(OUT, file));
      const Q = checkPages('PDF', pdf, { rows: inv.n, closing: ICLOSE, minPages: inv.n === 25 ? 2 : 1 });
      if (paid) {
        ok(pdf[Q]?.text.includes(flat('AMOUNT RECEIVED-2,50,00,000.00')) && pdf[Q]?.text.includes(flat(`BALANCE DUE${inr(due)}`)),
          'PDF: amount received and balance due are in it');
      }
    }

    console.log('\n  ── unpaid invoice');
    await open(`/sales-invoices/${unpaid.id}`);
    const ut = await page.evaluate(() => document.querySelector('.inv-totals-table').innerText);
    ok(!/AMOUNT RECEIVED|BALANCE DUE/i.test(ut), 'on screen: nothing about payments under the totals');
    const up = await printPdf('unpaid');
    ok(!up.some(p => /amountreceived|balancedue/.test(p.text)), 'print: nothing about payments');
    const uf = await download();
    const upd = uf ? await readPdf(path.join(OUT, uf)) : [];
    ok(uf && !upd.some(p => /amountreceived|balancedue/.test(p.text)), 'PDF: nothing about payments');

    console.log('\n  ── the invoice list');
    await page.goto(`${UI}/sales-invoices`, { waitUntil: 'networkidle2' });
    await page.waitForFunction(() => document.querySelectorAll('table tbody tr').length > 0, { timeout: 15000 });
    const listed = await page.evaluate((num) => {
      const row = [...document.querySelectorAll('table tbody tr')].find(r => r.cells[0]?.innerText.trim() === num);
      return row ? [...row.cells].map(c => c.innerText.trim()) : null;
    }, paidRow.invoice_number);
    const n = (s) => Number(String(s || '').replace(/[^\d.-]/g, ''));
    ok(listed && n(listed[2]) === paidRow.net_amount && n(listed[3]) === paidRow.amount_paid && n(listed[4]) === due,
      `the list shows the same total, received and balance as the invoice (${listed ? listed.slice(2, 5).join(' · ') : 'row missing'})`);

    /* ── Reverse charge follows the box ────────────────────────────── */
    console.log('\n  ── reverse charge');
    const rcText = async () => page.evaluate(() => (document.body.innerText.match(/Reverse Charge:\s*(Yes|No)/) || [])[1]);
    const editAndSave = async (tick) => {
      await page.goto(`${UI}/sales-invoices/${unpaid.id}/edit`, { waitUntil: 'networkidle2' });
      await page.waitForFunction(() => [...document.querySelectorAll('label')].some(l => /reverse charge/i.test(l.textContent)), { timeout: 15000 });
      const was = await page.evaluate((want) => {
        const box = [...document.querySelectorAll('label')].find(l => /reverse charge/i.test(l.textContent)).querySelector('input[type=checkbox]');
        const before = box.checked;
        if (want !== null && box.checked !== want) box.click();
        return before;
      }, tick);
      await page.evaluate(() => [...document.querySelectorAll('button')].find(b => /^Save changes/.test(b.textContent.trim())).click());
      await page.waitForFunction((id) => location.pathname === `/sales-invoices/${id}`, { timeout: 15000 }, String(unpaid.id));
      await page.waitForFunction(() => /Reverse Charge:/.test(document.body.innerText), { timeout: 15000 });
      return was;
    };
    await open(`/sales-invoices/${unpaid.id}`);
    ok(await rcText() === 'No', 'a new invoice says “Reverse Charge: No”');
    ok(await editAndSave(null) === false && await rcText() === 'No', 'the box is unticked in the form, and saving it unchanged keeps “No”');
    await editAndSave(true);
    ok(await rcText() === 'Yes', 'ticking it prints “Yes”');
    ok(await editAndSave(false) === true && await rcText() === 'No', 'unticking it prints “No” again');

    /* ── Phone width ───────────────────────────────────────────────── */
    console.log('\n  ── at 360px');
    for (const [label, url] of [['quotation', `/sales-quotations/${quotes[0].id}`], ['invoice', `/sales-invoices/${paidInv.id}`]]) {
      await open(url, 360);
      const o = await page.evaluate(() => ({
        page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        main: (() => { const m = document.querySelector('.app-main'); return m ? m.scrollWidth - m.clientWidth : 0; })(),
        sheet: (() => { const s = document.querySelector('.doc-scroll'); return s ? s.scrollWidth > s.clientWidth : false; })(),
      }));
      ok(o.page <= 0 && o.main <= 0, `${label}: the screen does not scroll sideways (${o.page}px, ${o.main}px)`);
      ok(o.sheet, `${label}: the document keeps its paper layout and scrolls in its own box`);
    }

    ok(errs.length === 0, `no page errors${errs.length ? `: ${errs[0]}` : ''}`);
  } catch (e) {
    fail++; console.log(`   ❌ crashed: ${e.stack || e.message}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    const n = await purge(ids).catch((e) => { console.log('   purge failed:', e.message); return 0; });
    ok(n === ids.length, `throwaway account and everything it made removed (${n})`);
    console.log(`\n   PDFs kept for a look: ${OUT}`);
    console.log(`\n   ${pass} passed, ${fail} failed\n`);
    process.exit(fail ? 1 : 0);
  }
})();
