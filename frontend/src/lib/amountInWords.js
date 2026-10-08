/* Indian numbering (lakh, crore) — the same function as
   backend/shared/amountInWords.js, so a document computed on screen spells
   its total the way the server would. */
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

export function amountInWords(value) {
  let num = Math.round(Number(value) || 0);
  if (num === 0) return 'Rupees Zero Only';
  const negative = num < 0;
  num = Math.abs(num);
  return `Rupees ${negative ? 'Minus ' : ''}${words(num).replace(/\s+/g, ' ')} Only`;
}
