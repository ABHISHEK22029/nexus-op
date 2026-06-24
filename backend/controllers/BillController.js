const db = require('../db');

/* ── Indian amount-in-words ───────────────────────────────── */
function amountInWords(num) {
  num = Math.round(Number(num) || 0);
  if (num === 0) return 'Zero Rupees Only';
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = (n) => n < 20 ? a[n] : b[Math.floor(n / 10)] + (n % 10 ? ' ' + a[n % 10] : '');
  const three = (n) => {
    const h = Math.floor(n / 100), r = n % 100;
    return (h ? a[h] + ' Hundred' + (r ? ' ' : '') : '') + (r ? two(r) : '');
  };
  let out = '';
  const crore = Math.floor(num / 10000000); num %= 10000000;
  const lakh = Math.floor(num / 100000); num %= 100000;
  const thousand = Math.floor(num / 1000); num %= 1000;
  const rest = num;
  if (crore) out += three(crore) + ' Crore ';
  if (lakh) out += two(lakh) + ' Lakh ';
  if (thousand) out += two(thousand) + ' Thousand ';
  if (rest) out += three(rest);
  return out.trim() + ' Rupees Only';
}

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const stateCode = (gstin) => (gstin && /^\d{2}/.test(gstin)) ? gstin.slice(0, 2) : null;

