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

function amountInWords(value) {
  let num = Math.round(Number(value) || 0);
  if (num === 0) return 'Rupees Zero Only';
  const negative = num < 0;
  num = Math.abs(num);

  let out = '';
  const crore = Math.floor(num / 10000000); num %= 10000000;
  const lakh = Math.floor(num / 100000);    num %= 100000;
  const thousand = Math.floor(num / 1000);  num %= 1000;

  if (crore) out += three(crore) + ' Crore ';
  if (lakh) out += two(lakh) + ' Lakh ';
  if (thousand) out += two(thousand) + ' Thousand ';
  if (num) out += three(num);

  return `Rupees ${negative ? 'Minus ' : ''}${out.trim().replace(/\s+/g, ' ')} Only`;
}

module.exports = { amountInWords };
