/* ══════════════════════════════════════════════════════════
   orderBilling — an order is billed once.

   Nothing stopped an order being invoiced again and again: the second
   invoice opened with the whole order on it, the server took whatever it
   was sent, and on the live database one ₹19.9 lakh order carried three
   invoices adding up to ₹39 lakh. A customer who is billed twice is a
   customer lost, and a GST return that declares the same supply twice is
   a filing to correct.

   So, for every line of an order: what was ordered, what invoices already
   bill (any invoice for this order that is not Cancelled — a draft counts,
   because drafts are what get sent), and what is left. A new invoice, or
   an edit of one, may bill at most what is left, line by line.

   Each invoice line records the order line it bills
   (sales_invoice_items.customer_order_item_id, migration 073). A line
   saved before that, or typed by hand, counts against the order line with
   the same description — so deleting the line the order filled in and
   typing it again is not a way round this. A line that matches nothing on
   the order (freight, packing, an extra) is billed freely.
   ══════════════════════════════════════════════════════════ */

const key = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const EPS = 0.0001;
const fmtQty = (n) => Number(Number(n).toFixed(4)).toLocaleString('en-IN', { maximumFractionDigits: 4 });

/**
 * Each line of the order with what is billed and what is left.
 * @param exec       a client or the pool
 * @param orderId    the customer order
 * @param exceptInvoiceId  leave this invoice out (the one being edited)
 */
async function billedLines(exec, orderId, { exceptInvoiceId = null } = {}) {
  const lines = (await exec.query(
    `SELECT id, description, quantity, unit FROM customer_order_items
      WHERE customer_order_id = $1 ORDER BY sort_order, id`, [orderId])).rows
    .map((r) => ({ id: r.id, description: r.description, unit: r.unit, ordered: Number(r.quantity) || 0, billed: 0, invoices: new Set() }));
  const items = (await exec.query(
    `SELECT sii.quantity, sii.description, sii.customer_order_item_id, si.invoice_number
       FROM sales_invoice_items sii JOIN sales_invoices si ON si.id = sii.sales_invoice_id
      WHERE si.customer_order_id = $1 AND si.status <> 'Cancelled' AND si.id <> COALESCE($2::int, -1)
      ORDER BY si.id, sii.sort_order, sii.id`, [orderId, exceptInvoiceId])).rows;
  const byId = new Map(lines.map((l) => [l.id, l]));
  const add = (l, qty, number) => { l.billed += qty; l.invoices.add(number); };
  const unlinked = [];
  for (const it of items) {
    const l = byId.get(it.customer_order_item_id);
    if (l) add(l, Number(it.quantity) || 0, it.invoice_number); else unlinked.push(it);
  }
  /* A line with no link counts against the order line of the same name.
     Two order lines can share a name ("Kallax Shelf 4x4", 400 and 144);
     then one invoice line of 544 fills the first and the rest goes to the
     next — counting it against each would call a correct invoice billed
     twice. Anything past them all lands on the last, where it shows. */
  for (const it of unlinked) {
    const same = lines.filter((l) => key(l.description) === key(it.description));
    let qty = Number(it.quantity) || 0;
    same.forEach((l, i) => {
      if (qty <= 0) return;
      const take = i === same.length - 1 ? qty : Math.min(qty, Math.max(0, l.ordered - l.billed));
      if (take > 0) { add(l, take, it.invoice_number); qty -= take; }
    });
  }
  return lines.map((l) => ({ ...l, left: Math.max(0, l.ordered - l.billed), invoices: [...l.invoices] }));
}

/**
 * Give each invoice line the order line it bills: the one it names, or the
 * one with the same description. Throws (status 400) if a line names an
 * order line that is not on this order.
 */
function linkLines(lines, orderLines) {
  const byId = new Map(orderLines.map((o) => [Number(o.id), o]));
  const byDesc = new Map();
  for (const o of orderLines) {
    const k = key(o.description);
    byDesc.set(k, byDesc.has(k) ? null : o);           // null: two order lines share it
  }
  return lines.map((l) => {
    const named = l.customerOrderItemId ?? l.customer_order_item_id ?? null;
    if (named != null && named !== '') {
      const o = byId.get(Number(named));
      if (!o) { const e = new Error('An invoice line points at a line that is not on this order.'); e.status = 400; throw e; }
      return { ...l, customerOrderItemId: o.id };
    }
    const o = byDesc.get(key(l.description));
    return { ...l, customerOrderItemId: o ? o.id : null };
  });
}

/**
 * The lines that would bill more than is left, as one message — or null.
 */
