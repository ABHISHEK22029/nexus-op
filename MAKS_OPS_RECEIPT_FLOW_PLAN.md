# Goods receipt: what's wrong, and exactly how to fix it

Written 2026-09-07, after `dd7bac9` routed receipts through the stock ledger.
That fixed *where the stock goes*. This is about *how much of the order has
arrived* — which is still not tracked at all.

Every claim below is from the live database or the source, quoted.

---

## The evidence

```
PO 20   ordered    150   received   1250   status Delivered   ← 8× over-received
PO  4   ordered  50000   received      0   status Delivered   ← closed, nothing arrived
PO  9   has 2 line items                                      ← received as one
POs with more than one GRN: 0                                 ← because it is impossible
```

`purchase_orders` columns: `id, projectId, workOrderId, vendorId, itemName,
quantity, indentId, status, unitPrice, …` — **there is no `received_quantity`**.
`po_line_items` has `quantity` and nothing else. Nothing anywhere records how
much of a purchase order has actually turned up.

---

## The five faults, in the order they bite

### 1. The first receipt closes the order

`routes/grn.js:84`

```js
await client.query(`UPDATE purchase_orders SET status = 'Delivered' WHERE id = $1`, [poId]);
```

Unconditional. Receive 1 of 40 and the PO is Delivered.

### 2. Which makes the second receipt impossible

`routes/grn.js:68`

```js
if (po.status === 'Delivered') return await refuse(400, 'PO is already delivered');
```

So a part-load can never be completed. `POs with more than one GRN: 0` is not
a coincidence — the system forbids it. In real buying, part-loads are normal:
the vendor sends what is on the lorry.

The two faults together mean **the rest of the order silently disappears**.
Nobody is chasing the balance, because nothing knows there is one.

### 3. Over-receipt is not checked

Nothing compares `receivedQuantity` to what was ordered. PO 20 took 1250
against an order for 150 and said nothing. That is 8× the stock, 8× the
value on the shelf, and an invoice nobody can reconcile.

### 4. A multi-line PO is received as a single item

GRN reads `po.itemName` — the header. `po_line_items` is only consulted for
its unit (`grn.js:100`). So a PO for plate, angle and fasteners receives one
quantity of whatever the header says, and the other two materials never
enter stock at all.

### 5. Status is not evidence

PO 4 is Delivered with nothing received. The dashboard counts it:

```
index.js:1408   (SELECT COUNT(*) FROM purchase_orders WHERE … status = 'Delivered') AS delivered
index.js:1440   deliveredPOs: parseInt(t.delivered)
```

So "POs Delivered 6" on the dashboard is a count of a flag that is set
without reference to whether anything arrived.

---

## The fix already exists — on the other side of the business

`shared/orderProgress.js` solves precisely this for sales:

```js
const complete = ordered > 0 && dispatched >= ordered - 0.001;
const status   = complete ? 'Delivered' : 'Partially Delivered';
```

It sums what actually shipped from the challans, compares it to what was
ordered, and derives the status. It deliberately leaves the status alone
when nothing has shipped.

**The purchase side needs its twin.** This is not new design — it is
applying a pattern this codebase already got right, one layer over.

---

## The plan

### Step 1 — migration 048: record what arrived

```sql
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS received_quantity NUMERIC DEFAULT 0;
ALTER TABLE po_line_items   ADD COLUMN IF NOT EXISTS received_quantity NUMERIC DEFAULT 0;
ALTER TABLE grn             ADD COLUMN IF NOT EXISTS po_line_item_id INTEGER REFERENCES po_line_items(id);

-- 'Partially Received' is a real state and the CHECK forbids it today.
ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_status_check;
ALTER TABLE purchase_orders ADD  CONSTRAINT purchase_orders_status_check
  CHECK (status IN ('Pending','Approved','Dispatched','Partially Received','Delivered','Closed'));
```

Backfill `received_quantity` from `SUM(grn."receivedQuantity")` per PO — the
receipts are already recorded, only never totalled.

Then correct the two rows the evidence found: PO 4 (Delivered, nothing
received) back to `Dispatched`; PO 20 flagged for a human, since 1250 against
150 is either a data-entry error or a genuine over-delivery and only the
buyer knows which. **Do not guess.**

### Step 2 — `shared/receiptProgress.js`

The mirror of `orderProgress.js`:

```js
async function syncPoReceipt(client, poId) {
  // ordered  = SUM(po_line_items.quantity)  ... falling back to purchase_orders.quantity
  //            for the single-line POs that predate line items
  // received = SUM(grn."receivedQuantity")
  // status   = received <= 0            -> leave alone
  //            received >= ordered-tol   -> 'Delivered'
  //            otherwise                 -> 'Partially Received'
}
```

Same tolerance as the sales side: quantities are `real`, and 149.9999 is
delivered. Same refusal to touch the status when nothing has arrived.

### Step 3 — rewrite the guard in `routes/grn.js`

Replace

```js
if (po.status === 'Delivered') return await refuse(400, 'PO is already delivered');
```

with a balance check, not a status check:

```js
const { ordered, received } = await receiptTotals(client, poId);
if (received >= ordered - 0.001) return await refuse(409, 'This purchase order is fully received');
if (received + stockQty > ordered * 1.05) return await refuse(409,
  `That is more than the order. Ordered ${ordered}, already received ${received}. ` +
  `Amend the purchase order first if the vendor genuinely sent more.`);
```

The 5% tolerance is deliberate: steel is sold by the coil and a 2% overrun is
ordinary trade, while 8× is an error. **Confirm the tolerance with the buyer
before shipping** — I picked 5% as a placeholder, not from your practice.

And replace the unconditional `SET status = 'Delivered'` with
`await syncPoReceipt(client, poId)`.

### Step 4 — receive against a line, not a header

`grn.po_line_item_id` from step 1. The receipt form lists the PO's lines with
ordered / already received / outstanding, and you enter against one. For
single-line POs — 10 of the 11 on this database — the line is chosen
automatically and nothing changes for the user.

This is the largest piece of UI work in the plan and the only part that is
not a like-for-like port of the sales side.

### Step 5 — make the dashboard count reality

`deliveredPOs` becomes a count of POs whose received quantity meets the
ordered quantity, not of a flag. One SQL change at `index.js:1408`.

### Step 6 — the test

Extend `scripts/test-inventory-flow.js`:

- order 40, receive 15 → PO is `Partially Received`, stock +15, ledger agrees
- receive 15 again → still `Partially Received`, stock +30 *(impossible today)*
- receive 10 → `Delivered`, stock +40
- receive 1 more → refused, 409
- order 40, try to receive 500 → refused before any stock moves
- a multi-line PO receives against each line separately

---

## Order of work, and why

1. **Step 1 + 2 + 3** together — they are one change and the system is
   inconsistent between them. Half a day.
2. **Step 6** immediately after, before touching the UI. The assertions are
   the specification.
3. **Step 5** — one line, do it while the context is fresh.
4. **Step 4** last. It is the only part that needs design, it affects 1 PO in
   11 on this database, and everything above is correct without it.

## What I need from you

- **The over-receipt tolerance.** 5% is my guess. What does your trade
  actually allow — exact, or a percentage, or "warn but let it through"?
- **PO 20 (ordered 150, received 1250).** Data-entry error to correct, or a
  real over-delivery to keep? I will not guess at stock quantities.
- **Should a partly-received PO be closable?** A vendor short-ships 5 and
  never sends them; the buyer wants the PO shut. That needs a `Closed`
  status and a "close short" action — included in the migration above, not
  in the UI plan.
