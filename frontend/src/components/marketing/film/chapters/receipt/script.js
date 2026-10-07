/* 11 — goods receipt: the material in, stock up, the vendor's bill, and
   paying it. */
export default {
  key: 'receipt',
  title: 'Goods receipt',
  kicker: 'Stock moves on the receipt itself',
  surface: 'app',
  path: '/grn',
  duration: 30000,
  beats: [
    { key: 'inward', at: 0,
      voice: 'The sheet arrives. Book it in against the purchase order, with the vehicle and the weighbridge weight.' },
    { key: 'stock', at: 8500, path: '/inventory', voice: 'Stock goes up on the receipt itself: 143 kilos becomes 323.' },
    { key: 'bill', at: 15000, path: '/grn/31/bill',
      voice: 'Their bill is entered against the receipt, so you pay for what actually arrived.' },
    { key: 'pay', at: 22500, path: '/payables',
      voice: 'And Payables shows what you owe and how old it is, until it is paid.' },
  ],
  sr: 'Goods receipt GRN-00031 against PFW/FY2026-27/018: vehicle TS 09 UB 4521, 180 kg on the weighbridge. Stock of SS304 sheet goes from 143 kg to 323 kg. The vendor’s bill DM/INV/1187 is entered against the receipt — ₹55,224 net payable — and paid by NEFT from Payables.',
  seo: {
    body: 'Receive material against the purchase order — vehicle, batch and weighbridge weight — and stock goes up on the receipt itself, through a ledger that records every movement. Enter the vendor’s bill against what arrived, see what you owe and how old it is, and record the payment.',
  },
  truth: [
    ['pages/GRN.jsx', 'Inward New Material'],
    ['pages/GRN.jsx', 'Weighbridge Weight'],
    ['pages/GRN.jsx', 'Generate GRN'],
    ['pages/Inventory.jsx', 'Items held'],
    ['pages/GrnBillBuilder.jsx', 'Vendor Bill Ref'],
    ['pages/GrnBillBuilder.jsx', 'Net Payable'],
    ['pages/GrnBillBuilder.jsx', 'Create Bill'],
    ['pages/Payables.jsx', 'Top vendors owed'],
    ['pages/Payables.jsx', 'Record payment'],
  ],
};
