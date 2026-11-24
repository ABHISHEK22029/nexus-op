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
/* `ownerId`, when given, is the company of the document doing the asking:
   only that company's order moves, and only its own challans count. A
   challan from one company pointing at another's order id set that order
   to Delivered. The ids are checked when a document is created now
   (shared/ownedRefs); this is the second lock, for rows made before. */
/* ── Line by line ─────────────────────────────────────────────────────
   "Delivered" used to compare the sum of every quantity on the order with
   the sum of every quantity sent. An order for 1,000 kg of plate and 2
   gates read Delivered once 1,002 kg of plate went (normal overweight),
   with no gate sent. And a challan was never limited to what was left:
   a second challan from the same order started from the full quantity
   again. Each challan line is now matched to the order line it ships —
   by product first, then by description — and each order line is
   complete on its own. */
const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
/* Weight and length can ship a little over (a plate cut to size weighs
   what it weighs); counted things cannot — 11 brackets on an order for 10
   is a mistake, not a tolerance. */
const COUNT_UNITS = new Set(['nos', 'no', "no's", 'pcs', 'pc', 'piece', 'pieces', 'set', 'sets', 'unit', 'units', 'each', 'ea', 'pair', 'pairs', 'box', 'bag', 'bundle', 'roll', 'sheet', 'sheets', 'lot']);
const toleranceFor = (uom) => (COUNT_UNITS.has(norm(uom)) ? 0 : 0.10);
const EPS = 0.0005;

/* Which order line a sent (or to-be-sent) line belongs to: same product,
   else same description; the first that still has room, else the last
   candidate (so an overshoot lands on the line it belongs to). */
function matchLine(lines, row, room) {
  const sku = Number(row.sku_id ?? row.skuId) || null;
  let cands = sku ? lines.filter(l => l.skuId === sku) : [];
  if (!cands.length) cands = lines.filter(l => norm(l.description) && norm(l.description) === norm(row.description));
  if (!cands.length) return null;
  return cands.find(l => room(l) > EPS) || cands[cands.length - 1];
}

/**
 * Each line of an order with how much of it has been sent on dispatched
 * challans. `excludeChallanId` leaves one challan out (the one being
 * dispatched, so it is not counted against itself).
 */
async function lineProgress(q, orderId, ownerId = null, { excludeChallanId = null } = {}) {
  const lines = (await q.query(
    `SELECT id, sku_id, description, unit, quantity, hsn FROM customer_order_items
      WHERE customer_order_id = $1 ORDER BY id`, [orderId])).rows
    .map(l => ({
      id: l.id, skuId: l.sku_id || null, description: l.description, uom: l.unit || 'nos', hsn: l.hsn || null,
      ordered: Number(l.quantity) || 0, dispatched: 0, challans: [],
    }));
  const params = [orderId];
  let extraWhere = '';
  if (ownerId != null) { params.push(ownerId); extraWhere += ` AND d.owner_id = $${params.length}`; }
  if (excludeChallanId) { params.push(excludeChallanId); extraWhere += ` AND d.id <> $${params.length}`; }
  const sent = (await q.query(
    `SELECT dci.sku_id, dci.description, dci.quantity, d.challan_number
       FROM delivery_challan_items dci
       JOIN delivery_challans d ON d.id = dci.delivery_challan_id
      WHERE d.customer_order_id = $1 AND d.status IN ('Dispatched','Delivered')${extraWhere}
      ORDER BY d.id, dci.sort_order`, params)).rows;
  const extra = [];
  for (const s of sent) {
    const qty = Number(s.quantity) || 0;
    const line = matchLine(lines, s, l => l.ordered - l.dispatched);
    if (!line) { extra.push({ description: s.description, quantity: qty }); continue; }
    line.dispatched += qty;
    if (s.challan_number && !line.challans.includes(s.challan_number)) line.challans.push(s.challan_number);
  }
  return { lines, extra };
}

/**
 * Would sending `items` on a challan go past what the order asked for?
 * Returns a sentence saying which line and by how much, or null.
 */
