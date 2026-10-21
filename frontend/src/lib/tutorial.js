/* ══════════════════════════════════════════════════════════════════════
   The getting-started tutorial: a new company's first order, step by step.

   Not a slideshow. Each step is something real to do on a real screen —
   add a customer, send a quotation, raise the invoice — and it ticks itself
   off when the thing exists (GET /setup/first-steps), whichever screen it
   was made on. "Show me" opens that screen and points at the button to
   press (`target`, matched against the button's text inside the page).

   A step a person's role cannot do (`resource`, write) is not shown, so an
   invited Sales person sees the selling steps and not the purchase orders.
   ══════════════════════════════════════════════════════════════════════ */

export const CHAPTERS = [
  { key: 'sell', title: 'Sell and get paid' },
  { key: 'buy', title: 'Buy and receive' },
  { key: 'team', title: 'Bring your team' },
];

export const STEPS = [
  {
    key: 'company', chapter: 'sell', resource: 'company-profile',
    title: 'Add your business details',
    line: 'Your name, GSTIN and bank details go on every quotation and invoice.',
    how: 'Fill in the business name, GSTIN and bank details, then press Save changes.',
    path: '/company-profile', target: null,
    done: (c) => c.company_name > 0 && c.company_gstin > 0 && c.company_bank > 0,
  },
  {
    key: 'customer', chapter: 'sell', resource: 'customers',
    title: 'Add your first customer',
    line: 'Who you sell to, with their state, so GST is worked out for you.',
    how: 'Press Add Customer, fill in the name and state, then Save.',
    path: '/customers', target: /^\s*\+?\s*Add\b/i,
    done: (c) => c.customers > 0,
  },
  {
    key: 'product', chapter: 'sell', resource: 'skus',
    title: 'Add a product you sell',
    line: 'Its name, unit, price and HSN, ready for every quotation.',
    how: 'Press Add SKU, fill in the name, unit, price and HSN, then Save.',
    path: '/items', target: /^\s*\+?\s*Add\b/i,
    done: (c) => c.products > 0,
  },
  {
    key: 'quotation', chapter: 'sell', resource: 'sales-quotations',
    title: 'Send your first quotation',
    line: 'Price the product for the customer. GST and the total are worked out.',
    how: 'Press New Quotation, choose the customer and the product, enter the quantity, then Create.',
    path: '/sales-quotations', target: /New Quotation/i,
    done: (c) => c.quotations > 0,
  },
  {
    key: 'order', chapter: 'sell', resource: 'customer-orders',
    title: 'Turn it into an order',
    line: 'When the customer says yes, one press makes the order with the same lines.',
    how: 'On the quotation’s row, press Convert.',
    path: '/sales-quotations', target: /^\s*Convert\s*$/i,
    done: (c) => c.orders > 0,
  },
  {
    key: 'invoice', chapter: 'sell', resource: 'sales-invoices',
    title: 'Raise the invoice',
    line: 'The order’s lines come across, and the invoice is numbered for you.',
    how: 'Click the order to open it, press Create Invoice, then Save.',
    path: '/customer-orders', target: null,
    done: (c) => c.invoices > 0,
  },
  {
    key: 'payment', chapter: 'sell', resource: 'sales-invoices',
    title: 'Record the payment',
    line: 'Mark what the customer paid. The balance due updates to the paisa.',
    how: 'Open the invoice, enter the amount under Record payment, then press Add.',
    path: '/sales-invoices', target: null,
    done: (c) => c.payments > 0,
  },
  {
    key: 'vendor', chapter: 'buy', resource: 'vendors',
    title: 'Add a vendor',
    line: 'Who you buy from, with their GSTIN.',
    how: 'Press Add vendor, fill in the name and GSTIN, then Save.',
    path: '/vendors', target: /Add vendor/i,
    done: (c) => c.vendors > 0,
  },
  {
    key: 'po', chapter: 'buy', resource: 'po',
    title: 'Raise a purchase order',
    line: 'Pick the items. The vendor’s own price fills in.',
    how: 'Press Create PO, choose the vendor, pick an item on line 1, then Raise Order.',
    path: '/purchase-orders', target: /Create PO/i,
    done: (c) => c.pos > 0,
  },
  {
    key: 'receipt', chapter: 'buy', resource: 'grn',
    title: 'Receive the goods',
    line: 'Book what arrived. Stock goes up as you save.',
    how: 'First press Approve, then Dispatch, on the PO’s row. Then choose the PO here, enter the quantity and press Generate GRN.',
    path: '/grn', target: /Generate GRN/i,
    done: (c) => c.grns > 0,
  },
  {
    key: 'team', chapter: 'team', resource: 'users',
    title: 'Invite a colleague',
    line: 'Each person gets a role that decides what they can see and do.',
    how: 'Press Add person, enter their email and choose a role. They get an email to join.',
    path: '/users', target: /Add person/i,
    done: (c) => c.team > 1,
  },
];
