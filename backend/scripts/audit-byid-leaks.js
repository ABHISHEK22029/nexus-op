#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   Can one company read another company's records by naming the id?

   A scoped list is not a protected record. Ids here are small integers —
   PO-0009, invoice 4, attachment 12 — so anyone can simply ask for one.
   Every hole of this kind found so far was found by hand, one at a time:

     · POST /bills/generate took any work order id
     · GET  /attachments/:id/download streamed any company's FILE
     · GET  /attachments?entityType=po&entityId=4858 listed them

   Reading handlers to find the next one does not work; the last sweep
   read /boq, /mb and /indent and walked straight past /po. So build the
   records as org A, then ask for every one of them as org B, and believe
   the server rather than the source.

   A refusal is 403 or 404 — 404 is better, because "not yours" and "does
   not exist" should be indistinguishable, but either is a refusal. What
   must never come back is the record.
   ══════════════════════════════════════════════════════════════════════ */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../db');
const { purgeOrg } = require('./lib/purgeOrg');

const API = process.env.API_BASE || 'http://localhost:5099';
if (/^https:|onrender\.com|vercel\.app/.test(API)) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}

const stamp = Date.now().toString(36);
let refused = 0; const leaks = [];

const call = async (path, opts = {}, token) => {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  const txt = await res.text();
  let body; try { body = JSON.parse(txt); } catch { body = { raw: txt.slice(0, 200) }; }
  return { status: res.status, ok: res.ok, body, raw: txt };
};
const post = (p, b, t) => call(p, { method: 'POST', body: JSON.stringify(b) }, t);

(async () => {
  console.log('');
  const mk = async (label) => {
    const r = await post('/auth/register',
      { name: label, email: `${label}-${stamp}@example.test`, password: 'testpassword123' });
    if (!r.ok) { console.error('register failed:', r.body); process.exit(1); }
    await call('/company-profile', {
      method: 'PUT',
      body: JSON.stringify({ name: `${label} ${stamp}`, setup_completed_at: new Date().toISOString() }),
    }, r.body.token);
    return { token: r.body.token, id: r.body.user.id };
  };
  const A = await mk('acme'), B = await mk('rival');

  /* ── org A builds one of everything ─────────────────────── */
  const proj = await post('/projects',
    { name: `Site ${stamp}`, clientName: `Client ${stamp}`, type: 'Fabrication', status: 'Active' }, A.token);
  const vend = await post('/vendors', { name: `Supplier ${stamp}`, type: 'Supplier' }, A.token);
  const cust = await post('/customers', { name: `Buyer ${stamp}`, gstin: '33BBBBB0000B1Z5' }, A.token);
  const po = await post('/po', {
    projectId: proj.body.id, vendorId: vend.body.id,
    itemName: `Plate ${stamp}`, quantity: 20, unitPrice: 500, gstRate: 18,
  }, A.token);
  const inv = await post('/sales-invoices', {
    customerId: cust.body.id, invoiceDate: '2026-09-01', gstRate: 18,
    items: [{ description: 'Door', hsn: '7308', quantity: 2, rate: 1000, uom: 'nos' }],
  }, A.token);
  const quote = await post('/sales-quotations', {
    customerId: cust.body.id, quoteDate: '2026-09-01', gstRate: 18,
    items: [{ description: 'Door', quantity: 2, rate: 1000, uom: 'nos' }],
  }, A.token);
  const wo = await post('/work-orders',
    { projectId: proj.body.id, vendorId: vend.body.id, name: `WO ${stamp}` }, A.token);
  const boq = await post('/boq', {
    projectId: proj.body.id, itemCode: `BQ-${stamp}`, description: `Excavation ${stamp}`,
    unit: 'Cum', estimatedQuantity: 100, rate: 250,
  }, A.token);
  const stockItem = await post('/inventory',
    { itemName: `Plate ${stamp}`, quantity: 50, uom: 'nos' }, A.token);
  const expense = await post('/expenses',
    { category: 'Travel', amount: 1234, expense_date: '2026-09-01', description: `Trip ${stamp}` }, A.token);

  /* An attachment, because its download streams the actual file. The
     upload is multipart, not JSON — posting JSON to it returned 400 and
     the download went untested, which is precisely the endpoint that
     most needed testing. */
  const fd = new FormData();
  fd.append('entityType', 'po');
  fd.append('entityId', String(po.body?.id));
  fd.append('file', new Blob([`confidential ${stamp}`], { type: 'text/plain' }), `secret-${stamp}.txt`);
  const attRes = await fetch(`${API}/attachments`, {
    method: 'POST', headers: { Authorization: `Bearer ${A.token}` }, body: fd,
  });
  const att = { body: await attRes.json().catch(() => ({})) };

  const TARGETS = [
    ['/po/:id', po.body?.id, 'a purchase order'],
    ['/sales-invoices/:id', inv.body?.id, 'a sales invoice'],
    ['/sales-quotations/:id', quote.body?.id, 'a quotation'],
    ['/customers/:id', cust.body?.id, 'a customer'],
    ['/vendors/:id', vend.body?.id, 'a vendor'],
    ['/projects/:id', proj.body?.id, 'a project'],
    ['/work-orders/:id', wo.body?.id, 'a work order'],
    ['/boq/:id', boq.body?.id, 'a BOQ line'],
    /* The create answers { item: {...} }, not the row directly — reading
       .id off the wrapper gave undefined and skipped the check silently. */
    ['/inventory/:id', stockItem.body?.item?.id ?? stockItem.body?.id, 'a stock item'],
    ['/expenses/:id', expense.body?.id, 'an expense'],
    ['/attachments/:id/download', att.body?.id, 'an uploaded FILE'],
  ];

  console.log(`  org A built its records; org B now asks for each by id\n`);

  for (const [pattern, id, label] of TARGETS) {
    if (!id) { console.log(`   ?  ${pattern.padEnd(30)} — org A could not create one, not tested`); continue; }
    const path = pattern.replace(':id', id);
    const r = await call(path, {}, B.token);

    /* A refusal, or a body that does not contain A's data. Some endpoints
       answer 200 with an empty object, which is also fine. */
    const leaked = r.ok && r.raw.includes(stamp);
    if (leaked) leaks.push({ path, label, status: r.status, sample: r.raw.slice(0, 90) });
    else refused++;
  }

  /* The list form too — it takes params, so the fresh-org sweep cannot
     reach it, and it was open. */
  const attList = await call(`/attachments?entityType=po&entityId=${po.body?.id}`, {}, B.token);
  if (attList.ok && attList.raw.includes(stamp)) {
    leaks.push({ path: '/attachments?entityType=po&entityId=…', label: "another company's uploads", status: attList.status, sample: attList.raw.slice(0, 90) });
  } else refused++;

  if (leaks.length) {
    console.log(`  ❌ ${leaks.length} record(s) readable by the wrong company:\n`);
    for (const l of leaks) {
      console.log(`     ${l.path.padEnd(34)} ${l.label}  → ${l.status}`);
      console.log(`        ${l.sample.replace(/\s+/g, ' ')}`);
    }
    console.log('');
  }
  console.log(`  ${refused} refused, ${leaks.length} leaked\n`);

  await purgeOrg(db, [A.id, B.id]);
  await db.query('DELETE FROM users WHERE id = ANY($1)', [[A.id, B.id]]).catch(() => {});
  process.exit(leaks.length ? 1 : 0);
})().catch(e => { console.error('threw:', e.message); process.exit(1); });
