#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   Vendor quotations: upload, read, review, compare — with real files.

   Three vendors quote the same five items, each the way real vendors do:

     Apex     Excel, with letterhead rows above the table, an "Item Code"
              column before the description, "Unit Price (Rs.)" next to
              "Unit", a GST % column, and Sub Total / Add: GST / Grand
              Total rows under the items
     Deccan   PDF, a ruled table printed from a browser — and it does NOT
              quote the GI sheet
     Sunrise  Word, the items in a table, GST and net amount in paragraphs
     (+ a CSV export, and the old .xls / .doc formats, and a scanned PDF)

   Every one of these broke the first version of the reader: Apex's
   descriptions came out as "AST-100", Deccan's quantity and rate were
   lost inside the description, Sunrise read nothing, CSV was refused —
   and because each vendor words an item differently, the comparison put
   the same sheet on three rows and found nothing to compare.

   Runs against a local backend with throwaway accounts it deletes again.
   Refuses to run against a deployed host.
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
const bmod = (m) => require(path.join(B, 'node_modules', m));
bmod('dotenv').config({ path: path.join(B, '.env') });
const ExcelJS = bmod('exceljs');
const JSZip = bmod('jszip');
const { Client } = bmod('pg');
const { purgeOrg } = require(path.join(B, 'scripts', 'lib', 'purgeOrg'));
const { parseQuotation } = require(path.join(B, 'shared', 'quoteParser'));

const stamp = Date.now().toString(36);
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vq-'));
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function cleanup() {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    const { rows } = await c.query(`SELECT id FROM users WHERE email LIKE 'vq-%@example.test'`);
    const ids = rows.map(r => r.id);
    if (!ids.length) return 0;
    await purgeOrg(c, ids);
    return (await c.query(`DELETE FROM users WHERE id = ANY($1) AND email LIKE '%@example.test'`, [ids])).rowCount;
  } finally { await c.end(); }
}

/* ── the sample files ───────────────────────────────────────────────── */
const ITEMS = {
  apex: [['SS304 Sheet 2mm 1250x2500', '7219', 180, 'Kg', 283], ['MS Angle 50x50x6', '7216', 420, 'Kg', 68.5], ['MS Flat 50x6', '7211', 250, 'Kg', 66], ['Hex Bolt M12x50 SS304', '7318', 500, 'Nos', 14.2], ['GI Sheet 1.6mm', '7210', 120, 'Kg', 92]],
  deccan: [['Stainless Steel Sheet 304, 2 mm thk, 1250 x 2500', '7219', 180, 'kg', 260], ['M.S. Angle 50 x 50 x 6 mm', '7216', 420, 'kg', 71], ['MS Flat 50 x 6 mm', '7211', 250, 'kg', 64.5], ['SS304 Hex Bolt M12 x 50', '7318', 500, 'nos', 13.8]],
  sunrise: [['SS 304 sheet - 2.0 mm (1250x2500)', '7219', 180, 'KG', 276], ['Angle MS 50x50x6', '7216', 420, 'KG', 69.25], ['Flat MS 50x6', '7211', 250, 'KG', 65], ['Bolt Hex M12 x 50 SS-304', '7318', 500, 'NOS', 15], ['GI Sheet 1.6 mm', '7210', 120, 'KG', 89.5]],
};
const amt = (q, r) => Math.round(q * r * 100) / 100;
const totals = (rows) => { const s = rows.reduce((a, [, , q, , r]) => a + amt(q, r), 0); return { sub: s, gst: Math.round(s * 18) / 100, grand: Math.round(s * 118) / 100 }; };
const inr = (n) => n.toLocaleString('en-IN', { minimumFractionDigits: 2 });

