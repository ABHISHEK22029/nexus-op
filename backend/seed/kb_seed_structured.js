/* Rich, STRUCTURED KB content — adoption knowledge (grounded in the Hi-MAK
   case study) + key procedures rewritten as steps. The article page renders
   structured.steps as a numbered stepper; body (auto-derived here) mirrors it
   as prose so Ask AI + full-text search stay grounded.
   Run: node seed/kb_seed_structured.js   (upserts by slug, sets `structured`) */
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// Build a prose markdown body from the structured content (single source of truth).
function buildBody(s) {
  const p = [];
  if (s.overview) p.push(s.overview);
  if (s.whatYouNeed?.length) { p.push('## What you\'ll need'); s.whatYouNeed.forEach(w => p.push('- ' + w)); }
  if (s.steps?.length) { p.push('## How to do it'); s.steps.forEach((st, i) => p.push(`${i + 1}. **${st.title}** — ${st.detail}`)); }
  if (s.keyPoints?.length) { p.push('## Key points'); s.keyPoints.forEach(k => p.push('- ' + k)); }
  if (s.tips?.length) { p.push('## Tips'); s.tips.forEach(t => p.push('- ' + t)); }
  if (s.faqs?.length) { p.push('## FAQs'); s.faqs.forEach(f => p.push(`**${f.q}** ${f.a}`)); }
  return p.join('\n\n');
}

