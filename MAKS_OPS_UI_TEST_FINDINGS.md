# Maks Ops — first browser test of the UI

*27 Aug 2026. Everything before this was tested through the API. This is the
first time the application was loaded in a browser and looked at.*

---

## Why this run happened

Asked directly whether I had tested the platform, the honest answer was no —
not the UI. The API had been exercised hard (RBAC 18/18, configurator 22/22,
stock loop 10/10, shortfall→PO 5/5, IDOR probes across 11 write paths, load
tests at 8,000 materials). None of that renders a page.

`npm run build` proves the code compiles. The JSX and hook checkers are static
greps. The gap between those and a working screen is exactly where the
`<Link2/>` crash lived: a `ReferenceError` that killed navigation on every
page, survived a green build, and was found by grepping rather than by looking.

Puppeteer was already installed. There were no tests of any kind.

---

## What was built

| Script | What it does |
|---|---|
| [`frontend/scripts/smoke-ui.cjs`](frontend/scripts/smoke-ui.cjs) | Signs in, visits all 33 screens, fails on any uncaught exception, real console error, failed request, or blank render. Then drives the nav rail and the search box. |
| [`frontend/scripts/audit-ui-data.cjs`](frontend/scripts/audit-ui-data.cjs) | Watches the list request each screen makes, replays that exact URL, and compares what was served against what rendered. |
| [`frontend/scripts/probe-page.cjs`](frontend/scripts/probe-page.cjs) | Dumps one page's visible text and every API call it made. The diagnostic tool for everything below. |
| [`backend/scripts/check-resource-catalogue.js`](backend/scripts/check-resource-catalogue.js) | Diffs the nav's resources against the permission catalogue. New; written because of finding 3. |

All are wired into `npm run check` (static) and `npm run test:ui` (browser).
Before this they only ran when I remembered to run them.

---

## Findings

### 1 · The setup banner was on the one screen nobody sees — **fixed**

`SetupReadiness` explains why the deficiency engine is empty. It was rendered
only inside the `if (!activeProject)` branch of the dashboard — the "select a
project" placeholder. Anyone who had selected a project, which is everyone
after their first minute, never saw it.

The component's own comment reads *"First thing on the first screen"*. It was
on the screen nobody reaches.

**Fix:** [`Dashboard.jsx`](frontend/src/pages/Dashboard.jsx) — moved into the
main return. Verified visible: *"5 things are missing before the system can
tell you what to buy and build."*

---

### 2 · The dashboard reported 0 vendors while the vendors page listed 22 — **fixed**

`GET /dashboard` counted `vendors WHERE "projectId" = $1` and
`inventory WHERE "projectId" = $1`. Vendors sat on projects 1, 11, 2, 13 and
16; the selected project had none of them. Stock was worse — migration 034
made `inventory."projectId"` nullable precisely because stock became
company-level once the ledger existed, so ledger rows never counted at all.

Both are master data. The Vendors page and the Stock page are owner-scoped;
the dashboard was asking a different question and getting a technically
correct, useless answer.

