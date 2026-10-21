/* ══════════════════════════════════════════════════════════
   GrnBillController — customizable bill generated from a GRN.
   Pre-fills from the PO line items; the user can edit lines,
   rates, add freight / other charges / discount, pick GST.
   ══════════════════════════════════════════════════════════ */
const db = require('../db');
const { profileFor } = require('../shared/companyProfile');
const { nextSeq } = require('../shared/docNumber');
const { isCrossTenant } = require('../shared/roles');
const { scopedById, assertOwned } = require('../shared/ownerScope');
const { runList } = require('../shared/listQuery');
const { assertRefs } = require('../shared/ownedRefs');

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Indian amount-in-words.
/* Words for amounts: one shared function (shared/amountInWords), which
   spells a crore count of any size. This file had its own copy, which
   printed "undefined Hundred … Crore" from 1,000 crore up. */
const { amountInWords } = require('../shared/amountInWords');

// Compute all totals from the (customizable) inputs.
function compute(items, { freight = 0, otherCharges = 0, discount = 0, gstRate = 18, interstate = false, roundOff = 0 }) {
  const lines = (items || []).map(it => ({ ...it, amount: r2((Number(it.quantity) || 0) * (Number(it.rate) || 0)) }));
  const subTotal = r2(lines.reduce((s, l) => s + l.amount, 0));
  const taxable = r2(subTotal + Number(freight || 0) + Number(otherCharges || 0) - Number(discount || 0));
  const gstTotal = r2(taxable * (Number(gstRate) || 0) / 100);
  /* CGST + SGST = GST exactly. Halving and rounding each on its own gave
     1263.11 + 1263.11 against a GST of 2526.21, so the printed lines added
     up to a paisa more than the net payable. Same rule as sales invoices. */
  const cgst = interstate ? 0 : r2(gstTotal / 2);
  const sgst = interstate ? 0 : r2(gstTotal - cgst);
  const igst = interstate ? gstTotal : 0;
  const net = r2(taxable + gstTotal + Number(roundOff || 0));
  return { lines, subTotal, taxable, gstTotal, cgst, sgst, igst, net };
}

/* Days to pay, from what the PO or the vendor says. Only a figure that is
   plainly a number of days counts: "Net 30", "30 days", or a vendor's bare
   "30". "50% advance, 50% before delivery" is not 50 days. */
