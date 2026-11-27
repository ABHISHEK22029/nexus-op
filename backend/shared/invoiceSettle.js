/* ══════════════════════════════════════════════════════════════════════
   What an invoice still owes, and whether it is paid.

   A credit note against an invoice reduces what the customer owes on it.
   The invoice list and the dashboard already took it off, but the payment
   check, the Paid status, the reminders and the customer page did not
   (27 Nov 2026 review): a ₹11,800 invoice with a ₹1,180 credit note, and
   ₹10,620 received, stayed "Partially Paid" for good, the reminder chased
   ₹1,180, and a further ₹1,180 was accepted — ₹11,800 collected against
   ₹10,620 owed. Everything that asks "how much is owed" or "is it paid"
   now asks here.
   ══════════════════════════════════════════════════════════════════════ */

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/* SQL for the credited amount of the invoice aliased `alias`, for queries
   that list or total invoices. Credit notes to the same customer, linked to
   the invoice, in the invoice's own company. */
const CREDITED_SQL = (alias = 'si') => `COALESCE((SELECT SUM(n.total) FROM credit_debit_notes n
   WHERE n.party_type = 'customer' AND n.note_type = 'credit' AND n.ref_id = ${alias}.id
     AND n.owner_id IS NOT DISTINCT FROM ${alias}.owner_id), 0)`;

async function creditedOn(client, invoiceId) {
  const { rows } = await client.query(
    `SELECT ${CREDITED_SQL('si')} AS credited FROM sales_invoices si WHERE si.id = $1`, [invoiceId]);
  return r2(rows[0]?.credited);
}

/* Received, credited and outstanding for one invoice. */
async function owedOn(client, invoiceId) {
  const inv = (await client.query(
    `SELECT si.id, si.net_amount, si.status, ${CREDITED_SQL('si')} AS credited,
            (SELECT COALESCE(SUM(amount), 0) FROM sales_payments WHERE sales_invoice_id = si.id) AS paid
       FROM sales_invoices si WHERE si.id = $1`, [invoiceId])).rows[0];
  if (!inv) return null;
  const net = r2(inv.net_amount), paid = r2(inv.paid), credited = r2(inv.credited);
  return { net, paid, credited, due: r2(net - credited - paid), status: inv.status };
}

/* amount_paid and the status, worked out again from the payments and the
   credit notes. Cancelled is final and stays. Once money has come in the
   status follows it — Partially Paid, or Paid when money plus credit covers
   the invoice — from Draft too, as it always has (most real invoices are
   recorded against while still drafts). With no money in, a Paid or
   Partially Paid invoice goes back to Sent (its payments were reversed) and
   anything else keeps its status; an invoice settled by credit alone is not
   owed (the lists and totals see that), but nothing was paid. */
async function settleInvoice(client, invoiceId) {
  const o = await owedOn(client, invoiceId);
  if (!o || o.status === 'Cancelled') return o;
  const status = o.paid > 0.005
    ? (o.paid + o.credited >= o.net - 0.01 ? 'Paid' : 'Partially Paid')
    : (['Paid', 'Partially Paid'].includes(o.status) ? 'Sent' : o.status);
  await client.query('UPDATE sales_invoices SET amount_paid = $1, status = $2 WHERE id = $3', [o.paid, status, invoiceId]);
  return { ...o, status };
}

/* ── The vendor side: debit notes against a purchase bill ──
   A debit note to a vendor (goods returned, a rate corrected) reduces what
   we owe on their bill. Payables, ageing, "owed to vendors" and the payment
   limit used only net − paid: a ₹1,18,000 bill with an ₹18,000 debit note
   still read ₹1,18,000, and the pay form filled in ₹1,18,000. */
const DEBITED_SQL = (alias = 'gb') => `COALESCE((SELECT SUM(n.total) FROM credit_debit_notes n
   WHERE n.party_type = 'vendor' AND n.note_type = 'debit' AND n.ref_id = ${alias}.id
     AND n.owner_id IS NOT DISTINCT FROM ${alias}.owner_id), 0)`;

async function debitedOn(client, billId) {
  const { rows } = await client.query(
    `SELECT ${DEBITED_SQL('gb')} AS debited FROM grn_bills gb WHERE gb.id = $1`, [billId]);
  return r2(rows[0]?.debited);
}

/* Unpaid / Partially Paid / Paid for a bill, from its payments and the
   debit notes against it; amount_paid stays what was actually paid. */
function billPaymentStatus(net, paid, debited) {
  if (paid > 0.005 && paid + debited >= net - 0.01) return 'Paid';
  return paid > 0.005 ? 'Partially Paid' : 'Unpaid';
}

async function settleBill(client, billId) {
  const b = (await client.query(
    `SELECT gb.id, gb.net_amount, ${DEBITED_SQL('gb')} AS debited,
            (SELECT COALESCE(SUM(amount), 0) FROM vendor_payments WHERE grn_bill_id = gb.id) AS paid
       FROM grn_bills gb WHERE gb.id = $1`, [billId])).rows[0];
  if (!b) return null;
  const net = r2(b.net_amount), paid = r2(b.paid), debited = r2(b.debited);
  const status = billPaymentStatus(net, paid, debited);
  await client.query('UPDATE grn_bills SET amount_paid = $1, payment_status = $2 WHERE id = $3', [paid, status, billId]);
  return { net, paid, debited, due: r2(net - debited - paid), status };
}

module.exports = { CREDITED_SQL, creditedOn, owedOn, settleInvoice, DEBITED_SQL, debitedOn, billPaymentStatus, settleBill, r2 };
