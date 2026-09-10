# Maks Ops — what the platform does

*A complete feature list, compiled from the running code on 10 September 2026.
Every screen, endpoint and rule below exists and is covered by tests; nothing
here is planned or partial unless it says so.*

---

## In one paragraph

Maks Ops is an ERP for Indian SME fabrication and manufacturing businesses. It
carries a job from the moment a customer asks for a price to the moment the
money arrives: quotation → order → production → despatch → invoice → payment,
with the buying side (indent → purchase order → goods received → vendor bill →
payment) running alongside it and a stock ledger underneath that reconciles the
two. It is multi-tenant — many businesses on one deployment, each seeing only
its own data — and it is built around Indian statutory reality: GST place of
supply, HSN codes, e-way bills, TDS, MSME payment terms and the financial year
starting in April.

---

## 1. Sales — from enquiry to cash

### Public catalogue *(new)*
A page of what the business sells, at a link they can paste into a WhatsApp
group. No login for the visitor.

- **Their identity, not ours** — the business's own name, logo, phone and
  accent colour, taken from their company profile
- **Paginated and searchable** — 24 products a page, searched by name,
  headline, use case or product code
- **A tool on the page, not a brochure** — a quantity box that answers "what
  does 500 cost" and is the same control that adds it to the enquiry
- **Prices optional** — off by default, because fabricated work is priced
  against a drawing and a tonnage
- **Per-product control** — headline, use case, MOQ, lead time, photographs,
  and a publish switch on each one
- **Publication is the authorisation** — an unpublished catalogue, an
  unpublished product and an unknown address are all a plain 404; withdrawing a
  product takes its photographs down with it

### Enquiries
The inbox the catalogue feeds.

- New / Read / Quoted / Won / Ignored, oldest-unanswered first
- Opening one marks it read, so "new" means nobody has looked
- **Convert to quotation** creates the customer and prefills the quotation
  builder with what they asked for, rates left blank
- A stranger is deliberately **not** a customer until somebody decides the
  enquiry is real — the customer list stays clean

### Customers
- Contact, GSTIN, address, credit terms
- **What they buy** — a searchable requirement and category on each customer,
  so "who wants fire-rated doors" is a question the system can answer

### Quotations
- Multi-line, with discount before tax
- GST computed on the discounted value, split CGST/SGST or IGST by place of
  supply
- Validity date, and an **expired** count on the list — a quote past its date
  that nobody closed is either a sale going cold or a price no longer honoured
- Status: Draft / Sent / Accepted / Rejected / Converted
- **Convert to order** in one step; a rejected quote cannot be converted

### Customer orders
- Line items with **Unit, Qty, Unit rate, Total**, and a live order total
- Order value, open, in-procurement and no-line-item counts
- Drives procurement: an order can raise the purchase orders behind it
- Status through to Partially Delivered and Closed

### Delivery challans
- Rule 55 movement document — description, quantity, unit and taxable value
- **Stock leaves on despatch, not on draft**, and despatching twice does not
  remove it twice
- E-way bill tracking, with a count of challans missing one

### Sales invoices
- Built from an order or standalone
- HSN per line, CGST/SGST/IGST by place of supply, round-off, amount in words
- **Payments recorded against the invoice**, part payments accumulate
- **A receipt cannot exceed what is owed** — refused with the invoice value,
  what has been received and what remains
- Status: Draft / Sent / Partially Paid / Paid
- Emailing: opens a Gmail compose with the document attached

### Credit and debit notes
- Section 34 adjustments against an invoice
- Unit, quantity, rate and total per line
- Credit and debit summarised separately, never netted into one figure

---

## 2. Procurement — from need to payment

### Vendors
- Company, contact, GSTIN, PAN, bank details, MSME registration
- **What each one supplies**, with price, MOQ and lead time per item
- Preferred vendor per material, which the requirements engine uses

### Indents *(contracting module)*
Site requisitions with chainage — distance along a road.

### Vendor quotations
Request a price from several vendors for the same part; compare on price, lead
time and terms; raise the purchase order from the winner.

### Purchase orders
Modelled on a real Indian PO — the reference document is a JBVNL line-hardware
order.

- S.No, Description, UOM, HSN, Qty, Unit price, Amount
- Price basis (Ex-Works), P&F and insurance scope, loading scope, warranty
- Payment terms, quote reference, GST rate, amount in words
- **Approval workflow** — Pending → Approved → Dispatched, with sign-off
  and a remark
- **Per-financial-year numbering** allocated from a sequence, so two people
  raising an order at the same moment cannot get the same number

### Goods received (GRN)
- **Part deliveries** — three lorries against one order, each recorded, the
  order closing only when it is full
- **Over-receipt refused** beyond a 10% tolerance, and it says why
- **Multi-line orders** — receive against a specific line, with an
  outstanding-per-line view
- Every receipt writes the stock ledger inside a transaction; a refusal moves
  no stock and writes no receipt

### Vendor bills and payables
- Bill against a GRN, with freight, other charges, discount, GST and round-off
- **Ageing** — 0-30, 31-60, 61-90, 90+ by vendor
- Part payments, and **a payment cannot exceed the bill** — the money is going
  out, so a misplaced digit is a real payment against a bill that did not ask
  for it

---

## 3. Stock

- **Stock on hand** by item, with a movement ledger that explains every balance
- Opening stock, receipts, issues, despatches and adjustments
- **Units that convert** — a BOM line in kilograms against stock held in
  pieces, using weight per piece, dimensions and density. Where a conversion
  cannot be established the row is flagged rather than silently added up
