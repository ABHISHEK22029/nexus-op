-- ══════════════════════════════════════════════════════════
-- 029 — Unit of Measure system (Track A continued)
--
-- THE PROBLEM
-- The same material chain uses different units at every hop:
--     raw_materials.unit = 'kg'      sku_bom.uom = 'kg'
--     inventory.uom      = 'nos'     po_line_items.uom = "No's" / 'Cum'
-- and there is NO conversion logic anywhere in the codebase. A deficiency
-- engine built on this would compare 4 kg against 2000 pieces and return a
-- confident, wrong answer.
--
-- Steel makes this unavoidable, not academic:
--     you BUY     SS 304 sheet by the metric tonne
--     you STOCK   it as pieces (2500 x 1250 x 1.2 mm)
--     you CONSUME 2 pieces per door — or 47 kg per door
-- All three are the same material.
--
-- THE MODEL — three layers
--   1. `uom`       canonical unit list with within-dimension factors
--                  (1 MT = 1000 kg). Universal, item-independent.
--   2. `item_uom`  cross-dimension factors, which are ITEM-SPECIFIC
--                  (1 sheet = 29.74 kg depends on that exact sheet).
--   3. derived     for steel, weight per piece is COMPUTED from
--                  dimensions x density, so nobody types it.
-- ══════════════════════════════════════════════════════════

-- ── 1. Canonical unit list ──
CREATE TABLE IF NOT EXISTS uom (
  code           TEXT PRIMARY KEY,          -- 'kg', 'mt', 'nos', 'm', 'sqm'
  name           TEXT NOT NULL,
  dimension      TEXT NOT NULL,             -- count | weight | length | area | volume
  factor_to_base NUMERIC(20,8) NOT NULL,    -- how many BASE units of this dimension
  is_base        BOOLEAN DEFAULT FALSE,
  CONSTRAINT uom_dimension_chk CHECK (dimension IN ('count','weight','length','area','volume'))
);

INSERT INTO uom (code, name, dimension, factor_to_base, is_base) VALUES
  -- count (base: nos)
  ('nos',   'Numbers / Pieces',   'count',  1,          TRUE),
  ('set',   'Set',                'count',  1,          FALSE),
  ('pair',  'Pair',               'count',  2,          FALSE),
  ('dozen', 'Dozen',              'count',  12,         FALSE),
  ('box',   'Box',                'count',  1,          FALSE),
  -- weight (base: kg)
  ('kg',    'Kilogram',           'weight', 1,          TRUE),
  ('g',     'Gram',               'weight', 0.001,      FALSE),
  ('mt',    'Metric Tonne',       'weight', 1000,       FALSE),
  ('quintal','Quintal',           'weight', 100,        FALSE),
  -- length (base: m)
  ('m',     'Metre',              'length', 1,          TRUE),
  ('mm',    'Millimetre',         'length', 0.001,      FALSE),
  ('cm',    'Centimetre',         'length', 0.01,       FALSE),
  ('ft',    'Foot',               'length', 0.3048,     FALSE),
  ('inch',  'Inch',               'length', 0.0254,     FALSE),
  -- area (base: sqm)
  ('sqm',   'Square Metre',       'area',   1,          TRUE),
  ('sqft',  'Square Foot',        'area',   0.09290304, FALSE),
  -- volume (base: m3)
  ('m3',    'Cubic Metre',        'volume', 1,          TRUE),
  ('cum',   'Cubic Metre (Cum)',  'volume', 1,          FALSE),
  ('ltr',   'Litre',              'volume', 0.001,      FALSE)
ON CONFLICT (code) DO NOTHING;

