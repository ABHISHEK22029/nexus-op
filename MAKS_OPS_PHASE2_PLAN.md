# Maks Ops — Phase 2 Execution Plan

_The six outstanding items, sequenced by dependency rather than by wish-list order. Each track states what to build, how we'll know it works, and what it unblocks._

---

## Where we actually are

| Item | Status |
|---|---|
| Search / filter / pagination | 🟡 **Foundation built.** Backend helper + 4 pages live (Customers, SKUs, Raw Materials, Expenses). **16 pages still to roll out.** |
| Customer "what they buy" | 🔴 Fields exist; no detail page, nothing derived |
| Vendor → material link | 🔴 Not started |
| **Inventory deficiency engine** | 🔴 Not started — the Steelco core |
| Nav restructure + RBAC | 🔴 Not started |
| Other 6 document templates | 🔴 Only the tax invoice rebuilt |

---

## The dependency map — read this before picking anything up

```
        ┌──────────────────────────────────────────┐
        │  TRACK A — Item identity wiring          │  ← BLOCKS everything below
        │  inventory.raw_material_id + backfill    │
        └────────────┬─────────────────────────────┘
                     │
        ┌────────────┴───────────┬─────────────────┐
        ▼                        ▼                 
  TRACK B — Deficiency     TRACK C — Vendor↔item   
  engine (the core)        link + smart PO         

  ── independent, can run in parallel at any time ──
  TRACK D — Search rollout (16 pages)
  TRACK E — Customer intelligence
  TRACK F — Remaining 6 documents
  TRACK G — Nav + RBAC
```

**The one thing everyone trips on:** the deficiency engine needs to join *"the BOM says we need material #7"* to *"we have 40 in stock"*. Today `sku_bom` stores `raw_material_id` (a real FK) but `inventory` stores **`itemName` as free text** — there is no join. Everything in Tracks B and C is blocked until that's fixed.

> **Pragmatic call:** we do **not** need the full tenancy unification first. The FK is expressible today; the `owner_id` vs `projectId` cleanup is a real problem but belongs in Track G (RBAC), not on the critical path. This unblocks the deficiency engine months earlier.

---

## TRACK A — Item identity wiring 🔑 _foundation, do first_

**Problem:** `inventory."itemName"` is free text, so stock cannot be joined to the item master or the BOM. GRN receipt matches stock by **string equality on a display name** — `"MS Sheet"` and `"MS  Sheet"` become two separate stock rows.

**Steps**
1. Migration: add `inventory.raw_material_id` (FK → `raw_materials`), `inventory.sku_id` (for finished goods)
2. **Backfill by normalised name match** (trim, collapse spaces, case-fold, `×`/`x`) — and produce an **unmatched report**; never auto-guess
3. Merge duplicate stock rows created by the old string matching (sum quantities, log the merge)
4. Add `UNIQUE (projectId, raw_material_id)` so duplicates can't reappear
5. Rewire the write paths to set the ID: GRN receipt, production consumption, production output
6. Keep `itemName` as a **display snapshot**, no longer the identity

**Acceptance:** every stock row either links to a master item or appears on the unmatched report; creating a GRN twice for the same material updates one row, not two.

**Unblocks:** Tracks B and C.

---

## TRACK B — The deficiency engine ⭐ _the Steelco core_

The thing the whiteboard was actually about.

### B1 — The calculation
```
Required  = Σ over open order lines: (ordered − produced) × bom.qty_per_unit
Available = inventory.quantity  (joined via raw_material_id)
Shortfall = max(0, Required − Available)
On Order  = Σ open PO quantities for that material
Net       = Available + On Order − Required        (negative = short, positive = surplus)
Order Qty = round Shortfall up to the vendor's MOQ
```
Endpoint: `GET /material-requirements?orderId=&category=&status=`

