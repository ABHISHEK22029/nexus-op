/* ══════════════════════════════════════════════════════════
   SalesInvoiceController — customer tax invoice + payments
   The customer-side mirror of the GRN bill. Prefills from a
   customer order; editable; records payments; owner-scoped.
   ══════════════════════════════════════════════════════════ */
const db = require('../db');
const { isCrossTenant } = require('../shared/roles');
const { scopedById } = require('../shared/ownerScope');
const { runList } = require('../shared/listQuery');
const { notify } = require('../notify');
const { toStateCode, toStateName, isInterstate } = require('../shared/gstStates');
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
  return { lines, subTotal, taxable, gstTotal, cgst, sgst, igst, net };
}

/**
 * Resolve the tax treatment for an invoice.
 *
 * Under GST the CGST+SGST vs IGST split follows the PLACE OF SUPPLY — where
 * the goods actually go — not the billing address. A fabricator billing a
 * head office in one state but delivering to a site in another owes IGST.
 * We previously compared the customer's own GSTIN state, which silently
 * charged the wrong tax on every ship-to-elsewhere order.
 *
 * Precedence for place of supply: explicit override → customer's shipping
 * state → customer's billing state → the state in their GSTIN.
 */
async function resolveTax(customerId, placeOfSupplyOverride) {
  let company = null, customer = null;
  try { company = (await db.query('SELECT * FROM company_profile LIMIT 1')).rows[0] || null; } catch { /* optional */ }
  if (customerId) customer = (await db.query('SELECT * FROM customers WHERE id = $1', [customerId])).rows[0];

  const supplierState = company?.stateCode || company?.gstin || null;
  const placeOfSupply =
    placeOfSupplyOverride ||
    customer?.shipping_state ||
    customer?.state ||
    customer?.gstin ||
    null;

  const interstate = isInterstate(supplierState, placeOfSupply);
  return {
    customer,
    company,
    // null (undeterminable) is treated as intra-state, the safer default for a
    // local SME — but the UI flags a blank place of supply before issue.
    interstate: interstate === true,
    interstateKnown: interstate !== null,
    placeOfSupply: toStateName(placeOfSupply),
    placeOfSupplyCode: toStateCode(placeOfSupply),
  };
}


