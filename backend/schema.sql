-- ═══════════════════════════════════════════════════════════
-- Nexus-OP: PostgreSQL Schema for Supabase
-- Run this ONCE in Supabase SQL Editor (or via psql)
-- ═══════════════════════════════════════════════════════════

-- 1. Projects
CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  "clientName" TEXT NOT NULL,
  type TEXT NOT NULL,
  "startDate" TEXT,
  "endDate" TEXT,
  status TEXT
);

-- 2. Work Orders
CREATE TABLE IF NOT EXISTS work_orders (
  id SERIAL PRIMARY KEY,
  "projectId" INTEGER NOT NULL REFERENCES projects(id),
  "vendorId" INTEGER NOT NULL,
  name TEXT NOT NULL,
  "boqId" INTEGER,
  "startDate" TEXT,
  "endDate" TEXT,
  "contractValue" REAL,
  status TEXT
);

-- 3. Milestones
CREATE TABLE IF NOT EXISTS milestones (
  id SERIAL PRIMARY KEY,
  "workOrderId" INTEGER NOT NULL REFERENCES work_orders(id),
  name TEXT NOT NULL,
  "plannedPercent" REAL,
  "actualPercent" REAL,
  remarks TEXT,
  status TEXT
);

-- 4. Vendors
CREATE TABLE IF NOT EXISTS vendors (
  id SERIAL PRIMARY KEY,
  "projectId" INTEGER REFERENCES projects(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  pan TEXT,
  gstin TEXT,
  class TEXT,
  capability_tags TEXT,
  rating INTEGER,
  status TEXT,
  address TEXT,
  "contactName" TEXT,
  "contactPhone" TEXT,
  "contactEmail" TEXT
);

-- 5. Inventory
CREATE TABLE IF NOT EXISTS inventory (
  id SERIAL PRIMARY KEY,
  "projectId" INTEGER NOT NULL REFERENCES projects(id),
  "itemName" TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0
);

-- 6. Purchase Orders
CREATE TABLE IF NOT EXISTS purchase_orders (
  id SERIAL PRIMARY KEY,
  "projectId" INTEGER NOT NULL REFERENCES projects(id),
  "workOrderId" INTEGER,
  "vendorId" INTEGER NOT NULL,
  "itemName" TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  "unitPrice" REAL,
  "poNumber" TEXT,
  "quoteRef" TEXT,
  "paymentTerms" TEXT,
  "priceBasis" TEXT DEFAULT 'Ex Works',
  "pnfInsurance" TEXT DEFAULT 'Vendor Scope',
  "loadingScope" TEXT DEFAULT 'Buyer Scope',
  "warranty" TEXT DEFAULT '12 months',
  "amountInWords" TEXT,
  "indentId" INTEGER,
  status TEXT DEFAULT 'Pending' CHECK(status IN ('Pending', 'Approved', 'Dispatched', 'Delivered')),
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

-- 6b. PO Line Items
CREATE TABLE IF NOT EXISTS po_line_items (
  id SERIAL PRIMARY KEY,
  "poId" INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  sno INTEGER NOT NULL,
  description TEXT NOT NULL,
  uom TEXT NOT NULL DEFAULT 'No''s',
  hsn TEXT,
  quantity REAL NOT NULL,
  "unitPrice" REAL NOT NULL
);

-- 6c. Company Profile
-- Identity belongs to whoever installs this, and is asked for on first run.
--
-- Every column here once defaulted to one specific customer's real details —
-- name, address, phone, email, GSTIN and PAN. A fresh install inherited all
-- of it, so a different business issued tax invoices under someone else's
-- GST number from its very first invoice. Migration 041 removed those
-- defaults from the live database; leaving them here would have recreated
-- the whole problem on the next deployment built from this file.
--
-- fyStart stays: the Indian financial year starts in April for everyone.
CREATE TABLE IF NOT EXISTS company_profile (
  id SERIAL PRIMARY KEY,
  name TEXT,
  "tradeName" TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  gstin TEXT,
  pan TEXT,
  "stateCode" TEXT,
  "fyStart" TEXT DEFAULT 'April',
  -- Prefix for document numbers (PO/INV/DC). Blank derives it from the
  -- trade name — see shared/docNumber.js.
  doc_prefix TEXT,
  employee_count TEXT,
  setup_completed_at TIMESTAMPTZ
);

-- 7. Activities
CREATE TABLE IF NOT EXISTS activities (
  id SERIAL PRIMARY KEY,
  "projectId" INTEGER,
  description TEXT NOT NULL,
  type TEXT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- 8. BOQ Items
CREATE TABLE IF NOT EXISTS boq_items (
  id SERIAL PRIMARY KEY,
  "projectId" INTEGER NOT NULL REFERENCES projects(id),
  "itemCode" TEXT NOT NULL,
  description TEXT NOT NULL,
  unit TEXT NOT NULL,
  "estimatedQuantity" INTEGER NOT NULL,
  rate REAL NOT NULL
);

-- 9. Indents
CREATE TABLE IF NOT EXISTS indents (
  id SERIAL PRIMARY KEY,
  "projectId" INTEGER NOT NULL,
  "workOrderId" INTEGER NOT NULL,
  "boqId" INTEGER NOT NULL,
  "requestedQuantity" INTEGER NOT NULL,
  "requiredDate" TEXT,
  chainage TEXT,
  status TEXT DEFAULT 'Pending'
);

-- 10. Measurement Book
CREATE TABLE IF NOT EXISTS measurement_book (
  id SERIAL PRIMARY KEY,
  "projectId" INTEGER NOT NULL,
  "workOrderId" INTEGER NOT NULL,
  "boqId" INTEGER NOT NULL,
  chainage TEXT,
  length REAL,
  width REAL,
  depth REAL,
  "measuredQuantity" REAL NOT NULL,
  date TIMESTAMPTZ DEFAULT NOW()
);

-- 11. GRN
CREATE TABLE IF NOT EXISTS grn (
  id SERIAL PRIMARY KEY,
  "projectId" INTEGER NOT NULL,
  "workOrderId" INTEGER NOT NULL,
  "poId" INTEGER NOT NULL,
  "vehicleNumber" TEXT,
  "batchNumber" TEXT,
  chainage TEXT,
  "receivedQuantity" INTEGER NOT NULL,
  date TIMESTAMPTZ DEFAULT NOW()
);

-- 12. RA Bills
CREATE TABLE IF NOT EXISTS bills (
  id SERIAL PRIMARY KEY,
  "projectId" INTEGER NOT NULL,
  "workOrderId" INTEGER NOT NULL,
  "grossAmount" REAL NOT NULL,
  tds REAL NOT NULL,
  retention REAL NOT NULL,
  "netAmount" REAL NOT NULL,
  "billedQuantity" REAL NOT NULL DEFAULT 0,
  status TEXT DEFAULT 'Draft' CHECK(status IN ('Draft', 'Under Review', 'Approved', 'Paid')),
  date TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════
-- No seed data here on purpose.
--
-- This file used to end by inserting a specific construction project
-- ("ORR Package 1 (SW)" for HMDA), six named civil contractors and their
-- work orders — so every fresh install of this product came up as somebody
-- else's business, in an industry it might have nothing to do with.
--
-- Structure is not sample data. If you want something to look at, run
-- seed_sample.sql, or load a realistic dataset with
-- scripts/seed-org.js --org=<name>.
-- ═══════════════════════════════════════════════════════════