async function overDispatch(q, { orderId, orderNumber, ownerId = null, items, excludeChallanId = null }) {
  const { lines } = await lineProgress(q, orderId, ownerId, { excludeChallanId });
  const adding = new Map();
  for (const it of items || []) {
    const qty = Number(it.quantity) || 0;
    if (qty <= 0) continue;
    const line = matchLine(lines, it, l => l.ordered - l.dispatched - (adding.get(l.id) || 0));
    if (!line) continue;          // a line that is not on the order: packing, a sample — not limited
    adding.set(line.id, (adding.get(line.id) || 0) + qty);
  }
  for (const l of lines) {
    const add = adding.get(l.id) || 0;
    if (!add) continue;
    const cap = l.ordered * (1 + toleranceFor(l.uom));
    if (l.dispatched + add > cap + EPS) {
      const left = Math.max(0, l.ordered - l.dispatched);
      const fmt = (n) => Math.round(n * 1000) / 1000;
      return `This would send more of ${orderNumber || 'the order'} than was ordered. “${l.description}”: ordered ${fmt(l.ordered)} ${l.uom}`
        + `${l.dispatched > EPS ? `, already sent ${fmt(l.dispatched)}${l.challans.length ? ` on ${l.challans.join(', ')}` : ''}` : ''}`
        + `, ${fmt(left)} left — this challan sends ${fmt(add)}.`
        + ' If the customer wants more, change the quantity on the order first.';
    }
  }
  return null;
}

async function syncOrderDelivery(client, orderId, ownerId = null) {
  if (!orderId) return null;
  const mine = ownerId != null;
  const { lines, extra } = await lineProgress(client, orderId, ownerId);
  const ordered = lines.reduce((s, l) => s + l.ordered, 0);
  const matched = lines.reduce((s, l) => s + l.dispatched, 0);
  const unmatched = extra.reduce((s, x) => s + x.quantity, 0);
  const dispatched = matched + unmatched;

  const cur = (await client.query(
    `SELECT status FROM customer_orders WHERE id = $1${mine ? ' AND owner_id = $2' : ''}`,
    mine ? [orderId, ownerId] : [orderId])).rows[0];
  if (!cur) return null;

  let status;
  if (dispatched <= EPS) {
    /* Nothing has gone — a challan was pulled back to Draft. An order left
       reading Delivered after its only dispatch was reversed told the shop
       floor the job was done. Back to Open, unless it was never marked as
       sent in the first place. */
    if (!['Partially Delivered', 'Delivered'].includes(cur.status)) {
      return { ordered, dispatched, status: null, complete: false, changed: false, lines };
    }
    /* Only when challans are how this order's delivery is tracked. A shop
       that marks orders Delivered by hand and never raises a challan would
       otherwise see it flip back to Open the moment it invoices. */
    const tracked = (await client.query(
      `SELECT 1 FROM delivery_challans WHERE customer_order_id = $1${mine ? ' AND owner_id = $2' : ''} LIMIT 1`,
      mine ? [orderId, ownerId] : [orderId])).rows.length > 0;
    if (!tracked) return { ordered, dispatched, status: null, complete: false, changed: false, lines };
    status = 'Open';
  } else {
    const real = lines.filter(l => l.ordered > EPS);
    /* Every line complete on its own. When no challan line could be matched
       to the order (challans typed by hand before lines were matched), fall
       back to the old whole-order comparison rather than never completing. */
    const complete = matched > EPS
      ? real.length > 0 && real.every(l => l.dispatched >= l.ordered - 0.001)
      : ordered > 0 && dispatched >= ordered - 0.001;
    status = complete ? 'Delivered' : 'Partially Delivered';
  }
  if (cur.status === 'Closed' || cur.status === status) {
    return { ordered, dispatched, status, complete: status === 'Delivered', changed: false, lines };
  }
  const r = await client.query(
    `UPDATE customer_orders SET status = $1
      WHERE id = $2 AND status NOT IN ('Closed')${mine ? ' AND owner_id = $3' : ''}`,
    mine ? [status, orderId, ownerId] : [status, orderId]
  );
  return { ordered, dispatched, status, complete: status === 'Delivered', changed: r.rowCount > 0, lines };
}

module.exports = { syncOrderDelivery, lineProgress, overDispatch, toleranceFor };
