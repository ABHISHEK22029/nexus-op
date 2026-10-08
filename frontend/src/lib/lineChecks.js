/* The same rules as backend/shared/lineChecks.js, so the form says what is
   wrong before the server has to refuse it:
   · a row with nothing in it is the spare line, and is left out;
   · a row with figures but no description is a mistake, not a blank;
   · the discount (₹ or %) cannot be more than the sub-total;
   · round-off is at most ₹1 either way. */

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const empty = (v) => v == null || String(v).trim() === '';

/** ₹1,23,456.00 — and −₹21.00 for a negative, not ₹-21.00. */
export const money = (n) => {
  const v = r2(n);
  const body = Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${v < 0 ? '−' : ''}₹${body}`;
};

/** { kept: rows worth saving, rows: Set of row indexes in error, list: messages } */
export function lineProblems(items) {
  const kept = [];
  const rows = new Set();
  const list = [];
  (items || []).forEach((it, i) => {
    const desc = String(it.description || '').trim();
    const figures = (!empty(it.quantity) && Number(it.quantity) !== 0) || (!empty(it.rate) && Number(it.rate) !== 0) || !empty(it.hsn);
    if (!desc && !figures) return;                    // the spare line
    if (!desc) { rows.add(i); list.push(`Line ${i + 1} has a quantity or rate but no description. Describe the item, or remove the line.`); return; }
    kept.push(it);
  });
  return { kept, rows, list };
}

/** The discount as an amount: typed in rupees, or a percentage of the sub-total. */
export const discountAmount = (value, mode, sub) => {
  const v = Number(value) || 0;
  return r2(mode === 'pct' ? (sub * v) / 100 : v);
};

/** Problems with the discount and round-off, as an array with named entries. */
export function adjustmentProblems({ discount, mode, roundOff, sub }) {
  const out = [];
  const d = Number(discount) || 0;
  if (d < 0) out.discount = 'The discount cannot be negative.';
  else if (mode === 'pct' && d > 100) out.discount = 'A percentage discount cannot be more than 100%.';
  else if (discountAmount(d, mode, sub) > r2(sub) + 0.001) out.discount = `The discount is more than the sub-total (${money(sub)}).`;
  const ro = Number(roundOff) || 0;
  if (Math.abs(ro) > 1) out.roundOff = 'Round off is at most ₹1 either way — it only rounds the total to the nearest rupee.';
  if (out.discount) out.push(out.discount);
  if (out.roundOff) out.push(out.roundOff);
  return out;
}
