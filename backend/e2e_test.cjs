/* ════════════════════════════════════════════════════════════
   Nexus-OP — Deep End-to-End lifecycle test
   Drives the FULL flow against the running backend (:5000) and
   asserts correctness at every step, then cleans up its own data.

   Run:  node e2e_test.cjs   (backend must be running on PORT 5000)
   ════════════════════════════════════════════════════════════ */
require('dotenv').config();
const http = require('http');
const { Pool } = require('pg');

const PORT = process.env.PORT || 5000;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

function req(method, path, body) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = { host: 'localhost', port: PORT, path, method, headers: { 'Content-Type': 'application/json' } };
    if (data) opts.headers['Content-Length'] = Buffer.byteLength(data);
    const r = http.request(opts, (x) => {
      let s = '';
      x.on('data', (c) => (s += c));
      x.on('end', () => { let j; try { j = JSON.parse(s || '{}'); } catch { j = s; } resolve({ status: x.statusCode, body: j }); });
    });
    r.on('error', (e) => resolve({ status: 0, body: { error: e.message } }));
    if (data) r.write(data);
    r.end();
  });
}

let pass = 0, fail = 0; const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log('   \x1b[32m✓\x1b[0m ' + name); }
  else { fail++; failures.push(name + (detail ? ` — ${detail}` : '')); console.log('   \x1b[31m✗\x1b[0m ' + name + (detail ? ` \x1b[2m(${detail})\x1b[0m` : '')); }
}
const section = (t) => console.log(`\n\x1b[1m\x1b[36m▸ ${t}\x1b[0m`);
const approx = (a, b, e = 0.5) => Math.abs(a - b) <= e;

