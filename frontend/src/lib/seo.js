/* ══════════════════════════════════════════════════════════════════════
   What search engines and link previews are told about each public page.

   One place, read twice: by the pages themselves (usePageMeta, as a visitor
   moves around the site) and by scripts/prerender.mjs, which writes each of
   these pages out as real HTML at build time — so a crawler, a WhatsApp or
   LinkedIn preview, or anything else that does not run JavaScript, gets the
   page's title, description and words rather than an empty <div>.

   Plain JavaScript (no JSX, no imports): Node reads this file directly.

   The brand is spelled two ways because people type it two ways: "MaksOps"
   (the logo and the domain) and "Maks Ops" (the copy). Titles lead with
   MaksOps, the domain people search; descriptions carry both.
   ══════════════════════════════════════════════════════════════════════ */

export const SITE = {
  url: 'https://www.maksops.co.in',          // the canonical host (the bare domain redirects here)
  name: 'MaksOps',
  alternateNames: ['Maks Ops', 'MaksOps.co.in', 'maksops'],
  tagline: 'From catalogue to cash',
  image: '/og-image.png',                    // 1200 × 630, for link previews
  locale: 'en_IN',
};

/* The public pages, in the order the sitemap lists them. Everything else
   (the app, sign-in, a customer's quote link) is served with noindex. */
export const PAGES = {
  '/': {
    title: 'MaksOps — Operations software for manufacturers in India',
    description: 'MaksOps (Maks Ops) runs a manufacturer’s whole order in one place: catalogue, GST quotations, vendor quote comparison, purchasing, stock, production and invoices.',
    priority: '1.0',
  },
  '/platform': {
    title: 'MaksOps platform — every module for manufacturers',
    description: 'Quotations, vendor quotes and comparison, purchase orders, goods receipt, stock, production yield, GST invoicing and a public catalogue: what each part of MaksOps does.',
    priority: '0.9',
  },
  '/how-it-works': {
    title: 'How MaksOps works — from enquiry to GST invoice',
    description: 'One order through MaksOps, step by step: an enquiry from your catalogue, the quotation, the order, buying what is short, the goods receipt, production and the GST invoice.',
    priority: '0.8',
  },
  '/see-maksops': {
    title: 'See MaksOps at work — the product film',
    description: 'Watch MaksOps run a fabrication business start to finish: catalogue, enquiry, quotation, vendor quotes, purchasing, goods receipt, production, dispatch and the tax invoice.',
    priority: '0.8',
  },
  '/get-started': {
    title: 'Get started with MaksOps',
    description: 'Start MaksOps with your own company, or explore it first with sample data already in it. No credit card, and every module is included.',
    priority: '0.7',
  },
};

/* Structured data for the homepage: who makes it, what the site is called
   (the name Google shows above a result), and what the product is. */
export const jsonLd = () => [
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${SITE.url}/#organization`,
    name: SITE.name,
    alternateName: SITE.alternateNames,
    url: `${SITE.url}/`,
    logo: `${SITE.url}/icon-512.png`,
  },
  {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE.url}/#website`,
    name: SITE.name,
    alternateName: SITE.alternateNames,
    url: `${SITE.url}/`,
    inLanguage: 'en-IN',
    publisher: { '@id': `${SITE.url}/#organization` },
  },
  {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SITE.name,
    alternateName: SITE.alternateNames,
    url: `${SITE.url}/`,
    applicationCategory: 'BusinessApplication',
    applicationSubCategory: 'Manufacturing operations and ERP',
    operatingSystem: 'Web browser',
    description: PAGES['/'].description,
    publisher: { '@id': `${SITE.url}/#organization` },
    featureList: [
      'Public product catalogue and enquiries',
      'Quotations with GST by place of supply',
      'Vendor quotations read from Excel, PDF or Word, compared like for like',
      'Purchase orders with sign-off',
      'Goods receipt and live stock',
      'Production with yield and scrap',
      'Delivery challans and e-way bill numbers',
      'GST tax invoices and payments',
    ],
  },
];
