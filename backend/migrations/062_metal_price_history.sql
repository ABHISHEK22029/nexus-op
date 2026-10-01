-- 062_metal_price_history.sql
--
-- The Kirashi price chart offers 1D · 1W · 1M · 3M · 1Y · 3Y · All, and only
-- the first two could ever have been real: history lived as an array inside
-- the single metal_prices_cache JSON row and was truncated with .slice(-10).
-- Ten days, permanently. The 3M, 1Y and 3Y buttons were not short of data,
-- they were unreachable by construction.
--
-- Two problems with keeping it in that blob, beyond the cap:
--
--   · Writing a day means read-modify-write of the whole array. A failure
--     between the read and the write loses history rather than one day.
--   · The array is read in full on every request to the public endpoint,
--     and it only grows.
--
-- One row per day instead. The day is the primary key, so a double write on
-- the same date updates rather than duplicating — which is what made the old
-- code filter the array by date before appending.
--
-- This is deliberately NOT owner-scoped. Metal rates are public reference
-- data for the Kirashi site, the same numbers for everybody, served from
-- /public/metal-prices with no auth. Everything in this product that belongs
-- to a tenant carries owner_id; this does not, and that is the distinction.

CREATE TABLE IF NOT EXISTS metal_price_history (
  day        DATE PRIMARY KEY,
  -- { aluminium: 249.74, copper: 912.52, ... } in INR per kg, as served.
  metals     JSONB NOT NULL,
  -- The USD→INR rate the USD-based metals were converted at that day. Kept
  -- because it is the only genuinely observed number in the row: the USD/kg
  -- base rates are maintained constants, so this is what actually moved.
  usd_inr    NUMERIC(10,4),
  -- Where the day came from. 'live' is a day we recorded ourselves from the
  -- provider; 'backfill' was reconstructed from the provider's historical
  -- FX series. A chart that cannot tell the two apart invites reading
  -- reconstructed data as observed data.
  source     TEXT NOT NULL DEFAULT 'live',   -- live | backfill | fallback
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS metal_price_history_day_idx ON metal_price_history(day DESC);

-- ── Somewhere to remember what has already been tried ───────────────────
-- The history backfill calls a metered third-party API, and the free plan
-- caps a timeframe query at five days — so reaching back a month costs six
-- calls. The service it runs in sleeps after 15 minutes and starts cold, so
-- an in-memory "already tried" flag is forgotten several times a day. Without
-- somewhere durable to record the attempt, a backfill that fails for a reason
-- that will never change — the plan does not permit it — retries six calls
-- per cold start until the monthly budget is gone.
CREATE TABLE IF NOT EXISTS metal_price_meta (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Carry across the days already recorded ──────────────────────────────
-- The ten days in the existing cache blob are real observations and the only
-- history that exists; losing them to a storage change would be the one
-- irreversible part of this migration. Existing rows win, so re-running is
-- safe and a later backfill cannot overwrite an observed day.
--
-- usd_inr is DERIVED per day, not copied. The blob held a single usd_inr —
-- whatever the rate was the last time it was written — so copying it would
-- stamp today's rate onto every past day and quietly assert an exchange rate
-- that never applied. The per-day prices are intact, and aluminium is
-- (2.60 USD/kg x that day's rate), so dividing recovers the real rate for
-- the day to within the stored rounding. Where aluminium is missing there is
-- nothing to recover and the column stays NULL rather than being invented.
INSERT INTO metal_price_history (day, metals, usd_inr, source)
SELECT
  (h->>'date')::date,
  h->'metals',
  ROUND(((h->'metals'->>'aluminium')::numeric / 2.60), 4),
  'live'
FROM metal_prices_cache
CROSS JOIN LATERAL jsonb_array_elements(data->'history') AS h
WHERE id = 1
  AND data ? 'history'
  AND jsonb_typeof(data->'history') = 'array'
  AND (h->>'date') ~ '^\d{4}-\d{2}-\d{2}$'
ON CONFLICT (day) DO NOTHING;
