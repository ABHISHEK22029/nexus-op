# Maks Ops — one product, any organisation, at real volume

*3 Sep 2026. Answering two questions: is this actually a product rather than
one company's install, and does the end-to-end workflow hold up with a real
amount of data in it.*

---

## 1 · It was not org-agnostic. Four ways.

Migration 041 had already removed one customer's identity from the
`company_profile` column defaults. Sweeping the rest of the code found it in
three more places, each invisible until a second organisation used the
product.

### Purchase orders were numbered after another company

```js
const poNumber = `Kirashi/FY2026-27/${seq}`;      // in TWO files
```

Every organisation using this product issued purchase orders carrying
another company's name — **on a document that goes to their vendors** —
stamped with a financial year that would never roll over. In April 2027 every
PO would still have said FY2026-27.

Now [`shared/docNumber.js`](backend/shared/docNumber.js): the prefix comes
from the organisation's own profile, and the year is computed against the
year-start it has configured.

```
{tradeName: 'Nordic Flatpack'}                  -> NF/FY2026-27/007
{name: 'Steelco Fabrication Private Limited'}   -> SF/FY2027-28/142
{doc_prefix: 'NFM'}                             -> NFM/FY2026-27/007
{}                                              -> PO/FY2026-27/007
```

Nothing invents a fallback company name. A business that has not said what it
is called gets an anonymous series; somebody else's trade name is never
borrowed. 31 Mar 2027 correctly reads FY2026-27 and 1 Apr 2027 reads
FY2027-28.

### `schema.sql` would have recreated the whole problem

The live database was fixed by migration 041, but the file a **fresh
deployment** is built from still carried every default: name, address, phone,
email, GSTIN, PAN, state code — plus `loadingScope DEFAULT 'Kirashi Scope'`.
The next install would have inherited all of it.

It also *seeded* a specific road-construction project ("ORR Package 1 (SW)"
for HMDA), six named civil contractors and their work orders, so every fresh
install came up as somebody else's business in an industry it might have
nothing to do with. Structure and sample data now live in separate files —
`schema.sql` and `seed_sample.sql`.

### Printed documents fell back to a name

`{co.name || 'Kirashi Business Synergies'}` on the GRN bill, `Kirashi-PO-{id}`
on the PO. A business whose profile was briefly incomplete printed another
company's name on its own paperwork.

### The AI assistant named other customers

The system prompt said "clients include Hi-MAK and Kirashi", and told every
organisation who else uses the product — in a prompt one jailbreak away from
being read aloud. The knowledge base shipped twelve references to a named
customer's rollout; the lesson is worth keeping, the customer's name is not
ours to publish.

**[`check-org-agnostic.js`](backend/scripts/check-org-agnostic.js)** now fails
the build on a customer name appearing as a *value* in shipped code. Comments
are exempt — the fixes above are explained in comments that name the company,
and a checker that cannot tell an explanation from a value gets deleted.
Verified by reintroducing the hardcoded PO number and watching it fail.

---

## 2 · A whole organisation's data, loaded and driven

[`seed-org.js`](backend/scripts/seed-org.js) builds the full operating spine
for a named organisation — **parameterised, because the product is not one
company's**. `--org=ikea` produces a flat-pack furniture manufacturer, which
is deliberately a different shape from steel fabrication: different units,
different BOM depth, different vendors.

At `--scale=6`:

```
customers 36 · vendors 48 · materials 90 · products 48 · BOM lines 294
vendor price list 170 · stock 90 · orders 144 (315 lines) · production 182
challans 47 · invoices 42        order book ₹53,13,57,742
```