function termDays(poTerms, vendorTerms) {
  const po = String(poTerms || '');
  const m = po.match(/net\s*(\d{1,3})\b/i) || po.match(/\b(\d{1,3})\s*days?\b/i);
  if (m) return Number(m[1]);
  const v = String(vendorTerms || '').match(/^\s*(\d{1,3})\s*(days?)?\s*$/i);
  return v ? Number(v[1]) : null;
}
const addDays = (iso, n) => {
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/* The bill a receipt already has, if any. */
const billFor = async (q, grnId) => (await q.query(
  'SELECT id, bill_number FROM grn_bills WHERE grn_id = $1 ORDER BY id LIMIT 1', [grnId])).rows[0] || null;

// GET /grn-bills/prefill/:grnId — build a draft from the GRN's PO.
exports.prefill = async (req, res) => {
  try {
    /* Scoped on the SOURCE receipt — see DeliveryChallanController.prefill.
       Read by id alone, this handed any company the receipt, its purchase
       order and the vendor row, bank account and IFSC included. The PO and
       vendor are read as the receipt's own company's, too. */
    const s = scopedById(req, req.params.grnId);
    const grn = (await db.query(`SELECT * FROM grn WHERE ${s.where}`, s.params)).rows[0];
    if (!grn) return res.status(404).json({ error: 'GRN not found' });
    const po = (await db.query('SELECT * FROM purchase_orders WHERE id = $1 AND (owner_id = $2 OR owner_id IS NULL)', [grn.poId, grn.owner_id])).rows[0];
    const vendor = po ? (await db.query('SELECT * FROM vendors WHERE id = $1 AND (owner_id = $2 OR owner_id IS NULL)', [po.vendorId, po.owner_id])).rows[0] : null;
    const poLines = po ? (await db.query('SELECT * FROM po_line_items WHERE "poId" = $1 ORDER BY sno, id', [po.id])).rows : [];
    /* What ARRIVED, not what was ordered. A part-load of 30 of 50 opened the
       bill at 50, so the vendor was billed for goods still on the road
       unless somebody noticed. A receipt is booked against one line of the
       PO (grn.po_line_item_id, or the only line); the bill is for that line,
       at the quantity received. An older receipt against a several-line PO,
       booked before receipts named their line, still offers every line. */
    const received = Number(grn.receivedQuantity) || 0;
    const line = poLines.find(l => String(l.id) === String(grn.po_line_item_id)) || (poLines.length === 1 ? poLines[0] : null);
    const asItem = (li, qty) => ({ description: li.description, hsn: li.hsn || '', uom: li.uom || 'nos', quantity: qty, rate: li.unitPrice });
    let items = line ? [asItem(line, received || line.quantity)]
      : poLines.map(li => asItem(li, li.quantity));
    // Fall back to the PO header if no line items.
    if (!items.length && po) items = [{ description: po.itemName, hsn: '', uom: 'nos', quantity: received || po.quantity, rate: po.unitPrice || 0 }];
    const days = termDays(po?.paymentTerms, vendor?.payment_terms);
    const existing = await billFor(db, grn.id);

    // Shared intra/inter rule: derive from vendor vs company state code (GSTIN
    // first two digits). Same logic the PO invoice uses. The bill can override.
    let company = null;
    try { company = await profileFor(db, req.user?.orgId); } catch { /* optional */ }
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
      /* the due date the terms give, from today's bill date; editable */
      termDays: days,
      dueDate: days != null ? addDays(new Date(Date.now() + 5.5 * 3600e3).toISOString(), days) : null,
      /* a receipt is billed once — the builder says so instead of a form */
      existingBill: existing ? { id: existing.id, billNumber: existing.bill_number } : null,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// POST /grn-bills — create the customizable bill.
exports.create = async (req, res) => {
  const { grnId, poId, vendorId, projectId, billDate, dueDate, vendorBillRef, items, freight, otherCharges, discount, gstRate, interstate, roundOff, notes } = req.body;
  if (!items || !items.length) return res.status(400).json({ error: 'Add at least one line item' });
  /* The vendor, the receipt and the PO it bills are this company's. The
     vendor id was stored as sent, so a bill could name another company's
     vendor and show their bank details on the bill. */
  if (!await assertRefs(db, req, res, { vendors: [vendorId], grn: [grnId], purchase_orders: [poId] })) return;
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    /* One bill per receipt. Nothing stopped a second: Generate Bill stayed
       on the receipt's row, and a second Create Bill made GB-0002 beside
       GB-0001 for the same goods — two payables for one delivery. The
       receipt row is locked first, so two clicks at once cannot both pass. */
    if (grnId) {
      await client.query('SELECT id FROM grn WHERE id = $1 FOR UPDATE', [grnId]);
      const existing = await billFor(client, grnId);
      if (existing) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: `This receipt is already billed as ${existing.bill_number}. Open that bill to change it.`, billId: existing.id, billNumber: existing.bill_number });
      }
    }
    /* Due date: as entered; else from the PO's or the vendor's terms; else
       none (Payables then counts from the bill date, as before). */
    let due = dueDate || null;
    if (!due && poId) {
      const po = (await client.query('SELECT "paymentTerms", "vendorId" FROM purchase_orders WHERE id = $1', [poId])).rows[0];
      const vendor = vendorId || po?.vendorId
        ? (await client.query('SELECT payment_terms FROM vendors WHERE id = $1', [vendorId || po?.vendorId])).rows[0] : null;
      const days = termDays(po?.paymentTerms, vendor?.payment_terms);
      if (days != null) due = addDays(billDate || new Date(Date.now() + 5.5 * 3600e3).toISOString(), days);
    }
    const t = compute(items, { freight, otherCharges, discount, gstRate, interstate, roundOff });
    const billNumber = `GB-${String(await nextSeq(client, {
      ownerId: req.user?.orgId, docType: 'grn_bill',
    })).padStart(4, '0')}`;
    const { rows } = await client.query(
      `INSERT INTO grn_bills ("projectId", grn_id, po_id, vendor_id, bill_number, vendor_bill_ref, bill_date,
         sub_total, freight, other_charges, discount, gst_rate, interstate, cgst, sgst, igst, gst_total, round_off, net_amount, amount_in_words, notes, owner_id, due_date)
       VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7::date, CURRENT_DATE),$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23::date) RETURNING id`,
      [projectId || null, grnId || null, poId || null, vendorId || null, billNumber, vendorBillRef || null, billDate || null,
       t.subTotal, freight || 0, otherCharges || 0, discount || 0, gstRate ?? 18, !!interstate, t.cgst, t.sgst, t.igst, t.gstTotal, roundOff || 0, t.net, amountInWords(t.net), notes || null,
       req.user?.orgId ?? req.user?.id ?? null, due]
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
      params.push(req.user.orgId);
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
    const vendor = bill.vendor_id ? (await db.query(
      'SELECT * FROM vendors WHERE id = $1 AND (owner_id = $2 OR owner_id IS NULL)', [bill.vendor_id, bill.owner_id])).rows[0] : null;
    const payments = (await db.query('SELECT * FROM vendor_payments WHERE grn_bill_id = $1 ORDER BY id', [req.params.id])).rows;
    let company = null;
    try { company = await profileFor(db, req.user?.orgId); } catch { /* optional */ }
    /* The PO by its number, for the printed bill ("PO #5355" was the row id). */
    const poNumber = bill.po_id ? (await db.query(
      'SELECT "poNumber" FROM purchase_orders WHERE id = $1 AND owner_id IS NOT DISTINCT FROM $2', [bill.po_id, bill.owner_id])).rows[0]?.poNumber : null;
    res.json({ ...bill, items, vendor, payments, company, po_number: poNumber || null });
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
/* grn_bills carry owner_id (migration 031). This scoped through the bill's
   PROJECT instead, so a bill with no project — most of them, since a PO for
   stock belongs to none — was missing from Payables altogether. */
const ownScope = (req, alias = 'gb') => isAdmin(req)
  ? { clause: '', params: [] }
  : { clause: ` AND ${alias}.owner_id = $1`, params: [req.user.orgId] };

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

    /* Never pay a vendor more than the bill is worth. This is the same
       guard as on the sales side, and here the money is going OUT — a
       misplaced digit is a real payment made against a bill that did not
       ask for it, and the payables total stops matching what is owed.
       FOR UPDATE so two payments entered at once cannot each read the
       old total and both be allowed. */
    const cur = (await client.query(
      `SELECT g.net_amount,
              COALESCE((SELECT SUM(amount) FROM vendor_payments WHERE grn_bill_id = g.id), 0) AS paid
         FROM grn_bills g WHERE g.id = $1 FOR UPDATE`,
      [req.params.id])).rows[0];
    if (cur) {
      const net = Number(cur.net_amount || 0);
      const already = Number(cur.paid || 0);
      const due = net - already;
      if (Number(amount) > due + 0.01) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: due <= 0.01
            ? `This bill is already paid in full (₹${net.toFixed(2)}). Nothing is outstanding.`
            : `That is more than is outstanding. Bill ₹${net.toFixed(2)}, already paid ₹${already.toFixed(2)}, so ₹${due.toFixed(2)} remains.`,
          netAmount: net, alreadyPaid: already, outstanding: Math.max(0, due),
        });
      }
    }

    await client.query(
      `INSERT INTO vendor_payments (grn_bill_id, amount, mode, reference, paid_date, notes) VALUES ($1,$2,$3,$4,$5,$6)`,
      [req.params.id, Number(amount), mode || 'Bank', reference || null, paidDate || null, notes || null]);
    const paid = (await client.query('SELECT COALESCE(SUM(amount),0) s FROM vendor_payments WHERE grn_bill_id = $1', [req.params.id])).rows[0].s;
    const bill = (await client.query('SELECT net_amount, bill_number, vendor_id, owner_id FROM grn_bills WHERE id = $1', [req.params.id])).rows[0];
    if (!bill) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Bill not found' }); }
    const pstatus = Number(paid) >= Number(bill.net_amount || 0) ? 'Paid' : Number(paid) > 0 ? 'Partially Paid' : 'Unpaid';
    await client.query('UPDATE grn_bills SET amount_paid = $1, payment_status = $2 WHERE id = $3', [r2(paid), pstatus, req.params.id]);
    await client.query('COMMIT');
    notify({ org: bill.owner_id }, { type: 'VENDOR_PAID', title: `Vendor payment · ${bill.bill_number}`, message: `₹${Number(amount).toLocaleString('en-IN')} via ${mode || 'Bank'} — ${pstatus}`, entityType: 'grn_bill', entityId: Number(req.params.id), link: '/payables' });
    res.json({ success: true, amountPaid: r2(paid), paymentStatus: pstatus });
  } catch (e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); }
  finally { client.release(); }
};

// GET /grn-bills/:id/payments
exports.payments = async (req, res) => {
  try {
    /* Yours only — this listed any bill's payments, with references, by id. */
    if (!await assertOwned(db, req, res, 'grn_bills', req.params.id, { columns: 'id' })) return;
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
    const s = ownScope(req);
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
