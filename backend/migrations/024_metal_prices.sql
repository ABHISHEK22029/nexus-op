-- 024_metal_prices.sql — single-row cache for the Kirashi metal-rates endpoint.
-- The backend refreshes this at most every 12h (lazy, on request) so it stays
-- within the free API budget even across restarts. Idempotent.
CREATE TABLE IF NOT EXISTS metal_prices_cache (
  id         INTEGER PRIMARY KEY DEFAULT 1,
  data       JSONB,
  updated_at TIMESTAMPTZ,
  CONSTRAINT metal_prices_single_row CHECK (id = 1)
);
