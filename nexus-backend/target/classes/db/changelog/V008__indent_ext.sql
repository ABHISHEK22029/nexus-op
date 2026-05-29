-- V008__indent_ext.sql
-- Module 06: Indent — extend from 7 fields to 26 fields

ALTER TABLE indents ADD COLUMN IF NOT EXISTS indent_number   TEXT;
ALTER TABLE indents ADD COLUMN IF NOT EXISTS indent_date     DATE DEFAULT CURRENT_DATE;
ALTER TABLE indents ADD COLUMN IF NOT EXISTS boq_item_id     INTEGER REFERENCES boq_items(id);
ALTER TABLE indents ADD COLUMN IF NOT EXISTS description     TEXT;
ALTER TABLE indents ADD COLUMN IF NOT EXISTS unit            TEXT;
ALTER TABLE indents ADD COLUMN IF NOT EXISTS urgency         TEXT DEFAULT 'Normal';
ALTER TABLE indents ADD COLUMN IF NOT EXISTS purpose         TEXT;
ALTER TABLE indents ADD COLUMN IF NOT EXISTS site_location   TEXT;
ALTER TABLE indents ADD COLUMN IF NOT EXISTS raised_by       INTEGER;
ALTER TABLE indents ADD COLUMN IF NOT EXISTS approved_by     INTEGER;
ALTER TABLE indents ADD COLUMN IF NOT EXISTS approved_at     TIMESTAMPTZ;
ALTER TABLE indents ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE indents ADD COLUMN IF NOT EXISTS converted_to_po INTEGER REFERENCES purchase_orders(id);
ALTER TABLE indents ADD COLUMN IF NOT EXISTS converted_at    TIMESTAMPTZ;
ALTER TABLE indents ADD COLUMN IF NOT EXISTS notes           TEXT;
ALTER TABLE indents ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ DEFAULT NOW();

CREATE TRIGGER trg_indents_updated_at
    BEFORE UPDATE ON indents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
