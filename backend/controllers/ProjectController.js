const db = require('../db');

exports.getProjects = async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM projects');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createProject = async (req, res) => {
  const { name, clientName, type, startDate, endDate, status } = req.body;
  try {
    const { rows } = await db.query(
      `INSERT INTO projects (name, "clientName", type, "startDate", "endDate", status)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [name, clientName, type, startDate, endDate, status || 'Active']
    );
    res.json({ id: rows[0].id, message: 'Project Created Successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
