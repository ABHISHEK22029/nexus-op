/* 07 — the customer order, and whether it can be built from stock. */
export default {
  key: 'order',
  title: 'Customer order',
  kicker: 'Can we fulfil it?',
  surface: 'app',
  path: '/customer-orders',
  duration: 20000,
  beats: [
    { key: 'order', at: 0, voice: 'The order arrives with every line from the quotation, and the customer’s own PO reference.' },
    { key: 'ready', at: 8000,
      voice: 'Before you promise a date, it checks your stock. You can build 57 of the 120: the sheet is short.' },
  ],
  sr: 'Customer order CO-0012 for Acme Engineering, against their PO ACME/PO/4471: 120 SS304 Mounting Brackets, ₹3,28,500, open. Its readiness check: can build 57 of 120 — blocked by SS304 sheet, 2 mm — 300 kg needed, 143 kg in stock.',
  seo: {
    body: 'A customer order keeps the quotation’s lines and the customer’s PO reference. Its readiness check works through each product’s bill of materials against stock on hand and says how many you can build now and what is holding the rest — before you promise a delivery date.',
  },
  truth: [
    ['pages/CustomerOrders.jsx', 'Customer PO Ref'],
    ['pages/CustomerOrders.jsx', 'Raise Quotation'],
    ['pages/CustomerOrders.jsx', 'Create Invoice'],
    ['components/OrderReadiness.jsx', 'See what to order'],
    ['components/OrderReadiness.jsx', 'blocked by'],
  ],
};
