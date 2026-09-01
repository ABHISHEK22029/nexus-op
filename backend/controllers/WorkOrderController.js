const db = require('../db');
const { isCrossTenant } = require('../shared/roles');
const { runList } = require('../shared/listQuery');

/* The vendor join is wrapped in a derived table so "vendorName" becomes an
   ordinary column of it — searchable and unambiguous against work_orders'
   own `name`. Without a `limit` the response is still a plain array, so
   ProjectContext and QuickCreateModal keep working unchanged. */
const WORK_ORDERS = `(
  SELECT w.*, v.name AS "vendorName"
  FROM work_orders w
  LEFT JOIN vendors v ON w."vendorId" = v.id
) AS wo`;

exports.getWorkOrders = async (req, res) => {
  try {
    const where = [], params = [];
    if (req.query.projectId) {
      params.push(req.query.projectId);
      where.push(`"projectId" = $${params.length}`);
    }
    const result = await runList(db, {
      table: WORK_ORDERS,
      query: req.query,
      searchColumns: ['name', 'vendorName', 'status'],
      filterColumns: ['status'],
      allowedSort: ['id', 'name', 'vendorName', 'startDate', 'endDate', 'contractValue', 'status'],
      /* Previously unordered. LIMIT/OFFSET over an unordered query may repeat
         or skip rows between pages, so pagination needs a stable sort. */
      defaultSort: 'id',
      defaultDir: 'ASC',
      where, params,
    });
    res.json(result);
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
    /* SCOPED THROUGH THE WORK ORDER. The milestones table has no owner_id
       of its own, which is why this endpoint never scoped — but a milestone
       is not an independent thing, it belongs to a work order, and that has
       an owner. Every tenant was seeing every other tenant's milestones,
       complete with work order and project names.

       Inherited rather than denormalised: adding owner_id to milestones
       would create a second copy of the answer that can disagree with the
       work order it hangs off. */
    const where = [], params = [];
    if (!isCrossTenant(req.user?.role)) {
      params.push(req.user.id);
      where.push(`owner_id = $${params.length}`);
    }
    const result = await runList(db, {
      where, params,
      table: `(SELECT m.*, wo.name AS work_order_name, wo."projectId" AS project_id,
                      wo.owner_id AS owner_id,
                      p.name AS project_name
                 FROM milestones m
                 LEFT JOIN work_orders wo ON wo.id = m."workOrderId"
                 LEFT JOIN projects p ON p.id = wo."projectId") AS m`,
      query: req.query,
      searchColumns: ["name", "work_order_name", "project_name", "status", "remarks"],
      filterColumns: ["status", "workOrderId", "project_id"],
      allowedSort: ["id", "name", "status", "plannedPercent", "actualPercent"],
      defaultSort: 'id', defaultDir: 'ASC',
      /* Planned and actual are reported side by side rather than as one
         "variance" number — a single figure hides whether four milestones
         are slightly late or one is badly late. `behind_plan` is the count
         that needs someone to look. */
      summary: `COUNT(*)::int AS count,
                COUNT(*) FILTER (WHERE COALESCE("actualPercent",0) >= 100)::int AS completed,
                COUNT(*) FILTER (WHERE COALESCE("actualPercent",0) < COALESCE("plannedPercent",0))::int AS behind_plan,
                COALESCE(AVG(COALESCE("plannedPercent",0)),0)::numeric(10,2) AS avg_planned_pct,
                COALESCE(AVG(COALESCE("actualPercent",0)),0)::numeric(10,2) AS avg_actual_pct`,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
