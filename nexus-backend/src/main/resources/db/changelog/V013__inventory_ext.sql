-- V013__inventory_ext.sql
-- Module 11: Inventory — extend from 4 fields to 18 + movements table

ALTER TABLE inventory ADD COLUMN IF NOT EXISTS item_code        TEXT;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS boq_item_id      INTEGER REFERENCES boq_items(id);
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS category         TEXT;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS opening_qty      NUMERIC DEFAULT 0;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS received_qty     NUMERIC DEFAULT 0;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS consumed_qty     NUMERIC DEFAULT 0;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS adjustment_qty   NUMERIC DEFAULT 0;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS balance_qty      NUMERIC DEFAULT 0;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS reorder_level    NUMERIC;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS max_stock        NUMERIC;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS last_grn_date    DATE;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS avg_rate         NUMERIC;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS stock_value      NUMERIC;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS storage_location TEXT;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ DEFAULT NOW();

CREATE TRIGGER trg_inventory_updated_at
    BEFORE UPDATE ON inventory
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- New table: Every stock movement (in/out audit trail)
CREATE TABLE IF NOT EXISTS inventory_movements (
    id          SERIAL PRIMARY KEY,
    inventory_id INTEGER NOT NULL REFERENCES inventory(id),
    project_id  INTEGER REFERENCES projects(id),
    move_type   TEXT NOT NULL,
    -- move_type: 'GRN' | 'Consumption' | 'Transfer' | 'Adjustment' | 'Return'
    quantity    NUMERIC NOT NULL,
    ref_type    TEXT,
    -- ref_type: 'grn' | 'mb_entry' | 'transfer' | 'manual'
    ref_id      INTEGER,
    remarks     TEXT,
    created_by  INTEGER,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inv_movements_inventory
    ON inventory_movements(inventory_id, created_at DESC);
