-- ════════════════════════════════════════════════════════════════════
-- 075: a purchase order line can say WHICH material or product it is.
--
-- A PO line was only typed text, and a goods receipt found its material
-- and its stock row by matching that text. "MS Plate 10 mm" against
-- "MS Plate 10mm" matched nothing, so the receipt opened a second stock
-- row and the shortage check could not see that stock. The PO screen now
-- picks the item; the line keeps the link and the receipt uses it.
--
-- Existing lines are linked where their description names exactly one of
-- the company's materials (or, failing that, exactly one of its products),
-- compared the way a receipt compares names. Ambiguous ones stay unlinked.
-- Safe to run again.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE po_line_items
  ADD COLUMN IF NOT EXISTS raw_material_id integer REFERENCES raw_materials(id) ON DELETE SET NULL;
ALTER TABLE po_line_items
  ADD COLUMN IF NOT EXISTS sku_id integer REFERENCES skus(id) ON DELETE SET NULL;

WITH hit AS (
  SELECT li.id AS line_id, MIN(rm.id) AS ref_id, COUNT(*) AS n
    FROM po_line_items li
    JOIN purchase_orders po ON po.id = li."poId"
    JOIN raw_materials rm
      ON rm.owner_id = po.owner_id
     AND btrim(regexp_replace(lower(translate(rm.name, '×X', 'xx')), '[^a-z0-9]+', ' ', 'g'))
       = btrim(regexp_replace(lower(translate(li.description, '×X', 'xx')), '[^a-z0-9]+', ' ', 'g'))
   WHERE li.raw_material_id IS NULL AND li.sku_id IS NULL
   GROUP BY li.id
)
UPDATE po_line_items li SET raw_material_id = hit.ref_id
  FROM hit WHERE li.id = hit.line_id AND hit.n = 1;

WITH hit AS (
  SELECT li.id AS line_id, MIN(s.id) AS ref_id, COUNT(*) AS n
    FROM po_line_items li
    JOIN purchase_orders po ON po.id = li."poId"
    JOIN skus s
      ON s.owner_id = po.owner_id
     AND btrim(regexp_replace(lower(translate(s.name, '×X', 'xx')), '[^a-z0-9]+', ' ', 'g'))
       = btrim(regexp_replace(lower(translate(li.description, '×X', 'xx')), '[^a-z0-9]+', ' ', 'g'))
   WHERE li.raw_material_id IS NULL AND li.sku_id IS NULL
   GROUP BY li.id
)
UPDATE po_line_items li SET sku_id = hit.ref_id
  FROM hit WHERE li.id = hit.line_id AND hit.n = 1;

CREATE INDEX IF NOT EXISTS po_line_items_raw_material_idx ON po_line_items (raw_material_id);
CREATE INDEX IF NOT EXISTS po_line_items_sku_idx ON po_line_items (sku_id);
