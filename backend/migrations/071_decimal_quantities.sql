-- 071 — quantities can have decimals
--
-- Steel is bought and held by weight: 12.5 kg, 2.75 MT, 0.5 kg issued to a
-- job. These five columns were created INTEGER in the first schema and were
-- missed by 066 (which converted the REAL columns), so any such quantity was
-- refused with "invalid input syntax for type integer" — opening stock, a
-- PO, a count, an issue to production, a goods receipt, and the Excel stock
-- upload's save. NUMERIC(18,4), as every other quantity already is.
--
-- Whole numbers are unchanged by the conversion; nothing depends on these
-- columns being integers (no views, no integer-only constraints).

ALTER TABLE inventory      ALTER COLUMN quantity            TYPE NUMERIC(18,4) USING quantity::numeric;
ALTER TABLE purchase_orders ALTER COLUMN quantity           TYPE NUMERIC(18,4) USING quantity::numeric;
ALTER TABLE grn            ALTER COLUMN "receivedQuantity"  TYPE NUMERIC(18,4) USING "receivedQuantity"::numeric;
ALTER TABLE boq_items      ALTER COLUMN "estimatedQuantity" TYPE NUMERIC(18,4) USING "estimatedQuantity"::numeric;
ALTER TABLE indents        ALTER COLUMN "requestedQuantity" TYPE NUMERIC(18,4) USING "requestedQuantity"::numeric;
