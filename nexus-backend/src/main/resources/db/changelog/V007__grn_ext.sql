-- V007__grn_ext.sql
-- Module 05: GRN — extend from 8 fields to 25 + grn_photos table

ALTER TABLE grn ADD COLUMN IF NOT EXISTS grn_number         TEXT;
ALTER TABLE grn ADD COLUMN IF NOT EXISTS challan_number     TEXT;
ALTER TABLE grn ADD COLUMN IF NOT EXISTS challan_date       DATE;
ALTER TABLE grn ADD COLUMN IF NOT EXISTS challan_url        TEXT;
ALTER TABLE grn ADD COLUMN IF NOT EXISTS item_name          TEXT;
ALTER TABLE grn ADD COLUMN IF NOT EXISTS unit               TEXT;
ALTER TABLE grn ADD COLUMN IF NOT EXISTS accepted_quantity  NUMERIC;
ALTER TABLE grn ADD COLUMN IF NOT EXISTS rejected_quantity  NUMERIC DEFAULT 0;
ALTER TABLE grn ADD COLUMN IF NOT EXISTS shortfall_quantity NUMERIC DEFAULT 0;
ALTER TABLE grn ADD COLUMN IF NOT EXISTS rate               NUMERIC;
ALTER TABLE grn ADD COLUMN IF NOT EXISTS total_value        NUMERIC;
ALTER TABLE grn ADD COLUMN IF NOT EXISTS qc_status          TEXT DEFAULT 'Pending';
ALTER TABLE grn ADD COLUMN IF NOT EXISTS qc_remarks         TEXT;
ALTER TABLE grn ADD COLUMN IF NOT EXISTS qc_done_by         INTEGER;
ALTER TABLE grn ADD COLUMN IF NOT EXISTS weather_conditions TEXT;
ALTER TABLE grn ADD COLUMN IF NOT EXISTS updated_at         TIMESTAMPTZ DEFAULT NOW();

CREATE TRIGGER trg_grn_updated_at
    BEFORE UPDATE ON grn
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- New table: GRN photo evidence
CREATE TABLE IF NOT EXISTS grn_photos (
    id          SERIAL PRIMARY KEY,
    grn_id      INTEGER NOT NULL REFERENCES grn(id) ON DELETE CASCADE,
    photo_url   TEXT NOT NULL,
    caption     TEXT,
    uploaded_by INTEGER,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
