# Maks Ops — Phase 1 Execution Plan

_Phase 0 (cleanup) is done and committed. This is the build phase. Detail for each area lives in the companion docs; this is the **sequenced execution order** with acceptance criteria._

**Phase 1 goal:** make the product *compliant, findable, and honest*. Not prettier — usable.

---

## Priority order (and why)

| # | Track | Why this order |
|---|---|---|
| **1A** | **Invoice & compliance** | An invoice the customer rejects is the most expensive problem we have. Also blocked on nothing. |
| **1B** | **Search & filters** | Biggest daily-friction fix; one component repairs 17 pages. |
| **1C** | **Master data** (vendor / customer) | Depends on 1B's table; makes 1A's data complete. |
| **1D** | **RBAC + navigation** | Security + findability. Independent of the above. |

Deferred to **Phase 2**: the DB restructure (item master, tenancy) and the deficiency engine — both are bigger, and neither blocks 1A–1D.

---

## 1A — Invoice & compliance ⭐ FIRST

### The problem
Our invoices are missing **three legally mandatory Rule 46 fields** (place of supply, ship-to/consignee, reverse-charge declaration) plus **bank details on every document** — so a customer's accounts team can reject them and the buyer's ITC claim can be invalidated. We may also compute **the wrong GST split** when goods ship to a different state, because `interstate` is derived from the customer's default state rather than the place of supply.

### Steps

**1A.1 — Schema** (migration `026`)
- `company_profile` += bank name/account/IFSC/branch, Udyam-MSME no., CIN, trade licence, logo URL, default payment terms, default invoice terms
- `customers` += `shipping_address`, `shipping_state`, `pan`, `payment_terms_days`, `credit_limit`
- `sales_invoices` += `place_of_supply`, `bill_to_snapshot`, `ship_to_snapshot`, `due_date`, `reverse_charge`, plus **dormant e-invoice slots** (`irn`, `irn_ack_no`, `irn_ack_date`, `irn_qr_payload`, `einvoice_status`, `eway_bill_no`)

**1A.2 — Backend**
- `PUT /company-profile` — **does not exist today** (GET only), so bank details currently have nowhere to live
- Invoice create: capture place of supply + snapshot both addresses
- **Derive `interstate` from place of supply**, not the customer's default state

**1A.3 — Company Profile settings page** — doesn't exist at all today. Business identity, tax IDs, bank details, logo, default terms.

**1A.4 — Rebuild the 7 print templates**
Header (logo + identity + GSTIN/PAN/MSME) → **Bill To | Ship To** side by side → place of supply + reverse charge → line items (HSN, qty, UOM, rate, taxable) → tax summary → **bank details box** → terms + due date → signature/seal. Reserve a QR area for future e-invoicing.

**1A.5 — Draft-editable / issued-locked**
- **Draft** = click any field on the invoice, edit inline, totals recompute live
- **Issued** = locked; the edit action becomes *"Issue Credit/Debit Note"*, pre-filled (wires up a feature we already built but never connected)
- Edits write to the **invoice snapshot only**, never back to the customer master

**1A.6 — "Missing required fields" banner** on drafts, so a non-compliant invoice can't be issued by accident.

**Acceptance:** a generated invoice carries every Rule 46 field, shows bank details and due date, computes CGST/SGST vs IGST from place of supply, cannot be edited once issued, and warns before issue if anything mandatory is blank.

---

## 1B — Search & filters

**17 of 20 list pages have no search, filter, or sort. Zero have working pagination.**

- **1B.1** — Backend `?search=` + `?limit/offset` convention. Start with `registerOwnedCrud` (covers Customers, SKUs, Raw Materials, Expenses in one edit), then the bespoke endpoints.
- **1B.2** — One shared `DataTable`: text search, column sort, pagination, per-page filters, consistent empty/loading states, status pills.
- **1B.3** — Roll out page by page, highest-traffic first: Vendors → Customers → Purchase Orders → Invoices → Inventory.

**Acceptance:** every list page can be searched, sorted, filtered and paged, using one component.

---

## 1C — Master data

**Vendors**
- Fix the form to **actually save what it already collects** (today it discards everything except name/type/PAN/GSTIN)
- Wire the existing-but-unused `capability_tags` into a real multi-select → **"Supplies" column**
- `vendor_items` (vendor ↔ item + price, MOQ, lead time) → **filter the PO/RFQ vendor dropdown** by what's being bought
- Fix or remove the fake "Performance" rating

**Customers**
- Shipping address, PAN, payment terms, credit limit (also feeds 1A)
- **Customer detail page** — doesn't exist today — showing their orders, invoices and outstanding balance inline
- "What they buy" **derived from order history**, not a typed field
- Duplicate prevention (search-before-create)

---

## 1D — RBAC + navigation

- One real role model — **Administrator · Procurement · Finance · Engineer · Viewer** (the case study's own names)
- Delete the fake "View as" selector; drive everything from the real logged-in role
- Owner-scoping on **every** by-id query (closes the IDOR holes)
- Route guards + action buttons gated by permission, not just hidden nav links
- 6-group nav: Overview / Sell / Buy / Make / Money / Admin

---

## Deferred to Phase 2
DB restructure (canonical `items` master, tenancy unification, FKs, NUMERIC money) → deficiency engine (required/available/shortfall, buildable-now, binding constraint) → inventory ledger + physical-count reconciliation → 80/20 procurement.

---

## Progress

- [x] **Phase 0** — cleanup (committed `d363af8`)
- [x] Cosmetic rename → Maks Ops (committed `c391eb0`)
- [ ] **1A.1** Schema migration 026
- [ ] **1A.2** Backend company-profile write + invoice logic
- [ ] **1A.3** Company Profile settings page
- [ ] **1A.4** Print templates
- [ ] **1A.5** Draft-editable / issued-locked
- [ ] **1A.6** Missing-fields banner
- [ ] 1B, 1C, 1D
