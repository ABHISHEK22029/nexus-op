# Maks Ops — driving the full chain through the forms

*2 Sep 2026. Quotation → order → production → stock → dispatch → invoice,
through the real UI, with every number asserted against the database.*

---

## Why

The previous run proved every screen loads and every list shows what it
fetched. It did not touch a single form. Everything transactional had been
tested with curl, which proves the endpoints compose but not that a person can
reach them — and the gap turned out to be real and expensive.

[`frontend/scripts/chain-ui.cjs`](frontend/scripts/chain-ui.cjs) drives one
order end to end and asserts at the hop where each number is produced, against
the database rather than the screen that produced it. A page that displays
₹94,400 while storing ₹0 passes a screenshot test and fails this one — which is
exactly what happened.

The numbers: **100 × ₹850 = ₹85,000 − ₹5,000 discount = ₹80,000 taxable + 18%
GST = ₹94,400.** Produce 60, dispatch 40, invoice the lot.

---

## What it found

### 1 · Converting a won quotation produced a ₹0 order — **fixed**

`convertToOrder` inserted the header identity — customer, number, date, status,
notes — and the line items with their rates. Every commercial column on the
order stayed at its default:

```
sub_total 0 · discount 0 · gst_total 0 · total 0 · amount_in_words null
interstate FALSE          ← the quotation said TRUE
```

So converting a won ₹94,400 quote produced an order reading **₹0** in the list,
silently dropped the negotiated ₹5,000 discount, and flipped an inter-state
supply to intra-state — the difference between IGST and CGST+SGST on the
invoice that follows.

**Fix:** [`SalesQuotationController.js`](backend/controllers/SalesQuotationController.js) —
the order's totals are recomputed with the same `compute()` the quotation used.
Recomputed rather than copied: copying makes the order agree with the
quotation, recomputing makes it agree with the rows actually inserted, and it
cannot drift from the quotation's arithmetic because it *is* that arithmetic.

Verified: CO-0006 stores `total 94400`, `interstate true`, IGST ₹14,400,
`amount_in_words` set.

---

### 2 · Raising an invoice marked the order Delivered, whatever had shipped — **fixed**

The challan handler is careful. It sums every dispatched line against every
ordered line and picks `Delivered` or `Partially Delivered` from the
comparison, with a comment explaining that marking an order Delivered on any
dispatch of any size is worse than leaving it Open, because it tells the shop
floor a job with a thousand units outstanding is done.

The invoice handler then did precisely that, one file away:

```sql
UPDATE customer_orders SET status = 'Delivered' WHERE id = $1 AND status <> 'Closed'
```

Unconditional. Invoicing normally follows dispatch, so it ran **second** and
overwrote the careful answer with the careless one. Ship 40 of 100, raise the
invoice, and the order reads Delivered with 60 units never made.

**Fix:** [`shared/orderProgress.js`](backend/shared/orderProgress.js) — one
`syncOrderDelivery()` that both callers use, which only ever looks at
dispatched quantities and leaves the status alone when nothing has shipped.
Invoicing is a billing event; it has no business deciding whether goods moved.

Verified: after dispatching 40 of 100 and invoicing, the order reads
**Partially Delivered**.

---

### 3 · Every document was stored undated — **fixed**

Four of four quotations, three of four invoices and two of three challans on
this database had **no date**. All four document forms initialise their date
field to `''`, and nothing fills it.

An undated tax invoice is not a valid one — Rule 46(b) makes the date a
mandatory particular. Rule 55 requires it on a delivery challan, which is the
document that travels with the goods. And a quotation's "valid until" is read
against a date it did not have.

**Fix, both ends.** The forms now show today ([`lib/dates.js`](frontend/src/lib/dates.js),
used by the quotation, order, challan and invoice forms), and the three
inserts floor the value with `COALESCE($n::date, CURRENT_DATE)` so no client
can store an undated document.

`toISOString().slice(0, 10)` is deliberately *not* used: that is UTC, so
between midnight and 05:30 IST it returns yesterday — an invoice dated a day
early is a real problem in a GST return. `toLocaleDateString('en-CA')` gives
`YYYY-MM-DD` in the browser's own timezone.

---

### 4 · Production started from an order line was unowned — **fixed**

