#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   Editing a quotation and an invoice after they exist.

   There was no PATCH for either, so a typo in a rate meant deleting the
   document and raising another — which is how quote numbers end up with
   gaps in them.

   What this checks is not that an edit returns 200, but WHERE the line is
   drawn. A draft is a working document. An issued tax invoice is not: the
   buyer claims input credit against the copy they hold, so the amounts
   stop being editable and a credit note becomes the way to change what is
   owed. The interesting assertions are the refusals.

   Refuses to run against a deployed host, and removes what it creates.
   ══════════════════════════════════════════════════════════════════════ */
const path = require('path');
const { sweepStale } = require('../scripts/lib/testAccounts');

const API = process.env.API_BASE || 'http://localhost:5099';
if (/^https:|onrender\.com|vercel\.app/.test(API)) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}

const stamp = Date.now().toString(36);
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };

const reg = async (label) => {
  const r = await (await fetch(`${API}/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: label, email: `edit-${label}-${stamp}@example.test`, password: 'testpassword123' }),
  })).json();
  if (!r.token) throw new Error('register failed: ' + JSON.stringify(r).slice(0, 120));
  return { token: r.token, id: r.user.id, h: { Authorization: `Bearer ${r.token}`, 'Content-Type': 'application/json' } };
};
const J = async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) });

(async () => {
  console.log('');
  /* Anything an earlier failed run of this test left on the database.
     Cleanup at the bottom of a script never runs when an assertion
     fails, so the next run clears it instead. */
  await sweepStale('edit-');

  const A = await reg('alpha');
  const B = await reg('beta');
  await fetch(`${API}/company-profile`, { method: 'PUT', headers: A.h,
    body: JSON.stringify({ name: 'Edit Co', gstin: '36AAMCK2569F1Z9', stateCode: '36' }) });
  const cust = await (await fetch(`${API}/customers`, { method: 'POST', headers: A.h,
    body: JSON.stringify({ name: `Buyer ${stamp}`, state: 'Telangana' }) })).json();

  const mkQuote = async () => (await (await fetch(`${API}/sales-quotations`, {
    method: 'POST', headers: A.h,
    body: JSON.stringify({ customerId: cust.id, items: [{ description: 'Cross arm', quantity: 10, rate: 100 }] }),
  })).json());

  console.log('  ── a draft quotation is fully editable');
  const q = await mkQuote();
  let r = await J(await fetch(`${API}/sales-quotations/${q.id}`, { method: 'PATCH', headers: A.h,
    body: JSON.stringify({ items: [{ description: 'Cross arm', quantity: 10, rate: 250 }] }) }));
  ok(r.status === 200, `line items can be changed (${r.status})`);
  ok(Number(r.body.sub_total) === 2500, `and the total is recomputed, not taken from the client (₹${r.body.sub_total})`);
  ok(/Two Thousand Nine Hundred Fifty/i.test(r.body.amount_in_words || ''),
    `amount in words follows the new total ("${r.body.amount_in_words}")`);

  r = await J(await fetch(`${API}/sales-quotations/${q.id}`, { method: 'PATCH', headers: A.h,
    body: JSON.stringify({ quote_number: `QT-CUSTOM-${stamp}` }) }));
  ok(r.status === 200 && r.body.quote_number === `QT-CUSTOM-${stamp}`, 'the quotation number can be set by hand in draft');

  const q2 = await mkQuote();
  r = await J(await fetch(`${API}/sales-quotations/${q2.id}`, { method: 'PATCH', headers: A.h,
    body: JSON.stringify({ quote_number: `QT-CUSTOM-${stamp}` }) }));
  ok(r.status === 409, `but not to one already in use (${r.status}) — "${r.body.error}"`);

  console.log('\n  ── once sent, the offer itself is fixed');
  await fetch(`${API}/sales-quotations/${q.id}/status`, { method: 'PATCH', headers: A.h, body: JSON.stringify({ status: 'Sent' }) });
  r = await J(await fetch(`${API}/sales-quotations/${q.id}`, { method: 'PATCH', headers: A.h,
    body: JSON.stringify({ items: [{ description: 'Cross arm', quantity: 10, rate: 999 }] }) }));
  ok(r.status === 409, `the rates can no longer be changed (${r.status})`);
  r = await J(await fetch(`${API}/sales-quotations/${q.id}`, { method: 'PATCH', headers: A.h,
    body: JSON.stringify({ valid_until: '2026-12-31', notes: 'Extended on request' }) }));
  ok(r.status === 200, 'but validity and notes still can — no need to reissue a number');

  console.log('\n  ── a draft invoice, then an issued one');
  const inv = await (await fetch(`${API}/sales-invoices`, { method: 'POST', headers: A.h,
    body: JSON.stringify({ customerId: cust.id, items: [{ description: 'Cross arm', quantity: 4, rate: 500 }] }) })).json();
  r = await J(await fetch(`${API}/sales-invoices/${inv.id}`, { method: 'PATCH', headers: A.h,
    body: JSON.stringify({ items: [{ description: 'Cross arm', quantity: 4, rate: 600 }] }) }));
  ok(r.status === 200 && Number(r.body.sub_total) === 2400, `draft invoice recomputes (₹${r.body.sub_total})`);

  await fetch(`${API}/sales-invoices/${inv.id}/status`, { method: 'PATCH', headers: A.h, body: JSON.stringify({ status: 'Sent' }) });
  r = await J(await fetch(`${API}/sales-invoices/${inv.id}`, { method: 'PATCH', headers: A.h,
    body: JSON.stringify({ invoice_number: 'INV-REWRITTEN' }) }));
  ok(r.status === 409, `an issued invoice number cannot be rewritten (${r.status})`);
  ok(/credit or debit note/i.test(r.body.error || ''), `and it says what to do instead — "${r.body.error}"`);
  r = await J(await fetch(`${API}/sales-invoices/${inv.id}`, { method: 'PATCH', headers: A.h,
    body: JSON.stringify({ notes: 'PO reference added', eway_bill_no: '123456789012' }) }));
  ok(r.status === 200, 'notes and the e-way bill number are still editable after issue');

  console.log('\n  ── money already received');
  /* Recording a payment moves an invoice out of Draft by itself, so a paid
     draft cannot exist through the API. That means the amounts are already
     locked by the time any money arrives — which is the protection we
     wanted, reached one step earlier than expected. The controller still
     carries an explicit "paid more than the revised total" guard behind
     this, as a second line if the status handling ever changes. */
  const inv2 = await (await fetch(`${API}/sales-invoices`, { method: 'POST', headers: A.h,
    body: JSON.stringify({ customerId: cust.id, items: [{ description: 'Plate', quantity: 10, rate: 1000 }] }) })).json();
  const payRes = await J(await fetch(`${API}/sales-invoices/${inv2.id}/payment`, { method: 'POST', headers: A.h,
    body: JSON.stringify({ amount: 5000, mode: 'Bank' }) }));
  ok(payRes.status === 200 && payRes.body.status !== 'Draft',
    `taking a payment moves the invoice out of Draft (${payRes.body.status})`);
  r = await J(await fetch(`${API}/sales-invoices/${inv2.id}`, { method: 'PATCH', headers: A.h,
    body: JSON.stringify({ items: [{ description: 'Plate', quantity: 1, rate: 100 }] }) }));
  ok(r.status === 409,
    `so its figures can no longer be rewritten underneath the payment — "${r.body.error}"`);

  console.log('\n  ── another organisation');
  const q3 = await mkQuote();
  r = await J(await fetch(`${API}/sales-quotations/${q3.id}`, { method: 'PATCH', headers: B.h,
    body: JSON.stringify({ notes: 'edited by a stranger' }) }));
  ok(r.status === 404, `org B cannot edit org A's quotation (${r.status} — not even 403, which would confirm it exists)`);
  r = await J(await fetch(`${API}/sales-invoices/${inv.id}`, { method: 'PATCH', headers: B.h,
    body: JSON.stringify({ notes: 'edited by a stranger' }) }));
  ok(r.status === 404, `nor org A's invoice (${r.status})`);

  /* ── leave the database as it was found ── */
  const base = path.join(__dirname, '..');
  require(path.join(base, 'node_modules', 'dotenv')).config({ path: path.join(base, '.env') });
  const { Client } = require(path.join(base, 'node_modules', 'pg'));
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  for (const u of [A, B]) {
    await c.query('DELETE FROM sales_quotation_items WHERE sales_quotation_id IN (SELECT id FROM sales_quotations WHERE owner_id=$1)', [u.id]).catch(() => {});
    await c.query('DELETE FROM sales_invoice_items WHERE sales_invoice_id IN (SELECT id FROM sales_invoices WHERE owner_id=$1)', [u.id]).catch(() => {});
    await c.query('DELETE FROM sales_payments WHERE sales_invoice_id IN (SELECT id FROM sales_invoices WHERE owner_id=$1)', [u.id]).catch(() => {});
    for (const t of ['sales_quotations', 'sales_invoices', 'customers', 'company_profile', 'document_sequences']) {
      await c.query(`DELETE FROM ${t} WHERE owner_id = $1`, [u.id]).catch(() => {});
    }
    await c.query('DELETE FROM users WHERE id = $1', [u.id]).catch(() => {});
  }
  await c.end();

  console.log(`\n   ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('threw:', e.message); process.exit(1); });
