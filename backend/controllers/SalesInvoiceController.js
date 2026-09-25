/* ══════════════════════════════════════════════════════════
   SalesInvoiceController — customer tax invoice + payments
   The customer-side mirror of the GRN bill. Prefills from a
   customer order; editable; records payments; owner-scoped.
   ══════════════════════════════════════════════════════════ */
const db = require('../db');
const { profileFor } = require('../shared/companyProfile');
const { nextSeq } = require('../shared/docNumber');
const { isCrossTenant } = require('../shared/roles');
const { scopedById, assertOwned } = require('../shared/ownerScope');
const { runList } = require('../shared/listQuery');
const { notify } = require('../notify');
const { toStateCode, toStateName, isInterstate } = require('../shared/gstStates');
const { syncOrderDelivery } = require('../shared/orderProgress');
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
/* Takes the executor and the organisation.
 *
 * There is no `req` in here, so reading req.user threw a ReferenceError
 * straight into the catch below — leaving `company` null, `supplierState`
 * null, and therefore the interstate test false on EVERY invoice. That is
 * CGST+SGST charged on an interstate sale, which is the wrong tax on a
 * document the customer files.
 *
 * `exec` because one caller runs inside an open transaction: reaching for
 * the pool there makes a single request need two connections at once, which
 * deadlocks a pool of four.
 */
async function resolveTax(exec, ownerId, customerId, placeOfSupplyOverride) {
  let company = null, customer = null;
  try { company = await profileFor(exec, ownerId); } catch { /* optional */ }
  if (customerId) customer = (await exec.query('SELECT * FROM customers WHERE id = $1', [customerId])).rows[0];

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
    /* Scoped on the SOURCE order — see DeliveryChallanController.prefill.
       This one leaked the most: customer, GSTIN, place of supply, payment
       terms and every line with its rate. */
    const s = scopedById(req, req.params.customerOrderId);
    const co = (await db.query(`SELECT * FROM customer_orders WHERE ${s.where}`, s.params)).rows[0];
    if (!co) return res.status(404).json({ error: 'Customer order not found' });
    const items = (await db.query('SELECT * FROM customer_order_items WHERE customer_order_id = $1 ORDER BY id', [co.id])).rows
      .map(it => ({ description: it.description, hsn: '', uom: it.unit || 'nos', quantity: it.quantity, rate: it.target_price || 0 }));
    const t = await resolveTax(db, req.user?.orgId, co.customer_id);
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
    /* On the transaction's client, not the pool — see resolveTax. */
    const tax = await resolveTax(client, req.user?.orgId, customerId, placeOfSupply);
    const isInter = interstate === undefined || interstate === null ? tax.interstate : !!interstate;
    const t = compute(items, { discount, gstRate, interstate: isInter, roundOff });
    /* A tax invoice number must be unique within the financial year — Rule
       46. A count reissues one after any deletion, and a duplicate invoice
       number is a GSTR-1 filing error, so this is the call site that
       mattered most. */
    const invNumber = `INV-${String(await nextSeq(client, {
      ownerId: req.user?.orgId, docType: 'sales_invoice',
    })).padStart(4, '0')}`;
    const c = tax.customer || {};
    const bt = billTo || {};
    const st = shipTo || {};
    const { rows } = await client.query(
      `INSERT INTO sales_invoices (owner_id, customer_id, customer_order_id, invoice_number, invoice_date,
         sub_total, discount, gst_rate, interstate, cgst, sgst, igst, gst_total, round_off, net_amount, amount_in_words, notes,
         place_of_supply, place_of_supply_code, reverse_charge, due_date, terms, eway_bill_no,
         bill_to_name, bill_to_address, bill_to_gstin, bill_to_state,
         ship_to_name, ship_to_address, ship_to_gstin, ship_to_state)
       VALUES ($1,$2,$3,$4,COALESCE($5::date, CURRENT_DATE),$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
               $18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31) RETURNING id`,
      /* Rule 46(b) makes the date a mandatory particular of a tax invoice.
         The builder's date field starts empty, so 3 of 4 invoices on this
         database had none — a document that is not a valid tax invoice and
         that nothing in the product would have told anyone about. */
      [req.user?.orgId || null, customerId, customerOrderId || null, invNumber, invoiceDate || null,
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
    /* Raising an invoice used to set the order to 'Delivered' outright.
       Invoicing is a billing event, not a delivery event — and because it
       normally happens after dispatch, this ran second and overwrote the
       challan handler's careful quantity comparison. Ship 40 of 100, raise
       the invoice, and the order read Delivered with 60 units never made.

       Now both paths ask the same function, which only looks at what has
       actually been dispatched, and leaves the status alone when nothing
       has. */
    if (customerOrderId) await syncOrderDelivery(client, customerOrderId);
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
    if (!admin) { params.push(req.user.orgId); where.push(`owner_id = $${params.length}`); }
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
    try { company = await profileFor(db, req.user?.orgId); } catch { /* optional */ }
    res.json({ ...inv, items, payments, customer, company });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// POST /sales-invoices/:id/payment
exports.addPayment = async (req, res) => {
  const { amount, mode, reference, paidDate } = req.body;
  if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'Enter a payment amount' });
  /* Checked BEFORE the transaction opens. Recording a payment against
     someone else's invoice corrupts their receivables rather than merely
     reading them, which is why this one mattered most of the 27. */
  if (!await assertOwned(db, req, res, 'sales_invoices', req.params.id, { columns: 'id' })) return;
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    /* A receipt cannot exceed what is owed.
     *
     * Without this an invoice worth ₹11,800 accepted ₹1,11,799 and still
     * reported itself "Paid", and the list summary then said received
     * ₹1,11,799 against billed ₹11,800 — the receivables figure an owner
     * reads on the dashboard, wrong by the size of the typo.
     *
     * Read inside the transaction and FOR UPDATE, or two payments landing
     * together each see the old total and both pass. */
    const cur = (await client.query(
      `SELECT s.net_amount,
              COALESCE((SELECT SUM(amount) FROM sales_payments WHERE sales_invoice_id = s.id), 0) AS paid
         FROM sales_invoices s WHERE s.id = $1 FOR UPDATE`,
      [req.params.id])).rows[0];
    if (cur) {
      const net = Number(cur.net_amount || 0);
      const already = Number(cur.paid || 0);
      const due = net - already;
      /* A paisa of slack: net_amount is numeric and the final instalment is
         often computed by subtraction on the client, so an exact settlement
         can arrive a fraction over and must not be refused. */
      if (Number(amount) > due + 0.01) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: due <= 0.01
            ? `This invoice is already settled in full (₹${net.toFixed(2)}). Nothing is outstanding.`
            : `That is more than is outstanding. Invoice ₹${net.toFixed(2)}, already received ₹${already.toFixed(2)}, so ₹${due.toFixed(2)} remains.`,
          netAmount: net, alreadyPaid: already, outstanding: Math.max(0, due),
        });
      }
    }

    await client.query(
      `INSERT INTO sales_payments (sales_invoice_id, amount, mode, reference, paid_date) VALUES ($1,$2,$3,$4,$5)`,
      [req.params.id, Number(amount), mode || 'Bank', reference || null, paidDate || null]
    );
    const paid = (await client.query('SELECT COALESCE(SUM(amount),0) s FROM sales_payments WHERE sales_invoice_id = $1', [req.params.id])).rows[0].s;
    const inv = (await client.query('SELECT net_amount FROM sales_invoices WHERE id = $1', [req.params.id])).rows[0];
    const status = Number(paid) >= Number(inv?.net_amount || 0) ? 'Paid' : 'Partially Paid';
    await client.query('UPDATE sales_invoices SET amount_paid = $1, status = $2 WHERE id = $3', [r2(paid), status, req.params.id]);
    const invNo = (await client.query('SELECT invoice_number FROM sales_invoices WHERE id = $1', [req.params.id])).rows[0]?.invoice_number;
    await client.query('COMMIT');
    notify('admins', { type: 'PAYMENT_RECEIVED', title: `Payment received · ${invNo}`, message: `₹${Number(amount).toLocaleString('en-IN')} via ${mode || 'Bank'} — invoice ${status}`, entityType: 'sales_invoice', entityId: Number(req.params.id), link: `/sales-invoices/${req.params.id}` });
    res.json({ success: true, amountPaid: r2(paid), status });
  } catch (e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); }
  finally { client.release(); }
};

