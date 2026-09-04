-- ══════════════════════════════════════════════════════════════════
-- 043 — what a customer wants, and what a vendor actually supplies
--
-- Two gaps that only show up once a real business uses this.
--
-- CUSTOMERS had name, GSTIN, state, contact — and nothing saying what they
-- buy. A fabricator dealing with one customer for fire-rated doors and
-- another for handrails has no way to record that, so the customer list
-- cannot be read by the thing that actually distinguishes the rows.
--
-- VENDORS had `type` (a single word from a fixed list somebody else chose:
-- Civil, Bituminous, IT Hardware) and `capability_tags` (free text). Neither
-- is the org's own vocabulary. A furniture maker's categories are Board,
-- Hardware and Laminates; a fabricator's are Plate, Section and Fasteners.
-- The list has to belong to the business, not to us.
--
-- So: one master of categories the organisation owns, used from both sides.
-- `kind` separates what-we-buy-in from what-we-sell, because the same
-- business may well have different vocabularies for each.
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS supply_categories (
  id          SERIAL PRIMARY KEY,
  owner_id    INTEGER,
  -- 'vendor'   — a category of thing we BUY (used on vendors)
  -- 'customer' — a category of thing we SELL (used on customers)
  kind        TEXT NOT NULL DEFAULT 'vendor' CHECK (kind IN ('vendor','customer')),
  name        TEXT NOT NULL,
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One name per kind per organisation. Case-insensitive, so "Hardware" and
-- "hardware" are not two categories.
CREATE UNIQUE INDEX IF NOT EXISTS idx_supply_categories_unique
  ON supply_categories (COALESCE(owner_id, -1), kind, LOWER(name));

CREATE INDEX IF NOT EXISTS idx_supply_categories_owner
  ON supply_categories (owner_id, kind) WHERE is_active;

-- ── customers: what do they buy from us ───────────────────────────
-- A category for filtering and a sentence for the detail. Both optional:
-- a customer you have only just added should not be blocked on knowing.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS requirement_category TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS requirement          TEXT;

COMMENT ON COLUMN customers.requirement IS
  'What this customer actually wants, in the seller''s own words — "fire-rated doors for hospital projects".';

-- ── vendors: what do they supply ──────────────────────────────────
-- `type` stays as it is so nothing existing breaks; supply_category is the
-- org-owned classification, and supplies is the free-text detail that
-- capability_tags was doing without a clear name.
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS supply_category TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS supplies        TEXT;

COMMENT ON COLUMN vendors.supplies IS
  'What this vendor actually supplies, in the buyer''s own words. The precise item-level list lives in vendor_items.';

-- ── seed the master from what is already in use ───────────────────
-- Every distinct vendor `type` on the database becomes a category owned by
-- whoever owns those vendors, so nothing has to be re-typed and existing
-- rows classify themselves.
INSERT INTO supply_categories (owner_id, kind, name)
SELECT DISTINCT v.owner_id, 'vendor', TRIM(v.type)
  FROM vendors v
 WHERE v.type IS NOT NULL AND TRIM(v.type) <> ''
ON CONFLICT DO NOTHING;

UPDATE vendors SET supply_category = TRIM(type)
 WHERE supply_category IS NULL AND type IS NOT NULL AND TRIM(type) <> '';

-- capability_tags was already being used for "what they can do"; carry it
-- across rather than leaving the new, clearer column empty.
UPDATE vendors SET supplies = capability_tags
 WHERE supplies IS NULL AND capability_tags IS NOT NULL AND TRIM(capability_tags) <> '';
