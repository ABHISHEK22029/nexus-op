-- V009__boq_ext.sql
-- Module 07: BOQ — extend from 6 fields to 20 fields

ALTER TABLE boq_items ADD COLUMN IF NOT EXISTS work_order_id     INTEGER REFERENCES work_orders(id);
ALTER TABLE boq_items ADD COLUMN IF NOT EXISTS parent_item_id    INTEGER REFERENCES boq_items(id);
ALTER TABLE boq_items ADD COLUMN IF NOT EXISTS item_category     TEXT;
ALTER TABLE boq_items ADD COLUMN IF NOT EXISTS executed_qty      NUMERIC DEFAULT 0;
ALTER TABLE boq_items ADD COLUMN IF NOT EXISTS billed_qty        NUMERIC DEFAULT 0;
ALTER TABLE boq_items ADD COLUMN IF NOT EXISTS balance_qty       NUMERIC;
ALTER TABLE boq_items ADD COLUMN IF NOT EXISTS progress_pct      NUMERIC DEFAULT 0;
ALTER TABLE boq_items ADD COLUMN IF NOT EXISTS estimated_amount  NUMERIC;
ALTER TABLE boq_items ADD COLUMN IF NOT EXISTS executed_amount   NUMERIC DEFAULT 0;
ALTER TABLE boq_items ADD COLUMN IF NOT EXISTS balance_amount    NUMERIC;
ALTER TABLE boq_items ADD COLUMN IF NOT EXISTS remarks           TEXT;
ALTER TABLE boq_items ADD COLUMN IF NOT EXISTS sort_order        INTEGER DEFAULT 0;
ALTER TABLE boq_items ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMPTZ DEFAULT NOW();

CREATE TRIGGER trg_boq_updated_at
    BEFORE UPDATE ON boq_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
