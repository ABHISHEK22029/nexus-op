/* ══════════════════════════════════════════════════════════
   SalesController — customer orders + vendor quotations (Q1/Q2/Q3)
   Flow: Customer Order → parts → Quotation (3 vendor quotes) →
         select best → generate Vendor PO (existing purchase_orders)
   All owner-scoped: admin sees all, a user sees only their own.
   ══════════════════════════════════════════════════════════ */
const db = require('../db');
const { computeOrder } = require('../shared/orderTotals');
const { isInterstate } = require('../shared/gstStates');
const { amountInWords } = require('../shared/amountInWords');
const { scopedById } = require('../shared/ownerScope');
const { isCrossTenant } = require('../shared/roles');
const { runList } = require('../shared/listQuery');
const isAdmin = (req) => isCrossTenant(req.user?.role);

/* ── Customer Orders ── */
exports.getOrders = async (req, res) => {
  try {
    const admin = isAdmin(req);
    const where = [], params = [];
    if (!admin) { params.push(req.user.id); where.push(`owner_id = $${params.length}`); }
    /* Customer name joined in a subquery so it is searchable — people look
       for "Apollo", not for CO-0004. order_value is derived from the lines
       because the header carries no total of its own; the page needs it for
       the summary tile above the table. */
    const result = await runList(db, {
      table: `(SELECT co.*, c.name AS customer_name,
                      (SELECT COUNT(*) FROM customer_order_items WHERE customer_order_id = co.id) AS item_count,
                      (SELECT COALESCE(SUM(COALESCE(quantity,0) * COALESCE(target_price,0)),0)
                         FROM customer_order_items WHERE customer_order_id = co.id) AS order_value
                 FROM customer_orders co LEFT JOIN customers c ON c.id = co.customer_id) AS co`,
      query: req.query,
      searchColumns: ["order_number", "customer_name", "customer_po_ref", "status", "notes"],
      filterColumns: ["status", "customer_id"],
      allowedSort: ["id", "order_number", "order_date", "status", "order_value"],
      defaultSort: 'id', defaultDir: 'DESC',
      where, params,
      /* Aggregated over the whole filtered set, not the page — otherwise
         "Order value" would silently mean "value on page 1".
         `empty_orders` is the needs-attention count: an order taken with no
         lines on it cannot be quoted, made or invoiced. */
      summary: `COUNT(*)::int AS count,
                COALESCE(SUM(order_value),0)::numeric AS value,
                COUNT(*) FILTER (WHERE status = 'Open')::int AS open,
                COUNT(*) FILTER (WHERE status = 'In Procurement')::int AS in_procurement,
                COUNT(*) FILTER (WHERE COALESCE(item_count,0) = 0)::int AS empty_orders`,
    });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.createOrder = async (req, res) => {
  const {
    customerId, customerPoRef, orderDate, notes, items,
    expectedShipmentDate, paymentTerms, paymentTermsDays, deliveryMethod, salesperson,
    discount, discountType, gstRate, taxDeductionType, taxDeductionRate,
    adjustment, adjustmentLabel, roundOff, terms, status,
  } = req.body;
  if (!customerId) return res.status(400).json({ error: 'Pick a customer' });
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    /* Place of supply decides CGST+SGST vs IGST, and it follows where the
       goods GO — the shipping state — not where the customer is registered.
       Same rule the invoice uses; deriving it here means the order and the
       invoice it becomes cannot disagree about the tax. */
    const cust = (await client.query('SELECT * FROM customers WHERE id = $1', [customerId])).rows[0];
    let company = null;
    try { company = (await client.query('SELECT * FROM company_profile LIMIT 1')).rows[0] || null; } catch { /* optional */ }
    const supplyState = cust?.shipping_state || cust?.state || null;
    const inter = isInterstate(company?.stateCode || company?.gstin, supplyState);

    const t = computeOrder(items, {
      discount, discountType, gstRate: gstRate ?? 18, interstate: inter === true,
      taxDeductionType, taxDeductionRate, adjustment, roundOff,
    });

    const c = await client.query('SELECT COUNT(*) FROM customer_orders WHERE owner_id = $1', [req.user?.id || null]);
    const orderNumber = `CO-${String(parseInt(c.rows[0].count) + 1).padStart(4, '0')}`;

    const { rows } = await client.query(
      `INSERT INTO customer_orders
         (owner_id, customer_id, order_number, customer_po_ref, order_date, notes, status,
          expected_shipment_date, payment_terms, payment_terms_days, delivery_method, salesperson,
          sub_total, discount, discount_type, gst_rate, interstate, cgst, sgst, igst, gst_total,
          tax_deduction_type, tax_deduction_rate, tax_deduction_amount,
          adjustment_label, adjustment, round_off, total, amount_in_words, terms)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30)
       RETURNING id`,
      [req.user?.id || null, customerId, orderNumber, customerPoRef || null, orderDate || null,
       notes || null, status || 'Open',
       expectedShipmentDate || null, paymentTerms || null,
       paymentTermsDays ?? cust?.payment_terms_days ?? null, deliveryMethod || null, salesperson || null,
       t.subTotal, discount || 0, discountType || 'percent', gstRate ?? 18, inter === true,
       t.cgst, t.sgst, t.igst, t.gstTotal,
       taxDeductionType || null, taxDeductionRate || null, t.taxDeductionAmount,
       adjustmentLabel || 'Adjustment', t.adjustment, t.roundOff, t.total,
       amountInWords(t.total), terms || company?.invoice_terms || null]
    );
    const orderId = rows[0].id;

    let sort = 0;
    for (const l of t.lines) {
      if (!l.description) continue;
      await client.query(
        `INSERT INTO customer_order_items
           (customer_order_id, sku_id, description, hsn, quantity, unit, rate, target_price,
            discount, discount_type, tax_rate, amount, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [orderId, l.skuId || null, l.description, l.hsn || null, l.quantity || null,
         l.unit || l.uom || 'nos', l.rate ?? l.targetPrice ?? null, l.targetPrice ?? l.rate ?? null,
         l.discount || 0, l.discountType || 'percent', l.taxRate ?? null, l.amount, sort++]
      );
    }

    await client.query('COMMIT');
    res.json({ id: orderId, orderNumber, total: t.total, interstateKnown: inter !== null });
  } catch (e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); }
  finally { client.release(); }
};

exports.getOrderById = async (req, res) => {
  try {
    /* Owner-scoped. This read `WHERE id = $1` with no owner check, and a
       probe from a second tenant confirmed it returned the order number,
       the customer's name and GSTIN, and every line with its description
       and rate — a customer list and a price book, reachable by counting
       integers. */
    const s = scopedById(req, req.params.id);
    const o = await db.query(`SELECT * FROM customer_orders WHERE ${s.where}`, s.params);
    if (!o.rows[0]) return res.status(404).json({ error: 'Order not found' });
    const cust = await db.query('SELECT * FROM customers WHERE id = $1', [o.rows[0].customer_id]);
    const items = await db.query('SELECT * FROM customer_order_items WHERE customer_order_id = $1 ORDER BY id', [req.params.id]);
    res.json({ ...o.rows[0], customer: cust.rows[0] || null, items: items.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.updateOrderStatus = async (req, res) => {
  const { status } = req.body;
  const allowed = ['Open', 'In Procurement', 'Delivered', 'Closed'];
  if (!allowed.includes(status)) return res.status(400).json({ error: `status must be one of ${allowed.join(', ')}` });
  try {
    const r = await db.query('UPDATE customer_orders SET status = $1 WHERE id = $2', [status, req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'not found' });
    res.json({ success: true, status });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.deleteOrder = async (req, res) => {
  try {
    const r = await db.query('DELETE FROM customer_orders WHERE id = $1', [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'not found' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

/* ── Quotations (Q1 / Q2 / Q3) ── */
exports.getQuotations = async (req, res) => {
  try {
    const admin = isAdmin(req);
    const where = [], params = [];
    if (!admin) { params.push(req.user.id); where.push(`owner_id = $${params.length}`); }
    /* The quoted vendors are the human-readable handle here — "who did we
       ask for the flange?" — so their names are rolled up in a subquery and
       made searchable alongside the part description. quote_count drives the
       "still waiting on quotes" figure. */
    const result = await runList(db, {
      table: `(SELECT q.*,
                      (SELECT string_agg(DISTINCT ql.vendor_name, ', ')
                         FROM quote_lines ql WHERE ql.quotation_id = q.id) AS vendor_names,
                      (SELECT COUNT(*) FROM quote_lines ql WHERE ql.quotation_id = q.id) AS quote_count
                 FROM quotations q) AS q`,
      query: req.query,
      searchColumns: ["part_description", "vendor_names", "status", "unit"],
      filterColumns: ["status"],
      allowedSort: ["id", "part_description", "quantity", "status", "created_at"],
      defaultSort: 'id', defaultDir: 'DESC',
      where, params,
      /* Three quotes is the rule this screen enforces (Q1/Q2/Q3), so the
         count that needs action is the one still short of three. */
      summary: `COUNT(*)::int AS count,
                COUNT(*) FILTER (WHERE status = 'Selected')::int AS selected,
                COUNT(*) FILTER (WHERE status = 'PO Raised')::int AS po_raised,
                COUNT(*) FILTER (WHERE COALESCE(quote_count,0) < 3)::int AS awaiting_quotes,
                COALESCE(SUM(quote_count),0)::int AS quote_lines`,
    });

    // Attach the vendor quote lines, exactly as before.
    const rows = Array.isArray(result) ? result : result.items;
    const withLines = await Promise.all(rows.map(async (q) => {
      const l = await db.query('SELECT * FROM quote_lines WHERE quotation_id = $1 ORDER BY slot', [q.id]);
      return { ...q, lines: l.rows };
    }));
    res.json(Array.isArray(result) ? withLines : { ...result, items: withLines });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.createQuotation = async (req, res) => {
  const { partDescription, quantity, unit, customerOrderItemId } = req.body;
  if (!partDescription) return res.status(400).json({ error: 'Enter the part / material to quote' });
  try {
    const { rows } = await db.query(
      `INSERT INTO quotations (owner_id, customer_order_item_id, part_description, quantity, unit)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [req.user?.id || null, customerOrderItemId || null, partDescription, quantity || null, unit || 'nos']
    );
    res.json({ id: rows[0].id });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.getQuotationById = async (req, res) => {
  try {
    // Owner-scoped: vendor quotes carry competitors' pricing.
    const s = scopedById(req, req.params.id);
    const q = await db.query(`SELECT * FROM quotations WHERE ${s.where}`, s.params);
    if (!q.rows[0]) return res.status(404).json({ error: 'Quotation not found' });
    const l = await db.query('SELECT * FROM quote_lines WHERE quotation_id = $1 ORDER BY slot', [req.params.id]);
    res.json({ ...q.rows[0], lines: l.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.addQuoteLine = async (req, res) => {
  const { vendorId, vendorName, unitPrice, leadTimeDays, terms } = req.body;
  try {
    const cnt = await db.query('SELECT COUNT(*) FROM quote_lines WHERE quotation_id = $1', [req.params.id]);
    const slot = parseInt(cnt.rows[0].count) + 1;
    if (slot > 3) return res.status(400).json({ error: 'Max 3 quotes (Q1 / Q2 / Q3)' });
    const { rows } = await db.query(
      `INSERT INTO quote_lines (quotation_id, slot, vendor_id, vendor_name, unit_price, lead_time_days, terms)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [req.params.id, slot, vendorId || null, vendorName || null, unitPrice || null, leadTimeDays || null, terms || null]
    );
    res.json({ id: rows[0].id, slot });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.deleteQuoteLine = async (req, res) => {
  try { await db.query('DELETE FROM quote_lines WHERE id = $1', [req.params.lineId]); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
};

exports.selectQuote = async (req, res) => {
  const { quoteLineId } = req.body;
  try {
    await db.query('UPDATE quotations SET selected_quote_id = $1, status = $2 WHERE id = $3', [quoteLineId, 'Selected', req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.deleteQuotation = async (req, res) => {
  try {
    const r = await db.query('DELETE FROM quotations WHERE id = $1', [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'not found' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// Turn the selected quote into a real Vendor PO (existing purchase_orders).
exports.generatePO = async (req, res) => {
  const { projectId } = req.body;
  try {
    const quote = (await db.query('SELECT * FROM quotations WHERE id = $1', [req.params.id])).rows[0];
    if (!quote) return res.status(404).json({ error: 'quotation not found' });
    if (!quote.selected_quote_id) return res.status(400).json({ error: 'Select a winning vendor quote first' });
    const line = (await db.query('SELECT * FROM quote_lines WHERE id = $1', [quote.selected_quote_id])).rows[0];
    if (!line) return res.status(400).json({ error: 'selected quote missing' });
    if (!line.vendor_id) return res.status(400).json({ error: 'The selected quote has no linked vendor — pick a vendor from your Vendors list on that quote' });
    if (!projectId) return res.status(400).json({ error: 'Select an active project (top bar) to raise the PO against' });

    // Trace back to the customer order (quotation → order item → order).
    let customerOrderId = null;
    if (quote.customer_order_item_id) {
      const oi = await db.query('SELECT customer_order_id FROM customer_order_items WHERE id = $1', [quote.customer_order_item_id]);
      customerOrderId = oi.rows[0]?.customer_order_id || null;
    }
    const c = await db.query('SELECT COUNT(*) FROM purchase_orders');
    const poNumber = `Kirashi/FY2026-27/${String(parseInt(c.rows[0].count) + 1).padStart(3, '0')}`;
    const { rows } = await db.query(
      `INSERT INTO purchase_orders ("projectId","vendorId","itemName",quantity,"unitPrice","poNumber",customer_order_id,quotation_id,status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'Pending') RETURNING id`,
      [projectId, line.vendor_id, quote.part_description, quote.quantity || 1, line.unit_price || 0, poNumber, customerOrderId, quote.id]
    );
    await db.query(
      `INSERT INTO po_line_items ("poId", sno, description, uom, quantity, "unitPrice")
       VALUES ($1,1,$2,$3,$4,$5)`,
      [rows[0].id, quote.part_description, quote.unit || 'nos', quote.quantity || 1, line.unit_price || 0]
    );
    await db.query('UPDATE quotations SET status = $1 WHERE id = $2', ['PO Raised', req.params.id]);
    // Move the customer order into procurement automatically.
    if (customerOrderId) {
      await db.query(`UPDATE customer_orders SET status = 'In Procurement' WHERE id = $1 AND status = 'Open'`, [customerOrderId]);
    }
    res.json({ poId: rows[0].id, poNumber, customerOrderId });
  } catch (e) { res.status(500).json({ error: e.message }); }
};
