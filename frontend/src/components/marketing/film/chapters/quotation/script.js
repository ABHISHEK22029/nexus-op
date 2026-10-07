/* 06 — the quotation: priced, emailed, accepted, converted. */
export default {
  key: 'quotation',
  title: 'Quotation',
  kicker: 'Priced, sent, accepted',
  surface: 'app',
  path: '/sales-quotations',
  duration: 26000,
  beats: [
    { key: 'price', at: 0,
      voice: 'Price it, and the tax follows the place of supply. Telangana to Telangana means CGST and SGST.' },
    { key: 'doc', at: 8500, path: '/sales-quotations/7',
      voice: 'Email it from your own mail. Gmail opens with the message already written.' },
    { key: 'accepted', at: 17500,
      voice: 'When they accept, convert it to an order. Every line, the discount and the tax come with it.' },
  ],
  sr: 'Quotation QT-0007: 120 SS304 Mounting Brackets at ₹2,320, sub-total ₹2,78,400, CGST 9% ₹25,056 and SGST 9% ₹25,056, round-off minus ₹12, total ₹3,28,500. Emailed through Gmail, marked accepted, and converted into customer order CO-0012.',
  seo: {
    body: 'Quotations carry the customer’s lines, your rates and a validity date, with GST split by place of supply — CGST and SGST within the state, IGST across it. Email one from your own mail with the message written for you; when the customer accepts, convert it into an order without retyping a line.',
  },
  truth: [
    ['pages/SalesQuotations.jsx', 'Create Quotation'],
    ['pages/SalesQuotations.jsx', 'Valid Until'],
    ['pages/SalesQuotationDoc.jsx', 'This is a quotation, not a tax invoice.'],
    ['pages/SalesQuotationDoc.jsx', 'Convert to Order'],
    ['components/EmailDocumentModal.jsx', 'Attach the PDF from this page in the compose window.'],
    ['components/EmailDocumentModal.jsx', 'Use my mail app'],
    ['components/EmailDocumentModal.jsx', 'Please find attached our quotation'],
  ],
};
