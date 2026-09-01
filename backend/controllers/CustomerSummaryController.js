/* ══════════════════════════════════════════════════════════
   CustomerSummaryController — what a customer actually is to us.

   Deliberately DERIVED, not typed. A "customer interests" text field goes
   stale the day after someone fills it in; order history never lies. So
   "what do they buy", "do they pay on time" and "what do they owe" are all
   computed from the transactions we already have.
   ══════════════════════════════════════════════════════════ */
const db = require('../db');
const { isCrossTenant } = require('../shared/roles');
const isAdmin = (req) => isCrossTenant(req.user?.role);
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/* GET /customers/:id/summary */
exports.summary = async (req, res) => {
  const id = req.params.id;
  try {
    // Owner-scoped: a customer belonging to another tenant must 404, not leak.
    const where = ['id = $1'];
    const params = [id];
    if (!isAdmin(req)) { params.push(req.user.id); where.push(`owner_id = $${params.length}`); }
    const customer = (await db.query(`SELECT * FROM customers WHERE ${where.join(' AND ')}`, params)).rows[0];
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const [orders, invoices, challans, topItems, payment] = await Promise.all([
      db.query(`SELECT id, order_number, status, order_date, created_at
                FROM customer_orders WHERE customer_id = $1 ORDER BY id DESC LIMIT 20`, [id]),

      db.query(`SELECT id, invoice_number, invoice_date, due_date, net_amount,
                       COALESCE(amount_paid,0) AS amount_paid, status
                FROM sales_invoices WHERE customer_id = $1 ORDER BY id DESC LIMIT 20`, [id]),

      db.query(`SELECT id, challan_number, challan_date, status
                FROM delivery_challans WHERE customer_id = $1 ORDER BY id DESC LIMIT 10`, [id]),

      // WHAT THEY BUY — from actual order lines, not a typed field.
      db.query(`SELECT coi.description AS item,
                       SUM(COALESCE(coi.quantity,0))::numeric AS qty,
                       COUNT(DISTINCT co.id)::int AS orders
                FROM customer_order_items coi
                JOIN customer_orders co ON co.id = coi.customer_order_id
                WHERE co.customer_id = $1
                GROUP BY coi.description
                ORDER BY qty DESC LIMIT 6`, [id]),

      // HOW THEY PAY — average days from invoice date to full payment.
      db.query(`SELECT AVG(EXTRACT(EPOCH FROM (p.paid_at - si.invoice_date::timestamp)) / 86400)::numeric AS avg_days
                FROM sales_invoices si
                JOIN LATERAL (SELECT MAX(COALESCE(paid_date::timestamp, created_at)) AS paid_at
                              FROM sales_payments WHERE sales_invoice_id = si.id) p ON TRUE
                WHERE si.customer_id = $1 AND si.status = 'Paid' AND si.invoice_date IS NOT NULL`, [id]),
    ]);

    const inv = invoices.rows;
    const billed = r2(inv.reduce((s, i) => s + Number(i.net_amount || 0), 0));
    const received = r2(inv.reduce((s, i) => s + Number(i.amount_paid || 0), 0));
    const outstanding = r2(billed - received);

    const today = new Date();
    const overdue = inv.filter(i => i.due_date && new Date(i.due_date) < today
      && Number(i.net_amount || 0) > Number(i.amount_paid || 0));
    const overdueAmount = r2(overdue.reduce((s, i) => s + (Number(i.net_amount || 0) - Number(i.amount_paid || 0)), 0));

    const avgDays = payment.rows[0]?.avg_days != null ? Math.round(Number(payment.rows[0].avg_days)) : null;
    const agreedTerms = customer.payment_terms_days ?? null;

    res.json({
      customer,
      metrics: {
        orders_count: orders.rows.length,
        lifetime_billed: billed,
        received,
        outstanding,
        overdue_count: overdue.length,
        overdue_amount: overdueAmount,
        avg_order_value: orders.rows.length ? r2(billed / orders.rows.length) : 0,
        last_order_date: orders.rows[0]?.order_date || orders.rows[0]?.created_at || null,
        avg_days_to_pay: avgDays,
        agreed_terms_days: agreedTerms,
        // The judgement a credit controller actually wants.
        pays_on_time: avgDays == null || agreedTerms == null ? null : avgDays <= agreedTerms,
        credit_limit: customer.credit_limit != null ? Number(customer.credit_limit) : null,
        over_credit_limit: customer.credit_limit != null && outstanding > Number(customer.credit_limit),
      },
      buys: topItems.rows.map(r => ({ item: r.item, qty: Number(r.qty), orders: r.orders })),
      orders: orders.rows,
      invoices: inv,
      challans: challans.rows,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
};
