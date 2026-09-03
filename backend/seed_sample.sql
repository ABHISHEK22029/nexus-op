-- Sample data — OPTIONAL.
--
-- Split out of schema.sql, which used to insert all of this on every fresh
-- deployment. Load it only if you want a populated demo. It describes a road
-- construction contractor, which is one of the shapes this product supports
-- and not the only one; scripts/seed-org.js generates a fabricator instead.

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

