-- 007_production.sql — fabrication production & yield tracking (lean core)
-- Adds units/costing to inventory and the production-order loop:
--   order -> consume raw (issue from stock) -> output finished -> scrap/remnant
-- Yield, reconciliation and cost/piece are computed in the API. Idempotent.

-- 1) Inventory gains a unit, a type (raw/finished/scrap) and a unit cost.
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS uom        TEXT    DEFAULT 'nos';
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS item_type  TEXT    DEFAULT 'raw';   -- raw | finished | scrap
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS unit_cost  REAL    DEFAULT 0;

-- 2) Production order — one fabrication job.
CREATE TABLE IF NOT EXISTS production_orders (
  id            SERIAL PRIMARY KEY,
  "projectId"   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  "workOrderId" INTEGER REFERENCES work_orders(id),          -- optional
  prod_number   TEXT,                                        -- PROD-0001
  product_name  TEXT NOT NULL,
  planned_qty   REAL,
  output_uom    TEXT DEFAULT 'nos',
  status        TEXT NOT NULL DEFAULT 'Planned',             -- Planned | In Progress | Completed
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3) Consumption — raw material issued INTO the job (decrements inventory).
CREATE TABLE IF NOT EXISTS production_consumption (
  id                  SERIAL PRIMARY KEY,
  production_order_id INTEGER NOT NULL REFERENCES production_orders(id) ON DELETE CASCADE,
  inventory_id        INTEGER REFERENCES inventory(id),      -- optional link to stock item
  item_name           TEXT NOT NULL,
  consumed_qty        REAL NOT NULL,
  uom                 TEXT DEFAULT 'kg',
  unit_cost           REAL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4) Output — finished goods produced (qty + weight for yield-by-weight).
CREATE TABLE IF NOT EXISTS production_output (
  id                  SERIAL PRIMARY KEY,
  production_order_id INTEGER NOT NULL REFERENCES production_orders(id) ON DELETE CASCADE,
  item_name           TEXT NOT NULL,
  output_qty          REAL,
  uom                 TEXT DEFAULT 'nos',
  output_weight       REAL,                                  -- kg-equivalent
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5) Scrap — sellable scrap + reusable remnant + recovery value.
CREATE TABLE IF NOT EXISTS production_scrap (
  id                  SERIAL PRIMARY KEY,
  production_order_id INTEGER NOT NULL REFERENCES production_orders(id) ON DELETE CASCADE,
  scrap_type          TEXT DEFAULT 'sellable',               -- sellable | remnant
  scrap_qty           REAL NOT NULL,
  uom                 TEXT DEFAULT 'kg',
  reason              TEXT,
  sale_value          REAL DEFAULT 0,
  is_sold             BOOLEAN DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS prod_orders_project_idx ON production_orders("projectId");
CREATE INDEX IF NOT EXISTS prod_cons_order_idx     ON production_consumption(production_order_id);
CREATE INDEX IF NOT EXISTS prod_out_order_idx      ON production_output(production_order_id);
CREATE INDEX IF NOT EXISTS prod_scrap_order_idx    ON production_scrap(production_order_id);
