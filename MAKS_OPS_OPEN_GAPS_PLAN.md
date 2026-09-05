# Open gaps — plan to close

Written 2026-09-05, after the full menu sweep (commit `b9f3ee2`).
Every item below is evidence-backed; the evidence is quoted so nothing here
has to be taken on trust.

Ordered by what breaks a business worst, not by what is quickest.

---

## P0 — correctness. These produce wrong documents or wrong numbers.

### 1. Document numbers collide. Eight document types.

**Evidence.** Every number is `COUNT(*) + 1`:

| File | Line | Document |
|---|---|---|
| `SalesQuotationController.js` | 107 | `QT-nnnn` |
| `SalesQuotationController.js` | 169 | `CO-nnnn` (on convert) |
| `SalesController.js` | 80 | `CO-nnnn` (direct) |
| `SalesController.js` | 303 | purchase orders |
| `SalesInvoiceController.js` | 137 | sales invoices |
| `RecurringController.js` | 137 | sales invoices (recurring) |
| `DeliveryChallanController.js` | 87 | delivery challans |
| `GrnBillController.js` | 83 | GRN bills |
| `CreditDebitNoteController.js` | 110 | credit/debit notes |

Two independent failures:

- **Delete anything and the next document reuses its number.** My own
  quotation test raised 40 and deleted 40; the next quotation raised will
  reuse numbers already issued to a customer.
- **Two users creating at the same moment get the same number.** Both
  `COUNT(*)` reads run before either insert commits.

A duplicated invoice number is not cosmetic. It is a GSTR-1 filing error,
and under Rule 46 the invoice number must be unique in the financial year.

**Fix.** A `document_sequences` table keyed on `(owner_id, doc_type, fy)`
holding `last_seq`, allocated with `UPDATE … RETURNING` inside the caller's
existing transaction — which takes a row lock, so concurrent callers
serialise. `shared/docNumber.js` already formats the number and knows the
financial year; it is only missing the allocator. One new function,
`nextDocNumber(client, {ownerId, docType, profile})`, and nine call sites
changed to use it.

Seeded from `MAX(existing number)` per type, not from `COUNT(*)`, so
numbers already issued are never reissued.

**Risk.** Medium. Touches every create path. Mitigated by doing it in one
migration plus one helper, with each controller changed mechanically.

**Verification.** A test that creates 20 documents concurrently
(`Promise.all`) and asserts 20 distinct numbers; then deletes 5, creates 5
more, and asserts no number was reused.

**Estimate.** Half a day, most of it verification.

---

### 2. Inventory is still wrong on screen — and I cannot apply the fix

**Evidence.**

```
inventory rows: 102    distinct item names: 27
6 rows  qty 13848  Cam Lock Fitting 15mm [IKEA]
6 rows  qty 34154  Dowel Pin 8x30mm [IKEA]
8 rows  left by tests, four at quantity -40
```

`ITEMS HELD 102` should read 27. `NEEDS ORDERING 4` is counting my own
`UITEST-` rows at negative stock.

Six rows for one item is not only cosmetic: a reorder level set on one of
the six is compared against a sixth of the stock, so the low-stock warning
fires on an item there is plenty of. That is why the reorder feature cannot
currently be made to mean anything.

**Fix.** `backend/scripts/clean-inventory.js --apply`. Already written,
already dry-run clean. It is transactional and repoints
`stock_movements`, `production_consumption` and `production_output` at the
surviving row *before* deleting, so no ledger entry is orphaned.

**Blocked on you.** The `--apply` run was refused by the permission
classifier because it deletes rows. It needs your explicit go-ahead.

**Also fix the cause**, or it comes back: `seed-org.js` inserts a new
inventory row per run instead of adding to the balance. It should go
through `POST /inventory` / `stock.move` like everything else.

**Verification.** Re-run the dry run afterwards — it should report 0
duplicates, 0 negative rows, 0 orphaned movements.

**Estimate.** Ten minutes once approved. Half an hour for the seed fix.

---

### 3. `company_profile` has no `state` column, and no bank account number

**Evidence.**

```
columns that exist: bank_ifsc, bank_name, doc_prefix, pan
stored bank_name = null
stored bank_ifsc = null
state → the column does not exist at all
```

The readiness banner is telling the truth: invoices print
`Not configured` where the payment details belong. A customer cannot pay an
invoice that does not say where to send money.

**Correction to what I told you earlier.** I said the missing `state` broke
GST. It does not. `deriveInterstate` compares GSTIN prefixes on both sides
(`33` vs `36`), which is the correct rule — the state *code* is the first
two digits of the GSTIN. The product logic is right; my test's label was
misleading.

**Fix.** Migration 046 adding `state`, `bank_account_number`,
`bank_branch`; add all of them to the profile controller's column list —
`doc_prefix` was write-only for weeks because it was missing from exactly
that list, so the same check applies here. Then a round-trip test.

**Estimate.** Two hours including the test.

---

## P1 — features that stop at a list

### 4. You cannot raise an invoice from the Invoices screen

