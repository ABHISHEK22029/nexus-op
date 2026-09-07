# What remains before the whole flow is sound

Written 2026-09-07, current as of `3f1c47e`.

Supersedes `MAKS_OPS_OPEN_GAPS_PLAN.md` and the completed parts of
`MAKS_OPS_RECEIPT_FLOW_PLAN.md`. Every claim is from the live database or
the source, quoted, with file and line.

---

## Where things genuinely stand

**Verified by driving the real forms and asserting the numbers at each hop:**

| Flow | Assertions |
|---|---|
| Sign-up → organisation → own empty platform | 13/13 |
| Stock: opening, receipt, part-loads, stock take, reconcile | 34/34 |
| Quotations at volume — GST, discount, conversion, edges | 23/23 |
| Stock add / count through the UI | 16/16 |
| Every screen renders without error | 33/33 |
| Cross-flow integrity audit | 0 broken |

**The honest caveat.** That list is four areas. Eight flows have no test
touching them at all:

```
delivery challans · credit/debit notes · payables · material requirements
vendor bills · expenses · milestones · BOQ
```

Every time a new flow has been opened it has contained real faults —
inventory four, goods receipt five, quotations one, sign-up two tenancy
leaks. The falling bug count reflects a shrinking tested surface, not a
converged product. Expect the eight above to behave the same way.

---

## P0 — document numbering. This is producing wrong paperwork now.

### The evidence

```
PO    9  Kirashi/FY2026-27/001   owner 1
PO   20  Kirashi/FY2026-27/001   owner 1     ← same number
PO   32  Kirashi/FY2026-27/001   owner 5     ← same number, different company
PO   34  Kirashi/FY2026-27/001   owner 1     ← same number
PO  1–6  (no number at all)
```

**Four purchase orders share one number.** This is not a risk to be
mitigated; it has already happened four times. Six more POs have no number.
And every number reads *Kirashi* for a company called Nordic Flatpack.

### Why

Ten call sites build a document number from `COUNT(*) + 1`:

| File | Line | Document |
|---|---|---|
| `SalesQuotationController.js` | 107 | quotation |
| `SalesQuotationController.js` | 169 | customer order (on convert) |
| `SalesController.js` | 80 | customer order |
| `SalesController.js` | 303 | purchase order |
| `ShortfallToPoController.js` | 84 | purchase order |
| `SalesInvoiceController.js` | 137 | sales invoice |
| `RecurringController.js` | 137 | sales invoice (recurring) |
| `DeliveryChallanController.js` | 87 | delivery challan |
| `GrnBillController.js` | 83 | GRN bill |
| `CreditDebitNoteController.js` | 110 | credit / debit note |

Three separate failures come out of that one pattern:

1. **Delete anything and the next document reuses its number.** My own
   quotation test raised 40 and deleted 40.
2. **Two users creating at once get the same number** — both `COUNT(*)`
   reads complete before either insert commits.
3. **The count is not per-organisation.** `SalesController.js:303` counts
   every purchase order on the install, so two companies share a series.

Plus a fourth, in the same area:

4. **The prefix is not per-organisation either.** `SalesController.js:307`
   calls `docNumber({ profile: await loadProfile(db), … })` — `loadProfile`
   takes no owner and reads `company_profile LIMIT 1`, so owner 5's purchase
   orders carry owner 1's prefix. This is the same class of bug that
   `shared/companyProfile.js` was written to close; that seam exists and
   this call site was missed.

On a tax invoice a duplicate number is a GSTR-1 filing error and a breach of
Rule 46. **Nothing else on this list matters as much.**

### The fix

- **Migration 050** — `document_sequences (owner_id, doc_type, fy, last_seq)`,
  seeded from `MAX(existing number)` per type per owner, never from
  `COUNT(*)`, so numbers already issued are never reissued.
- **`shared/docNumber.js`** gains `nextDocNumber(client, {ownerId, docType,
  profile})` — allocated with `UPDATE … RETURNING` inside the caller's
  existing transaction, which takes a row lock, so concurrent callers
  serialise. The formatting and financial-year logic are already there; only
  the allocator is missing.
- **`loadProfile(db)` → `profileFor(db, ownerId)`** at every call site.
- **Backfill** the six unnumbered POs and resolve the four sharing one
  number. *Reissuing a number on a document already sent to a vendor is a
  decision, not a migration — see the questions at the end.*
- **Unique index** per `(owner_id, doc_type, number)` so this cannot recur
  silently.
- **Test**: create 20 documents with `Promise.all`, assert 20 distinct
  numbers; delete 5, create 5, assert nothing was reused.

