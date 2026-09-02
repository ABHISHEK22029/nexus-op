/* ══════════════════════════════════════════════════════════
   orderProgress — one definition of "how much of this order has shipped".

   Two places moved a customer order's status and they disagreed.

   The challan handler was careful: it sums every dispatched line against
   every ordered line and picks Delivered or Partially Delivered from the
   comparison. It carries a comment explaining that setting Delivered on any
   dispatch of any size is worse than leaving the order Open, because it
   tells the shop floor that a job with a thousand units outstanding is done.

   The invoice handler then did exactly that:

       UPDATE customer_orders SET status = 'Delivered'
        WHERE id = $1 AND status <> 'Closed'

   Unconditional. Invoicing normally follows dispatch, so it ran second and
   overwrote the careful answer with the careless one. Ship 40 of 100, raise
   the invoice, and the order reads Delivered — the exact failure the challan
   code was written to prevent, reintroduced one file away.

   Invoicing is a billing event, not a delivery event. An invoice can be
   raised before dispatch, after it, or for goods that never move. It has no
   business deciding whether something shipped. So both callers now ask this
   one function, which only ever looks at dispatched quantities.
   ══════════════════════════════════════════════════════════ */

/**
 * Recompute a customer order's delivery status from what has actually been
 * dispatched, and apply it.
 *
 * Returns { ordered, dispatched, status, complete, changed } — or null when
 * there is no order to update.
 *
 * Deliberately leaves the status ALONE when nothing has been dispatched:
 * an order that has been invoiced but not shipped is not "Partially
 * Delivered", it is whatever it already was.
 */
async function syncOrderDelivery(client, orderId) {
  if (!orderId) return null;

  const totals = (await client.query(
    `SELECT
       (SELECT COALESCE(SUM(quantity),0) FROM customer_order_items
         WHERE customer_order_id = $1) AS ordered,
       (SELECT COALESCE(SUM(dci.quantity),0)
          FROM delivery_challan_items dci
          JOIN delivery_challans d ON d.id = dci.delivery_challan_id
         WHERE d.customer_order_id = $1
           AND d.status IN ('Dispatched','Delivered')) AS dispatched`,
    [orderId]
  )).rows[0];

  const ordered = Number(totals.ordered) || 0;
  const dispatched = Number(totals.dispatched) || 0;

  if (dispatched <= 0) {
    return { ordered, dispatched, status: null, complete: false, changed: false };
  }

  // A small tolerance: quantities are `real`, and 1199.9999 is delivered.
  const complete = ordered > 0 && dispatched >= ordered - 0.001;
  const status = complete ? 'Delivered' : 'Partially Delivered';

  const r = await client.query(
    `UPDATE customer_orders SET status = $1
      WHERE id = $2 AND status NOT IN ('Closed')`,
    [status, orderId]
  );

  return { ordered, dispatched, status, complete, changed: r.rowCount > 0 };
}

module.exports = { syncOrderDelivery };
