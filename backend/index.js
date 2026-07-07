require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./db');

const projectController = require('./controllers/ProjectController');
const workOrderController = require('./controllers/WorkOrderController');
const billController = require('./controllers/BillController');
const authController = require('./controllers/AuthController');
const productionController = require('./controllers/ProductionController');
const salesController = require('./controllers/SalesController');
const grnBillController = require('./controllers/GrnBillController');
const salesInvoiceController = require('./controllers/SalesInvoiceController');
const attachmentController = require('./controllers/AttachmentController');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB
const { authenticate } = require('./middleware/auth');
const grnRouter = require('./routes/grn');

const app = express();
app.use(cors());
app.use(express.json());

/* ══════════════════════════════════════════════════════════
   UTILITY: Activity Logger
   ══════════════════════════════════════════════════════════ */
const logActivity = async (projectId, type, description) => {
  try {
    await db.query(
      `INSERT INTO activities ("projectId", type, description, timestamp) VALUES ($1, $2, $3, NOW())`,
      [projectId || null, type, description]
    );
  } catch (err) {
    console.error('Activity log error:', err.message);
  }
};

/* ══════════════════════════════════════════════════════════
   HEALTH CHECK
   ══════════════════════════════════════════════════════════ */
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

/* ══════════════════════════════════════════════════════════
   AUTHENTICATION (public: login) + GATE
   Everything registered AFTER app.use(authenticate) requires a
   valid Bearer token. /health and /auth/login stay public.
   ══════════════════════════════════════════════════════════ */
app.post('/auth/login', authController.login);
app.post('/auth/register', authController.register);

app.use(authenticate); // ⬇ all routes below are protected

app.get('/auth/me', authController.me);

/* Per-user workspace isolation. Any request carrying a projectId (query or
   body) must reference a project the caller owns — admins bypass. This one
   guard covers every project-scoped endpoint automatically. */
async function scopeProjectAccess(req, res, next) {
  if (req.user?.role === 'Admin') return next();
  const pid = req.query.projectId || (req.body && req.body.projectId);
  if (!pid) return next(); // not a project-scoped request
  try {
    const { rows } = await db.query('SELECT owner_id FROM projects WHERE id = $1', [pid]);
    if (!rows[0]) return res.status(404).json({ error: 'Project not found' });
    if (rows[0].owner_id !== req.user.id) {
      return res.status(403).json({ error: 'You do not have access to this project' });
    }
    next();
  } catch (err) {
    next(err);
  }
}
app.use(scopeProjectAccess);

/* ══════════════════════════════════════════════════════════
   PROJECTS
   ══════════════════════════════════════════════════════════ */
app.get('/projects', projectController.getProjects);
app.post('/projects', projectController.createProject);

/* ══════════════════════════════════════════════════════════
   WORK ORDERS
   ══════════════════════════════════════════════════════════ */
app.get('/work-orders', workOrderController.getWorkOrders);
app.post('/work-orders', workOrderController.createWorkOrder);

/* ══════════════════════════════════════════════════════════
   MILESTONES
   ══════════════════════════════════════════════════════════ */
app.get('/milestones', workOrderController.getMilestones);

