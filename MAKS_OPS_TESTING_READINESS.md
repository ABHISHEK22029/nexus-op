# Maks Ops — testing readiness

State as of the D/E/F/G work. Everything below is verified against the live
Supabase database and the deployed Render backend, not assumed.

---

## Do these before you start testing

### 1. Company bank details are not set — blocks invoice testing

`company_profile` has name, GSTIN, PAN, address and state code, but **no bank
name, account number or IFSC**. Every invoice, quotation and payment
document currently prints "Not configured" where the payment details belong.

A customer cannot pay an invoice that does not say where to send money, so
this blocks any realistic billing test.

**Fix:** Company Profile → fill Bank name, Account name, Account number,
IFSC, Branch, UPI. Add the Udyam/MSME number too if Kirashi has one — it
entitles you to the MSMED Act 45-day payment rule, and printing it on the
invoice is what lets you rely on it.

### 2. Rotate the exposed secrets

The GitHub repo `ABHISHEK22029/nexus-op` is **public**, and these are in
tracked files and in git history:

| Secret | Where | Status |
|---|---|---|
| `admin123` — working production admin password | `KIRASHI_ADMIN_TEST_SCRIPT.md`, `Login.jsx` | **live, needs rotating** |
| MetalpriceAPI key | `PRICE_UPDATE_AND_CACHING_PLAN.md` | **live, needs rotating** |

Deleting them from the working tree is not enough — they remain in history
on a public repo. Rotate the actual credentials.

The four test accounts I created (`rbac-*@test.local`, `tenantb@test.local`)
had their password published by me in a committed script. They are now
**deactivated and confirmed refused at the production login endpoint**. To
use them again for RBAC testing, reactivate locally and set a fresh
password — never point the test script at production; it now refuses.

---

## What is enforced now

### Roles

Seven roles, replacing three vocabularies that never agreed (the database
held `Admin`/`User`, the backend checked `Admin`/`Manager`/`Viewer`, the UI
offered `Admin`/`Engineer`/`Finance`/`Vendor` — so `requireRole('Admin','Manager')`
could never match anyone).

| Role | Covers |
|---|---|
| **Administrator** | Everything, across every workspace. User accounts. The platform role. |
| **Owner** | Full access to their own workspace. Cannot manage platform users or see other workspaces. |
| **Sales** | Customers, quotations, orders, invoices, challans. Reads stock and production. |
| **Procurement** | Vendors, POs, indents, GRN, materials, inventory. **Cannot approve its own POs.** |
| **Production** | Work orders, production, projects, BOQ, measurement book. Reads material availability. |
| **Finance** | Invoices, bills, payments, credit notes. **Approves POs.** |
| **Viewer** | Reads everything, changes nothing. |

Existing accounts were **not** downgraded. Legacy `User` maps to `Owner`, not
`Viewer` — since only 10 of 129 routes were ever guarded, those accounts
could already do everything in their own workspace, and mapping them to
read-only would have been a silent breaking change dressed as a security fix.

**Separation of duty:** Procurement raises POs, Finance approves them. Same
person raising and approving is not a control.

Deny by default — a route whose resource isn't granted is refused, so a new
endpoint added without thought fails closed.

### What to try when testing roles

- Sign in as Procurement → the nav has no Sales Invoices, and `PATCH /po/:id/approval` returns 403.
- Sign in as Viewer → everything is visible, every save is refused.
- Sign in as Sales → Purchase Orders is absent from the nav; hitting `/po` directly shows a "not part of your role" page rather than an empty table.

Switching roles means signing in as someone with that role. The old
"View as:" dropdown is gone — it changed a local variable and nothing the
server ever saw.

---

## Compliance signals now surfaced

These fired on your real data immediately, which is the point:

| Signal | Where | Live finding |
|---|---|---|
| E-way bill missing above ₹50,000 | Delivery Challans | **DC-0001, ₹1,92,500, no e-way bill.** Rule 138 — the truck gets stopped. |
| Credit/debit note missing invoice reference | Credit/Debit Notes | **DN-0001 has no ref_date.** Section 34 requires number *and* date. |
| Quotation expired | Sales Quotations | none currently |

---

## Bugs fixed that would have corrupted a test

| Bug | Consequence if untested |
|---|---|
| `owner_id = ${params.length}` missing its `$` | Rendered `owner_id = 1` — **valid SQL** — so every non-admin listing invoices, quotations, challans or notes saw *another tenant's* rows. No error, no crash. |
| 5 `getById` handlers with no owner check | Any logged-in user could read any company's invoice by guessing a sequential id. |
| Delivery challan printed the **billing** address as "Deliver To" | Truck sent to the customer's registered office instead of the site. |
| RA bill labelled "BILL TO — CONTRACTOR" | Payment direction inverted. TDS 194C is withheld by the payer, and that's us. |
| `<Link2/>` and `<Layers/>` used without import in Sidebar | **ReferenceError crashing the entire navigation, on every page.** Built green the whole time. |
| 7 files reading `localStorage.getItem('token')` | Wrong key (`nexus_token`). Every explicit auth header was an empty object; worked only via a global fetch patch. |

---

## Guards added so these don't recur

Run these before any push:

```bash
cd backend  && node scripts/check-placeholders.js      # SQL placeholders missing their $
cd backend  && node scripts/check-route-coverage.js    # orphan routes, lost access
cd frontend && node scripts/check-jsx-undefined.cjs    # JSX used without import
cd frontend && npm run build
```

Each was written after a real bug in this codebase and verified by
reintroducing that bug and confirming it gets caught. `npm run build`
catches none of them — Vite compiles `<Foo/>` without caring whether `Foo`
resolves, and `owner_id = 1` is valid SQL.

The RBAC end-to-end test needs env vars and refuses to run against a
deployed host:

```bash
RBAC_ADMIN_EMAIL=… RBAC_ADMIN_PASSWORD=… RBAC_TEST_PASSWORD=… \
  bash backend/scripts/test-rbac-live.sh
```

---

## Still open

- **Search/filter rollout** — done for the 4 sales lists. Still bespoke and
  unpaginated: Purchase Orders, GRN, Bills, Payables, Customer Orders,
  Production, Work Orders, Projects, Quotations, Indent, Users.
- **`<RoleRoute>` is built but not yet applied to routes.** The nav hides
  what you can't use and the server refuses it, so direct-URL navigation
  currently shows an empty page rather than an explanation.
- **PO picker** still renders the flat vendor list rather than vendors linked
  to the material.
- **Documents not yet rebuilt:** `POInvoice`, `GrnBillDoc`. (Sales invoice,
  quotation, challan, credit/debit note and RA bill are done.)
- **51 knowledge-base articles in the database still say "Nexus-OP".** The
  rename was cosmetic and did not touch database content.
- **`nexus-backend/`** — the stale Java folder still tracked, decision pending.
