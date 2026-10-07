/* 17 — the close: one transaction, as the records it made. */
export default {
  key: 'close',
  title: 'One record',
  kicker: 'From catalogue to cash',
  surface: 'title',
  duration: 21000,
  beats: [
    { key: 'chain', at: 0,
      voice: 'One enquiry became a quotation, an order, a purchase, a receipt, production, a dispatch and an invoice.' },
    { key: 'graph', at: 9000, voice: 'Each one linked to the one before it. Nothing typed twice.' },
    { key: 'end', at: 15000, voice: 'Maks Ops. From catalogue to cash.' },
  ],
  sr: 'Close: the transaction as its records — enquiry, quotation, customer order, purchase order, goods receipt, production order, delivery challan and tax invoice — each linked to the one before. Maks Ops, from catalogue to cash.',
  seo: {
    body: 'Every document in the chain points back to the one it came from, so the invoice can be traced to the order, the purchase that supplied it, the receipt that put the material in stock, and the enquiry it all started with.',
  },
  truth: [],
};
