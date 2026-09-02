# Deep findings — three test layers, IKEA scale

Three harnesses, each answering a different question:

| Harness | Question | Scale |
|---|---|---|
| [`sim-ikea.js`](backend/scripts/sim-ikea.js) | Does step N's output actually reach step N+1? | 3 products, 2 orders |
| [`load-ikea.js`](backend/scripts/load-ikea.js) | What breaks at volume? | 8,000 materials · 2,000 products · 9,000 BOM lines · 8,000 order lines · 4,000 POs |
| [`audit-depth.js`](backend/scripts/audit-depth.js) | Payload, integrity, consistency, parity | live database |

**14 findings.** The most serious one isn't code.

---

# 🔴 THE ONE THAT MATTERS MOST

## The deficiency engine cannot produce output on your live data

Not because it's broken — because **its four inputs are all empty**:

| Input it needs | State |
|---|---|
| Materials with a vendor linked | **0 of 145** |
| Products with a bill of materials | **1 of 4** |
| Customer orders in an open state | **0 of 1** |
| Stock rows linked to a raw material | **0 of 4** |

That last row is the quiet killer. Stock is matched to demand through
`inventory.raw_material_id`, and **every** inventory row has it `NULL`. So
"available" is permanently zero no matter how much stock you hold — the
engine would report you short of material sitting in your own yard.

`GET /material-requirements` returns **0 rows, 0.1KB** right now. Every
feature built on top of it — buildable-now, blocked-by, MOQ rounding, the
80/20 split, shortfall→PO — has nothing to act on.

**This is why the platform feels disconnected.** The wiring is there; the
spine it runs along was never populated.

---

# 🔴 HIGH — linkage (from the behavioural simulation)

### 1. Purchase orders don't register as "on order" — you will buy twice

After ordering 2,000kg of plate, the engine still reports `on_order: 0,
status: Short`. Run it tomorrow, it orders another 2,000kg.

`on_order` is computed by **regex-normalising the PO header's `itemName` and
string-matching it against material names**. `po_line_items` has no
`raw_material_id`, so it cannot be computed from lines. Therefore:

- **every multi-line PO contributes zero**, whatever it contains
- your real POs are named `"EARTH PIT"`, `"Foundation Bolt Assembly (M24 x 75…"` — matching no material row

At load scale the join matched 3,000 of 4,000 POs only because the seed data
used identical strings. Real data won't.

### 2. A partial dispatch marks the whole order Delivered

200 of 1,200 units shipped → order status `Delivered`. No quantity check.
Worse than leaving it Open: it tells the shop floor a job with 1,000 units
outstanding is finished.

### 3. The invoice doesn't inherit the order's negotiated terms

The 5% discount and delivery terms agreed on the order are **absent from the
invoice prefill**. Retyped from memory, or dropped and the customer billed 5%
too much.

### 4. Production can't start from a customer order without a project

`POST /production/from-order-item/:id` → *"Select an active project"*.
Customer orders aren't project-scoped; production is. The order→make link is
blocked unless someone invents a project.

### 5. No way to enter opening stock through the ledger

`PATCH /inventory/:id` exists; create does not. Onboarding writes rows
directly, bypassing `stock_movements`, producing permanent reconciliation
drift on day one. (This is also *why* finding #0 exists — the 4 inventory
rows were created outside the ledger and never linked to materials.)

---

# 🔴 HIGH — scale (from the load test)

### 6. `material-requirements` collapses under concurrency

| | Single request | 20 concurrent |
|---|---|---|
| Response time | 710ms | **5,559ms** |

**8× degradation.** It explodes every open order through its BOM in
application memory, loads all stock, all on-order and all UOM conversions
per call, and caches nothing. Five people opening the page at once is enough.

### 7. Three hot foreign keys have no index

- `sales_invoice_items.sales_invoice_id`
- `delivery_challan_items.delivery_challan_id`
- `sales_payments.sales_invoice_id`

Every invoice, challan and payment lookup is a sequential scan. Invisible at
11 rows; quadratic at 10,000.

---

# 🟡 MEDIUM

### 8. Five lists have no summary aggregate
`raw-materials`, `skus`, `vendors`, `customers`, `inventory`. Their pages
must either show no totals or sum the visible page — which is wrong after
page 1, in the flattering direction.

### 9. 33 hand-written queries return rows with no `LIMIT`
`runList`-backed endpoints are capped at 1,000. Anything that builds its own
SELECT is not, and grows with the table.

### 10. `purchase_orders.vendorId` has no foreign-key constraint
Delete a vendor and its purchase orders point at nothing. The database won't
stop you.

### 11. 4 stock rows link to neither a material nor a product
They're invisible to the deficiency engine and to any report that joins
through those keys.

### 12. 3 of 4 products have no bill of materials
### 13. 145 of 145 materials have no vendor
### 14. 0 of 1 orders is in an open state

---

# ✅ What genuinely holds

Worth stating, because it's most of the system:

- **Deficiency aggregates across multiple orders.** Plate 1,960kg = (800×1.2) + (400×2.5) — it does not compute per-order and miss the overlap.
- **Preferred vendor beats cheapest.** Jindal ₹68/MOQ 1,000 over Electrosteel ₹64/MOQ 2,500.
- **PO grouping and MOQ rounding.** Two materials from one vendor → one PO, two lines, each rounded to that vendor's minimum.
- **Readiness names the binding constraint** — *"800 remaining, 250 buildable, blocked by MS Angle"*.
- **No N+1 queries.** 50 rows costs the same as 1 row on every list probed (×0.9–×1.2).
- **Search and deep pagination are flat.** Page 40 is as fast as page 1 at 8,000 rows (40ms vs 47ms).
- **Aggregates stay honest at scale.** Endpoint total 2,001 = table count 2,001.
- **No orphaned rows, no negative stock, no over-payment, no mis-marked Paid invoices.**

---

# Priority

| Order | Fix | Why |
|---|---|---|
| 1 | **Seed the data spine** — link inventory→materials, materials→vendors, products→BOMs | Nothing else can be tested until the engine has inputs |
| 2 | `raw_material_id` on `po_line_items`, compute `on_order` from lines | Stops double-ordering real money |
| 3 | Invoice inherits order terms | Stops mis-billing customers |
| 4 | Partial dispatch → `Partially Delivered` | Stops misinforming the floor |
| 5 | Three missing indexes | One migration, immediate |
| 6 | Cache/paginate `material-requirements` | Before more than ~5 concurrent users |
| 7 | Production without a project; opening-stock API | Unblocks setup |

Items 1–4 are the ones that corrupt data or money. 5 is a ten-minute fix.

---

# Re-running any of these

```bash
cd backend && PORT=5099 node index.js &

# behavioural linkage (creates + removes IKEA-SIM data)
SIM_EMAIL=… SIM_PASSWORD=… node scripts/sim-ikea.js

# scale (creates + removes ~35,000 LOAD- rows)
LOAD_EMAIL=… LOAD_PASSWORD=… LOAD_MATERIALS=8000 LOAD_ORDERS=2000 node scripts/load-ikea.js

# depth — read-only, no seeding
AUDIT_EMAIL=… AUDIT_PASSWORD=… node scripts/audit-depth.js
```

All three refuse to run against a deployed host.
