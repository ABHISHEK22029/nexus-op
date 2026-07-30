# How to Use Nexus-OP — Step-by-Step Guide

A practical walkthrough for a small SME: from first login to running a real order
end-to-end, then paying and getting paid.

> **The golden path:** Quote → Order → Make/Buy → Receive → Deliver → Invoice →
> Collect → Pay vendor. Everything below follows that line.

---

## Part 0 · Getting in & finding your way

1. **Sign up / log in** — open the app, click **Sign Up** (email + password) or **Log in**.
   Every new user gets their **own workspace** (you only see what you create; the Admin sees all).
2. **The layout:**
   - **Left sidebar** = all screens, grouped by stage (Sales, Catalog, Procurement, Billing, Project, Fabrication, System).
   - **Top bar** = the **active project** selector, **＋ Quick Create**, the 🔔 **notifications** bell, light/dark toggle, your account.
   - **Bottom-right** = the **Ask AI** button — on every screen. Stuck? Ask it.
3. **Smart Knowledge** (Overview → Smart Knowledge) = 51 how-to guides if you'd rather read.

---

## Part 1 · First-time setup (do this once)

Set your foundations before running orders. Tip: you can bulk-load these from CSV via
**System → Import Data**.

1. **Add your team** — System → **Team & Access** → invite users, give each a role
   (Admin / Manager / Engineer / Finance / Viewer). Roles tailor what each person sees.
2. **Add customers** — Sales → **Customers** → Add Customer. Enter **GSTIN + state**
   (this decides CGST/SGST vs IGST automatically on their bills).
3. **Add vendors** — Procurement → **Vendors** → add your suppliers (GSTIN, contact).
4. **Add your products** — Catalog → **SKUs** → Add SKU (name, unit, price, HSN).
5. **Add raw materials** — Catalog → **Raw Materials** → the stuff you buy/consume.
6. **Set a Recipe (BOM)** for anything you fabricate — on the SKU row click **Recipe** →
   list each raw material + quantity per unit (e.g. 4 kg MS Angle per cross-arm).
7. **(Optional) Automation** — System → **Automation**: set a **PO approval limit**
   (POs above it need sign-off), and any **recurring bills** (rent, AMC invoices).

---

## Part 2 · The everyday flow (a real order, step by step)

### Step 1 — Quote the customer
1. Sales → **Sales Quotations** → **New Quotation**.
2. Pick the **customer**, add line items (pick a SKU or type free-text, qty, rate), set **GST %**.
3. **Create Quotation** (it gets a number like `QT-0001`). Open it to **print/share**.
4. When the customer accepts → click **Convert** → this creates a **Customer Order** automatically.

*(Skip quoting? Just go straight to Sales → Customer Orders → New Order.)*

### Step 2 — The Customer Order drives everything
1. Sales → **Customer Orders** → open your order and **expand** it.
2. For **each line**, choose one:
   - **Make** → fabricate it in-house (see Part 3).
   - **Raise Quotation** → buy it from vendors (Step 3).
   - **Create Invoice** → bill the customer (Step 6).

### Step 3 — Buy what you need (if buying out)
1. From the order line click **Raise Quotation**, or go to Procurement → **Quotations**.
2. Enter up to **3 vendor quotes** (Q1/Q2/Q3), compare, **select** the winner.
3. Click **Generate PO** → a **Purchase Order** is created (vendor, item, qty, rate, GST).
4. If it's above your approval limit, an Admin/Manager signs it off (Purchase Orders page).

### Step 4 — Receive the goods (GRN)
1. Procurement → **GRN** → create a GRN against the PO.
2. Enter the **quantities actually received** → save. **Inventory updates automatically.**
3. From the GRN, **Generate Bill** → a **GRN Bill** (this becomes a payable — Part 5).

### Step 5 — Dispatch to the customer
1. Sales → **Delivery Challans** → **New Challan**.
2. **Prefill from the order** (copies customer + items), add **transporter + vehicle no.**
3. **Create Challan** → **print** it to travel with the goods → set status **Dispatched**
   (the order moves to *Delivered*).

### Step 6 — Invoice & get paid
1. From the Customer Order click **Create Invoice** (lines prefill), or Sales → **Sales Invoices**.
2. Check GST/discount → **Save** the invoice (GST split + amount-in-words are automatic).
3. When money arrives, open the invoice → **record a payment** (amount, mode, reference).
   Status moves Draft → Partially Paid → Paid. Overdue ones remind you automatically.

---

## Part 3 · Make it in-house (Production)

1. First pick an **active project** in the top bar (production attaches to it).
2. On a **Customer Order** line, click **Make** → a **Production Order** is created and
   **pre-fills what to consume** = recipe × ordered qty (e.g. 4 kg × 200 = 800 kg).
3. Fabrication → **Production** → open the order and record as you go:
   - **Raw Material Consumed** (reduces inventory)
   - **Finished Output** (pieces / weight)
   - **Scrap / Remnant**
4. The panel shows live **Yield %, material balance, and cost per unit**.

---

## Part 4 · Money out & adjustments

- **Pay vendors** — Billing → **Payables**: see everything you owe with **ageing**
  (0–30 / 31–60 / …). Click **Pay** on a GRN bill, enter amount/mode → it marks Paid.
- **Returns / corrections** — Billing → **Credit/Debit Notes**:
  **Credit Note** to a customer (returns/short-supply), **Debit Note** to a vendor.
- **Expenses** — Billing → **Expenses**: log rent, utilities, etc.

---

## Part 5 · Helpers you'll lean on

- **Ask AI** (bottom-right, always there): ask *"what's overdue?"*, *"what do I owe vendors?"*,
  *"what needs approval?"*, or *"how do I raise a PO?"* — grounded in your own data, read-only.
- **Dashboard + 🔔 bell**: your at-a-glance status and real-time alerts (POs, payments, overdue).
- **Automation** (System): PO approvals, recurring invoices/expenses (with **Run now**), reminders.
- **Reports** (System): summaries + CSV export.

---

## Part 6 · Full worked example (200 cross-arms)

1. **Quote** — Sales Quotation `QT-0001` to the customer → they accept → **Convert** → order `CO-0001`.
2. **Decide per line** — fabricate the cross-arms → **Make** (Production pulls the BOM: 4 kg × 200 = 800 kg steel). Buy the bolts → **Raise Quotation** → compare 3 vendors → **Generate PO**.
3. **Receive** the bolts → **GRN** (inventory up) → **Generate Bill**.
4. **Produce** — record consumed steel, finished output, scrap → yield + cost/unit shown.
5. **Dispatch** — **Delivery Challan** with vehicle → mark **Dispatched** (order → Delivered).
6. **Invoice** — **Create Invoice** (GST) → send → record the **customer payment**.
7. **Pay the vendor** — Billing → **Payables** → settle the bolt bill.
8. Any short-supply? → **Credit/Debit Note**. Throughout: watch the Dashboard, ask **Ask AI**.

---

## Quick daily checklist

- [ ] Check the **Dashboard** + 🔔 bell
- [ ] Log any new **Customer Orders** (or quotes)
- [ ] Move orders forward: **Make / Raise PO / GRN / Dispatch**
- [ ] Raise **Invoices** and record **Payments** received
- [ ] Clear due **Payables**
- [ ] Stuck on anything → **Ask AI**

---

## What you can ignore (unless you do project/site work)

The **Projects / BOQ / Indent / Measurement Book / RA Bills** group is only for
contract/EPC/site billing. A product-making SME can skip it entirely.
