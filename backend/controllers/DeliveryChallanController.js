/* ══════════════════════════════════════════════════════════
   DeliveryChallanController — goods-out note to the customer (Wave 1C)
   Prefills from a customer order; records transporter/vehicle; carries
   the goods value for the e-way bill. Owner-scoped.
   ══════════════════════════════════════════════════════════ */
const db = require('../db');
const stock = require('../shared/stock');
const { isCrossTenant } = require('../shared/roles');
const { scopedById, assertOwned } = require('../shared/ownerScope');
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
      /* `eway_missing` is the one worth surfacing: consignments over the
         Rule 138 threshold of ₹50,000 that have no e-way bill recorded.
         Those are the trucks that get stopped. */
      summary: `COUNT(*)::int AS count,
                COALESCE(SUM(total_value),0)::numeric AS value,
                COUNT(*) FILTER (WHERE status = 'Dispatched')::int AS in_transit,
                COUNT(*) FILTER (WHERE total_value > 50000
                                   AND (eway_bill_no IS NULL OR eway_bill_no = ''))::int AS eway_missing`,
    });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// GET /delivery-challans/prefill/:orderId — build a challan from a customer order
exports.prefill = async (req, res) => {
  try {
    /* Scoped on the SOURCE order. A prefill endpoint is a read of somebody's
       order dressed up as a form helper — this one returned the customer,
       their state, and every line with quantity and rate for any order id.
       Guarding the destination document is not enough when the thing being
       copied is the sensitive part. */
    const s = scopedById(req, req.params.orderId);
    const co = (await db.query(`SELECT * FROM customer_orders WHERE ${s.where}`, s.params)).rows[0];
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
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const s = scopedById(req, req.params.id);
    const dc = (await client.query(`SELECT * FROM delivery_challans WHERE ${s.where}`, s.params)).rows[0];
    if (!dc) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'not found' }); }

    await client.query('UPDATE delivery_challans SET status = $1 WHERE id = $2', [status, req.params.id]);

    /* STOCK LEAVES HERE — on dispatch, the physical event, not on the
       invoice, which is a financial one. A business may raise either
       without the other, so moving stock on both would double-count every
       sale; moving it on neither is what was happening before.

       stock_applied makes this idempotent. A double click, a retry, or a
       status set back to Draft and forward again would otherwise remove the
       goods twice, and nothing about the resulting balance would look
       wrong. */
    const goingOut = status === 'Dispatched' || status === 'Delivered';
    let moved = 0;
    let orderProgress = null;

    if (goingOut && !dc.stock_applied) {
      const items = (await client.query(
        'SELECT * FROM delivery_challan_items WHERE delivery_challan_id = $1', [req.params.id]
      )).rows;
      for (const it of items) {
        if (!(Number(it.quantity) > 0)) continue;
        const invRow = await stock.resolveInventoryRow(client, {
          ownerId: dc.owner_id, itemName: it.description, uom: it.uom, itemType: 'finished',
        });
        await stock.stockOut(client, {
          ownerId: dc.owner_id, inventoryId: invRow.id, itemName: it.description,
          quantity: it.quantity, uom: it.uom, unitCost: invRow.unit_cost,
          movementType: 'dispatch', refType: 'delivery_challan',
          refId: Number(req.params.id), refNumber: dc.challan_number,
          note: 'Goods dispatched to the customer', userId: req.user?.id,
        });
        moved++;
      }
      await client.query(
        'UPDATE delivery_challans SET stock_applied = TRUE, stock_applied_at = NOW() WHERE id = $1',
        [req.params.id]
      );
    }

    /* Pulled back to Draft: the goods did not go. Compensating entries
       rather than deleted rows — a dispatch made in error and reversed is
       two real events, and a ledger that erases its own history cannot
       answer the question it exists for. */
    if (!goingOut && dc.stock_applied) {
      moved = await stock.reverseFor(client, {
        refType: 'delivery_challan', refId: Number(req.params.id),
        movementType: 'dispatch', reversalType: 'dispatch_reversal', userId: req.user?.id,
      });
      await client.query(
        'UPDATE delivery_challans SET stock_applied = FALSE, stock_applied_at = NULL WHERE id = $1',
        [req.params.id]
      );
    }

    /* Advance the linked order by COMPARING QUANTITIES, not by assuming a
       dispatch completes it.

       This previously set the order to 'Delivered' on any dispatch of any
       size. Ship 200 of 1,200 and the order read as finished — which is
       worse than leaving it Open, because it actively tells the shop floor
       that a job with 1,000 units outstanding is done.

       Everything already dispatched is summed, not just this challan: two
       part-shipments that together complete the order should close it, and
       looking only at the current one would leave it open forever. */
    if (goingOut && dc.customer_order_id) {
      const totals = (await client.query(
        `SELECT
           (SELECT COALESCE(SUM(quantity),0) FROM customer_order_items
             WHERE customer_order_id = $1) AS ordered,
           (SELECT COALESCE(SUM(dci.quantity),0)
              FROM delivery_challan_items dci
              JOIN delivery_challans d ON d.id = dci.delivery_challan_id
             WHERE d.customer_order_id = $1
               AND d.status IN ('Dispatched','Delivered')) AS dispatched`,
        [dc.customer_order_id]
      )).rows[0];

      const ordered = Number(totals.ordered) || 0;
      const dispatched = Number(totals.dispatched) || 0;
      // A small tolerance: quantities are `real`, and 1199.9999 is delivered.
      const complete = ordered > 0 && dispatched >= ordered - 0.001;
      const next = complete ? 'Delivered' : 'Partially Delivered';

      await client.query(
        `UPDATE customer_orders SET status = $1
         WHERE id = $2 AND status NOT IN ('Delivered','Closed')`,
        [next, dc.customer_order_id]
      );
      orderProgress = { ordered, dispatched, status: next, complete };
    }

    await client.query('COMMIT');

    if (status === 'Dispatched') notify('admins', { type: 'GOODS_DISPATCHED', title: `Dispatched · ${dc.challan_number}`, message: 'Goods dispatched to the customer', entityType: 'delivery_challan', entityId: Number(req.params.id), link: '/delivery-challans' });
    res.json({ success: true, status, stockLinesMoved: moved, orderProgress });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
};

// DELETE /delivery-challans/:id
exports.remove = async (req, res) => {
  try {
    if (!await assertOwned(db, req, res, 'delivery_challans', req.params.id, { columns: 'id' })) return;
    const r = await db.query('DELETE FROM delivery_challans WHERE id = $1', [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'not found' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
};
