const db = require('../db');

exports.generateRABill = async (req, res) => {
  const { projectId, workOrderId } = req.body;
  try {
    // Step 1: Find all MB cumulative quantity for this Work Order
    const mbResult = await db.query(
      `SELECT SUM("measuredQuantity") as "cumQty", "boqId" FROM measurement_book WHERE "workOrderId" = $1 GROUP BY "boqId" LIMIT 1`,
      [workOrderId]
    );
    const cumQty = mbResult.rows[0]?.cumQty || 0;
    const boqId = mbResult.rows[0]?.boqId || null;

    if (cumQty === 0) return res.status(400).json({ error: "No MB records found for this Work Order to bill." });

    // Step 2: See how much was previously billed
    const billResult = await db.query(
      `SELECT SUM("billedQuantity") as "prevBilledQty" FROM bills WHERE "workOrderId" = $1`,
      [workOrderId]
    );
    const prevBilledQty = billResult.rows[0]?.prevBilledQty || 0;
    const currentPayableQty = cumQty - prevBilledQty;

    if (currentPayableQty <= 0) return res.status(400).json({ error: "No new quantities to bill." });

    // Step 3: Fetch BOQ rate
    const boqResult = await db.query('SELECT rate FROM boq_items WHERE id = $1', [boqId]);
    const rate = boqResult.rows[0]?.rate || 500;

    // MATH LOGIC
    const grossAmount = currentPayableQty * rate;
    const tds = grossAmount * 0.02;
    const retention = grossAmount * 0.05;
    const netAmount = grossAmount - tds - retention;

    const insertResult = await db.query(
      `INSERT INTO bills ("projectId", "workOrderId", "grossAmount", tds, retention, "netAmount", "billedQuantity", status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'Draft') RETURNING id`,
      [projectId, workOrderId, grossAmount, tds, retention, netAmount, currentPayableQty]
    );
    res.json({ message: "RA Bill Generated", billId: insertResult.rows[0].id, netAmount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getBills = async (req, res) => {
  try {
    const { projectId } = req.query;
    let query = 'SELECT * FROM bills';
    let params = [];
    if (projectId) {
      query += ' WHERE "projectId" = $1';
      params.push(projectId);
    }
    const { rows } = await db.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