const A = [
  // ═══════════ ORIENTATION / MINDSET (Hi-MAK: fragmented tools → one system) ═══════════
  {
    slug: 'why-nexus-op', title: 'Why Nexus-OP: from scattered tools to one connected flow', category: 'Overview', article_type: 'Guide',
    summary: 'The real problem for a growing SME isn\'t missing software — it\'s that Excel, Tally and per-department logs don\'t talk to each other.',
    keywords: 'why, benefits, connected, single source of truth, excel, tally, silos, integration, transformation',
    tags: ['overview', 'adoption'],
    structured: {
      overview: 'Most growing SMEs already have "software" — an old ERP, Excel sheets, Word docs, Tally, and a separate log in every department. The pain isn\'t a missing tool; it\'s that none of them are connected. The same data gets typed three times, reports are stitched together by hand, and nobody has one true picture. Nexus-OP replaces that patchwork with a single connected flow, so information you enter once follows the work from order to payment.',
      keyPoints: [
        'One entry, reused everywhere — a customer order feeds quotations, production, GRN and the invoice without re-typing.',
        'A single source of truth — everyone sees the same live numbers instead of emailing spreadsheets.',
        'Less duplicate work and fewer reconciliation errors.',
        'Real-time visibility for decisions — no more manually consolidating department reports.',
      ],
      faqs: [
        { q: 'Do we have to stop using Tally?', a: 'You can keep accounting where it is at first. Start with the operational flow (orders → procurement → production → billing) in Nexus-OP, and export what your accountant needs.' },
        { q: 'Is this a big-bang switch?', a: 'It doesn\'t have to be. Start with one flow (say customer orders → invoices), get comfortable, then add procurement and production.' },
      ],
    },
  },
  {
    slug: 'the-connected-flow', title: 'The connected flow — your single source of truth', category: 'Overview', article_type: 'Guide',
    summary: 'How one customer order flows through the whole system so every team works from the same data.',
    keywords: 'flow, connected, order to cash, single source, integration, end to end',
    tags: ['overview', 'flow'],
    structured: {
      overview: 'Everything in Nexus-OP hangs off one thread: the customer order. Follow it and you\'ll see how each team\'s work links to the next — no re-keying, no separate logs.',
      steps: [
        { title: 'A customer order is logged', detail: 'Sales records the PO the customer placed. This is the anchor everything links back to.' },
        { title: 'Each line is made or bought', detail: 'Fabricate in-house with a production order (using the SKU recipe), or raise vendor quotations and a purchase order.' },
        { title: 'Goods are received (GRN)', detail: 'When material arrives against a PO, a GRN updates inventory automatically.' },
        { title: 'Production consumes and outputs', detail: 'The shop floor records material consumed, finished output and scrap — yield and cost per unit are computed live.' },
        { title: 'The customer is invoiced', detail: 'A GST sales invoice is raised from the same order; payments and overdue reminders track receivables.' },
        { title: 'Management sees it live', detail: 'Dashboards, reports and Ask AI read the same data — one true picture, in real time.' },
      ],
      keyPoints: ['Data entered once flows the whole way through.', 'Each record links to the one before it, so nothing is an island.'],
    },
  },
  {
    slug: 'avoid-pitfalls', title: 'Common pitfalls (and how to avoid them)', category: 'Overview', article_type: 'Guide',
    summary: 'The mistakes that stall SME ERP adoption — and the simple habits that prevent them.',
    keywords: 'pitfalls, mistakes, best practices, adoption, tips, clean data',
    tags: ['overview', 'adoption'],
    structured: {
      overview: 'The Hi-MAK case is clear: the software rarely fails — adoption does. These are the traps to avoid.',
      keyPoints: [
        'Keeping a "shadow" Excel on the side — pick Nexus-OP as the source of truth or the silos come straight back.',
        'Skipping master setup — thin customer/vendor/SKU data makes every later screen painful. Set masters up first.',
        'Not entering GSTIN/state — GST (CGST/SGST vs IGST) depends on it; fill it in once and billing is automatic.',
        'One person doing all data entry — let each role own their step, like Hi-MAK\'s department involvement.',
        'No training — schedule short, role-based sessions; ~90% of Hi-MAK\'s staff adapted because of this.',
      ],
      tips: ['Stuck on any screen? The Ask AI button (bottom-right) answers from your own data and these guides.'],
    },
  },

  // ═══════════ ONBOARDING (Hi-MAK: manual entry, NO import; requirement gathering) ═══════════
  {
    slug: 'first-week-setup', title: 'Your first week: a setup checklist', category: 'Overview', article_type: 'How-to',
    summary: 'A short, ordered path to a working system — masters first, then your first live order.',
    keywords: 'setup, getting started, first week, checklist, onboarding, go live',
    tags: ['overview', 'onboarding'],
    structured: {
      overview: 'Don\'t boil the ocean. Follow this order and you\'ll have a real, working flow within a week — set the foundations first, then run one order end to end.',
      whatYouNeed: ['Your list of customers and vendors (a spreadsheet is fine)', 'Your main products/parts and the materials they use', 'Your company GSTIN and state'],
      steps: [
        { title: 'Invite your team and set roles', detail: 'System → Team & Access. Give each person the right role so they see only what they need.' },
        { title: 'Add your masters', detail: 'Create Customers, Vendors, SKUs and Raw Materials — or bulk-import them from CSV (see "Bringing your Excel/Tally data in").' },
        { title: 'Set recipes (BOM) for what you fabricate', detail: 'On each SKU you make in-house, click Recipe and list the materials per unit.' },
        { title: 'Create your first project', detail: 'Project → Projects. Select it as the active project in the top bar.' },
        { title: 'Run one real order end to end', detail: 'Log a customer order, Make or raise a quotation, receive a GRN, then invoice — so the whole team sees the flow once.' },
        { title: 'Turn on the helpers', detail: 'Set a PO approval threshold and any recurring bills under System → Automation.' },
      ],
      faqs: [{ q: 'Where do I start if I only have an hour?', a: 'Add 2–3 customers, 2–3 SKUs, and log one customer order. Seeing one order flow through is the fastest way to "get it".' }],
    },
  },
  {
    slug: 'migrate-your-data', title: 'Bringing your Excel / Tally data in', category: 'System', article_type: 'How-to',
    summary: 'Bulk-load your existing customers, vendors, SKUs and materials with CSV import — no manual re-typing.',
    keywords: 'import, migrate, excel, tally, csv, bulk, upload, data transfer, onboarding',
    tags: ['system', 'onboarding', 'data'],
    structured: {
      overview: 'Hi-MAK\'s biggest day-to-day pain was manual data entry with no import facility. Nexus-OP fixes that: bring your existing lists in from CSV instead of typing them again.',
      whatYouNeed: ['Your existing data exported to CSV (from Excel or Tally)', 'A column for each field you want to load (e.g. name, GSTIN, state)'],
      steps: [
        { title: 'Export from your current tool', detail: 'From Excel/Tally, save the list (customers, vendors, items) as a .csv file.' },
        { title: 'Open Import Data', detail: 'Go to System → Import Data and choose what you\'re importing.' },
        { title: 'Upload the CSV', detail: 'Select your file. Nexus-OP parses the rows and shows you a preview.' },
        { title: 'Review and confirm', detail: 'Check the parsed rows look right, then confirm to create them all in bulk.' },
        { title: 'Spot-check the result', detail: 'Open the matching master screen (e.g. Customers) and confirm the records landed.' },
      ],
      tips: ['Import masters first (customers, vendors, SKUs, materials) — everything downstream reuses them.'],
      faqs: [{ q: 'What if my columns don\'t match?', a: 'Rename the CSV headers to match the fields, keep one record per row, and re-upload.' }],
    },
  },
  {
    slug: 'role-playbooks', title: 'Who does what — a day in the life per role', category: 'Setup', article_type: 'Guide',
    summary: 'Each department owns its step, like Hi-MAK\'s cross-department involvement — here\'s what each role does daily.',
    keywords: 'roles, playbook, department, day in the life, responsibilities, workflow, team',
    tags: ['setup', 'adoption', 'roles'],
    structured: {
      overview: 'Adoption sticks when every role knows their part of the flow. Give people the right role (Team & Access) and this is their daily beat.',
      keyPoints: [
        'Sales — log customer orders, raise quotations for buy-out items, create invoices, chase overdue payments.',
        'Procurement / Engineer — compare vendor quotes, raise POs, record GRNs, watch inventory.',
        'Production — take Make orders, record consumption/output/scrap, keep yield healthy.',
        'Finance — issue GST invoices and RA bills, record payments, run reports, set recurring bills.',
        'Manager / Admin — approve high-value POs, set the approval threshold and automation, watch the dashboard.',
      ],
      faqs: [{ q: 'Can one person cover several roles?', a: 'Yes — a small team member can hold Manager or Admin and do it all. Split roles as you grow.' }],
    },
  },
  {
    slug: 'rollout-change-management', title: 'Rolling Nexus-OP out to your team', category: 'Setup', article_type: 'How-to',
    summary: 'A short change-management playbook — the part that decided Hi-MAK\'s ~90% adoption.',
    keywords: 'rollout, change management, training, adoption, go live, resistance, team',
    tags: ['setup', 'adoption'],
    structured: {
      overview: 'The Hi-MAK case is blunt: the software was fine; adoption was the challenge. A little change management is what gets your team actually using it.',
      steps: [
        { title: 'Name an owner', detail: 'Pick one person (or a small team, like Hi-MAK\'s ERP team) to champion the rollout and answer questions.' },
        { title: 'Involve each department early', detail: 'Ask each team what they do today; map it to a Nexus-OP screen so they see themselves in it.' },
        { title: 'Set masters and import data first', detail: 'Go live on a system that already has your customers, vendors and items — not an empty one.' },
        { title: 'Run short, role-based training', detail: 'Keep sessions to each role\'s daily flow. Point everyone at Smart Knowledge + Ask AI for self-serve help.' },
        { title: 'Start with one flow, then expand', detail: 'Prove it on orders → invoices, celebrate the win, then add procurement and production.' },
        { title: 'Support the first weeks', detail: 'Expect some resistance; keep answering questions. Continuous support is what turned Hi-MAK\'s doubters around.' },
      ],
      keyPoints: ['ERP is a business change, not just a tool.', 'User adoption — not features — decides success.'],
    },
  },

  // ═══════════ CORE PROCEDURES (structured, with numbered steppers) ═══════════
  {
    slug: 'customer-orders', title: 'Logging a customer order', category: 'Sales', article_type: 'How-to',
    summary: 'Record the PO your customer places with you — the anchor the whole flow links back to.',
    keywords: 'customer order, sales order, customer PO, order, create',
    tags: ['sales', 'orders'],
    structured: {
      overview: 'A customer order is the PO your customer gives you. It\'s the anchor of the whole flow — quotations, production and invoices all link back to it, so you enter the details once and reuse them everywhere.',
      whatYouNeed: ['The customer added under Sales → Customers', 'The customer\'s PO reference and date', 'The parts/SKUs and quantities ordered'],
      steps: [
        { title: 'Open the new-order form', detail: 'Go to Sales → Customer Orders and click New Order.' },
        { title: 'Pick the customer', detail: 'Choose the customer. If they\'re not listed, add them first under Sales → Customers.' },
        { title: 'Enter the PO reference', detail: 'Add the customer\'s PO number and order date so you can trace it later.' },
        { title: 'Add the line items', detail: 'For each part, pick a SKU (auto-fills description, unit and price) or type it free-hand, with quantity and target price.' },
        { title: 'Create the order', detail: 'Save — the order starts in the Open status.' },
        { title: 'Drive the next step', detail: 'Expand the order and, per line, choose Make (fabricate in-house), Raise Quotation (buy from vendors), or Create Invoice (bill the customer).' },
      ],
      keyPoints: ['One order links to everything downstream.', 'Status moves Open → In Procurement → Delivered → Closed.'],
      faqs: [
        { q: 'Can I mix make and buy on one order?', a: 'Yes — choose Make on some lines and Raise Quotation on others.' },
        { q: 'Do I need a SKU?', a: 'No, free text works, but a SKU pre-fills price/unit and enables recipes (BOM) for Make.' },
      ],
    },
  },
  {
    slug: 'quotations', title: 'Comparing vendor quotations (Q1/Q2/Q3)', category: 'Procurement', article_type: 'How-to',
    summary: 'Source a part from multiple vendors, compare, and turn the winner into a PO.',
    keywords: 'quotation, RFQ, vendor quote, compare, Q1 Q2 Q3, generate PO',
    tags: ['procurement', 'quotations'],
    structured: {
      overview: 'Quotations let you price a part with several vendors before committing to a purchase order.',
      whatYouNeed: ['The part/quantity to source (often from a customer-order line)', 'Your vendors added under Procurement → Vendors'],
      steps: [
        { title: 'Raise the quotation', detail: 'From a customer-order line click Raise Quotation, or add one manually under Procurement → Quotations.' },
        { title: 'Capture vendor quotes', detail: 'Record up to three quotes (Q1, Q2, Q3) per part with rate and lead time.' },
        { title: 'Compare and select', detail: 'Review the quotes side by side and select the winning vendor.' },
        { title: 'Generate the PO', detail: 'From the selected quote, click Generate PO — it pre-fills the vendor, part, quantity and rate.' },
      ],
      faqs: [{ q: 'Do I have to get three quotes?', a: 'No — one is enough. Three just makes the comparison meaningful.' }],
    },
  },
  {
    slug: 'purchase-orders', title: 'Creating a vendor Purchase Order (with GST)', category: 'Procurement', article_type: 'How-to',
    summary: 'Issue a PO to a vendor; GST (CGST+SGST or IGST) is derived from the vendor\'s state — nothing hardcoded.',
    keywords: 'purchase order, PO, vendor, GST, CGST, SGST, IGST, approval',
    tags: ['procurement', 'po', 'gst'],
    structured: {
      overview: 'A Purchase Order is your order to a vendor. Whatever GST rate you enter is what\'s used, and the CGST/SGST vs IGST split is worked out from the vendor\'s GSTIN state.',
      whatYouNeed: ['The vendor (with GSTIN/state) added under Procurement → Vendors', 'The item, quantity and agreed rate'],
      steps: [
        { title: 'Start the PO', detail: 'Go to Procurement → Purchase Orders → New, or Generate PO from a selected quotation.' },
        { title: 'Add the line items', detail: 'Enter each item with quantity and rate.' },
        { title: 'Set the GST rate', detail: 'Enter the GST rate you agreed with the vendor — it flows straight into the totals.' },
        { title: 'Save and review', detail: 'The taxable value, GST split (CGST+SGST intra-state, IGST inter-state) and total are computed for you.' },
        { title: 'Get sign-off if needed', detail: 'If the value is over your approval threshold, the PO is held Pending Approval until an Admin/Manager signs it off.' },
      ],
      keyPoints: ['GST split comes from the vendor state vs your company state.', 'The PO invoice prints clean black-and-white like an RA bill.'],
      faqs: [{ q: 'Why is my PO stuck on "Pending Approval"?', a: 'Its value is above the approval threshold set in Automation. An Admin or Manager needs to sign it off.' }],
    },
  },
  {
    slug: 'grn', title: 'Recording a GRN (goods receipt)', category: 'Procurement', article_type: 'How-to',
    summary: 'Log what actually arrived from the vendor against a PO — inventory updates automatically.',
    keywords: 'GRN, goods receipt, receiving, inward, delivery, inventory, bill',
    tags: ['procurement', 'grn', 'inventory'],
    structured: {
      overview: 'A GRN (Goods Receipt Note) records material received against a Purchase Order and updates your stock.',
      whatYouNeed: ['The PO the goods are against', 'The quantities actually received (and vehicle/batch if you track them)'],
      steps: [
        { title: 'Open GRN', detail: 'Go to Procurement → GRN.' },
        { title: 'Create against the PO', detail: 'Start a GRN for the relevant purchase order.' },
        { title: 'Enter received quantities', detail: 'Record what actually arrived (which may differ from what was ordered).' },
        { title: 'Save', detail: 'Inventory increases automatically and your team is notified.' },
        { title: 'Generate the bill (optional)', detail: 'From the GRN, generate a customizable GRN bill — edit lines, rates, GST and charges before finalising.' },
      ],
      faqs: [{ q: 'What if I received less than ordered?', a: 'Enter the actual received quantity — the GRN records the real receipt, not the ordered amount.' }],
    },
  },
  {
    slug: 'production-bom', title: 'Production, Recipes (BOM) and Make-from-order', category: 'Production', article_type: 'How-to',
    summary: 'Set a recipe on a SKU, then Make it from a customer order — material to consume is pre-filled.',
    keywords: 'production, BOM, bill of materials, recipe, make, fabricate, consume',
    tags: ['production', 'bom', 'fabrication'],
    structured: {
      overview: 'Nexus-OP can fabricate items in-house. Set a recipe (bill of materials) once, and every time you Make that product the system knows what to consume.',
      whatYouNeed: ['The SKU you fabricate (Catalog → SKUs)', 'The raw materials it uses (Catalog → Raw Materials)', 'An active project selected in the top bar'],
      steps: [
        { title: 'Set the recipe (BOM)', detail: 'On Catalog → SKUs, click Recipe on the product and add each raw material with its quantity per unit (e.g. 4 kg MS Angle per cross-arm).' },
        { title: 'Open the customer order', detail: 'Go to Sales → Customer Orders and expand the order you\'re fulfilling.' },
        { title: 'Click Make on the line', detail: 'Nexus-OP creates a production order and pre-fills consumption = recipe × ordered quantity (e.g. 4 kg × 200 = 800 kg).' },
        { title: 'Run production', detail: 'On the production order, record material consumed, finished output and scrap — see "Running a production order".' },
      ],
      keyPoints: ['A production order links back to the customer order it fulfils (traceability badge).', 'No active project selected? Pick one in the top bar first.'],
      faqs: [{ q: 'The Make button did nothing about materials — why?', a: 'That SKU has no recipe yet. Set one on Catalog → SKUs → Recipe and Make again.' }],
    },
  },
  {
    slug: 'production-run', title: 'Running a production order', category: 'Production', article_type: 'How-to',
    summary: 'Record consumption, output and scrap; read live yield and cost per unit.',
    keywords: 'production, run, consume, output, scrap, remnant, yield, cost per unit',
    tags: ['production', 'fabrication'],
    structured: {
      overview: 'Once a production order exists (via Make, or created manually), you record what actually happened on the floor — and the yield panel shows efficiency and true cost live.',
      steps: [
        { title: 'Record material consumed', detail: 'Add each raw material issued, with quantity and rate. This reduces inventory.' },
        { title: 'Record finished output', detail: 'Enter the pieces and/or weight produced.' },
        { title: 'Log scrap and remnant', detail: 'Capture sellable scrap (with sale value) or reusable remnant separately.' },
        { title: 'Read the yield panel', detail: 'See live Yield %, Recovered %, Scrap %, unaccounted loss, net material cost and cost per unit.' },
        { title: 'Move the status', detail: 'Advance Planned → In Progress → Completed as the job proceeds.' },
      ],
      keyPoints: ['Cost per unit reflects real consumption minus scrap recovery.', 'Unaccounted loss flags entries that don\'t balance.'],
    },
  },
  {
    slug: 'sales-invoices', title: 'Raising a customer tax invoice', category: 'Billing', article_type: 'How-to',
    summary: 'Bill your customer with a GST invoice prefilled from the order; then record payments.',
    keywords: 'sales invoice, tax invoice, GST invoice, bill customer, receivable, payment',
    tags: ['billing', 'invoices', 'gst'],
    structured: {
      overview: 'A Sales Invoice is your GST bill to a customer. Raise it straight from a customer order and the lines carry over.',
      whatYouNeed: ['The customer order to bill (or the customer with GSTIN/state)', 'Any discount, GST rate and payment terms'],
      steps: [
        { title: 'Start the invoice', detail: 'From a customer order click Create Invoice (lines prefill), or go to Sales → Sales Invoices.' },
        { title: 'Set discount, GST and round-off', detail: 'CGST/SGST vs IGST is derived from the customer\'s GSTIN state; the net shows in words.' },
        { title: 'Save the invoice', detail: 'It starts as Draft; the order moves toward Delivered.' },
        { title: 'Record payments', detail: 'Open the invoice and add a payment (amount, mode, reference). Status auto-updates Draft → Partially Paid → Paid.' },
      ],
      keyPoints: ['Overdue, unpaid invoices trigger an automatic reminder to admins.'],
      faqs: [{ q: 'Where do I see who owes me money?', a: 'Ask AI "which invoices are overdue?" or check Sales → Sales Invoices for unpaid ones.' }],
    },
  },
  {
    slug: 'sales-quotations', title: 'Quoting a customer (and winning the order)', category: 'Sales', article_type: 'How-to',
    summary: 'Send a customer a priced quotation, then convert a won quote straight into a customer order.',
    keywords: 'quotation, quote, proposal, estimate, customer quote, convert to order, sales quotation',
    tags: ['sales', 'quotations'],
    structured: {
      overview: 'A customer quotation is the price you offer a client before they place an order. When they accept, one click turns it into a Customer Order — no re-typing — so the whole flow starts clean.',
      whatYouNeed: ['The customer added under Sales → Customers (with GSTIN/state for correct GST)', 'The products/parts, quantities and your rates'],
      steps: [
        { title: 'Open the new-quotation form', detail: 'Go to Sales → Sales Quotations and click New Quotation.' },
        { title: 'Pick the customer and validity', detail: 'Choose the customer and (optionally) a "valid until" date. GST (CGST/SGST vs IGST) is derived from their state.' },
        { title: 'Add priced line items', detail: 'For each item pick a SKU (auto-fills rate) or type it, with quantity and rate. The running total and GST preview as you type.' },
        { title: 'Set discount and terms', detail: 'Add any discount and your terms/validity note, then Create Quotation — it gets a number like QT-0001.' },
        { title: 'Send and track', detail: 'Open it to print/share, and move its status Draft → Sent → Accepted as the deal progresses.' },
        { title: 'Convert the won quote', detail: 'When accepted, click Convert — Nexus-OP creates a Customer Order with the same lines and marks the quote Converted.' },
      ],
      keyPoints: ['A converted quote links to the order it created.', 'You can only convert a quote once.'],
      faqs: [
        { q: 'What is the difference from vendor Quotations?', a: 'Sales Quotations are what YOU send customers. The vendor Quotations (Q1/Q2/Q3) under Procurement are for comparing supplier prices when you buy.' },
        { q: 'Is a quotation a tax invoice?', a: 'No — it is a price offer. The GST invoice is raised later, after the order is fulfilled.' },
      ],
    },
  },
  {
    slug: 'delivery-challans', title: 'Dispatching goods (delivery challan)', category: 'Sales', article_type: 'How-to',
    summary: 'Create the goods-out note when you dispatch to a customer — with transporter, vehicle and value for the e-way bill.',
    keywords: 'delivery challan, dispatch, goods, DC, transporter, vehicle, e-way bill, despatch',
    tags: ['sales', 'dispatch'],
    structured: {
      overview: 'A delivery challan is the document that travels with the goods when you dispatch to a customer. It is not a tax invoice — it records what is being sent, by which vehicle, and the value of the goods (which feeds the e-way bill).',
      whatYouNeed: ['The customer receiving the goods', 'What is being dispatched (from the order, if any)', 'Transporter and vehicle details'],
      steps: [
        { title: 'Open the challan form', detail: 'Go to Sales → Delivery Challans and click New Challan.' },
        { title: 'Prefill from the order (optional)', detail: 'Pick the customer order to copy its customer and items, so you are not retyping.' },
        { title: 'Add dispatch details', detail: 'Enter the transporter (dispatch through), vehicle number, LR/docket number and place of supply.' },
        { title: 'Confirm the items and value', detail: 'Adjust the items and their value (the value carries to the e-way bill). Create Challan — it gets a number like DC-0001.' },
        { title: 'Mark it Dispatched', detail: 'Set the status to Dispatched when the goods leave; the linked order moves to Delivered and admins are notified. Print the challan to travel with the vehicle.' },
      ],
      keyPoints: ['A challan is a delivery note, not a tax invoice — raise the GST invoice separately.', 'The goods value on the challan is what an e-way bill needs.'],
      faqs: [{ q: 'Do I raise the invoice before or after the challan?', a: 'Usually the challan travels with the goods; the tax invoice can be raised at dispatch or after delivery, per your practice.' }],
    },
  },
  {
    slug: 'credit-debit-notes', title: 'Credit & debit notes (returns and corrections)', category: 'Billing', article_type: 'How-to',
    summary: 'Issue a credit note to a customer or a debit note to a vendor for returns, short-supply or rate corrections.',
    keywords: 'credit note, debit note, return, adjustment, correction, short supply, CN, DN',
    tags: ['billing', 'gst'],
    structured: {
      overview: 'When something changes after a bill is raised — goods returned, short supply, a wrong rate — you issue a note. A credit note reduces what a customer owes you; a debit note reduces what you owe a vendor. Both are proper GST documents.',
      whatYouNeed: ['The customer or vendor involved', 'The original invoice / bill number it adjusts', 'What is being adjusted and by how much'],
      steps: [
        { title: 'Open the note form', detail: 'Go to Billing → Credit/Debit Notes and click New Note.' },
        { title: 'Choose the note type', detail: 'Credit Note (to a customer) or Debit Note (to a vendor). The party list switches to match.' },
        { title: 'Pick the party and reference', detail: 'Select the customer/vendor and enter the invoice or bill it is against (e.g. INV-0007 or GB-0003).' },
        { title: 'State the reason and lines', detail: 'Add the reason (e.g. "1 unit returned — damaged") and the line items with GST. The total previews as you type.' },
        { title: 'Create and print', detail: 'Create the note (numbered CN-0001 / DN-0001) and open it to print or share.' },
      ],
      keyPoints: ['Credit note = money back to the customer; debit note = money back from the vendor.', 'GST (CGST/SGST vs IGST) follows the party\'s state, like your invoices.'],
      faqs: [{ q: 'Does a credit note change the invoice balance automatically?', a: 'The note is a document now; your statements and the accounting/Tally export (coming next) net it against the invoice.' }],
    },
  },
  {
    slug: 'vendor-payments', title: 'Paying vendors (Accounts Payable)', category: 'Billing', article_type: 'How-to',
    summary: 'Track what you owe vendors from GRN bills, see ageing, and record payments.',
    keywords: 'payables, accounts payable, vendor payment, pay vendor, ageing, outstanding, AP, dues',
    tags: ['billing', 'procurement', 'payments'],
    structured: {
      overview: 'Payables is the money-out mirror of your customer invoices. Every GRN bill you generate becomes a payable; the Payables page shows what is outstanding, how overdue it is, and lets you record payments.',
      whatYouNeed: ['A GRN bill for the goods received (Procurement → GRN → generate bill)', 'The payment amount, mode and reference'],
      steps: [
        { title: 'Open Payables', detail: 'Go to Billing → Payables. You see total payable, an ageing breakdown (0–30 / 31–60 / 61–90 / 90+ days) and the vendors you owe most.' },
        { title: 'Find the bill', detail: 'The outstanding-bills table lists each unpaid GRN bill with its vendor, due date, net, paid and outstanding amounts. Overdue bills are flagged.' },
        { title: 'Record a payment', detail: 'Click Pay on a bill, enter the amount (defaults to the outstanding), mode (Bank/NEFT/UPI/Cheque/Cash), date and reference, then Record payment.' },
        { title: 'Watch the status update', detail: 'The bill moves Unpaid → Partially Paid → Paid automatically, and admins get a notification.' },
      ],
      keyPoints: ['Payables come from GRN bills — generate a bill from a GRN first.', 'Ageing buckets help you pay the most overdue vendors first.'],
      faqs: [{ q: 'How do I see what I owe overall?', a: 'The Total payable figure on the Payables page, or ask Ask AI "what do I owe vendors?".' }],
    },
  },
  {
    slug: 'skus-create', title: 'Creating a product (SKU)', category: 'Catalog', article_type: 'How-to',
    summary: 'Add the products/parts you quote, sell and (optionally) fabricate.',
    keywords: 'SKU, product, part, create, add, catalog, HSN, recipe, BOM',
    tags: ['catalog', 'masters'],
    structured: {
      overview: 'SKUs are the products/parts in your catalog — what you put on customer orders and invoices. Set them up once and reuse them everywhere.',
      whatYouNeed: ['The product name and unit', 'HSN code (for GST) and a price, if known'],
      steps: [
        { title: 'Open the SKU form', detail: 'Go to Catalog → SKUs → Add SKU.' },
        { title: 'Enter the details', detail: 'SKU code, name, unit, price and HSN. Add a description or attach a drawing with the paperclip.' },
        { title: 'Save', detail: 'The SKU is now available on orders, quotations and invoices.' },
        { title: 'Make it fabricable (optional)', detail: 'Click Recipe on the SKU row to set its bill of materials, so you can Make it from an order.' },
      ],
      faqs: [{ q: 'What is HSN for?', a: 'It\'s the GST classification code printed on invoices — set it once per SKU.' }],
    },
  },
];

(async () => {
  let n = 0;
  for (const a of A) {
    const body = buildBody(a.structured);
    await pool.query(
      `INSERT INTO kb_articles (slug, title, category, article_type, summary, body, tags, keywords, structured)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (slug) DO UPDATE SET
         title=EXCLUDED.title, category=EXCLUDED.category, article_type=EXCLUDED.article_type,
         summary=EXCLUDED.summary, body=EXCLUDED.body, tags=EXCLUDED.tags, keywords=EXCLUDED.keywords,
         structured=EXCLUDED.structured`,
      [a.slug, a.title, a.category, a.article_type, a.summary, body, a.tags || [], a.keywords, JSON.stringify(a.structured)]
    );
    n++;
  }
  const c = await pool.query('SELECT COUNT(*) FROM kb_articles');
  const s = await pool.query('SELECT COUNT(*) FROM kb_articles WHERE structured IS NOT NULL');
  console.log(`✅ upserted ${n} structured articles; total ${c.rows[0].count}, of which ${s.rows[0].count} are structured`);
  await pool.end();
})().catch(e => { console.error('seed error:', e.message); process.exit(1); });
