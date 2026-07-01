-- 008_sales_procurement.sql — customer-order → quotation flow
-- Company-level masters (owner-scoped like projects: admin sees all, a user
-- sees only their own). Idempotent.

-- ── Customer master (who you sell to) ──
CREATE TABLE IF NOT EXISTS customers (
  id              SERIAL PRIMARY KEY,
  owner_id        INTEGER REFERENCES users(id),
  name            TEXT NOT NULL,
  gstin           TEXT,
  contact_name    TEXT,
  phone           TEXT,
  email           TEXT,
  billing_address TEXT,
  state           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── SKU / product catalog (what you sell) ──
CREATE TABLE IF NOT EXISTS skus (
  id           SERIAL PRIMARY KEY,
  owner_id     INTEGER REFERENCES users(id),
  sku_code     TEXT,
  name         TEXT NOT NULL,
  description  TEXT,
  unit         TEXT DEFAULT 'nos',
  price        REAL DEFAULT 0,
  hsn          TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Raw material master (what you buy to build SKUs) ──
CREATE TABLE IF NOT EXISTS raw_materials (
  id             SERIAL PRIMARY KEY,
  owner_id       INTEGER REFERENCES users(id),
  material_code  TEXT,
  name           TEXT NOT NULL,
  grade          TEXT,
  unit           TEXT DEFAULT 'kg',
  standard_rate  REAL DEFAULT 0,
  hsn            TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Customer order (the incoming customer PO) ──
CREATE TABLE IF NOT EXISTS customer_orders (
  id              SERIAL PRIMARY KEY,
  owner_id        INTEGER REFERENCES users(id),
  customer_id     INTEGER REFERENCES customers(id),
  order_number    TEXT,
  customer_po_ref TEXT,
  order_date      DATE,
  status          TEXT NOT NULL DEFAULT 'Open',   -- Open | In Procurement | Delivered | Closed
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customer_order_items (
  id                 SERIAL PRIMARY KEY,
  customer_order_id  INTEGER NOT NULL REFERENCES customer_orders(id) ON DELETE CASCADE,
  sku_id             INTEGER REFERENCES skus(id),
  description        TEXT NOT NULL,
  quantity           REAL,
  unit               TEXT DEFAULT 'nos',
  target_price       REAL
);

-- ── Quotation / RFQ (vendor selection: Q1/Q2/Q3) ──
CREATE TABLE IF NOT EXISTS quotations (
  id                      SERIAL PRIMARY KEY,
  owner_id                INTEGER REFERENCES users(id),
  customer_order_item_id  INTEGER REFERENCES customer_order_items(id) ON DELETE SET NULL,
  part_description        TEXT NOT NULL,
  quantity                REAL,
  unit                    TEXT DEFAULT 'nos',
  status                  TEXT NOT NULL DEFAULT 'Open',   -- Open | Selected | PO Raised
  selected_quote_id       INTEGER,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quote_lines (
  id             SERIAL PRIMARY KEY,
  quotation_id   INTEGER NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  slot           INTEGER,               -- 1=Q1, 2=Q2, 3=Q3
  vendor_id      INTEGER REFERENCES vendors(id),
  vendor_name    TEXT,
  unit_price     REAL,
  lead_time_days INTEGER,
  terms          TEXT
);

CREATE INDEX IF NOT EXISTS customers_owner_idx      ON customers(owner_id);
CREATE INDEX IF NOT EXISTS skus_owner_idx           ON skus(owner_id);
CREATE INDEX IF NOT EXISTS raw_materials_owner_idx  ON raw_materials(owner_id);
CREATE INDEX IF NOT EXISTS customer_orders_owner_idx ON customer_orders(owner_id);
CREATE INDEX IF NOT EXISTS quotations_owner_idx     ON quotations(owner_id);
