/* 04 — the customer, on your public catalogue. */
export default {
  key: 'customer',
  title: 'The customer',
  kicker: 'Your public catalogue',
  surface: 'public',
  path: '/c/precision-fab',
  duration: 30000,
  beats: [
    { key: 'open', at: 0, voice: 'Your customer opens your catalogue. No login, no app to install.' },
    { key: 'search', at: 6000, voice: 'They search for what they need, and narrow it by category.' },
    { key: 'product', at: 11500, path: '/c/precision-fab/ss304-mounting-bracket',
      voice: 'The rate, the minimum order and the lead time are right there. They need 120.' },
    { key: 'send', at: 18000, voice: 'They add a note, and send the enquiry. It gets its number at once.' },
    { key: 'lands', at: 24500, surface: 'app', path: '/enquiries', badges: { '/enquiries': 1 },
      voice: 'And it lands in Maks Ops, as an enquiry. Nobody typed it in.' },
  ],
  sr: 'Acme Engineering opens the public catalogue at maksops.co.in/c/precision-fab, searches for brackets, opens the SS304 Mounting Bracket, asks for 120 with a note, and sends the enquiry. It arrives in Maks Ops as enquiry ENQ-0042.',
  seo: {
    body: 'Your products on a public page of their own — searchable, filtered by category, with rates, minimum orders and lead times. A customer builds an enquiry and sends it without an account, and it arrives in Maks Ops as a numbered enquiry, ready to quote.',
  },
  truth: [
    ['pages/PublicCatalogue.jsx', 'Search — size, description, code'],
    ['pages/PublicCatalogue.jsx', 'Add to enquiry'],
    ['pages/PublicCatalogue.jsx', 'Send enquiry'],
    ['pages/PublicCatalogue.jsx', 'Minimum order'],
    ['pages/PublicCatalogue.jsx', 'if you call'],
  ],
};
