/* 03 — build the catalogue: a product, the page, publish and share. */
export default {
  key: 'catalogue',
  title: 'Build the catalogue',
  kicker: 'Your products, on a page of their own',
  surface: 'app',
  path: '/catalogue',
  duration: 30000,
  beats: [
    { key: 'add', at: 0,
      voice: 'Add a product the way you would describe it: its photos, rate, minimum order and lead time.' },
    { key: 'page', at: 11000,
      voice: 'Choose the address, the headline, and whether prices show. Then pick what appears.' },
    { key: 'publish', at: 20500,
      voice: 'Publish it, and share the link on WhatsApp. Your catalogue is live, at your own address.' },
  ],
  sr: 'Building the catalogue: adding the SS304 Mounting Bracket with photos, code, unit, rate, HSN, category, minimum order and lead time; setting the page address, enquiry email, WhatsApp number and headline; listing six products; then publishing it at maksops.co.in/c/precision-fab and sharing it on WhatsApp.',
  seo: {
    body: 'Turn the products you make into a public catalogue: photos, a rate if you want one shown, minimum order, lead time and HSN, filtered by category. Publish it at your own address and share it on WhatsApp — no website to build, and no login for the people who use it.',
  },
  truth: [
    ['components/CatalogueAddProduct.jsx', 'Photographs'],
    ['components/CatalogueAddProduct.jsx', 'Becomes a filter.'],
    ['components/CatalogueAddProduct.jsx', 'List it straight away.'],
    ['components/CatalogueAddProduct.jsx', 'Minimum order'],
    ['components/CatalogueSettings.jsx', 'Where enquiries should go'],
    ['components/CatalogueSettings.jsx', 'Show prices publicly.'],
    ['components/CatalogueSettings.jsx', 'Your catalogue is live'],
    ['components/CatalogueSettings.jsx', 'Share on WhatsApp'],
  ],
};