### B2 — Buildable-now and the binding constraint
```
Buildable = MIN over every BOM line of floor(available / qty_per_unit)
```
The **MIN** is the point — a fire door needing sheets + hinges + glass is limited by whichever runs out first. **Always name the blocker**: *"Can build 1 of 10 — blocked by Glass"*. "Can build 1" is a number; "blocked by Glass" is an action.

Endpoint: `GET /customer-orders/:id/readiness`

### B3 — Screens
- **Material Requirements** — five explicit columns (Required · In Stock · Shortfall · On Order · Net), never the overloaded three. Status pill: Short / Ordered / Covered / Surplus. Filter by order, category, status. Row action → raise RFQ/PO.
- **Order Readiness** — inside the customer order: buildable count, the blocking material, per-BOM-line breakdown, one-click "procure the gap".
- **Dashboard tiles** — *Orders blocked* · *Materials short*, each linking straight into the filtered list.

**Acceptance:** reproduce the whiteboard exactly — 10 doors × 2 sheets, 4 in stock → `20 / 4 / 16`; after 1 door is made and a 20-MOQ PO is raised → `18 / 2 / 16 short, 20 on order`; after GRN → `18 / 22 / net +4 surplus`.

### B4 — Stock ledger (prerequisite for the date timeline)
`inventory_transactions (item, direction, qty, balance_after, reason, reference, project, user, at)`.
Rewire the three existing mutation sites to log. **Fixes two open bugs at once:** production not decrementing stock, and stock going negative silently.

---

## TRACK C — Vendor ↔ material link

**Problem:** raising a PO for MS sheets lists *every* vendor — the transporter, the electrician, the software vendor. The user must remember who sells steel.

**Steps**
1. `vendor_items (vendor_id, item_id, vendor_item_code, price, moq, lead_time_days, is_preferred)` — `UNIQUE (vendor_id, item_id)`
2. Manage it from both sides: a "Supplies" tab on the vendor, a "Vendors" tab on the material
3. **Filter the PO/RFQ vendor dropdown** by what's being purchased, preferred vendor first, showing price + lead time inline
4. Feed **per-vendor MOQ** into the deficiency engine's order-quantity rounding (falls back to the item-level MOQ)

**Acceptance:** picking "MS Sheet 1.2mm" on a PO shows only vendors who supply it, ordered by preference, with their price and lead time.

---

## TRACK D — Finish the search rollout _(independent)_

Backend already supports Vendors and Inventory; those two are **frontend-only** work.

| Group | Pages |
|---|---|
| Backend done, UI to swap | Vendors, Inventory |
| Needs both | Purchase Orders, GRN, Bills, Payables, Sales Invoices, Sales Quotations, Customer Orders, Delivery Challans, Credit/Debit Notes, Production, Work Orders, Projects, Quotations, Users |

Per page: server-side search, the 2–3 filters that actually matter (status, date range, party), sortable columns, pagination, consistent empty/loading states.

**Acceptance:** no list page fetches its whole table; every one is searchable and paged.

---

## TRACK E — Customer intelligence _(independent)_

**Build a customer detail page** — there isn't one today.

- **Header:** name, GSTIN, contact, payment terms, credit limit
- **Derived, not typed** — computed from order history:
  - *What they buy* — top categories/items
  - *Lifetime value*, average order size
  - *Average days to pay* vs agreed terms
  - *Outstanding balance* and overdue amount
  - Last order date, order frequency
- **Inline lists:** their orders, invoices, challans
- **Duplicate prevention** — search-before-create so "Apollo Hospitals" and "Apollo Hospital" don't both exist

Endpoint: `GET /customers/:id/summary`

**Acceptance:** opening a customer answers "what do they buy, what do they owe, do they pay on time" without leaving the page.

---

## TRACK F — The remaining 6 documents _(independent)_

Apply the tax-invoice treatment to: **Sales Quotation · Delivery Challan · GRN Bill · Credit/Debit Note · Purchase Order · RA Bill**.

