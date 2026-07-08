-- 022_delivery_challans.sql — Wave 1C: delivery challan / dispatch note
-- The goods-out document to the customer, between production/GRN and the
-- invoice. Carries the value of goods (feeds the e-way bill in Wave 2). Idempotent.
CREATE TABLE IF NOT EXISTS delivery_challans (
  id                SERIAL PRIMARY KEY,
  owner_id          INTEGER REFERENCES users(id),
  customer_id       INTEGER REFERENCES customers(id),
  customer_order_id INTEGER,
  challan_number    TEXT,
  challan_date      DATE,
  dispatch_through  TEXT,          -- transporter
  vehicle_no        TEXT,
  lr_no             TEXT,          -- lorry receipt / docket no.
  place_of_supply   TEXT,
  total_value       REAL DEFAULT 0,  -- value of goods (for the e-way bill)
  status            TEXT NOT NULL DEFAULT 'Draft',  -- Draft | Dispatched | Delivered
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS delivery_challan_items (
  id                  SERIAL PRIMARY KEY,
  delivery_challan_id INTEGER NOT NULL REFERENCES delivery_challans(id) ON DELETE CASCADE,
  description         TEXT NOT NULL,
  hsn                 TEXT,
  uom                 TEXT DEFAULT 'nos',
  quantity            REAL DEFAULT 0,
  rate                REAL DEFAULT 0,
  amount              REAL DEFAULT 0,
  sort_order          INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS delivery_challans_owner_idx ON delivery_challans(owner_id);