app.patch('/milestones/:id', async (req, res) => {
  const { actualPercent, remarks } = req.body;
  try {
    const result = await db.query(
      `UPDATE milestones SET "actualPercent" = $1, remarks = $2 WHERE id = $3 RETURNING id`,
      [actualPercent, remarks || null, req.params.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Milestone not found' });

    const woResult = await db.query(
      `SELECT wo."projectId" FROM work_orders wo JOIN milestones m ON m."workOrderId" = wo.id WHERE m.id = $1`,
      [req.params.id]
    );
    await logActivity(woResult.rows[0]?.projectId, 'MILESTONE_UPDATED',
      `Milestone #${req.params.id} updated to ${actualPercent}% complete`);

    res.json({ success: true, id: Number(req.params.id), actualPercent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ══════════════════════════════════════════════════════════
   VENDORS
   ══════════════════════════════════════════════════════════ */
app.get('/vendors', async (req, res) => {
  try {
    let query = 'SELECT * FROM vendors';
    let params = [];
    if (req.query.projectId) {
      query += ' WHERE "projectId" = $1';
      params.push(req.query.projectId);
    }
    const { rows } = await db.query(query, params);
    res.json(rows || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/vendors', async (req, res) => {
  const { projectId, name, type, pan, gstin, contact, rating } = req.body;
  if (!name || !type) return res.status(400).json({ error: 'name and type are required' });
  try {
    const { rows } = await db.query(
      `INSERT INTO vendors ("projectId", name, type, pan, gstin, status, rating)
       VALUES ($1, $2, $3, $4, $5, 'Active', $6) RETURNING id`,
      [projectId, name, type, pan || null, gstin || null, rating || 90]
    );
    await logActivity(projectId, 'VENDOR_ADDED', `Vendor "${name}" added to project`);
    res.json({ id: rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ══════════════════════════════════════════════════════════
   PURCHASE ORDERS
   ══════════════════════════════════════════════════════════ */
app.get('/po', async (req, res) => {
  try {
    let query = `SELECT po.*, v.name as "vendorName", wo.name as "workOrderName"
                 FROM purchase_orders po
                 LEFT JOIN vendors v ON po."vendorId" = v.id
                 LEFT JOIN work_orders wo ON po."workOrderId" = wo.id`;
    let params = [];
    if (req.query.projectId) {
      query += ' WHERE po."projectId" = $1';
      params.push(req.query.projectId);
    }
    query += ' ORDER BY po.id DESC';
    const { rows } = await db.query(query, params);
    res.json(rows || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/po/:id', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT po.*, 
              v.name as "vendorName", v.address as "vendorAddress", v.gstin as "vendorGstin", v."contactName", v."contactPhone", v."contactEmail",
              p.name as "projectName", p."clientName" as "clientName"
       FROM purchase_orders po
       LEFT JOIN vendors v ON po."vendorId" = v.id
       LEFT JOIN projects p ON po."projectId" = p.id
       WHERE po.id = $1`, [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'PO not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/po/:id/items', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT * FROM po_line_items WHERE "poId" = $1 ORDER BY sno ASC`, [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/po', async (req, res) => {
  const { projectId, vendorId, workOrderId, itemName, quantity, unitPrice, quoteRef, paymentTerms, priceBasis, pnfInsurance, loadingScope, warranty, amountInWords, indentId, gstRate } = req.body;

  if (!projectId || !vendorId || !itemName || !quantity)
    return res.status(400).json({ error: 'projectId, vendorId, itemName, quantity required' });
  
  try {
    // Generate PO Number
    const countRes = await db.query('SELECT COUNT(*) FROM purchase_orders WHERE "projectId" = $1', [projectId]);
    const nextSeq = parseInt(countRes.rows[0].count) + 1;
    const poNumber = `Kirashi/FY2026-27/${String(nextSeq).padStart(3, '0')}`;

    const { rows } = await db.query(
      `INSERT INTO purchase_orders (
        "projectId", "vendorId", "workOrderId", "itemName", quantity, "unitPrice",
        "poNumber", "quoteRef", "paymentTerms", "priceBasis", "pnfInsurance",
        "loadingScope", "warranty", "amountInWords", "indentId", gst_rate, status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'Pending') RETURNING id`,
      [
        projectId, vendorId, workOrderId || null, itemName, quantity, unitPrice || null,
        poNumber, quoteRef || null, paymentTerms || null, priceBasis || 'Ex Works',
        pnfInsurance || 'Vendor Scope', loadingScope || 'Kirashi Scope', warranty || '12 months',
        amountInWords || null, indentId || null, (gstRate === undefined || gstRate === '' ? 18 : Number(gstRate))
      ]
    );
    await logActivity(projectId, 'PO_CREATED', `${poNumber} created for "${itemName}"`);
    res.json({ id: rows[0].id, poNumber });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/po/:id/items', async (req, res) => {
  const poId = req.params.id;
  const items = req.body; // Array of items
  
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Items required' });

  try {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      // Delete existing to allow pure replacement on edit
      await client.query('DELETE FROM po_line_items WHERE "poId" = $1', [poId]);
      
      for (const item of items) {
        await client.query(
          `INSERT INTO po_line_items ("poId", sno, description, uom, hsn, quantity, "unitPrice") 
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [poId, item.sno, item.description, item.uom || "No's", item.hsn || null, item.quantity, item.unitPrice]
        );
      }
      await client.query('COMMIT');
      res.json({ success: true });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/company-profile', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM company_profile LIMIT 1');
    if (rows.length === 0) {
      // Auto-insert default if missing
      const def = await db.query(`INSERT INTO company_profile (name) VALUES ('Kirashi Business Synergies Private Limited') RETURNING *`);
      return res.json(def.rows[0]);
    }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PO State Transitions
app.patch('/po/:id/approve', async (req, res) => {
  try {
    const poResult = await db.query('SELECT * FROM purchase_orders WHERE id = $1', [req.params.id]);
    const po = poResult.rows[0];
    if (!po) return res.status(404).json({ error: 'PO not found' });
    if (po.status !== 'Pending')
      return res.status(400).json({ error: `Cannot approve a PO with status "${po.status}"` });
    await db.query(`UPDATE purchase_orders SET status = 'Approved' WHERE id = $1`, [req.params.id]);
    await logActivity(po.projectId, 'PO_APPROVED', `PO-${po.id} "${po.itemName}" approved`);
    res.json({ success: true, status: 'Approved' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/po/:id/dispatch', async (req, res) => {
  try {
    const poResult = await db.query('SELECT * FROM purchase_orders WHERE id = $1', [req.params.id]);
    const po = poResult.rows[0];
    if (!po) return res.status(404).json({ error: 'PO not found' });
    if (po.status !== 'Approved')
      return res.status(400).json({ error: `Cannot dispatch a PO with status "${po.status}"` });
    await db.query(`UPDATE purchase_orders SET status = 'Dispatched' WHERE id = $1`, [req.params.id]);
    await logActivity(po.projectId, 'PO_DISPATCHED', `PO-${po.id} "${po.itemName}" dispatched to vendor`);
    res.json({ success: true, status: 'Dispatched' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ══════════════════════════════════════════════════════════
   INDENT
   ══════════════════════════════════════════════════════════ */
app.get('/indent', async (req, res) => {
  try {
    let query = `SELECT indents.*, boq_items."itemCode", boq_items.description as "itemDescription"
                 FROM indents
                 LEFT JOIN boq_items ON indents."boqId" = boq_items.id`;
    let params = [];
    if (req.query.projectId) {
      query += ' WHERE indents."projectId" = $1';
      params.push(req.query.projectId);
    }
    query += ' ORDER BY indents.id DESC';
    const { rows } = await db.query(query, params);
    res.json(rows || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/indent', async (req, res) => {
  const { projectId, workOrderId, boqId, requestedQuantity, requiredDate, chainage } = req.body;
  try {
    const { rows } = await db.query(
      `INSERT INTO indents ("projectId", "workOrderId", "boqId", "requestedQuantity", "requiredDate", chainage, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'Pending') RETURNING id`,
      [projectId, workOrderId || null, boqId, requestedQuantity, requiredDate, chainage]
    );
    await logActivity(projectId, 'INDENT_CREATED',
      `Indent #${rows[0].id} raised for ${requestedQuantity} units at ${chainage || 'N/A'}`);
    res.json({ id: rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/indent/:id/status', async (req, res) => {
  const { status } = req.body;
  const allowed = ['Pending', 'Approved', 'Rejected'];
  if (!allowed.includes(status))
    return res.status(400).json({ error: `Status must be one of: ${allowed.join(', ')}` });
  try {
    const indentResult = await db.query('SELECT * FROM indents WHERE id = $1', [req.params.id]);
    const indent = indentResult.rows[0];
    if (!indent) return res.status(404).json({ error: 'Indent not found' });
    await db.query('UPDATE indents SET status = $1 WHERE id = $2', [status, req.params.id]);
    await logActivity(indent.projectId, 'INDENT_UPDATED', `Indent #${req.params.id} status → ${status}`);
    res.json({
      success: true, status,
      suggestPO: status === 'Approved',
      indentData: status === 'Approved' ? indent : null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ══════════════════════════════════════════════════════════
   INVENTORY
   ══════════════════════════════════════════════════════════ */
app.get('/inventory', async (req, res) => {
  try {
    let query = 'SELECT * FROM inventory';
    let params = [];
    if (req.query.projectId) {
      query += ' WHERE "projectId" = $1';
      params.push(req.query.projectId);
    }
    const { rows } = await db.query(query, params);
    res.json(rows || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ══════════════════════════════════════════════════════════
   BOQ
   ══════════════════════════════════════════════════════════ */
app.get('/boq', async (req, res) => {
  try {
    let query = `SELECT boq_items.*,
      COALESCE((SELECT SUM("measuredQuantity") FROM measurement_book mb
                WHERE mb."boqId" = boq_items.id), 0) AS "executedQuantity",
      COALESCE((SELECT SUM("billedQuantity") FROM bills b
                JOIN work_orders wo ON b."workOrderId" = wo.id
                WHERE wo."boqId" = boq_items.id), 0) AS "billedQuantity"
      FROM boq_items`;
    let params = [];
    if (req.query.projectId) {
      query += ' WHERE boq_items."projectId" = $1';
      params.push(req.query.projectId);
    }
    const { rows } = await db.query(query, params);
    res.json(rows || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/boq', async (req, res) => {
  const { projectId, itemCode, description, unit, estimatedQuantity, rate } = req.body;
  try {
    const { rows } = await db.query(
      `INSERT INTO boq_items ("projectId", "itemCode", description, unit, "estimatedQuantity", rate)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [projectId, itemCode, description, unit, estimatedQuantity, rate]
    );
    res.json({ id: rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ══════════════════════════════════════════════════════════
   MEASUREMENT BOOK
   ══════════════════════════════════════════════════════════ */
app.get('/mb', async (req, res) => {
  try {
    let query = `SELECT measurement_book.*, boq_items."itemCode", boq_items.description as "itemDescription",
                 boq_items.unit, boq_items.rate
                 FROM measurement_book
                 LEFT JOIN boq_items ON measurement_book."boqId" = boq_items.id`;
    let params = [];
    if (req.query.projectId) {
      query += ' WHERE measurement_book."projectId" = $1';
      params.push(req.query.projectId);
    }
    query += ' ORDER BY measurement_book.id DESC';
    const { rows } = await db.query(query, params);
    res.json(rows || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/mb', async (req, res) => {
  const { projectId, workOrderId, boqId, chainage, length, width, depth, measuredQuantity } = req.body;
  try {
    const { rows } = await db.query(
      `INSERT INTO measurement_book ("projectId", "workOrderId", "boqId", chainage, length, width, depth, "measuredQuantity")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [projectId, workOrderId || null, boqId, chainage, length, width, depth, measuredQuantity]
    );
    await logActivity(projectId, 'MB_ENTRY',
      `MB entry at ${chainage || 'N/A'}: ${measuredQuantity} units recorded`);
    res.json({ id: rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ══════════════════════════════════════════════════════════
   GRN (Router module)
   ══════════════════════════════════════════════════════════ */
app.use('/grn', grnRouter);

/* ══════════════════════════════════════════════════════════
   PRODUCTION / FABRICATION YIELD
   ══════════════════════════════════════════════════════════ */
app.get('/production',              productionController.getOrders);
app.post('/production',             productionController.createOrder);
app.get('/production/summary',      productionController.getSummary);   // before :id
app.get('/production/:id',          productionController.getOrderById);
app.patch('/production/:id/status', productionController.updateStatus);
app.delete('/production/:id',       productionController.deleteOrder);
app.post('/production/:id/consumption', productionController.addConsumption);
app.post('/production/:id/output',      productionController.addOutput);
app.post('/production/:id/scrap',       productionController.addScrap);
app.delete('/production/:kind/line/:lineId', productionController.deleteLine);

/* ══════════════════════════════════════════════════════════
   SALES & PROCUREMENT MASTERS (owner-scoped CRUD)
   ══════════════════════════════════════════════════════════ */
function registerOwnedCrud(route, table, cols) {
  app.get(`/${route}`, async (req, res) => {
    try {
      const isAdmin = req.user?.role === 'Admin';
      const { rows } = isAdmin
        ? await db.query(`SELECT * FROM ${table} ORDER BY id DESC`)
        : await db.query(`SELECT * FROM ${table} WHERE owner_id = $1 ORDER BY id DESC`, [req.user.id]);
      res.json(rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.post(`/${route}`, async (req, res) => {
    try {
      const colList = cols.map(c => `"${c}"`).join(', ');
      const ph = cols.map((_, i) => `$${i + 2}`).join(', ');
      const vals = cols.map(c => (req.body[c] === undefined ? null : req.body[c]));
      const { rows } = await db.query(
        `INSERT INTO ${table} (owner_id, ${colList}) VALUES ($1, ${ph}) RETURNING id`,
        [req.user?.id || null, ...vals]
      );
      res.json({ id: rows[0].id });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.patch(`/${route}/:id`, async (req, res) => {
    try {
      const sets = cols.filter(c => c in req.body);
      if (!sets.length) return res.status(400).json({ error: 'No fields to update' });
      const clause = sets.map((c, i) => `"${c}" = $${i + 1}`).join(', ');
      const vals = sets.map(c => req.body[c]);
      const { rowCount } = await db.query(`UPDATE ${table} SET ${clause} WHERE id = $${sets.length + 1}`, [...vals, req.params.id]);
      if (!rowCount) return res.status(404).json({ error: 'not found' });
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.delete(`/${route}/:id`, async (req, res) => {
    try {
      const { rowCount } = await db.query(`DELETE FROM ${table} WHERE id = $1`, [req.params.id]);
      if (!rowCount) return res.status(404).json({ error: 'not found' });
      res.json({ success: true });
    } catch (e) {
      if (e.code === '23503') return res.status(409).json({ error: 'In use elsewhere — remove dependents first' });
      res.status(500).json({ error: e.message });
    }
  });
}
registerOwnedCrud('customers',    'customers',     ['name', 'gstin', 'contact_name', 'phone', 'email', 'billing_address', 'state']);
registerOwnedCrud('skus',         'skus',          ['sku_code', 'name', 'description', 'unit', 'price', 'hsn']);
registerOwnedCrud('raw-materials','raw_materials', ['material_code', 'name', 'grade', 'unit', 'standard_rate', 'hsn']);

/* ── Customer Orders ── */
app.get('/customer-orders',            salesController.getOrders);
app.post('/customer-orders',           salesController.createOrder);
app.get('/customer-orders/:id',        salesController.getOrderById);
app.patch('/customer-orders/:id/status', salesController.updateOrderStatus);
app.delete('/customer-orders/:id',     salesController.deleteOrder);

/* ── Quotations (Q1/Q2/Q3) ── */
app.get('/quotations',                 salesController.getQuotations);
app.post('/quotations',                salesController.createQuotation);
app.get('/quotations/:id',             salesController.getQuotationById);
app.delete('/quotations/:id',          salesController.deleteQuotation);
app.post('/quotations/:id/quote',      salesController.addQuoteLine);
app.delete('/quotations/quote/:lineId', salesController.deleteQuoteLine);
app.post('/quotations/:id/select',     salesController.selectQuote);
app.post('/quotations/:id/generate-po', salesController.generatePO);

/* ── Attachments (files on any record) ── */
app.post('/attachments',            upload.single('file'), attachmentController.create);
app.get('/attachments',             attachmentController.list);
app.get('/attachments/:id/download', attachmentController.download);
app.delete('/attachments/:id',      attachmentController.remove);

/* ── Customizable GRN bills ── */
app.get('/grn-bills/prefill/:grnId',   grnBillController.prefill);   // before :id
app.get('/grn-bills',                  grnBillController.list);
app.post('/grn-bills',                 grnBillController.create);
app.get('/grn-bills/:id',              grnBillController.getById);
app.patch('/grn-bills/:id/status',     grnBillController.setStatus);
app.delete('/grn-bills/:id',           grnBillController.remove);

/* ── Customer Sales Invoices + payments ── */
app.get('/sales-invoices/prefill/:customerOrderId', salesInvoiceController.prefill);  // before :id
app.get('/sales-invoices',             salesInvoiceController.list);
app.post('/sales-invoices',            salesInvoiceController.create);
app.get('/sales-invoices/:id',         salesInvoiceController.getById);
app.post('/sales-invoices/:id/payment', salesInvoiceController.addPayment);
app.patch('/sales-invoices/:id/status', salesInvoiceController.setStatus);
app.delete('/sales-invoices/:id',      salesInvoiceController.remove);

/* ══════════════════════════════════════════════════════════
   RA BILLS — State machine
   ══════════════════════════════════════════════════════════ */
app.get('/bills', billController.getBills);
app.get('/bills/:id', billController.getBillById);
app.post('/bills/generate', async (req, res) => {
  await billController.generateRABill(req, res);
});

// Status lifecycle with valid-transition guard (Zoho-style):
// Draft → Under Review → Approved → Paid  (Reject from Draft/Under Review)
const BILL_TRANSITIONS = {
  submit:  { from: ['Draft'],                 to: 'Under Review', type: 'BILL_SUBMITTED', verb: 'submitted for review' },
  approve: { from: ['Under Review'],          to: 'Approved',     type: 'BILL_APPROVED',  verb: 'approved' },
  pay:     { from: ['Approved'],              to: 'Paid',         type: 'BILL_PAID',      verb: 'paid' },
  reject:  { from: ['Draft', 'Under Review'], to: 'Rejected',     type: 'BILL_REJECTED',  verb: 'rejected' },
};

function billTransition(action) {
  return async (req, res) => {
    const tr = BILL_TRANSITIONS[action];
    try {
      const billResult = await db.query('SELECT * FROM bills WHERE id = $1', [req.params.id]);
      const bill = billResult.rows[0];
      if (!bill) return res.status(404).json({ error: 'Bill not found' });
      if (!tr.from.includes(bill.status)) {
        return res.status(409).json({ error: `Cannot ${action} a bill in '${bill.status}' state.` });
      }
      await db.query('UPDATE bills SET status = $1, updated_at = NOW() WHERE id = $2', [tr.to, req.params.id]);
      const ref = bill.bill_number || `RA-${String(bill.id).padStart(4, '0')}`;
      const tail = action === 'pay' ? ` (₹${Number(bill.netAmount || 0).toLocaleString('en-IN')})` : '';
      await logActivity(bill.projectId, tr.type, `Invoice ${ref} ${tr.verb}${tail}`);
      res.json({ success: true, status: tr.to });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };
}

app.patch('/bills/:id/submit', billTransition('submit'));
app.patch('/bills/:id/approve', billTransition('approve'));
app.patch('/bills/:id/pay', billTransition('pay'));
app.patch('/bills/:id/reject', billTransition('reject'));
app.delete('/bills/:id', async (req, res) => {
  try {
    const r = await db.query('SELECT status FROM bills WHERE id = $1', [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'Bill not found' });
    if (!['Draft', 'Rejected'].includes(r.rows[0].status))
      return res.status(409).json({ error: `Only Draft or Rejected bills can be deleted (this is '${r.rows[0].status}').` });
    await db.query('DELETE FROM bills WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ══════════════════════════════════════════════════════════
   GENERIC UPDATE / DELETE  (Phase 3c — completes CRUD)
   ══════════════════════════════════════════════════════════ */
function registerCrud(route, table, cols, logType) {
  // UPDATE (partial) — only whitelisted columns
  app.patch(`/${route}/:id`, async (req, res) => {
    const sets = [], vals = [];
    let i = 1;
    for (const c of cols) {
      if (req.body[c] !== undefined) { sets.push(`"${c}" = $${i++}`); vals.push(req.body[c]); }
    }
    if (!sets.length) return res.status(400).json({ error: 'No updatable fields provided' });
    vals.push(req.params.id);
    try {
      const r = await db.query(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, vals);
      if (!r.rowCount) return res.status(404).json({ error: 'Record not found' });
      if (logType) await logActivity(r.rows[0].projectId || null, logType, `${route} #${req.params.id} updated`);
      res.json(r.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
  // DELETE
  app.delete(`/${route}/:id`, async (req, res) => {
    try {
      const r = await db.query(`DELETE FROM ${table} WHERE id = $1 RETURNING id, "projectId"`, [req.params.id]);
      if (!r.rowCount) return res.status(404).json({ error: 'Record not found' });
      if (logType) await logActivity(r.rows[0].projectId || null, logType, `${route} #${req.params.id} deleted`);
      res.json({ success: true });
    } catch (err) {
      // friendly message for FK violations
      if (err.code === '23503') return res.status(409).json({ error: 'Cannot delete — other records depend on this. Remove them first.' });
      res.status(500).json({ error: err.message });
    }
  });
}

registerCrud('projects', 'projects', ['name', 'clientName', 'type', 'startDate', 'endDate', 'status'], 'PROJECT_UPDATED');
registerCrud('vendors', 'vendors', ['name', 'type', 'pan', 'gstin', 'class', 'capability_tags', 'rating', 'status', 'address', 'contactName', 'contactPhone', 'contactEmail'], 'VENDOR_UPDATED');
registerCrud('work-orders', 'work_orders', ['name', 'vendorId', 'boqId', 'startDate', 'endDate', 'contractValue', 'status'], 'WO_UPDATED');
registerCrud('boq', 'boq_items', ['itemCode', 'description', 'unit', 'estimatedQuantity', 'rate'], 'BOQ_UPDATED');
registerCrud('indent', 'indents', ['workOrderId', 'boqId', 'requestedQuantity', 'requiredDate', 'chainage', 'status'], 'INDENT_UPDATED');
registerCrud('mb', 'measurement_book', ['boqId', 'workOrderId', 'chainage', 'length', 'width', 'depth', 'measuredQuantity'], 'MB_UPDATED');
registerCrud('grn', 'grn', ['vehicleNumber', 'batchNumber', 'chainage', 'receivedQuantity'], 'GRN_UPDATED');

/* ══════════════════════════════════════════════════════════
   ACTIVITIES
   ══════════════════════════════════════════════════════════ */
app.get('/activities', async (req, res) => {
  try {
    let query = 'SELECT * FROM activities ORDER BY timestamp DESC LIMIT 200';
    let params = [];
    if (req.query.projectId) {
      query = 'SELECT * FROM activities WHERE "projectId" = $1 ORDER BY timestamp DESC LIMIT 200';
      params.push(req.query.projectId);
    }
    const { rows } = await db.query(query, params);
    res.json(rows || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ══════════════════════════════════════════════════════════
   UI CONFIG
   ══════════════════════════════════════════════════════════ */
app.get('/ui-config/all', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT component_id, config FROM ui_config');
    res.json(rows || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ══════════════════════════════════════════════════════════
   DASHBOARD
   ══════════════════════════════════════════════════════════ */
app.get('/dashboard', async (req, res) => {
  const pid = req.query.projectId;
  if (!pid) return res.status(400).json({ error: 'projectId required' });

  try {
    const [vendors, pos, delivered, inv, billed, paid, indents, poQty, dist, activities, milestones, boq] = await Promise.all([
      db.query(`SELECT COUNT(*) as c FROM vendors WHERE "projectId" = $1`, [pid]),
      db.query(`SELECT COUNT(*) as c FROM purchase_orders WHERE "projectId" = $1`, [pid]),
      db.query(`SELECT COUNT(*) as c FROM purchase_orders WHERE "projectId" = $1 AND status = 'Delivered'`, [pid]),
      db.query(`SELECT COUNT(*) as c FROM inventory WHERE "projectId" = $1`, [pid]),
      db.query(`SELECT COALESCE(SUM("grossAmount"), 0) as total FROM bills WHERE "projectId" = $1`, [pid]),
      db.query(`SELECT COALESCE(SUM("netAmount"), 0) as total FROM bills WHERE "projectId" = $1 AND status = 'Paid'`, [pid]),
      db.query(`SELECT COUNT(*) as c FROM indents WHERE "projectId" = $1 AND status = 'Pending'`, [pid]),
      db.query(`SELECT COALESCE(SUM(quantity), 0) as total FROM purchase_orders WHERE "projectId" = $1`, [pid]),
      db.query(`SELECT status, COUNT(*) as count FROM purchase_orders WHERE "projectId" = $1 GROUP BY status`, [pid]),
      db.query(`SELECT * FROM activities WHERE "projectId" = $1 ORDER BY timestamp DESC LIMIT 5`, [pid]),
      db.query(`SELECT m.*, wo.name as "workOrderName" FROM milestones m
         JOIN work_orders wo ON m."workOrderId" = wo.id
         WHERE wo."projectId" = $1 ORDER BY m.id ASC`, [pid]),
      db.query(`SELECT bi."itemCode", bi.description, bi."estimatedQuantity", bi.rate,
         COALESCE(SUM(mb."measuredQuantity"), 0) as "executedQuantity"
         FROM boq_items bi
         LEFT JOIN measurement_book mb ON mb."boqId" = bi.id
         WHERE bi."projectId" = $1
         GROUP BY bi.id, bi."itemCode", bi.description, bi."estimatedQuantity", bi.rate`, [pid]),
    ]);

    res.json({
      totalVendors:    parseInt(vendors.rows[0].c),
      totalPOs:        parseInt(pos.rows[0].c),
      deliveredPOs:    parseInt(delivered.rows[0].c),
      inventoryCount:  parseInt(inv.rows[0].c),
      totalBilled:     parseFloat(billed.rows[0].total),
      netPaid:         parseFloat(paid.rows[0].total),
      openIndents:     parseInt(indents.rows[0].c),
      totalPOQty:      parseInt(poQty.rows[0].total),
      distribution:    dist.rows,
      recentActivities: activities.rows,
      milestones:      milestones.rows,
      boqSummary:      boq.rows,
    });
  } catch (err) {
    console.error('Dashboard error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/* ══════════════════════════════════════════════════════════
   SERVER
   ══════════════════════════════════════════════════════════ */
const PORT = process.env.PORT || 5000;
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
