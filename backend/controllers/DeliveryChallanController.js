/* ══════════════════════════════════════════════════════════
   DeliveryChallanController — goods-out note to the customer (Wave 1C)
   Prefills from a customer order; records transporter/vehicle; carries
   the goods value for the e-way bill. Owner-scoped.
   ══════════════════════════════════════════════════════════ */
const db = require('../db');
const { profileFor } = require('../shared/companyProfile');
const { allocate } = require('../shared/docSeries');
const stock = require('../shared/stock');
const { isCrossTenant } = require('../shared/roles');
const { scopedById, assertOwned } = require('../shared/ownerScope');
const { runList } = require('../shared/listQuery');
const { notify } = require('../notify');
const { syncOrderDelivery, lineProgress, overDispatch } = require('../shared/orderProgress');
const { assertRefs } = require('../shared/ownedRefs');
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const isAdmin = (req) => isCrossTenant(req.user?.role);

// GET /delivery-challans
exports.list = async (req, res) => {
  try {
    const admin = isAdmin(req);
    const where = [], params = [];
    if (!admin) { params.push(req.user.orgId); where.push(`owner_id = $${params.length}`); }
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
    /* The product travels with the line, so dispatch takes stock by
       product rather than by however the line happens to be spelt.
       Only what is still to go: a second challan from the same order
       started again from the full quantity, so the same goods went out
       twice. The HSN comes from the order line, else the product. */
    const { lines } = await lineProgress(db, co.id, co.owner_id);
    const raw = (await db.query(
      `SELECT i.id, i.target_price, i.rate, s.hsn AS sku_hsn FROM customer_order_items i
         LEFT JOIN skus s ON s.id = i.sku_id AND s.owner_id = $2
        WHERE i.customer_order_id = $1`, [co.id, co.owner_id])).rows;
    const byId = new Map(raw.map(r => [r.id, r]));
    const items = lines
      .map(l => ({ l, left: Math.round((l.ordered - l.dispatched) * 10000) / 10000 }))
      .filter(x => x.left > 0.0005)
      .map(({ l, left }) => ({
        description: l.description, hsn: l.hsn || byId.get(l.id)?.sku_hsn || '', uom: l.uom || 'nos',
        quantity: left, ordered: l.ordered, alreadySent: l.dispatched,
        rate: Number(byId.get(l.id)?.target_price ?? byId.get(l.id)?.rate) || 0, skuId: l.skuId,
      }));
    const customer = co.customer_id ? (await db.query(
      'SELECT * FROM customers WHERE id = $1 AND (owner_id = $2 OR owner_id IS NULL)', [co.customer_id, co.owner_id])).rows[0] : null;
    res.json({ customerOrder: co, customerId: co.customer_id, customer, /* Ship-to first: the place of supply is where the goods GO, and a
         challan is the document that travels with them. */
      placeOfSupply: customer?.shipping_state || customer?.state || '', items,
      nothingLeft: items.length === 0 && lines.length > 0,
      message: items.length === 0 && lines.length > 0 ? `Everything on ${co.order_number} has already been sent.` : null });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// GET /delivery-challans/:id
exports.getById = async (req, res) => {
  try {
    const s = scopedById(req, req.params.id);
    const dc = (await db.query(`SELECT * FROM delivery_challans WHERE ${s.where}`, s.params)).rows[0];
    if (!dc) return res.status(404).json({ error: 'Delivery challan not found' });
    const items = (await db.query('SELECT * FROM delivery_challan_items WHERE delivery_challan_id = $1 ORDER BY sort_order', [req.params.id])).rows;
    /* The challan's own company's customer — never another's by id. */
    const customer = dc.customer_id ? (await db.query(
      'SELECT * FROM customers WHERE id = $1 AND (owner_id = $2 OR owner_id IS NULL)', [dc.customer_id, dc.owner_id])).rows[0] : null;
    let company = null;
    try { company = await profileFor(db, req.user?.orgId); } catch { /* optional */ }
    /* The order it ships and the invoices billing that order, so the
       challan can say "against your PO …" and link both ways. */
    const order = dc.customer_order_id ? (await db.query(
      'SELECT id, order_number, customer_po_ref FROM customer_orders WHERE id = $1 AND owner_id IS NOT DISTINCT FROM $2',
      [dc.customer_order_id, dc.owner_id])).rows[0] || null : null;
    const invoices = order ? (await db.query(
      `SELECT id, invoice_number, status FROM sales_invoices
        WHERE customer_order_id = $1 AND owner_id IS NOT DISTINCT FROM $2 ORDER BY id`, [order.id, dc.owner_id])).rows : [];
    res.json({ ...dc, items, customer, company, order, invoices });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// POST /delivery-challans
exports.create = async (req, res) => {
  const { customerId, customerOrderId, challanDate, dispatchThrough, vehicleNo, lrNo, placeOfSupply, items, notes } = req.body;
  if (!customerId) return res.status(400).json({ error: 'Pick a customer' });
  if (!items || !items.length) return res.status(400).json({ error: 'Add at least one item' });
  /* Both ids are this company's. A challan against another company's
     order, once dispatched, set THAT order to Delivered. */
  if (!await assertRefs(db, req, res, {
    customers: [customerId], customer_orders: [customerOrderId],
    skus: items.map(it => it.skuId).filter(Boolean),
  })) return;
  /* A quantity is a number above zero. A line of −5 or "abc" went in as
     it was and, once dispatched, put goods back on the shelf. */
  for (const [n, it] of items.entries()) {
    if (!String(it.description || '').trim()) return res.status(400).json({ error: `Line ${n + 1}: say what is being sent.` });
    const q = Number(it.quantity);
    if (!Number.isFinite(q) || q <= 0) return res.status(400).json({ error: `Line ${n + 1}: the quantity must be more than zero.` });
    if (it.rate != null && it.rate !== '' && (!Number.isFinite(Number(it.rate)) || Number(it.rate) < 0)) {
      return res.status(400).json({ error: `Line ${n + 1}: the rate must be a number, 0 or more.` });
    }
  }
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    /* Not more than the order asked for (a little over on weight and
       length). Draft challans don't count — only what has gone. */
    let co = null;
    if (customerOrderId) {
      co = (await client.query('SELECT id, order_number, owner_id FROM customer_orders WHERE id = $1 FOR UPDATE', [customerOrderId])).rows[0];
      const over = co && await overDispatch(client, { orderId: co.id, orderNumber: co.order_number, ownerId: co.owner_id, items });
      if (over) { await client.query('ROLLBACK'); return res.status(409).json({ error: over }); }
    }
    const lines = items.map(it => ({ ...it, amount: r2((Number(it.quantity) || 0) * (Number(it.rate) || 0)) }));
    const totalValue = r2(lines.reduce((s, l) => s + l.amount, 0));
    /* Where the goods go, as it was on the day: the challan printed the
       customer's CURRENT ship-to, so editing an address rewrote every old
       challan sent to the old one. */
    const cust = (await client.query(
      'SELECT name, shipping_address, billing_address, shipping_state, state FROM customers WHERE id = $1', [customerId])).rows[0] || {};
    /* A challan number travels with the goods under Rule 55, so two loads
       carrying the same one is a real problem at a checkpoint. */
    const num = await allocate(client, { ownerId: req.user?.orgId, docType: 'delivery_challan', date: challanDate || null });
    const { rows } = await client.query(
      `INSERT INTO delivery_challans (owner_id, customer_id, customer_order_id, challan_number, challan_date,
         dispatch_through, vehicle_no, lr_no, place_of_supply, total_value, notes,
         ship_to_name, ship_to_address, ship_to_state)
       VALUES ($1,$2,$3,$4,COALESCE($5::date, CURRENT_DATE),$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
      /* Rule 55 requires the date on a delivery challan — it is the document
         that travels with the goods. Same empty-date-field cause as the
         quotation and the invoice. */
      [req.user?.orgId || null, customerId, customerOrderId || null, num, challanDate || null,
       dispatchThrough || null, vehicleNo || null, lrNo || null, placeOfSupply || null, totalValue, notes || null,
       cust.name || null, cust.shipping_address || cust.billing_address || null, cust.shipping_state || cust.state || null]);
    const dcId = rows[0].id;
    let so = 0;
    for (const l of lines) {
      await client.query(
        `INSERT INTO delivery_challan_items (delivery_challan_id, description, hsn, uom, quantity, rate, amount, sort_order, sku_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [dcId, l.description, l.hsn || null, l.uom || 'nos', l.quantity || 0, l.rate || 0, l.amount || 0, so++, l.skuId || null]);
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
    /* Locked, so a double click is two dispatches in a row rather than two
       at once that both read stock_applied = false. */
    const dc = (await client.query(`SELECT * FROM delivery_challans WHERE ${s.where} FOR UPDATE`, s.params)).rows[0];
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
    const notInStock = [];
    let warning = null;

    if (goingOut && !dc.stock_applied) {
      const items = (await client.query(
        'SELECT * FROM delivery_challan_items WHERE delivery_challan_id = $1 ORDER BY sort_order', [req.params.id]
      )).rows;
      /* Not more than the order asked for, counting what other challans
         have already sent. Two drafts made from the same order would
         otherwise each send the whole of it. */
      if (dc.customer_order_id) {
        const co = (await client.query('SELECT id, order_number, owner_id FROM customer_orders WHERE id = $1 FOR UPDATE', [dc.customer_order_id])).rows[0];
        const over = co && await overDispatch(client, {
          orderId: co.id, orderNumber: co.order_number, ownerId: dc.owner_id, items, excludeChallanId: dc.id,
        });
        if (over) { await client.query('ROLLBACK'); return res.status(409).json({ error: over }); }
      }
      for (const it of items) {
        if (!(Number(it.quantity) > 0)) continue;
        /* By product first, then by name. An item the company has no stock
           record of at all — job work, a sample, goods out for repair — is
           not stock this challan can take from: it goes, nothing is taken,
           and the reply says so. It used to get an empty row taken below
           zero, which is also what happened to a misspelt line while the
           real stock stayed on the shelf. */
        const invRow = await stock.resolveInventoryRow(client, {
          ownerId: dc.owner_id, skuId: it.sku_id || null, itemName: it.description,
          uom: it.uom, itemType: 'finished', outbound: true, create: false,
        });
        if (!invRow) { notInStock.push(it.description); continue; }
        try {
          await stock.stockOut(client, {
            ownerId: dc.owner_id, inventoryId: invRow.id, skuId: it.sku_id || invRow.sku_id || null, itemName: it.description,
            quantity: it.quantity, uom: it.uom, unitCost: invRow.unit_cost,
            movementType: 'dispatch', refType: 'delivery_challan',
            refId: Number(req.params.id), refNumber: dc.challan_number,
            note: 'Goods dispatched to the customer', userId: req.user?.id,
          });
        } catch (e) {
          if (!stock.isShortStock(e)) throw e;
          await client.query('ROLLBACK');
          const d = e.detail, u = d.uom ? ` ${d.uom}` : '';
          return res.status(409).json({
            error: `Only ${d.onHand}${u} of ${it.description} is in stock; this challan sends ${d.needed}${u}. `
              + 'Record the production output or receive the goods first, or send what you have now and the rest on a second challan.',
            shortStock: { ...d, itemName: it.description },
          });
        }
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
      /* The goods are back on the shelf, but an invoice already raised for
         this order still bills them. Said, so it is put right. */
      if (dc.customer_order_id) {
        const inv = (await client.query(
          `SELECT invoice_number FROM sales_invoices
            WHERE customer_order_id = $1 AND owner_id IS NOT DISTINCT FROM $2 AND COALESCE(status,'') <> 'Cancelled'
            ORDER BY id`, [dc.customer_order_id, dc.owner_id])).rows.map(r => r.invoice_number);
        if (inv.length) warning = `The goods are back in stock, but ${inv.join(', ')} still bill${inv.length === 1 ? 's' : ''} this order. If they did not go, cancel the invoice or raise a credit note.`;
      }
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
    /* Moved into shared/orderProgress so the invoice path uses the same
       comparison. It used to live only here, and SalesInvoiceController set
       'Delivered' unconditionally — running after this one and undoing it. */
    /* Either way: a challan pulled back to Draft takes its quantities off
       the order too, or the order kept reading Delivered after the only
       dispatch was reversed. */
    if (dc.customer_order_id) {
      orderProgress = await syncOrderDelivery(client, dc.customer_order_id, dc.owner_id);
    }

    await client.query('COMMIT');

    if (status === 'Dispatched') notify({ org: dc.owner_id }, { type: 'GOODS_DISPATCHED', title: `Dispatched · ${dc.challan_number}`, message: 'Goods dispatched to the customer', entityType: 'delivery_challan', entityId: Number(req.params.id), link: `/delivery-challans/${req.params.id}` });
    res.json({ success: true, status, stockLinesMoved: moved, notInStock, orderProgress, warning });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
};

// DELETE /delivery-challans/:id
exports.remove = async (req, res) => {
  try {
    const dc = await assertOwned(db, req, res, 'delivery_challans', req.params.id, { columns: 'id, status, stock_applied' });
    if (!dc) return;
    /* Deleting a dispatched challan left its goods taken out of stock with
       no document to say where they went. Pulling it back to Draft writes
       the reversal; after that it can go. */
    if (dc.stock_applied || ['Dispatched', 'Delivered'].includes(dc.status)) {
      return res.status(409).json({ error: 'This challan has been dispatched, so its goods have left stock. Pull it back to Draft first, then delete it.' });
    }
    const r = await db.query('DELETE FROM delivery_challans WHERE id = $1', [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'not found' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

/* PATCH /delivery-challans/:id   Body: { eway_bill_no }

   The challan has always warned "E-way bill required — and not recorded …
   record the number here before the vehicle leaves", and there was nowhere
   to record it: the column existed, nothing wrote to it. An e-way bill
   number is twelve digits (Rule 138); spaces are dropped, and an empty
   value clears it. Yours only. */
exports.updateDetails = async (req, res) => {
  if (!('eway_bill_no' in (req.body || {}))) return res.status(400).json({ error: 'Nothing to update — send eway_bill_no' });
  const raw = req.body.eway_bill_no;
  const value = raw == null ? '' : String(raw).replace(/\s+/g, '');
  if (value && !/^\d{12}$/.test(value)) {
    return res.status(400).json({ error: 'An e-way bill number is 12 digits.' });
  }
  try {
    if (!await assertOwned(db, req, res, 'delivery_challans', req.params.id, { columns: 'id' })) return;
    const { rows } = await db.query(
      'UPDATE delivery_challans SET eway_bill_no = $1 WHERE id = $2 RETURNING id, eway_bill_no',
      [value || null, req.params.id]);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
};
