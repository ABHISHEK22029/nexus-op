# Billing / Quotation rework — findings and plan

> **STATUS 24 Sep — built, on branch `feat/billing-rework` (nothing committed, nothing pushed).**
> All eight items done except the 468/687 merge, which needs your answer.
> **93 checks pass** across seven suites: company logo (16 API + 10 browser),
> document editing (15 API + 9 browser), print layout (12), vendor quotations
> (22 API + 9 browser), plus the navigation suite. Every suite creates its own
> account and deletes everything it made.
>
> One migration to apply on deploy: `061_vendor_quotations.sql` (already run
> against the live database). New backend dependencies: `exceljs`, `pdf-parse`,
> `mammoth`. Removed from the frontend: `html2pdf.js` and its 982 kB chunk.
>
> **Bugs found in existing code while building:**
> · `.no-print` was used on 9 elements and **defined nowhere** — toolbars,
>   compliance warnings and the "quotation expired" banner have been printing
>   on documents all along.
> · Three document pages rasterised via `html2pdf`, one used bare
>   `window.print()`, and there was no `@page` rule anywhere in the product.
> · A global path-segment guard (`index.js:223`) runs *before* each route's own
>   `allow()` and infers the action from the HTTP verb — which would have
>   hidden the logo from Sales and Procurement, and made "remove logo" require
>   the `delete company-profile` permission.
> · `sales_invoice_items` has no `sku_id` column (only the quotation table does).
> · `pdf-parse` v2 exports a class, not a callable — the v1 call signature
>   silently reported every PDF as unreadable.
> · `runList` answers in two shapes (bare array, or `{items,total,summary}`),
>   which rendered a populated list as empty.


Investigated 23 Sep 2026 against the live codebase and (read-only) the live database.
Nothing has been changed yet. Decisions needed are marked **DECISION**.

---

## 1. The "data leakage" report — what I actually found

**I could not reproduce a tenancy bug in the code.** The scoping is sound:

- `check-unscoped-mutations`, `check-route-coverage`, `check-org-agnostic`,
  `check-guard-imports` — all pass.
- `SalesQuotationController.list` filters `owner_id = $1`; `getById` goes through
  `scopedById`; items and customer are then fetched off the already-verified parent row.
- Live data: **zero** `owner_id IS NULL` rows in `sales_quotations`, `sales_invoices`,
  `grn_bills`, `bills`, `customers`, `company_profile`.

Two things explain what your client saw, and neither is a missing `tenant_id`:

### 1a. The Administrator role is cross-tenant *by design*
`list` skips the owner filter when `isAdmin(req)`, and `scopedById` returns
`id = $1` with no owner clause for a cross-tenant role. **User 1 is `Admin`** and
owns 2 of the 3 quotations in the database. Signed in as that account, you see
every tenant's quotations — working as built, indistinguishable from a leak.

> **DECISION:** should Administrator keep cross-tenant read? Options: (a) keep, but
> label it clearly in the UI ("viewing all organisations"); (b) restrict to a
> platform-support account that clients never use; (c) drop it entirely.

### 1b. The letterhead is not being lost — it is in a different tenant
Live `company_profile` (4 rows, one per owner — no duplicates):

| owner | what is filled |
|---|---|
| 1 | name only |
| 29 | name only |
| **468** | **name + bank_name, bank_account_name, bank_account_no, bank_ifsc, bank_branch** |
| 687 | name only |

Quotations belong to owners **1** and **687**. The bank details are under **468**.
So the details were saved — into a different account from the one raising the
quotation. `profileFor` correctly returns *that* tenant's profile, which is nearly
empty, so the letterhead prints blank. Re-entering them under the same login would
not help, because each signup is its own tenant.

> **DECISION:** is 468 the same person as 687 (signed up twice), or a colleague?
> If the same person, we merge the tenants. If colleagues, they need to be *one*
> organisation — invite the second user into org 468 instead of a separate signup.

### 1c. A real latent leak — **FIXED 23 Sep**
`shared/companyProfile.js:35` — when `ownerId` is null, `profileFor` falls back to
`SELECT … FROM company_profile ORDER BY id LIMIT 1`: **the first profile in the
database**, i.e. another tenant's name, GSTIN and bank details.

Today `auth.js:46` sets `orgId: payload.org ?? payload.sub`, so a logged-in request
never passed null and the path was unreachable. But it was one careless caller
(a cron job, a webhook, a background PDF render) away from printing tenant A's bank
account on tenant B's invoice — and that caller is unattended by definition, so
nobody would be looking at the output.

