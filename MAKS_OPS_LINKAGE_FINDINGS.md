# Linkage findings — the IKEA simulation

You were right that the features aren't properly connected. My earlier audit
asked *"does this route exist"*, which is a structural question — and a
structurally complete chain can still be a set of disconnected screens.

So I built a behavioural test instead ([`sim-ikea.js`](backend/scripts/sim-ikea.js)):
run each step for real, then inspect the **next** step to see whether the
previous one's output actually arrived.

## The scenario

IKEA orders fabricated furniture components across **two separate orders**,
deliberately both consuming MS Plate — a deficiency engine that can only see
one order at a time under-orders, and nobody notices until the second job
stalls.

| Product | Qty | BOM |
|---|---|---|
| Shelf Bracket | 800 | 1.2kg plate + 0.4kg angle |
| Bed Slat Rail | 400 | 2.5kg plate + 0.05kg powder coat |
| Table Frame | 200 | 6.0kg angle + 8 × M8 bolt |

Three vendors with different prices, MOQs and lead times. Two sell plate (to
check the *preferred* one wins, not the cheapest). One material deliberately
has **no vendor** (to check it gets reported rather than silently dropped).

---

## What worked ✅

These are genuinely connected, verified with real numbers:

- **Order stores the deal.** ₹3,16,000 sub-total, 5% discount, 18% GST → ₹3,54,236. Terms and ship-by date persisted.
- **Deficiency aggregates across BOTH orders.** Plate required 1,960kg = (800×1.2) + (400×2.5). It did not compute per-order and miss the overlap.
- **Preferred vendor beats cheapest.** Jindal at ₹68 chosen over Electrosteel at ₹64, because Jindal is flagged preferred and has a 1,000kg MOQ against Electrosteel's 2,500kg.
- **MOQ rounding per vendor.** 1,560kg short → ordered 2,000kg (Jindal's MOQ is 1,000). Bolts: 1,600 short → 5,000 ordered.
- **PO grouping.** Plate and angle both from Jindal → **one** PO with two lines, not two POs.
- **Unlinked material reported.** Powder Coat appeared in `unassigned`, not dropped.
- **Order readiness is honest.** "Shelf Bracket: 800 remaining, 250 buildable, blocked by MS Angle" — the binding constraint, correctly identified.
- **Dispatch moves stock, customer 360 aggregates.** 2 orders, ₹56,640 billed, ₹20,000 received, ₹36,640 outstanding, and "what they buy" derived from order history.

---

## What's broken 🔴

### 1. Purchase orders don't register as "on order" — the engine will buy twice

**The worst finding.** After raising POs for 2,000kg of plate, the engine
still reported `on_order: 0` and `status: Short`. Run the shortfall→PO flow
again tomorrow and it orders another 2,000kg.

**Root cause:** `on_order` is computed by *fuzzy string-matching the PO
header's `itemName` against material names*:

```sql
JOIN raw_materials rm
  ON btrim(regexp_replace(lower(...rm.name...))) = btrim(regexp_replace(lower(...po."itemName"...)))
```

`po_line_items` has **no `raw_material_id`** — so there is no way to compute
this from the lines. The header holds one name, which means:

- **every multi-line PO contributes zero**, whatever it contains
- any spelling variation between the PO text and the material name breaks the match
- your real POs are named `"Foundation Bolt Assembly (M24 x 75…"`, `"PIT"`, `"EARTH PIT"` — none of which will match a material row

This predates my work; the shortfall→PO path just makes it fully visible,
since those POs are named `"2 materials (shortfall)"`.

**Fix:** add `raw_material_id` to `po_line_items`, populate it, compute
`on_order` from lines. String-matching material identity is the underlying
mistake.

### 2. A partial dispatch marks the whole order Delivered

Shipped 200 of 1,200 units. The order flipped to `Delivered`.

```js
UPDATE customer_orders SET status = 'Delivered' WHERE id = $1 AND status NOT IN ('Delivered','Closed')
```

No quantity check. The shop floor sees a completed job with 1,000 units still
to make. **Worse than leaving it Open**, because it actively misinforms.

**Fix:** compare dispatched quantity against ordered quantity; introduce
`Partially Delivered`.

### 3. The invoice doesn't inherit the order's negotiated terms

The 5% discount and the delivery/rejection terms agreed on the order are
**absent from the invoice prefill**. Whoever raises the invoice retypes them
from memory, or silently drops them and bills 5% too much.

This is the specific disconnect you described — the order and the invoice
are two screens rather than two stages of one thing.

### 4. Production can't be started from a customer order without a project

```
POST /production/from-order-item/:itemId
→ "Select an active project (top bar) to make against"
```

Customer orders are **not** project-scoped; production is. So the
order → production link — the whole point of a fabrication ERP — is blocked
for any work that isn't filed under a project. The user has to invent one.

### 5. No way to enter opening stock through the ledger

There is `PATCH /inventory/:id` but no create. Setting up initial stock means
writing rows directly, which **bypasses `stock_movements`** and creates
permanent reconciliation drift — exactly what my own simulation triggered
(2 rows drifted, balance 400 vs ledger 0).

Anyone onboarding real data hits this on day one.

---

## What I got wrong ⚪

Reporting these because a finding list that hides its own errors is less
trustworthy, not more:

- **"GRN failed"** — not a bug. `PO must be Dispatched before receiving GRN` is correct: you cannot receive goods that were never shipped. My simulation skipped Pending → Approved → Dispatched.
- **"Stock ledger drift"** — my simulation's fault. It inserted opening stock via raw SQL, bypassing the ledger. But that *is* how it surfaced finding #5, since there's no supported alternative.

---

## Priority

| # | Finding | Why it ranks here |
|---|---|---|
| 1 | PO not registering as on-order | Causes double-ordering of real money. Silent. |
| 2 | Invoice doesn't inherit order terms | Bills the customer the wrong amount. |
| 3 | Partial dispatch → Delivered | Actively misinforms the shop floor. |
| 4 | Production needs a project | Blocks the core order→make link. |
| 5 | No opening-stock entry | Blocks clean onboarding; guarantees drift. |

Items 1–3 all corrupt data or money. 4–5 block setup.

---

## Re-running this

```bash
cd backend && PORT=5099 node index.js &
SIM_BASE=http://localhost:5099 SIM_EMAIL=… SIM_PASSWORD=… node scripts/sim-ikea.js
```

It creates everything prefixed `IKEA-SIM` and removes it afterwards. It
refuses to run against a deployed host.
