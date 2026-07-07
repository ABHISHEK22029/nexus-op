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

  // ── Portal basics ──────────────────────────────────────────
  {
    slug: 'portal-navigation', title: 'Finding your way around Nexus-OP', category: 'Overview', article_type: 'Guide',
    summary: 'How the app is organised — the sidebar groups, the top bar, and where each feature lives.',
    keywords: 'navigation, sidebar, menu, layout, where, find, top bar, header',
    tags: ['overview', 'navigation'],
    body: `Nexus-OP has three fixed areas: the left **sidebar**, the top **header**, and the main page.

## The sidebar (left)
Grouped by stage so you follow the natural flow:
- **Overview** — Dashboard, Smart Knowledge
- **Sales** — Customers, Customer Orders, Sales Invoices
- **Catalog** — SKUs, Raw Materials
- **Procurement** — Vendors, Quotations, Purchase Orders, GRN, Inventory
- **Billing** — RA Bills, Expenses
- **Project** — Projects, Work Orders (and BOQ / Indent / MB when enabled)
- **Fabrication** — Production
- **System** — Automation, Reports, Import Data, Team & Access, Activity Log, Process Flow

## The top header
- **Active project** selector (see "The active project selector")
- **Quick Create** (+) for common actions
- **Notifications** bell
- **Light/dark** toggle and your **account** menu

## Everywhere
The **Ask AI** button sits at the bottom-right of every screen.`,
  },
  {
    slug: 'active-project', title: 'The active project selector', category: 'Overview', article_type: 'Guide',
    summary: 'Pick the project you are working in from the top bar — production and work orders attach to it.',
    keywords: 'active project, project selector, top bar, context, switch project',
    tags: ['overview', 'projects'],
    body: `The **active project** is chosen from the dropdown in the top header. It sets the context for anything that belongs to a specific project.

## Why it matters
- When you click **Make** on a customer-order line, the new production order is created **against the active project** — so you must have one selected.
- Work orders, inventory and some reports are scoped by project.

## Switching
Open the dropdown in the top bar and pick another project any time. If you have no projects yet, create one first (Project → Projects, or Quick Create → New Project).`,
  },
  {
    slug: 'dashboard-explained', title: 'Understanding your dashboard', category: 'Overview', article_type: 'Guide',
    summary: 'What the dashboard tiles and KPIs mean at a glance.',
    keywords: 'dashboard, KPI, metrics, overview, home',
    tags: ['overview', 'dashboard'],
    body: `The **Dashboard** is your at-a-glance control panel. It surfaces the numbers that matter — open orders, purchase and billing activity, and status counts — so you can see where things stand without opening each screen.

For a live, plain-English read of your operations ("what's overdue?", "what needs approval?"), just ask **Ask AI** — it reads the same data.`,
  },
  {
    slug: 'quick-create', title: 'Quick Create (the + menu)', category: 'Overview', article_type: 'How-to',
    summary: 'Create common records fast from the top-bar + menu, from any screen.',
    keywords: 'quick create, new, add, shortcut, plus menu',
    tags: ['overview', 'shortcuts'],
    body: `**Quick Create** (the + button in the top header) lets you start the most common actions from anywhere:
- **New Project** — create a workspace/project
- **Onboard Vendor** — add a supplier
- **Raise Indent** — a site material request
- **Raise PO** — a vendor purchase order

Pick one and a form opens without leaving your current page.`,
  },
  {
    slug: 'signup-login', title: 'Signing up and logging in', category: 'Overview', article_type: 'How-to',
    summary: 'Create an account (you get your own workspace) and sign back in.',
    keywords: 'sign up, signup, login, log in, account, register, session',
    tags: ['overview', 'account'],
    body: `## Sign up
From the landing page choose **Sign Up**, enter your email and a password, and you'll get a short guided setup. Every new user starts with their **own empty workspace** — you only see the projects and data you create.

## Log in
Use **Log in** with the same email and password. Your session stays active as you move around the app; you won't be bounced to login while working.

## Admin
The account **Admin** can see everything across the account and can create users from Team & Access.`,
  },
  {
    slug: 'roles-permissions', title: 'Roles and permissions', category: 'Setup', article_type: 'Guide',
    summary: 'What each role can see and do — Admin, Manager, Engineer, Finance, Vendor, Viewer.',
    keywords: 'roles, permissions, RBAC, access, admin, manager, engineer, finance, vendor, viewer',
    tags: ['setup', 'rbac'],
    body: `Each user has a **role** that tailors their sidebar and what they can change. Manage roles under **System → Team & Access** (Admin only).

- **Admin** — full access across the whole account; manages users and automation.
- **Manager** — can approve POs, edit automation, and run most operations.
- **Engineer** — procurement/production focus: POs, quotations, GRN, inventory, production.
- **Finance** — sales, invoices, RA bills, expenses, reports.
- **Vendor** — limited view (their purchase orders).
- **Viewer** — read-only everywhere (can still use Ask AI).`,
  },

  // ── Masters ────────────────────────────────────────────────
  {
    slug: 'customers-create', title: 'Adding a customer', category: 'Sales', article_type: 'How-to',
    summary: 'Create the customer master used across orders, invoices and GST.',
    keywords: 'customer, add customer, create customer, master, GSTIN, state',
    tags: ['sales', 'masters'],
    body: `Customers are the people/companies you sell to. Add them once and reuse them everywhere.

## Create a customer
1. Go to **Sales → Customers → Add Customer**.
2. Enter the **name**, **GSTIN**, **state**, contact and billing address. You can set an **opening balance**.
3. Save.

## Why GSTIN matters
The customer's GSTIN state decides GST on their invoices — **CGST + SGST** if they're in your state, **IGST** if inter-state. Attach documents with the paperclip icon on the row.`,
  },
  {
    slug: 'vendors-create', title: 'Onboarding a vendor', category: 'Procurement', article_type: 'How-to',
    summary: 'Add a supplier master used on quotations, POs and GRN.',
    keywords: 'vendor, supplier, onboard, add vendor, create vendor, GSTIN',
    tags: ['procurement', 'masters'],
    body: `Vendors are who you buy from.

## Add a vendor
1. Go to **Procurement → Vendors** (or **Quick Create → Onboard Vendor**).
2. Enter the vendor's name, GSTIN, contact and bank/compliance details.
3. Save.

The vendor's GSTIN state drives the GST split on their Purchase Orders (CGST+SGST vs IGST).`,
  },
  {
    slug: 'skus-create', title: 'Creating a product (SKU)', category: 'Catalog', article_type: 'How-to',
    summary: 'Add the products/parts you quote, sell and (optionally) fabricate.',
    keywords: 'SKU, product, part, create, add, catalog, HSN, recipe, BOM',
    tags: ['catalog', 'masters'],
    body: `SKUs are the products/parts in your catalog — what you put on customer orders and invoices.

## Create a SKU
1. Go to **Catalog → SKUs → Add SKU**.
2. Enter **SKU code**, **name**, **unit**, **price** and **HSN** (for GST). Add a description if useful.
3. Save. Use the paperclip to attach a drawing/spec.

## Make it fabricable
Click **Recipe** on the SKU row to set its bill of materials (raw material + qty per unit). Then you can **Make** it from a customer order — see "Production, Recipes (BOM) and Make-from-order".`,
  },
  {
    slug: 'raw-materials-create', title: 'Adding a raw material', category: 'Catalog', article_type: 'How-to',
    summary: 'Add the raw materials you buy and consume in production.',
    keywords: 'raw material, add, create, material, catalog, stock',
    tags: ['catalog', 'masters'],
    body: `Raw materials are what you purchase and consume to make products.

## Add one
1. Go to **Catalog → Raw Materials → Add Raw Material**.
2. Enter the name, unit (e.g. kg) and standard rate.
3. Save.

Raw materials appear in **SKU recipes (BOM)** and in **Inventory** (which rises on GRN and falls when production consumes them).`,
  },

  // ── Projects ───────────────────────────────────────────────
  {
    slug: 'projects-create', title: 'Creating a project', category: 'Project', article_type: 'How-to',
    summary: 'Set up a project — the context that production, work orders and some reports attach to.',
    keywords: 'project, create project, new project, workspace, context',
    tags: ['project'],
    body: `A project is a unit of work (a job, a site, a contract). Production orders and work orders attach to it.

## Create a project
1. Go to **Project → Projects → New** (or **Quick Create → New Project**).
2. Enter the name, client, type and timeline.
3. Save, then select it as the **active project** in the top bar so new production/work orders attach to it.`,
  },
  {
    slug: 'work-orders', title: 'Work orders', category: 'Project', article_type: 'Guide',
    summary: 'Break a project into work orders to organise execution.',
    keywords: 'work order, WO, task, project execution',
    tags: ['project'],
    body: `Work orders divide a project into pieces of work you execute and track. Create them under **Project → Work Orders** against the active project. Production and some procurement can reference a work order so costs and progress roll up to the right place.`,
  },
  {
    slug: 'boq', title: 'Bill of Quantities (BOQ)', category: 'Project', article_type: 'Guide',
    summary: 'Itemised quantities and rates that drive project billing (RA bills).',
    keywords: 'BOQ, bill of quantities, rates, item code, billing, contractor',
    tags: ['project', 'billing'],
    body: `BOQ (Bill of Quantities) lists each billable item with a code, unit, estimated quantity and **unit rate**. It's the basis for project (running-account) billing.

## Set it up
Open **BOQ** (under Project when enabled) and add items with their rates. Later, measured quantities (Measurement Book) × BOQ rate produce **RA Bills**.`,
  },
  {
    slug: 'indent', title: 'Raising an indent (material request)', category: 'Procurement', article_type: 'How-to',
    summary: 'A site request for material that feeds procurement.',
    keywords: 'indent, material request, requisition, site request',
    tags: ['procurement'],
    body: `An indent is a request for material from the site/floor.

## Raise one
1. Open **Indent** (under Procurement when enabled) or **Quick Create → Raise Indent**.
2. Choose the item and quantity (against a project/work order).
3. Submit. Approved indents drive Purchase Orders to buy what's needed.`,
  },
  {
    slug: 'measurement-book', title: 'Measurement Book (MB)', category: 'Project', article_type: 'Guide',
    summary: 'Record physical measurements that convert into running-account bills.',
    keywords: 'measurement book, MB, measurement, chainage, RA bill',
    tags: ['project', 'billing'],
    body: `The Measurement Book records the physical work actually done — measurements (e.g. L × W × D) at specific locations. Cumulative measured quantity × the BOQ rate produces the amount on an **RA Bill**. Enter measurements under **MB** (Billing/Project, when enabled).`,
  },

  // ── Billing ────────────────────────────────────────────────
  {
    slug: 'ra-bills', title: 'RA Bills (running-account bills)', category: 'Billing', article_type: 'How-to',
    summary: 'Generate a running-account tax invoice from measured quantities, with GST, TDS and retention.',
    keywords: 'RA bill, running account, invoice, TDS, retention, GST, tax invoice',
    tags: ['billing', 'projects'],
    body: `RA (running-account) bills are the standard progressive billing for project work.

## How they compute
Cumulative **Measurement Book** quantities × **BOQ** rate give the gross value; the bill then applies **GST**, and deductions like **TDS** and **retention**, to produce a clean, print-ready Indian tax invoice.

## Generate one
Open **Billing → RA Bills**, create a bill for the project/work order, review the computed lines and deductions, and finalise/print.`,
  },

  // ── Production detail ──────────────────────────────────────
  {
    slug: 'production-run', title: 'Running a production order', category: 'Production', article_type: 'How-to',
    summary: 'Record consumption, output and scrap on a production order and read the yield panel.',
    keywords: 'production, run, consume, output, scrap, remnant, yield, cost per unit, material balance',
    tags: ['production', 'fabrication'],
    body: `Once a production order exists (created via **Make** from an order, or manually), you record what actually happened.

## Steps on the order
1. **Raw Material Consumed** — add each material issued, with quantity and rate. This reduces inventory.
2. **Finished Output** — record pieces and/or weight produced.
3. **Scrap & Remnant** — log sellable scrap (with sale value) or reusable remnant.

## The yield panel
The top panel shows live **Yield %**, **Recovered %** (incl. reusable remnant), **Scrap %**, **Unaccounted loss**, **net material cost** and **cost per unit** — so you can see efficiency and true cost at a glance. Move the status Planned → In Progress → Completed as you go.`,
  },

  // ── System / tools ─────────────────────────────────────────
  {
    slug: 'automation-overview', title: 'Automation overview', category: 'System', article_type: 'Guide',
    summary: 'One place for rules that run themselves — approvals, recurring bills, and reminders.',
    keywords: 'automation, rules, approval, recurring, reminders, workflow',
    tags: ['system', 'automation'],
    body: `The **System → Automation** page holds rules that run without you:
- **PO approval threshold** — hold high-value POs for sign-off (see "Purchase Order approval sign-off").
- **Recurring transactions** — auto-create expenses/invoices on a schedule, plus **Run now** (see "Recurring transactions and reminders").
- **Reminders** — overdue-invoice notifications fire automatically.`,
  },
  {
    slug: 'reports', title: 'Reports and exports', category: 'System', article_type: 'How-to',
    summary: 'See summary reports and export data to CSV.',
    keywords: 'reports, export, CSV, download, analytics',
    tags: ['system', 'reports'],
    body: `**System → Reports** gives summary views across your operations. Use the export option to download data as **CSV** for Excel/accounting. For quick one-off answers, ask **Ask AI** instead of building a report.`,
  },
  {
    slug: 'import-data', title: 'Importing data (CSV)', category: 'System', article_type: 'How-to',
    summary: 'Bulk-create records by uploading a CSV file.',
    keywords: 'import, CSV, upload, bulk, migrate, data',
    tags: ['system', 'data'],
    body: `To load many records at once:
1. Go to **System → Import Data**.
2. Choose what you're importing and upload a **CSV** file.
3. Review the parsed rows and confirm — Nexus-OP creates them in bulk.

Great for bringing in existing customers, vendors, SKUs or materials when you start.`,
  },
  {
    slug: 'activity-log', title: 'Activity log', category: 'System', article_type: 'Guide',
    summary: 'An audit trail of what happened and when.',
    keywords: 'activity, log, audit, history, trail',
    tags: ['system', 'audit'],
    body: `**System → Activity Log** is a chronological record of key actions (POs, GRNs, approvals, billing) so you can see who did what and when — useful for audit and troubleshooting.`,
  },
  {
    slug: 'process-flow', title: 'Process flow', category: 'System', article_type: 'Guide',
    summary: 'A visual map of the end-to-end order-to-cash flow.',
    keywords: 'process flow, flow, diagram, map, steps',
    tags: ['system', 'overview'],
    body: `**System → Process Flow** shows the connected journey — customer order → quotation → purchase order → GRN → production → invoice — so new users can see how each step feeds the next.`,
  },
  {
    slug: 'attachments', title: 'Attaching documents', category: 'System', article_type: 'How-to',
    summary: 'Upload and open supporting files on customers, SKUs, orders and more.',
    keywords: 'attachment, document, upload, file, paperclip, PDF',
    tags: ['system', 'documents'],
    body: `Many records support file attachments (drawings, POs, certificates).

## Attach a file
1. Look for the **paperclip** icon on a row (e.g. Customers, SKUs, Raw Materials).
2. Click it, then **upload** a file. Uploaded files can be opened or deleted from the same panel.

Files are stored securely and only visible within your workspace.`,
  },
  {
    slug: 'theme', title: 'Light and dark mode', category: 'Setup', article_type: 'Guide',
    summary: 'Switch the whole app between light and dark from the header.',
    keywords: 'theme, dark mode, light mode, appearance, toggle',
    tags: ['setup', 'appearance'],
    body: `Use the **sun/moon** toggle in the top header to switch between light and dark themes. Your choice is remembered for next time.`,
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
