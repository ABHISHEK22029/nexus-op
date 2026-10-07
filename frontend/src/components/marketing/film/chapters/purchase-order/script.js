/* 10 — the purchase order: held over the limit, signed off by the role
   that may, sent to the vendor. */
export default {
  key: 'purchase-order',
  title: 'Purchase order',
  kicker: 'Signed off by the right person',
  surface: 'app',
  path: '/purchase-orders',
  duration: 24000,
  beats: [
    { key: 'held', at: 0, voice: 'Over your limit of forty thousand rupees, a purchase order waits for sign-off.' },
    { key: 'procurement', at: 6000, role: 'Procurement', voice: 'Procurement raised it, but cannot sign it off.' },
    { key: 'finance', at: 10500, role: 'Finance', voice: 'Finance can. One click, and it is approved.' },
    { key: 'dispatch', at: 16000, path: '/po/18', voice: 'Then it goes to the vendor, on your letterhead and on your terms.' },
  ],
  sr: 'Purchase order PFW/FY2026-27/018 to Deccan Metals for 180 kg of SS304 sheet, ₹46,800 before GST, held for sign-off because it is over the ₹40,000 limit. Seen as Procurement, there is no Sign off button; seen as Finance, Sign off approves it. It is approved and dispatched: ₹55,224 with GST, net 30 days, ex works.',
  seo: {
    body: 'Purchase orders above your limit are held until someone allowed to sign them off does — Finance or the Owner, not the person who raised it. Approved orders go to the vendor on your letterhead with your payment terms, price basis and warranty, numbered in your own series for the financial year.',
  },
  claims: [
    { role: 'Procurement', resource: 'po-approval', action: 'write', expect: false },
    { role: 'Finance', resource: 'po-approval', action: 'write', expect: true },
  ],
  truth: [
    ['pages/PurchaseOrders.jsx', 'Needs sign-off'],
    ['pages/PurchaseOrders.jsx', 'Sign off'],
    ['pages/PurchaseOrders.jsx', 'Dispatch'],
    ['pages/PurchaseOrders.jsx', 'Receive GRN'],
    ['pages/Automation.jsx', 'PO approval threshold'],
    ['pages/Automation.jsx', 'will need sign-off'],
  ],
};
