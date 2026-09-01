# Maks Ops — everything still missing

Audited, not remembered. Every item below was verified against the live
database or by probing a running server with a second real tenant.

Two sections: **functional** (what the product can't do) and **security**
(what it does that it shouldn't).

---

# PART 1 — FUNCTIONAL GAPS

## 1.1 The inventory loop is only half closed 🔴

This is the biggest functional hole, and it matters most for exactly the
thing you want to test.

| Movement | Works? |
|---|---|
| Goods received (GRN) → stock **increases** | ✅ |
| Production consumes raw material → stock **decreases** | ✅ |
| Production **output** → finished goods enter stock | ❌ **missing** |
| Dispatch / invoice → finished goods **leave** stock | ❌ **missing** |

The only code path that inserts into `inventory` is goods receipt
(`routes/grn.js:135`). Production output is written to `production_output`
and never reaches stock. Delivery challans and sales invoices touch
inventory not at all.

**What this means in practice:** you make 200 cross-arms — they exist in
`production_output` but the system says you have zero. You dispatch them —
stock still says zero. Raw material is tracked correctly; **finished goods
are not tracked at all.**

For the IKEA-scale test this will look like the deficiency engine
mis-answering "what can we build" for anything with a sub-assembly, and
"what finished stock do we have" being permanently empty.

**Also missing:** a stock ledger. `inventory.quantity` is a running number
with no movement history, so "why is stock 40 when it should be 60" has no
answer. Every serious inventory system stores movements and derives the
balance; this stores the balance and derives nothing.

## 1.2 Procurement flow has a dead end

- **Indent → PO conversion doesn't exist.** You can raise an indent (a site
  material request), and it goes nowhere. Someone re-keys it into a PO by
  hand. `purchase_orders` has no `indent_id`, so the link isn't even
  recorded after the fact.
- **No partial receipt.** GRN has no `received_qty` vs `ordered_qty`
  distinction. Order 100 tonnes, receive 60 — the model can't express it.
- **No QC / rejection on receipt.** No `rejected_qty`, no `qc_status`.
  Damaged or off-spec material has nowhere to go, which for a steel
  fabricator (heat numbers, mill certs, dimension checks) is a real gap.

## 1.3 Compliance reporting is absent

- **No GSTR-1, no GSTR-3B, no GST summary of any kind.** Every invoice
  carries correct CGST/SGST/IGST and place of supply, so the data is
  right — but there is nothing that rolls it into a return. The accountant
  still exports and re-keys.
- **No P&L, no trial balance, no stock-movement report.**
- **E-invoice IRN has a field but no generation.** The column exists;
  nothing calls the IRP. That's the right call (it needs a GSP contract),
  but it means invoices above the ₹5 crore threshold aren't compliant.

## 1.4 Master-data gaps for a fabricator

- **No batch / lot / heat-number tracking.** For structural steel, the heat
  number is the traceability chain back to the mill certificate. A customer
  or third-party inspector asking "which heat went into this beam" cannot
  be answered.
- **No multi-level BOM.** `sku_bom` is one level deep — a product's
  components. A cross-arm assembly made of a fabricated bracket that is
  itself made of plate and bolts cannot be modelled.
- **No customer-specific price lists.** Rates are typed per order. A
  customer with agreed annual pricing is re-keyed every time, and nothing
  catches a quote below the agreed rate.
- **No document numbering configuration.** Prefixes and formats are
  hardcoded (`INV-0001`, `CO-0001`). No financial-year reset, no
  per-branch series — both of which Indian businesses generally need.

## 1.5 User management is incomplete

- **No invite flow.** An administrator can assign roles and deactivate
  accounts, but cannot *create* one — people must self-register at
  `/auth/register`, which is also open to anyone who finds it.
- **No password reset.** A forgotten password needs a database console.
- **No per-user permission overrides.** "This one person may also approve
  POs" requires creating a whole role.

## 1.6 Documents not yet rebuilt

`POInvoice` and `GrnBillDoc` still use the old layout — no company identity
block, no bank details, no compliance warnings. (Sales invoice, quotation,
delivery challan, credit/debit note and RA bill are done.)

## 1.7 Smaller things

- **PO line items are free text** with no link to a raw material, so the
  vendor picker's material filter must be chosen by hand rather than
  inferred from what's being bought.
- **51 knowledge-base articles still say "Nexus-OP"** — the rename was
  cosmetic and never touched database content.
- **`/production` requires a `projectId`** and 400s without one, unlike
  every other list.
- **`nexus-backend/`** — a stale Java folder still tracked in git.
- **`role_change_log` is never pruned.**
- **Custom roles aren't seeded into a fresh environment** — only the seven
  built-ins are.

---

# PART 2 — SECURITY GAPS

## 2.1 Write-side IDOR — 28 handlers 🔴🔴

**Confirmed live, not theoretical.** A second tenant, logged in with an
ordinary account, successfully changed another company's customer order:

```
BEFORE  CO-0001  status "In Procurement"  owner_id 1
PATCH /customer-orders/11/status  as a DIFFERENT tenant   →  HTTP 200
AFTER   CO-0001  status "Closed"          ← changed by someone who doesn't own it
```

(Restored immediately.)

28 handlers run `UPDATE … WHERE id = $1` or `DELETE … WHERE id = $1` with no
ownership check, across 14 tables:

| Table | Handlers affected |
|---|---|
| `customer_orders` | 5 |
| `sales_invoices` | 3 (incl. **addPayment**) |
| `quotations` | 3 |
| `grn_bills` | 3 (incl. **addPayment**) |
| `vendor_items`, `sales_quotations`, `recurring_profiles`, `production_orders`, `inventory`, `delivery_challans` | 2 each |
| `quote_lines`, `credit_debit_notes`, `bills`, `attachments` | 1 each |

The payment ones are the worst: **another tenant can record a payment
against your invoice**, which corrupts your receivables rather than merely
reading them.

This is worse than the read leaks fixed earlier — those exposed data, these
let someone change or destroy it.

## 2.2 Read-side IDOR — 4 found, all fixed this session ✅

Probed with a real second tenant. Four returned HTTP 200:

- `/customer-orders/:id` — order, customer name, **their GSTIN**, every line with rate
- `/quotations/:id` — vendor quotes and pricing
- `/sales-invoices/prefill/:orderId` — customer, GSTIN, place of supply, payment terms, all rates
- `/delivery-challans/prefill/:orderId` — same, plus delivery address

The prefill endpoints were the subtlest: they look like form helpers, but
they are reads of somebody's order. Guarding the destination document
doesn't help when the thing being copied is the sensitive part.

**All four now return 404 to another tenant.** Nine other endpoints tested
were already correctly scoped.

## 2.3 Still outstanding from before

- **`admin123` is a working production password** in tracked files
  (`KIRASHI_ADMIN_TEST_SCRIPT.md`, `Login.jsx`) on a **public** repo, and in
  git history. Removing the files won't help; the credential needs rotating.
- **MetalpriceAPI key** likewise in `PRICE_UPDATE_AND_CACHING_PLAN.md`.
- **`/auth/register` is open.** Anyone who finds the URL can create an
  account. It becomes an Owner (full access to its own workspace). Combined
  with 2.1, an anonymous person can register and then modify your orders.

## 2.4 Lower severity

- **No rate limiting** on login or any endpoint — password guessing is
  unthrottled.
- **JWT has no refresh/revocation.** A stolen token is valid until expiry;
  deactivating a user doesn't invalidate their existing token.
- **No CSRF protection**, though the JWT-in-header pattern makes this mostly
  moot.
- **`cors()` is fully open** — any origin may call the API.

---

# Priority order

| # | Item | Why first |
|---|---|---|
| 1 | **Write-side IDOR (28 handlers)** | Another tenant can alter/delete your data *today*. Blocks any multi-tenant test. |
| 2 | **Close `/auth/register` or gate it** | It's the front door to #1. |
| 3 | **Rotate `admin123` + API key** | Live credentials, public repo. |
| 4 | **Finished-goods inventory** | Without it "smart inventory" can't be tested at all. |
| 5 | Company bank details | Blocks realistic invoice testing. |
| 6 | Stock ledger | Needed to explain any stock number at scale. |
| 7 | Indent → PO, partial GRN, QC | Completes procure-to-pay. |
| 8 | GSTR-1 export | Highest-value reporting gap. |

Items 1–3 are, in my view, prerequisites for testing rather than
improvements to it — a multi-tenant test on top of #1 will produce results
you can't trust.
