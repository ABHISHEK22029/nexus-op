# Maks Ops — master findings register

Every open problem, its fix, and what's realistically achievable now.

**Verified today**, not merged from older notes — several items in the
earlier documents are already closed and are listed as such at the bottom so
nothing gets fixed twice.

---

## At a glance

| # | Problem | Severity | Effort | Blocks testing? |
|---|---|---|---|---|
| 1 | Data spine is empty — deficiency engine has no inputs | 🔴 Critical | 2–3h | **Yes** |
| 2 | 27 write endpoints let any tenant change your data | 🔴 Critical | 3–4h | **Yes** |
| 3 | `/auth/register` open to the public | 🔴 Critical | 30m | **Yes** |
| 4 | `admin123` live in a public repo | 🔴 Critical | 15m + rotation | **Yes** |
| 5 | POs don't register as "on order" — you buy twice | 🔴 High | 3h | Yes |
| 6 | Invoice doesn't inherit the order's terms | 🔴 High | 2h | Yes |
| 7 | Partial dispatch marks whole order Delivered | 🔴 High | 1h | Yes |
| 8 | Three hot foreign keys unindexed | 🔴 High | 15m | No |
| 9 | `material-requirements` 8× slower under concurrency | 🟠 Med | 3h | At >5 users |
| 10 | Production needs a project | 🟠 Med | 1h | Partly |
| 11 | No opening-stock entry through the ledger | 🟠 Med | 2h | **Yes** |
| 12 | Company bank details empty | 🟠 Med | 10m (data) | Yes, for invoices |
| 13 | 5 lists have no summary aggregate | 🟠 Med | 2h | No |
| 14 | 33 queries with no `LIMIT` | 🟠 Med | 2h | No |
| 15 | `purchase_orders.vendorId` has no FK | 🟡 Low | 15m | No |
| 16 | No GST returns (GSTR-1/3B) | 🟠 Med | 1–2d | No |
| 17 | No batch / heat-number traceability | 🟠 Med | 1d | No |
| 18 | Single-level BOM only | 🟠 Med | 1–2d | No |
| 19 | No partial GRN / QC rejection | 🟠 Med | 1d | No |
| 20 | `POInvoice` + `GrnBillDoc` not rebuilt | 🟡 Low | 2h | No |
| 21 | No password reset / user invite | 🟡 Low | 4h | No |
| 22 | No customer price lists | 🟡 Low | 1d | No |
| 23 | No document numbering config | 🟡 Low | 4h | No |
| 24 | 42 stale Java files tracked | 🟡 Low | 5m | No |

---

# 🔴 CRITICAL — do these before testing

## 1. The data spine is empty

**What.** The deficiency engine — the differentiator — returns **0 rows,
0.1KB** on live data, because all four inputs are empty:

| Input | State |
|---|---|
| Materials with a vendor linked | 0 of 145 |
| Products with a BOM | 1 of 4 |
| Orders in an open state | 0 of 1 |
| **Stock rows linked to a material** | **0 of 4** |

That last row is the quiet one. Stock matches demand through
`inventory.raw_material_id`, and every row has it `NULL` — so "available" is
permanently zero however much stock you hold. The engine would say you're
short of material sitting in your own yard.

**Why it looks like a code problem.** Every feature above it — buildable-now,
blocked-by, MOQ rounding, 80/20, shortfall→PO — is wired correctly and has
nothing to act on. This is most of why the platform feels disconnected.

**Fix.**
1. Backfill `inventory.raw_material_id` by matching item names to materials, reporting whatever doesn't match rather than guessing.
2. Seed `vendor_items` for the materials you actually buy — even 20 of 145 makes the engine useful.
3. Add BOMs for the 3 products missing one.
4. A **setup completeness screen** that shows these four numbers, so it's visible rather than discovered.

**Achievable now:** yes, 2–3 hours including the backfill script.

## 2. 27 write endpoints have no ownership check

**What.** Confirmed live: a second tenant with an ordinary account changed
another company's order.

```
CO-0001 "In Procurement", owner_id 1
PATCH /customer-orders/11/status  as a DIFFERENT tenant  →  HTTP 200
CO-0001 "Closed"
```

27 handlers across 14 tables run `UPDATE`/`DELETE … WHERE id = $1` with no
owner condition — including `addPayment` on both sales invoices and GRN
bills, so another tenant can **record a payment against your invoice**.