**Fix:** [`index.js:1218`](backend/index.js#L1218) — those two counts scope by
owner via `andOwner()`. POs, bills, indents, activities, milestones and BOQ
stay project-scoped, because those genuinely belong to a project.

Verified: admin 22 vendors / 4 stock rows (matching the pages); a second
non-admin tenant on their own project sees 0, not 22; still 403 on someone
else's project.

**Not a security bug.** I suspected an IDOR here — no owner check anywhere in
the handler — and tested it with a real non-admin tenant. A global
`scopeProjectAccess` middleware ([`index.js:84`](backend/index.js#L84)) covers
every project-scoped endpoint. It was already correct.

---

### 3 · Two screens no role could open, Administrator included — **fixed**

`/expenses` and `/grn` had routes, controllers and data — 177 expense rows,
4 goods receipts. What they lacked was an entry in the `RESOURCES` catalogue
in `shared/roles.js`.

`permissionsFor()` builds the permission map by walking that object, and
`RoleRoute` gates on the map. A resource missing from it is missing from every
role. The Administrator was shown, in as many words:

> *You're signed in as **Administrator**, which doesn't cover viewing expenses.*

Server-side `can()` was never wrong — it short-circuits Administrator. This
was a lockout, never a leak. Both screens were also absent from the nav panel.

**Fix:** catalogued both, put `grn` in the procurement group (whose own
description says "goods receipt") and `expenses` in finance;
[migration 038](backend/migrations/038_catalogue_grn_and_expenses.sql) grants
them to existing roles. `seedRolePermissions()` deliberately skips roles that
already have rows so it never overwrites an administrator's configuration —
which also means it cannot backfill a new resource, hence the migration.
`ON CONFLICT DO NOTHING` throughout.

Verified: Expenses renders 25 rows; "Goods received" is back in the Purchases
panel.

**Nothing else could have caught this.** The build compiles. Route coverage
passes — the route exists. The browser smoke test passes — the denial page
renders beautifully. So
[`check-resource-catalogue.js`](backend/scripts/check-resource-catalogue.js)
now diffs the two lists, verified by deleting `expenses` from the catalogue
and watching it fail.

---

### 4 · The chosen project was never remembered — **fixed**

`ProjectContext` did `setActiveProject(data[data.length - 1])` and persisted
nothing. Nearly every screen here is project-scoped, so choosing a project,
reloading, and landing in a different one meant looking at another company's
work with no indication anything had changed.

**Fix:**
[`ProjectContext.jsx`](frontend/src/context/ProjectContext.jsx) — the choice
is stored and restored, falling back to the previous default when the stored
project is not in the list (another account, or since deleted).

---

### 5 · "Everything is covered" when there was nothing to cover — **fixed**

Material Requirements chose its empty state from the `shortOnly` checkbox, so
a workspace with no open orders was told:

> *Every material for the open orders is covered by stock or already on order.*

There were no open orders and one BOM. The engine had had no input at all.
That is the precise misreading `SetupReadiness` exists to prevent.

**Fix:** the API now returns `summary.materials_total` (unfiltered), and the
page distinguishes three states: nothing to calculate, nothing short, and
nothing matching the filter.

---

## Result

**33 of 33 screens** load with no JavaScript error, no failed request and no
blank render.

**27 of 27 list screens** show what they fetched, or say why they are empty —
verified by replaying each page's own request URL:

```
Customers 2/2 · Quotations 1/1 · Customer orders 1/1 · Delivery challans 1/1
Sales invoices 2/2 · Credit/debit notes 1/1 · Vendors 22/22 · Vendor quotes 1/1
Purchase orders 4/4 · Goods received 1/1 · Vendor bills 4/4 · Stock 1/1
Items 4/4 · Materials 25/145 · Work orders 4/4 · Milestones 6/6 · BOQ 4/4
Measurement book 5/5 · Expenses 25/177 · Team 9/9 · Activity 28/28
Vendor supplies, Indents, Payables, Material requirements, Production — empty, explained
```

All seven static checkers and the production build pass.

---

## Two things I got wrong in this run, worth recording

**My harness produced three false alarms before the code produced one real
bug.** The banner check ran after a click that had already navigated to
another page. The row counter only looked at `<tbody><tr>`, so four screens
using card layouts reported as blank. The list-URL capture took the first
non-boilerplate GET, which on two screens is a dropdown feed — comparing an
empty supplies table against 22 vendors. Each was reported as a product defect
until I checked. A report with standing false positives is a report people
learn to skip, so all three are fixed rather than annotated.

**I "verified" the guard checker against a bug it never saw.** Extending
`check-guard-imports.js` to cover `index.js`, I tested it by removing the
import with `split(";\n")` — against a CRLF file, where the text is `;\r\n`.
Nothing was removed and the test passed without testing anything. Redone
CRLF-safely, the checker did catch it. A test that cannot fail is worth less
than no test, because it is believed.

---

## What this does not cover

Read-only, single-user, one browser. It proves screens load and lists agree
with their API. It does not cover creating or editing records through a form,
validation messages, print/PDF output, multi-user concurrency, or any browser
but Chromium.

The next honest step is driving one full chain through the forms —
quotation → order → production → dispatch → invoice — and asserting the
numbers at each hop, rather than asserting them through curl as I have been.