**Done:** the fallback is removed. No owner, or no profile for that owner → `null`
(`profileOrEmpty` → `{}`). Callers already treat that as "not set up yet" and leave
the letterhead blank — a missing letterhead gets noticed, a wrong one does not.
Verified against live data: `profileFor(db, null)` now returns null where it
previously returned the first tenant's row; owners 468 and 687 each still get their
own profile, and an owner with no profile gets null rather than a borrowed one.

### 1d. ~~Token/org drift~~ — **I was wrong, there is no such risk**
I flagged that `orgId` comes from the JWT and could go stale. Checking the code:
`org_id` is written **only at creation** — `AuthController` sets `org_id = id` for a
new signup, and `AdminController` creates staff directly in the inviter's org (which
is how user 41 came to have `org_id` 39). Neither update allow-list contains
`org_id` (`PERSON_COLUMNS` is name/employee_code/job_title/department/phone/
reports_to/notes; the `PATCH /users` list has no `org_id` either). A user's
organisation cannot change after their account exists, so a token cannot go stale.
**No change needed.**

---

## 2. Share to PDF — root cause found

`SalesQuotationDoc.jsx` calls **`window.print()`** and that is all. Across the whole
frontend there is **no `@page` rule anywhere**, and only `RABillInvoice.jsx` has any
`@media print` CSS at all.

That is precisely why the export "covers the whole section of the page and the next
page gets broken down": with no `@page` size/margin, the browser uses its own
defaults and the app's screen layout (sidebars, shadows, fixed widths) goes onto
the sheet as-is; with no `break-inside`/`thead` rules, a table splits mid-row and
the header does not repeat.

**Plan — one shared print stylesheet, not per-page fixes:**
- `@page { size: A4; margin: 12mm 10mm; }`
- a `.doc-print` wrapper: fixed 190mm content width, everything else
  `display: none` in print (sidebar, top bar, buttons, toasts)
- `thead { display: table-header-group }` so the item table repeats its header on
  every page; `tr, .totals-block, .bank-block { break-inside: avoid }`
- totals/bank/signature as one non-breaking block so it never splits across sheets
- colour-exact backgrounds via `print-color-adjust: exact`
- one component (`<PrintableDoc>`) wrapping all seven document pages, so the fix
  lands once rather than seven times

> This is a layout fix in CSS. It does **not** need html2canvas/jsPDF — those
> rasterise and make text unselectable and blurry. Browser print-to-PDF with a
> correct stylesheet gives sharper output and real text.

---

## 3. Quotation / invoice format

The spec in `Kirashi Tax Invoice Template — Structu.md` is solid and I will build to
it. Two points from it that matter most:

- **Totals must SUM the item range.** The source template reads row 24 directly, so
  it silently breaks on a second line item.
- **Tax must follow place-of-supply.** The template labels an interstate invoice as
  CGST/SGST. Good news: `SalesQuotationController.deriveInterstate` and
  `SalesInvoiceController.resolveTax` already do this correctly off the ship-to
  state. The *rendering* must label it accordingly rather than hardcoding CGST/SGST.
- Amount-in-words is already generated (`amountInWords`), not typed.

> **DECISION — this is the one I need answered before building.** "Follow the layout
> of the file the user uploads" can mean two very different things:
> 1. **Match this one template** — build the output to look like `Tenplate.xlsx`. One
>    layout, done properly, matching the spec. (~2–3 days)
> 2. **Per-tenant uploadable templates** — a tenant uploads *their* Excel/Word
>    letterhead and the system maps fields into it and renders that. Much larger:
>    needs a template parser, a field-mapping UI, and a render engine per format.
>    (~2–3 weeks, and fragile with arbitrary files)
>
> I recommend **(1) now**, with the layout driven by a JSON layout definition rather
> than hardcoded markup — so a second template later is a config change, not a rewrite.

### Editing documents
There is currently **no PATCH route** for `sales-invoices` or `sales-quotations` —
only create / status / payment / delete. That is the missing "edit".

Proposal, with a compliance caveat: **allow full edit while `Draft`; once Sent or
Issued, lock the number and allow only non-statutory fields** (notes, terms, validity).
Under Rule 46 an issued invoice number must be unique and sequential per supplier —
silently editing issued numbers invites trouble at filing time. The series *prefix*
is already configurable (`company_profile.doc_prefix`), which is the safe knob.

---

## 4. Company Profile — direct image upload — **DONE 23 Sep**

Built on branch `feat/billing-rework`. `POST/GET/DELETE /company-profile/logo`
(+ `/status`), bytes in `attachments` — **no schema migration**. One logo per
organisation; uploading replaces rather than accumulates. PNG/JPEG/WebP/SVG,
2MB cap. `logo_url` still works as the fallback, so nobody loses a letterhead.
Frontend: `LogoUploader` on Company Profile, `CompanyLogo` in the letterhead
(both document renderers now go through it).