`createOrder` sets `owner_id`; `createFromOrderItem` did not. The "Make" button
on an order line is the normal way to start a job, so in practice every
production order was unowned — invisible to owner scoping, and the reason
finished goods land on a `NULL`-owner stock row while dispatch looks up the
challan's owner: one item, two rows, and a ledger balancing against the wrong
one.

**Fix:** [`ProductionController.js`](backend/controllers/ProductionController.js) —
`owner_id` set on the same insert that already sets `customer_order_id` and
`sku_id`.

---

## The chain, verified

**39 of 39 assertions pass.** The ones that matter:

| Hop | Asserted |
|---|---|
| Quotation | gross ₹85,000 · tax ₹14,400 · net ₹94,400 · IGST-only · amount in words · dated · SKU kept |
| Convert | order carries the line, the value, the tax treatment, a date and words |
| Make | production linked to **both** the customer order and the SKU, and owned |
| Output | 60 pcs stored · `stock_applied` · balance moves · a signed `+60` ledger entry |
| Dispatch | challan linked to the order · stock falls by **exactly** 40 |
| Invoice | prefilled from the order · ₹80,000 + ₹14,400 = ₹94,400 · IGST matches the quotation · Rule 46 fields |
| After | order reads **Partially Delivered** · requirements engine returns **160 kg** of MS Angle |

That last number is the one worth having. `(100 ordered − 60 produced) × 4
kg/unit = 160` — proof that production output feeds back into what still needs
buying, across four tables and three screens.

Nothing else regressed: 33/33 screens, 27/27 lists, 18/18 RBAC, 22/22
configurator, 10/10 stock loop, 5/5 shortfall→PO, seven static checkers, build.

---

## Two assertions that passed without testing anything

Worth recording, because both are the failure mode I flagged last time.

**"order status moved off Open"** passed while the order read `Delivered` after
40 of 100 had shipped. The assertion was too weak to fail. It now names the one
correct answer — and immediately failed, which is how bug 2 was found.

**"the requirements engine sees this order"** asserted `HTTP 200` and passed on
an empty result, because the SKU the test happened to pick had no bill of
materials. The test now *finds* a SKU that has one and asserts the exploded
quantity. A test that cannot fail is worse than no test, because it is believed.

Three of my own test bugs also came before any real one: `pickOption(…, '\w')`
matched the "— Select —" placeholder so no customer was chosen; `^Pcs$` never
matched because the label and placeholder are concatenated; and I asserted on
`net_amount` when the order's column is `total`, reporting ₹0 for an order that
stored the right figure. All fixed rather than annotated.

---

## Also fixed along the way

The **RBAC and configurator suites were unrunnable**. They created their
accounts with `POST /auth/register` then `UPDATE`d the role — which works
exactly once. On any later run the email is taken, register refuses, the
password stays whatever it was, and the suite aborts with "no token for
VIEWER". Deactivating those accounts after the committed-credential incident
made it permanent.

[`ensure-test-user.js`](backend/scripts/ensure-test-user.js) upserts instead —
password, role and `is_active` — and refuses any address that is not
`@test.local` or `@example.invalid`, so a typo cannot reset a real user's
password. [`retire-test-users.js`](backend/scripts/retire-test-users.js)
deactivates them again afterwards.

---

## Running it

```bash
# backend on 5099, vite on 5173
cd frontend && UI_EMAIL=… UI_PASSWORD=… PROJECT_ID=1 npm run test:ui:chain
cd backend  && node scripts/clean-chain.js UITEST-XXXX     # or --all-uitest
```

The chain writes real records to a real database. Every document carries a run
marker, and `clean-chain.js` removes them in dependency order inside a
transaction. It deliberately leaves **stock movements and inventory rows** —
the ledger is an append-only record of what happened, and a test run genuinely
did move stock. Rewriting that history would defeat the point of having a
ledger.

---

## What this still does not cover

One happy path, one customer, one product, inter-state, one browser. It does
not cover: validation and error paths (what happens on a negative quantity, a
missing customer, a duplicate invoice number), editing or cancelling anything,
credit and debit notes, the purchase side (indent → RFQ → PO → GRN → bill →
payment), payment recording and part-payment, PDF output, or concurrency.

The purchase side is the obvious next one — it is the half of the product the
deficiency engine actually feeds, and it has had no form-level test at all.
