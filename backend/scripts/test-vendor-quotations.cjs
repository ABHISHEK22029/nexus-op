#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   Vendor quotations: upload three real files, read them, compare them.

   The fixtures are genuinely built here — a real .xlsx through ExcelJS, a
   real .docx assembled as the zip a Word file is, and a real .pdf printed
   by Chrome. Parsing a string that a test wrote to look like a spreadsheet
   proves nothing; these are the formats a vendor actually emails.

   Each vendor lays the table out differently and uses different words for
   the same columns, because they do. One of them omits an item — which is
   the case the comparison exists for: the cheapest bottom line is very
   often just the shortest scope.

   Refuses to run against a deployed host, and removes what it creates.
   ══════════════════════════════════════════════════════════════════════ */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { sweepStale } = require('../scripts/lib/testAccounts');

const API = process.env.API_BASE || 'http://localhost:5099';
if (/^https:|onrender\.com|vercel\.app/.test(API)) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}

const stamp = Date.now().toString(36);
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };
const tmp = (n) => path.join(os.tmpdir(), `vq-${stamp}-${n}`);

/* ── fixture 1: a real spreadsheet ──────────────────────────────────── */
async function makeExcel(file) {
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Quotation');
  ws.addRow(['ACME STEEL WORKS']);
  ws.addRow(['Quotation against RFQ-77']);
  ws.addRow([]);
  ws.addRow(['S.No', 'Description of Goods', 'HSN Code', 'UOM', 'Qty', 'Rate', 'Amount']);
  ws.addRow([1, 'V-Type Cross Arm 75x40x6mm', '7308', 'Nos', 100, 820, 82000]);
  ws.addRow([2, 'Stay Set complete', '7308', 'Nos', 50, 640, 32000]);
  ws.addRow([3, 'Earth Rod 25mm x 3m', '7326', 'Nos', 40, 410, 16400]);
  ws.addRow([]);
  ws.addRow(['', 'Sub Total', '', '', '', '', 130400]);
  ws.addRow(['', 'GST 18%', '', '', '', '', 23472]);
  ws.addRow(['', 'Grand Total', '', '', '', '', 153872]);
  await wb.xlsx.writeFile(file);
}

