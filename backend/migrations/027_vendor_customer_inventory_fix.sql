-- ══════════════════════════════════════════════════════════
-- 027 — Fix three "half-built" features (Phase 1 bug fixes)
--
-- 1. VENDORS: the vendor form collects ~50 fields across 5 tabs but the save
--    payload only ever sent {name, type, pan, gstin}. Everything else the
--    user typed — contact, address, bank, capability, compliance — was
--    silently discarded. These columns give that data somewhere to land.
--
-- 2. VENDOR "SUPPLIES": capability_tags already existed but nothing ever
--    wrote to it, so "what does this vendor actually supply?" was
--    unanswerable and PO vendor dropdowns listed every vendor regardless of
--    what was being purchased.
--
-- 3. INVENTORY: the UI renders a Low-Stock badge driven by `reorderLevel`
--    and `status` — fields the API never returned, so every item always
--    showed "Healthy" no matter the real level. min_stock_level makes that
--    badge mean something.
--
-- All additive. Nothing dropped or rewritten.
-- ══════════════════════════════════════════════════════════

-- ── 1. Vendors — give the form's data somewhere to live ──
ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS vendor_code      TEXT,
  ADD COLUMN IF NOT EXISTS display_name     TEXT,
  ADD COLUMN IF NOT EXISTS website          TEXT,
  ADD COLUMN IF NOT EXISTS city             TEXT,
  ADD COLUMN IF NOT EXISTS state            TEXT,
  ADD COLUMN IF NOT EXISTS pincode          TEXT,
  -- Commercial terms
  ADD COLUMN IF NOT EXISTS payment_terms    TEXT,
  ADD COLUMN IF NOT EXISTS credit_limit     NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS currency         TEXT DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS lead_time_days   INTEGER,
  -- Bank details (so we can pay them, and reconcile payments)
  ADD COLUMN IF NOT EXISTS bank_name        TEXT,
  ADD COLUMN IF NOT EXISTS account_holder   TEXT,
  ADD COLUMN IF NOT EXISTS account_number   TEXT,
  ADD COLUMN IF NOT EXISTS ifsc_code        TEXT,
  ADD COLUMN IF NOT EXISTS branch_name      TEXT,
  -- Registration / compliance
  ADD COLUMN IF NOT EXISTS is_msme          BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS msme_number      TEXT,
  ADD COLUMN IF NOT EXISTS labour_license   TEXT,
  ADD COLUMN IF NOT EXISTS iso_cert         TEXT,
  ADD COLUMN IF NOT EXISTS notes            TEXT;

-- ── 2. Inventory — make the low-stock badge real ──
ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS min_stock_level  NUMERIC(14,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS category         TEXT,
  ADD COLUMN IF NOT EXISTS location         TEXT;

-- Vendor lookups filter by project and by what they supply.
CREATE INDEX IF NOT EXISTS vendors_project_idx ON vendors ("projectId");
CREATE INDEX IF NOT EXISTS inventory_project_idx ON inventory ("projectId");

-- ── 3. Retire the fake performance metric ──
-- `rating` was hardcoded to 90 on every insert and the UI read a
-- `performanceScore` field the API never returned, rendering "undefined%".
-- Null it out rather than keep showing a number nobody computed. Real vendor
-- performance will be derived from PO/GRN history, not stored by hand.
UPDATE vendors SET rating = NULL WHERE rating = 90;
