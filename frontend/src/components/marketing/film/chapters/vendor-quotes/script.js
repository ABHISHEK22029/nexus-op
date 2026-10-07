/* 09 — vendor quotes: uploaded as they came, read, checked, compared,
   and ordered from. */
export default {
  key: 'vendor-quotes',
  title: 'Vendor quotes',
  kicker: 'Excel, PDF or Word — compared like for like',
  surface: 'app',
  path: '/vendor-quotations',
  duration: 30000,
  beats: [
    { key: 'upload', at: 0, voice: 'Vendors quote in their own formats: Excel, PDF and Word. Upload them as they came.' },
    { key: 'review', at: 8000,
      voice: 'Each one is read for you. Anything read from a PDF is checked by a person before it counts.' },
    { key: 'compare', at: 15500,
      voice: 'Compare them like for like: the same items, at the same quantity. Deccan is the lowest.' },
    { key: 'raise', at: 23500, voice: 'Raise the purchase order straight from their quote. Nothing is retyped.' },
  ],
  sr: 'Vendor quotations: apex-quote.xlsx, deccan-metals.pdf and sunrise-quotation.docx uploaded and read; the PDF reviewed and saved as checked; compared side by side — Deccan Metals lowest like for like at ₹46,800 before tax, ₹4,140 less than the highest, at ₹260 a kilo against ₹276 and ₹283; Raise PO creates purchase order PFW/FY2026-27/018 for Deccan Metals, held for sign-off.',
  seo: {
    body: 'Upload each vendor’s quotation as it arrived — Excel, CSV, PDF or Word. The lines are read out of it, anything read with less than full confidence is checked against the original, and the quotes are compared like for like on the items everyone quoted. Raise the purchase order from the winning quote with its own lines and rates.',
  },
  truth: [
    ['pages/VendorQuotations.jsx', 'Upload quotation'],
    ['pages/VendorQuotations.jsx', 'Save as checked'],
    ['pages/VendorQuotations.jsx', 'Side by side'],
    ['pages/VendorQuotations.jsx', 'Lowest like for like'],
    ['pages/VendorQuotations.jsx', 'Raise PO'],
    ['pages/VendorQuotations.jsx', 'Spread'],
  ],
};
