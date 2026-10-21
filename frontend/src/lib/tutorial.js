/* ══════════════════════════════════════════════════════════════════════
   The getting-started tutorial: a new company's first sale, step by step.

   Not a slideshow. Each step is something real to do on a real screen —
   add a customer, send a quotation, raise the invoice — and it ticks itself
   off when the thing exists (GET /setup/first-steps), whichever screen it
   was made on. "Show me" opens that screen and points at the button to
   press (`target`, matched against the button's text inside the page).
   `follow`: the step takes more than one press (Approve, then Dispatch, then
   Receive GRN) or its button appears only after a click (an order's row
   opens to show Create Invoice), so the pointer keeps looking.
   `to`: the exact screen when the step works on what the last one made —
   the order just converted, the invoice just raised — instead of a list to
   find it in.

   Short on purpose. The first chapter (`core`) is the whole of it for most
   people: six small steps from a customer to a paid invoice, about three
   minutes. Each asks only for what the screen requires. Everything else —
   GSTIN and bank details, buying, the team — waits under "When you are
   ready", one or two minutes each, and nobody is asked to do it up front.

   A step a person's role cannot do (`resource`, write) is not shown, so an
   invited Sales person sees the selling steps and not the purchase orders.
   ══════════════════════════════════════════════════════════════════════ */

export const CHAPTERS = [
  { key: 'sell', title: 'Your first sale', note: 'about 3 minutes', core: true },
  { key: 'more', title: 'When you are ready', note: 'a minute or two each' },
];

export const STEPS = [
  /* ── Your first sale ── */
  {
    key: 'customer', chapter: 'sell', resource: 'customers',
    title: 'Add a customer',
    line: 'Who you sell to. Their state decides the GST.',
    how: 'Press Add Customer, type the name and the billing state, then press Add.',
    path: '/customers', target: /^\s*\+?\s*Add\b/i,
    done: (c) => c.customers > 0,
  },
  {
    key: 'product', chapter: 'sell', resource: 'skus',
    title: 'Add a product',
    line: 'Something you sell, with its price.',
    how: 'Press Add SKU, type the name and the price, then press Add.',
    path: '/items', target: /^\s*\+?\s*Add\b/i,
    done: (c) => c.products > 0,
  },
  {
    key: 'quotation', chapter: 'sell', resource: 'sales-quotations',
    title: 'Make a quotation',
    line: 'GST and the total are worked out for you.',
    how: 'Press New Quotation, choose the customer and the product, enter a quantity, then press Create Quotation.',
    path: '/sales-quotations', target: /New Quotation/i,
    done: (c) => c.quotations > 0,
  },
  {
    key: 'order', chapter: 'sell', resource: 'customer-orders',
    title: 'Turn it into an order',
    line: 'The customer said yes: one press.',
    how: 'On the quotation’s row, press Convert.',
    path: '/sales-quotations', target: /^\s*Convert\s*$/i,
    done: (c) => c.orders > 0,
  },
  {
    key: 'invoice', chapter: 'sell', resource: 'sales-invoices',
    title: 'Raise the invoice',
    line: 'The order’s lines come across, numbered for you.',
    how: 'Check the lines, then press Create invoice at the bottom.',
    path: '/customer-orders', target: /^\s*Create invoice/i, follow: true,
    to: (c) => c.latest_order_id && `/customer-orders/${c.latest_order_id}/invoice`,
    done: (c) => c.invoices > 0,
  },
  {
    key: 'payment', chapter: 'sell', resource: 'sales-invoices',
    title: 'Record the payment',
    line: 'The balance due updates to the paisa.',
    how: 'Enter the amount the customer paid under Record payment, then press Add.',
    path: '/sales-invoices', target: /^\s*\+?\s*Add\s*$/, follow: true,
    to: (c) => c.latest_invoice_id && `/sales-invoices/${c.latest_invoice_id}`,
    done: (c) => c.payments > 0,
  },

  /* ── When you are ready ── */
  {
    key: 'company', chapter: 'more', resource: 'company-profile',
    title: 'Add your GSTIN and bank details',
    line: 'Before your first real invoice: they print on every one.',
    how: 'Fill in the GSTIN and the bank name, account number and IFSC, then press Save changes.',
    path: '/company-profile', target: null,
    done: (c) => c.company_name > 0 && c.company_gstin > 0 && c.company_bank > 0,
  },
  {
    key: 'vendor', chapter: 'more', resource: 'vendors',
    title: 'Add a vendor',
    line: 'Who you buy from.',
    how: 'Press Add vendor, type the name and GSTIN, then press Add vendor at the bottom of the form.',
    path: '/vendors', target: /Add vendor/i,
    done: (c) => c.vendors > 0,
  },
  {
    key: 'po', chapter: 'more', resource: 'po',
    title: 'Raise a purchase order',
    line: 'What you are buying, from whom, at what price.',
    how: 'Press Create PO, choose the vendor and give it a title. On line 1 pick the item, enter the quantity and price, then press Raise Order.',
    path: '/purchase-orders', target: /Create PO/i,
    done: (c) => c.pos > 0,
  },
  {
    key: 'receipt', chapter: 'more', resource: 'grn',
    title: 'Receive the goods',
    line: 'Book what arrived. Stock goes up.',
    how: 'On the order’s row press Approve, then Dispatch, then Receive GRN. (A large order asks for Sign off first.)',
    path: '/purchase-orders', target: /^\s*(Sign off|Approve|Dispatch|Receive GRN)\s*$/, follow: true,
    done: (c) => c.grns > 0,
  },
  {
    key: 'team', chapter: 'more', resource: 'users',
    title: 'Invite a colleague',
    line: 'Their role decides what they see and do.',
    how: 'Press Add person, type their name and email, choose a role, then press Send invitation.',
    path: '/users', target: /Add person/i,
    done: (c) => c.team > 1,
  },
];

export const CORE = new Set(CHAPTERS.filter(c => c.core).map(c => c.key));
