/* ══════════════════════════════════════════════════════════
   amountInWords — Indian numbering (lakh, crore) for documents.

   This exact function was copy-pasted into five controllers. Consolidated
   here after createOrder referenced it and crashed, because the copy it
   needed happened to live in a different file. Five copies of a rounding
   rule is five chances for two documents to spell the same amount
   differently.
   ══════════════════════════════════════════════════════════ */
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

const two = (n) => (n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : ''));
const three = (n) =>
  (Math.floor(n / 100) ? ONES[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' : '') : '') +
  (n % 100 ? two(n % 100) : '');

/* Whole rupees in Indian words. The crore count is itself spelled the same
   way, so it can be any size: `three(crore)` used to look up ONES[14] for
   14,784 crore and print "undefined Hundred Eighty Four Crore". */
const words = (n) => {
  let out = '';
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000);    n %= 100000;
  const thousand = Math.floor(n / 1000);  n %= 1000;
  if (crore) out += words(crore) + ' Crore ';
  if (lakh) out += two(lakh) + ' Lakh ';
  if (thousand) out += two(thousand) + ' Thousand ';
  if (n) out += three(n);
  return out.trim();
};

function amountInWords(value) {
  /* Paise are spelled too: rounding to the rupee printed ₹11,800.50 as
     "Eleven Thousand Eight Hundred One", a different amount from the
     figure beside it. */
  const paiseTotal = Math.round(Math.abs(Number(value) || 0) * 100);
  const negative = (Number(value) || 0) < 0 && paiseTotal > 0;
  const rupees = Math.floor(paiseTotal / 100), paise = paiseTotal % 100;
  if (!rupees && !paise) return 'Rupees Zero Only';
  const r = rupees ? words(rupees).replace(/\s+/g, ' ') : 'Zero';
  return `Rupees ${negative ? 'Minus ' : ''}${r}${paise ? ` and ${two(paise)} Paise` : ''} Only`;
}

module.exports = { amountInWords };
