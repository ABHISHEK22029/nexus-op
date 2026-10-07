/* 08 — requirements: every open order's need, against stock, and the
   purchase orders it can raise. */
export default {
  key: 'requirements',
  title: 'Requirements',
  kicker: 'What to buy, from whom',
  surface: 'app',
  path: '/material-requirements',
  duration: 24000,
  beats: [
    { key: 'table', at: 0,
      voice: 'Across every open order, it adds up what you need against what you hold. The sheet is 180 kilos short.' },
    { key: 'plan', at: 12000,
      voice: 'One click turns a shortfall into purchase orders, from each preferred vendor. Big buys are marked for quotes first.' },
  ],
  sr: 'Material Requirements: SS304 sheet, 2 mm — 323 kg required, 143 kg in stock, 180 kg short, to order 180 kg from Deccan Metals at ₹260, marked RFQ; M8 bolts — 360 short, 500 to order at the vendor’s minimum. Raise purchase orders previews one PO per vendor before raising them.',
  seo: {
    body: 'Material requirements add up what every open order needs through each product’s bill of materials, against stock on hand and what is already on order. The shortfall is ranked by value, rounded up to each vendor’s minimum order, and turned into purchase orders from the preferred vendor in one step — the biggest buys marked for quotes first.',
  },
  truth: [
    ['pages/MaterialRequirements.jsx', 'Only what\'s short'],
    ['pages/MaterialRequirements.jsx', 'Raise purchase orders'],
    ['components/ShortfallPoModal.jsx', 'Raise purchase orders for the shortfall'],
    ['components/ShortfallPoModal.jsx', 'minimum order'],
  ],
};