(async () => {
  const ids = {};
  console.log('\n\x1b[1m═══ Nexus-OP DEEP E2E LIFECYCLE TEST ═══\x1b[0m');

  // 0 · Health
  section('0 · Health & environment');
  const h = await req('GET', '/health');
  check('backend is up (GET /health → 200)', h.status === 200);

  // 1 · Project
  section('1 · Project');
  let r = await req('POST', '/projects', { name: 'E2E Test Project', clientName: 'E2E Authority', type: 'construction', startDate: '2026-01-01', endDate: '2026-12-31', status: 'Active' });
  ids.project = r.body.id;
  check('create project → returns id', r.status === 200 && ids.project > 0, `status ${r.status}`);

  // 2 · Vendor (GSTIN state 36 → intra-state with company)
  section('2 · Vendor');
  r = await req('POST', '/vendors', { projectId: ids.project, name: 'E2E Contractor Pvt Ltd', type: 'Civil', pan: 'AAAAA0000A', gstin: '36AAAAA0000A1Z5', class: 'A', rating: 90, status: 'Active', address: 'Hyderabad', contactName: 'Test', contactPhone: '9000000000', contactEmail: 't@e2e.in' });
  ids.vendor = r.body.id;
  check('create vendor (intra-state GSTIN) → returns id', r.status === 200 && ids.vendor > 0, `status ${r.status}`);

  // 3 · BOQ
  section('3 · BOQ item');
  r = await req('POST', '/boq', { projectId: ids.project, itemCode: 'E2E-01', description: 'E2E earthwork', unit: 'Cum', estimatedQuantity: 5000, rate: 100 });
  ids.boq = r.body.id;
  check('create BOQ item (rate ₹100, est 5000) → returns id', r.status === 200 && ids.boq > 0, `status ${r.status}`);

  // 4 · Work Order
  section('4 · Work Order');
  r = await req('POST', '/work-orders', { projectId: ids.project, vendorId: ids.vendor, name: 'E2E WO-Earthworks', boqId: ids.boq, startDate: '2026-02-01', endDate: '2026-10-01', contractValue: 1000000, status: 'In Progress' });
  ids.wo = r.body.id;
  check('create work order → returns id', r.status === 200 && ids.wo > 0, `status ${r.status} ${JSON.stringify(r.body).slice(0,120)}`);

  // 5 · Indent → approve
  section('5 · Indent (raise → approve)');
  r = await req('POST', '/indent', { projectId: ids.project, workOrderId: ids.wo, boqId: ids.boq, requestedQuantity: 2000, requiredDate: '2026-03-01', chainage: 'CH 0+000' });
  ids.indent = r.body.id;
  check('raise indent → returns id', r.status === 200 && ids.indent > 0, `status ${r.status}`);
  r = await req('PUT', `/indent/${ids.indent}/status`, { status: 'Approved' });
  check('approve indent → ok', r.status === 200, `status ${r.status}`);

  // 6 · Purchase Order → items → approve → dispatch
  section('6 · Purchase Order (create → approve → dispatch)');
  r = await req('POST', '/po', { projectId: ids.project, workOrderId: ids.wo, vendorId: ids.vendor, itemName: 'E2E Material', quantity: 100, unitPrice: 500, indentId: ids.indent });
  ids.po = r.body.id;
  check('create PO → returns id', r.status === 200 && ids.po > 0, `status ${r.status} ${JSON.stringify(r.body).slice(0,120)}`);
  r = await req('POST', `/po/${ids.po}/items`, [{ sno: 1, description: 'E2E Material', uom: 'Nos', hsn: '7308', quantity: 100, unitPrice: 500 }]);
  check('add PO line items → ok', r.status === 200 || r.status === 201, `status ${r.status}`);
  r = await req('PATCH', `/po/${ids.po}/approve`);
  check('approve PO (Pending→Approved) → ok', r.status === 200, `status ${r.status}`);
  r = await req('PATCH', `/po/${ids.po}/dispatch`);
  check('dispatch PO (Approved→Dispatched) → ok', r.status === 200, `status ${r.status}`);

  // 7 · GRN → PO delivered + inventory
  section('7 · GRN (goods receipt)');
  r = await req('POST', '/grn', { projectId: ids.project, workOrderId: ids.wo, poId: ids.po, vehicleNumber: 'TS09AB1234', batchNumber: 'B-01', chainage: 'CH 0+000', receivedQuantity: 100 });
  ids.grn = r.body.id;
  check('create GRN → ok', (r.status === 200 || r.status === 201), `status ${r.status} ${JSON.stringify(r.body).slice(0,120)}`);
  r = await req('GET', `/po/${ids.po}`);
  check('PO auto-advanced to Delivered after GRN', r.body && r.body.status === 'Delivered', `status now '${r.body && r.body.status}'`);

  // 8 · Measurement Book (two entries → cumulative 1500)
  section('8 · Measurement Book');
  r = await req('POST', '/mb', { projectId: ids.project, workOrderId: ids.wo, boqId: ids.boq, chainage: 'CH 0+000', length: 100, width: 5, depth: 2, measuredQuantity: 1000 });
  check('record measurement #1 (1000 Cum) → ok', (r.status === 200 || r.status === 201), `status ${r.status}`);
  r = await req('POST', '/mb', { projectId: ids.project, workOrderId: ids.wo, boqId: ids.boq, chainage: 'CH 0+100', length: 100, width: 5, depth: 1, measuredQuantity: 500 });
  check('record measurement #2 (500 Cum) → ok', (r.status === 200 || r.status === 201), `status ${r.status}`);

  // 9 · Generate RA Bill (full flexible deduction stack) + verify ALL math
  section('9 · RA Bill generation + math verification');
  r = await req('POST', '/bills/generate', { projectId: ids.project, workOrderId: ids.wo, gstRate: 18, tdsRate: 2, retentionPct: 5, gstTdsRate: 2, labourCessRate: 1, advanceRecovery: 1000 });
  const bill = r.body;
  ids.bill = bill.billId;
  check('generate RA bill → returns billId + number', r.status === 200 && bill.billId > 0 && /^RA-\d+/.test(bill.billNumber || ''), `status ${r.status}`);
  check('  line items captured (1 BOQ line)', bill.lineCount === 1, `lineCount ${bill.lineCount}`);
  check('  taxable value = 1500 × ₹100 = ₹150,000', approx(bill.subTotal, 150000), `got ${bill.subTotal}`);
  check('  intra-state → CGST=SGST=₹13,500, IGST=0', approx(bill.cgst, 13500) && approx(bill.sgst, 13500) && approx(bill.igst, 0), `cgst ${bill.cgst} sgst ${bill.sgst} igst ${bill.igst}`);
  check('  GST total = 18% = ₹27,000', approx(bill.gstTotal, 27000), `got ${bill.gstTotal}`);
  check('  TDS 2% = ₹3,000', approx(bill.tds, 3000), `got ${bill.tds}`);
  check('  GST-TDS 2% = ₹3,000 (optional head)', approx(bill.gstTds, 3000), `got ${bill.gstTds}`);
  check('  Labour cess 1% = ₹1,500 (optional head)', approx(bill.labourCess, 1500), `got ${bill.labourCess}`);
  check('  Retention 5% = ₹7,500', approx(bill.retention, 7500), `got ${bill.retention}`);
  check('  Advance recovery = ₹1,000', approx(bill.advanceRecovery, 1000), `got ${bill.advanceRecovery}`);
  const expectedNet = 150000 + 27000 - 3000 - 3000 - 1500 - 7500 - 1000; // 161000
  check('  NET PAYABLE = ₹161,000 (full computation)', approx(bill.netAmount, expectedNet), `got ${bill.netAmount}, expected ${expectedNet}`);
  check('  amount-in-words present', typeof bill.amountInWords === 'string' && bill.amountInWords.includes('Rupees'), bill.amountInWords);

  // overbilling guard
  r = await req('POST', '/bills/generate', { projectId: ids.project, workOrderId: ids.wo });
  check('overbilling guard: re-generate finds nothing new → 400', r.status === 400, `status ${r.status}`);

  // 10 · Bill detail endpoint
  section('10 · Bill detail (GET /bills/:id)');
  r = await req('GET', `/bills/${ids.bill}`);
  check('fetch bill detail → 200 with lineItems', r.status === 200 && Array.isArray(r.body.lineItems) && r.body.lineItems.length === 1, `status ${r.status}`);
  check('  detail net matches generate net', approx(r.body.netAmount, expectedNet), `got ${r.body.netAmount}`);

  // 11 · Status lifecycle with guards
  section('11 · Bill lifecycle (guarded transitions)');
  r = await req('PATCH', `/bills/${ids.bill}/pay`);
  check('illegal: pay while Draft → 409', r.status === 409, `status ${r.status}`);
  r = await req('PATCH', `/bills/${ids.bill}/submit`);
  check('submit (Draft→Under Review) → ok', r.status === 200 && r.body.status === 'Under Review', `status ${r.status}`);
  r = await req('PATCH', `/bills/${ids.bill}/pay`);
  check('illegal: pay while Under Review → 409', r.status === 409, `status ${r.status}`);
  r = await req('PATCH', `/bills/${ids.bill}/approve`);
  check('approve (Under Review→Approved) → ok', r.status === 200 && r.body.status === 'Approved', `status ${r.status}`);
  r = await req('PATCH', `/bills/${ids.bill}/pay`);
  check('pay (Approved→Paid) → ok', r.status === 200 && r.body.status === 'Paid', `status ${r.status}`);

  // 12 · Dashboard reflects the bill
  section('12 · Dashboard aggregation');
  r = await req('GET', `/dashboard?projectId=${ids.project}`);
  check('dashboard totalBilled includes taxable ₹150,000', r.status === 200 && r.body.totalBilled >= 150000, `totalBilled ${r.body && r.body.totalBilled}`);
  check('dashboard netPaid includes net ₹161,000', r.body && r.body.netPaid >= 161000, `netPaid ${r.body && r.body.netPaid}`);

  // 13 · Edit (PATCH) works
  section('13 · Edit / update');
  r = await req('PATCH', `/boq/${ids.boq}`, { rate: 120 });
  check('PATCH BOQ rate → 200 and value changed', r.status === 200 && approx(r.body.rate, 120), `status ${r.status} rate ${r.body && r.body.rate}`);

  // 14 · Delete guards
  section('14 · Delete guards');
  r = await req('DELETE', `/bills/${ids.bill}`);
  check('cannot delete a Paid bill → 409', r.status === 409, `status ${r.status}`);
  r = await req('DELETE', `/boq/99999999`);
  check('delete non-existent → 404', r.status === 404, `status ${r.status}`);

  // ── Cleanup (direct DB; isolated test project) ──
  section('🧹 Cleanup (remove test data)');
  try {
    await pool.query('DELETE FROM bills WHERE "projectId" = $1', [ids.project]); // cascades bill_line_items
    await pool.query('DELETE FROM purchase_orders WHERE "projectId" = $1', [ids.project]); // cascades po_line_items
    await pool.query('DELETE FROM grn WHERE "projectId" = $1', [ids.project]);
    await pool.query('DELETE FROM inventory WHERE "projectId" = $1', [ids.project]);
    await pool.query('DELETE FROM measurement_book WHERE "projectId" = $1', [ids.project]);
    await pool.query('DELETE FROM indents WHERE "projectId" = $1', [ids.project]);
    await pool.query('DELETE FROM work_orders WHERE "projectId" = $1', [ids.project]);
    await pool.query('DELETE FROM boq_items WHERE "projectId" = $1', [ids.project]);
    await pool.query('DELETE FROM vendors WHERE "projectId" = $1', [ids.project]);
    await pool.query('DELETE FROM activities WHERE "projectId" = $1', [ids.project]);
    await pool.query('DELETE FROM projects WHERE id = $1', [ids.project]);
    console.log('   \x1b[32m✓\x1b[0m test data removed');
  } catch (e) {
    console.log('   \x1b[33m! cleanup warning:\x1b[0m', e.message);
  }
  await pool.end();

  // ── Report ──
  console.log(`\n\x1b[1m═══ RESULT: ${pass} passed, ${fail} failed ═══\x1b[0m`);
  if (fail) { console.log('\x1b[31mFailures:\x1b[0m'); failures.forEach((f) => console.log('  • ' + f)); }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
