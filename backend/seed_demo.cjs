/* ════════════════════════════════════════════════════════════
   Nexus-OP — Demo seeder (PostgreSQL, via the running API)
   Creates one complete, coherent demo project exercising the
   whole chain: Project → Vendors → BOQ → Work Order → Indent →
   PO (+items) → GRN → Measurements → a Draft RA Bill.

   Replaces the old seed_edge_cases.js / seed_massive.js which
   used the SQLite API (db.run/db.all) and do NOT work on pg.

   Run:  node seed_demo.cjs   (backend must be running on :5000)
   ════════════════════════════════════════════════════════════ */
require('dotenv').config();
const http = require('http');
const PORT = process.env.PORT || 5000;

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = { host: 'localhost', port: PORT, path, method, headers: { 'Content-Type': 'application/json' } };
    if (data) opts.headers['Content-Length'] = Buffer.byteLength(data);
    const r = http.request(opts, (x) => {
      let s = '';
      x.on('data', (c) => (s += c));
      x.on('end', () => { let j; try { j = JSON.parse(s || '{}'); } catch { j = s; } resolve({ status: x.statusCode, body: j }); });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}
const ok = (r, what) => {
  if (r.status >= 400) throw new Error(`${what} failed (${r.status}): ${JSON.stringify(r.body)}`);
  return r.body;
};

(async () => {
  console.log('Seeding demo project via API on :' + PORT + ' …\n');

  const project = ok(await req('POST', '/projects', {
    name: 'Demo · Outer Ring Road Pkg-7', clientName: 'HMDA', type: 'construction',
    startDate: '2026-01-01', endDate: '2027-06-30', status: 'Active',
  }), 'project');
  const pid = project.id;
  console.log('✓ Project #' + pid);

  const vendors = [];
  for (const v of [
    { name: 'Megha Infra Pvt Ltd', gstin: '36AABCM1234N1Z2', pan: 'AABCM1234N', type: 'Civil' },
    { name: 'Suncon Constructions', gstin: '36AAACS5678Q1Z8', pan: 'AAACS5678Q', type: 'Bituminous' },
  ]) {
    vendors.push(ok(await req('POST', '/vendors', { projectId: pid, ...v, class: 'A', rating: 88, status: 'Active', address: 'Hyderabad, Telangana', contactName: 'Site Head', contactPhone: '9000000000', contactEmail: 'site@vendor.in' }), 'vendor'));
  }
  console.log('✓ Vendors: ' + vendors.map((v) => v.id).join(', '));

  const boq = [];
  for (const b of [
    { itemCode: 'EW-01', description: 'Earthwork in excavation for roadway', unit: 'Cum', estimatedQuantity: 50000, rate: 85 },
    { itemCode: 'GSB-01', description: 'Granular Sub-Base laying & compaction', unit: 'Cum', estimatedQuantity: 12000, rate: 1450 },
    { itemCode: 'DBM-01', description: 'Dense Bituminous Macadam', unit: 'Cum', estimatedQuantity: 4000, rate: 8200 },
  ]) {
    boq.push(ok(await req('POST', '/boq', { projectId: pid, ...b }), 'boq'));
  }
  console.log('✓ BOQ items: ' + boq.map((b) => b.id).join(', '));

  const wo = ok(await req('POST', '/work-orders', { projectId: pid, vendorId: vendors[0].id, name: 'WO-01 · Earthworks & GSB', boqId: boq[0].id, startDate: '2026-02-01', endDate: '2026-12-01', contractValue: 60000000, status: 'In Progress' }), 'work order');
  console.log('✓ Work Order #' + wo.id);

  const indent = ok(await req('POST', '/indent', { projectId: pid, workOrderId: wo.id, boqId: boq[1].id, requestedQuantity: 5000, requiredDate: '2026-03-15', chainage: 'CH 0+000 to 2+000' }), 'indent');
  await req('PUT', `/indent/${indent.id}/status`, { status: 'Approved' });
  console.log('✓ Indent #' + indent.id + ' (approved)');

  const po = ok(await req('POST', '/po', { projectId: pid, workOrderId: wo.id, vendorId: vendors[0].id, itemName: 'GSB Aggregate', quantity: 5000, unitPrice: 1200, indentId: indent.id }), 'po');
  await req('POST', `/po/${po.id}/items`, [
    { sno: 1, description: 'GSB Aggregate 53mm', uom: 'Cum', hsn: '2517', quantity: 3000, unitPrice: 1200 },
    { sno: 2, description: 'GSB Aggregate 26mm', uom: 'Cum', hsn: '2517', quantity: 2000, unitPrice: 1150 },
  ]);
  await req('PATCH', `/po/${po.id}/approve`);
  await req('PATCH', `/po/${po.id}/dispatch`);
  console.log('✓ PO #' + po.id + ' (+2 line items, dispatched)');

  await req('POST', '/grn', { projectId: pid, workOrderId: wo.id, poId: po.id, vehicleNumber: 'TS09GH4521', batchNumber: 'GSB-2026-01', chainage: 'CH 0+000', receivedQuantity: 5000 });
  console.log('✓ GRN recorded (PO → Delivered, inventory updated)');

  for (const m of [
    { boqId: boq[0].id, chainage: 'CH 0+000', length: 200, width: 12, depth: 1.5 },
    { boqId: boq[0].id, chainage: 'CH 0+200', length: 200, width: 12, depth: 1.5 },
    { boqId: boq[0].id, chainage: 'CH 0+400', length: 150, width: 12, depth: 1.2 },
  ]) {
    await req('POST', '/mb', { projectId: pid, workOrderId: wo.id, ...m, measuredQuantity: m.length * m.width * m.depth });
  }
  console.log('✓ 3 Measurement Book entries');

  const bill = ok(await req('POST', '/bills/generate', { projectId: pid, workOrderId: wo.id, gstRate: 18, tdsRate: 2, retentionPct: 5 }), 'bill');
  console.log('✓ Draft RA Bill ' + bill.billNumber + ' — net ₹' + Number(bill.netAmount).toLocaleString('en-IN'));

  console.log('\n✅ Demo project seeded. Open the app, switch context to "Demo · Outer Ring Road Pkg-7".');
})().catch((e) => { console.error('\n✖ Seed failed:', e.message); process.exit(1); });
