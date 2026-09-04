# Public catalogue — build plan

*3 Sep 2026. Follows the feasibility note. This is the how.*

---

## First: the subdomain question, answered

**`kirashi.maksops.in` is achievable — and easier than you'd expect, because
of a decision you already made.**

Every business table carries `owner_id` (29 of them), but `company_profile` is
a **single row with no owner column**. That means today:

> **one deployment = one business.**

Which is exactly why the subdomain works. `kirashi.maksops.in` is not a tenant
lookup — it is *Kirashi's own deployment*, with its own database, answering on
its own hostname. The catalogue at that host is simply that install's
catalogue. No tenant routing, no `org_id`, no multi-tenancy work.

```
kirashi.maksops.in    → Kirashi's deployment  → its own DB → its catalogue
nordicflat.maksops.in → Nordic's deployment   → its own DB → its catalogue
```

Set up once per client: a DNS record and a host entry at the proxy. That is a
deploy step, not a code change.

### The cost of that model, stated plainly

One deployment and one Supabase project **per client**. At a handful of
clients that is fine and arguably desirable — they are properly isolated, one
client's traffic cannot touch another's, and a bad migration blasts one
customer not all of them. At thirty clients it is thirty things to deploy,
migrate and pay for.

**The plan below does not depend on which model you land on**, because it
builds the shareable link first:

```
  today, works in either model      https://kirashi.maksops.in/c/billy-bookcase
  vanity subdomain, DNS only        https://kirashi.maksops.in/c
  one host, many clients            https://maksops.in/c/kirashi/…   ← needs org_id
```

The path already carries a slug, so moving from the first to the third later
is a routing change, not a rebuild. **Build the link. Add the subdomain when
you sell the client. Defer multi-tenancy until the deployment count hurts.**

---

## What gets built

### Schema

```sql
-- catalogue settings: one row, like company_profile
catalogue_settings
  slug                 -- 'kirashi'  → /c/kirashi if ever multi-tenant
  headline, subhead    -- the hero. Their words, not ours
  is_published         -- off by default; nothing is public by accident
  show_prices          -- default FALSE (see below)
  enquiry_email        -- where enquiries land
  theme_accent         -- inherits the org's colour, overridable
  whatsapp_number      -- the button an Indian SME buyer actually presses

-- products become catalogue-able (additive to skus)
skus
  + catalogue_slug     -- 'billy-bookcase-80x202'
  + is_published
  + headline           -- marketing line, distinct from the internal name
  + use_case           -- "hospital corridors, 90-min fire rating"
  + moq, lead_time_note
  + sort_order

-- photos
catalogue_photos
  sku_id, attachment_id, sort_order, alt_text

-- enquiries (a stranger's basket, NOT a customer yet)
enquiries
  ref                  -- ENQ-0001, quotable over the phone
  name, company, phone, email, message
  status               -- new / read / quoted / won / ignored
  source               -- 'catalogue'
  customer_id          -- NULL until converted
  quotation_id         -- set when it becomes a quote
enquiry_items
  enquiry_id, sku_id, description, quantity, note
```

`enquiries.customer_id` stays NULL on purpose. **A stranger is not a
customer.** The `customers` row is created at the moment somebody decides the
enquiry is real — otherwise the customer list, and the "what they buy" work
just finished, fills with tyre-kickers.

### Public API — all before `app.use(authenticate)`

```
GET  /public/catalogue            settings + published products
GET  /public/catalogue/:slug      one product, full detail
GET  /public/catalogue/photo/:id  the image, no token
POST /public/enquiry              the basket
```

`/public/metal-prices` is already live and serving the Kirashi site from this
exact position in the file, so the pattern is proven, CORS included.

The photo route is the one genuinely new thing: `GET /attachments/:id/download`
requires a token today, and a stranger's browser does not have one. The public
route serves **only** photos attached to a **published** product — publication
is the authorisation.

### The pages

```
/c            the catalogue    hero · category filter · product grid · basket
/c/:slug      one product      photos · use case · MOQ · lead time · add
/c/enquiry    the basket       who you are, what you want, send
```

