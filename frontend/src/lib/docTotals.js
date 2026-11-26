/* ══════════════════════════════════════════════════════════
   A quotation's or an invoice's totals, worked out on the page while it is
   being edited — the same arithmetic as the server's compute()
   (backend/controllers/SalesInvoiceController.js, SalesQuotationController.js):
   each line rounded to the paisa, the discount off the sub-total, one GST
   rate on the taxable value, CGST the half rounded and SGST the rest, and
   under reverse charge the GST shown but not added to what is paid.

   It is a preview. On save the server works the figures out again from the
   lines it stores, and the page shows the server's.
   ══════════════════════════════════════════════════════════ */

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export function docTotals(items, { discount = 0, gstRate = 0, interstate = false, roundOff = 0, reverseCharge = false } = {}) {
  const amounts = (items || []).map((it) => r2((Number(it.quantity) || 0) * (Number(it.rate) || 0)));
  const subTotal = r2(amounts.reduce((s, a) => s + a, 0));
  const disc = r2(Number(discount) || 0);
  const taxable = r2(subTotal - disc);
  const gstTotal = r2((taxable * (Number(gstRate) || 0)) / 100);
  const cgst = interstate ? 0 : r2(gstTotal / 2);
  const sgst = interstate ? 0 : r2(gstTotal - cgst);
  const igst = interstate ? gstTotal : 0;
  const net = r2(taxable + (reverseCharge ? 0 : gstTotal) + (Number(roundOff) || 0));
  return { amounts, subTotal, discount: disc, taxable, gstTotal, cgst, sgst, igst, net };
}

/** The GST rates offered on a document: today's slabs, and the document's
    own rate when it is something else (an older invoice at 12%). */
export const GST_RATES = [0, 5, 12, 18, 28, 40];
export const gstRateOptions = (current) => {
  const c = Number(current);
  return Number.isFinite(c) && !GST_RATES.includes(c) ? [...GST_RATES, c].sort((a, b) => a - b) : GST_RATES;
};

/** Rule 46(b): at most 16 characters, letters, digits, "-" and "/". */
export function invoiceNumberProblem(n) {
  const s = String(n || '').trim();
  if (!s) return 'The invoice number cannot be blank.';
  if (s.length > 16) return `The invoice number has ${s.length} characters — GST allows at most 16.`;
  if (!/^[A-Za-z0-9/-]+$/.test(s)) return 'Only letters, digits, “-” and “/” are allowed in a GST invoice number.';
  return null;
}