**16/16** API checks — including that org A gets byte-identical bytes back and
never org B's. **10/10** browser checks — the button exists, choosing a file
previews what the *server* stored, and the logo appears on a real quotation's
letterhead. Both tests delete everything they create.

Two permission traps found and handled, either of which would have shipped a
logo that worked for some roles and silently vanished for others:
- A **global path-segment guard** (`index.js:223`) gates by first URL segment
  and infers the action from the HTTP verb — it runs *before* the route's own
  `allow()`. `company-profile` read is held only by Administrator, Finance,
  Owner and Viewer, so **Sales and Procurement** — the people who raise the
  quotations the logo prints on — would have been refused it.
- `DELETE` maps to the `delete` action, and `delete company-profile` means
  "destroy this company's identity", which an Owner rightly does not hold.
  Removing a logo is now checked as `write`, like uploading one.

### Original finding

Today the only column is **`logo_url`** — a URL, exactly as reported.

The infrastructure to fix it already exists and is proven: `multer.memoryStorage()`
with a 10MB cap is wired up, and `catalogue_photos` already stores uploaded images
with owner scoping and an owner-scoped read endpoint. Plan: mirror that pattern —
`POST /company-profile/logo` (multer, `allow('company-profile','write')`), store
bytes + mime in a `company_logo` table keyed by `owner_id`, serve via an
owner-scoped `GET /company-profile/logo`, keep `logo_url` working as a fallback.

---

## 5. Vendor quotation upload + comparison

Nothing exists yet, and **no parsing libraries are installed** (`xlsx`, `pdf-parse`,
`mammoth` are all absent). The AI path does exist: `AiController` already talks to
OpenRouter with a configurable model.

Suggested shape:
1. `vendor_quotations` table (owner-scoped) + upload endpoint reusing multer.
2. **Parse deterministically first, AI second.** Excel via `exceljs`, PDF via
   `pdf-parse`, Word via `mammoth` → text/grid. Only when the deterministic pass
   can't find the columns do we send the extracted text to the model to map fields.
   That keeps token cost near zero on the common case and makes results repeatable.
3. Normalise to one shape: `{ vendor, currency, validity, lines:[{description, hsn,
   uom, qty, rate, amount, tax}] , totals }`.
4. **Every extracted figure is reviewable before it counts** — an extraction
   confidence and a side-by-side "file vs parsed" screen. An AI-misread rate that
   silently wins a comparison is worse than no feature.
5. Comparison view: line-matched across vendors (match on HSN/description
   similarity), showing per-line best price, total landed cost, and any lines a
   vendor did not quote — because the cheapest total is often just an incomplete quote.

---

## Suggested order

1. **1c + 1d** — close the profile fallback and the token/org drift (small, security).
2. **Decide 1a** — Administrator cross-tenant behaviour (this is what looked like a leak).
3. **4** — logo upload (small, self-contained, proven pattern).
4. **2** — print/PDF stylesheet (high visible impact, no data risk).
5. **3** — document layout to the spec + edit routes.
6. **5** — vendor upload and comparison (largest; build last, on the settled layout).

## Decisions taken (23 Sep)

- **1a — answered.** Only `Admin`/`Administrator` reads across organisations; every
  other role (Owner, Sales, User, Viewer, Procurement, Purchase Officer) is confined
  to its own. Because `assertOwned` is built on `scopedById`, that role can also
  **edit and delete** other organisations' rows, not just read them. Exactly one
  account has it: user 1. Plan: keep it as a platform-support role, make it
  unmistakable in the UI, and keep clients off it.
- **3 — decided: option 1.** Build one layout matching `Tenplate.xlsx`, driven by a
  JSON layout definition so a second template later is configuration, not a rewrite.
- **4 — decided: no AI.** Deterministic parsers only: `exceljs` (Excel),
  `pdf-parse` (PDF), `mammoth` (Word). If a file cannot be parsed confidently we say
  so and ask for a re-upload, rather than guessing. The AI path stays available but
  is not wired in.
- **5 — added:** an **eye icon on every uploaded quotation** to open the original
  file exactly as the vendor sent it, next to the parsed figures.

## Still needed

- **1b:** are owners 468 (`kbs@kirashi.co.in`, "Kirashi Business Synergies Private
  Limited", holds the bank details) and 687 (`phoenixgemini2@gmail.com`,
  "kirashi info") the same person with two signups, or two people? A merge moves
  live invoices between owners, cannot be undone, and both accounts have their own
  `document_sequences` — so a careless merge can give two documents the same number.
