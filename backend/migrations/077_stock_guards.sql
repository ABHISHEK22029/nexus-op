-- ════════════════════════════════════════════════════════════════════
-- 077: material a job is PLANNED to use, kept apart from what was ISSUED;
--      and which product a challan line is.
--
-- 1. production_material_plan. "Make" on an order line copied the
--    product's bill of materials into production_consumption, the table
--    of material ISSUED. Nothing left stock, the cost was ₹0, and when the
--    store then issued the real material it was counted twice — one demo
--    job reads 1,600 kg issued against 800 kg used. Clicking Make is
--    planning, not the store handing metal over, so the BOM lands here
--    and the job's screen issues against it, through the stock ledger.
--
-- 2. Move the lines Make already wrote into the plan. Matched exactly:
--    not from stock, no cost, on a job started from a customer order,
--    named and sized as its product's BOM line (qty per unit × planned).
--    A line someone typed in — any line with a cost or a stock row — is
--    left where it is. No stock movement points at the moved lines: they
--    never moved stock.
--
-- 3. delivery_challan_items.sku_id. Dispatch found the stock to take
--    from by the line's text alone, so "SS Bracket 50mm" against a stock
--    row named "SS Bracket - 50 mm" made a new empty row and took that
--    below zero, while the real stock stayed on the shelf. A line now
--    carries the product it came from; the name is only a fallback.
--
-- The new column is NULL and the new table starts with the moved lines;
-- the code running before this migration ignores both. Safe to run again.
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS production_material_plan (
  id                  serial PRIMARY KEY,
  production_order_id integer NOT NULL REFERENCES production_orders(id) ON DELETE CASCADE,
  raw_material_id     integer REFERENCES raw_materials(id) ON DELETE SET NULL,
  item_name           text NOT NULL,
  planned_qty         numeric(14,4) NOT NULL DEFAULT 0,
  uom                 text DEFAULT 'kg',
  sort_order          integer DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS production_material_plan_order_idx
  ON production_material_plan (production_order_id);

WITH made AS (
  SELECT DISTINCT ON (pc.id) pc.id, pc.production_order_id, b.raw_material_id,
         pc.item_name, pc.consumed_qty, pc.uom
    FROM production_consumption pc
    JOIN production_orders po ON po.id = pc.production_order_id
    JOIN sku_bom b ON b.sku_id = po.sku_id AND b.component_name = pc.item_name
   WHERE pc.inventory_id IS NULL AND COALESCE(pc.unit_cost, 0) = 0
     AND po.customer_order_id IS NOT NULL
     AND ABS(pc.consumed_qty - ROUND((COALESCE(b.qty_per_unit, 0) * COALESCE(po.planned_qty, 0))::numeric, 2)) < 0.006
     AND NOT EXISTS (SELECT 1 FROM stock_movements m
                      WHERE m.ref_type = 'production_consumption' AND m.ref_id = pc.id)
   ORDER BY pc.id, b.id
), planned AS (
  INSERT INTO production_material_plan (production_order_id, raw_material_id, item_name, planned_qty, uom, sort_order)
  SELECT production_order_id, raw_material_id, item_name, consumed_qty, uom, id FROM made
  RETURNING id
)
DELETE FROM production_consumption WHERE id IN (SELECT id FROM made);

ALTER TABLE delivery_challan_items
  ADD COLUMN IF NOT EXISTS sku_id integer REFERENCES skus(id) ON DELETE SET NULL;
