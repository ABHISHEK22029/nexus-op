# What "project" means here — and why the UI felt unreliable

*2 Sep 2026. Answering: where does a project come in for Steelco selling to
Apollo, and is this one organisation or many?*

---

## Your instinct was right

This product has two lineages that were never reconciled.

**The contractor lineage.** Project · BOQ · Measurement Book · Milestones ·
Work Orders · RA Bills · Chainage. Here a *project* is the contract you won,
and everything genuinely hangs off it, because that is how construction
billing works: you measure executed work against a bill of quantities and
raise running-account bills against milestones. "ORR Package 1 (SW)" is a real
thing you can be paid for.

**The fabrication lineage.** Customers · quotations · sales orders · SKUs ·
BOMs · production · stock · delivery challans · GST invoices · vendors · POs ·
GRN · bills. Here the unit of work is the **customer order**. Steelco making
brackets for Apollo has a customer, an order, a product, a dispatch and an
invoice. There is no project anywhere in that sentence.

Forcing the second workflow through the first is where the trouble came from.

---

## Why it *felt* unreliable

It wasn't a styling problem. **Eighteen screens went blank when the wrong
project was selected**, and the dashboard refused outright without one:

```
GET /dashboard          → 400 {"error":"projectId required"}
POST /production        → 400 "projectId and productName are required"
POST /po (from quote)   → 400 "Select an active project (top bar)"
```

Nothing was broken. You were looking at an empty project and the product gave
you no way to tell the difference between "no data here" and "this feature
doesn't work". I made the same mistake myself while testing: an empty project
made every screen read as broken, and I started chasing bugs that weren't
there.

Worse, the selected project was **whichever one sorted last** and was never
remembered, so a reload could silently move you into a different slice of the
business with no indication anything had changed.

---

## What changed

**A project is now optional.** The default is **All work** — everything the
business has. A project became a lens you opt into, for the case where work
genuinely runs long: Steelco wins a fabrication package for a metro station,
many orders over months, milestones and retention. Then it earns its place.

- The scope selector **hides itself entirely** when a business has no
  projects. An empty dropdown labelled "Context" is worse than no dropdown.
- `GET /dashboard` with no project aggregates across everything you own;
  with one, it scopes to that project. Both are legitimate questions.
- Production orders and indents can exist without a project
  ([migration 039](backend/migrations/039_project_optional.sql)).
- The choice is remembered, including the choice of All work.
- Construction screens — BOQ, Measurement Book, Work Orders, RA Bills —
  still require a project, because for those it is the whole point. They say
  so instead of rendering blank.

Verified through the browser: All work shows 11 purchase orders, switching to
ORR Package 1 shows 4.

---

## "Is this one organisation, or many?"

**One.** `company_profile` is a single row with no owner column, so one
deployment is one business. Steelco is the organisation; Apollo is a customer;
every order, vendor and invoice belongs to Steelco. You do not create a
separate product per line of work.

The hierarchy that actually exists:

```
Steelco                     the organisation — one per deployment
├── Customers               Apollo, BuildRight, …
│   └── Orders              what you agreed to supply, and for how much
│       ├── Production      making it
│       ├── Challans        shipping it
│       └── Invoices        billing it
├── Vendors                 who you buy from
├── Items                   products you sell, materials you buy
└── Projects (optional)     a grouping, when work runs long enough to need one
```

**So "does a project mean the supply of one category of goods?"** No — and you
were right to be suspicious of that reading. What you sell is already stated
on the sales side: the SKU on the order line. A project would only be a
container for many orders over time, and most fabrication work does not need
one.

---

## What this uncovered

Chasing why the top bar still said "Kirashi" after a new business had entered
its own name turned up two things.

**`GET /company-profile` invented a company.** With no row it ran
`INSERT INTO company_profile (name) VALUES ('Kirashi Business Synergies
Private Limited')`. Every fresh deployment became Kirashi on its first page
load — and because the profile then had a name, the first-run screen would
never appear.

**Every identity column defaulted to Kirashi's real data.**

```
name       'Kirashi Business Synergies Private Limited'
tradeName  'Kirashi'
address    '6-148/1, Bowrampet, ... Telangana 500043'
phone      '+91 9030498359'
email      'info@kirashi.in'
gstin      '36AAMCK2569F1Z9'
pan        'AAMCK2569F'
stateCode  '36'
```

The trade name on screen is the least of it. **`gstin` and `pan` print on
every tax invoice this product generates.** A second business would have
issued invoices under Kirashi's GST number, silently, from its very first
invoice — one company's tax identity on another company's legal documents.

[Migration 041](backend/migrations/041_drop_kirashi_defaults.sql) drops all
eight. Kept: `fyStart 'April'` (the Indian financial year, right for everyone)
and `default_payment_terms_days 30` (a neutral convention). Kirashi's own row
is untouched — this only stops the values being handed to anybody else.

---

## The top bar

Six competing clusters strung along the right edge — a gradient Quick Create
button, a bordered "Context:" pill, a role badge, a bell, a 62px switch with
DARK or LIGHT printed inside it, and a boxed avatar-name-Sign-out. Four border
treatments, two gradients, no hierarchy, and nothing saying which business you
were signed into.

Now three groups, in the order the questions get asked:

```
Steelco Fabrication Pvt Ltd   ·   All work ▾              New   🔔   ⌄
└─ where am I ────────────────────────────┘               └─ do ─┘  └ who
```

The theme switch moved into the account menu. It is set once and never touched
again; it did not deserve the widest control in the header.

---

## First run

Four onboarding screens already existed. Between them they asked for
organisation name, trade name, industry, GSTIN, CIN, PAN, address, state code
and bank details before letting anyone through — and one promised "takes ~3
minutes" before the user had seen a single screen of the product.

Now: **what is the business called, and roughly how big is it.** One input and
five buttons, with a Skip. Everything else moves to the setup-readiness
banner, which already explains what is missing, what it costs you and where to
fix it, at the point it starts to mattering rather than before you have seen
anything.

Verified end to end — new install → welcome → answer → in, asked once,
name in the bar
([test-firstrun.cjs](frontend/scripts/test-firstrun.cjs), 9/9).

---

## Still open

`work_orders`, `bills` and `boq_items` keep their `NOT NULL` project — those
are the construction-billing screens where it is meaningful. If Steelco never
does contract work they simply never open them, which is the right outcome,
but the nav still lists them. Whether to hide the construction module entirely
for businesses that don't use it is a separate decision, and yours.
