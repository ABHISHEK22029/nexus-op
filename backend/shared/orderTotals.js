/* ══════════════════════════════════════════════════════════
   orderTotals — the money on a sales order, computed once.

   Mirrors what Zoho Books puts under a Sales Order's item table, in the
   order it is applied, because the order matters and getting it wrong moves
   real money:

       line amount   = qty × rate, less any per-line discount
       sub total     = Σ line amounts
       discount      = order-level, percent OR flat
       taxable       = sub total − discount
       GST           = taxable × rate   (CGST+SGST intra, IGST inter)
       TDS / TCS     = taxable × rate   — deducted or added, never both
       adjustment    = a labelled catch-all (freight, packing)
       total         = taxable + GST ± TDS/TCS + adjustment + round-off

   TDS is withheld BY the customer from what they pay us, so it REDUCES the
   amount receivable. TCS is collected BY us on top, so it increases it.
   They are opposite signs, which is why the type is stored alongside the
   amount rather than inferred from a sign somebody has to remember.
   ══════════════════════════════════════════════════════════ */

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** One line's amount, after its own discount. */
function lineAmount(it) {
  const gross = (Number(it.quantity) || 0) * (Number(it.rate) || 0);
  const d = Number(it.discount) || 0;
  const off = it.discountType === 'flat' ? d : gross * (d / 100);
  return r2(Math.max(gross - off, 0));
}

function computeOrder(items, opts = {}) {
  const {
    discount = 0, discountType = 'percent',
    gstRate = 18, interstate = false,
    taxDeductionType = null, taxDeductionRate = 0,
    adjustment = 0, roundOff = 0,
  } = opts;

  const lines = (items || []).map(it => ({ ...it, amount: lineAmount(it) }));
  const subTotal = r2(lines.reduce((s, l) => s + l.amount, 0));

  const discountAmount = discountType === 'flat'
    ? r2(Math.min(Number(discount) || 0, subTotal))
    : r2(subTotal * ((Number(discount) || 0) / 100));

  const taxable = r2(Math.max(subTotal - discountAmount, 0));

  const gstTotal = r2(taxable * ((Number(gstRate) || 0) / 100));
  const cgst = interstate ? 0 : r2(gstTotal / 2);
  const sgst = interstate ? 0 : r2(gstTotal - cgst);
  const igst = interstate ? gstTotal : 0;

  /* Computed on the taxable value, not on the GST-inclusive figure — TDS
     under 194C and TCS under 206C(1H) both apply to the value of the
     supply. Applying either to the gross would over-deduct on every order. */
  const tdRate = Number(taxDeductionRate) || 0;
  const taxDeductionAmount = taxDeductionType ? r2(taxable * (tdRate / 100)) : 0;
  const tdSign = taxDeductionType === 'TDS' ? -1 : taxDeductionType === 'TCS' ? 1 : 0;

  const total = r2(
    taxable + gstTotal
    + (tdSign * taxDeductionAmount)
    + (Number(adjustment) || 0)
    + (Number(roundOff) || 0)
  );

  return {
    lines, subTotal, discountAmount, taxable,
    gstTotal, cgst, sgst, igst,
    taxDeductionAmount, taxDeductionType: taxDeductionType || null,
    adjustment: r2(adjustment), roundOff: r2(roundOff), total,
  };
}

module.exports = { computeOrder, lineAmount, r2 };