Estimated half a day, most of it verification.

---

## P1 — things that stop the product being usable for real work

### 1. Invoices cannot be paid

```
company_profile:  bank_name=null   bank_account_no=null   bank_ifsc=null
```

Invoices print **"Not configured"** where the payment details belong. A
customer cannot pay an invoice that does not say where to send money. The
columns exist; nobody has filled them. **Data entry, not code** — but it
blocks the first real invoice.

### 2. There is no way to raise an invoice

`/sales-invoices` offers `Draft | Sent | Part paid | Paid | Previous | Next`
and nothing else. Invoices are raised from an order, which is sound, but the
screen has no entry point at all. Same for `/milestones` — four status
filters, no way to create one. Both are UI-only; the endpoints exist.

### 3. A multi-line purchase order receives only its first item

`routes/grn.js` reads `po.itemName` — the header. A purchase order for
plate, angle and fasteners receives one quantity of whatever the header says
and the other two never enter stock. Migration 048 added
`grn.po_line_item_id` for this; the receipt form needs to list the PO's
lines with ordered / received / outstanding and book against one.

Affects 1 purchase order in 11 on this database, which is why it is P1 and
not P0.

### 4. Vendor 39 has no name

Belongs to `owner_id 5` (`abhisheklancer987@`), with two real purchase
orders against it. Migration 049 stops more being created. **Only you can
name this one** — inventing a supplier is fabricating a business record.

---

## P2 — the eight untested flows

Work through each the way inventory was done: drive the real forms, assert
the numbers at every hop, then fix what falls out.

| Flow | What to assert |
|---|---|
| Delivery challans | stock leaves once, ledger matches, order status follows dispatched quantity |
| Vendor bills / RA bills | bill total against PO and GRN; no bill without a receipt |
| Payables | ageing buckets against invoice dates; MSMED 45-day clock |
| Credit / debit notes | reverses the right invoice, correct GST sign |
| Material requirements | demand from BOM × order; available from stock; shortfall is the difference |
| Expenses | posts once, correct owner |
| Milestones | create, complete, ordering |
| BOQ | quantities against the measurement book |

Expect faults. The pattern so far has been four to five per flow.

---

## P3 — worth doing, not urgent

- **`/bills` is in the navigation twice** — line 99 "Vendor bills" under
  Purchases, line 143 "RA bills" under Projects, same path, both landing on
  a screen titled "RA Bills Engine". Neither label matches the page.
- **The dashboard takes 8.2 seconds.** Measured repeatedly. Profile before
  changing anything.
- **The contractor lineage** — BOQ, Measurement Book, Indents (which carry a
  `chainage` field: distance along a road), RA bills. Fine for a civil
  contractor, meaningless for a furniture maker, and every organisation sees
  all of them. Suggested: a "Contracting" switch in the Configurator rather
  than deletion. The nav already filters by `resource`.
- **GST edges**: place of supply follows the ship-to address, not the
  customer's GSTIN; a customer with no GSTIN is currently treated as
  intra-state. All 38 customers here have one, so it is not biting yet.

---

## Security — still outstanding, and now larger

| What | Where | Status |
|---|---|---|
| `admin123` | `Login.jsx`, `KIRASHI_ADMIN_TEST_SCRIPT.md`, git history | **not rotated** |
| MetalpriceAPI key | `PRICE_UPDATE_AND_CACHING_PLAN.md`, public repo | **not rotated** |
| OpenRouter key | revealed in a screenshot in chat | **not rotated** |
| Supabase DB password | revealed in the same screenshot | **not rotated** |
| `JWT_SECRET` | set in Render — good | done |

The repository is public. Removing the files does not help; the values are
in history. These need rotating at source.

---

## Suggested order

1. **Document numbering (P0).** The only item producing legally wrong
   documents, and the collision is live.
2. **Bank details + raise-invoice button (P1.1, P1.2).** Together these are
   what stand between the product and a first real invoice.
3. **The eight untested flows (P2)**, one at a time, tests first.
4. **Multi-line receipt (P1.3)**, then P3.

Rotate the four secrets whenever convenient — it is independent of all of
the above and takes minutes.

---

## Questions only you can answer

1. **The four purchase orders sharing `Kirashi/FY2026-27/001`.** Have any
   been sent to a vendor? Renumbering a document someone already holds
   causes its own confusion, so the fix differs depending on the answer.
2. **The six purchase orders with no number.** Issue numbers now, or leave
   them as historic records?
3. **Vendor 39's name.**
4. **The contracting switch** — module toggle, or remove BOQ / MB / Indents
   outright?
