const express = require('express');
const cors = require('cors');
const db = require('./db');

const projectController = require('./controllers/ProjectController');
const workOrderController = require('./controllers/WorkOrderController');
const billController = require('./controllers/BillController');
const grnRouter = require('./routes/grn');

const app = express();
app.use(cors());
app.use(express.json());

/* ══════════════════════════════════════════════════════════
   UTILITY: Activity Logger
   Used by every state-changing route to maintain audit trail
   ══════════════════════════════════════════════════════════ */
const logActivity = (projectId, type, description) => {
  db.run(
    `INSERT INTO activities (projectId, type, description, timestamp)
     VALUES (?, ?, ?, datetime('now'))`,
    [projectId || null, type, description],
    (err) => { if (err) console.error('Activity log error:', err.message); }
  );
};

/* ══════════════════════════════════════════════════════════
   PROJECTS
   ══════════════════════════════════════════════════════════ */
app.get('/projects', projectController.getProjects);
app.post('/projects', (req, res) => {
  projectController.createProject(req, res);
  // Log after creation — piggyback on controller
});

/* ══════════════════════════════════════════════════════════
   WORK ORDERS
   ══════════════════════════════════════════════════════════ */
app.get('/work-orders', workOrderController.getWorkOrders);
app.post('/work-orders', (req, res, next) => {
  workOrderController.createWorkOrder(req, res);
});

/* ══════════════════════════════════════════════════════════
   MILESTONES — Extended with real progress updates
   ══════════════════════════════════════════════════════════ */
app.get('/milestones', workOrderController.getMilestones);

app.patch('/milestones/:id', (req, res) => {
  const { actualPercent, remarks } = req.body;
  db.run(
    `UPDATE milestones SET actualPercent = ?, remarks = ? WHERE id = ?`,
    [actualPercent, remarks || null, req.params.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Milestone not found' });
      // Fetch project from work order for logging
      db.get(`SELECT wo.projectId FROM work_orders wo
              JOIN milestones m ON m.workOrderId = wo.id
              WHERE m.id = ?`, [req.params.id], (e, row) => {
        logActivity(row?.projectId, 'MILESTONE_UPDATED',
          `Milestone #${req.params.id} updated to ${actualPercent}% complete`);
      });
      res.json({ success: true, id: Number(req.params.id), actualPercent });
    }
  );
});

/* ══════════════════════════════════════════════════════════
   VENDORS
   ══════════════════════════════════════════════════════════ */