/* PATCH /sales-invoices/:id — change an invoice after it exists.
 *
 * Stricter than the quotation, because a tax invoice is a statutory
 * document rather than an offer:
 *
 *   Draft                  everything, including the number and the lines
 *   Sent / Paid / part paid  only what does not alter the tax document —
 *                          notes, terms, due date, e-way bill number
 *
 * Rule 46 requires an invoice number to be unique and sequential per
 * supplier, and the buyer claims input credit against the figures on the
 * copy they hold. Quietly changing the rate or the number on an issued
 * invoice leaves their return disagreeing with yours, and the correction
 * the law provides for is a credit or debit note — which this product
 * already has. So once it is issued, the amounts stop being editable here
 * and the note is the way to change what is owed.
 *
 * Money already received is never touched: amount_paid is maintained by
 * addPayment, so it is not in either list.
 */
const INVOICE_DRAFT_FIELDS = ['invoice_number', 'invoice_date', 'due_date', 'discount',
  'gst_rate', 'round_off', 'notes', 'terms', 'customer_id', 'place_of_supply',
  'place_of_supply_code', 'reverse_charge', 'bill_to_name', 'bill_to_address',
  'bill_to_gstin', 'bill_to_state', 'ship_to_name', 'ship_to_address',
  'ship_to_gstin', 'ship_to_state', 'eway_bill_no'];