**Fix.** Apply the existing `scopedById()` helper, the same treatment already
on the read path. Mechanical, but each one needs verifying — the checker
`scripts/check-unscoped-mutations.js` already finds them, and the tenant
probe `scripts/audit-idor.sh` proves the fix.

**Achievable now:** yes, 3–4 hours.

## 3. `/auth/register` is open to the public

Anyone who finds the URL creates an account, which becomes an **Owner** with
full access to its own workspace. Combined with #2, an anonymous person can
register and then modify your records.

**Fix.** Either close it and add admin-driven invites, or gate it behind a
signup token. Closing it is 30 minutes; invites are #21.

## 4. `admin123` is a working production password in a public repo

Still present in `KIRASHI_ADMIN_TEST_SCRIPT.md` and `Login.jsx`, and in git
history. The MetalpriceAPI key likewise.

**Fix.** Rotate the credentials — removing the files does not help, they're
in history. 15 minutes plus whatever rotation costs.

---

# 🔴 HIGH — these corrupt data or money

## 5. Purchase orders don't register as "on order"

**What.** After ordering 2,000kg of plate the engine still says
`on_order: 0, Short`. Tomorrow it orders another 2,000kg.

**Why.** `on_order` regex-normalises the PO **header's** `itemName` and
string-matches it against material names. `po_line_items` has no
`raw_material_id`, so it can't be computed from lines. Every multi-line PO
contributes zero, and your real POs are named `"EARTH PIT"` and
`"Foundation Bolt Assembly (M24 x 75…"` — matching nothing.

**Fix.**
1. Add `raw_material_id` to `po_line_items` (migration).
2. Populate it on create — the shortfall→PO path already knows the material.
3. Backfill existing lines by name match, reporting what doesn't match.
4. Rewrite `on_order` to sum `po_line_items` joined on the id.
5. Delete the regex join.

Material identity should never have been a string comparison.

**Achievable now:** yes, ~3 hours.

## 6. The invoice doesn't inherit the order's terms

The 5% discount and delivery terms agreed on the order are absent from the
invoice prefill. Retyped from memory, or dropped and the customer billed 5%
too much.

**Fix.** `SalesInvoiceController.prefill` reads the order but only copies
lines. Carry `discount`, `discount_type`, `terms`, `payment_terms_days` and
`gst_rate`. ~2 hours including the builder UI.

## 7. A partial dispatch marks the whole order Delivered

200 of 1,200 shipped → status `Delivered`, no quantity check. Worse than
leaving it Open: it tells the shop floor a job with 1,000 units outstanding
is finished.

**Fix.** Compare cumulative dispatched quantity per line against ordered
quantity; add a `Partially Delivered` state. ~1 hour.

## 8. Three hot foreign keys have no index

`sales_invoice_items.sales_invoice_id`, `delivery_challan_items.delivery_challan_id`,
`sales_payments.sales_invoice_id`. Every invoice, challan and payment lookup
is a sequential scan.

**Fix.** One migration, three `CREATE INDEX` statements. **15 minutes** — the
cheapest item on this list.

---

# 🟠 MEDIUM

## 9. `material-requirements` collapses under concurrency

710ms single → **5,559ms with 20 concurrent**. It explodes every open order
through its BOM in application memory per call, loads all stock, on-order and
UOM conversions each time, caches nothing.

**Fix, in order of value:**
1. Cache the computed result per owner for 30–60s, invalidated on order/stock/PO writes (the Redis layer already exists and is a no-op without `REDIS_URL`).
2. Move the BOM explosion into SQL rather than JS.
3. Paginate — it currently ignores `?limit`.

~3 hours for the cache alone, which removes the cliff.

## 10. Production can't start from a customer order without a project

Orders aren't project-scoped; production is. The order→make link is blocked
unless someone invents a project.

**Fix.** Make `projectId` optional on production when a `customer_order_id`
is present — the order supplies the context. ~1 hour.

## 11. No opening-stock entry through the ledger

`PATCH /inventory/:id` exists; create does not. Onboarding writes rows
directly, bypassing `stock_movements` and producing permanent drift. This is
*also why* #1 exists — those 4 rows were created outside the ledger and never
linked to materials.

**Fix.** `POST /inventory` and a bulk opening-stock import that both go
through `shared/stock.js`, so the ledger reconciles from row one. ~2 hours.

## 12. Company bank details are empty

Every invoice and quotation prints "Not configured" where payment details go.
A customer can't pay an invoice that doesn't say where to send money.

