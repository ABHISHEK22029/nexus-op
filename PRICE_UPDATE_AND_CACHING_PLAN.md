# Rollout Plan — Kirashi Live Prices + Nexus Redis Caching

Two independent features, both already built & locally tested. This is the
deploy sequence. 🟩 = your step · 🟦 = my step.

---

## Goal
1. **Kirashi price updates** — the static Kirashi site pulls live metal prices from
   the Nexus backend, which refreshes them every 12h. No more Kirashi re-deploys to
   update prices.
2. **Redis caching** — the Nexus app caches DB reads in Redis so screens load fast
   and stay in sync (writes invalidate the cache).

They share **one backend deploy** but are **decoupled** — prices work with just the
metal key; caching works only once Redis is connected. You can do them together or
one at a time.

---

## Architecture (already wired)
```
Kirashi homepage (static, Netlify)
      │  fetch()  https://nexus-op-2.onrender.com/public/metal-prices
      ▼
Nexus backend (Render)  ──(≤ every 12h)──▶  MetalpriceAPI (USD→INR)
      │  serves cached prices JSON (DB-backed, budget-safe)
      ▼
Widget renders table + calculator
```
- Endpoint is **public + CORS-open**; the API key stays on the server.
- Kirashi falls back to its local `assets/metal-prices.json` if the backend is down.

---

## What's already done (🟦 me, committed-ready locally)
- ✅ `GET /public/metal-prices` endpoint (lazy 12h refresh, DB cache) — **live-tested**.
- ✅ Migration `024_metal_prices.sql` — **already applied to the live DB**.
- ✅ Kirashi `metal-prices.js` now reads the Nexus endpoint (local fallback).
- ✅ Redis cache layer (`cache.js` + per-user middleware) — safe no-op without `REDIS_URL`.
- ✅ `ioredis` added to backend deps.

---

## Rollout steps

### Track A — Price updates (do this to get Kirashi live)
1. 🟩 **Render → nexus-op-2 → Environment**, add:
   `METALPRICEAPI_KEY = 543954fec83d345ba032c7eaa459d4fd`
2. 🟦 **Push the Nexus backend** → Render auto-deploys (~2–3 min).
3. 🟦 **Verify** `https://nexus-op-2.onrender.com/public/metal-prices` returns live JSON.
4. 🟩 **Re-deploy Kirashi once** (drag-drop the folder to Netlify — excluding `.env`
   and `scripts/`). This ships the `metal-prices.js` that reads the Nexus endpoint.
5. 🟩 **Verify** the Kirashi homepage shows the prices with a green "live" dot.
   → From now on, prices refresh automatically every 12h. **No more Kirashi deploys.**

### Track B — Redis caching (optional, adds speed)
1. 🟩 **Provision Redis** — sign up at **upstash.com** → create a Redis database
   (region closest to your Render service) → copy the `rediss://…` URL.
2. 🟩 **Render → nexus-op-2 → Environment**, add: `REDIS_URL = rediss://…`
3. 🟦 Already deployed in step A-2 (same codebase) — Redis **activates automatically**
   the moment `REDIS_URL` is present (Render redeploys on env change).
4. 🟦 **Verify** cache is on: repeated GETs return an `X-Cache: HIT` header and are faster.

> Order note: adding the env vars **before** the push means the first deploy is fully
> live. If we push first, it still works — prices use a fallback rate and caching stays
> off until the vars are added.

---

## Verification checklist
- [ ] `/public/metal-prices` → 200 JSON, `provider_source: "MetalpriceAPI · USD→INR live"`
- [ ] Kirashi homepage → prices table + green "live" dot
- [ ] (Redis) second identical GET → `X-Cache: HIT`, sub-100ms
- [ ] Nexus app screens (Customers etc.) still load correctly

---

## Notes
- **Budget-safe:** the endpoint fetches the API at most once per 12h (DB-persisted), well
  under the 100 req/month free tier — even across Render restarts.
- **Nothing breaks without the keys:** no `METALPRICEAPI_KEY` → fallback prices; no
  `REDIS_URL` → no caching. Both degrade gracefully.
- **Redis ≠ database.** Supabase stays your DB; Upstash is only a cache alongside it.