**Evidence.** `/sales-invoices` has these controls and nothing else:
`Draft | Sent | Part paid | Paid | Previous | Next`.

Invoices are raised from an order, which is a sound model — but there is no
entry point at all here, so a person who lands on this screen has no route
forward.

**Fix.** A "Raise invoice" button opening a picker of orders that are
delivered or part-delivered and not yet fully invoiced, then the existing
create-from-order path. No new backend.

**Estimate.** Half a day.

### 5. You cannot create a milestone from the Milestones screen

**Evidence.** `/milestones` shows only `Pending | In progress | Delayed |
Completed`.

**Fix.** Same shape as above — a create form against `POST /milestones`,
scoped to the selected project, with the "pick a project first" message the
other four project-scoped screens now use.

**Estimate.** Half a day.

---

## P2 — the product is still two products

### 6. `/bills` is in the menu twice, under two different names

**Evidence.** `navigation.js`:

```
line  99   { label: 'Vendor bills', path: '/bills', … }   ← Purchases
line 143   { label: 'RA bills',     path: '/bills', … }   ← Projects
```

Both land on the same screen, whose heading is **"RA Bills Engine"** with a
`Compute Draft Bill` button. So "Vendor bills" in the Purchases menu opens a
running-account billing engine — a civil-contracting concept — and neither
label matches the page.

**Fix.** Decide which one it is. My recommendation: the screen *is* an RA
bills engine, so keep it under Projects with that name, and point
Purchases → "Vendor bills" at the actual vendor bill list (`/payables`
already covers ageing; the bill list needs its own route). Then the two
menu entries stop lying about where they go.

**Estimate.** Half a day, plus a decision from you.

### 7. The contractor lineage: BOQ, Measurement Book, Indents, RA bills

**Evidence.** Indents carry a `chainage` field (`CH 12+500` — distance along
a road). BOQ, MB and RA bills are the same lineage. The ORR map came out
for the same reason.

These are perfectly good features for a civil contractor and meaningless for
a furniture manufacturer. Right now every organisation sees all of them.

**Fix.** Not deletion — a **module switch in the Configurator**. An
organisation turns on "Contracting" and gets BOQ / MB / Indents / RA bills;
leaves it off and the rail is shorter and the product reads as built for
them. The nav already filters by `resource`, so this is a filter on the same
list, plus one settings tile.

**Risk.** Low technically. It is mostly a product decision.

**Estimate.** One day.

---

## P3 — things that are wrong but not urgent

### 8. The dashboard takes 8.2 seconds

Measured, repeatedly. The zeros are no longer shown while it loads, but
eight seconds to first number is still poor. The dashboard already had its
fan-out consolidated once; this is the remaining serial work. Worth
profiling before changing anything.

### 9. GST edge cases worth closing before a real customer hits them

- **Place of supply follows the ship-to address, not the GSTIN.** A customer
  registered in Telangana but shipping to Karnataka should be taxed on
  Karnataka. Today `deriveInterstate` reads only the customer's GSTIN.
- **A customer with no GSTIN is treated as intra-state.** `partyState` is
  empty, so the function returns false and charges CGST+SGST. For an
  unregistered buyer in another state that is the wrong tax. All 38
  customers on this database have a GSTIN, so it is not biting yet.

### 10. Leftover data

- Vendor **id 39 has no name** and two purchase orders against it, so it
  cannot be deleted. It needs a name — it currently renders as
  *"Unnamed vendor #39"*.
- `STOCKTEST-MTNBQ5JM` (id 5367) left by the stock test. There is no
  `DELETE /inventory/:id`, deliberately — a stock row with ledger history
  should not vanish. `clean-inventory.js` removes it.

### 11. The readiness warnings are real work, not bugs

`94 of 104 stock rows not linked to a material or product` and `49 of 197
products with a bill of materials` are data-entry gaps. Unlinked stock is
invisible to the deficiency engine, so "available" reads as zero however
much is held. I am not mass-linking these by guessing — the "Fix this"
buttons are the right route, and the linking wants a human who knows which
material is which.

---

## Suggested order for today

1. **Say yes to `clean-inventory.js --apply`** — ten minutes, fixes the
   screen you screenshotted. (#2)
2. **Document numbering** — the only item that silently produces wrong
   legal documents. (#1)
3. **Company profile columns** — unblocks the readiness banner and makes
   invoices payable. (#3)
4. **Raise invoice + create milestone** — the two dead-end screens. (#4, #5)
5. **`/bills` naming** — needs your decision first. (#6)

Items 7–11 are a second pass.

## What I need from you

- **Approval to run `clean-inventory.js --apply`** (deletes 8 test rows,
  merges 75 duplicate rows into 15 items).
- **A decision on `/bills`**: is the Purchases entry meant to be a plain
  vendor bill list, or is the RA engine the only bill screen?
- **A name for vendor 39**, or permission to reassign its two POs to a
  correctly-named vendor so it can be deleted.
- **Whether the contracting module switch (#7) is wanted**, or whether BOQ /
  MB / Indents should simply be removed.
