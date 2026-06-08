export function numberToWords(num) {
  if (num === 0) return "Zero Rupees Only";

  const a = [
    '', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ',
    'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '
  ];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convertInteger(n) {
    if (n === 0) return '';
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + a[n % 10] : ' ');
    if (n < 1000) return a[Math.floor(n / 100)] + 'Hundred ' + (n % 100 !== 0 ? 'and ' + convertInteger(n % 100) : '');
    if (n < 100000) return convertInteger(Math.floor(n / 1000)) + 'Thousand ' + convertInteger(n % 1000);
    if (n < 10000000) return convertInteger(Math.floor(n / 100000)) + 'Lakh ' + convertInteger(n % 100000);
    return convertInteger(Math.floor(n / 10000000)) + 'Crore ' + convertInteger(n % 10000000);
  }

  const integerPart = Math.floor(num);
  const decimalPart = Math.round((num - integerPart) * 100);

  let result = convertInteger(integerPart).trim() + " Rupees";
  if (decimalPart > 0) {
    result += " and " + convertInteger(decimalPart).trim() + " Paise";
  }
  return result + " Only";
}
