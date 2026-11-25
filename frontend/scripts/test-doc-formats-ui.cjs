/* ══════════════════════════════════════════════════════════════════════
   Every document in the right format — on paper and in the PDF.

   The 24 Nov audit (DOCUMENTS_FORMAT_AND_EDIT_AUDIT_2026-11-24.md) found
   documents that printed wrong; each fix is checked here, as printed (print
   media, what is actually visible) and, for the invoice and quotation, in
   the downloaded PDF:
     · tax invoice: "ORIGINAL FOR RECIPIENT" and the other two copies; a
       draft says it is not yet a tax invoice; taxable value; HSN/SAC; the
       supplier's state code and CIN; the declaration; no status on paper;
       screen-only warnings stay on screen; reverse charge comes off the total
     · quotation: no "Valid until: not set", no notice pointing at a missing
       date, payment terms printed
     · delivery challan: copy label, the consignee's GSTIN, place of supply
       with its code, the e-way warning counts tax, the agreed rate
     · credit/debit note: vendor notes name the vendor's invoice and don't
       claim Section 34; taxable value; words from the total
     · purchase order: a real ship-to, no placeholder words or empty labels,
       only terms someone chose, line amounts in paise
     · vendor bill: the vendor's invoice number, address, paid and balance

   Builds its own throwaway company (dfmt-*@example.test) and removes it.
   Needs the backend (SCHEDULER=off) and vite. Refuses a deployed host.
   ══════════════════════════════════════════════════════════════════════ */
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { pathToFileURL } = require('url');
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
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-formats-'));
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };
const section = (t) => console.log(`\n  ── ${t}`);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const flat = (s) => String(s).replace(/\s+/g, '').toLowerCase();
const db = () => new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const q1 = async (sql, p) => { const c = db(); await c.connect(); try { return (await c.query(sql, p)).rows[0]; } finally { await c.end(); } };

let pdfjs;
async function pdfText(file) {
  pdfjs = pdfjs || await import(pathToFileURL(path.join(B, 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.mjs')).href);
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)), disableFontFace: true }).promise;
  let t = '';
  for (let i = 1; i <= doc.numPages; i++) t += (await (await doc.getPage(i)).getTextContent()).items.map(x => x.str).join(' ');
  return t;
}

