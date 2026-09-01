/* ══════════════════════════════════════════════════════════
   StockController — the movement history behind every balance.

   "Why is stock 40 when it should be 60" was previously unanswerable:
   inventory held a running number and nothing that produced it. This serves
   the ledger, so a balance can always be traced back to the documents that
   made it.
   ══════════════════════════════════════════════════════════ */
const db = require('../db');
const stock = require('../shared/stock');
const { isCrossTenant } = require('../shared/roles');
const { runList } = require('../shared/listQuery');

// GET /inventory/movements
exports.movements = async (req, res) => {
  try {
    const where = [], params = [];
    if (!isCrossTenant(req.user?.role)) { params.push(req.user.id); where.push(`owner_id = $${params.length}`); }
    const result = await runList(db, {
      table: `(SELECT m.*,
                      CASE WHEN m.quantity >= 0 THEN 'in' ELSE 'out' END AS direction,
                      ABS(m.quantity) AS abs_quantity
                 FROM stock_movements m) AS m`,
      query: req.query,
      searchColumns: ['item_name', 'movement_type', 'ref_number', 'note'],
      filterColumns: ['movement_type', 'inventory_id', 'ref_type', 'direction'],
      allowedSort: ['id', 'created_at', 'item_name', 'quantity'],
      defaultSort: 'id', defaultDir: 'DESC',
      where, params,
      /* In and out kept apart. A net figure would hide whether a week saw
         no activity or a lot of it that happened to cancel out. */
      summary: `COUNT(*)::int AS count,
                COALESCE(SUM(quantity) FILTER (WHERE quantity > 0),0)::numeric AS total_in,
                COALESCE(ABS(SUM(quantity) FILTER (WHERE quantity < 0)),0)::numeric AS total_out,
                COALESCE(SUM(quantity),0)::numeric AS net,
                COUNT(DISTINCT inventory_id)::int AS items_touched`,
    });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// GET /inventory/:id/movements — the ledger for one stock row
exports.forItem = async (req, res) => {
  try {
    const params = [req.params.id];
    let scope = '';
    if (!isCrossTenant(req.user?.role)) { params.push(req.user.id); scope = ` AND owner_id = $${params.length}`; }
    const item = (await db.query(`SELECT * FROM inventory WHERE id = $1${scope}`, params)).rows[0];
    if (!item) return res.status(404).json({ error: 'Stock item not found' });

    const { rows } = await db.query(
      `SELECT * FROM stock_movements WHERE inventory_id = $1 ORDER BY id`, [req.params.id]);

    /* Running balance computed forward, so each line shows what stock was
       after it — which is what someone reconciling actually reads. */
    let running = 0;
    const ledger = rows.map(m => {
      running = Math.round((running + Number(m.quantity)) * 100) / 100;
      return { ...m, balance_after: running };
    });

    res.json({
      item,
      ledger,
      ledgerBalance: running,
      storedBalance: Number(item.quantity || 0),
      drift: Math.round((Number(item.quantity || 0) - running) * 100) / 100,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

/* GET /inventory/reconcile — does the ledger still equal the balance?
   A non-empty result means something wrote to inventory without going
   through shared/stock, which is the only way the two can disagree. */
exports.reconcile = async (req, res) => {
  try {
    const r = await stock.reconcile(db, req.user?.id, isCrossTenant(req.user?.role));
    res.json(r);
  } catch (e) { res.status(500).json({ error: e.message }); }
};
