-- V006__po_ext.sql
-- Module 04: Purchase Orders — extend + add po_line_items table

ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS po_number           TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS po_date             DATE DEFAULT CURRENT_DATE;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS delivery_address    TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS expected_delivery   DATE;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS actual_delivery     DATE;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS delivery_terms      TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS payment_terms       TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS warranty_period     TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS freight_charges     NUMERIC DEFAULT 0;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS freight_terms       TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS insurance_charges   NUMERIC DEFAULT 0;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS loading_charges     NUMERIC DEFAULT 0;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS other_charges       NUMERIC DEFAULT 0;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS sub_total           NUMERIC DEFAULT 0;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS total_discount      NUMERIC DEFAULT 0;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS total_gst           NUMERIC DEFAULT 0;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS cgst_total          NUMERIC DEFAULT 0;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS sgst_total          NUMERIC DEFAULT 0;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS igst_total          NUMERIC DEFAULT 0;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS tds_section         TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS tds_amount          NUMERIC DEFAULT 0;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS other_deductions    NUMERIC DEFAULT 0;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS grand_total         NUMERIC DEFAULT 0;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS approved_by         INTEGER;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS approved_at         TIMESTAMPTZ;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS dispatched_at       TIMESTAMPTZ;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS terms_conditions    TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS notes               TEXT;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS updated_at          TIMESTAMPTZ DEFAULT NOW();

CREATE TRIGGER trg_po_updated_at
    BEFORE UPDATE ON purchase_orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- New table: PO line items (multi-material with GST auto-compute)
CREATE TABLE IF NOT EXISTS po_line_items (
    id              SERIAL PRIMARY KEY,
    po_id           INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    boq_item_id     INTEGER REFERENCES boq_items(id),
    description     TEXT NOT NULL,
    item_code       TEXT,
    hsn_code        TEXT,
    unit            TEXT NOT NULL,
    quantity        NUMERIC NOT NULL,
    rate            NUMERIC NOT NULL,
    discount_pct    NUMERIC DEFAULT 0,
    gst_rate        NUMERIC DEFAULT 18,
    taxable_amount  NUMERIC DEFAULT 0,
    cgst_amount     NUMERIC DEFAULT 0,
    sgst_amount     NUMERIC DEFAULT 0,
    igst_amount     NUMERIC DEFAULT 0,
    line_total      NUMERIC DEFAULT 0,
    remarks         TEXT,
    sort_order      INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
