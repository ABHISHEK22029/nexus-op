-- 010_po_gst.sql — user-entered GST rate on a Purchase Order (no hardcoding)
-- The PO invoice computes tax from this value; intra/inter is derived from
-- the vendor vs company GSTIN (shared with the GRN bill). Idempotent.
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS gst_rate REAL DEFAULT 18;
