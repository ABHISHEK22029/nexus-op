/* 12 — production: material issued from stock, output and scrap
   recorded, yield and true cost worked out. */
export default {
  key: 'production',
  title: 'Production',
  kicker: 'Output, scrap and true cost',
  surface: 'app',
  path: '/production/5',
  duration: 24000,
  beats: [
    { key: 'issue', at: 0, voice: 'Issue the sheet from stock to the job. It comes off stock as it goes to the floor.' },
    { key: 'output', at: 8000, voice: 'Record what came out, and the scrap. Sellable offcuts are money back.' },
    { key: 'yield', at: 15500,
      voice: 'Yield, scrap and the true material cost of each bracket work themselves out.' },
  ],
  sr: 'Production order PROD-0005 for 120 SS304 Mounting Brackets, from customer order CO-0012: 300 kg of SS304 sheet issued from stock, which falls from 323 kg to 23 kg; 120 pieces weighing 282.6 kg made; 17.4 kg of sellable scrap worth ₹960. Yield 94.2%, balanced, net material cost ₹77,040 — ₹642 a bracket.',
  seo: {
    body: 'A production order issues material from stock, records the finished output and every kilo of scrap or reusable remnant, and works out the yield, the unaccounted loss and the true material cost per piece — net of what the scrap sells for.',
  },
  truth: [
    ['pages/ProductionOrder.jsx', 'Raw Material Consumed'],
    ['pages/ProductionOrder.jsx', 'From stock'],
    ['pages/ProductionOrder.jsx', 'Finished Output'],
    ['pages/ProductionOrder.jsx', 'Scrap & Remnant'],
    ['pages/ProductionOrder.jsx', 'Sellable scrap'],
    ['pages/ProductionOrder.jsx', 'Unaccounted Loss'],
    ['pages/ProductionOrder.jsx', 'Cost / Unit'],
  ],
};