async function cleanup() {
  const c = db(); await c.connect();
  try {
    const { rows } = await c.query(`SELECT id FROM users WHERE email LIKE 'dfmt-%@example.test'`);
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
    body: JSON.stringify({ name: 'Formats', email: `dfmt-${stamp}@example.test`, password: 'testpassword123' }) })).json();
  const H = { Authorization: `Bearer ${reg.token}`, 'Content-Type': 'application/json' };
  const api = async (m, u, b) => { const r = await fetch(`${API}${u}`, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, ...(await r.json().catch(() => ({}))) }; };
  let browser;
  try {
    const prof = await api('PUT', '/company-profile', {
      name: 'Format Fab Works Pvt Ltd', address: 'Plot 14, IDA Bowrampet, Hyderabad 500043', phone: '9876543210',
      gstin: '36ABCDE1234F1Z9', pan: 'ABCDE1234F', stateCode: '36', cin: 'U28100TG2020PTC123456',
      bank_name: 'HDFC Bank', bank_account_no: '50200110000001', bank_ifsc: 'HDFC0005038', invoice_terms: 'Payment within 30 days.',
      setup_completed_at: new Date().toISOString(),
    });
    ok(prof.status === 200, `a company with GSTIN, state code, CIN and bank (${prof.status}${prof.error ? `: ${prof.error}` : ''})`);
    const L = await api('POST', '/customers', { name: `Local Infra ${stamp}`, gstin: '36AAACS1234C1Z5', state: 'Telangana', shipping_state: 'Telangana', billing_address: 'Kukatpally, Hyderabad' });
    const K = await api('POST', '/customers', { name: `Karnataka Builders ${stamp}`, gstin: '29AAACB1234C1Z5', state: 'Karnataka', shipping_state: 'Karnataka', billing_address: 'MG Road, Bengaluru', shipping_address: 'Whitefield, Bengaluru' });
    const N = await api('POST', '/customers', { name: `No Address Co ${stamp}`, state: 'Telangana', shipping_state: 'Telangana' });
    const lines = [{ description: 'MS fire door', hsn: '7308', quantity: 2, uom: 'nos', rate: 18500 }, { description: 'Site installation', hsn: '', quantity: 1, uom: 'job', rate: 12000 }];
    const issued = await api('POST', '/sales-invoices', { customerId: L.id, gstRate: 18, discount: 1000, items: lines });
    await api('PATCH', `/sales-invoices/${issued.id}/status`, { status: 'Sent' });
    const draft = await api('POST', '/sales-invoices', { customerId: K.id, gstRate: 18, items: lines });
    const noAddr = await api('POST', '/sales-invoices', { customerId: N.id, gstRate: 18, items: lines });

    section('Reverse charge (server)');
    const rcm = await api('POST', '/sales-invoices', { customerId: L.id, gstRate: 18, reverseCharge: true, items: [{ description: 'Labour job work', hsn: '9988', quantity: 1, uom: 'job', rate: 10000 }] });
    const rcmRow = await q1('SELECT net_amount, cgst, sgst, reverse_charge FROM sales_invoices WHERE id = $1', [rcm.id]);
    ok(rcmRow && Number(rcmRow.cgst) === 900 && Number(rcmRow.net_amount) === 10000,
      `the GST is worked out (CGST ${rcmRow?.cgst}) but not added to what the customer pays (${rcmRow?.net_amount})`);
    await api('PATCH', `/sales-invoices/${rcm.id}`, { items: [{ description: 'Labour job work', hsn: '9988', quantity: 2, uom: 'job', rate: 10000 }] });
    ok(Number((await q1('SELECT net_amount FROM sales_invoices WHERE id = $1', [rcm.id])).net_amount) === 20000, 'and stays off it when the draft is edited');
    const plain = await api('POST', '/sales-invoices', { customerId: L.id, gstRate: 18, items: [{ description: 'Labour job work', hsn: '9988', quantity: 1, uom: 'job', rate: 10000 }] });
    ok(Number((await q1('SELECT net_amount FROM sales_invoices WHERE id = $1', [plain.id])).net_amount) === 11800, 'an ordinary invoice still adds it (11,800)');

    section('Challan values the goods at the agreed rate (server)');
    const ord = await api('POST', '/customer-orders', { customerId: K.id, items: [{ description: 'Grill', hsn: '7308', quantity: 45, uom: 'nos', rate: 1000, targetPrice: 1200 }] });
    const pf = await api('GET', `/delivery-challans/prefill/${ord.id}`);
    ok(Number(pf.items?.[0]?.rate) === 1000, `the order's agreed 1,000, not its target 1,200 (${pf.items?.[0]?.rate})`);
    const dc = await api('POST', '/delivery-challans', { customerId: K.id, customerOrderId: ord.id, challanDate: today, items: pf.items });

    section('Purchase order and vendor bill (server)');
    const vend = await api('POST', '/vendors', { name: `Plain Steel ${stamp}`, type: 'Supplier' });
    const po = await api('POST', '/po', { vendorId: vend.id, itemName: 'Wire', quantity: 3, unitPrice: 33.333, gstRate: 18,
      items: [{ description: 'Binding wire', quantity: 3, unitPrice: 33.333, uom: 'kg' }] });
    const poRow = await q1('SELECT "priceBasis", "pnfInsurance", "loadingScope", warranty FROM purchase_orders WHERE id = $1', [po.id]);
    ok(poRow && !poRow.priceBasis && !poRow.pnfInsurance && !poRow.loadingScope && !poRow.warranty, 'a PO raised without terms stores none (no "Ex Works / Vendor Scope / 12 months" made up)');
    const gv = await api('POST', '/vendors', { name: `Deccan Steel ${stamp}`, type: 'Supplier', gstin: '36PQRSX6789K1Z2', state: 'Telangana', city: 'Hyderabad', address: 'Shed 9, Jeedimetla' });
    const po2 = await api('POST', '/po', { vendorId: gv.id, itemName: 'Plate', quantity: 100, unitPrice: 60, gstRate: 18, items: [{ description: 'MS plate', quantity: 100, unitPrice: 60, uom: 'kg' }] });
    await api('PATCH', `/po/${po2.id}/approve`); await api('PATCH', `/po/${po2.id}/dispatch`);
    const g = await api('POST', '/grn', { poId: po2.id, receivedQuantity: 100 });
    const gid = g.grnId || g.id;
    const bpf = await api('GET', `/grn-bills/prefill/${gid}`);
    const bill = await api('POST', '/grn-bills', { grnId: gid, poId: po2.id, vendorId: gv.id, billDate: today, gstRate: 18, vendorBillRef: 'DST/0451', items: bpf.items });
    await api('POST', `/grn-bills/${bill.id}/payment`, { amount: 2000, mode: 'Bank', reference: 'UTR-9', paidDate: today });
    const vnote = await api('POST', '/credit-debit-notes', { noteType: 'debit', partyType: 'vendor', partyId: gv.id, refId: bill.id, noteDate: today,
      reason: 'Short supply', gstRate: 18, items: [{ description: 'MS plate', quantity: 5, rate: 60 }] });
    const vn = await q1('SELECT ref_number FROM credit_debit_notes WHERE id = $1', [vnote.id || vnote.note?.id]);
    ok(vn?.ref_number === 'DST/0451', `a note to the vendor names their invoice, not our bill number (${vn?.ref_number})`);
    const cnote = await api('POST', '/credit-debit-notes', { noteType: 'credit', partyType: 'customer', partyId: L.id, refId: issued.id, noteDate: today,
      reason: 'One door returned', gstRate: 18, items: [{ description: 'MS fire door', quantity: 1, rate: 18500 }] });
    const qt = await api('POST', '/sales-quotations', { customerId: L.id, gstRate: 18, paymentTermsDays: 30, payment_terms_days: 30, items: lines });
    await api('PATCH', `/sales-quotations/${qt.id}`, { payment_terms_days: 30 });

    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    const cdp = await page.createCDPSession();
    await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: OUT });
    await page.setViewport({ width: 1280, height: 1000 });
    await page.goto(`${UI}/login`);
    await page.evaluate((t, u) => { localStorage.setItem('nexus_token', t); localStorage.setItem('nexus_user', JSON.stringify(u)); localStorage.setItem('tutorial_seen', '1'); localStorage.setItem('nexus-theme', 'light'); }, reg.token, reg.user);
    const open = async (url) => { await page.emulateMediaType('screen'); await page.goto(UI + url, { waitUntil: 'networkidle2' }); await sleep(900); };
    const screenText = () => page.evaluate(() => document.body.innerText);
    /* What paper shows: the document, with print rules applied. */
    const printed = async () => { await page.emulateMediaType('print'); await sleep(200); const t = await page.evaluate(() => (document.querySelector('.invoice-mock, .doc-sheet') || document.body).innerText); await page.emulateMediaType('screen'); return t; };
    const downloadPdf = async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        const before = new Set(fs.readdirSync(OUT));
        const clicked = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Download PDF|^\s*PDF\s*$/.test(x.textContent)); if (b) b.click(); return !!b; });
        if (!clicked) return null;
        for (let i = 0; i < 80; i++) { await sleep(250); const f = fs.readdirSync(OUT).find(x => !before.has(x) && x.endsWith('.pdf')); if (f) { await sleep(300); return pdfText(path.join(OUT, f)); } }
      }
      return null;
    };

    section('Tax invoice, issued');
    await open(`/sales-invoices/${issued.id}`);
    let p = await printed();
    ok(/ORIGINAL FOR RECIPIENT/.test(p), 'printed "ORIGINAL FOR RECIPIENT"');
    ok(/TAXABLE VALUE/.test(p) && /SUB-TOTAL/.test(p) && /DISCOUNT/.test(p), 'sub-total, discount, then the taxable value');
    ok(/HSN\/SAC/.test(p), 'the column says HSN/SAC');
    ok(/State Code:\s*36/.test(p) && /CIN:\s*U28100TG2020PTC123456/.test(p), "the supplier's state code and CIN are in the letterhead");
    ok(/Declaration:/.test(p), 'the declaration is there');
    ok(!/Status:/.test(p), 'no "Status" on paper');
    ok(/Status:/.test(await screenText()), '(it stays on screen)');
    ok(/HSN\/SAC code on line 2/.test(await screenText()), 'the screen warns that line 2 has no HSN/SAC code');
    await page.select('[data-copy-picker]', 'DUPLICATE FOR TRANSPORTER');
    ok(/DUPLICATE FOR TRANSPORTER/.test(await printed()), 'choosing the transporter copy prints "DUPLICATE FOR TRANSPORTER"');
    ok(!/Which copy|Copy\s*Original/i.test(await printed()), 'the copy picker itself never prints');
    await page.select('[data-copy-picker]', 'ORIGINAL FOR RECIPIENT');
    const ipdf = await downloadPdf();
    ok(!!ipdf, 'the PDF downloads');
    if (ipdf) {
      const f = flat(ipdf);
      ok(f.includes(flat('ORIGINAL FOR RECIPIENT')) && f.includes(flat('TAXABLE VALUE')) && f.includes(flat('HSN/SAC')), 'PDF: copy label, taxable value, HSN/SAC');
      ok(f.includes(flat('State Code: 36')) && f.includes(flat('CIN: U28100TG2020PTC123456')) && f.includes('declaration'), 'PDF: state code, CIN, declaration');
      ok(!f.includes('status:'), 'PDF: no status');
    }

    section('Tax invoice, draft');
    await open(`/sales-invoices/${draft.id}`);
    p = await printed();
    ok(/Draft Invoice/i.test(p) && /NOT A VALID TAX INVOICE UNTIL ISSUED/.test(p), 'a draft prints as "Draft invoice — not a valid tax invoice until issued"');
    ok(!/ORIGINAL FOR RECIPIENT/.test(p) && !/Declaration:/.test(p), 'with no copy label and no declaration');
    const dpdf = await downloadPdf();
    ok(dpdf && flat(dpdf).includes(flat('NOT A VALID TAX INVOICE')), 'PDF: says the same');

    section('Screen-only notes stay off paper');
    await open(`/sales-invoices/${noAddr.id}`);
    ok(/Address missing/.test(await screenText()), 'the screen says the address is missing');
    ok(!/Address missing/.test(await printed()), 'the paper does not');

    section('Reverse charge on the page');
    await open(`/sales-invoices/${rcm.id}`);
    p = await printed();
    ok(/Reverse Charge:\s*Yes/.test(p) && /LESS: GST ON REVERSE CHARGE/.test(p), 'the GST is shown, then taken off: "LESS: GST ON REVERSE CHARGE"');
    ok(/INVOICE TOTAL\s*20,000\.00/.test(p), 'and the total is the taxable value (20,000.00)');

    section('Quotation without a validity date');
    await open(`/sales-quotations/${qt.id}`);
    p = await printed();
    ok(!/not set/.test(p) && !/Valid until/.test(p), 'no "Valid until: not set" on paper');
    ok(!/validity date shown above/.test(p), 'and the notice no longer points at a date that is not there');
    ok(/Payment:\s*30 days from invoice/.test(p), 'payment terms are printed');
    ok(/HSN\/SAC/.test(p), 'HSN/SAC');
    const qpdf = await downloadPdf();
    ok(qpdf && !flat(qpdf).includes('notset') && flat(qpdf).includes(flat('30 days from invoice')), 'PDF: no "not set", payment terms there');

    section('Delivery challan');
    await open(`/delivery-challans/${dc.id}`);
    p = await printed();
    ok(/ORIGINAL FOR CONSIGNEE/.test(p), 'printed "ORIGINAL FOR CONSIGNEE"');
    ok((p.match(/29AAACB1234C1Z5/g) || []).length >= 2, "the consignee's GSTIN is on the ship-to as well as the bill-to");
    ok(/Karnataka \(29\)/.test(p), 'place of supply with its state code');
    ok(!/Status:/.test(p), 'no status on paper');
    ok(/45,000\.00/.test(p) && /e-way bill applies/.test(p), 'goods worth 45,000 before tax (53,100 with GST) are flagged for an e-way bill — they were not before');

    section('Credit and debit notes');
    await open(`/credit-debit-notes/${cnote.id || cnote.note?.id}`);
    p = await printed();
    ok(/Taxable value/.test(p) && /In words:/.test(p) && /Section 34\(1\)/.test(p) && !/Status:/.test(p), 'customer credit note: taxable value, words, Section 34(1), no status');
    await open(`/credit-debit-notes/${vnote.id || vnote.note?.id}`);
    p = await printed();
    ok(/DST\/0451/.test(p) && /Issued to the supplier/.test(p) && !/Section 34\(3\)/.test(p), "vendor debit note: names the vendor's invoice, no Section 34 claim");

    section('Purchase order');
    await open(`/po/${po.id}`);
    p = await printed();
    ok(!/Site Address \/ Store|As per Project Specs/.test(p), 'no placeholder ship-to words');
    ok(/Ship To\s*Format Fab Works Pvt Ltd/i.test(p), 'ships to our own works when there is no project');
    ok(!/Client:|Contact:|Net 30 Days|Ex Works|Vendor Scope|Buyer Scope/.test(p), 'no empty "Client:"/"Contact:" and no terms nobody chose');
    ok(!/Status:/.test(p), 'no status on paper');
    ok(/100\.00/.test(p) && !/99\.999/.test(p), 'a line of 3 × 33.333 reads 100.00, in paise');
    ok(/no GSTIN on file/.test(await screenText()) && !/no GSTIN on file/.test(p), 'the "no GSTIN on file" note is on screen only');

    section('Vendor bill');
    await open(`/grn-bills/${bill.id}`);
    p = await printed();
    ok(/Vendor's Invoice No\.:\s*DST\/0451/.test(p), "the vendor's own invoice number, up front");
    ok(/Shed 9, Jeedimetla/.test(p) && /Hyderabad, Telangana/.test(p), "the vendor's address and state");
    ok(/AMOUNT PAID/.test(p) && /BALANCE/.test(p), 'what has been paid, and the balance');
    ok(!/Status:/.test(p) && !/Generated by Maks Ops/.test(p), 'no status, and our own footer');

    section('Clean run');
    ok(errs.length === 0, errs.length ? `page errors: ${errs.slice(0, 3).join(' | ')}` : 'no page errors');
  } catch (e) {
    ok(false, `crashed: ${e.stack || e.message}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    const n = await cleanup().catch((e) => { console.log(`   ❌ cleanup failed: ${e.message}`); return -1; });
    try { fs.rmSync(OUT, { recursive: true, force: true }); } catch { /* temp */ }
    console.log(`\n  ${pass} passed, ${fail} failed · cleaned up ${n} throwaway accounts`);
    process.exit(fail ? 1 : 0);
  }
})();