app.get('/vendors', (req, res) => {
  let query = 'SELECT * FROM vendors';
  let params = [];
  if (req.query.projectId) {
    query += ' WHERE projectId = ?';
    params.push(req.query.projectId);
  }
  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.post('/vendors', (req, res) => {
  const { projectId, name, type, pan, gstin, contact, rating } = req.body;
  if (!name || !type) return res.status(400).json({ error: 'name and type are required' });
  db.run(
    `INSERT INTO vendors (projectId, name, type, pan, gstin, status, rating)
     VALUES (?, ?, ?, ?, ?, 'Active', ?)`,
    [projectId, name, type, pan || null, gstin || null, rating || 90],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      logActivity(projectId, 'VENDOR_ADDED', `Vendor "${name}" added to project`);
      res.json({ id: this.lastID });
    }
  );
});

/* ══════════════════════════════════════════════════════════
   PURCHASE ORDERS — Full state machine
   ══════════════════════════════════════════════════════════ */
app.get('/po', (req, res) => {
  let query = `SELECT po.*, v.name as vendorName, wo.name as workOrderName
               FROM purchase_orders po
               LEFT JOIN vendors v ON po.vendorId = v.id
               LEFT JOIN work_orders wo ON po.workOrderId = wo.id`;
  let params = [];
  if (req.query.projectId) {
    query += ' WHERE po.projectId = ?';
    params.push(req.query.projectId);
  }
  query += ' ORDER BY po.id DESC';
  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.post('/po', (req, res) => {
  const { projectId, vendorId, workOrderId, itemName, quantity, unitPrice, indentId } = req.body;
  if (!projectId || !vendorId || !itemName || !quantity)
    return res.status(400).json({ error: 'projectId, vendorId, itemName, quantity required' });
  const totalAmount = (quantity || 0) * (unitPrice || 0);
  db.run(
    `INSERT INTO purchase_orders
     (projectId, vendorId, workOrderId, itemName, quantity, indentId, status)
     VALUES (?, ?, ?, ?, ?, ?, 'Pending')`,
    [projectId, vendorId, workOrderId || null, itemName, quantity, indentId || null],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      logActivity(projectId, 'PO_CREATED',
        `PO-${this.lastID} created for "${itemName}" (qty: ${quantity})`);
      res.json({ id: this.lastID });
    }
  );
});

// ── PO State Transitions ──────────────────────────────────
app.patch('/po/:id/approve', (req, res) => {
  db.get('SELECT * FROM purchase_orders WHERE id = ?', [req.params.id], (err, po) => {
    if (err || !po) return res.status(404).json({ error: 'PO not found' });
    if (po.status !== 'Pending')
      return res.status(400).json({ error: `Cannot approve a PO with status "${po.status}"` });
    db.run(`UPDATE purchase_orders SET status = 'Approved' WHERE id = ?`,
      [req.params.id], function (err2) {
        if (err2) return res.status(500).json({ error: err2.message });
        logActivity(po.projectId, 'PO_APPROVED',
          `PO-${po.id} "${po.itemName}" approved`);
        res.json({ success: true, status: 'Approved' });
      });
  });
});

app.patch('/po/:id/dispatch', (req, res) => {
  db.get('SELECT * FROM purchase_orders WHERE id = ?', [req.params.id], (err, po) => {
    if (err || !po) return res.status(404).json({ error: 'PO not found' });
    if (po.status !== 'Approved')
      return res.status(400).json({ error: `Cannot dispatch a PO with status "${po.status}"` });
    db.run(`UPDATE purchase_orders SET status = 'Dispatched' WHERE id = ?`,
      [req.params.id], function (err2) {
        if (err2) return res.status(500).json({ error: err2.message });
        logActivity(po.projectId, 'PO_DISPATCHED',
          `PO-${po.id} "${po.itemName}" dispatched to vendor`);
        res.json({ success: true, status: 'Dispatched' });
      });
  });
});

/* ══════════════════════════════════════════════════════════
   INDENT — with status update
   ══════════════════════════════════════════════════════════ */
app.get('/indent', (req, res) => {
  let query = `SELECT indents.*, boq_items.itemCode, boq_items.description as itemDescription
               FROM indents
               LEFT JOIN boq_items ON indents.boqId = boq_items.id`;
  let params = [];
  if (req.query.projectId) {
    query += ' WHERE indents.projectId = ?';
    params.push(req.query.projectId);
  }
  query += ' ORDER BY indents.id DESC';
  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.post('/indent', (req, res) => {
  const { projectId, workOrderId, boqId, requestedQuantity, requiredDate, chainage } = req.body;
  db.run(
    `INSERT INTO indents (projectId, workOrderId, boqId, requestedQuantity, requiredDate, chainage, status)
     VALUES (?, ?, ?, ?, ?, ?, 'Pending')`,
    [projectId, workOrderId, boqId, requestedQuantity, requiredDate, chainage],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      logActivity(projectId, 'INDENT_CREATED',
        `Indent #${this.lastID} raised for ${requestedQuantity} units at ${chainage || 'N/A'}`);
      res.json({ id: this.lastID });
    }
  );
});

app.put('/indent/:id/status', (req, res) => {
  const { status } = req.body;
  const allowed = ['Pending', 'Approved', 'Rejected'];
  if (!allowed.includes(status))
    return res.status(400).json({ error: `Status must be one of: ${allowed.join(', ')}` });
  db.get('SELECT * FROM indents WHERE id = ?', [req.params.id], (err, indent) => {
    if (err || !indent) return res.status(404).json({ error: 'Indent not found' });
    db.run(`UPDATE indents SET status = ? WHERE id = ?`, [status, req.params.id], function (err2) {
      if (err2) return res.status(500).json({ error: err2.message });
      logActivity(indent.projectId, 'INDENT_UPDATED',
        `Indent #${req.params.id} status → ${status}`);
      // If approved, suggest PO creation
      res.json({
        success: true,
        status,
        suggestPO: status === 'Approved',
        indentData: status === 'Approved' ? indent : null
      });
    });
  });
});

/* ══════════════════════════════════════════════════════════
   INVENTORY
   ══════════════════════════════════════════════════════════ */
app.get('/inventory', (req, res) => {
  let query = 'SELECT * FROM inventory';
  let params = [];
  if (req.query.projectId) {
    query += ' WHERE projectId = ?';
    params.push(req.query.projectId);
  }
  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

/* ══════════════════════════════════════════════════════════
   BOQ
   ══════════════════════════════════════════════════════════ */
app.get('/boq', (req, res) => {
  let query = `SELECT boq_items.*,
    COALESCE((SELECT SUM(measuredQuantity) FROM measurement_book mb
              WHERE mb.boqId = boq_items.id), 0) AS executedQuantity,
    COALESCE((SELECT SUM(billedQuantity) FROM bills b
              JOIN work_orders wo ON b.workOrderId = wo.id
              WHERE wo.boqId = boq_items.id), 0) AS billedQuantity
    FROM boq_items`;
  let params = [];
  if (req.query.projectId) {
    query += ' WHERE boq_items.projectId = ?';
    params.push(req.query.projectId);
  }
  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.post('/boq', (req, res) => {
  const { projectId, itemCode, description, unit, estimatedQuantity, rate } = req.body;
  db.run(
    `INSERT INTO boq_items (projectId, itemCode, description, unit, estimatedQuantity, rate)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [projectId, itemCode, description, unit, estimatedQuantity, rate],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    }
  );
});

/* ══════════════════════════════════════════════════════════
   MEASUREMENT BOOK
   ══════════════════════════════════════════════════════════ */
app.get('/mb', (req, res) => {
  let query = `SELECT measurement_book.*, boq_items.itemCode, boq_items.description as itemDescription,
               boq_items.unit, boq_items.rate
               FROM measurement_book
               LEFT JOIN boq_items ON measurement_book.boqId = boq_items.id`;
  let params = [];
  if (req.query.projectId) {
    query += ' WHERE measurement_book.projectId = ?';
    params.push(req.query.projectId);
  }
  query += ' ORDER BY measurement_book.id DESC';
  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.post('/mb', (req, res) => {
  const { projectId, workOrderId, boqId, chainage, length, width, depth, measuredQuantity } = req.body;
  db.run(
    `INSERT INTO measurement_book (projectId, workOrderId, boqId, chainage, length, width, depth, measuredQuantity)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [projectId, workOrderId, boqId, chainage, length, width, depth, measuredQuantity],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      logActivity(projectId, 'MB_ENTRY',
        `MB entry at ${chainage || 'N/A'}: ${measuredQuantity} units recorded`);
      res.json({ id: this.lastID });
    }
  );
});

/* ══════════════════════════════════════════════════════════
   GRN (Router module — keeps existing logic + logs)
   ══════════════════════════════════════════════════════════ */
app.use('/grn', grnRouter);

/* ══════════════════════════════════════════════════════════
   RA BILLS — With state machine
   ══════════════════════════════════════════════════════════ */
app.get('/bills', billController.getBills);
app.post('/bills/generate', (req, res, next) => {
  // Wrap controller to add activity logging
  const origJson = res.json.bind(res);
  res.json = (data) => {
    if (data && data.id) {
      logActivity(req.body.projectId, 'BILL_GENERATED',
        `RA Bill #${data.id} generated for WO-${req.body.workOrderId}`);
    }
    return origJson(data);
  };
  billController.generateRABill(req, res, next);
});

// ── Bill Status Transitions ───────────────────────────────
app.patch('/bills/:id/submit', (req, res) => {
  db.get('SELECT * FROM bills WHERE id = ?', [req.params.id], (err, bill) => {
    if (err || !bill) return res.status(404).json({ error: 'Bill not found' });
    db.run(`UPDATE bills SET status = 'Under Review' WHERE id = ?`, [req.params.id], function (err2) {
      if (err2) return res.status(500).json({ error: err2.message });
      logActivity(bill.projectId, 'BILL_SUBMITTED',
        `Invoice INV-${String(bill.id).padStart(5,'0')} submitted for review`);
      res.json({ success: true, status: 'Under Review' });
    });
  });
});

app.patch('/bills/:id/approve', (req, res) => {
  db.get('SELECT * FROM bills WHERE id = ?', [req.params.id], (err, bill) => {
    if (err || !bill) return res.status(404).json({ error: 'Bill not found' });
    db.run(`UPDATE bills SET status = 'Approved' WHERE id = ?`, [req.params.id], function (err2) {
      if (err2) return res.status(500).json({ error: err2.message });
      logActivity(bill.projectId, 'BILL_APPROVED',
        `Invoice INV-${String(bill.id).padStart(5,'0')} approved`);
      res.json({ success: true, status: 'Approved' });
    });
  });
});

app.patch('/bills/:id/pay', (req, res) => {
  db.get('SELECT * FROM bills WHERE id = ?', [req.params.id], (err, bill) => {
    if (err || !bill) return res.status(404).json({ error: 'Bill not found' });
    db.run(`UPDATE bills SET status = 'Paid' WHERE id = ?`, [req.params.id], function (err2) {
      if (err2) return res.status(500).json({ error: err2.message });
      logActivity(bill.projectId, 'BILL_PAID',
        `Payment released for INV-${String(bill.id).padStart(5,'0')} (₹${bill.netAmount?.toLocaleString()})`);
      res.json({ success: true, status: 'Paid' });
    });
  });
});

/* ══════════════════════════════════════════════════════════
   ACTIVITIES — Real audit trail
   ══════════════════════════════════════════════════════════ */
app.get('/activities', (req, res) => {
  let query = `SELECT * FROM activities ORDER BY timestamp DESC LIMIT 200`;
  let params = [];
  if (req.query.projectId) {
    query = `SELECT * FROM activities WHERE projectId = ? ORDER BY timestamp DESC LIMIT 200`;
    params.push(req.query.projectId);
  }
  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

/* ══════════════════════════════════════════════════════════
   DASHBOARD — Real SQL aggregates (no mock data)
   ══════════════════════════════════════════════════════════ */
app.get('/dashboard', (req, res) => {
  const pid = req.query.projectId;
  if (!pid) return res.status(400).json({ error: 'projectId required' });

  const q = (sql, params) => new Promise((resolve, reject) =>
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows))
  );

  Promise.all([
    // KPI 1: Vendor count
    q(`SELECT COUNT(*) as c FROM vendors WHERE projectId = ?`, [pid]),
    // KPI 2: Total PO count
    q(`SELECT COUNT(*) as c FROM purchase_orders WHERE projectId = ?`, [pid]),
    // KPI 3: Delivered POs
    q(`SELECT COUNT(*) as c FROM purchase_orders WHERE projectId = ? AND status = 'Delivered'`, [pid]),
    // KPI 4: Inventory SKUs
    q(`SELECT COUNT(*) as c FROM inventory WHERE projectId = ?`, [pid]),
    // KPI 5: Total billed amount
    q(`SELECT COALESCE(SUM(grossAmount), 0) as total FROM bills WHERE projectId = ?`, [pid]),
    // KPI 6: Net payable released
    q(`SELECT COALESCE(SUM(netAmount), 0) as total FROM bills WHERE projectId = ? AND status = 'Paid'`, [pid]),
    // KPI 7: Open indents
    q(`SELECT COUNT(*) as c FROM indents WHERE projectId = ? AND status = 'Pending'`, [pid]),
    // KPI 8: Total PO value
    q(`SELECT COALESCE(SUM(quantity), 0) as total FROM purchase_orders WHERE projectId = ?`, [pid]),
    // PO status distribution
    q(`SELECT status, COUNT(*) as count FROM purchase_orders WHERE projectId = ? GROUP BY status`, [pid]),
    // Recent activities
    q(`SELECT * FROM activities WHERE projectId = ? ORDER BY timestamp DESC LIMIT 5`, [pid]),
    // Milestones for S-curve
    q(`SELECT m.*, wo.name as workOrderName FROM milestones m
       JOIN work_orders wo ON m.workOrderId = wo.id
       WHERE wo.projectId = ? ORDER BY m.id ASC`, [pid]),
    // BOQ summary
    q(`SELECT bi.itemCode, bi.description, bi.estimatedQuantity, bi.rate,
       COALESCE(SUM(mb.measuredQuantity), 0) as executedQuantity
       FROM boq_items bi
       LEFT JOIN measurement_book mb ON mb.boqId = bi.id
       WHERE bi.projectId = ?
       GROUP BY bi.id`, [pid]),
  ]).then(([vendors, pos, delivered, inv, billed, paid, indents, poQty, dist, activities, milestones, boq]) => {
    res.json({
      totalVendors:    vendors[0].c,
      totalPOs:        pos[0].c,
      deliveredPOs:    delivered[0].c,
      inventoryCount:  inv[0].c,
      totalBilled:     billed[0].total,
      netPaid:         paid[0].total,
      openIndents:     indents[0].c,
      totalPOQty:      poQty[0].total,
      distribution:    dist,
      recentActivities: activities,
      milestones,
      boqSummary: boq,
    });
  }).catch(err => {
    console.error('Dashboard error:', err.message);
    res.status(500).json({ error: err.message });
  });
});

/* ══════════════════════════════════════════════════════════
   SERVER
   ══════════════════════════════════════════════════════════ */
const PORT = 5000;
app.listen(PORT, () => {
  console.log(`✅ Nexus Op Backend running on http://localhost:${PORT}`);
  console.log(`   Routes: ${[
    'GET/POST /projects', 'GET/POST /work-orders', 'GET/PATCH /milestones',
    'GET/POST /vendors', 'GET/POST /po', 'PATCH /po/:id/approve', 'PATCH /po/:id/dispatch',
    'GET/POST /indent', 'PUT /indent/:id/status', 'GET /inventory',
    'GET/POST /boq', 'GET/POST /mb', '/grn', 'GET/POST /bills',
    'PATCH /bills/:id/(submit|approve|pay)', 'GET /activities', 'GET /dashboard'
  ].join(' · ')}`);
});
