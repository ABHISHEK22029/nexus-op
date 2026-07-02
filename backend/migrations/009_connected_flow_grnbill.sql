-- 009_connected_flow_grnbill.sql — connect the flow + customizable GRN bills
-- Idempotent.

-- ── Traceability: a Vendor PO can trace back to the customer order + quotation ──
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS customer_order_id INTEGER REFERENCES customer_orders(id);
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS quotation_id      INTEGER REFERENCES quotations(id);

-- ── Customizable GRN bill (the vendor invoice you record when goods arrive) ──
CREATE TABLE IF NOT EXISTS grn_bills (
  id              SERIAL PRIMARY KEY,
  "projectId"     INTEGER,
  grn_id          INTEGER REFERENCES grn(id),
  po_id           INTEGER REFERENCES purchase_orders(id),
  vendor_id       INTEGER REFERENCES vendors(id),
  bill_number     TEXT,
  vendor_bill_ref TEXT,
  bill_date       DATE,
  sub_total       REAL DEFAULT 0,
  freight         REAL DEFAULT 0,
  other_charges   REAL DEFAULT 0,
  discount        REAL DEFAULT 0,
  gst_rate        REAL DEFAULT 18,
  interstate      BOOLEAN DEFAULT FALSE,
  cgst            REAL DEFAULT 0,
  sgst            REAL DEFAULT 0,
  igst            REAL DEFAULT 0,
  gst_total       REAL DEFAULT 0,
  round_off       REAL DEFAULT 0,
  net_amount      REAL DEFAULT 0,
  amount_in_words TEXT,
  notes           TEXT,
  status          TEXT NOT NULL DEFAULT 'Draft',   -- Draft | Approved | Paid
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS grn_bill_items (
  id           SERIAL PRIMARY KEY,
  grn_bill_id  INTEGER NOT NULL REFERENCES grn_bills(id) ON DELETE CASCADE,
  description  TEXT NOT NULL,
  hsn          TEXT,
  uom          TEXT DEFAULT 'nos',
  quantity     REAL DEFAULT 0,
  rate         REAL DEFAULT 0,
  amount       REAL DEFAULT 0,
  sort_order   INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS grn_bills_grn_idx ON grn_bills(grn_id);
CREATE INDEX IF NOT EXISTS grn_bills_project_idx ON grn_bills("projectId");
