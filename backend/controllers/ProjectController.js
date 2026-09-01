const db = require('../db');
const { isCrossTenant } = require('../shared/roles');

// Admins see every project; a normal user sees only the projects they own.
exports.getProjects = async (req, res) => {
  try {
    const isAdmin = isCrossTenant(req.user?.role);
    const { rows } = isAdmin
      ? await db.query('SELECT * FROM projects ORDER BY id')
      : await db.query('SELECT * FROM projects WHERE owner_id = $1 ORDER BY id', [req.user.id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createProject = async (req, res) => {
  const { name, clientName, type, startDate, endDate, status } = req.body;
  try {
    const { rows } = await db.query(
      `INSERT INTO projects (name, "clientName", type, "startDate", "endDate", status, owner_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [name, clientName, type, startDate, endDate, status || 'Active', req.user?.id || null]
    );
    res.json({ id: rows[0].id, message: 'Project Created Successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