/* ── Generate an itemised RA bill ─────────────────────────── */
exports.generateRABill = async (req, res) => {
  const {
    projectId, workOrderId,
    gstRate = 18, tdsRate = 2, tdsSection = '194C',
    retentionPct = 5, advanceRecovery = 0, otherDeductions = 0,
    gstTdsRate = 0, labourCessRate = 0,   // optional, off (0) by default
    deductionReason = null, billDate = null,
  } = req.body;

  if (!projectId || !workOrderId) {
    return res.status(400).json({ error: 'projectId and workOrderId are required' });
  }

  const client = await db.pool.connect();
  try {
    // Work order + vendor
    const woRes = await client.query('SELECT * FROM work_orders WHERE id = $1', [workOrderId]);
    const wo = woRes.rows[0];
    if (!wo) return res.status(404).json({ error: 'Work order not found' });

    const venRes = await client.query('SELECT * FROM vendors WHERE id = $1', [wo.vendorId]);
    const vendor = venRes.rows[0] || {};

    // Place of supply → intra vs inter state
    const compRes = await client.query('SELECT * FROM company_profile ORDER BY id LIMIT 1');
    const company = compRes.rows[0] || {};
    const compSc = company.stateCode || stateCode(company.gstin);
    const venSc = stateCode(vendor.gstin);
    const intraState = !compSc || !venSc ? true : compSc === venSc;

    // Cumulative measured qty per BOQ item under this work order
    const mbRes = await client.query(
      `SELECT mb."boqId" AS boq_id,
              SUM(mb."measuredQuantity") AS cum_measured,
              boq.description, boq.unit, boq.rate, boq."estimatedQuantity" AS est_qty
         FROM measurement_book mb
         JOIN boq_items boq ON boq.id = mb."boqId"
        WHERE mb."workOrderId" = $1
        GROUP BY mb."boqId", boq.description, boq.unit, boq.rate, boq."estimatedQuantity"`,
      [workOrderId]
    );
    if (mbRes.rows.length === 0) {
      return res.status(400).json({ error: 'No measurement-book records for this work order to bill.' });
    }

    // Previously billed qty per BOQ (exclude rejected/cancelled bills)
    const prevRes = await client.query(
      `SELECT bli.boq_id, COALESCE(SUM(bli.quantity), 0) AS prev_qty
         FROM bill_line_items bli
         JOIN bills b ON b.id = bli.bill_id
        WHERE b."workOrderId" = $1 AND COALESCE(b.status,'') NOT IN ('Rejected','Cancelled')
        GROUP BY bli.boq_id`,
      [workOrderId]
    );
    const prevMap = {};
    prevRes.rows.forEach(r => { prevMap[r.boq_id] = Number(r.prev_qty) || 0; });

    // Build line items for the new, un-billed quantities
    const lines = [];
    const warnings = [];
    mbRes.rows.forEach((row, i) => {
      const cum = Number(row.cum_measured) || 0;
      const prev = prevMap[row.boq_id] || 0;
      const qty = r2(cum - prev);
      if (qty <= 0) return;
      const est = Number(row.est_qty) || 0;
      if (est > 0 && cum > est) {
        warnings.push(`BOQ #${row.boq_id} (${row.description}) measured ${cum} exceeds estimated ${est}`);
      }
      const rate = Number(row.rate) || 0;
      lines.push({
        boq_id: row.boq_id,
        description: row.description,
        unit: row.unit,
        quantity: qty,
        rate,
        amount: r2(qty * rate),
        sort_order: i,
      });
    });

    if (lines.length === 0) {
      return res.status(400).json({ error: 'No new quantities to bill — everything measured is already billed.' });
    }

    // Money math
    const subTotal = r2(lines.reduce((s, l) => s + l.amount, 0));
    let cgst = 0, sgst = 0, igst = 0;
    if (intraState) { cgst = r2(subTotal * (gstRate / 2) / 100); sgst = cgst; }
    else { igst = r2(subTotal * gstRate / 100); }
    const gstTotal = r2(cgst + sgst + igst);
    const tds = r2(subTotal * tdsRate / 100);
    const gstTds = r2(subTotal * gstTdsRate / 100);       // optional: TDS under GST (govt deductors)
    const labourCess = r2(subTotal * labourCessRate / 100); // optional: BOCW labour cess
    const retention = r2(subTotal * retentionPct / 100);
    const advance = r2(advanceRecovery);
    const other = r2(otherDeductions);
    const netAmount = r2(subTotal + gstTotal - tds - gstTds - labourCess - retention - advance - other);
    const totalQty = r2(lines.reduce((s, l) => s + l.quantity, 0));
    const inWords = amountInWords(netAmount);

    // RA sequence number for this work order
    const raRes = await client.query(
      `SELECT COUNT(*)::int AS n FROM bills WHERE "workOrderId" = $1`, [workOrderId]);
    const raNumber = (raRes.rows[0].n || 0) + 1;

    await client.query('BEGIN');
    const ins = await client.query(
      `INSERT INTO bills
         ("projectId","workOrderId", vendor_id, ra_number, bill_date,
          "grossAmount", sub_total, cgst, sgst, igst, gst_total, gst_rate,
          tds, tds_section, tds_rate, gst_tds, gst_tds_rate, labour_cess, labour_cess_rate,
          retention, retention_pct, advance_recovery, other_deductions, deduction_reason,
          "netAmount", "billedQuantity", amount_in_words, status, date)
       VALUES ($1,$2,$3,$4,COALESCE($5, CURRENT_DATE),
               $6,$6,$7,$8,$9,$10,$11,
               $12,$13,$14,$15,$16,$17,$18,
               $19,$20,$21,$22,$23,
               $24,$25,$26,'Draft',NOW())
       RETURNING id`,
      [projectId, workOrderId, vendor.id || null, raNumber, billDate,
        subTotal, cgst, sgst, igst, gstTotal, gstRate,
        tds, tdsSection, tdsRate, gstTds, gstTdsRate, labourCess, labourCessRate,
        retention, retentionPct, advance, other, deductionReason,
        netAmount, totalQty, inWords]
    );
    const billId = ins.rows[0].id;
    const billNumber = `RA-${String(billId).padStart(4, '0')}`;
    await client.query('UPDATE bills SET bill_number = $1 WHERE id = $2', [billNumber, billId]);

    for (const l of lines) {
      await client.query(
        `INSERT INTO bill_line_items (bill_id, boq_id, description, unit, hsn_code, quantity, rate, amount, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [billId, l.boq_id, l.description, l.unit, null, l.quantity, l.rate, l.amount, l.sort_order]
      );
    }
    await client.query(
      `INSERT INTO activities ("projectId", type, description, timestamp) VALUES ($1,$2,$3,NOW())`,
      [projectId, 'BILL_GENERATED', `${billNumber} (RA ${raNumber}) generated — Net ₹${netAmount.toLocaleString('en-IN')}`]
    );
    await client.query('COMMIT');

    res.json({
      message: 'RA Bill generated',
      billId, billNumber, raNumber,
      subTotal, gstTotal, cgst, sgst, igst, tds, gstTds, labourCess, retention,
      advanceRecovery: advance, otherDeductions: other, netAmount,
      amountInWords: inWords, lineCount: lines.length,
      intraState, warnings,
    });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
};

/* ── List bills (with vendor + work order) ────────────────── */
exports.getBills = async (req, res) => {
  try {
    const { projectId } = req.query;
    const params = [];
    let where = '';
    if (projectId) { where = 'WHERE b."projectId" = $1'; params.push(projectId); }
    const { rows } = await db.query(
      `SELECT b.*, v.name AS "vendorName", wo.name AS "workOrderName"
         FROM bills b
         LEFT JOIN vendors v ON v.id = b.vendor_id
         LEFT JOIN work_orders wo ON wo.id = b."workOrderId"
         ${where}
        ORDER BY b.id DESC`, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── Single bill + line items (for the invoice) ───────────── */
exports.getBillById = async (req, res) => {
  try {
    const billRes = await db.query(
      `SELECT b.*, v.name AS "vendorName", v.gstin AS "vendorGstin", v.pan AS "vendorPan",
              v.address AS "vendorAddress", wo.name AS "workOrderName", p.name AS "projectName"
         FROM bills b
         LEFT JOIN vendors v ON v.id = b.vendor_id
         LEFT JOIN work_orders wo ON wo.id = b."workOrderId"
         LEFT JOIN projects p ON p.id = b."projectId"
        WHERE b.id = $1`, [req.params.id]);
    const bill = billRes.rows[0];
    if (!bill) return res.status(404).json({ error: 'Bill not found' });
    const items = await db.query(
      'SELECT * FROM bill_line_items WHERE bill_id = $1 ORDER BY sort_order, id', [req.params.id]);
    bill.lineItems = items.rows;
    res.json(bill);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
