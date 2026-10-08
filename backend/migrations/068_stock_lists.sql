-- 068 — stock lists, and an item code on a stock row
--
-- A business can hold the same item in more than one place: the main store,
-- a site store, a second godown. Uploading a stock sheet for one of those
-- must not overwrite the counts of another, so a stock row can now belong
-- to a named list. NULL is the main stock, which is where every row lives
-- today and where goods receipts, production and dispatch keep moving stock.
--
-- Shortfalls add a material up across every list (MaterialRequirements
-- already sums by raw_material_id), so a second list is stock you hold,
-- not stock the engine cannot see.
--
-- item_code keeps the code a sheet gave an item, so the next upload of the
-- same sheet matches on the code rather than on a name someone retyped.

CREATE TABLE IF NOT EXISTS stock_lists (
  id          SERIAL PRIMARY KEY,
  owner_id    INTEGER NOT NULL REFERENCES users(id),
  name        TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 60),
  created_by  INTEGER REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS stock_lists_owner_name_uidx ON stock_lists (owner_id, LOWER(btrim(name)));

ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS stock_list_id INTEGER REFERENCES stock_lists(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS item_code     TEXT;

CREATE INDEX IF NOT EXISTS inventory_stock_list_idx ON inventory (stock_list_id);
CREATE INDEX IF NOT EXISTS inventory_owner_code_idx ON inventory (owner_id, LOWER(item_code)) WHERE item_code IS NOT NULL;

-- One row per sheet applied. upload_ref is made by the browser before the
-- click, so a double-click or a retry after a timeout cannot apply the same
-- sheet twice — which in "add to stock" mode would double every quantity.
-- The stock movements it made point back here (ref_type 'stock_upload').
CREATE TABLE IF NOT EXISTS stock_uploads (
  id              SERIAL PRIMARY KEY,
  owner_id        INTEGER NOT NULL REFERENCES users(id),
  upload_ref      TEXT NOT NULL,
  file_name       TEXT,
  stock_list_id   INTEGER REFERENCES stock_lists(id) ON DELETE SET NULL,
  mode            TEXT CHECK (mode IN ('set', 'add')),
  created_items   INTEGER NOT NULL DEFAULT 0,
  updated_items   INTEGER NOT NULL DEFAULT 0,
  unchanged_items INTEGER NOT NULL DEFAULT 0,
  skipped_rows    INTEGER NOT NULL DEFAULT 0,
  created_by      INTEGER REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_id, upload_ref)
);