Each gets: company identity + GSTIN/PAN/MSME, logo, **bank details** where money is owed, both addresses where goods move, place of supply, HSN, tax split, amount in words, terms, signature block, and the same **pre-issue compliance warning**.

**Document-specific rules**
- **Quotation** — must look clearly *not* like a tax invoice (it's a proforma; no ITC)
- **Delivery Challan** — must state it is not a tax invoice; carries vehicle/transporter/e-way bill
- **Credit/Debit Note** — must reference the original invoice number and date
- **Purchase Order** — vendor bank details not needed; our terms and delivery address are

**Plus 1A.5 (deferred from Phase 1):** draft-editable / issued-locked. Draft = click any field inline, totals recompute. Issued = locked; "Edit" becomes **"Issue Credit/Debit Note"**, pre-filled. Edits write to the invoice snapshot only, never back to the customer master.

---

## TRACK G — Navigation + RBAC _(independent)_

### G1 — One real role model
Replace the fake "View as" dropdown with the real logged-in role:
**Administrator · Procurement · Finance · Engineer · Viewer**

### G2 — Enforce at three layers
1. **Route guard** — `<RoleRoute allow={[...]}>`, not just "is logged in"
2. **API** — `requireRole` / `can()` per route
3. **Actions** — buttons hidden/disabled by permission, not just nav links

### G3 — Close the IDOR holes
Owner-scope **every** by-id read/write. Today `WHERE id = $1` with no owner check means any logged-in user can read or delete another tenant's records. This is also where the **`owner_id` vs `projectId` tenancy unification** lands.

### G4 — Nav restructure
6 role-aware groups: **Overview · Sell · Buy · Make · Money · Admin**. Collapsible; a group with nothing visible for your role disappears entirely. Declutter the header; responsive drawer below 1024px.

**Acceptance:** a Viewer cannot write anything via the UI *or* by calling the API directly; a Procurement user never sees Finance screens; no user can read another tenant's data by changing an id.

---

## Sequencing

**Milestone 1 — Unblock the core** (Track A)
Item identity wiring + backfill + unmatched report.

**Milestone 2 — The Steelco core** (Track B) ⭐
Ledger → deficiency calc → Material Requirements + Order Readiness screens. *This is the demo that proves the product.*

**Milestone 3 — Smart procurement** (Track C)
vendor_items → filtered PO dropdown → per-vendor MOQ.

**Milestone 4 — Breadth** (Tracks D, E, F, in parallel)
Search everywhere · customer intelligence · remaining documents.

**Milestone 5 — Trust** (Track G)
Real RBAC, IDOR closure, nav restructure.

**Why this order:** A is a hard blocker. B is the product's reason to exist and the strongest thing to show a stakeholder. C makes B actionable. D/E/F are breadth that can proceed in parallel whenever there's capacity. G is essential before a second real tenant, but nothing else waits on it.

---

## Known bugs folded into the tracks

| Bug | Fixed by |
|---|---|
| Production doesn't decrement stock | B4 (ledger) |
| Material cost computes to ₹0 | B4 + A |
| Stock can go negative silently | B4 |
| GRN string-matches stock by name | A |
| Cross-tenant IDOR | G3 |
| Doc numbers via `COUNT(*)+1` | F (sequences + UNIQUE) |
| Money stored as `REAL` | Alongside A's migration |
| Silent error-swallowing → blank screens | D (rollout pattern already set) |
| No responsive layout | G4 |

---

## Progress

- [ ] **A** — item identity wiring
- [ ] **B1** deficiency calc · **B2** buildable/blocking · **B3** screens · **B4** ledger
- [ ] **C** — vendor↔item + smart PO dropdown
- [ ] **D** — search rollout (16 pages)
- [ ] **E** — customer detail + derived insights
- [ ] **F** — 6 documents + draft/issued locking
- [ ] **G** — roles, IDOR, nav
