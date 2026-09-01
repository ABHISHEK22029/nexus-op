-- ══════════════════════════════════════════════════════════
-- 028 — Item identity: link stock to the item master (Track A)
--
-- THE PROBLEM THIS SOLVES
-- `sku_bom` stores raw_material_id (a real FK), but `inventory` identifies
-- stock by "itemName" — free text. There is therefore NO JOIN between
-- "the BOM says we need material #7" and "we have 40 in stock", which is
-- exactly the join the deficiency engine is built on.
--
-- It also fixes a live data-corruption path: routes/grn.js matches stock by
-- STRING EQUALITY on the display name, so "MS Sheet" and "MS  Sheet" become
-- two separate stock rows and, with no unique constraint, the code picks one
-- arbitrarily.
--
-- APPROACH
-- Additive and reversible. The text column stays as a display snapshot; the
-- ID becomes the identity. Rows that cannot be matched confidently are left
-- NULL and reported rather than guessed — a wrong link silently corrupts
-- every downstream stock number.
-- ══════════════════════════════════════════════════════════

-- ── 1. The identity columns ──
ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS raw_material_id INTEGER REFERENCES raw_materials(id),
  ADD COLUMN IF NOT EXISTS sku_id          INTEGER REFERENCES skus(id);

COMMENT ON COLUMN inventory.raw_material_id IS
  'Canonical identity for raw material stock. "itemName" is now a display snapshot only.';
COMMENT ON COLUMN inventory.sku_id IS
  'Canonical identity for finished-goods stock held before dispatch.';

-- ── 2. Backfill by normalised name ──
-- Normalisation: lower-case, unify the x/× used in dimensions, collapse every
-- run of non-alphanumerics to a single space, trim. This is deliberately
-- conservative — exact normalised equality only, no fuzzy matching.
UPDATE inventory i
SET raw_material_id = rm.id
FROM raw_materials rm
WHERE i.raw_material_id IS NULL
  AND btrim(regexp_replace(lower(translate(i."itemName", '×X', 'xx')), '[^a-z0-9]+', ' ', 'g'))
    = btrim(regexp_replace(lower(translate(rm.name,       '×X', 'xx')), '[^a-z0-9]+', ' ', 'g'));

-- Same again against the material code.
UPDATE inventory i
SET raw_material_id = rm.id
FROM raw_materials rm
WHERE i.raw_material_id IS NULL
  AND rm.material_code IS NOT NULL
  AND btrim(regexp_replace(lower(i."itemName"),      '[^a-z0-9]+', ' ', 'g'))
    = btrim(regexp_replace(lower(rm.material_code),  '[^a-z0-9]+', ' ', 'g'));

-- Finished goods held in stock link to a SKU instead.
UPDATE inventory i
SET sku_id = s.id
FROM skus s
WHERE i.raw_material_id IS NULL
  AND i.sku_id IS NULL
  AND btrim(regexp_replace(lower(translate(i."itemName", '×X', 'xx')), '[^a-z0-9]+', ' ', 'g'))
    = btrim(regexp_replace(lower(translate(s.name,        '×X', 'xx')), '[^a-z0-9]+', ' ', 'g'));

-- ── 3. Stop duplicates reappearing ──
-- Partial unique indexes: one stock row per material per project. Legacy rows
-- that are still unlinked (NULL id) are exempt, so this can be applied before
-- the unmatched backlog is cleared.
CREATE UNIQUE INDEX IF NOT EXISTS inventory_project_material_uidx
  ON inventory ("projectId", raw_material_id)
  WHERE raw_material_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS inventory_project_sku_uidx
  ON inventory ("projectId", sku_id)
  WHERE sku_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS inventory_raw_material_idx ON inventory (raw_material_id);
CREATE INDEX IF NOT EXISTS inventory_sku_idx          ON inventory (sku_id);

-- ── 4. Indexes the deficiency engine will lean on ──
-- It walks: open orders -> order lines -> BOM -> stock. Each hop needs its
-- parent key indexed or the whole calculation degrades to sequential scans.
CREATE INDEX IF NOT EXISTS sku_bom_sku_idx_2              ON sku_bom (sku_id);
CREATE INDEX IF NOT EXISTS sku_bom_material_idx           ON sku_bom (raw_material_id);
CREATE INDEX IF NOT EXISTS coi_order_idx                  ON customer_order_items (customer_order_id);
CREATE INDEX IF NOT EXISTS coi_sku_idx                    ON customer_order_items (sku_id);
CREATE INDEX IF NOT EXISTS prod_orders_customer_order_idx ON production_orders (customer_order_id);
CREATE INDEX IF NOT EXISTS prod_output_order_idx          ON production_output (production_order_id);
CREATE INDEX IF NOT EXISTS po_line_items_po_idx           ON po_line_items ("poId");
