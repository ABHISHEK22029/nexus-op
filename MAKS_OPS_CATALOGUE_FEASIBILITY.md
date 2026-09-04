# Public product catalogue + enquiries — is it viable?

*3 Sep 2026. Research, not implementation. Verdict at the top.*

---

## Verdict

**Yes. Everything this feature needs, the backend can already do** — photo
upload included, tested and byte-perfect (see below). Nothing has to be
re-architected to start.

The reason it fits is not the catalogue. It is that **the hard half is already
built and tested.** Most "add a storefront" projects die because the back end
behind the enquiry does not exist — you collect a lead and then have nowhere
to put it. Here the chain from quotation to invoice already works end to end
and is proven at 39/39 through the real forms:

```
enquiry → quotation → order → production → stock → dispatch → invoice
   NEW  →  ────────────── all of this already exists ──────────────
```

A catalogue enquiry is a **new front door onto a corridor that is already
built**. That is a genuinely unusual position to be in.

---

## What already exists that this reuses

| Need | Already there | Gap |
|---|---|---|
| Products | `skus` — code, name, description, unit, price, HSN | photos, marketing copy, public flag, slug |
| Public endpoint pattern | `/public/metal-prices` sits *before* `app.use(authenticate)` | none — copy the pattern |
| Quotation from a customer + lines | the builder the chain test drives | enquiry → prefill |
| Customers | full record incl. the new "what they buy" | enquiry contact is not yet a customer |
| Marketing shell + design tokens | `MarketingLayout`, `Welcome.jsx`, full token set | catalogue-specific components |
| Configurator tiles | the tile model built today | one more tile |
| Attachments | `attachments` table + multer upload | **authenticated-only, bytea, 0 rows** |

**Single-tenancy actually helps here.** You deferred multi-tenancy, and for
this feature that is a simplification, not a limitation: one deployment = one
business = one catalogue. The shareable link is just
`yourdomain/c/<something>` with no tenant routing to design. This is the rare
case where the decision you postponed makes the next feature *easier*.

### The pattern is already in production

`/public/metal-prices` is not a sketch. It is live right now, serving the
static Kirashi site on Netlify with 12-hourly refreshed rates:

```
{"currency":"INR","unit":"per_kg","gst_rate":18,
 "last_updated":"2026-09-03 23:28:10 IST","stale":false, …}
```

Three things follow from that, and all of them are good news:

1. **An unauthenticated public endpoint on this backend already works**,
   including CORS from another origin. The catalogue is the same shape.
2. **The rollout plan for it already solved public-facing degradation** — the
   Kirashi site falls back to a bundled `metal-prices.json` if the backend is
   down, so a visitor never sees a broken page. That is the right instinct,
   and it partly answers the "an outage is now customer-facing" worry below:
   the catalogue should cache its last-good payload rather than fail open to
   an error screen.
3. **The "give the page a tool" recommendation is not speculative** — the live
   rates table with a GST calculator already has a working backend behind it.
   A catalogue that lets a visitor put in a quantity and see an indicative
   price is the same widget pointed at `skus`.

---

## Photo upload: measured, not guessed

**It already works.** Real PNGs pushed through the existing `/attachments`
endpoint, stored in Postgres, read back and compared byte for byte:

```
  size        upload    read back   bytes match
  ────────────────────────────────────────────────
  38 KB         95ms       70ms      identical
  209 KB       122ms       77ms      identical
  427 KB       144ms       82ms      identical
  872 KB       192ms      103ms      identical
  6.0 MB       500ms        —        accepted (200)
  14.0 MB        —          —        rejected

  warm re-read of one image: 30ms median
```

So the answer to "is the database capable of photo upload" is **yes, today,
with no changes** — multer takes the file, `attachments.data` (bytea) stores
it, and it comes back intact up to the 10 MB cap.

### A correction to what I wrote earlier

An earlier draft of this document said a 20-product × 3-photo page would cost
**26.4 seconds** of database time and called object storage a precondition
that was "not negotiable". That was wrong.

It was calculated from the **440ms cold round trip measured before the
connection-pool fix** — a number that no longer describes this system. Warm,
one image read is **30ms**, so the same page costs about **1.8 seconds** of
backend time, not 26. I extrapolated from a stale measurement instead of
taking a new one.

**What that changes:** Postgres storage is good enough to build and launch on
for a catalogue of tens of products. It is not a blocker.

**What is still true:**

- every image is a pooled query, so photos compete with the ERP for the same
  small connection budget — fine for a handful of visitors, not for a link
  that goes out to a few hundred people at once
- no CDN, and no cheap browser caching, so every visitor pays full price
- `GET /attachments/:id/download` **requires a token**, and a stranger's
  browser does not have one. This part genuinely must change: the catalogue
  needs a public image route.

**Supabase Storage remains the right upgrade** — you are already on Supabase
and it gives public URLs behind a CDN with no database involvement. But it is
a *scale* decision to take when traffic justifies it, not a gate on starting.

### One rough edge worth naming

