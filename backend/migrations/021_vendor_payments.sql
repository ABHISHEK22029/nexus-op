-- 021_vendor_payments.sql — Wave 1B: Accounts Payable (vendor payments)
-- Pay against GRN bills (the actual vendor bill); track outstanding + ageing.
-- Mirror of the customer side (sales_invoices + sales_payments). Idempotent.
ALTER TABLE grn_bills ADD COLUMN IF NOT EXISTS amount_paid    REAL NOT NULL DEFAULT 0;
ALTER TABLE grn_bills ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'Unpaid';  -- Unpaid | Partially Paid | Paid
ALTER TABLE grn_bills ADD COLUMN IF NOT EXISTS due_date       DATE;

CREATE TABLE IF NOT EXISTS vendor_payments (
  id           SERIAL PRIMARY KEY,
  grn_bill_id  INTEGER NOT NULL REFERENCES grn_bills(id) ON DELETE CASCADE,
  amount       REAL NOT NULL,
  mode         TEXT,          -- Cash | Bank | UPI | Cheque | NEFT
  reference    TEXT,
  paid_date    DATE,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS vendor_payments_bill_idx ON vendor_payments(grn_bill_id);