async function makeFiles(browser) {
  const f = {};
  { const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Quotation');
    ws.addRow(['APEX STEEL TRADERS']); ws.addRow(['Plot 9, Balanagar, Hyderabad']); ws.addRow(['QUOTATION', '', '', '', 'Ref: AST/Q/2026/118']); ws.addRow([]);
    ws.addRow(['S.No', 'Item Code', 'Description of Goods', 'HSN', 'Qty', 'Unit', 'Unit Price (Rs.)', 'GST %', 'Amount (Rs.)']);
    ITEMS.apex.forEach(([d, h, q, u, r], i) => ws.addRow([i + 1, 'AST-' + (100 + i), d, h, q, u, r, '18%', { formula: `E${6 + i}*G${6 + i}`, result: amt(q, r) }]));
    const t = totals(ITEMS.apex); ws.addRow([]); ws.addRow(['', '', 'Sub Total', '', '', '', '', '', t.sub]); ws.addRow(['', '', 'Add: GST @ 18%', '', '', '', '', '', t.gst]); ws.addRow(['', '', 'Grand Total', '', '', '', '', '', t.grand]);
    ws.addRow(['Terms: Payment 30 days. Delivery 7 days.']);
    f.apex = path.join(DIR, 'apex-quote.xlsx'); await wb.xlsx.writeFile(f.apex); }
  { const t = totals(ITEMS.deccan);
    const html = `<html><body style="font-family:Arial;font-size:11px;padding:30px"><h2>DECCAN METALS &amp; ALLOYS PVT LTD</h2><p>Quotation No: DMA/Q/2291 &nbsp; Date: 06-10-2026</p>
      <table border="1" cellspacing="0" cellpadding="5" style="border-collapse:collapse;width:100%"><thead><tr><th>Sl</th><th>Particulars</th><th>HSN Code</th><th>Qty</th><th>UOM</th><th>Rate</th><th>Amount</th></tr></thead><tbody>
      ${ITEMS.deccan.map(([d, h, q, u, r], i) => `<tr><td>${i + 1}</td><td>${d}</td><td>${h}</td><td>${q}</td><td>${u}</td><td>${r.toFixed(2)}</td><td>${inr(amt(q, r))}</td></tr>`).join('')}
      </tbody></table><p>Taxable Value: ${inr(t.sub)}</p><p>IGST 18%: ${inr(t.gst)}</p><p><b>Grand Total: ${inr(t.grand)}</b></p><p>Validity 15 days.</p></body></html>`;
    const p = await browser.newPage(); await p.setContent(html); f.deccan = path.join(DIR, 'deccan-metals.pdf'); await p.pdf({ path: f.deccan, format: 'A4' });
    /* a scan: the same page, but as a picture with no text layer */
    await p.setContent(`<canvas id="c" width="900" height="300"></canvas><script>const x=document.getElementById('c').getContext('2d');x.font='24px Arial';x.fillText('QUOTATION  SS304 sheet 180 kg 260.00 46,800.00',20,80);</script>`);
    f.scan = path.join(DIR, 'scanned.pdf'); await p.pdf({ path: f.scan, format: 'A4' }); await p.close(); }
  { const t = totals(ITEMS.sunrise); const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const cell = v => `<w:tc><w:p><w:r><w:t xml:space="preserve">${esc(v)}</w:t></w:r></w:p></w:tc>`;
    const row = cs => `<w:tr>${cs.map(cell).join('')}</w:tr>`;
    const para = s => `<w:p><w:r><w:t xml:space="preserve">${esc(s)}</w:t></w:r></w:p>`;
    const body = [para('SUNRISE ALLOYS'), para('Quotation SA/26/77 dated 06/10/2026'),
      `<w:tbl>${row(['No.', 'Item', 'HSN/SAC', 'Quantity', 'Unit', 'Rate', 'Value'])}${ITEMS.sunrise.map(([d, h, q, u, r], i) => row([i + 1, d, h, q, u, r.toFixed(2), amt(q, r).toFixed(2)])).join('')}${row(['', 'Total', '', '', '', '', t.sub.toFixed(2)])}</w:tbl>`,
      para(`CGST 9%: ${(t.gst / 2).toFixed(2)}`), para(`SGST 9%: ${(t.gst / 2).toFixed(2)}`), para(`Net Amount: ${t.grand.toFixed(2)}`)].join('');
    const z = new JSZip();
    z.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    z.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    z.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`);
    f.sunrise = path.join(DIR, 'sunrise-quotation.docx'); fs.writeFileSync(f.sunrise, await z.generateAsync({ type: 'nodebuffer' })); }
  { const rows = [['Description', 'HSN', 'Qty', 'Unit', 'Rate', 'Amount'], ...ITEMS.apex.map(([d, h, q, u, r]) => [d, h, q, u, r, amt(q, r)])];
    f.csv = path.join(DIR, 'vendor-export.csv'); fs.writeFileSync(f.csv, rows.map(r => r.join(',')).join('\n')); }
  f.xls = path.join(DIR, 'old-format.xls'); fs.writeFileSync(f.xls, Buffer.from('D0CF11E0A1B11AE1', 'hex'));
  return f;
}

(async () => {
  await cleanup();
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const accounts = [];
  try {
    const f = await makeFiles(browser);

    console.log('\n  ── reading each format');
    const read = async (file) => parseQuotation(fs.readFileSync(file), '', path.basename(file));
    const ax = await read(f.apex);
    ok(ax.lines.length === 5 && ax.lines[0].description === 'SS304 Sheet 2mm 1250x2500',
      `Excel: the description, not the "Item Code" column (${ax.lines[0]?.description})`);
    ok(ax.lines[0].rate === 283 && ax.lines[0].uom === 'Kg' && ax.lines[0].hsn === '7219',
      '"Unit Price" is read as the rate and "Unit" as the unit — not the other way round');
    ok(ax.totals.subtotal === 114350 && ax.totals.tax === 20583 && ax.totals.grand === 134933 && ax.status === 'parsed',
      'Sub Total, "Add: GST @ 18%" and Grand Total are totals, not item lines');
    const dx = await read(f.deccan);
    ok(dx.lines.length === 4 && dx.lines.every(l => l.quantity && l.rate && l.uom), `PDF: quantity, unit and rate read out of every line (${dx.lines.length})`);
    ok(dx.lines[0].description === 'Stainless Steel Sheet 304, 2 mm thk, 1250 x 2500' && dx.lines[0].hsn === '7219',
      'the description keeps its own sizes but not the HSN, quantity or rate');
    ok(dx.status === 'parsed' && !dx.note, 'and no false "rows were missed" warning against the GST-inclusive total');
    const sx = await read(f.sunrise);
    ok(sx.lines.length === 5 && sx.lines[3].rate === 15, `Word: the table is read (${sx.lines.length} lines — it was 0)`);
    ok(sx.totals.tax === 20385.9 && sx.totals.grand === 133640.9, 'and the CGST, SGST and net amount written below it');
    const cx = await read(f.csv);
    ok(cx.kind === 'csv' && cx.lines.length === 5, `CSV is accepted and read (${cx.lines.length} lines)`);
    const xx = await read(f.xls);
    ok(xx.status === 'failed' && /Save As/.test(xx.note), 'the old .xls format gets a clear "Save As .xlsx" instead of a crash');
    const scan = await read(f.scan);
    ok(scan.status === 'failed' && /scan/i.test(scan.note || ''), 'a scanned PDF says it is a scan, rather than inventing numbers');

    console.log('\n  ── uploading');
    const reg = async (tag) => {
      const r = await (await fetch(`${API}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'VQ', email: `vq-${tag}-${stamp}@example.test`, password: 'testpassword123' }) })).json();
      accounts.push(r.user.id); return r;
    };
    const me = await reg('a');
    const H = { Authorization: `Bearer ${me.token}` };
    const J = { ...H, 'Content-Type': 'application/json' };
    /* A new account without a company name is sent to first-run set-up. */
    await fetch(`${API}/company-profile`, { method: 'PUT', headers: J, body: JSON.stringify({ name: `VQ Fabricators ${stamp}`, gstin: '36AAMCK2569F1Z9', stateCode: '36' }) });
    const vendor = await (await fetch(`${API}/vendors`, { method: 'POST', headers: J, body: JSON.stringify({ name: 'Deccan Metals & Alloys', type: 'Supplier' }) })).json();
    const up = async (file, extra = {}) => {
      const fd = new FormData();
      fd.append('file', new Blob([fs.readFileSync(file)]), path.basename(file));
      for (const [k, v] of Object.entries(extra)) fd.append(k, v);
      const r = await fetch(`${API}/vendor-quotations`, { method: 'POST', headers: H, body: fd });
      return { status: r.status, body: await r.json().catch(() => ({})) };
    };
    const qa = await up(f.apex, { vendorName: 'Apex Steel Traders', rfqRef: 'RFQ-17' });
    const qd = await up(f.deccan, { vendorId: vendor.id, rfqRef: 'RFQ-17' });
    const qs = await up(f.sunrise, { vendorName: 'Sunrise Alloys', rfqRef: 'RFQ-17' });
    ok(qa.status === 200 && qa.body.lineCount === 5 && qa.body.parse_status === 'parsed', `Excel uploaded: ${qa.body.lineCount} lines, ${qa.body.parse_status}`);
    ok(qd.status === 200 && qd.body.lineCount === 4 && qd.body.vendor_name === 'Deccan Metals & Alloys', 'PDF uploaded against a vendor picked from the list');
    ok(qs.status === 200 && qs.body.lineCount === 5, `Word uploaded: ${qs.body.lineCount} lines`);
    const bad = await up(f.xls);
    ok(bad.status === 400 && /Save As/.test(bad.body.error || ''), 'an .xls upload is refused with the fix in the message');

    console.log('\n  ── comparing');
    const cmp = await (await fetch(`${API}/vendor-quotations/compare?ids=${qa.body.id},${qd.body.id},${qs.body.id}`, { headers: H })).json();
    const row = (re) => cmp.rows.find(r => re.test(r.description));
    ok(cmp.totalRowCount === 5, `three vendors' wordings of five items line up as 5 rows, not 14 (${cmp.totalRowCount})`);
    const sheet = row(/sheet 304|304 sheet|SS304 Sheet/i);
    ok(sheet && sheet.quotedBy === 3, 'the SS304 sheet — written three different ways — is one row, quoted by all 3');
    const gi = row(/GI Sheet/i);
    ok(gi && gi.quotedBy === 2 && gi.missingFrom.includes(qd.body.id), 'the GI sheet is shown as NOT quoted by Deccan');
    ok(cmp.comparableRowCount === 4, `like for like covers the 4 items everyone quoted (${cmp.comparableRowCount})`);
    const t = Object.fromEntries(cmp.quotations.map(q => [q.vendor, q.comparableTotal]));
    ok(t['Apex Steel Traders'] === 103310 && t['Deccan Metals & Alloys'] === 99645 && t['Sunrise Alloys'] === 102515,
      `like-for-like totals are right to the rupee (${JSON.stringify(t)})`);
    ok(cmp.cheapestOnLikeForLike === qd.body.id && cmp.savingsVsHighest === 3665,
      `Deccan is lowest like for like, ₹3,665 under the highest — though its bottom line is smallest only because it skipped an item`);
    ok(row(/angle/i).bestQuotationIds[0] === qa.body.id && row(/bolt/i).bestQuotationIds[0] === qd.body.id,
      'each item names its own cheapest vendor (angle: Apex, bolt: Deccan)');
    ok(/Only 4 of 5/.test(cmp.caveat || ''), 'and the caveat says the totals cover 4 of 5 items');

    console.log('\n  ── reviewing');
    const one = await (await fetch(`${API}/vendor-quotations/${qs.body.id}`, { headers: H })).json();
    const edited = one.lines.map(l => ({ ...l, rate: /bolt/i.test(l.description) ? 13.5 : l.rate }));
    const put = await fetch(`${API}/vendor-quotations/${qs.body.id}`, { method: 'PUT', headers: J,
      body: JSON.stringify({ vendorName: 'Sunrise Alloys Pvt Ltd', quoteRef: 'SA/26/77', lines: edited }) });
    const saved = await put.json();
    ok(put.status === 200 && saved.parse_status === 'reviewed' && saved.lines.every(l => l.confidence === 'checked'),
      'a corrected quotation is saved as reviewed, every line "checked"');
    const cmp2 = await (await fetch(`${API}/vendor-quotations/compare?ids=${qa.body.id},${qd.body.id},${qs.body.id}`, { headers: H })).json();
    ok(cmp2.rows.find(r => /bolt/i.test(r.description)).bestQuotationIds[0] === qs.body.id,
      'and the correction carries into the comparison (Sunrise now cheapest on bolts)');
    const unitEdit = one.lines.map(l => ({ ...l, uom: /sheet - 2/i.test(l.description) ? 'MT' : l.uom }));
    await fetch(`${API}/vendor-quotations/${qs.body.id}`, { method: 'PUT', headers: J, body: JSON.stringify({ lines: unitEdit }) });
    const cmp3 = await (await fetch(`${API}/vendor-quotations/compare?ids=${qa.body.id},${qd.body.id},${qs.body.id}`, { headers: H })).json();
    const s3 = cmp3.rows.find(r => /304/.test(r.description) && /sheet/i.test(r.description));
    ok(s3.unitsDiffer && s3.bestQuotationIds.length === 0, 'a rate per MT is never ranked against rates per kg');
    const badLine = await fetch(`${API}/vendor-quotations/${qs.body.id}`, { method: 'PUT', headers: J, body: JSON.stringify({ lines: [{ description: 'x', rate: 'abc' }] }) });
    ok(badLine.status === 400, 'a rate that is not a number is refused');

    console.log('\n  ── one business cannot see another\'s');
    const other = await reg('b');
    const OH = { Authorization: `Bearer ${other.token}`, 'Content-Type': 'application/json' };
    const peek = await fetch(`${API}/vendor-quotations/${qa.body.id}`, { headers: OH });
    const poke = await fetch(`${API}/vendor-quotations/${qa.body.id}`, { method: 'PUT', headers: OH, body: JSON.stringify({ vendorName: 'hijacked' }) });
    const cmpX = await fetch(`${API}/vendor-quotations/compare?ids=${qa.body.id},${qd.body.id}`, { headers: OH });
    const fileX = await fetch(`${API}/vendor-quotations/${qa.body.id}/file`, { headers: OH });
    ok(peek.status === 404 && poke.status === 404 && cmpX.status === 404 && fileX.status === 404,
      `read, edit, compare and download all refused (${peek.status}/${poke.status}/${cmpX.status}/${fileX.status})`);
    const fd = new FormData(); fd.append('file', new Blob([fs.readFileSync(f.csv)]), 'x.csv'); fd.append('vendorId', vendor.id);
    const steal = await fetch(`${API}/vendor-quotations`, { method: 'POST', headers: { Authorization: `Bearer ${other.token}` }, body: fd });
    ok(steal.status === 400, 'and another business\'s vendor cannot be named on an upload');

    console.log('\n  ── in the browser');
    const page = await browser.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    page.on('dialog', d => d.accept());
    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto(`${UI}/login`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(tk => localStorage.setItem('nexus_token', tk), me.token);
    await page.goto(`${UI}/vendor-quotations`, { waitUntil: 'networkidle2' });
    await sleep(800);
    ok((await page.evaluate(() => document.querySelectorAll('tbody tr').length)) === 3, 'the three uploads are listed');
    await page.type('input[aria-label="Vendor name"]', 'CSV Vendor');
    const input = await page.$('input[aria-label="Vendor quotation file"]');
    await input.uploadFile(f.csv);
    await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 4, { timeout: 15000 });
    ok(/CSV Vendor/.test(await page.evaluate(() => document.body.innerText)), 'a file chosen on screen uploads and appears with its vendor');
    await page.evaluate(() => { [...document.querySelectorAll('tbody input[type=checkbox]')].slice(1, 4).forEach(c => c.click()); });
    await page.evaluate(() => [...document.querySelectorAll('button')].find(b => /^\s*Compare/.test(b.textContent)).click());
    await page.waitForSelector('#vq-compare', { timeout: 15000 });
    const shown = await page.evaluate(() => document.querySelector('#vq-compare').innerText);
    ok(/Side by side/.test(shown) && /lowest like for like/i.test(shown) && /not quoted/.test(shown), 'the comparison shows the lowest vendor and the item one of them left out');
    await page.evaluate(() => document.querySelector('button[aria-label^="Review Apex"]').click());
    await page.waitForSelector('input[aria-label="Review line 1 rate"]', { timeout: 15000 });
    await page.click('input[aria-label="Review line 1 rate"]', { clickCount: 3 });
    await page.keyboard.type('255');
    await page.evaluate(() => [...document.querySelectorAll('button')].find(b => /Save as checked/.test(b.textContent)).click());
    await page.waitForFunction(() => /Checked/.test(document.querySelector('tbody').innerText), { timeout: 15000 });
    await sleep(800);
    const after = await page.evaluate(() => document.querySelector('#vq-compare')?.innerText || '');
    ok(/255\.00/.test(after), 'a rate corrected in Review shows up in the open comparison straight away');
    ok(errs.length === 0, `no JavaScript errors${errs.length ? ': ' + errs[0].slice(0, 100) : ''}`);
    await page.close();
  } catch (e) {
    fail++; console.log('   ❌ threw:', e.stack?.split('\n').slice(0, 3).join(' | '));
  } finally {
    await browser.close();
    const n = await cleanup();
    ok(n >= 1, `test accounts removed (${n})`);
    fs.rmSync(DIR, { recursive: true, force: true });
  }
  console.log(`\n   ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})();