**Fix.** Fill them in Company Profile. **10 minutes of data entry**, no code.

## 13–15. Smaller structural gaps

- **5 lists have no summary aggregate** (`raw-materials`, `skus`, `vendors`, `customers`, `inventory`) — their pages must sum the visible page, wrong after page 1 in the flattering direction. ~2h.
- **33 hand-written queries have no `LIMIT`** — `runList` endpoints are capped at 1,000; these are not. ~2h.
- **`purchase_orders.vendorId` has no FK** — delete a vendor, its POs point at nothing. ~15m.

---

# 🟠 FEATURE GAPS — real, but not blocking

## 16. No GST returns
Every invoice carries correct CGST/SGST/IGST and place of supply, so the data
is right — nothing rolls it into GSTR-1/3B. The accountant still exports and
re-keys. **1–2 days.**

## 17. No batch / heat-number traceability
For structural steel the heat number is the chain back to the mill
certificate. "Which heat went into this beam?" is unanswerable. **1 day.**

## 18. Single-level BOM only
A cross-arm made of a fabricated bracket that is itself made of plate and
bolts can't be modelled. **1–2 days**, and it changes the deficiency
engine's explosion logic.

## 19. No partial GRN or QC rejection
Order 100 tonnes, receive 60 — the model can't express it. No `rejected_qty`,
no `qc_status`. **1 day.**

## 20–24. Lower priority
`POInvoice`/`GrnBillDoc` not rebuilt (2h) · no password reset or invite (4h) ·
no customer price lists (1d) · no document numbering config (4h) · 42 stale
Java files still tracked (5m).

---

# ✅ Already fixed — don't redo these

| Fixed | Evidence |
|---|---|
| Cross-tenant leak on 4 list endpoints (`owner_id = 1` literal) | `check-placeholders.js` passes |
| 5 unscoped `getById` reads | tenant probe returns 404 |
| 4 read IDORs incl. both prefill endpoints | `audit-idor.sh` |
| `/milestones` + `/grn-bills` cross-tenant reads | other tenant sees 0 |
| RBAC: 7 roles, deny-by-default, separation of duty | 18/18 live checks |
| Configurable roles + Configurator | 22/22 live checks |
| **Finished goods enter stock; dispatch removes them** | 10/10 stock-loop test |
| Stock ledger with reconciliation | `/inventory/reconcile` clean |
| Search + pagination on **all 28 list pages** | verified today |
| Shortfall → PO (grouped by vendor, MOQ-rounded) | 5/5 test |
| Sales order holds the deal (totals, discount, terms) | migration 035 |
| Delivery challan: e-way bill, ship-to, transporter | migration 032 |
| Nav restructure: 35 links → 7 modules + panel | `navtest.mjs` |
| Sidebar crash (`Link2`/`Layers` unimported) | `check-jsx-undefined.cjs` |
| Pareto 80/20 computed over filtered rows | fixed + proven |

---

# What I'd do now

**Day 1 — unblock testing (~7 hours)**
1. Three indexes (15m)
2. Rotate `admin123` + close `/auth/register` (45m)
3. Fill company bank details (10m — yours)
4. Backfill the data spine + setup-completeness screen (3h)
5. Opening-stock API through the ledger (2h)
6. Partial dispatch → `Partially Delivered` (1h)

After day 1 the platform is testable end to end with trustworthy numbers.

**Day 2 — stop the money bugs (~9 hours)**
7. 27 write IDORs (4h)
8. `raw_material_id` on PO lines, rewrite `on_order` (3h)
9. Invoice inherits order terms (2h)

**Day 3 — hold up under use (~5 hours)**
10. Cache `material-requirements` (3h)
11. Production without a project (1h)
12. FK on `vendorId` + summary aggregates (1h)

**Then** the feature gaps — GST returns first, since it's the one an
accountant will ask for in week one.

---

*Sources: [`sim-ikea.js`](backend/scripts/sim-ikea.js) (behavioural),
[`load-ikea.js`](backend/scripts/load-ikea.js) (scale),
[`audit-depth.js`](backend/scripts/audit-depth.js) (integrity),
[`check-unscoped-mutations.js`](backend/scripts/check-unscoped-mutations.js),
[`audit-idor.sh`](backend/scripts/audit-idor.sh),
[`audit-our-flow.js`](backend/scripts/audit-our-flow.js).*
