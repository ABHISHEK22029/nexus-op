-- V010__mb_ext.sql
-- Module 08: Measurement Book — extend from 8 fields to 29 + mb_photos table

ALTER TABLE mb_entries ADD COLUMN IF NOT EXISTS mb_number        TEXT;
ALTER TABLE mb_entries ADD COLUMN IF NOT EXISTS mb_date          DATE DEFAULT CURRENT_DATE;
ALTER TABLE mb_entries ADD COLUMN IF NOT EXISTS measurement_type TEXT DEFAULT 'Running';
ALTER TABLE mb_entries ADD COLUMN IF NOT EXISTS item_description TEXT;
ALTER TABLE mb_entries ADD COLUMN IF NOT EXISTS unit             TEXT;
ALTER TABLE mb_entries ADD COLUMN IF NOT EXISTS no_of_items      NUMERIC DEFAULT 1;
ALTER TABLE mb_entries ADD COLUMN IF NOT EXISTS rate             NUMERIC;
ALTER TABLE mb_entries ADD COLUMN IF NOT EXISTS amount           NUMERIC;
ALTER TABLE mb_entries ADD COLUMN IF NOT EXISTS cumulative_qty   NUMERIC DEFAULT 0;
ALTER TABLE mb_entries ADD COLUMN IF NOT EXISTS cumulative_amount NUMERIC DEFAULT 0;
ALTER TABLE mb_entries ADD COLUMN IF NOT EXISTS previous_qty     NUMERIC DEFAULT 0;
ALTER TABLE mb_entries ADD COLUMN IF NOT EXISTS current_qty      NUMERIC DEFAULT 0;
ALTER TABLE mb_entries ADD COLUMN IF NOT EXISTS status           TEXT DEFAULT 'Draft';
ALTER TABLE mb_entries ADD COLUMN IF NOT EXISTS submitted_by     INTEGER;
ALTER TABLE mb_entries ADD COLUMN IF NOT EXISTS approved_by      INTEGER;
ALTER TABLE mb_entries ADD COLUMN IF NOT EXISTS approved_at      TIMESTAMPTZ;
ALTER TABLE mb_entries ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE mb_entries ADD COLUMN IF NOT EXISTS is_billed        BOOLEAN DEFAULT FALSE;
ALTER TABLE mb_entries ADD COLUMN IF NOT EXISTS reference_mb_id  INTEGER;
ALTER TABLE mb_entries ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ DEFAULT NOW();

CREATE TRIGGER trg_mb_updated_at
    BEFORE UPDATE ON mb_entries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- New table: MB progress photos
CREATE TABLE IF NOT EXISTS mb_photos (
    id          SERIAL PRIMARY KEY,
    mb_id       INTEGER NOT NULL REFERENCES mb_entries(id) ON DELETE CASCADE,
    photo_url   TEXT NOT NULL,
    caption     TEXT,
    chainage    TEXT,
    uploaded_by INTEGER,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
