const db = require('../db');

exports.getWorkOrders = (req, res) => {
    const { projectId } = req.query;
    let query = "SELECT w.*, v.name as vendorName FROM work_orders w LEFT JOIN vendors v ON w.vendorId = v.id";
    let params = [];
    if (projectId) {
        query += " WHERE w.projectId = ?";
        params.push(projectId);
    }
    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
};

exports.createWorkOrder = (req, res) => {
    const { projectId, vendorId, name, boqId, startDate, endDate, contractValue, status } = req.body;
    db.run(
        `INSERT INTO work_orders (projectId, vendorId, name, boqId, startDate, endDate, contractValue, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [projectId, vendorId, name, boqId || null, startDate, endDate, contractValue, status || 'In Progress'],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID, message: 'Work Order Bound Successfully' });
        }
    );
};

exports.getMilestones = (req, res) => {
    db.all("SELECT * FROM milestones", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
};
