-- V011__bills_state.sql
-- Module 09: RA Bills — CRITICAL FIX
-- Extends bills table + adds state machine columns + bill_mb_items table

ALTER TABLE bills ADD COLUMN IF NOT EXISTS bill_number         TEXT;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS bill_date           DATE DEFAULT CURRENT_DATE;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS period_from         DATE;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS period_to           DATE;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS ra_number           INTEGER;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS gross_amount        NUMERIC DEFAULT 0;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS cumulative_previous NUMERIC DEFAULT 0;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS current_amount      NUMERIC DEFAULT 0;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS retention_amount    NUMERIC DEFAULT 0;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS advance_recovery    NUMERIC DEFAULT 0;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS tds_section         TEXT;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS tds_amount          NUMERIC DEFAULT 0;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS other_deductions    NUMERIC DEFAULT 0;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS deduction_reason    TEXT;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS net_payable         NUMERIC DEFAULT 0;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS submitted_at        TIMESTAMPTZ;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS submitted_by        INTEGER;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS approved_by         INTEGER;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS approved_at         TIMESTAMPTZ;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS rejection_reason    TEXT;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS payment_mode        TEXT;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS payment_reference   TEXT;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS paid_at             TIMESTAMPTZ;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS pdf_url             TEXT;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS updated_at          TIMESTAMPTZ DEFAULT NOW();

-- Normalize status values to consistent naming
-- Old status: 'Draft', 'Under Review', 'Approved', 'Paid'
-- New status: 'Draft', 'Submitted', 'Finance Approved', 'Paid', 'Rejected'
CREATE TRIGGER trg_bills_updated_at
    BEFORE UPDATE ON bills
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- New table: which MB entries are included in each bill
CREATE TABLE IF NOT EXISTS bill_mb_items (
    id          SERIAL PRIMARY KEY,
    bill_id     INTEGER NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
    mb_id       INTEGER NOT NULL REFERENCES mb_entries(id),
    amount      NUMERIC NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
