/* 05 — the enquiry, opened and converted: the quotation starts from it. */
export default {
  key: 'enquiry',
  title: 'The enquiry',
  kicker: 'From a stranger’s message to a priced quote',
  surface: 'app',
  path: '/enquiries',
  badges: { '/enquiries': 1 },
  duration: 16000,
  beats: [
    { key: 'open', at: 0, voice: 'Open the enquiry: what they want, how many, and their note.' },
    { key: 'convert', at: 7000, path: '/sales-quotations', badges: {},
      voice: 'Convert it. They are added as a customer, and the quotation opens with their line already in it.' },
  ],
  sr: 'Enquiry ENQ-0042 from Acme Engineering: 120 SS304 Mounting Brackets, with the note brushed finish, delivery in 4 weeks. Convert to quotation adds Acme as a customer and opens a new quotation with the line already filled in, marked as coming from the enquiry.',
  seo: {
    body: 'An enquiry shows what was asked for, how many, and the customer’s note. Converting it adds the customer and opens a quotation with their lines already in place — nothing is retyped, and the quotation stays linked to the enquiry it came from.',
  },
  truth: [
    ['pages/Enquiries.jsx', 'What they want'],
    ['pages/Enquiries.jsx', 'Convert to quotation'],
    ['pages/Enquiries.jsx', 'Mark won'],
    ['pages/SalesQuotations.jsx', 'From enquiry'],
    ['pages/SalesQuotations.jsx', 'their lines are below; price them.'],
  ],
};
