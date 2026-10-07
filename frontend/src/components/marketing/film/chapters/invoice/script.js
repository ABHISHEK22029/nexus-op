/* 14 — the tax invoice: from the order, numbered from your series, paid. */
export default {
  key: 'invoice',
  title: 'Tax invoice',
  kicker: 'Get paid',
  surface: 'app',
  path: '/sales-invoices/new',
  duration: 26000,
  beats: [
    { key: 'build', at: 0,
      voice: 'Invoice the order. The number comes from your own series, and you can type over it.' },
    { key: 'doc', at: 10000, path: '/sales-invoices/147',
      voice: 'It prints as a proper tax invoice: GST by place of supply, the e-way bill, your bank details.' },
    { key: 'paid', at: 18500, path: '/sales-invoices/147',
      voice: 'When the money comes in, record it, and the invoice is paid.' },
  ],
  sr: 'Tax invoice INV-0147 for customer order CO-0012, numbered from the company’s own series: 120 SS304 Mounting Brackets, sub-total ₹2,78,400, CGST 9% and SGST 9% for Telangana, round-off minus ₹12, total ₹3,28,500, e-way bill 351012345678, bank details printed for payment. ₹3,28,500 received by bank transfer, and the invoice is paid.',
  seo: {
    body: 'Invoice an order — or invoice without one — with the number taken from your own series and yours to override. Place of supply decides CGST and SGST or IGST, the e-way bill and your bank details print on it, and receipts are recorded against it until it is paid.',
  },
  truth: [
    ['pages/SalesInvoiceBuilder.jsx', 'Next in your series — type over it to use any number'],
    ['pages/SalesInvoiceBuilder.jsx', 'Where the goods go — decides CGST + SGST or IGST'],
    ['pages/SalesInvoiceBuilder.jsx', 'E-way bill no.'],
    ['pages/SalesInvoiceBuilder.jsx', 'It is saved as a draft'],
    ['pages/SalesInvoiceDoc.jsx', 'Tax Invoice'],
    ['pages/SalesInvoiceDoc.jsx', 'Bank Details for Payment'],
    ['pages/SalesInvoiceDoc.jsx', 'Record payment'],
  ],
};