// GET /sales-invoices/prefill/:customerOrderId — draft from a customer order
exports.prefill = async (req, res) => {
  try {
    const co = (await db.query('SELECT * FROM customer_orders WHERE id = $1', [req.params.customerOrderId])).rows[0];
    if (!co) return res.status(404).json({ error: 'Customer order not found' });
    const items = (await db.query('SELECT * FROM customer_order_items WHERE customer_order_id = $1 ORDER BY id', [co.id])).rows
      .map(it => ({ description: it.description, hsn: '', uom: it.unit || 'nos', quantity: it.quantity, rate: it.target_price || 0 }));
    const t = await resolveTax(co.customer_id);
    const c = t.customer || {};
    const termsDays = c.payment_terms_days ?? t.company?.default_payment_terms_days ?? 30;
    const due = new Date(); due.setDate(due.getDate() + Number(termsDays || 0));
    res.json({
      customerOrder: co, customer: t.customer, customerId: co.customer_id,
      interstate: t.interstate, interstateKnown: t.interstateKnown,
      placeOfSupply: t.placeOfSupply, placeOfSupplyCode: t.placeOfSupplyCode,
      // Snapshots — what gets printed, so later edits to the master don't
      // silently rewrite an already-issued document.
      billTo: { name: c.name, address: c.billing_address, gstin: c.gstin, state: c.state },
      shipTo: {
        name: c.name,
        address: c.shipping_address || c.billing_address,
        gstin: c.gstin,
        state: c.shipping_state || c.state,
      },
      dueDate: due.toISOString().slice(0, 10),
      paymentTermsDays: termsDays,
      terms: t.company?.invoice_terms || null,
      reverseCharge: false,
      gstRate: 18, items,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// POST /sales-invoices
exports.create = async (req, res) => {
  const {
    customerId, customerOrderId, invoiceDate, items, discount, gstRate, interstate, roundOff, notes,
    placeOfSupply, billTo, shipTo, dueDate, reverseCharge, terms, ewayBillNo,
  } = req.body;
  if (!customerId) return res.status(400).json({ error: 'Pick a customer' });
  if (!items || !items.length) return res.status(400).json({ error: 'Add at least one line item' });
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    // Place of supply drives the tax split. Trust an explicit choice from the
    // form; otherwise resolve it from the customer's shipping/billing state.
    const tax = await resolveTax(customerId, placeOfSupply);
    const isInter = interstate === undefined || interstate === null ? tax.interstate : !!interstate;
    const t = compute(items, { discount, gstRate, interstate: isInter, roundOff });
    const cnt = await client.query('SELECT COUNT(*) FROM sales_invoices');
    const invNumber = `INV-${String(parseInt(cnt.rows[0].count) + 1).padStart(4, '0')}`;
    const c = tax.customer || {};
    const bt = billTo || {};
    const st = shipTo || {};
    const { rows } = await client.query(
      `INSERT INTO sales_invoices (owner_id, customer_id, customer_order_id, invoice_number, invoice_date,
         sub_total, discount, gst_rate, interstate, cgst, sgst, igst, gst_total, round_off, net_amount, amount_in_words, notes,
         place_of_supply, place_of_supply_code, reverse_charge, due_date, terms, eway_bill_no,
         bill_to_name, bill_to_address, bill_to_gstin, bill_to_state,
         ship_to_name, ship_to_address, ship_to_gstin, ship_to_state)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
               $18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31) RETURNING id`,
      [req.user?.id || null, customerId, customerOrderId || null, invNumber, invoiceDate || null,
       t.subTotal, discount || 0, gstRate ?? 18, isInter, t.cgst, t.sgst, t.igst, t.gstTotal, roundOff || 0, t.net, amountInWords(t.net), notes || null,
       tax.placeOfSupply || null, tax.placeOfSupplyCode || null, !!reverseCharge, dueDate || null, terms || null, ewayBillNo || null,
       bt.name || c.name || null, bt.address || c.billing_address || null, bt.gstin || c.gstin || null, bt.state || c.state || null,
       st.name || c.name || null, st.address || c.shipping_address || c.billing_address || null,
       st.gstin || c.gstin || null, st.state || c.shipping_state || c.state || null]
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
    const where = [], params = [];
    if (!admin) { params.push(req.user.id); where.push(`owner_id = $${params.length}`); }
    // Joined in a subquery so the customer/party name is searchable too —
    // people look for "Apollo", not for an invoice number they don't have.
    const result = await runList(db, {
      table: `(SELECT si.*, c.name AS customer_name FROM sales_invoices si LEFT JOIN customers c ON c.id = si.customer_id) AS si`,
      query: req.query,
      searchColumns: ["invoice_number","customer_name","status","place_of_supply"],
      filterColumns: ["status","customer_id"],
      allowedSort: ["id","invoice_number","invoice_date","due_date","net_amount","status"],
      defaultSort: 'id', defaultDir: 'DESC',
      where, params,
      /* Totals over the whole filtered set, not the page. The page header
         sums these; summing the returned rows would make "Total Billed"
         silently mean "billed on page 1" once pagination kicks in. */
      summary: `COUNT(*)::int AS count,
                COALESCE(SUM(net_amount),0)::numeric AS billed,
                COALESCE(SUM(COALESCE(amount_paid,0)),0)::numeric AS received,
                COALESCE(SUM(GREATEST(net_amount - COALESCE(amount_paid,0), 0)),0)::numeric AS outstanding`,
    });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// GET /sales-invoices/:id
exports.getById = async (req, res) => {
  try {
    const s = scopedById(req, req.params.id);
    const inv = (await db.query(`SELECT * FROM sales_invoices WHERE ${s.where}`, s.params)).rows[0];
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
