/* ══════════════════════════════════════════════════════════
   SalesInvoiceController — customer tax invoice + payments
   The customer-side mirror of the GRN bill. Prefills from a
   customer order; editable; records payments; owner-scoped.
   ══════════════════════════════════════════════════════════ */
const db = require('../db');
const { notify } = require('../notify');
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const isAdmin = (req) => req.user?.role === 'Admin';

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
  return { lines, subTotal, taxable, gstTotal, cgst, sgst, igst, net };
}

async function deriveInterstate(customerId) {
  let company = null, customer = null;
  try { company = (await db.query('SELECT * FROM company_profile LIMIT 1')).rows[0] || null; } catch { /* optional */ }
  if (customerId) customer = (await db.query('SELECT * FROM customers WHERE id = $1', [customerId])).rows[0];
  const companyState = String(company?.stateCode || (company?.gstin || '').substring(0, 2) || '');
  const custState = String(customer?.gstin || '').substring(0, 2);
  return { interstate: !!custState && !!companyState && custState !== companyState, customer };
}

// GET /sales-invoices/prefill/:customerOrderId — draft from a customer order
exports.prefill = async (req, res) => {
  try {
    const co = (await db.query('SELECT * FROM customer_orders WHERE id = $1', [req.params.customerOrderId])).rows[0];
    if (!co) return res.status(404).json({ error: 'Customer order not found' });
    const items = (await db.query('SELECT * FROM customer_order_items WHERE customer_order_id = $1 ORDER BY id', [co.id])).rows
      .map(it => ({ description: it.description, hsn: '', uom: it.unit || 'nos', quantity: it.quantity, rate: it.target_price || 0 }));
    const { interstate, customer } = await deriveInterstate(co.customer_id);
    res.json({ customerOrder: co, customer, customerId: co.customer_id, interstate, gstRate: 18, items });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// POST /sales-invoices
exports.create = async (req, res) => {
  const { customerId, customerOrderId, invoiceDate, items, discount, gstRate, interstate, roundOff, notes } = req.body;
  if (!customerId) return res.status(400).json({ error: 'Pick a customer' });
  if (!items || !items.length) return res.status(400).json({ error: 'Add at least one line item' });
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const t = compute(items, { discount, gstRate, interstate, roundOff });
    const cnt = await client.query('SELECT COUNT(*) FROM sales_invoices');
    const invNumber = `INV-${String(parseInt(cnt.rows[0].count) + 1).padStart(4, '0')}`;
    const { rows } = await client.query(
      `INSERT INTO sales_invoices (owner_id, customer_id, customer_order_id, invoice_number, invoice_date,
         sub_total, discount, gst_rate, interstate, cgst, sgst, igst, gst_total, round_off, net_amount, amount_in_words, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
      [req.user?.id || null, customerId, customerOrderId || null, invNumber, invoiceDate || null,
       t.subTotal, discount || 0, gstRate ?? 18, !!interstate, t.cgst, t.sgst, t.igst, t.gstTotal, roundOff || 0, t.net, amountInWords(t.net), notes || null]
    );
    const invId = rows[0].id;
    let so = 0;
    for (const l of t.lines) {
      await client.query(
        `INSERT INTO sales_invoice_items (sales_invoice_id, description, hsn, uom, quantity, rate, amount, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [invId, l.description, l.hsn || null, l.uom || 'nos', l.quantity || 0, l.rate || 0, l.amount || 0, so++]
      );
    }
    // Move the customer order forward if this closes it.
    if (customerOrderId) await client.query(`UPDATE customer_orders SET status = 'Delivered' WHERE id = $1 AND status <> 'Closed'`, [customerOrderId]);
    await client.query('COMMIT');
    res.json({ id: invId, invoiceNumber: invNumber, net: t.net });
  } catch (e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); }
  finally { client.release(); }
};

// GET /sales-invoices?customerId=
exports.list = async (req, res) => {
  try {
    const admin = isAdmin(req);
    const { rows } = await db.query(
      `SELECT si.*, c.name AS customer_name FROM sales_invoices si
         LEFT JOIN customers c ON c.id = si.customer_id
        ${admin ? '' : 'WHERE si.owner_id = $1'} ORDER BY si.id DESC`,
      admin ? [] : [req.user.id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// GET /sales-invoices/:id
exports.getById = async (req, res) => {
  try {
    const inv = (await db.query('SELECT * FROM sales_invoices WHERE id = $1', [req.params.id])).rows[0];
    if (!inv) return res.status(404).json({ error: 'Invoice not found' });
    const items = (await db.query('SELECT * FROM sales_invoice_items WHERE sales_invoice_id = $1 ORDER BY sort_order', [req.params.id])).rows;
    const payments = (await db.query('SELECT * FROM sales_payments WHERE sales_invoice_id = $1 ORDER BY id', [req.params.id])).rows;
    const customer = inv.customer_id ? (await db.query('SELECT * FROM customers WHERE id = $1', [inv.customer_id])).rows[0] : null;
    let company = null;
    try { company = (await db.query('SELECT * FROM company_profile LIMIT 1')).rows[0] || null; } catch { /* optional */ }
    res.json({ ...inv, items, payments, customer, company });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// POST /sales-invoices/:id/payment
exports.addPayment = async (req, res) => {
  const { amount, mode, reference, paidDate } = req.body;
  if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'Enter a payment amount' });
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO sales_payments (sales_invoice_id, amount, mode, reference, paid_date) VALUES ($1,$2,$3,$4,$5)`,
      [req.params.id, Number(amount), mode || 'Bank', reference || null, paidDate || null]
    );
    const paid = (await client.query('SELECT COALESCE(SUM(amount),0) s FROM sales_payments WHERE sales_invoice_id = $1', [req.params.id])).rows[0].s;
    const inv = (await client.query('SELECT net_amount FROM sales_invoices WHERE id = $1', [req.params.id])).rows[0];
    const status = paid >= (inv?.net_amount || 0) ? 'Paid' : 'Partially Paid';
    await client.query('UPDATE sales_invoices SET amount_paid = $1, status = $2 WHERE id = $3', [r2(paid), status, req.params.id]);
    const invNo = (await client.query('SELECT invoice_number FROM sales_invoices WHERE id = $1', [req.params.id])).rows[0]?.invoice_number;
    await client.query('COMMIT');
    notify('admins', { type: 'PAYMENT_RECEIVED', title: `Payment received · ${invNo}`, message: `₹${Number(amount).toLocaleString('en-IN')} via ${mode || 'Bank'} — invoice ${status}`, entityType: 'sales_invoice', entityId: Number(req.params.id), link: `/sales-invoices/${req.params.id}` });
    res.json({ success: true, amountPaid: r2(paid), status });
  } catch (e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); }
  finally { client.release(); }
};

exports.setStatus = async (req, res) => {
  const { status } = req.body;
  const allowed = ['Draft', 'Sent', 'Partially Paid', 'Paid'];
  if (!allowed.includes(status)) return res.status(400).json({ error: `status must be one of ${allowed.join(', ')}` });
  try {
    const r = await db.query('UPDATE sales_invoices SET status = $1 WHERE id = $2', [status, req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'not found' });
    res.json({ success: true, status });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.remove = async (req, res) => {
  try {
    const r = await db.query('DELETE FROM sales_invoices WHERE id = $1', [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'not found' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
};