-- ── 2. Item master: base unit, purchase unit, and the physical facts ──
ALTER TABLE raw_materials
  ADD COLUMN IF NOT EXISTS base_uom       TEXT REFERENCES uom(code),
  ADD COLUMN IF NOT EXISTS purchase_uom   TEXT REFERENCES uom(code),
  -- Physical dimensions let us DERIVE weight instead of asking for it.
  ADD COLUMN IF NOT EXISTS length_mm      NUMERIC(12,3),
  ADD COLUMN IF NOT EXISTS width_mm       NUMERIC(12,3),
  ADD COLUMN IF NOT EXISTS thickness_mm   NUMERIC(12,3),
  ADD COLUMN IF NOT EXISTS density_kg_m3  NUMERIC(10,2),
  -- Cached so queries don't recompute it constantly; refreshed on save.
  ADD COLUMN IF NOT EXISTS weight_per_piece_kg NUMERIC(14,4),
  ADD COLUMN IF NOT EXISTS category       TEXT,
  ADD COLUMN IF NOT EXISTS moq            NUMERIC(14,4),
  ADD COLUMN IF NOT EXISTS lead_time_days INTEGER,
  ADD COLUMN IF NOT EXISTS is_critical    BOOLEAN DEFAULT FALSE;

-- Existing rows keep behaving exactly as before.
UPDATE raw_materials SET base_uom = COALESCE(base_uom, NULLIF(lower(unit), ''), 'nos') WHERE base_uom IS NULL;
UPDATE raw_materials SET purchase_uom = COALESCE(purchase_uom, base_uom) WHERE purchase_uom IS NULL;

-- ── 3. Standard densities, so weight can be derived from a grade ──
CREATE TABLE IF NOT EXISTS material_density (
  grade         TEXT PRIMARY KEY,
  density_kg_m3 NUMERIC(10,2) NOT NULL,
  note          TEXT
);

INSERT INTO material_density (grade, density_kg_m3, note) VALUES
  ('MS',        7850, 'Mild steel'),
  ('IS2062',    7850, 'Structural mild steel'),
  ('SS 202',    7800, 'Stainless 202'),
  ('SS 304',    7930, 'Stainless 304'),
  ('SS 316',    8000, 'Stainless 316'),
  ('GI',        7850, 'Galvanised iron'),
  ('ALUMINIUM', 2700, 'Aluminium'),
  ('BRASS',     8500, 'Brass'),
  ('COPPER',    8960, 'Copper'),
  ('BRONZE',    8800, 'Bronze'),
  ('GLASS',     2500, 'Float glass')
ON CONFLICT (grade) DO NOTHING;

-- ── 4. Item-specific cross-dimension conversions ──
-- "1 sheet = 29.74 kg" cannot live in the generic uom table because it is
-- true only for that one sheet size. This is where piece<->weight lives.
CREATE TABLE IF NOT EXISTS item_uom (
  id              SERIAL PRIMARY KEY,
  raw_material_id INTEGER NOT NULL REFERENCES raw_materials(id) ON DELETE CASCADE,
  uom_code        TEXT NOT NULL REFERENCES uom(code),
  qty_in_base     NUMERIC(20,8) NOT NULL,   -- 1 uom_code = qty_in_base of the item's base_uom
  role            TEXT DEFAULT 'alt',        -- stock | purchase | sales | alt
  CONSTRAINT item_uom_positive CHECK (qty_in_base > 0),
  UNIQUE (raw_material_id, uom_code)
);
CREATE INDEX IF NOT EXISTS item_uom_material_idx ON item_uom (raw_material_id);

-- ── 5. Record the unit alongside every quantity that moves ──
-- Without this a stock row is a number with no unit, and any conversion
-- applied later is guesswork.
ALTER TABLE inventory        ADD COLUMN IF NOT EXISTS base_uom TEXT REFERENCES uom(code);
ALTER TABLE sku_bom          ADD COLUMN IF NOT EXISTS uom_code TEXT REFERENCES uom(code);
ALTER TABLE po_line_items    ADD COLUMN IF NOT EXISTS uom_code TEXT REFERENCES uom(code);

UPDATE inventory SET base_uom = COALESCE(base_uom, NULLIF(lower(uom), ''), 'nos') WHERE base_uom IS NULL;

COMMENT ON TABLE  uom      IS 'Canonical units. Cross-dimension conversions (piece<->weight) live in item_uom because they are item-specific.';
COMMENT ON TABLE  item_uom IS 'Per-item conversions, e.g. 1 sheet = 29.74 kg.';
COMMENT ON COLUMN raw_materials.weight_per_piece_kg IS 'Derived from dimensions x density where available; the source of the piece<->weight factor.';
