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
    if (!isAdmin(req)) { params.push(req.user.orgId); where.push(`owner_id = $${params.length}`); }
    const customer = (await db.query(`SELECT * FROM customers WHERE ${where.join(' AND ')}`, params)).rows[0];
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    /* Every query is held to the customer's own company as well as to the
       customer, so a row another company pointed at this customer id can
       never count here. IS NOT DISTINCT FROM keeps a legacy customer with
       no owner working for the platform admin. */
    const sc = [id, customer.owner_id];
    const own = (alias = '') => `${alias}owner_id IS NOT DISTINCT FROM $2`;

    const [orders, invoices, challans, topItems, payment, money, notes] = await Promise.all([
      db.query(`SELECT id, order_number, status, order_date, created_at,
                       COUNT(*) OVER ()::int AS total_count
                FROM customer_orders WHERE customer_id = $1 AND ${own()} ORDER BY id DESC LIMIT 20`, sc),

      /* The most recent 20, for the list on the page — every status, so a
         draft or a cancelled one is still findable. The money is NOT summed
         from these: see `money`. */
      db.query(`SELECT id, invoice_number, invoice_date, due_date, net_amount,
                       COALESCE(amount_paid,0) AS amount_paid, status
                FROM sales_invoices WHERE customer_id = $1 AND ${own()} ORDER BY id DESC LIMIT 20`, sc),

      db.query(`SELECT id, challan_number, challan_date, status
                FROM delivery_challans WHERE customer_id = $1 AND ${own()} ORDER BY id DESC LIMIT 10`, sc),

      // WHAT THEY BUY — from actual order lines, not a typed field.
      db.query(`SELECT coi.description AS item,
                       SUM(COALESCE(coi.quantity,0))::numeric AS qty,
                       COUNT(DISTINCT co.id)::int AS orders
                FROM customer_order_items coi
                JOIN customer_orders co ON co.id = coi.customer_order_id
                WHERE co.customer_id = $1 AND ${own('co.')}
                GROUP BY coi.description
                ORDER BY qty DESC LIMIT 6`, sc),

      // HOW THEY PAY — average days from invoice date to full payment.
      db.query(`SELECT AVG(EXTRACT(EPOCH FROM (p.paid_at - si.invoice_date::timestamp)) / 86400)::numeric AS avg_days
                FROM sales_invoices si
                JOIN LATERAL (SELECT MAX(COALESCE(paid_date::timestamp, created_at)) AS paid_at
                              FROM sales_payments WHERE sales_invoice_id = si.id) p ON TRUE
                WHERE si.customer_id = $1 AND ${own('si.')} AND si.status = 'Paid' AND si.invoice_date IS NOT NULL`, sc),

      /* WHAT THEY OWE — over ALL their invoices, in SQL. This summed the
         latest 20 rows above, so a customer with a long history showed a
         fraction of what they owe; and it ignored the opening balance they were set up with and
         every credit note since. Cancelled invoices are out; a draft stays in: nothing moves an invoice out of Draft except the status menu, so most real invoices are drafts. Overdue is by today's date in India. */
      db.query(`SELECT COALESCE(SUM(net_amount),0) AS billed,
                       COALESCE(SUM(COALESCE(amount_paid,0)),0) AS received,
                       COUNT(*)::int AS invoices,
                       COUNT(*) FILTER (WHERE due_date < (NOW() AT TIME ZONE 'Asia/Kolkata')::date
                                          AND net_amount - COALESCE(amount_paid,0) > 0.005)::int AS overdue_count,
                       COALESCE(SUM(net_amount - COALESCE(amount_paid,0))
                                FILTER (WHERE due_date < (NOW() AT TIME ZONE 'Asia/Kolkata')::date
                                          AND net_amount - COALESCE(amount_paid,0) > 0.005),0) AS overdue_amount
                FROM sales_invoices
                WHERE customer_id = $1 AND ${own()} AND status <> 'Cancelled'`, sc),

      /* Notes raised to this customer (party_type 'customer', party_id the
         customer). A credit note reduces what they owe — goods returned, a
         rate corrected — and a debit note to a customer adds to it. */
      db.query(`SELECT COALESCE(SUM(total) FILTER (WHERE note_type = 'credit'),0) AS credit,
                       COALESCE(SUM(total) FILTER (WHERE note_type = 'debit'),0) AS debit
                FROM credit_debit_notes
                WHERE party_type = 'customer' AND party_id = $1 AND ${own()}
                  AND COALESCE(status,'Issued') <> 'Cancelled'`, sc),
    ]);

    const inv = invoices.rows;
    const m = money.rows[0] || {};
    const billed = r2(m.billed);
    const received = r2(m.received);
    const opening = r2(customer.opening_balance);
    const creditNotes = r2(notes.rows[0]?.credit);
    const debitNotes = r2(notes.rows[0]?.debit);
    const outstanding = r2(opening + billed - received - creditNotes + debitNotes);
    const ordersCount = orders.rows[0]?.total_count || 0;

    const avgDays = payment.rows[0]?.avg_days != null ? Math.round(Number(payment.rows[0].avg_days)) : null;
    const agreedTerms = customer.payment_terms_days ?? null;

    res.json({
      customer,
      metrics: {
        orders_count: ordersCount,
        invoices_count: m.invoices || 0,
        lifetime_billed: billed,
        received,
        opening_balance: opening,
        credit_notes: creditNotes,
        debit_notes: debitNotes,
        outstanding,
        overdue_count: m.overdue_count || 0,
        overdue_amount: r2(m.overdue_amount),
        avg_order_value: ordersCount ? r2(billed / ordersCount) : 0,
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
