-- 012_sales_invoices.sql — close the sell side: customer tax invoice + payments
-- Mirrors the GRN bill (vendor side) but for money coming IN. Idempotent.
CREATE TABLE IF NOT EXISTS sales_invoices (
  id                SERIAL PRIMARY KEY,
  owner_id          INTEGER REFERENCES users(id),
  customer_id       INTEGER REFERENCES customers(id),
  customer_order_id INTEGER REFERENCES customer_orders(id),
  invoice_number    TEXT,
  invoice_date      DATE,
  sub_total         REAL DEFAULT 0,
  discount          REAL DEFAULT 0,
  gst_rate          REAL DEFAULT 18,
  interstate        BOOLEAN DEFAULT FALSE,
  cgst              REAL DEFAULT 0,
  sgst              REAL DEFAULT 0,
  igst              REAL DEFAULT 0,
  gst_total         REAL DEFAULT 0,
  round_off         REAL DEFAULT 0,
  net_amount        REAL DEFAULT 0,
  amount_paid       REAL DEFAULT 0,
  amount_in_words   TEXT,
  notes             TEXT,
  status            TEXT NOT NULL DEFAULT 'Draft',   -- Draft | Sent | Partially Paid | Paid
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales_invoice_items (
  id                SERIAL PRIMARY KEY,
  sales_invoice_id  INTEGER NOT NULL REFERENCES sales_invoices(id) ON DELETE CASCADE,
  description       TEXT NOT NULL,
  hsn               TEXT,
  uom               TEXT DEFAULT 'nos',
  quantity          REAL DEFAULT 0,
  rate              REAL DEFAULT 0,
  amount            REAL DEFAULT 0,
  sort_order        INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sales_payments (
  id                SERIAL PRIMARY KEY,
  sales_invoice_id  INTEGER NOT NULL REFERENCES sales_invoices(id) ON DELETE CASCADE,
  amount            REAL NOT NULL,
  mode              TEXT,          -- Cash | Bank | UPI | Cheque
  reference         TEXT,
  paid_date         DATE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sales_inv_owner_idx ON sales_invoices(owner_id);
CREATE INDEX IF NOT EXISTS sales_inv_customer_idx ON sales_invoices(customer_id);