function overBilled(lines, orderLines, orderNumber) {
  const want = new Map();
  for (const l of lines) {
    if (!l.customerOrderItemId) continue;
    want.set(l.customerOrderItemId, (want.get(l.customerOrderItemId) || 0) + (Number(l.quantity) || 0));
  }
  const problems = [];
  for (const o of orderLines) {
    const w = want.get(o.id) || 0;
    if (w > o.left + EPS) {
      const where = o.invoices.length ? ` on ${o.invoices.join(', ')}` : '';
      problems.push(`“${o.description}”: ordered ${fmtQty(o.ordered)} ${o.unit || ''}, already invoiced ${fmtQty(o.billed)}${where}, `
        + `${fmtQty(o.left)} left — this invoice has ${fmtQty(w)}.`.replace(/\s+,/g, ','));
    }
  }
  if (!problems.length) return null;
  return `This would bill more of ${orderNumber || 'the order'} than was ordered. ${problems.join(' ')} `
       + 'To bill it again, cancel the earlier invoice first.';
}

/**
 * Lock the order for the rest of the transaction, so two invoices saved at
 * the same moment cannot both take what is left, then check the lines.
 * Returns the lines with their order-line link, or throws (status 409).
 */
async function checkOrderBilling(client, { orderId, lines, exceptInvoiceId = null }) {
  const order = (await client.query('SELECT id, order_number FROM customer_orders WHERE id = $1 FOR UPDATE', [orderId])).rows[0];
  if (!order) return lines;
  const orderLines = await billedLines(client, orderId, { exceptInvoiceId });
  const linked = linkLines(lines, orderLines);
  const problem = overBilled(linked, orderLines, order.order_number);
  if (problem) { const e = new Error(problem); e.status = 409; e.code = 'ORDER_OVERBILLED'; throw e; }
  return linked;
}

/**
 * A line that is not on the order — "Supply as per your PO", freight, an
 * extra — is not held by the line check. On the live database one order
 * was billed again as a single such line worth the whole order. So when an
 * invoice carries lines that are not on the order and would take the
 * order's billing past its value, the person is asked to confirm it, with
 * the figures (freight is real; billing the order twice is not).
 * Returns the message, or null. Values are before discounts and GST.
 */
async function aboveOrderValue(client, { orderId, lines, exceptInvoiceId = null }) {
  const free = lines.filter(l => !l.customerOrderItemId);
  const { rows: [v] } = await client.query(
    `SELECT co.order_number,
            (SELECT COALESCE(SUM(coi.quantity * COALESCE(coi.rate, coi.target_price, 0)), 0)
               FROM customer_order_items coi WHERE coi.customer_order_id = co.id) AS ordered,
            (SELECT COALESCE(SUM(sii.quantity * sii.rate), 0)
               FROM sales_invoice_items sii JOIN sales_invoices si ON si.id = sii.sales_invoice_id
              WHERE si.customer_order_id = co.id AND si.status <> 'Cancelled' AND si.id <> COALESCE($2::int, -1)) AS billed,
            /* earlier invoice lines tied to no order line — a lump sum the
               line check cannot see, which this invoice may be repeating */
            (SELECT COUNT(*) FROM sales_invoice_items sii JOIN sales_invoices si ON si.id = sii.sales_invoice_id
              WHERE si.customer_order_id = co.id AND si.status <> 'Cancelled' AND si.id <> COALESCE($2::int, -1)
                AND sii.customer_order_item_id IS NULL
                AND NOT EXISTS (SELECT 1 FROM customer_order_items coi WHERE coi.customer_order_id = co.id
                                 AND lower(regexp_replace(btrim(coi.description), '\\s+', ' ', 'g'))
                                   = lower(regexp_replace(btrim(sii.description), '\\s+', ' ', 'g')))) AS loose_before
       FROM customer_orders co WHERE co.id = $1`, [orderId, exceptInvoiceId]);
  if (!v) return null;
  if (!free.length && !Number(v.loose_before)) return null;   // every line accounted for by the line check
  const mine = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.rate) || 0), 0);
  const ordered = Number(v.ordered) || 0, billed = Number(v.billed) || 0;
  if (ordered <= 0 || billed + mine <= ordered + 0.5) return null;
  const inr = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`;
  const extra = free.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.rate) || 0), 0);
  const why = free.length
    ? `including ${inr(extra)} on lines that are not on the order`
    : 'and an earlier invoice for this order has lines that are not on it';
  return `${v.order_number} was ordered for ${inr(ordered)} (before tax), and ${inr(billed)} of it is already invoiced. `
       + `This invoice adds ${inr(mine)}, ${why} — `
       + `${inr(billed + mine)} in all. If that is freight or an extra the customer agreed to, bill it anyway; `
       + 'if the order has already been invoiced, cancel the earlier invoice first.';
}

module.exports = { billedLines, linkLines, overBilled, checkOrderBilling, aboveOrderValue, key };
