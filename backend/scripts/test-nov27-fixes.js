#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   The 27 Nov 2026 bug hunt, as checks (BUG_HUNT_2026-11-27.md).

   Money: credit notes count in what an invoice owes (payment limit, Paid
   status); a note only against a live invoice, and a sent one is kept;
   vendor debit notes count in what is owed to the vendor; a payment must
   be a number. Blanks are not 500s. RA bills: one bill per work order at a
   time, numbered past the highest, and a billed measurement holds. The
   expenses total covers every row. Access: files on a record take that
   record's permission; an invite dies with a switch-off.

   Throwaway accounts on a local server only; removed at the end.
     API_BASE=http://localhost:5097 node scripts/test-nov27-fixes.js
   ══════════════════════════════════════════════════════════════════════ */
const path = require('path');
require(path.join(__dirname, '..', 'node_modules', 'dotenv')).config({ path: path.join(__dirname, '..', '.env') });
const { purge } = require('./lib/testAccounts');
const API = process.env.API_BASE || 'http://localhost:5099';
if (/^https:|onrender.com|vercel.app|maksops.co.in/.test(API)) { console.error('refusing to run against a deployed host'); process.exit(1); }
const stamp = Date.now().toString(36);
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };
const as = (token) => async (m, p, b, raw) => {
  const r = await fetch(API + p, { method: m, headers: { ...(raw ? {} : { 'Content-Type': 'application/json' }), Authorization: `Bearer ${token}` }, body: raw || (b ? JSON.stringify(b) : undefined) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const register = async (prefix) => (await (await fetch(API + '/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: prefix, email: `${prefix}-${stamp}@example.test`, password: 'testpassword123' }) })).json());
const login = async (email) => (await (await fetch(API + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'testpassword123' }) })).json()).token;

async function moneyChecks(ids) {
  console.log('\n  ── money, numbering, blanks');
  const reg = await register('nov27m'); ids.push(reg.user?.id);
  const call = as(reg.token);
      await call('PUT', '/company-profile', { name: 'Bugfix Works', address: 'Plot 1, Hyderabad, Telangana 500043', gstin: '36ABCDE1234F1Z9', stateCode: '36', setup_completed_at: new Date().toISOString() });
      const c = (await call('POST', '/customers', { name: 'Cust', gstin: '36PQRSX6789K1Z2', state: 'Telangana', billing_address: 'Hyd' })).body;

      /* ── M1/M5: credit notes in what an invoice owes ── */
      const inv = (await call('POST', '/sales-invoices', { customerId: c.id, gstRate: 18, items: [{ description: 'Door', hsn: '7308', quantity: 1, rate: 10000 }] })).body;
      const draftNote = await call('POST', '/credit-debit-notes', { noteType: 'credit', partyType: 'customer', partyId: c.id, refId: inv.id, reason: 'x', items: [{ description: 'Door', quantity: 1, rate: 100 }] });
      ok(draftNote.status === 409, `M2: a credit note against a DRAFT invoice is refused (${draftNote.status} ${draftNote.body.error || ''})`);
      await call('PATCH', `/sales-invoices/${inv.id}/status`, { status: 'Sent' });
      const cn = await call('POST', '/credit-debit-notes', { noteType: 'credit', partyType: 'customer', partyId: c.id, refId: inv.id, reason: 'Rate', items: [{ description: 'Door', quantity: 1, rate: 1000 }] });
      ok(cn.status === 200 && Number(cn.body.total) === 1180, `a ₹1,180 credit note is raised against it (${cn.status}, ₹${cn.body.total})`);
      const nan = await call('POST', `/sales-invoices/${inv.id}/payment`, { amount: 'abc' });
      ok(nan.status === 400, `M5: a payment of "abc" is refused (${nan.status})`);
      const over = await call('POST', `/sales-invoices/${inv.id}/payment`, { amount: 11800 });
      ok(over.status === 409 && Math.abs(Number(over.body.outstanding) - 10620) < 0.01, `M1: paying the full ₹11,800 is refused — ₹10,620 is owed after the note (${over.status}, outstanding ${over.body.outstanding})`);
      const pay = await call('POST', `/sales-invoices/${inv.id}/payment`, { amount: 10620 });
      ok(pay.status === 200 && pay.body.status === 'Paid', `M1: paying ₹10,620 settles it — status ${pay.body.status}`);
      const more = await call('POST', `/sales-invoices/${inv.id}/payment`, { amount: 1180, confirmDuplicate: true });
      ok(more.status === 409, `M1: a further ₹1,180 is refused (${more.status})`);
      const got = (await call('GET', `/sales-invoices/${inv.id}`)).body;
      ok(Math.abs(Number(got.credited) - 1180) < 0.01, `the invoice says ₹${got.credited} credited`);
      const sentNote = await call('PATCH', `/credit-debit-notes/${cn.body.id}`, { status: 'Sent' });
      const delSent = await call('DELETE', `/credit-debit-notes/${cn.body.id}`);
      ok(sentNote.status === 200 && delSent.status === 409, `M2: a SENT credit note can't be deleted (${delSent.status})`);

      /* an unpaid invoice with a note can't be cancelled or sent back to draft */
      const inv2 = (await call('POST', '/sales-invoices', { customerId: c.id, gstRate: 18, items: [{ description: 'Frame', hsn: '7308', quantity: 2, rate: 500 }] })).body;
      await call('PATCH', `/sales-invoices/${inv2.id}/status`, { status: 'Sent' });
      const n2 = await call('POST', '/credit-debit-notes', { noteType: 'credit', partyType: 'customer', partyId: c.id, refId: inv2.id, reason: 'x', items: [{ description: 'Frame', quantity: 1, rate: 100 }] });
      const cancel = await call('PATCH', `/sales-invoices/${inv2.id}/status`, { status: 'Cancelled' });
      const toDraft = await call('PATCH', `/sales-invoices/${inv2.id}/status`, { status: 'Draft' });
      ok(n2.status === 200 && cancel.status === 409 && toDraft.status === 409, `M2: with a credit note on it, cancel (${cancel.status}) and back-to-draft (${toDraft.status}) are refused`);
      const delNote = await call('DELETE', `/credit-debit-notes/${n2.body.id}`);
      const cancel2 = await call('PATCH', `/sales-invoices/${inv2.id}/status`, { status: 'Cancelled' });
      ok(delNote.status === 200 && cancel2.status === 200, `M2: an unsent note can be deleted (${delNote.status}), then the invoice cancelled (${cancel2.status})`);
      const lateNote = await call('POST', '/credit-debit-notes', { noteType: 'credit', partyType: 'customer', partyId: c.id, refId: inv2.id, reason: 'x', items: [{ description: 'Frame', quantity: 1, rate: 100 }] });
      ok(lateNote.status === 409, `M2: a note against a CANCELLED invoice is refused (${lateNote.status})`);

      /* ── M4: vendor debit notes ── */
      const proj = (await call('POST', '/projects', { name: `P ${stamp}`, clientName: 'C', type: 'Infrastructure' })).body;
      const v = (await call('POST', '/vendors', { name: `V ${stamp}`, type: 'Supplier', gstin: '36AAACD9999K1Z2' })).body;
      const bill = (await call('POST', '/grn-bills', { vendorId: v.id, projectId: proj.id, vendorBillRef: 'VB-1', items: [{ description: 'Steel', quantity: 1, rate: 100000 }], gstRate: 18 })).body;
      await call('PATCH', `/grn-bills/${bill.id}/status`, { status: 'Approved' });
      const dn = await call('POST', '/credit-debit-notes', { noteType: 'debit', partyType: 'vendor', partyId: v.id, refId: bill.id, reason: 'Return', items: [{ description: 'Steel', quantity: 1, rate: 10000 }] });
      ok(dn.status === 200 && Number(dn.body.total) === 11800, `a ₹11,800 debit note against the ₹1,18,000 bill (${dn.status})`);
      const payables = (await call('GET', '/payables')).body;
      const row = (payables.bills || payables.rows || []).find(b => Number(b.id) === Number(bill.id));
      ok(row && Math.abs(Number(row.outstanding) - 106200) < 0.01, `M4: Payables says ₹${row && row.outstanding} owed (₹1,06,200)`);
      const vover = await call('POST', `/grn-bills/${bill.id}/payment`, { amount: 118000 });
      ok(vover.status === 409, `M4: paying the full ₹1,18,000 is refused (${vover.status})`);
      const vpay = await call('POST', `/grn-bills/${bill.id}/payment`, { amount: 106200 });
      ok(vpay.status === 200 && vpay.body.paymentStatus === 'Paid', `M4: paying ₹1,06,200 settles the bill — ${vpay.body.paymentStatus}`);

      /* ── E1/E2: blanks are not 500s ── */
      const q = await call('POST', '/sales-quotations', { customerId: c.id, gstRate: '', items: [{ description: 'Gate', quantity: 1, rate: 100 }] });
      ok(q.status === 200, `E1: a quotation with the GST box cleared saves (${q.status} ${q.body.error || ''})`);
      const o = await call('POST', '/customer-orders', { customerId: c.id, items: [{ description: 'Gate', quantity: 2, rate: '', targetPrice: '' }] });
      ok(o.status === 200, `E2: an order line with no price saves (${o.status} ${o.body.error || ''})`);

      /* ── D1/D2/D3: RA bills ── */
      const boq = [];
      for (let i = 0; i < 2; i++) boq.push((await call('POST', '/boq', { projectId: proj.id, itemCode: `B${i}`, description: `Item ${i}`, unit: 'cum', estimatedQuantity: 1000, rate: 100 })).body.id);
      const wo = (await call('POST', '/work-orders', { projectId: proj.id, vendorId: v.id, name: 'WO', boqId: boq[0], contractValue: 100000 })).body;
      const mbIds = [];
      for (const b of boq) mbIds.push((await call('POST', '/mb', { projectId: proj.id, workOrderId: wo.id, boqId: b, measuredQuantity: 50 })).body.id);
      const [g1, g2] = await Promise.all([
        call('POST', '/bills/generate', { projectId: proj.id, workOrderId: wo.id }),
        call('POST', '/bills/generate', { projectId: proj.id, workOrderId: wo.id }),
      ]);
      const made = [g1, g2].filter(g => g.status === 200);
      ok(made.length === 1, `D1: two clicks at once make one RA bill (${g1.status}, ${g2.status})`);
      const mbDel = await call('DELETE', `/mb/${mbIds[0]}`);
      ok(mbDel.status === 409, `D3: deleting a billed measurement is refused (${mbDel.status})`);
      const mbShrink = await call('PATCH', `/mb/${mbIds[0]}`, { measuredQuantity: 10 });
      ok(mbShrink.status === 409, `D3: shrinking a billed measurement is refused (${mbShrink.status})`);
      const mbGrow = await call('PATCH', `/mb/${mbIds[0]}`, { measuredQuantity: 60, workOrderId: wo.id });
      ok(mbGrow.status === 200, `D3: raising it is fine (${mbGrow.status} ${mbGrow.body.error || ''})`);
      const g3 = await call('POST', '/bills/generate', { projectId: proj.id, workOrderId: wo.id });
      ok(g3.status === 200 && Number(g3.body.raNumber) === 2, `D2: the next RA bill is RA 2 and bills the extra 10 (${g3.status}, RA ${g3.body.raNumber})`);

      /* ── M6: expenses total over every row ── */
      for (let i = 0; i < 3; i++) await call('POST', '/expenses', { category: 'Misc', description: `E${i}`, amount: 100, expense_date: '2026-11-27' });
      const ex = (await call('GET', '/expenses?limit=1')).body;
      ok(ex.summary && Number(ex.summary.amount) === 300, `M6: the expenses total covers every row, not the page (₹${ex.summary && ex.summary.amount} over ${ex.total} rows, 1 on the page)`);

}

async function accessChecks(ids) {
  console.log('\n  ── access');
  const reg = await register('nov27a'); ids.push(reg.user?.id);
  const owner = as(reg.token);
      await owner('PUT', '/company-profile', { name: 'Access Works', address: 'Hyderabad', gstin: '36ABCDE1234F1Z9', stateCode: '36', setup_completed_at: new Date().toISOString() });
      const c = (await owner('POST', '/customers', { name: 'Cust', gstin: '36PQRSX6789K1Z2', state: 'Telangana', billing_address: 'Hyd' })).body;
      const v = (await owner('POST', '/vendors', { name: `V ${stamp}`, type: 'Supplier', gstin: '36AAACD9999K1Z2' })).body;
      const bill = (await owner('POST', '/grn-bills', { vendorId: v.id, vendorBillRef: 'VB', items: [{ description: 'Steel', quantity: 1, rate: 100 }], gstRate: 18 })).body;
      /* a file on a customer and one on a vendor bill */
      const up = async (entityType, entityId) => {
        const fd = new FormData();
        fd.append('file', new Blob([Buffer.from('%PDF-1.4\n%test\n')], { type: 'application/pdf' }), 'scan.pdf');
        fd.append('entityType', entityType); fd.append('entityId', String(entityId));
        return owner('POST', '/attachments', null, fd);
      };
      const aCust = await up('customer', c.id);
      const aBill = await up('grn_bill', bill.id);
      ok(aCust.status === 200 && aBill.status === 200, `the owner attaches files (${aCust.status}, ${aBill.status})`);

      /* members */
      const mk = async (role) => {
        const email = `access-${role.toLowerCase()}-${stamp}@example.test`;
        const r = await owner('POST', '/admin/users', { name: role, email, password: 'testpassword123', role });
        if (r.body.user) ids.push(r.body.user.id);
        return as(await login(email));
      };
      const viewer = await mk('Viewer');
      const production = await mk('Production');

      const vList = await viewer('GET', `/attachments?entityType=customer&entityId=${c.id}`);
      ok(vList.status === 200, `A1: a Viewer can still read the files on a customer (${vList.status})`);
      const vDel = await viewer('DELETE', `/attachments/${aCust.body.id}`);
      ok(vDel.status === 403, `A1: a Viewer can no longer delete a file (${vDel.status})`);
      const pList = await production('GET', `/attachments?entityType=grn_bill&entityId=${bill.id}`);
      const pDl = await production('GET', `/attachments/${aBill.body.id}/download`);
      ok(pList.status === 403 && pDl.status === 403, `A1: Production can't list (${pList.status}) or download (${pDl.status}) vendor-bill files`);
      const still = await owner('GET', `/attachments?entityType=customer&entityId=${c.id}`);
      ok(still.status === 200 && still.body.length === 1, 'and the file is still there');


      /* A2: an invite cancelled by switch-off */
      const invEmail = `access-invitee-${stamp}@example.test`;
      const invited = await owner('POST', '/admin/users', { name: 'Invitee', email: invEmail, role: 'Viewer' });
      if (invited.body.user) ids.push(invited.body.user.id);
      const tok = invited.body.invite && invited.body.invite.token;
      const before = await fetch(`${API}/auth/invite/${tok}`);
      ok(!!tok && before.status === 200, `A2: the invite link works while they are active (${before.status})`);
      const off = await owner('PATCH', `/admin/users/${invited.body.user.id}/active`, { isActive: false });
      const after = await fetch(`${API}/auth/invite/${tok}`);
      const accept = await fetch(`${API}/auth/accept-invite`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: tok, password: 'testpassword123' }) });
      ok(off.status === 200 && after.status === 404 && accept.status === 404, `A2: after switch-off the link is dead (info ${after.status}, accept ${accept.status})`);
      const on = await owner('PATCH', `/admin/users/${invited.body.user.id}/active`, { isActive: true });
      const revived = await fetch(`${API}/auth/invite/${tok}`);
      ok(on.status === 200 && revived.status === 404, `A2: switching them back on does not revive the old link (${revived.status})`);

}

(async () => {
  const ids = [];
  try { await moneyChecks(ids); } catch (e) { fail++; console.log('   ❌ money checks crashed:', e.message); }
  try { await accessChecks(ids); } catch (e) { fail++; console.log('   ❌ access checks crashed:', e.message); }
  finally {
    await purge(ids.filter(Boolean)).catch(e => console.log('purge', e.message));
    console.log(`\n   ${pass} passed, ${fail} failed\n`);
    process.exit(fail ? 1 : 0);
  }
})();
