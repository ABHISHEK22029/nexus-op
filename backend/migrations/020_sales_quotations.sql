-- 020_sales_quotations.sql — Wave 1A: customer-facing quotations → order
-- The front of the sales funnel: quote the customer, then convert a won quote
-- into a Customer Order. Idempotent.
CREATE TABLE IF NOT EXISTS sales_quotations (
  id                SERIAL PRIMARY KEY,
  owner_id          INTEGER REFERENCES users(id),
  customer_id       INTEGER REFERENCES customers(id),
  quote_number      TEXT,
  quote_date        DATE,
  valid_until       DATE,
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
  amount_in_words   TEXT,
  status            TEXT NOT NULL DEFAULT 'Draft',   -- Draft | Sent | Accepted | Rejected | Converted
  converted_order_id INTEGER,
  notes             TEXT,
  terms             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS sales_quotation_items (
  id                 SERIAL PRIMARY KEY,
  sales_quotation_id INTEGER NOT NULL REFERENCES sales_quotations(id) ON DELETE CASCADE,
  sku_id             INTEGER,
  description        TEXT NOT NULL,
  hsn                TEXT,
  uom                TEXT DEFAULT 'nos',
  quantity           REAL DEFAULT 0,
  rate               REAL DEFAULT 0,
  amount             REAL DEFAULT 0,
  sort_order         INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS sales_quotations_owner_idx ON sales_quotations(owner_id);
