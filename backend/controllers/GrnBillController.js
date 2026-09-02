/* ══════════════════════════════════════════════════════════
   GrnBillController — customizable bill generated from a GRN.
   Pre-fills from the PO line items; the user can edit lines,
   rates, add freight / other charges / discount, pick GST.
   ══════════════════════════════════════════════════════════ */
const db = require('../db');
const { isCrossTenant } = require('../shared/roles');
const { scopedById, assertOwned } = require('../shared/ownerScope');
const { runList } = require('../shared/listQuery');

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Indian amount-in-words.
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

// Compute all totals from the (customizable) inputs.
function compute(items, { freight = 0, otherCharges = 0, discount = 0, gstRate = 18, interstate = false, roundOff = 0 }) {
  const lines = (items || []).map(it => ({ ...it, amount: r2((Number(it.quantity) || 0) * (Number(it.rate) || 0)) }));
  const subTotal = r2(lines.reduce((s, l) => s + l.amount, 0));
  const taxable = r2(subTotal + Number(freight || 0) + Number(otherCharges || 0) - Number(discount || 0));
  const gstTotal = r2(taxable * (Number(gstRate) || 0) / 100);
  const cgst = interstate ? 0 : r2(gstTotal / 2);
  const sgst = interstate ? 0 : r2(gstTotal / 2);
  const igst = interstate ? gstTotal : 0;
  const net = r2(taxable + gstTotal + Number(roundOff || 0));
  return { lines, subTotal, taxable, gstTotal, cgst, sgst, igst, net };
}

