/* ══════════════════════════════════════════════════════════
   DeliveryChallanController — goods-out note to the customer (Wave 1C)
   Prefills from a customer order; records transporter/vehicle; carries
   the goods value for the e-way bill. Owner-scoped.
   ══════════════════════════════════════════════════════════ */
const db = require('../db');
const { isCrossTenant } = require('../shared/roles');
const { scopedById } = require('../shared/ownerScope');
const { runList } = require('../shared/listQuery');
const { notify } = require('../notify');
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const isAdmin = (req) => isCrossTenant(req.user?.role);

// GET /delivery-challans
exports.list = async (req, res) => {
  try {
    const admin = isAdmin(req);
    const where = [], params = [];
    if (!admin) { params.push(req.user.id); where.push(`owner_id = $${params.length}`); }
    // Joined in a subquery so the customer/party name is searchable too —
    // people look for "Apollo", not for an invoice number they don't have.
    const result = await runList(db, {
      table: `(SELECT dc.*, c.name AS customer_name FROM delivery_challans dc LEFT JOIN customers c ON c.id = dc.customer_id) AS dc`,
      query: req.query,
      searchColumns: ["challan_number","customer_name","status","vehicle_no","dispatch_through"],
      filterColumns: ["status","customer_id"],
      allowedSort: ["id","challan_number","challan_date","status"],
      defaultSort: 'id', defaultDir: 'DESC',
      where, params,
    });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// GET /delivery-challans/prefill/:orderId — build a challan from a customer order
exports.prefill = async (req, res) => {
  try {
    const co = (await db.query('SELECT * FROM customer_orders WHERE id = $1', [req.params.orderId])).rows[0];
    if (!co) return res.status(404).json({ error: 'Customer order not found' });
    const items = (await db.query('SELECT * FROM customer_order_items WHERE customer_order_id = $1 ORDER BY id', [co.id])).rows
      .map(it => ({ description: it.description, hsn: '', uom: it.unit || 'nos', quantity: it.quantity, rate: it.target_price || 0 }));
    const customer = co.customer_id ? (await db.query('SELECT * FROM customers WHERE id = $1', [co.customer_id])).rows[0] : null;
    res.json({ customerOrder: co, customerId: co.customer_id, customer, placeOfSupply: customer?.state || '', items });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// GET /delivery-challans/:id
exports.getById = async (req, res) => {
  try {
    const s = scopedById(req, req.params.id);
    const dc = (await db.query(`SELECT * FROM delivery_challans WHERE ${s.where}`, s.params)).rows[0];
    if (!dc) return res.status(404).json({ error: 'Delivery challan not found' });
    const items = (await db.query('SELECT * FROM delivery_challan_items WHERE delivery_challan_id = $1 ORDER BY sort_order', [req.params.id])).rows;
    const customer = dc.customer_id ? (await db.query('SELECT * FROM customers WHERE id = $1', [dc.customer_id])).rows[0] : null;
    let company = null;
    try { company = (await db.query('SELECT * FROM company_profile LIMIT 1')).rows[0] || null; } catch { /* optional */ }
    res.json({ ...dc, items, customer, company });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// POST /delivery-challans
exports.create = async (req, res) => {
  const { customerId, customerOrderId, challanDate, dispatchThrough, vehicleNo, lrNo, placeOfSupply, items, notes } = req.body;
  if (!customerId) return res.status(400).json({ error: 'Pick a customer' });
  if (!items || !items.length) return res.status(400).json({ error: 'Add at least one item' });
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const lines = items.map(it => ({ ...it, amount: r2((Number(it.quantity) || 0) * (Number(it.rate) || 0)) }));
    const totalValue = r2(lines.reduce((s, l) => s + l.amount, 0));
    const cnt = await client.query('SELECT COUNT(*) FROM delivery_challans');
    const num = `DC-${String(parseInt(cnt.rows[0].count) + 1).padStart(4, '0')}`;
    const { rows } = await client.query(
      `INSERT INTO delivery_challans (owner_id, customer_id, customer_order_id, challan_number, challan_date,
         dispatch_through, vehicle_no, lr_no, place_of_supply, total_value, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [req.user?.id || null, customerId, customerOrderId || null, num, challanDate || null,
       dispatchThrough || null, vehicleNo || null, lrNo || null, placeOfSupply || null, totalValue, notes || null]);
    const dcId = rows[0].id;
    let so = 0;
    for (const l of lines) {
      await client.query(
        `INSERT INTO delivery_challan_items (delivery_challan_id, description, hsn, uom, quantity, rate, amount, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [dcId, l.description, l.hsn || null, l.uom || 'nos', l.quantity || 0, l.rate || 0, l.amount || 0, so++]);
    }
    await client.query('COMMIT');
    res.json({ id: dcId, challanNumber: num, totalValue });
  } catch (e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); }
  finally { client.release(); }
};

// PATCH /delivery-challans/:id/status
exports.setStatus = async (req, res) => {
  const { status } = req.body;
  const allowed = ['Draft', 'Dispatched', 'Delivered'];
  if (!allowed.includes(status)) return res.status(400).json({ error: `status must be one of ${allowed.join(', ')}` });
  try {
    const dc = (await db.query('SELECT challan_number, customer_order_id FROM delivery_challans WHERE id = $1', [req.params.id])).rows[0];
    if (!dc) return res.status(404).json({ error: 'not found' });
    await db.query('UPDATE delivery_challans SET status = $1 WHERE id = $2', [status, req.params.id]);
    // When dispatched/delivered, nudge the linked order forward (never backwards).
    if ((status === 'Dispatched' || status === 'Delivered') && dc.customer_order_id) {
      await db.query(`UPDATE customer_orders SET status = 'Delivered' WHERE id = $1 AND status NOT IN ('Delivered','Closed')`, [dc.customer_order_id]);
    }
    if (status === 'Dispatched') notify('admins', { type: 'GOODS_DISPATCHED', title: `Dispatched · ${dc.challan_number}`, message: 'Goods dispatched to the customer', entityType: 'delivery_challan', entityId: Number(req.params.id), link: '/delivery-challans' });
    res.json({ success: true, status });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// DELETE /delivery-challans/:id
exports.remove = async (req, res) => {
  try {
    const r = await db.query('DELETE FROM delivery_challans WHERE id = $1', [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'not found' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
};
