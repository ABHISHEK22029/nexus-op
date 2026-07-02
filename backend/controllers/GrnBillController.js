/* ══════════════════════════════════════════════════════════
   GrnBillController — customizable bill generated from a GRN.
   Pre-fills from the PO line items; the user can edit lines,
   rates, add freight / other charges / discount, pick GST.
   ══════════════════════════════════════════════════════════ */
const db = require('../db');

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
    res.json({
      grn, po, vendor,
      projectId: grn.projectId,
      vendorName: vendor?.name || '',
      interstate: false,
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
    const { projectId } = req.query;
    const { rows } = projectId
      ? await db.query(`SELECT gb.*, v.name AS vendor_name FROM grn_bills gb LEFT JOIN vendors v ON v.id = gb.vendor_id WHERE gb."projectId" = $1 ORDER BY gb.id DESC`, [projectId])
      : await db.query(`SELECT gb.*, v.name AS vendor_name FROM grn_bills gb LEFT JOIN vendors v ON v.id = gb.vendor_id ORDER BY gb.id DESC`);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// GET /grn-bills/:id
exports.getById = async (req, res) => {
  try {
    const bill = (await db.query('SELECT * FROM grn_bills WHERE id = $1', [req.params.id])).rows[0];
    if (!bill) return res.status(404).json({ error: 'Bill not found' });
    const items = (await db.query('SELECT * FROM grn_bill_items WHERE grn_bill_id = $1 ORDER BY sort_order', [req.params.id])).rows;
    const vendor = bill.vendor_id ? (await db.query('SELECT * FROM vendors WHERE id = $1', [bill.vendor_id])).rows[0] : null;
    let company = null;
    try { company = (await db.query('SELECT * FROM company_profile LIMIT 1')).rows[0] || null; } catch { /* optional */ }
    res.json({ ...bill, items, vendor, company });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// PATCH /grn-bills/:id/status
exports.setStatus = async (req, res) => {
  const { status } = req.body;
  const allowed = ['Draft', 'Approved', 'Paid'];
  if (!allowed.includes(status)) return res.status(400).json({ error: `status must be one of ${allowed.join(', ')}` });
  try {
    const r = await db.query('UPDATE grn_bills SET status = $1 WHERE id = $2', [status, req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'not found' });
    res.json({ success: true, status });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.remove = async (req, res) => {
  try {
    const r = await db.query('DELETE FROM grn_bills WHERE id = $1', [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'not found' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
};
