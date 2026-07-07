-- 016_bom.sql — Phase 1: Bill of Materials + production from a customer order
-- Idempotent.
CREATE TABLE IF NOT EXISTS sku_bom (
  id              SERIAL PRIMARY KEY,
  sku_id          INTEGER NOT NULL REFERENCES skus(id) ON DELETE CASCADE,
  raw_material_id INTEGER REFERENCES raw_materials(id),
  component_name  TEXT NOT NULL,
  qty_per_unit    REAL DEFAULT 0,
  uom             TEXT DEFAULT 'kg'
);
CREATE INDEX IF NOT EXISTS sku_bom_sku_idx ON sku_bom(sku_id);

-- Trace a production order back to the customer order / SKU it fulfils.
ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS customer_order_id INTEGER;
ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS sku_id INTEGER;