/* ── fixture 2: a real Word file (a .docx is a zip of XML) ──────────── */
async function makeWord(file, lines) {
  const JSZip = require('jszip');
  const zip = new JSZip();
  zip.file('[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);
  zip.folder('_rels').file('.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);
  const paras = lines.map(t => `<w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`).join('');
  zip.folder('word').file('document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paras}</w:body></w:document>`);
  fs.writeFileSync(file, await zip.generateAsync({ type: 'nodebuffer' }));
}

/* ── fixture 3: a real PDF, printed by Chrome ───────────────────────── */
async function makePdf(file, rows) {
  const puppeteer = require(path.join(__dirname, '..', '..', 'frontend', 'node_modules', 'puppeteer'));
  const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage();
  await p.setContent(`<html><body style="font-family:Arial;font-size:12px">
    <h3>BHARAT FABRICATORS — Quotation QT/BF/2026/41</h3>
    <pre>${rows.join('\n')}</pre>
    </body></html>`);
  await p.pdf({ path: file, format: 'A4' });
  await b.close();
}

const upload = async (token, file, fields = {}) => {
  const fd = new FormData();
  const buf = fs.readFileSync(file);
  const name = path.basename(file);
  /* The browser sends the type it derives from the file. An earlier version
     of this helper labelled everything that was not .xlsx/.docx as a PDF,
     so the "unsupported file" case was uploading a text file wearing a PDF
     content type — and tested nothing. */
  const type = name.endsWith('.xlsx') ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    : name.endsWith('.docx') ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : name.endsWith('.pdf') ? 'application/pdf'
        : 'text/plain';
  fd.append('file', new Blob([buf], { type }), name);
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  const r = await fetch(`${API}/vendor-quotations`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

(async () => {
  console.log('');
  /* Anything an earlier failed run of this test left on the database.
     Cleanup at the bottom of a script never runs when an assertion
     fails, so the next run clears it instead. */
  await sweepStale('vq-');

  const mk = async (label) => {
    const r = await (await fetch(`${API}/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: label, email: `vq-${label}-${stamp}@example.test`, password: 'testpassword123' }),
    })).json();
    return { token: r.token, id: r.user.id, h: { Authorization: `Bearer ${r.token}` } };
  };
  const A = await mk('alpha'), B = await mk('beta');

  const xlsx = tmp('acme.xlsx'), docx = tmp('surya.docx'), pdf = tmp('bharat.pdf');
  await makeExcel(xlsx);
  /* Different wording, different order, and it quotes only two of the three
     items — the incomplete-scope case. */
  await makeWord(docx, [
    'SURYA ENGINEERING WORKS',
    'Quotation against RFQ-77',
    'Particulars Qty Unit Price Value',
    'V-Type Cross Arm 75x40x6mm 100 795.00 79500.00',
    'Stay Set complete 50 660.00 33000.00',
    'Sub Total 112500.00',
    'GST 18% 20250.00',
    'Grand Total 132750.00',
  ]);
  await makePdf(pdf, [
    'Item                                  Qty      Rate      Amount',
    'V-Type Cross Arm 75x40x6mm            100    805.00    80500.00',
    'Stay Set complete                      50    650.00    32500.00',
    'Earth Rod 25mm x 3m                    40    399.00    15960.00',
    'Sub Total                                            128960.00',
    'GST 18%                                               23212.80',
    'Grand Total                                          152172.80',
  ]);
  ok(fs.existsSync(xlsx) && fs.existsSync(docx) && fs.existsSync(pdf), 'built a real .xlsx, .docx and .pdf to upload');

  console.log('\n  ── reading each format');
  const rx = await upload(A.token, xlsx, { vendorName: 'Acme Steel Works', rfqRef: 'RFQ-77' });
  ok(rx.status === 200 && rx.body.lineCount === 3,
    `spreadsheet: ${rx.body.lineCount} item lines, status "${rx.body.parse_status}"`);
  ok(Number(rx.body.grand_total) === 153872, `and its stated grand total (₹${rx.body.grand_total})`);

  const rw = await upload(A.token, docx, { vendorName: 'Surya Engineering', rfqRef: 'RFQ-77' });
  ok(rw.status === 200 && rw.body.lineCount >= 2, `Word file: ${rw.body.lineCount} item lines`);

  const rp = await upload(A.token, pdf, { vendorName: 'Bharat Fabricators', rfqRef: 'RFQ-77' });
  ok(rp.status === 200 && rp.body.lineCount >= 3, `PDF: ${rp.body.lineCount} item lines`);

  const detail = await (await fetch(`${API}/vendor-quotations/${rx.body.id}`, { headers: A.h })).json();
  const arm = detail.lines.find(l => /cross arm/i.test(l.description));
  ok(arm && Number(arm.rate) === 820 && Number(arm.quantity) === 100,
    `the figures are the vendor's own, not rounded or guessed (qty ${arm?.quantity} @ ₹${arm?.rate})`);
  ok(detail.lines.every(l => l.confidence === 'high'),
    'spreadsheet rows are marked high confidence — they came from cells');
  const pdfDetail = await (await fetch(`${API}/vendor-quotations/${rp.body.id}`, { headers: A.h })).json();
  ok(pdfDetail.lines.every(l => l.confidence !== 'high'),
    'rows read out of text are NOT claimed as high confidence');

  console.log('\n  ── the original file, for the eye icon');
  const fileRes = await fetch(`${API}/vendor-quotations/${rx.body.id}/file`, { headers: A.h });
  const back = Buffer.from(await fileRes.arrayBuffer());
  ok(fileRes.status === 200 && back.equals(fs.readFileSync(xlsx)),
    'the vendor’s own file comes back byte-identical, so any figure can be checked');
  ok(/inline/.test(fileRes.headers.get('content-disposition') || ''),
    'served inline, to open beside the parsed figures');

  console.log('\n  ── comparing them');
  const ids = [rx.body.id, rw.body.id, rp.body.id].join(',');
  const cmp = await (await fetch(`${API}/vendor-quotations/compare?ids=${ids}`, { headers: A.h })).json();
  ok(cmp.quotations?.length === 3, 'three quotations line up');
  const armRow = cmp.rows.find(r => /cross arm/i.test(r.description));
  ok(armRow && armRow.quotedBy === 3, `the same item is matched across all three vendors (${armRow?.quotedBy})`);
  ok(armRow && armRow.bestValue === 795,
    `and the cheapest rate for it is identified (₹${armRow?.bestValue} — Surya)`);
  const rod = cmp.rows.find(r => /earth rod/i.test(r.description));
  ok(rod && rod.quotedBy === 2 && rod.missingFrom.includes(rw.body.id),
    'the item Surya did not quote is shown as missing rather than ignored');
  ok(cmp.caveat && /quoted by every vendor/i.test(cmp.caveat),
    `and the trap is stated plainly — "${(cmp.caveat || '').slice(0, 80)}…"`);
  const surya = cmp.quotations.find(q => q.id === rw.body.id);
  ok(surya && surya.linesMissing >= 1,
    `Surya's total is flagged as covering fewer items (${surya?.linesMissing} missing)`);
  ok(cmp.cheapestOnLikeForLike != null,
    `a like-for-like winner is named on the items everyone quoted (quotation #${cmp.cheapestOnLikeForLike})`);

  console.log('\n  ── another organisation');
  let r = await fetch(`${API}/vendor-quotations/${rx.body.id}`, { headers: B.h });
  ok(r.status === 404, `org B cannot open org A's quotation (${r.status})`);
  r = await fetch(`${API}/vendor-quotations/${rx.body.id}/file`, { headers: B.h });
  ok(r.status === 404, `nor download the vendor's file (${r.status})`);
  r = await fetch(`${API}/vendor-quotations/compare?ids=${ids}`, { headers: B.h });
  ok(r.status === 404, `nor compare them (${r.status})`);

  console.log('\n  ── what it refuses');
  const junk = tmp('notes.txt');
  fs.writeFileSync(junk, 'just a note, not a quotation');
  r = await upload(A.token, junk);
  ok(r.status === 400, `an unsupported file type is refused (${r.status}) — "${r.body.error}"`);

  for (const f of [xlsx, docx, pdf, junk]) { try { fs.unlinkSync(f); } catch { /* ignore */ } }

  /* ── leave the database as it was found ── */
  const base = path.join(__dirname, '..');
  require(path.join(base, 'node_modules', 'dotenv')).config({ path: path.join(base, '.env') });
  const { Client } = require(path.join(base, 'node_modules', 'pg'));
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  for (const u of [A, B]) {
    await c.query('DELETE FROM vendor_quotation_lines WHERE owner_id = $1', [u.id]).catch(() => {});
    await c.query('DELETE FROM vendor_quotations WHERE owner_id = $1', [u.id]).catch(() => {});
    await c.query('DELETE FROM attachments WHERE owner_id = $1', [u.id]).catch(() => {});
    await c.query('DELETE FROM users WHERE id = $1', [u.id]).catch(() => {});
  }
  const { rows } = await c.query('SELECT COUNT(*)::int n FROM vendor_quotations WHERE owner_id = ANY($1)', [[A.id, B.id]]);
  await c.end();
  ok(rows[0].n === 0, 'test data removed — nothing left behind');

  console.log(`\n   ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('threw:', e.message); process.exit(1); });