- Items and SKUs, with bills of material
- **Material requirements** — for every material: how much is needed, how much
  is held, how much is on order, and the shortfall. "Can build 3 of 10" is a
  number; **"blocked by Glass"** is an action, so the binding constraint is
  always named

---

## 4. Production

- Production orders against a customer order, with output recorded
- Work orders bound to a vendor and a contract value
- Milestones with planned and actual percentages

---

## 5. Projects and contracting *(optional module)*

Switched off by default for businesses that do not need it. Turning it off
hides the screens and **deletes nothing**.

- Projects with client, type and status
- **Bill of quantities** — item code, description, unit, estimated quantity,
  rate
- **Measurement book** — chainage, length, width, depth, measured quantity
- **RA bills** — running account bills generated from measurements, with TDS,
  GST TDS, labour cess, retention, advance recovery and other deductions, each
  shown separately

---

## 6. Money

- Payables with ageing
- Expenses by category
- Recurring billing profiles
- Reports, and an activity trail of who did what

---

## 7. Who sees what

Seven built-in roles, and any number of custom ones.

| Role | What it is for |
|---|---|
| **Administrator** | The platform role — every workspace, including user management |
| **Owner** | Runs their own business end to end. Cannot see other workspaces |
| **Sales** | Quotes, orders, invoices. Reads stock and production to answer "when can you deliver" |
| **Procurement** | Vendors, purchase orders, indents, goods receipt |
| **Production** | Work orders, production, projects. Reads material availability; cannot buy |
| **Finance** | Invoices, bills, payments, credit notes |
| **Viewer** | Reads everything, changes nothing — for auditors, consultants and the bank |

- **34 resources** governed, each with read / write / delete
- **Custom roles per organisation**, built in the Configurator from the same
  resource list
- The platform-wide Administrator role **cannot be granted** by an Owner

### Multi-tenancy, stated plainly
Every business on the platform sees only its own data. An employee sees their
**employer's** records — not only what they typed themselves — and a different
business sees none of it. This is enforced on every list, every record fetched
by id, and every write, and is checked continuously by two audits: one signs up
a brand-new organisation and opens every list expecting all of them to be
empty; the other has one organisation build records and the other try to read
and change each one by id.

---

## 8. Setting up and running it

- **Sign up** — name your business, and you are in. Everything else can wait
- **Invite your team** by email; they set their own password from the link
- **Company profile** — GSTIN, PAN, bank details, logo, invoice terms,
  financial year start, document prefix
- **Configurator** — people, roles, categories, modules, catalogue, and an
  audit history
- **Readiness list** on the dashboard — what is still missing and *what it
  costs you*: "invoices print 'Not configured' where the payment details
  belong — a customer cannot pay an invoice that does not say where to send
  money"
- **Automation settings** and notifications

---

## 9. Indian statutory handling

- **GST place of supply follows the ship-to address**, not the customer's
  registered state — so an invoice to a Tamil Nadu customer shipping to
  Karnataka is IGST
- CGST/SGST versus IGST decided per document from the company's own state
- HSN/SAC per line
- Rule 46 — unique invoice number per supplier per financial year
- Rule 55 — delivery challan for movement without supply
- Section 34 — credit and debit notes
- TDS with section, GST TDS, labour cess
- MSME 45-day payment terms
- E-way bill tracking
- Amount in words in Indian lakh/crore format
- Financial year from April

---

## 10. What it is like to use

- **60 screens**, all verified to open without error
- Search, filter, sort and pagination on every list, with summary figures
  computed across the whole result rather than the page you are looking at
- Every document reads the same way: **Unit → Qty → Rate → Total**
- Dark and light themes
- Printable, emailable documents for quotation, order, challan, invoice,
  credit note, purchase order, vendor bill and RA bill

---

## Where it runs

- Backend on Render, **Singapore** — beside the database
- Database on Supabase, **Mumbai (ap-south-1)**
- Frontend on Vercel
- One deployment serves every business

**Latency**, measured live: no application endpoint over 400ms; the dashboard
444ms end to end from India; the public catalogue 64ms server-side.

---

## How much of this is tested

| | |
|---|---|
| Backend flow assertions | **278** across 13 suites |
| Frontend assertions | **151** across 12 suites |
| Screens opened and checked | **60** |
| Tenancy audits | 39 lists + 18 by-id reads and writes — **0 leaks** |
| Static checks | **12**, run on every change |

The static checks are worth naming, because each exists after a real bug: every
INSERT into an owned table sets an owner; every security helper called is
imported; every id-addressed write establishes ownership; no customer-specific
value ships in the code; no component that holds an input is declared inside
another component; every document reads Unit → Qty → Rate → Total.

---

## Known gaps, stated honestly

- **Weight versus piece count.** A purchase order priced at 25.9 MT and
  delivered as 18 items counted in Nos and Sets cannot yet be held as one
  record — there is no weight column tying the priced line to the delivery
  schedule. The unit engine converts correctly; the model does not carry it.
- **No test coverage** for Ask AI, automation settings, recurring invoices or
  the Import screen. They are not leaking data — that is checked — but nothing
  verifies they work.
- **Free-tier cold start.** After 15 minutes idle the first request takes about
  a minute. A paid instance is the only fix.
- **Exposed keys.** The repository is public and the Supabase, OpenRouter and
  MetalpriceAPI keys are in its history. They need rotating.
