/* Seed the shared Knowledge Base with Nexus-OP help articles.
   Run: node seed/kb_seed.js   (uses backend/.env DATABASE_URL — the live DB)
   Idempotent: upserts by slug. */
require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const ARTICLES = [
  {
    slug: 'getting-started', title: 'Getting started with Nexus-OP', category: 'Overview', article_type: 'Guide',
    summary: 'What Nexus-OP is and the end-to-end flow: customer order → make or buy → receive → bill → get paid.',
    keywords: 'overview, flow, start, introduction, erp, sme, fabrication',
    tags: ['overview', 'start'],
    body: `Nexus-OP is an operations platform for Indian SME manufacturers and fabricators. It connects your whole order-to-cash flow in one place.

## The core flow
1. **Customer Order** — log the PO your customer places with you (Sales → Customer Orders).
2. **Make or Buy** — for each line, either **Make** it in-house (Production, using the item's Recipe/BOM) or **Raise a Quotation** to buy it from vendors.
3. **Procure** — compare vendor quotations (Q1/Q2/Q3), generate a **Purchase Order**, get it approved if it's over your limit.
4. **Receive** — record a **GRN** (Goods Receipt Note) when material arrives, and generate a GRN bill.
5. **Bill** — raise a **Sales Invoice** to your customer (with GST), and record payments.

## Where things live
The left sidebar is grouped by stage: **Sales**, **Catalog**, **Procurement**, **Billing**, **Project**, **Fabrication**, and **System**. Pick an active project in the top bar so production and work-orders attach to it.`,
  },
  {
    slug: 'customer-orders', title: 'Logging a customer order', category: 'Sales', article_type: 'How-to',
    summary: 'Record the PO your customer places with you and drive procurement or production from it.',
    keywords: 'customer order, sales order, customer PO, order',
    tags: ['sales', 'orders'],
    body: `A customer order is the PO your customer gives you. Everything downstream (quotations, production, invoices) links back to it.

## Create one
1. Go to **Sales → Customer Orders → New Order**.
2. Pick the **Customer** (add them first under Sales → Customers if needed).
3. Enter the **Customer PO Ref** and date.
4. Add **line items** — pick a SKU (auto-fills description/unit/price) or type free text, with quantity and target price.
5. **Create Order**.

## Act on each line
Expand an order to see its lines. For each line you can:
- **Make** — spin up a production order to fabricate it in-house (pulls the SKU's Recipe/BOM).
- **Raise Quotation** — source it from vendors.
- **Create Invoice** — bill the customer for the order.

The order status moves Open → In Procurement → Delivered → Closed as you progress.`,
  },
  {
    slug: 'quotations', title: 'Comparing vendor quotations (Q1/Q2/Q3)', category: 'Procurement', article_type: 'How-to',
    summary: 'Raise quotations against an order line, compare up to three vendors, and generate a PO from the winner.',
    keywords: 'quotation, RFQ, vendor quote, compare, Q1 Q2 Q3',
    tags: ['procurement', 'quotations'],
    body: `Quotations let you source a part from multiple vendors and pick the best price before committing to a PO.

## Raise a quotation
- From a **Customer Order** line, click **Raise Quotation** — it pre-links the part, quantity and unit.
- Or go to **Procurement → Quotations** and add one manually.

## Compare and choose
On the Quotations page you can capture up to three vendor quotes (Q1, Q2, Q3) per part, compare rates, and **select** the winning vendor. From the selected quote, **Generate PO** creates a Purchase Order pre-filled with the vendor, part, quantity and rate.`,
  },
  {
    slug: 'purchase-orders', title: 'Creating a vendor Purchase Order (with GST)', category: 'Procurement', article_type: 'How-to',
    summary: 'Issue a PO to a vendor. GST is CGST+SGST or IGST depending on the vendor state; nothing is hardcoded.',
    keywords: 'purchase order, PO, vendor, GST, CGST, SGST, IGST',
    tags: ['procurement', 'po', 'gst'],
    body: `A Purchase Order is your order to a vendor.

## Create a PO
1. **Procurement → Purchase Orders → New**, or **Generate PO** from a selected quotation.
2. Add line items with quantity and rate. Set the **GST rate** you agreed with the vendor — whatever you enter is what's used.
3. Save. The PO total, taxable value and GST are computed from your inputs.

## GST split
GST is split automatically: **CGST + SGST** for a vendor in your own state (intra-state), or **IGST** for a vendor in another state (inter-state) — derived from the vendor's GSTIN vs your company state. The PO invoice prints black-and-white like an RA bill.

## Approval
If the PO value is over your **approval threshold** (Automation page), it's held for sign-off before it can be approved.`,
  },
  {
    slug: 'po-approvals', title: 'Purchase Order approval sign-off', category: 'Procurement', article_type: 'Guide',
    summary: 'Set a value threshold above which POs must be signed off before approval.',
    keywords: 'approval, sign off, threshold, authorization, limit',
    tags: ['procurement', 'approvals', 'automation'],
    body: `High-value POs can require a manager sign-off so nothing large goes out unchecked.

## Set the threshold
Go to **System → Automation → Purchase Order approval** and set the ₹ limit. Set it to **0** to require no approval.

## What happens
- Any PO **above** the threshold is marked **Pending Approval** and your admins get a notification (bell icon).
- It **cannot** be approved/dispatched until an Admin or Manager signs it off on the **Purchase Orders** page ("Needs sign-off" badge).
- The reviewer can Approve or Reject with a remark.`,
  },
  {
    slug: 'grn', title: 'Recording a GRN (goods receipt)', category: 'Procurement', article_type: 'How-to',
    summary: 'Log what actually arrived from the vendor against a PO and update inventory.',
    keywords: 'GRN, goods receipt, receiving, inward, delivery',
    tags: ['procurement', 'grn', 'inventory'],
    body: `A GRN (Goods Receipt Note) records material received against a Purchase Order.

## Receive goods
1. Go to **Procurement → GRN**.
2. Create a GRN against the relevant PO, entering the quantities actually received.
3. Saving the GRN updates **Inventory** and notifies your team.

## GRN bill
From a GRN you can generate a **customizable GRN bill** — a document you can tailor before sharing. See "Customizable GRN bills".`,
  },
  {
    slug: 'grn-bills', title: 'Customizable GRN bills', category: 'Procurement', article_type: 'Guide',
    summary: 'Generate an editable bill from a GRN — line items, taxes and totals reflect what you enter.',
    keywords: 'GRN bill, bill, document, invoice, customize',
    tags: ['procurement', 'grn', 'billing'],
    body: `Once goods are received, generate a GRN bill you can customize before finalising.

## Build the bill
- Open the GRN and choose **Generate Bill**.
- Line items carry over from the GRN; edit descriptions, quantities, rates, GST and round-off as needed — whatever you enter flows through to the totals (nothing is hardcoded).
- The bill computes CGST/SGST vs IGST and shows the amount in words (Indian format).

Use this when you need a receipt/bill document tied to the exact goods received.`,
  },
  {
    slug: 'inventory', title: 'Inventory and stock', category: 'Procurement', article_type: 'Guide',
    summary: 'See on-hand stock. It goes up on GRN receipt and down when production consumes material.',
    keywords: 'inventory, stock, on hand, material, quantity',
    tags: ['procurement', 'inventory'],
    body: `Inventory shows your on-hand material.

- **Increases** when you record a **GRN** (goods received from a vendor).
- **Decreases** when a **Production** order consumes raw material.

Find it under **Procurement → Inventory**. Ask AI "what's low on stock?" to get a quick list.`,
  },
  {
    slug: 'production-bom', title: 'Production, Recipes (BOM) and Make-from-order', category: 'Production', article_type: 'How-to',
    summary: 'Set a recipe (bill of materials) on a SKU, then Make it from a customer order — consumption auto-fills.',
    keywords: 'production, BOM, bill of materials, recipe, make, fabricate, yield, scrap',
    tags: ['production', 'bom', 'fabrication'],
    body: `Nexus-OP can fabricate items in-house and track material, yield and scrap.

## 1. Set the Recipe (BOM)
On **Catalog → SKUs**, click **Recipe** on a product. Add each raw material and the **quantity per unit** (e.g. 4 kg MS Angle per cross-arm). Save.

## 2. Make from an order
On a **Customer Order** line, click **Make**. Nexus-OP creates a **Production Order** and pre-fills what to consume = recipe × ordered quantity (e.g. 4 kg × 200 = 800 kg). You must have an **active project** selected in the top bar.

## 3. Run production
On the production order, record **Raw Material Consumed**, **Finished Output**, and **Scrap/Remnant**. The **Yield & Material Balance** panel shows yield %, recovered %, scrap, net material cost and cost per unit. A badge links the production order back to the customer order it fulfils.`,
  },
  {
    slug: 'sales-invoices', title: 'Raising a customer tax invoice', category: 'Billing', article_type: 'How-to',
    summary: 'Bill your customer with a GST invoice, prefilled from a customer order; record payments against it.',
    keywords: 'sales invoice, tax invoice, GST invoice, bill customer, receivable',
    tags: ['billing', 'invoices', 'gst'],
    body: `A Sales Invoice is your GST bill to a customer.

## Create it
- From a **Customer Order**, click **Create Invoice** — line items prefill from the order.
- Or go to **Sales → Sales Invoices**.
- Set discount, GST rate and round-off. CGST/SGST vs IGST is derived from the customer's GSTIN vs your company state. The net amount shows in words.

## Get paid
Open the invoice and **record a payment** (amount, mode, reference). The status moves Draft → Sent → Partially Paid → Paid automatically, and a payment notification fires.`,
  },
  {
    slug: 'payments-overdue', title: 'Payments and overdue invoices', category: 'Billing', article_type: 'Guide',
    summary: 'Record customer payments and get reminded when an invoice passes its due date unpaid.',
    keywords: 'payment, overdue, due date, receivable, reminder, collection',
    tags: ['billing', 'payments', 'reminders'],
    body: `## Record a payment
Open a **Sales Invoice** and add a payment. The invoice auto-updates to Partially Paid or Paid.

## Overdue reminders
If an invoice passes its **due date** and isn't fully paid, Nexus-OP notifies your admins once — with the outstanding amount and how many days it's overdue. Ask AI "which invoices are overdue?" for the current list.`,
  },
  {
    slug: 'recurring', title: 'Recurring transactions and reminders', category: 'Billing', article_type: 'How-to',
    summary: 'Auto-create the bills you raise or pay on a schedule (monthly retainer, rent) — and reminders.',
    keywords: 'recurring, schedule, automation, retainer, AMC, rent, subscription, reminder',
    tags: ['billing', 'automation', 'recurring'],
    body: `Set up bills that repeat so you never forget them.

## Create a schedule
Go to **System → Automation → Recurring transactions → New schedule**. Choose:
- **Expense we pay** (rent, subscriptions) → creates an Expense on the cadence.
- **Invoice we bill** (AMC / monthly retainer) → creates a GST Sales Invoice for the customer, with your GST rate and payment terms.

Pick daily / weekly / monthly and the first run date. Nexus-OP generates them automatically and notifies you. Use **Run now** to process anything due today immediately. Pause or delete a schedule any time.`,
  },
  {
    slug: 'expenses', title: 'Tracking expenses', category: 'Billing', article_type: 'How-to',
    summary: 'Log business expenses with category, amount and payee; see a running total.',
    keywords: 'expense, cost, spend, category, petty cash',
    tags: ['billing', 'expenses'],
    body: `Record what you spend under **Billing → Expenses**.

Add an expense with a **category**, **amount**, date, who it was **paid to**, and payment mode. The page shows the total. Recurring expenses (rent, subscriptions) can be automated from the Automation page.`,
  },
  {
    slug: 'team-access', title: 'Team, roles and workspaces', category: 'Setup', article_type: 'Guide',
    summary: 'Invite users, assign roles, and understand per-user workspace isolation.',
    keywords: 'team, users, roles, RBAC, access, permissions, admin, manager, workspace',
    tags: ['setup', 'team', 'rbac'],
    body: `## Workspaces
Every new user gets their **own empty workspace** — they see only the projects and data they create. The **Admin** sees everything across the account.

## Roles
Manage people under **System → Team & Access** (Admin only). Roles include Admin, Manager, Engineer, Finance, Vendor and Viewer — each sees a tailored sidebar and has different permissions (e.g. only Admin/Manager can approve POs or edit automation; Viewer is read-only).

## Signing up
New users can self-sign-up and get a guided setup. Admins can also create users via step-by-step onboarding.`,
  },
  {
    slug: 'notifications', title: 'Notifications', category: 'Setup', article_type: 'Guide',
    summary: 'The bell keeps you posted on POs, approvals, GRNs, payments, recurring runs and overdue invoices.',
    keywords: 'notifications, bell, alerts, updates',
    tags: ['setup', 'notifications'],
    body: `The **bell** in the top header shows real-time updates and an unread count. You'll be notified about:
- New POs and POs needing sign-off
- GRN receipts
- Payments received
- Recurring documents generated
- Overdue invoices

Click the bell to open the panel; click an item to jump to it.`,
  },
  {
    slug: 'ask-ai', title: 'Using Ask AI', category: 'Overview', article_type: 'Guide',
    summary: 'The built-in assistant answers questions about your Nexus-OP data and how to use features.',
    keywords: 'ask ai, assistant, chatbot, help, ada',
    tags: ['overview', 'ai'],
    body: `**Ask AI** is the assistant button at the bottom-right of every screen.

## What it can do
- Answer questions about **your own data** — "which invoices are overdue?", "what needs approval?", "what's low on stock?", "status of order CO-0007?".
- Explain **how to use Nexus-OP** — "how do I raise a vendor PO?", "how does BOM work?".
- Point you to the right screen.

## What it won't do
It only helps with **Nexus-OP and your operations here** — it won't answer general/unrelated questions, and it never changes your data (it's read-only, and guides you to where you can act).`,
  },
];

(async () => {
  let n = 0;
  for (const a of ARTICLES) {
    await pool.query(
      `INSERT INTO kb_articles (slug, title, category, article_type, summary, body, tags, keywords)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (slug) DO UPDATE SET
         title=EXCLUDED.title, category=EXCLUDED.category, article_type=EXCLUDED.article_type,
         summary=EXCLUDED.summary, body=EXCLUDED.body, tags=EXCLUDED.tags, keywords=EXCLUDED.keywords`,
      [a.slug, a.title, a.category, a.article_type, a.summary, a.body, a.tags, a.keywords]
    );
    n++;
  }
  const c = await pool.query('SELECT COUNT(*) FROM kb_articles');
  console.log(`✅ seeded/updated ${n} articles; kb_articles now has ${c.rows[0].count} rows`);
  await pool.end();
})().catch(e => { console.error('seed error:', e.message); process.exit(1); });
