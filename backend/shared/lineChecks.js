/* ══════════════════════════════════════════════════════════
   lineChecks — what a quotation's or an invoice's lines and adjustments
   must satisfy before their totals are worked out.

   Found by a tester, each of them on a real screen:
   · a line with a quantity and a rate but no description was dropped on
     save without a word, so an invoice quietly lost a line;
   · the unit took anything ("123333333444444445555555");
   · a discount larger than the sub-total was accepted, and the taxable
     value, GST and total all went negative.

   A wholly blank row (nothing typed in it) is still dropped quietly: that
   is the empty line the form keeps ready for the next item, not data.
   ══════════════════════════════════════════════════════════ */

class InputError extends Error {
  constructor(message) { super(message); this.status = 400; }
}

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const empty = (v) => v == null || String(v).trim() === '';
const rupees = (n) => `₹${r2(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/* A unit is a short word, maybe with digits after it: nos, kg, m3, sq.m.
   Not a number, and not a sentence. */
const UNIT = /^[A-Za-z][A-Za-z0-9 .\/-]{0,14}$/;

/**
 * The lines worth keeping, checked. `strictUnits` applies the unit rule —
 * on for lines a person has just sent, off for lines already stored, so a
 * document saved before the rule can still be edited and converted.
 */
function prepareLines(items, { strictUnits = false } = {}) {
  const out = [];
  (items || []).forEach((it, i) => {
    const n = i + 1;
    const description = String(it.description ?? '').trim();
    const blank = !description && empty(it.hsn)
      && (empty(it.quantity) || Number(it.quantity) === 0)
      && (empty(it.rate) || Number(it.rate) === 0);
    if (blank) return;
    if (!description) throw new InputError(`Line ${n} has a quantity or rate but no description. Describe the item, or remove the line.`);
    const quantity = Number(empty(it.quantity) ? 0 : it.quantity);
    const rate = Number(empty(it.rate) ? 0 : it.rate);
    if (!Number.isFinite(quantity) || quantity < 0) throw new InputError(`Line ${n}: the quantity must be a number, 0 or more.`);
    if (!Number.isFinite(rate) || rate < 0) throw new InputError(`Line ${n}: the rate must be a number, 0 or more.`);
    const uom = String(it.uom ?? '').trim();
    if (strictUnits && uom && !UNIT.test(uom)) {
      throw new InputError(`Line ${n}: "${uom.slice(0, 24)}" is not a unit. Choose one such as nos, kg or m.`);
    }
    out.push({ ...it, description, quantity, rate, uom: uom || 'nos' });
  });
  if (!out.length) throw new InputError('Add at least one line item.');
  return out;
}

/** Discount and round-off, against the sub-total they apply to. */
function checkAdjustments(subTotal, { discount = 0, roundOff = 0 } = {}) {
  const d = Number(empty(discount) ? 0 : discount);
  if (!Number.isFinite(d) || d < 0) throw new InputError('The discount must be a number, 0 or more.');
  if (d > r2(subTotal) + 0.001) throw new InputError(`The discount (${rupees(d)}) is more than the sub-total (${rupees(subTotal)}).`);
  const ro = Number(empty(roundOff) ? 0 : roundOff);
  if (!Number.isFinite(ro) || Math.abs(ro) > 1) {
    throw new InputError('Round off can be at most ₹1 either way: it only rounds the total to the nearest rupee.');
  }
}

module.exports = { InputError, prepareLines, checkAdjustments };
