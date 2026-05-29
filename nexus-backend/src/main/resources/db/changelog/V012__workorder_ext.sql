-- V012__workorder_ext.sql
-- Module 10: Work Orders — extend from 8 fields to 23 fields

ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS wo_number           TEXT;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS wo_type             TEXT;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS mobilisation_advance NUMERIC DEFAULT 0;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS advance_recovery_pct NUMERIC DEFAULT 0;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS retention_pct       NUMERIC DEFAULT 5;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS total_billed        NUMERIC DEFAULT 0;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS balance             NUMERIC;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS completion_pct      NUMERIC DEFAULT 0;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS termination_reason  TEXT;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS document_url        TEXT;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS created_by          INTEGER;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS updated_at          TIMESTAMPTZ DEFAULT NOW();

CREATE TRIGGER trg_workorder_updated_at
    BEFORE UPDATE ON work_orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- New table: BOQ items in scope for each work order
CREATE TABLE IF NOT EXISTS wo_boq_scope (
    id          SERIAL PRIMARY KEY,
    wo_id       INTEGER NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    boq_item_id INTEGER NOT NULL REFERENCES boq_items(id),
    UNIQUE(wo_id, boq_item_id)
);
