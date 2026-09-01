const db = require('../db');
const { isCrossTenant } = require('../shared/roles');
const { runList } = require('../shared/listQuery');

/* Admins see every project; a normal user sees only the projects they own.

   Owner scoping stays a WHERE fragment so ?search / ?type / ?limit compose
   on top of it rather than replacing it. Without a `limit` this still
   returns a plain array, so ProjectContext and the project switcher keep
   working unchanged. */
exports.getProjects = async (req, res) => {
  try {
    const where = [], params = [];
    if (!isCrossTenant(req.user?.role)) {
      params.push(req.user.id);
      where.push(`owner_id = $${params.length}`);
    }
    const result = await runList(db, {
      table: 'projects',
      query: req.query,
      searchColumns: ['name', 'clientName', 'type', 'status'],
      filterColumns: ['type', 'status'],
      allowedSort: ['id', 'name', 'clientName', 'type', 'startDate', 'endDate', 'status'],
      // ASC by id preserves the previous ORDER BY — ProjectContext picks the
      // last row as the active project, so the direction is load-bearing.
      defaultSort: 'id',
      defaultDir: 'ASC',
      where, params,
    });
    res.json(result);
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