**The product's own configurability showed up immediately.** `raw_materials.
base_uom` is a foreign key into a `uom` master that ships with what a metal
fabricator needs — kg, mt, m, sqm. A board mill buys by the **sheet**, which
was not in it, and the seed failed on the constraint. That is the product
working correctly: units are configurable master data, so the organisation
registers what it trades in. Two new units, and it proceeded.

### The chain, on a different business

The full order chain through the real forms — **39 of 39** — on Nordic
Flatpack rather than the steel fabricator:

- tax came out **CGST+SGST** (intra-state, Tamil Nadu) where the same test on
  the previous organisation produced **IGST**
- place of supply followed the organisation, not a constant
- the requirements engine exploded a **furniture** BOM: 116 sheets of
  particle board = (100 ordered − 60 produced) × 2.9 per unit

Same code, different business, correct answers.

---

## 3 · What the volume exposed: it was never the queries

The first measurement was alarming — `/production` at **4.9s median, 7.9s
worst**; material requirements 4.0s; every list endpoint ~880ms.

The obvious diagnosis was slow SQL. It was wrong. Measuring the queries
directly showed each one taking ~450ms and the *first* one taking 3,983ms.
That is not a query cost, it is a **connection** cost.

### The pool threw connections away every ten seconds

`idleTimeoutMillis` was left at its default of 10 seconds, while opening a
connection to the hosted database costs ~3.5s. **51 physical connections were
opened during a single short test run.** For this product's actual usage —
someone opens a screen, reads it, thinks, clicks again a minute later — the
pool was always cold. Every action paid the reconnect.

Five minutes idle, `keepAlive` on, and a connect timeout so a failure fails
fast: `/production` went **4.9s → 1.77s** and stayed stable, on 3 connections
instead of 51.

### Then the home screen was the only thing that broke

With connections held rather than churned, a different failure appeared:

```
(EMAXCONNSESSION) max clients reached in session mode
                  max clients are limited to pool_size: 15
```

Supabase's pooler runs in **session mode with 15 clients for the whole
project**. `/dashboard` fanned **twelve queries out with `Promise.all`**, each
taking its own connection, and `/setup/readiness` did the same with twelve
more. They were the *only two endpoints that failed* — every ordinary list
page kept working, because each needs one connection.

The home screen being the first thing to break under connection pressure is
the worst possible order.

Both are now one query each — they were all scalars over the same scope, so
twelve round trips became one — and the dashboard runs its remaining queries
**sequentially on a single client**. Concurrency bought nothing anyway: warm,
these queries are 50–150ms, and running five in sequence beats opening four
more connections at 3.5s each.

A dashboard load now uses **one** connection.

### The result

| endpoint | before | after |
|---|---|---|
| production | 4,871ms | **134ms** |
| material requirements | 4,044ms | **234ms** |
| dashboard | 880ms *(then 500s)* | **147ms** |
| setup readiness | 874ms | **33ms** |
| customer orders | 1,311ms | **99ms** |
| vendor supplies | 1,328ms | **104ms** |
| customers | 871ms | **66ms** |

Every endpoint under 250ms. Seeding the same dataset went from **391s to 27s**
as a side effect.

The N+1 in `/production` was real and is fixed — `computeYield` ran three
queries per order, so a 25-row page issued 75 and `/production/summary` issued
549. It was simply invisible while connection churn dominated.

---

## 4 · Things my own tools got wrong

**The seeder wrote stock balances without ledger entries.** The stock-loop
suite went 10/10 → 6/10, reporting drift on 90 items. That was the product
doing its job: a balance with no movement explaining it is exactly what a
ledger exists to catch. Opening stock is not an exception — it is a movement,
which is how a real import of opening balances has to work too. Fixed, back
to 10/10.

**The seeder overwrote its own backup.** It saves the previous company profile
before replacing it. The second run saved the profile it had itself just
written, throwing away the only copy of the real business's identity — the
backup existed to protect against exactly that and destroyed it instead. It
now refuses to overwrite an existing backup.

**`doc_prefix` was write-only.** The column, the migration and the formatter
all existed, but I never added it to the PUT's allowed columns, so no business
could actually set the prefix that goes on its own purchase orders. Caught by
the first-run test noticing a field that went in and did not come back.

---

## Verified

```
39/39  order chain (quotation → invoice) on Nordic Flatpack
33/33  screens load clean, no JS errors, 4 connections
27/27  lists show what they fetched, or say why they are empty
 9/9   first run: new install → welcome → answer → in, asked once
18/18  RBAC          22/22  configurator
10/10  stock ledger   5/5   shortfall → PO
 9     static checkers, including the new org-agnostic one
```

---

## Still open

**`company_profile` is one global row with no owner column.** Two
organisations cannot share a deployment — they would share a name and a GSTIN.
The business tables are all owner-scoped, so the data would separate correctly;
the identity would not. One deployment per business works today. Genuine
multi-tenancy needs an `organisations` table and an `org_id` on that row,
which is a schema change, not a patch.

**Money is stored as `real` in places.** `customer_order_items.target_price` is
`real` while `rate` on the same row is `numeric` — different types for the same
number, which is what made one parameter unable to serve both. `real` is binary
floating point and does not belong on a money column.

**Document numbers still come from `COUNT(*)`.** Two documents created in the
same moment can take the same number. It wants a sequence per series.

**The marketing page carries a fabricated testimonial** attributed by name and
job title to a real company. Not touched — it is copy, not code — but it should
not ship as-is.
