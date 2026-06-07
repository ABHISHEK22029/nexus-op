const db = require('../db');

exports.getWorkOrders = async (req, res) => {
  try {
    const { projectId } = req.query;
    let query = `SELECT w.*, v.name as "vendorName" FROM work_orders w LEFT JOIN vendors v ON w."vendorId" = v.id`;
    let params = [];
    if (projectId) {
      query += ` WHERE w."projectId" = $1`;
      params.push(projectId);
    }
    const { rows } = await db.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createWorkOrder = async (req, res) => {
  const { projectId, vendorId, name, boqId, startDate, endDate, contractValue, status } = req.body;
  try {
    const { rows } = await db.query(
      `INSERT INTO work_orders ("projectId", "vendorId", name, "boqId", "startDate", "endDate", "contractValue", status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [projectId, vendorId, name, boqId || null, startDate, endDate, contractValue, status || 'In Progress']
    );
    res.json({ id: rows[0].id, message: 'Work Order Bound Successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getMilestones = async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM milestones');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