Client-rendered like the rest of the app, with **one exception**: a tiny
server-side meta shim for `/c/*` so a link pasted into WhatsApp shows a title,
a description and a photo. Without it the crawler sees an empty
`<div id="root">` and the link looks broken — which matters, because WhatsApp
is how this will actually be shared.

### Inside the app

```
Sales → Enquiries      inbox: new / read / quoted, oldest-first
                       [Convert to quotation] → creates the customer,
                                                prefills the builder,
                                                the existing chain takes over
Configure → Catalogue  publish toggle · slug + the shareable link with a
                       copy button · hero copy · show-prices · enquiry email
                       · WhatsApp number · which products are published
```

The Configurator tile is where you asked for it, and the tile model built
today already has a slot: `Document numbering` and `Approvals` sit there
greyed. Catalogue joins them and turns on.

---

## Design

Take **structure and restraint** from `kirashi.co.in`, not the skin:

- a hero that says what the business makes, in its words
- **a tool on the page, not just a grid.** The Kirashi site's live metal rates
  and GST calculator are the distinctive part — it *does* something. The
  catalogue equivalent: enter a quantity, see an indicative figure, and the
  same control adds it to the enquiry. One widget doing two jobs.
- restrained palette, strong hierarchy, single-column scroll

Colour and type come from the organisation's own profile, not from Kirashi's.
Copying it edge-to-edge would make every client's catalogue look like
Kirashi's, which is wrong for something you are selling to other businesses.

The app's tokens already cover both themes, so the catalogue inherits the
identity rather than inventing one.

---

## Sequence

**Phase 1 — a link you can share (~3 days)**
Schema; public catalogue + product + photo endpoints; the `/c` pages; the
Configurator tile with the copyable link; publish toggles; meta shim.
*Ends with: a URL you can put in a WhatsApp group.*

**Phase 2 — enquiries arrive (~2.5 days)**
Basket; enquiry form; `enquiries` tables; the inbox in Sales; email
notification; WhatsApp button.
*Ends with: enquiries you can read.*

**Phase 3 — enquiry becomes money (~1.5 days)**
Convert → creates the customer, prefills the quotation builder, hands off to
the chain that is already proven at 39/39.
*Ends with: the loop closed.*

**~7 days.** Each phase is independently useful — it can stop after 1 or 2
without leaving something half-built.

---

## Decisions I have taken, and why — overrule any of them

| Decision | Why |
|---|---|
| **Prices hidden by default** | Competitors read public price lists. On-request also drives the enquiry, which is the point of the page. Per-product toggle. |
| **Enquiry, not checkout** | B2B fabrication is quoted, not bought. A payment gateway is a different product and a compliance surface you don't want. |
| **No stock on the public page** | "In stock: 40" invites arguments you can't win and leaks capacity. |
| **No customer login** | A link that just works beats an account nobody creates. |
| **Photos stay in Postgres for now** | Measured: 30ms warm, ~1.8s for a 20×3 page. Fine to launch. Object storage is the upgrade when traffic justifies it. |
| **Published ⇒ public** | Publication *is* the authorisation. No separate ACL to get wrong. |

---

## Two things I still need from you

1. **Which hosting model?** Deployment-per-client (works today, subdomain is
   just DNS) or one host for everyone (cheaper to run, needs the `org_id`
   work first). The plan builds the same either way — but it decides whether
   the subdomain is a DNS ticket or a schema project.
2. **What is the domain?** `maksops.in`? Needed for the copy button to show a
   real link rather than a placeholder.

---

## What I would not do yet

**Not multi-tenancy, for this.** It is the right long-term answer and it is a
schema change — `organisations` table, `org_id` on `company_profile`, tenant
resolution on every request, and a re-audit of the owner-scoping we have
already tested. That is its own project, and doing it *because of* the
catalogue would be the tail wagging the dog. The catalogue does not need it;
your deployment count will tell you when you do.
