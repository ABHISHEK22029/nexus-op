/* ══════════════════════════════════════════════════════════
   SalesQuotationController — customer-facing quotations (Wave 1A)
   Quote a customer for parts/products, then convert a won quote
   straight into a Customer Order. GST + amount-in-words mirror the
   sales-invoice logic; owner-scoped.
   ══════════════════════════════════════════════════════════ */
const db = require('../db');
const { isCrossTenant } = require('../shared/roles');
const { scopedById } = require('../shared/ownerScope');
const { runList } = require('../shared/listQuery');
const { notify } = require('../notify');
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const isAdmin = (req) => isCrossTenant(req.user?.role);

function amountInWords(num) {
  num = Math.round(Number(num) || 0);
  if (num === 0) return 'Rupees Zero Only';
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = (n) => n < 20 ? a[n] : b[Math.floor(n / 10)] + (n % 10 ? ' ' + a[n % 10] : '');
  const three = (n) => (Math.floor(n / 100) ? a[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' : '') : '') + (n % 100 ? two(n % 100) : '');
  let out = '', crore = Math.floor(num / 10000000); num %= 10000000;
  let lakh = Math.floor(num / 100000); num %= 100000;
  let thousand = Math.floor(num / 1000); num %= 1000;
  if (crore) out += three(crore) + ' Crore ';
  if (lakh) out += two(lakh) + ' Lakh ';
  if (thousand) out += two(thousand) + ' Thousand ';
  if (num) out += three(num);
  return 'Rupees ' + out.trim().replace(/\s+/g, ' ') + ' Only';
}

function compute(items, { discount = 0, gstRate = 18, interstate = false, roundOff = 0 }) {
  const lines = (items || []).map(it => ({ ...it, amount: r2((Number(it.quantity) || 0) * (Number(it.rate) || 0)) }));
  const subTotal = r2(lines.reduce((s, l) => s + l.amount, 0));
  const taxable = r2(subTotal - Number(discount || 0));
  const gstTotal = r2(taxable * (Number(gstRate) || 0) / 100);
  const cgst = interstate ? 0 : r2(gstTotal / 2);
  const sgst = interstate ? 0 : r2(gstTotal - cgst);
  const igst = interstate ? gstTotal : 0;
  const net = r2(taxable + gstTotal + Number(roundOff || 0));
  return { lines, subTotal, gstTotal, cgst, sgst, igst, net };
}

async function deriveInterstate(customerId) {
  let company = null, customer = null;
  try { company = (await db.query('SELECT * FROM company_profile LIMIT 1')).rows[0] || null; } catch { /* optional */ }
  if (customerId) customer = (await db.query('SELECT * FROM customers WHERE id = $1', [customerId])).rows[0];
  const companyState = String(company?.stateCode || (company?.gstin || '').substring(0, 2) || '');
  const custState = String(customer?.gstin || '').substring(0, 2);
  return !!custState && !!companyState && custState !== companyState;
}

// GET /sales-quotations
exports.list = async (req, res) => {
  try {
    const admin = isAdmin(req);
    const where = [], params = [];
    if (!admin) { params.push(req.user.id); where.push(`owner_id = $${params.length}`); }
    // Joined in a subquery so the customer/party name is searchable too —
    // people look for "Apollo", not for an invoice number they don't have.
    const result = await runList(db, {
      table: `(SELECT sq.*, c.name AS customer_name FROM sales_quotations sq LEFT JOIN customers c ON c.id = sq.customer_id) AS sq`,
      query: req.query,
      searchColumns: ["quote_number","customer_name","status"],
      filterColumns: ["status","customer_id"],
      allowedSort: ["id","quote_number","quote_date","valid_until","net_amount","status"],
      defaultSort: 'id', defaultDir: 'DESC',
      where, params,
      /* Aggregated over the filter, not the page — see runList. "Open value"
         is the number a sales desk actually watches: what is quoted and
         still winnable, excluding what has already converted or died. */
      summary: `COUNT(*)::int AS count,
                COALESCE(SUM(net_amount),0)::numeric AS quoted,
                COALESCE(SUM(net_amount) FILTER (WHERE status IN ('Draft','Sent')),0)::numeric AS open_value,
                COUNT(*) FILTER (WHERE status = 'Converted')::int AS won,
                COUNT(*) FILTER (WHERE valid_until IS NOT NULL AND valid_until < CURRENT_DATE
                                   AND status NOT IN ('Converted','Rejected'))::int AS expired`,
    });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// GET /sales-quotations/:id
exports.getById = async (req, res) => {
  try {
    const s = scopedById(req, req.params.id);
    const q = (await db.query(`SELECT * FROM sales_quotations WHERE ${s.where}`, s.params)).rows[0];
    if (!q) return res.status(404).json({ error: 'Quotation not found' });
    const items = (await db.query('SELECT * FROM sales_quotation_items WHERE sales_quotation_id = $1 ORDER BY sort_order', [req.params.id])).rows;
    const customer = q.customer_id ? (await db.query('SELECT * FROM customers WHERE id = $1', [q.customer_id])).rows[0] : null;
    let company = null;
    try { company = (await db.query('SELECT * FROM company_profile LIMIT 1')).rows[0] || null; } catch { /* optional */ }
    res.json({ ...q, items, customer, company });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// POST /sales-quotations
exports.create = async (req, res) => {
  const { customerId, quoteDate, validUntil, items, discount, gstRate, roundOff, notes, terms } = req.body;
  if (!customerId) return res.status(400).json({ error: 'Pick a customer' });
  if (!items || !items.length) return res.status(400).json({ error: 'Add at least one line item' });
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const interstate = await deriveInterstate(customerId);
    const t = compute(items, { discount, gstRate, interstate, roundOff });
    const cnt = await client.query('SELECT COUNT(*) FROM sales_quotations');
    const qnum = `QT-${String(parseInt(cnt.rows[0].count) + 1).padStart(4, '0')}`;
    const { rows } = await client.query(
      `INSERT INTO sales_quotations (owner_id, customer_id, quote_number, quote_date, valid_until,
         sub_total, discount, gst_rate, interstate, cgst, sgst, igst, gst_total, round_off, net_amount, amount_in_words, notes, terms)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING id`,
      [req.user?.id || null, customerId, qnum, quoteDate || null, validUntil || null,
       t.subTotal, discount || 0, gstRate ?? 18, interstate, t.cgst, t.sgst, t.igst, t.gstTotal, roundOff || 0, t.net, amountInWords(t.net), notes || null, terms || null]);
    const qid = rows[0].id;
    let so = 0;
    for (const l of t.lines) {
      await client.query(
        `INSERT INTO sales_quotation_items (sales_quotation_id, sku_id, description, hsn, uom, quantity, rate, amount, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [qid, l.skuId || null, l.description, l.hsn || null, l.uom || 'nos', l.quantity || 0, l.rate || 0, l.amount || 0, so++]);
    }
    await client.query('COMMIT');
    res.json({ id: qid, quoteNumber: qnum, net: t.net });
  } catch (e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); }
  finally { client.release(); }
};

// PATCH /sales-quotations/:id/status
exports.setStatus = async (req, res) => {
  const { status } = req.body;
  const allowed = ['Draft', 'Sent', 'Accepted', 'Rejected', 'Converted'];
  if (!allowed.includes(status)) return res.status(400).json({ error: `status must be one of ${allowed.join(', ')}` });
  try {
    const r = await db.query('UPDATE sales_quotations SET status = $1 WHERE id = $2 RETURNING quote_number', [status, req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'not found' });
    res.json({ success: true, status });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// POST /sales-quotations/:id/convert  → creates a Customer Order from the quote
exports.convertToOrder = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const q = (await client.query('SELECT * FROM sales_quotations WHERE id = $1', [req.params.id])).rows[0];
    if (!q) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Quotation not found' }); }
    if (q.converted_order_id) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'This quotation was already converted to an order' }); }
    const items = (await client.query('SELECT * FROM sales_quotation_items WHERE sales_quotation_id = $1 ORDER BY sort_order', [q.id])).rows;
    if (!items.length) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Quotation has no line items' }); }

    const cnt = await client.query('SELECT COUNT(*) FROM customer_orders');
    const onum = `CO-${String(parseInt(cnt.rows[0].count) + 1).padStart(4, '0')}`;
    const co = await client.query(
      `INSERT INTO customer_orders (owner_id, customer_id, order_number, customer_po_ref, order_date, status, notes)
       VALUES ($1,$2,$3,$4,CURRENT_DATE,'Open',$5) RETURNING id`,
      [q.owner_id, q.customer_id, onum, q.quote_number, `Converted from quotation ${q.quote_number}`]);
    const orderId = co.rows[0].id;
    for (const it of items) {
      await client.query(
        `INSERT INTO customer_order_items (customer_order_id, sku_id, description, quantity, unit, target_price)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [orderId, it.sku_id, it.description, it.quantity, it.uom || 'nos', it.rate]);
    }
    await client.query(`UPDATE sales_quotations SET status = 'Converted', converted_order_id = $1 WHERE id = $2`, [orderId, q.id]);
    await client.query('COMMIT');
    notify(q.owner_id || 'admins', { type: 'QUOTE_CONVERTED', title: `Quotation ${q.quote_number} won`, message: `Converted to order ${onum}`, entityType: 'customer_order', entityId: orderId, link: '/customer-orders' });
    res.json({ success: true, orderId, orderNumber: onum });
  } catch (e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); }
  finally { client.release(); }
};

// DELETE /sales-quotations/:id
exports.remove = async (req, res) => {
  try {
    const r = await db.query('DELETE FROM sales_quotations WHERE id = $1', [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'not found' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
};