// GET /grn-bills/prefill/:grnId — build a draft from the GRN's PO.
exports.prefill = async (req, res) => {
  try {
    const grn = (await db.query('SELECT * FROM grn WHERE id = $1', [req.params.grnId])).rows[0];
    if (!grn) return res.status(404).json({ error: 'GRN not found' });
    const po = (await db.query('SELECT * FROM purchase_orders WHERE id = $1', [grn.poId])).rows[0];
    const vendor = po ? (await db.query('SELECT * FROM vendors WHERE id = $1', [po.vendorId])).rows[0] : null;
    let items = (await db.query('SELECT * FROM po_line_items WHERE "poId" = $1 ORDER BY sno', [grn.poId])).rows
      .map(li => ({ description: li.description, hsn: li.hsn || '', uom: li.uom || 'nos', quantity: li.quantity, rate: li.unitPrice }));
    // Fall back to the PO header if no line items.
    if (!items.length && po) items = [{ description: po.itemName, hsn: '', uom: 'nos', quantity: grn.receivedQuantity || po.quantity, rate: po.unitPrice || 0 }];

    // Shared intra/inter rule: derive from vendor vs company state code (GSTIN
    // first two digits). Same logic the PO invoice uses. The bill can override.
    let company = null;
    try { company = (await db.query('SELECT * FROM company_profile LIMIT 1')).rows[0] || null; } catch { /* optional */ }
    const companyState = String(company?.stateCode || (company?.gstin || '').substring(0, 2) || '');
    const vendorState = String(vendor?.gstin || '').substring(0, 2);
    const interstate = !!vendorState && !!companyState && vendorState !== companyState;

    res.json({
      grn, po, vendor,
      projectId: grn.projectId,
      vendorName: vendor?.name || '',
      interstate,                        // auto-derived, overridable in the builder
      gstRate: po?.gst_rate ?? 18,       // default to the PO's GST rate for consistency
      items,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// POST /grn-bills — create the customizable bill.
exports.create = async (req, res) => {
  const { grnId, poId, vendorId, projectId, billDate, vendorBillRef, items, freight, otherCharges, discount, gstRate, interstate, roundOff, notes } = req.body;
  if (!items || !items.length) return res.status(400).json({ error: 'Add at least one line item' });
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const t = compute(items, { freight, otherCharges, discount, gstRate, interstate, roundOff });
    const cnt = await client.query('SELECT COUNT(*) FROM grn_bills');
    const billNumber = `GB-${String(parseInt(cnt.rows[0].count) + 1).padStart(4, '0')}`;
    const { rows } = await client.query(
      `INSERT INTO grn_bills ("projectId", grn_id, po_id, vendor_id, bill_number, vendor_bill_ref, bill_date,
         sub_total, freight, other_charges, discount, gst_rate, interstate, cgst, sgst, igst, gst_total, round_off, net_amount, amount_in_words, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING id`,
      [projectId || null, grnId || null, poId || null, vendorId || null, billNumber, vendorBillRef || null, billDate || null,
       t.subTotal, freight || 0, otherCharges || 0, discount || 0, gstRate ?? 18, !!interstate, t.cgst, t.sgst, t.igst, t.gstTotal, roundOff || 0, t.net, amountInWords(t.net), notes || null]
    );
    const billId = rows[0].id;
    let so = 0;
    for (const l of t.lines) {
      await client.query(
        `INSERT INTO grn_bill_items (grn_bill_id, description, hsn, uom, quantity, rate, amount, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [billId, l.description, l.hsn || null, l.uom || 'nos', l.quantity || 0, l.rate || 0, l.amount || 0, so++]
      );
    }
    await client.query('COMMIT');
    res.json({ id: billId, billNumber, net: t.net });
  } catch (e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); }
  finally { client.release(); }
};

// GET /grn-bills?projectId=
exports.list = async (req, res) => {
  try {
    /* OWNER SCOPED. This list previously applied no owner filter at all,
       and scopeProjectAccess only engages when the request carries a
       projectId — so a plain GET /grn-bills returned every tenant's
       purchase bills, vendor names and amounts included. The column has
       existed since migration 031 and is fully backfilled; nothing was
       filtering on it.

       The vendor name is joined in a subquery so it is searchable: a
       purchase bill is remembered by who sent it, or by their own bill
       reference, long before anyone recalls "GB-0007". */
    const where = [], params = [];
    if (!isCrossTenant(req.user?.role)) {
      params.push(req.user.id);
      where.push(`owner_id = $${params.length}`);
    }
    const result = await runList(db, {
      where, params,
      table: `(SELECT gb.*, v.name AS vendor_name
                 FROM grn_bills gb LEFT JOIN vendors v ON v.id = gb.vendor_id) AS gb`,
      query: req.query,
      searchColumns: ["bill_number", "vendor_name", "vendor_bill_ref", "status", "payment_status"],
      filterColumns: ["status", "payment_status", "projectId", "vendor_id", "po_id"],
      allowedSort: ["id", "bill_number", "bill_date", "due_date", "net_amount", "amount_paid", "status", "payment_status"],
      defaultSort: 'id', defaultDir: 'DESC',
      /* Billed and paid stay separate figures; outstanding is floored at
         zero so an overpayment on one bill cannot net off what is genuinely
         owed on another. `overdue` is the count that needs chasing. */
      summary: `COUNT(*)::int AS count,
                COALESCE(SUM(net_amount),0)::numeric AS billed,
                COALESCE(SUM(COALESCE(amount_paid,0)),0)::numeric AS paid,
                COALESCE(SUM(GREATEST(net_amount - COALESCE(amount_paid,0), 0)),0)::numeric AS outstanding,
                COUNT(*) FILTER (WHERE due_date IS NOT NULL AND due_date < CURRENT_DATE
                                   AND net_amount > COALESCE(amount_paid,0))::int AS overdue`,
    });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// GET /grn-bills/:id
exports.getById = async (req, res) => {
  try {
    const s = scopedById(req, req.params.id);
    const bill = (await db.query(`SELECT * FROM grn_bills WHERE ${s.where}`, s.params)).rows[0];
    if (!bill) return res.status(404).json({ error: 'Bill not found' });
    const items = (await db.query('SELECT * FROM grn_bill_items WHERE grn_bill_id = $1 ORDER BY sort_order', [req.params.id])).rows;
    const vendor = bill.vendor_id ? (await db.query('SELECT * FROM vendors WHERE id = $1', [bill.vendor_id])).rows[0] : null;
    const payments = (await db.query('SELECT * FROM vendor_payments WHERE grn_bill_id = $1 ORDER BY id', [req.params.id])).rows;
    let company = null;
    try { company = (await db.query('SELECT * FROM company_profile LIMIT 1')).rows[0] || null; } catch { /* optional */ }
    res.json({ ...bill, items, vendor, payments, company });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// PATCH /grn-bills/:id/status
exports.setStatus = async (req, res) => {
  const { status } = req.body;
  const allowed = ['Draft', 'Approved', 'Paid'];
  if (!allowed.includes(status)) return res.status(400).json({ error: `status must be one of ${allowed.join(', ')}` });
  try {
    if (!await assertOwned(db, req, res, 'grn_bills', req.params.id, { columns: 'id' })) return;
    const r = await db.query('UPDATE grn_bills SET status = $1 WHERE id = $2', [status, req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'not found' });
    res.json({ success: true, status });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.remove = async (req, res) => {
  try {
    if (!await assertOwned(db, req, res, 'grn_bills', req.params.id, { columns: 'id' })) return;
    const r = await db.query('DELETE FROM grn_bills WHERE id = $1', [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'not found' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

/* ══════════════ Accounts Payable — vendor payments (Wave 1B) ══════════════ */
const { notify } = require('../notify');
const isAdmin = (req) => isCrossTenant(req.user?.role);
// grn_bills are project-scoped (no owner_id); non-admins see their projects' bills.
const projScope = (req, alias = 'gb') => isAdmin(req)
  ? { clause: '', params: [] }
  : { clause: ` AND ${alias}."projectId" IN (SELECT id FROM projects WHERE owner_id = $1)`, params: [req.user.id] };

// POST /grn-bills/:id/payment — record a payment to the vendor
exports.addPayment = async (req, res) => {
  const { amount, mode, reference, paidDate, notes } = req.body;
  if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'Enter a payment amount' });
  /* Checked before the transaction opens. Paying against another tenant's
     bill corrupts their payables rather than merely reading them. */
  if (!await assertOwned(db, req, res, 'grn_bills', req.params.id, { columns: 'id' })) return;
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO vendor_payments (grn_bill_id, amount, mode, reference, paid_date, notes) VALUES ($1,$2,$3,$4,$5,$6)`,
      [req.params.id, Number(amount), mode || 'Bank', reference || null, paidDate || null, notes || null]);
    const paid = (await client.query('SELECT COALESCE(SUM(amount),0) s FROM vendor_payments WHERE grn_bill_id = $1', [req.params.id])).rows[0].s;
    const bill = (await client.query('SELECT net_amount, bill_number, vendor_id FROM grn_bills WHERE id = $1', [req.params.id])).rows[0];
    if (!bill) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Bill not found' }); }
    const pstatus = paid >= (bill.net_amount || 0) ? 'Paid' : paid > 0 ? 'Partially Paid' : 'Unpaid';
    await client.query('UPDATE grn_bills SET amount_paid = $1, payment_status = $2 WHERE id = $3', [r2(paid), pstatus, req.params.id]);
    await client.query('COMMIT');
    notify('admins', { type: 'VENDOR_PAID', title: `Vendor payment · ${bill.bill_number}`, message: `₹${Number(amount).toLocaleString('en-IN')} via ${mode || 'Bank'} — ${pstatus}`, entityType: 'grn_bill', entityId: Number(req.params.id), link: '/payables' });
    res.json({ success: true, amountPaid: r2(paid), paymentStatus: pstatus });
  } catch (e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); }
  finally { client.release(); }
};

// GET /grn-bills/:id/payments
exports.payments = async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM vendor_payments WHERE grn_bill_id = $1 ORDER BY id', [req.params.id]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// GET /payables — AP dashboard: outstanding bills + per-vendor summary + ageing
/* Payables is a DASHBOARD, not a list, so it deliberately does not go
   through runList: the ageing buckets and the total owed are only correct
   when computed over every unpaid bill, and paginating the query would make
   "₹18 lakh outstanding" mean "outstanding on page one".

   But it was also shipping every unpaid bill to the browser, which is fine
   at eleven rows and not at four thousand. So the aggregate stays whole and
   only the TABLE is filtered and paged — the totals above it keep counting
   everything, which is the honest way round. `filteredOutstanding` is
   returned separately so a search can show its own subtotal without the
   headline figure moving. */
function paginateBills(rows, query = {}) {
  const term = String(query.search ?? '').trim().toLowerCase();
  let bills = rows;
  if (term) {
    bills = rows.filter(r =>
      [r.bill_number, r.vendor_name, r.payment_status]
        .some(v => String(v ?? '').toLowerCase().includes(term)));
  }
  const filteredOutstanding = bills.reduce((s, r) => s + (Number(r.outstanding) || 0), 0);

  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 50, 1), 200);
  const offset = Math.max(parseInt(query.offset, 10) || 0, 0);
  const page = bills.slice(offset, offset + limit);

  return {
    bills: page.map(r => ({
      ...r,
      outstanding: r2(Number(r.outstanding)),
      amount_paid: r2(Number(r.amount_paid)),
    })),
    billsTotal: bills.length,          // rows matching the filter
    billsLimit: limit,
    billsOffset: offset,
    filteredOutstanding: r2(filteredOutstanding),
    isFiltered: Boolean(term),
  };
}

exports.payables = async (req, res) => {
  try {
    const s = projScope(req);
    const { rows } = await db.query(
      `SELECT gb.id, gb.bill_number, gb.bill_date, gb.due_date, gb.net_amount,
              COALESCE(gb.amount_paid,0) AS amount_paid, gb.payment_status, v.name AS vendor_name, gb.vendor_id,
              (gb.net_amount - COALESCE(gb.amount_paid,0)) AS outstanding,
              (CURRENT_DATE - COALESCE(gb.due_date, gb.bill_date)) AS age_days
         FROM grn_bills gb LEFT JOIN vendors v ON v.id = gb.vendor_id
        WHERE gb.net_amount > COALESCE(gb.amount_paid,0)${s.clause}
        ORDER BY COALESCE(gb.due_date, gb.bill_date) ASC`, s.params);

    const bucket = (d) => (d == null ? '0-30' : d <= 30 ? '0-30' : d <= 60 ? '31-60' : d <= 90 ? '61-90' : '90+');
    const ageing = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    const vendors = new Map();
    let totalOutstanding = 0;
    for (const r of rows) {
      const out = Number(r.outstanding) || 0;
      totalOutstanding += out;
      ageing[bucket(r.age_days)] += out;
      const key = r.vendor_id || 0;
      if (!vendors.has(key)) vendors.set(key, { vendorId: r.vendor_id, vendor: r.vendor_name || 'Unknown', outstanding: 0, bills: 0 });
      const vv = vendors.get(key); vv.outstanding += out; vv.bills += 1;
    }
    Object.keys(ageing).forEach(k => ageing[k] = r2(ageing[k]));
    res.json({
      totalOutstanding: r2(totalOutstanding),
      billCount: rows.length,
      ageing,
      vendors: [...vendors.values()].map(v => ({ ...v, outstanding: r2(v.outstanding) })).sort((a, b) => b.outstanding - a.outstanding),
      ...paginateBills(rows, req.query),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
};
