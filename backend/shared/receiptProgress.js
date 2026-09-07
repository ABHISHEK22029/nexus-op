/* ══════════════════════════════════════════════════════════════════════
   receiptProgress — one definition of "how much of this purchase order has
   arrived", and what that makes its status.

   The twin of shared/orderProgress.js, which has done the same job on the
   sales side all along: sum what actually moved, compare it to what was
   agreed, derive the status from the comparison. Nothing here is new
   design — the purchase side simply never had it.

   Before this, `routes/grn.js` set status = 'Delivered' unconditionally on
   the first receipt, and refused any further receipt against a Delivered
   order. So receiving 1 of 40 closed the order and lost the other 39.

   Like the sales side, this deliberately leaves the status ALONE when
   nothing has been received: a dispatched order with no goods against it is
   still Dispatched, not "Partially Received" of zero.
   ══════════════════════════════════════════════════════════════════════ */

/* Quantities are stored as `real`, so 149.9999 is 150. Same tolerance the
   sales side uses, for the same reason. */
const TOL = 0.001;

/* How much more than the ordered quantity may be accepted.

   Blanket 10%, which is the usual ERP default (SAP MM's over-delivery
   tolerance is commonly set there) and comfortably covers the ±2–5% mill
   tolerance on anything sold by weight — steel is rolled to a coil, not to
   an order, and a small overrun is ordinary trade rather than an error.

   It is deliberately one number for now. Properly this belongs per material
   — a 3% overrun on plate is normal, on counted fasteners it is a
   miscount — but a single honest default beats an elaborate setting nobody
   has filled in. PO 20 on this database took 1250 against an order for 150;
   any tolerance in this range would have caught it. */
const OVER_RECEIPT_TOLERANCE = 0.10;

/**
 * What was ordered and what has arrived.
 *
 * `ordered` prefers the sum of the line items and falls back to the header
 * quantity — most purchase orders here have a single line and predate
 * po_line_items entirely, so the header is the only figure they carry.
 */
async function receiptTotals(client, poId) {
  const { rows: [t] } = await client.query(
    `SELECT
       (SELECT COALESCE(SUM(quantity), 0) FROM po_line_items WHERE "poId" = $1) AS line_qty,
       (SELECT COALESCE(quantity, 0)      FROM purchase_orders WHERE id = $1)   AS header_qty,
       (SELECT COALESCE(SUM("receivedQuantity"), 0) FROM grn WHERE "poId" = $1) AS received`,
    [poId]
  );
  const lineQty = Number(t.line_qty) || 0;
  const ordered = lineQty > 0 ? lineQty : (Number(t.header_qty) || 0);
  const received = Number(t.received) || 0;
  return {
    ordered,
    received,
    outstanding: Math.max(0, ordered - received),
    complete: ordered > 0 && received >= ordered - TOL,
  };
}

/**
 * Would accepting `incoming` more take this order past what may be received?
 * Returns null when it is fine, or a sentence explaining the refusal.
 */
function overReceiptError({ ordered, received }, incoming) {
  if (!(ordered > 0)) return null;             // nothing to compare against
  const ceiling = ordered * (1 + OVER_RECEIPT_TOLERANCE);
  if (received + incoming <= ceiling + TOL) return null;
  return (
    `That is more than the order allows. Ordered ${ordered}, already received ` +
    `${received}, now receiving ${incoming} — over the ${Math.round(OVER_RECEIPT_TOLERANCE * 100)}% ` +
    `tolerance. Amend the purchase order first if the vendor genuinely sent more.`
  );
}

/**
 * Recompute the order's received quantity and status from its receipts.
 *
 * Returns { ordered, received, outstanding, complete, status, changed }.
 * `status` is null when nothing has been received and the status was left
 * as it was.
 */
async function syncPoReceipt(client, poId) {
  if (!poId) return null;
  const t = await receiptTotals(client, poId);

  await client.query(
    'UPDATE purchase_orders SET received_quantity = $1 WHERE id = $2',
    [t.received, poId]);

  if (t.received <= 0) {
    return { ...t, status: null, changed: false };
  }

  const status = t.complete ? 'Delivered' : 'Partially Received';
  const r = await client.query(
    'UPDATE purchase_orders SET status = $1 WHERE id = $2',
    [status, poId]);

  return { ...t, status, changed: r.rowCount > 0 };
}

module.exports = {
  receiptTotals, syncPoReceipt, overReceiptError,
  OVER_RECEIPT_TOLERANCE,
};
