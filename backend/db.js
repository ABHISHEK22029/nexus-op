const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'database.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database', err.message);
  } else {
    console.log('Connected to the SQLite database.');

    db.serialize(() => {
      // 1. Projects Module
      db.run(`CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        clientName TEXT NOT NULL,
        type TEXT NOT NULL,
        startDate TEXT,
        endDate TEXT,
        status TEXT
      )`);

      // 2. Work Order Module
      db.run(`CREATE TABLE IF NOT EXISTS work_orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        projectId INTEGER NOT NULL,
        vendorId INTEGER NOT NULL,
        name TEXT NOT NULL,
        boqId INTEGER,
        startDate TEXT,
        endDate TEXT,
        contractValue REAL,
        status TEXT,
        FOREIGN KEY (projectId) REFERENCES projects(id)
      )`);

      // 3. Milestones Module
      db.run(`CREATE TABLE IF NOT EXISTS milestones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workOrderId INTEGER NOT NULL,
        name TEXT NOT NULL,
        plannedPercent REAL,
        actualPercent REAL,
        status TEXT,
        FOREIGN KEY (workOrderId) REFERENCES work_orders(id)
      )`);

      // Vendors Table (Now contextual bound technically, or a global registry but used in WOs)
      db.run(`CREATE TABLE IF NOT EXISTS vendors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        projectId INTEGER,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        pan TEXT,
        gstin TEXT,
        class TEXT,
        capability_tags TEXT,
        rating INTEGER,
        status TEXT,
        FOREIGN KEY (projectId) REFERENCES projects(id)
      )`);

      // Inventory Table (Bound to Project level context)
      db.run(`CREATE TABLE IF NOT EXISTS inventory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        projectId INTEGER NOT NULL,
        itemName TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (projectId) REFERENCES projects(id)
      )`);

      // Purchase Orders Table (Bound to Project & WorkOrder)
      db.run(`CREATE TABLE IF NOT EXISTS purchase_orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        projectId INTEGER NOT NULL,
        workOrderId INTEGER NOT NULL,
        vendorId INTEGER NOT NULL,
        itemName TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        indentId INTEGER NULL,
        status TEXT DEFAULT 'Pending' CHECK(status IN ('Pending', 'Approved', 'Dispatched', 'Delivered')),
        FOREIGN KEY (projectId) REFERENCES projects(id),
        FOREIGN KEY (workOrderId) REFERENCES work_orders(id),
        FOREIGN KEY (vendorId) REFERENCES vendors(id)
      )`);

      // Activities Table (Global or Project)
      db.run(`CREATE TABLE IF NOT EXISTS activities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        projectId INTEGER,
        description TEXT NOT NULL,
        type TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // BOQ Module (Project Context)
      db.run(`CREATE TABLE IF NOT EXISTS boq_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        projectId INTEGER NOT NULL,
        itemCode TEXT NOT NULL,
        description TEXT NOT NULL,
        unit TEXT NOT NULL,
        estimatedQuantity INTEGER NOT NULL,
        rate REAL NOT NULL,
        FOREIGN KEY (projectId) REFERENCES projects(id)
      )`);

      // Indents (Project Level request)
      db.run(`CREATE TABLE IF NOT EXISTS indents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        projectId INTEGER NOT NULL,
        workOrderId INTEGER NOT NULL,
        boqId INTEGER NOT NULL,
        requestedQuantity INTEGER NOT NULL,
        requiredDate TEXT,
        chainage TEXT,
        status TEXT DEFAULT 'Pending'
      )`);

      // Measurement Book (Work Order precision)
      db.run(`CREATE TABLE IF NOT EXISTS measurement_book (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        projectId INTEGER NOT NULL,
        workOrderId INTEGER NOT NULL,
        boqId INTEGER NOT NULL,
        chainage TEXT,
        length REAL,
        width REAL,
        depth REAL,
        measuredQuantity REAL NOT NULL,
        date DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (workOrderId) REFERENCES work_orders(id)
      )`);

      // GRN Table (Bound to Work Order / PO)
      db.run(`CREATE TABLE IF NOT EXISTS grn (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        projectId INTEGER NOT NULL,
        workOrderId INTEGER NOT NULL,
        poId INTEGER NOT NULL,
        vehicleNumber TEXT,
        batchNumber TEXT,
        chainage TEXT,
        receivedQuantity INTEGER NOT NULL,
        date DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // RA Bills Table (Aggregates MB quantities up to WO level)
      db.run(`CREATE TABLE IF NOT EXISTS bills (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        projectId INTEGER NOT NULL,
        workOrderId INTEGER NOT NULL,
        grossAmount REAL NOT NULL,
        tds REAL NOT NULL,
        retention REAL NOT NULL,
        netAmount REAL NOT NULL,
        billedQuantity REAL NOT NULL DEFAULT 0,
        status TEXT DEFAULT 'Draft' CHECK(status IN ('Draft', 'Under Review', 'Approved', 'Paid')),
        date DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (workOrderId) REFERENCES work_orders(id)
      )`);

      // Seeding Demo Data
      db.get("SELECT COUNT(*) AS count FROM projects", (err, row) => {
        if (row && row.count === 0) {
          console.log("Seeding hierarchical Demo Data...");

          // 1. Projects
          db.run(`INSERT INTO projects (name, clientName, type, startDate, endDate, status) VALUES 
            ('ORR Package 1 (SW)', 'HMDA', 'construction', '2025-01-01', '2026-12-31', 'Active'),
            ('Generic Procurement IT', 'Internal', 'generic', '2025-03-01', '2025-09-01', 'Active')
          `);

          // Vendors Registry 
          const vendorNames = ['Larsen & Toubro', 'NCC Limited', 'Megha Engg', 'Dilip Buildcon', 'Afcons', 'Navayuga'];
          vendorNames.forEach((name, idx) => {
            const vType = 'Civil';
            db.run(`INSERT INTO vendors (projectId, name, type, pan, gstin, class, capability_tags, rating, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
              [1, name, vType, 'ABCDE' + String(idx).padStart(4, '0') + 'F', '36ABCDE' + String(idx).padStart(4, '0') + 'F1Z5', 'Special', 'Structures, Earthworks', 95, 'Active']
            );
          });
          
          db.run(`INSERT INTO vendors (projectId, name, type, pan, gstin, class, capability_tags, rating, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
              [2, 'Dell EMC', 'IT Hardware', 'XYZ1234', 'GST1234', 'A', 'Servers', 99, 'Active']
          );

          // Work Orders setup directly dependent on seeded tables
          // Wait for vendors and projects insertion basically... Since sqlite inserts are fast in serialize block:
          // WO1 for Proj 1, Vendor 1(L&T)
          db.run(`INSERT INTO work_orders (projectId, vendorId, name, boqId, startDate, endDate, contractValue, status) VALUES 
            (1, 1, 'WO-001: Earthworks and Embankment SW', 1, '2025-02-01', '2025-10-01', 50000000, 'In Progress'),
            (1, 2, 'WO-002: Bituminous Paving & DBM', 2, '2025-05-01', '2026-05-01', 120000000, 'In Progress'),
            (2, 7, 'WO-003: Core Server Replacement', NULL, '2025-03-15', '2025-04-15', 5000000, 'Pending')
          `);

          // Milestones
          db.run(`INSERT INTO milestones (workOrderId, name, plannedPercent, actualPercent, status) VALUES 
            (1, 'Site Clearance', 100, 100, 'Completed'),
            (1, 'Sub-grade Compaction', 80, 60, 'Delayed'),
            (2, 'DBM Layer 1', 50, 45, 'On Track')
          `);

          // BOQ
           db.run(`INSERT INTO boq_items (projectId, itemCode, description, unit, estimatedQuantity, rate) VALUES 
             (1, 'EW-01', 'Earthwork in excavation for roadway', 'Cum', 150000, 85),
             (1, 'BT-03', 'Dense Bituminous Macadam (DBM) 50mm thick', 'Cum', 22500, 8500)
           `);

           // PO
           db.run(`INSERT INTO purchase_orders (projectId, workOrderId, vendorId, itemName, quantity, status) VALUES 
             (1, 1, 1, 'Earthwork Material', 50000, 'Delivered'),
             (1, 2, 2, 'Bitumen VG-30', 2000, 'Dispatched'),
             (2, 3, 7, 'Dell PowerEdge R740', 10, 'Approved')
           `);
           
           // Measurement Book Data
           db.run(`INSERT INTO measurement_book (projectId, workOrderId, boqId, chainage, length, width, depth, measuredQuantity) VALUES 
             (1, 1, 1, 'CH 10+500', 100, 15, 2, 3000),
             (1, 1, 1, 'CH 10+600', 150, 15, 2, 4500)
           `);

           // Baseline Billed Amount for WO1 (3000 used out of 7500 total recorded so far)
           db.run(`INSERT INTO bills (projectId, workOrderId, grossAmount, tds, retention, netAmount, billedQuantity, status) VALUES 
             (1, 1, 255000, 5100, 12750, 237150, 3000, 'Paid')
           `);

        }
      });
    });
  }
});

module.exports = db;
