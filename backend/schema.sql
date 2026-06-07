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
  status TEXT
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
  "workOrderId" INTEGER NOT NULL,
  "vendorId" INTEGER NOT NULL,
  "itemName" TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  "indentId" INTEGER,
  status TEXT DEFAULT 'Pending' CHECK(status IN ('Pending', 'Approved', 'Dispatched', 'Delivered'))
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
-- SEED DATA
-- ═══════════════════════════════════════════════════════════

-- Projects
INSERT INTO projects (name, "clientName", type, "startDate", "endDate", status) VALUES
  ('ORR Package 1 (SW)', 'HMDA', 'construction', '2025-01-01', '2026-12-31', 'Active'),
  ('Generic Procurement IT', 'Internal', 'generic', '2025-03-01', '2025-09-01', 'Active');

-- Vendors
INSERT INTO vendors ("projectId", name, type, pan, gstin, class, capability_tags, rating, status) VALUES
  (1, 'Larsen & Toubro', 'Civil', 'ABCDE0000F', '36ABCDE0000F1Z5', 'Special', 'Structures, Earthworks', 95, 'Active'),
  (1, 'NCC Limited', 'Civil', 'ABCDE0001F', '36ABCDE0001F1Z5', 'Special', 'Structures, Earthworks', 95, 'Active'),
  (1, 'Megha Engg', 'Civil', 'ABCDE0002F', '36ABCDE0002F1Z5', 'Special', 'Structures, Earthworks', 95, 'Active'),
  (1, 'Dilip Buildcon', 'Civil', 'ABCDE0003F', '36ABCDE0003F1Z5', 'Special', 'Structures, Earthworks', 95, 'Active'),
  (1, 'Afcons', 'Civil', 'ABCDE0004F', '36ABCDE0004F1Z5', 'Special', 'Structures, Earthworks', 95, 'Active'),
  (1, 'Navayuga', 'Civil', 'ABCDE0005F', '36ABCDE0005F1Z5', 'Special', 'Structures, Earthworks', 95, 'Active'),
  (2, 'Dell EMC', 'IT Hardware', 'XYZ1234', 'GST1234', 'A', 'Servers', 99, 'Active');

-- Work Orders
INSERT INTO work_orders ("projectId", "vendorId", name, "boqId", "startDate", "endDate", "contractValue", status) VALUES
  (1, 1, 'WO-001: Earthworks and Embankment SW', 1, '2025-02-01', '2025-10-01', 50000000, 'In Progress'),
  (1, 2, 'WO-002: Bituminous Paving & DBM', 2, '2025-05-01', '2026-05-01', 120000000, 'In Progress'),
  (2, 7, 'WO-003: Core Server Replacement', NULL, '2025-03-15', '2025-04-15', 5000000, 'Pending');

-- Milestones
INSERT INTO milestones ("workOrderId", name, "plannedPercent", "actualPercent", status) VALUES
  (1, 'Site Clearance', 100, 100, 'Completed'),
  (1, 'Sub-grade Compaction', 80, 60, 'Delayed'),
  (2, 'DBM Layer 1', 50, 45, 'On Track');

-- BOQ Items
INSERT INTO boq_items ("projectId", "itemCode", description, unit, "estimatedQuantity", rate) VALUES
  (1, 'EW-01', 'Earthwork in excavation for roadway', 'Cum', 150000, 85),
  (1, 'BT-03', 'Dense Bituminous Macadam (DBM) 50mm thick', 'Cum', 22500, 8500);

-- Purchase Orders
INSERT INTO purchase_orders ("projectId", "workOrderId", "vendorId", "itemName", quantity, status) VALUES
  (1, 1, 1, 'Earthwork Material', 50000, 'Delivered'),
  (1, 2, 2, 'Bitumen VG-30', 2000, 'Dispatched'),
  (2, 3, 7, 'Dell PowerEdge R740', 10, 'Approved');

-- Measurement Book
INSERT INTO measurement_book ("projectId", "workOrderId", "boqId", chainage, length, width, depth, "measuredQuantity") VALUES
  (1, 1, 1, 'CH 10+500', 100, 15, 2, 3000),
  (1, 1, 1, 'CH 10+600', 150, 15, 2, 4500);

-- Bills
INSERT INTO bills ("projectId", "workOrderId", "grossAmount", tds, retention, "netAmount", "billedQuantity", status) VALUES
  (1, 1, 255000, 5100, 12750, 237150, 3000, 'Paid');