Over the cap, the upload returns **HTTP 500 with an HTML error page**, not a
clean `413` with a JSON body — multer's file-size error is not being caught.
Harmless internally, but a catalogue upload screen would show a stranger's
browser a stack-trace page instead of "that photo is too large". Small fix,
worth doing before this is customer-facing.

---

## The other things worth knowing before you commit

**A public write endpoint is an abuse surface.** The enquiry form is an
unauthenticated POST that writes into the business's database and sends mail.
There is currently **no rate limiting anywhere in the backend**. Minimum:
per-IP rate limit, a honeypot field, a submit-timing check, hard size caps,
and email validation. Express 5 is fine for this. Half a day, and not
optional — without it the enquiry inbox becomes a spam folder within a week
of the link being shared.

**An enquiry is not a customer.** `sales_quotations` needs a `customer_id`,
but an enquiry arrives from a stranger. Two options, and the second is right:

- create a `customers` row on every enquiry → the customer list fills with
  tyre-kickers and the "what they buy" work we just did gets diluted
- **hold the contact details on the enquiry, and create the customer only
  when it is converted to a quotation** → the customer list stays a list of
  actual customers

**Public prices are a business decision, not a technical one.** Plenty of
fabricators will not put list prices on the open internet where competitors
can read them. Needs a per-product choice: show price / "price on request".
Default to *on request* — it is the safer default and it drives enquiries,
which is the point of the page.

**Link previews will not work without help.** The app is a client-rendered
SPA. A catalogue link pasted into WhatsApp — which is how this will actually
be shared — will show no title, no image, no description, because the crawler
sees an empty `<div id="root">`. Fixing it needs a small server-rendered meta
shim for `/c/*` routes. Cheap, but invisible until someone shares a link and
it looks broken.

**It changes what the product is.** Today an outage means staff cannot work.
With a catalogue, an outage means **customers see a broken page with your name
on it**. That is a different uptime conversation, and worth having before
rather than after.

---

## The design reference

I could not reach `kirashi.in`; `kirashi.co.in` loads. What it does well, and
what is worth taking:

- clean single-column scroll with a strong hero — *"Built with Precision.
  Driven by Innovation"*
- **data-driven components as the centrepiece**: the live metal-rates table
  and the cost calculator with GST. That is the distinctive part — it is not a
  brochure, it does something useful on the page
- clear hierarchy, restrained palette, bold headings over supporting copy

The last point is the one worth copying into the catalogue: **give the page a
tool, not just a grid.** For a fabricator that might be "enter your quantity
and see an indicative price", which is exactly the calculator pattern already
on the Kirashi site — and it doubles as the add-to-enquiry control.

The app's own token system already carries the amber brand
(`--brand-amber: hsl(22, 92%, 50%)` in light) and the marketing shell exists,
so the catalogue inherits the identity rather than re-inventing it.

---

## What I would build, in order

**Phase 1 — the catalogue exists and can be shared (~3 days)**
Supabase Storage wired up; product photos, marketing description, use-case
and "publish" flag on `skus`; public `/public/catalogue` + `/public/catalogue/:slug`;
the public page itself; Configurator tile for catalogue settings.
*You can share a link at the end of this.*

**Phase 2 — enquiries arrive and are workable (~2.5 days)**
Enquiry cart + form with anti-spam; `enquiries` + `enquiry_items` tables;
Enquiry inbox in the app; email notification.
*You can receive and read enquiries at the end of this.*

**Phase 3 — enquiry becomes money (~1.5 days)**
Convert enquiry → quotation, prefilled, creating the customer at that moment;
the existing chain takes over from there.
*The loop closes at the end of this.*

**~7 days total.** That is a real feature, not a weekend. Phases 1 and 2 are
each independently useful, so it can stop after either without leaving
something half-built.

---

## What I would NOT do

- **Not payments.** "Enquiry, not order" is the right call — B2B fabrication
  is quoted, not checked out. Adding a payment gateway would be a different
  product and a compliance surface you do not want.
- **Not stock visibility on the public page.** "In stock: 40" invites
  arguments you cannot win and leaks capacity to competitors.
- **Not a customer login.** A shareable link that just works beats an account
  nobody creates. If they want to track orders later, that is a separate
  decision.

---

## Two open questions for you

1. **Public prices, or price on request?** I would default to on-request per
   product, with a toggle. Your call — it is a commercial decision.
2. **Is `kirashi.co.in` the design target, or the *style* of it?** Copying it
   edge-to-edge for a catalogue means the catalogue looks like Kirashi's site
   specifically — which is wrong for a product other businesses will use. I
   would take its *structure and restraint*, and drive colour and type from
   each organisation's own profile. Worth agreeing before I build the page.

---

## Bottom line

Viable, well-matched, and strategically sensible — it turns an internal ERP
into something that also brings work in, and it reuses a chain that is already
proven.

Nothing blocks starting. Photo upload works today; the public-image route and
the multer error handling are small pieces of work inside phase 1, and object
storage is an upgrade for when the link gets real traffic, not a gate.