const INVOICE_ISSUED_FIELDS = ['notes', 'terms', 'due_date', 'eway_bill_no'];

exports.update = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const s = scopedById(req, req.params.id);
    const inv = (await client.query(`SELECT * FROM sales_invoices WHERE ${s.where}`, s.params)).rows[0];
    if (!inv) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Invoice not found' }); }

    const draft = inv.status === 'Draft';
    const allowed = draft ? INVOICE_DRAFT_FIELDS : INVOICE_ISSUED_FIELDS;
    const offered = Object.keys(req.body || {}).filter(k => k !== 'items');
    const refused = offered.filter(k => !allowed.includes(k));
    if (refused.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: `This invoice has been issued, so ${refused.join(', ')} can no longer be changed. `
             + `Raise a credit or debit note to correct an issued invoice.`,
        editable: allowed,
      });
    }
    if (!draft && req.body.items) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'Line items can only be changed while the invoice is a Draft. Raise a credit or debit note instead.',
      });
    }

    /* Rule 46(b): unique per supplier. */
    if (draft && req.body.invoice_number && req.body.invoice_number !== inv.invoice_number) {
      const clash = await client.query(
        'SELECT id FROM sales_invoices WHERE owner_id = $1 AND invoice_number = $2 AND id <> $3',
        [inv.owner_id, req.body.invoice_number, inv.id]);
      if (clash.rowCount) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: `Invoice number ${req.body.invoice_number} is already used.` });
      }
    }

    const set = {};
    for (const k of allowed) if (k in req.body) set[k] = req.body[k];

    if (draft && (req.body.items || 'discount' in set || 'gst_rate' in set
                  || 'round_off' in set || 'customer_id' in set || 'place_of_supply' in set)) {
      const items = req.body.items
        || (await client.query('SELECT * FROM sales_invoice_items WHERE sales_invoice_id = $1 ORDER BY sort_order', [inv.id])).rows;
      const tax = await resolveTax(client, inv.owner_id, set.customer_id ?? inv.customer_id,
        set.place_of_supply ?? inv.place_of_supply);
      const t = compute(items, {
        discount: set.discount ?? inv.discount,
        gstRate: set.gst_rate ?? inv.gst_rate,
        interstate: tax.interstate,
        roundOff: set.round_off ?? inv.round_off,
      });
      Object.assign(set, {
        sub_total: t.subTotal, interstate: tax.interstate, cgst: t.cgst, sgst: t.sgst,
        igst: t.igst, gst_total: t.gstTotal, net_amount: t.net,
        amount_in_words: amountInWords(t.net),
        place_of_supply: set.place_of_supply ?? tax.placeOfSupply ?? inv.place_of_supply,
        place_of_supply_code: set.place_of_supply_code ?? tax.placeOfSupplyCode ?? inv.place_of_supply_code,
      });
      if (req.body.items) {
        await client.query('DELETE FROM sales_invoice_items WHERE sales_invoice_id = $1', [inv.id]);
        let so = 0;
        for (const l of t.lines) {
          /* Same column list as create(). sales_invoice_items has no sku_id —
             only sales_quotation_items does. */
          await client.query(
            `INSERT INTO sales_invoice_items (sales_invoice_id, description, hsn, uom, quantity, rate, amount, sort_order)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [inv.id, l.description, l.hsn || null, l.uom || 'nos',
             l.quantity || 0, l.rate || 0, l.amount || 0, so++]);
        }
      }
      /* A revised total can land below what has already been received. */
      if (Number(inv.amount_paid || 0) > t.net + 0.005) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: `₹${Number(inv.amount_paid).toFixed(2)} has already been received against this invoice, `
               + `which is more than the revised total of ₹${t.net.toFixed(2)}.`,
        });
      }
    }

    const cols = Object.keys(set);
    if (!cols.length) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Nothing to update' }); }
    const clause = cols.map((c, i) => `"${c}" = $${i + 1}`).join(', ');
    const { rows } = await client.query(
      `UPDATE sales_invoices SET ${clause} WHERE id = $${cols.length + 1} RETURNING *`,
      [...cols.map(c => set[c]), inv.id]);
    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
};

exports.setStatus = async (req, res) => {
  const { status } = req.body;
  const allowed = ['Draft', 'Sent', 'Partially Paid', 'Paid'];
  if (!allowed.includes(status)) return res.status(400).json({ error: `status must be one of ${allowed.join(', ')}` });
  try {
    if (!await assertOwned(db, req, res, 'sales_invoices', req.params.id, { columns: 'id' })) return;
    const r = await db.query('UPDATE sales_invoices SET status = $1 WHERE id = $2', [status, req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'not found' });
    res.json({ success: true, status });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.remove = async (req, res) => {
  try {
    if (!await assertOwned(db, req, res, 'sales_invoices', req.params.id, { columns: 'id' })) return;
    const r = await db.query('DELETE FROM sales_invoices WHERE id = $1', [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'not found' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
};
