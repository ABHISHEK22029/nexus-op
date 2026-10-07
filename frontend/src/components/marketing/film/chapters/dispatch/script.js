/* 13 — dispatch: the delivery challan, and the e-way bill number. */
export default {
  key: 'dispatch',
  title: 'Dispatch',
  kicker: 'On a challan, with the e-way bill',
  surface: 'app',
  path: '/delivery-challans',
  duration: 18000,
  beats: [
    { key: 'challan', at: 0,
      voice: 'Dispatch it on a delivery challan, filled from the order: vehicle, transporter and docket.' },
    { key: 'eway', at: 8000, path: '/delivery-challans/9',
      voice: 'Over fifty thousand rupees, it asks for the e-way bill number before the vehicle leaves.' },
  ],
  sr: 'Delivery challan DC-0009, filled from customer order CO-0012: 120 SS304 Mounting Brackets for Acme Engineering by VRL Logistics, vehicle TS 09 UC 7712, docket VRL-55021. The consignment is over ₹50,000, so the challan warns that an e-way bill is required; the number 351012345678 is recorded on it and the warning clears.',
  seo: {
    body: 'A delivery challan is filled from the customer order — what goes, on which vehicle, through which transporter, against which docket. Dispatching it takes the goods out of stock and moves the order on. Over ₹50,000 it insists on the e-way bill number, recorded on the challan before the vehicle leaves.',
  },
  truth: [
    ['pages/DeliveryChallans.jsx', 'Prefill from order'],
    ['pages/DeliveryChallans.jsx', 'Dispatch through'],
    ['pages/DeliveryChallans.jsx', 'LR / Docket No.'],
    ['pages/DeliveryChallans.jsx', 'Create Challan'],
    ['pages/DeliveryChallanDoc.jsx', 'E-way bill required — and not recorded'],
    ['pages/DeliveryChallanDoc.jsx', 'E-way Bill No.'],
  ],
};
