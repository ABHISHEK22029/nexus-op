/* ══════════════════════════════════════════════════════════════════════
   Which customer orders a purchase order was bought for (migration 076).

   A shortfall PO covers what every open order is short of, so one PO can
   serve several orders: the link is a table, po_customer_orders. The older
   vendor-quote path wrote a single purchase_orders.customer_order_id; both
   are read together, and that column is still set when a PO is for exactly
   one order, so anything reading it keeps working.
   ══════════════════════════════════════════════════════════════════════ */

/** Link a PO to orders — only the company's own orders; others are dropped. */
async function linkPoToOrders(client, poId, orderIds, ownerId) {
  const ids = [...new Set((orderIds || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (!poId || !ids.length) return [];
  const own = (await client.query(
    `SELECT id, order_number FROM customer_orders WHERE id = ANY($1::int[]) AND owner_id IS NOT DISTINCT FROM $2`,
    [ids, ownerId ?? null])).rows;
  for (const o of own) {
    await client.query(
      `INSERT INTO po_customer_orders (po_id, customer_order_id, owner_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [poId, o.id, ownerId ?? null]);
  }
  if (own.length === 1) {
    await client.query('UPDATE purchase_orders SET customer_order_id = $1 WHERE id = $2 AND customer_order_id IS NULL', [own[0].id, poId]);
  }
  return own.map((o) => ({ id: o.id, orderNumber: o.order_number }));
}

/** The order an "Against" reference names — "CO-0012", typed on a vendor quotation. */
async function orderFromRef(db, ref, ownerId) {
  const r = String(ref || '').trim();
  if (!r) return null;
  const row = (await db.query(
    `SELECT id FROM customer_orders WHERE owner_id IS NOT DISTINCT FROM $1 AND upper(order_number) = upper($2) LIMIT 1`,
    [ownerId ?? null, r])).rows[0];
  return row ? row.id : null;
}

/** For each PO id, the orders it is for: { [poId]: [{ id, orderNumber }] } */
async function ordersForPos(db, poIds) {
  const ids = [...new Set((poIds || []).map(Number).filter(Boolean))];
  if (!ids.length) return {};
  const rows = (await db.query(
    `SELECT x.po_id, co.id, co.order_number FROM (
        SELECT po_id, customer_order_id FROM po_customer_orders WHERE po_id = ANY($1::int[])
        UNION
        SELECT id, customer_order_id FROM purchase_orders WHERE id = ANY($1::int[]) AND customer_order_id IS NOT NULL
      ) x JOIN customer_orders co ON co.id = x.customer_order_id
      ORDER BY co.id`, [ids])).rows;
  const out = {};
  for (const r of rows) (out[r.po_id] ||= []).push({ id: r.id, orderNumber: r.order_number });
  return out;
}

/** The purchase orders bought for one customer order. */
async function posForOrder(db, orderId) {
  return (await db.query(
    `SELECT po.id, po."poNumber" AS po_number, po.status, po.approval_status, v.name AS vendor_name,
            COALESCE((SELECT SUM(li.quantity * li."unitPrice") FROM po_line_items li WHERE li."poId" = po.id), po.quantity * po."unitPrice") AS value
       FROM purchase_orders po
       LEFT JOIN vendors v ON v.id = po."vendorId"
      WHERE po.id IN (SELECT po_id FROM po_customer_orders WHERE customer_order_id = $1)
         OR po.customer_order_id = $1
      ORDER BY po.id`, [orderId])).rows;
}

module.exports = { linkPoToOrders, orderFromRef, ordersForPos, posForOrder };
