/* ══════════════════════════════════════════════════════════
   SalesQuotationController — customer-facing quotations (Wave 1A)
   Quote a customer for parts/products, then convert a won quote
   straight into a Customer Order. GST + amount-in-words mirror the
   sales-invoice logic; owner-scoped.
   ══════════════════════════════════════════════════════════ */
const crypto = require('crypto');
const db = require('../db');
const { isInterstate } = require('../shared/gstStates');
const { profileFor } = require('../shared/companyProfile');
const { allocate, noteUsed } = require('../shared/docSeries');
const { isCrossTenant } = require('../shared/roles');
const { scopedById, assertOwned } = require('../shared/ownerScope');
const { runList } = require('../shared/listQuery');
const { notify } = require('../notify');
const { prepareLines, checkAdjustments } = require('../shared/lineChecks');
const { suggestDeliveryDays } = require('../shared/leadTime');
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const isAdmin = (req) => isCrossTenant(req.user?.role);

/* India's today. The database runs in UTC, so CURRENT_DATE is yesterday
   until 05:30 IST — and a quotation "valid until 8 Oct" must still be open
   to accept at 2 a.m. on the 8th in Hyderabad. */
const TODAY_IST = `(NOW() AT TIME ZONE 'Asia/Kolkata')::date`;

const bad = (message) => Object.assign(new Error(message), { status: 400 });

/* "Delivery: within N days of order" — a whole number from 0 to 730 (the
   column's CHECK), or blank for no promise. Refused here with a sentence;
   left to the constraint it would answer 500. */
function deliveryDaysOf(v) {
  if (v === undefined) return undefined;
  if (v === null || String(v).trim() === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 730) {
    throw bad('Delivery must be a whole number of days, from 0 to 730.');
  }
  return n;
}
function deliveryNoteOf(v) {
  if (v === undefined) return undefined;
  const s = String(v ?? '').trim();
  if (s.length > 500) throw bad('Keep the delivery note under 500 characters.');
  return s || null;
}

/* Lines below their product's minimum order quantity.
 *
   Not refused. A quotation is the seller's offer, and agreeing a smaller
   first order is the seller's call — the public enquiry is where the
   minimum is enforced. But it is reported back, so a line under the
   minimum is a decision someone made rather than one nobody noticed. The
   minimum is read from the product itself, this organisation's only,
   never from a figure the browser sent. */
async function belowMoq(exec, lines, ownerId) {
  const ids = [...new Set(lines.map(l => Number(l.skuId || l.sku_id)).filter(n => Number.isInteger(n) && n > 0))];
  if (!ids.length || ownerId == null) return [];
  const { rows } = await exec.query(
    'SELECT id, moq, unit FROM skus WHERE id = ANY($1) AND owner_id = $2 AND moq > 0', [ids, ownerId]);
  const byId = new Map(rows.map(r => [r.id, r]));
  const out = [];
  lines.forEach((l, i) => {
    const s = byId.get(Number(l.skuId || l.sku_id));
    if (s && Number(l.quantity) < Number(s.moq)) {
      out.push({ line: i + 1, description: l.description, quantity: Number(l.quantity), moq: Number(s.moq), unit: s.unit || l.uom || 'nos' });
    }
  });
  return out;
}

/* Words for amounts: one shared function (shared/amountInWords), which
   spells a crore count of any size. This file had its own copy, which
   printed "undefined Hundred … Crore" from 1,000 crore up. */
const { amountInWords } = require('../shared/amountInWords');

/* Lines are checked first (shared/lineChecks): a line with figures but no
   description, an impossible quantity or rate, a discount larger than the
   sub-total or a round-off over ₹1 is refused with a 400 that says which.
   `strictUnits` for lines a person has just sent. */
function compute(items, { discount = 0, gstRate = 18, interstate = false, roundOff = 0 }, { strictUnits = false } = {}) {
  const lines = prepareLines(items, { strictUnits }).map(it => ({ ...it, amount: r2(it.quantity * it.rate) }));
  const subTotal = r2(lines.reduce((s, l) => s + l.amount, 0));
  checkAdjustments(subTotal, { discount, roundOff });
  const taxable = r2(subTotal - Number(discount || 0));
  const gstTotal = r2(taxable * (Number(gstRate) || 0) / 100);
  const cgst = interstate ? 0 : r2(gstTotal / 2);
  const sgst = interstate ? 0 : r2(gstTotal - cgst);
  const igst = interstate ? gstTotal : 0;
  const net = r2(taxable + gstTotal + Number(roundOff || 0));
  return { lines, subTotal, gstTotal, cgst, sgst, igst, net };
}

/* Takes the executor rather than reaching for `db`.
 *
 * This was called from inside an open transaction, so the request already
 * held one client from the pool and then asked the pool for a second. With
 * PG_POOL_MAX at 4, four concurrent quotations each held one and each
 * waited for another, and every one of them failed with "timeout exceeded
 * when trying to connect". Not a capacity limit — a deadlock, and one that
 * would appear the moment four people used the product at once.
 *
 * `exec` is the caller's client when there is a transaction, and the pool
 * when there is not.
 */
async function deriveInterstate(exec, customerId, ownerId = null) {
  let company = null, customer = null;
  try { company = await profileFor(exec, ownerId, '*'); } catch { /* optional */ }
  if (customerId) customer = (await exec.query('SELECT * FROM customers WHERE id = $1', [customerId])).rows[0];
  /* PLACE OF SUPPLY, not the customer's registration.
   *
   * Under GST the CGST+SGST vs IGST split follows where the goods actually
   * go. This read only the customer's GSTIN, so a customer registered in
   * one state but taking delivery in another was quoted the wrong tax —
   * and a quotation is what the customer agrees a price against, so the
   * error carries into the order and the invoice.
   *
   * SalesInvoiceController.resolveTax has followed the ship-to address for
   * a while; this is the same rule, and the same precedence: shipping
   * state, then billing state, then whatever the GSTIN implies.
   *
   * Also uses the shared helper rather than slicing two characters by hand,
   * so "Telangana" and "36" compare equal instead of never matching. */
  const supplier = company?.stateCode || company?.gstin || null;
  const placeOfSupply =
    customer?.shipping_state || customer?.state || customer?.gstin || null;
  return isInterstate(supplier, placeOfSupply) === true;
}

// GET /sales-quotations
exports.list = async (req, res) => {
  try {
    const admin = isAdmin(req);
    const where = [], params = [];
    if (!admin) { params.push(req.user.orgId); where.push(`owner_id = $${params.length}`); }
    // Joined in a subquery so the customer/party name is searchable too —
    // people look for "Apollo", not for an invoice number they don't have.
    const result = await runList(db, {
      /* Phone and email too, for "Share for approval" — the WhatsApp and
         email drafts go to the customer on the row. */
      table: `(SELECT sq.*, c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email
                 FROM sales_quotations sq LEFT JOIN customers c ON c.id = sq.customer_id) AS sq`,
      query: req.query,
      searchColumns: ["quote_number","customer_name","status","response_name"],
      filterColumns: ["status","customer_id"],
      allowedSort: ["id","quote_number","quote_date","valid_until","net_amount","status"],
      defaultSort: 'id', defaultDir: 'DESC',
      where, params,
      /* Aggregated over the filter, not the page — see runList. "Open value"
         is the number a sales desk actually watches: what is quoted and
         still winnable, excluding what has already converted or died. */
      summary: `COUNT(*)::int AS count,
                COALESCE(SUM(net_amount),0)::numeric AS quoted,
                COALESCE(SUM(net_amount) FILTER (WHERE status IN ('Draft','Sent')),0)::numeric AS open_value,
                /* Accepted is won — the customer said yes. Counting only Converted
                   dropped an accepted quote out of both "open" and "won" until
                   someone pressed Convert. */
                COUNT(*) FILTER (WHERE status IN ('Accepted','Converted'))::int AS won,
                COUNT(*) FILTER (WHERE valid_until IS NOT NULL AND valid_until < CURRENT_DATE
                                   AND status NOT IN ('Converted','Rejected'))::int AS expired`,
    });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// GET /sales-quotations/:id
exports.getById = async (req, res) => {
  try {
    const s = scopedById(req, req.params.id);
    const q = (await db.query(`SELECT * FROM sales_quotations WHERE ${s.where}`, s.params)).rows[0];
    if (!q) return res.status(404).json({ error: 'Quotation not found' });
    /* Each line's product minimum and lead time ride along, so a screen
       showing the quotation can warn about a line under its minimum and
       say where the delivery promise came from. */
    const items = (await db.query(
      `SELECT i.*, s.moq, s.lead_time_note
         FROM sales_quotation_items i
         LEFT JOIN skus s ON s.id = i.sku_id AND s.owner_id = $2
        WHERE i.sales_quotation_id = $1 ORDER BY i.sort_order`, [req.params.id, q.owner_id])).rows;
    const customer = q.customer_id ? (await db.query('SELECT * FROM customers WHERE id = $1', [q.customer_id])).rows[0] : null;
    let company = null;
    try { company = await profileFor(db, req.user?.orgId); } catch { /* optional */ }
    /* delivery_days / delivery_note are the promise as saved (SELECT *);
       this is what the products' lead times would suggest, for comparison. */
    const delivery_suggestion = suggestDeliveryDays(
      items.filter(i => i.lead_time_note).map(i => ({ note: i.lead_time_note, label: i.description })));
    res.json({ ...q, items, customer, company, delivery_suggestion });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// POST /sales-quotations
exports.create = async (req, res) => {
  const { customerId, quoteDate, validUntil, items, discount, gstRate, roundOff, notes, terms, enquiryId } = req.body;
  if (!customerId) return res.status(400).json({ error: 'Pick a customer' });
  if (!items || !items.length) return res.status(400).json({ error: 'Add at least one line item' });
  let deliveryDays, deliveryNote;
  try {
    deliveryDays = deliveryDaysOf(req.body.deliveryDays ?? req.body.delivery_days) ?? null;
    deliveryNote = deliveryNoteOf(req.body.deliveryNote ?? req.body.delivery_note) ?? null;
  } catch (e) { return res.status(400).json({ error: e.message }); }
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const interstate = await deriveInterstate(client, customerId, req.user?.orgId);
    const t = compute(items, { discount, gstRate, interstate, roundOff }, { strictUnits: true });
    /* From a sequence, not a count. COUNT(*) + 1 reissues a number after a
       delete and hands the same one to two people creating at once. */
    const qnum = await allocate(client, { ownerId: req.user?.orgId, docType: 'quotation' });
    const { rows } = await client.query(
      `INSERT INTO sales_quotations (owner_id, customer_id, quote_number, quote_date, valid_until,
         sub_total, discount, gst_rate, interstate, cgst, sgst, igst, gst_total, round_off, net_amount, amount_in_words, notes, terms,
         delivery_days, delivery_note)
       VALUES ($1,$2,$3,COALESCE($4::date, CURRENT_DATE),$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING id`,
      /* The date input on the form starts empty and nothing fills it, so
         every quotation raised through the UI was stored undated — 4 of 4
         on this database. A dated document is not a nicety: the quotation's
         date is what "valid until" is read against, and the same omission
         on an invoice breaks Rule 46(b). Defaulted in SQL rather than in the
         handler so it holds for any caller, not just this form. */
      [req.user?.orgId || null, customerId, qnum, quoteDate || null, validUntil || null,
       t.subTotal, discount || 0, gstRate ?? 18, interstate, t.cgst, t.sgst, t.igst, t.gstTotal, roundOff || 0, t.net, amountInWords(t.net), notes || null, terms || null,
       deliveryDays, deliveryNote]);
    const qid = rows[0].id;
    let so = 0;
    for (const l of t.lines) {
      await client.query(
        `INSERT INTO sales_quotation_items (sales_quotation_id, sku_id, description, hsn, uom, quantity, rate, amount, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [qid, l.skuId || null, l.description, l.hsn || null, l.uom || 'nos', l.quantity || 0, l.rate || 0, l.amount || 0, so++]);
    }
    /* Priced from an enquiry: link the two, so the enquiry shows the
       quotation it became and the chain runs back to the customer's first
       message. Only the caller's own enquiry, and only one not already
       linked to another quotation. */
    if (enquiryId && /^\d+$/.test(String(enquiryId))) {
      await client.query(
        `UPDATE enquiries SET quotation_id = $1, updated_at = NOW()
          WHERE id = $2 AND owner_id = $3 AND quotation_id IS NULL`,
        [qid, enquiryId, req.user?.orgId ?? null]);
    }
    const under = await belowMoq(client, t.lines, req.user?.orgId);
    await client.query('COMMIT');
    res.json({ id: qid, quoteNumber: qnum, net: t.net, deliveryDays, belowMoq: under });
  } catch (e) { await client.query('ROLLBACK'); res.status(e.status || 500).json({ error: e.message }); }
  finally { client.release(); }
};

// PATCH /sales-quotations/:id/status
exports.setStatus = async (req, res) => {
  const { status } = req.body;
  const allowed = ['Draft', 'Sent', 'Accepted', 'Rejected', 'Converted'];
  if (!allowed.includes(status)) return res.status(400).json({ error: `status must be one of ${allowed.join(', ')}` });
  try {
    const was = await assertOwned(db, req, res, 'sales_quotations', req.params.id,
      { columns: 'id, owner_id, quote_number, status, responded_at, response_name' });
    if (!was) return;
    /* The customer's online answer is recorded once, and the status says
       what it was (Accepted or Rejected). When somebody here moves the
       status on by hand — back to Draft to revise it, or over a change of
       mind given on the phone — that answer no longer describes the
       quotation, so it is cleared and the link can be answered afresh.
       The activity log keeps what the customer said. Converting keeps it:
       the order is the answer carried forward. */
    const clears = was.responded_at && was.status !== status && status !== 'Converted';
    const r = await db.query(
      `UPDATE sales_quotations SET status = $1
              ${clears ? ', responded_at = NULL, response_name = NULL, response_note = NULL' : ''}
        WHERE id = $2 RETURNING quote_number`, [status, req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'not found' });
    if (clears) {
      await db.query(
        `INSERT INTO activities ("projectId", type, description, timestamp, owner_id) VALUES (NULL, 'QUOTE_STATUS', $1, NOW(), $2)`,
        [`Quotation ${was.quote_number} set to ${status} by hand; ${was.response_name}'s online answer (${was.status === 'Rejected' ? 'declined' : 'accepted'}) was cleared`, was.owner_id],
      ).catch(() => {});
    }
    res.json({ success: true, status });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

/* PATCH /sales-quotations/:id — change a quotation after it exists.
 *
 * There was no way to do this at all: a typo in a rate meant deleting the
 * quotation and raising another under a new number, which is why quote
 * numbers had gaps in them.
 *
 * What may change depends on where the quotation has got to:
 *
 *   Draft            everything, including the number and the line items
 *   Sent / Accepted  only the things that are not the offer itself —
 *                    notes, terms, and how long it stays valid
 *   Converted        nothing; an order exists against these figures
 *
 * The line is drawn there because a quotation is what a customer agrees a
 * price against. Editing the rates on a quotation they already hold, under
 * the same number, leaves two different documents claiming to be QT-0007.
 * Extending its validity does not have that problem.
 */
/* The delivery promise is part of the offer, like the rates: changed while
   a Draft, fixed once the customer holds it. */
const QUOTE_OPEN_FIELDS = ['quote_number', 'quote_date', 'valid_until', 'discount',
  'gst_rate', 'round_off', 'notes', 'terms', 'payment_terms_days', 'customer_id',
  'delivery_days', 'delivery_note'];
const QUOTE_SENT_FIELDS = ['valid_until', 'notes', 'terms'];

exports.update = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const s = scopedById(req, req.params.id);
    const q = (await client.query(`SELECT * FROM sales_quotations WHERE ${s.where}`, s.params)).rows[0];
    if (!q) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Quotation not found' }); }

    if (q.status === 'Converted' || q.converted_order_id) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'This quotation has been converted to an order and can no longer be edited.',
      });
    }
    const draft = q.status === 'Draft';
    const allowed = draft ? QUOTE_OPEN_FIELDS : QUOTE_SENT_FIELDS;
    const offered = Object.keys(req.body || {}).filter(k => k !== 'items');
    const refused = offered.filter(k => !allowed.includes(k));
    if (refused.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: `This quotation has been sent, so ${refused.join(', ')} can no longer be changed. `
             + `Set it back to Draft first, or raise a revised quotation.`,
        editable: allowed,
      });
    }
    if (!draft && req.body.items) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Line items can only be changed while the quotation is a Draft.' });
    }

    /* A number the customer can quote back at you has to stay unique per
       supplier — the same rule Rule 46 puts on invoices, and the reason the
       number comes from a sequence rather than a count. */
    if (draft && req.body.quote_number && req.body.quote_number !== q.quote_number) {
      const clash = await client.query(
        'SELECT id FROM sales_quotations WHERE owner_id = $1 AND quote_number = $2 AND id <> $3',
        [q.owner_id, req.body.quote_number, q.id]);
      if (clash.rowCount) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: `Quotation number ${req.body.quote_number} is already used.` });
      }
      /* Same as invoices: a renamed number that fits the series moves the
         counter on, so the next quotation follows it. */
      await noteUsed(client, { ownerId: q.owner_id, docType: 'quotation', number: req.body.quote_number });
    }

    const set = {};
    for (const k of allowed) if (k in req.body) set[k] = req.body[k];
    if ('delivery_days' in set) set.delivery_days = deliveryDaysOf(set.delivery_days);
    if ('delivery_note' in set) set.delivery_note = deliveryNoteOf(set.delivery_note);

    /* Totals are recomputed here, never accepted from the client: the
       figures on the document must follow from the lines on it. */
    if (draft && (req.body.items || 'discount' in set || 'gst_rate' in set || 'round_off' in set || 'customer_id' in set)) {
      const items = req.body.items
        || (await client.query('SELECT * FROM sales_quotation_items WHERE sales_quotation_id = $1 ORDER BY sort_order', [q.id])).rows;
      const customerId = set.customer_id ?? q.customer_id;
      const interstate = await deriveInterstate(client, customerId, q.owner_id);
      const t = compute(items, {
        discount: set.discount ?? q.discount,
        gstRate: set.gst_rate ?? q.gst_rate,
        interstate,
        roundOff: set.round_off ?? q.round_off,
      }, { strictUnits: !!req.body.items });
      Object.assign(set, {
        sub_total: t.subTotal, interstate, cgst: t.cgst, sgst: t.sgst, igst: t.igst,
        gst_total: t.gstTotal, net_amount: t.net, amount_in_words: amountInWords(t.net),
      });
      if (req.body.items) {
        await client.query('DELETE FROM sales_quotation_items WHERE sales_quotation_id = $1', [q.id]);
        let so = 0;
        for (const l of t.lines) {
          await client.query(
            `INSERT INTO sales_quotation_items (sales_quotation_id, sku_id, description, hsn, uom, quantity, rate, amount, sort_order)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [q.id, l.skuId || l.sku_id || null, l.description, l.hsn || null, l.uom || 'nos',
             l.quantity || 0, l.rate || 0, l.amount || 0, so++]);
        }
      }
    }

    const cols = Object.keys(set);
    if (!cols.length) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Nothing to update' }); }
    const clause = cols.map((c, i) => `"${c}" = $${i + 1}`).join(', ');
    const { rows } = await client.query(
      `UPDATE sales_quotations SET ${clause} WHERE id = $${cols.length + 1} RETURNING *`,
      [...cols.map(c => set[c]), q.id]);
    const under = req.body.items
      ? await belowMoq(client, prepareLines(req.body.items), q.owner_id) : undefined;
    await client.query('COMMIT');
    res.json(under ? { ...rows[0], belowMoq: under } : rows[0]);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(e.status || 500).json({ error: e.message });
  } finally { client.release(); }
};

// POST /sales-quotations/:id/convert  → creates a Customer Order from the quote
exports.convertToOrder = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    /* Owner-scoped, and locked. This read `WHERE id = $1` alone, so anyone
       signed in could turn another company's quotation into an order by
       guessing its id; and two clicks at once both saw it unconverted and
       made two orders. FOR UPDATE makes the second wait and then find
       converted_order_id set. */
    const s = scopedById(req, req.params.id);
    const q = (await client.query(`SELECT * FROM sales_quotations WHERE ${s.where} FOR UPDATE`, s.params)).rows[0];
    if (!q) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Quotation not found' }); }
    if (q.converted_order_id) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'This quotation was already converted to an order' }); }
    /* Status was never consulted here — only converted_order_id. So a
       quotation the customer had REJECTED converted into a live customer
       order, with the stock commitment, production demand and revenue
       forecast that follow from one. The rejection is the one state that
       must block it: a Draft or Sent quote being converted is a shortcut
       somebody may legitimately want, a rejected one is an error. */
    if (q.status === 'Rejected') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'This quotation was rejected — reopen it before converting to an order' });
    }
    const items = (await client.query('SELECT * FROM sales_quotation_items WHERE sales_quotation_id = $1 ORDER BY sort_order', [q.id])).rows;
    if (!items.length) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Quotation has no line items' }); }

    const onum = await allocate(client, { ownerId: q.owner_id, docType: 'customer_order' });

    /* Carry the money across, not just the lines.

       This used to insert the header identity only — customer, number, date,
       status, notes — and nothing else. The line items came over with their
       rates, but every commercial column on the order stayed at its default:
       sub_total 0, discount 0, gst_total 0, total 0, amount_in_words null,
       and interstate FALSE regardless of what the quotation had decided.

       So converting a won ₹94,400 quotation produced an order that read ₹0
       in the list, dropped the negotiated discount, and silently switched an
       inter-state supply to intra-state — which is the difference between
       IGST and CGST+SGST on the invoice that follows.

       Recomputed from the lines with the same compute() the quotation
       itself used, rather than copied field-for-field. Copying would make
       the order agree with the quotation; recomputing makes it agree with
       the rows actually inserted, which is the stronger property — and it
       cannot drift from the quotation's arithmetic because it IS the
       quotation's arithmetic. The discount and tax treatment are the
       quotation's decisions and pass through unchanged. */
    const t = compute(items, {
      discount: Number(q.discount) || 0,
      gstRate: Number(q.gst_rate) || 0,
      interstate: !!q.interstate,
      roundOff: Number(q.round_off) || 0,
    });

    /* The delivery the quotation promised becomes the date the order must
       ship by: the order's date plus the days promised. Stated as days
       after the order on the quotation because nobody knows on what day
       the customer will say yes; here, now, they have. */
    const days = q.delivery_days == null ? null : Number(q.delivery_days);
    const notes = [`Converted from quotation ${q.quote_number}`];
    if (days != null) notes.push(`delivery promised within ${days} day${days === 1 ? '' : 's'} of order${q.delivery_note ? ` (${q.delivery_note})` : ''}`);
    else if (q.delivery_note) notes.push(`delivery: ${q.delivery_note}`);
    const co = await client.query(
      `INSERT INTO customer_orders (
         owner_id, customer_id, order_number, customer_po_ref, order_date, status, notes,
         sub_total, discount, discount_type, gst_rate, interstate,
         cgst, sgst, igst, gst_total, round_off, total, amount_in_words,
         terms, payment_terms_days, expected_shipment_date)
       VALUES ($1,$2,$3,$4,CURRENT_DATE,'Open',$5,
               $6,$7,'flat',$8,$9,
               $10,$11,$12,$13,$14,$15,$16,
               $17,$18, CURRENT_DATE + $19::int) RETURNING id, order_date, expected_shipment_date`,
      [q.owner_id, q.customer_id, onum, q.quote_number, notes.join(' · '),
       t.subTotal, Number(q.discount) || 0, Number(q.gst_rate) || 0, !!q.interstate,
       t.cgst, t.sgst, t.igst, t.gstTotal, Number(q.round_off) || 0, t.net, amountInWords(t.net),
       q.terms || null, q.payment_terms_days || null, days]);
    const orderId = co.rows[0].id;
    const shipBy = co.rows[0].expected_shipment_date || null;
    for (const it of items) {
      await client.query(
        `INSERT INTO customer_order_items (customer_order_id, sku_id, description, quantity, unit, target_price)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [orderId, it.sku_id, it.description, it.quantity, it.uom || 'nos', it.rate]);
    }
    await client.query(`UPDATE sales_quotations SET status = 'Converted', converted_order_id = $1 WHERE id = $2`, [orderId, q.id]);
    await client.query('COMMIT');
    notify({ org: q.owner_id }, { type: 'QUOTE_CONVERTED', title: `Quotation ${q.quote_number} won`, message: `Converted to order ${onum}${shipBy ? ` · ship by ${shipBy}` : ''}`, entityType: 'customer_order', entityId: orderId, link: '/customer-orders' });
    res.json({ success: true, orderId, orderNumber: onum, orderDate: co.rows[0].order_date, expectedShipmentDate: shipBy });
  } catch (e) { await client.query('ROLLBACK'); res.status(e.status || 500).json({ error: e.message }); }
  finally { client.release(); }
};

// DELETE /sales-quotations/:id
exports.remove = async (req, res) => {
  try {
    if (!await assertOwned(db, req, res, 'sales_quotations', req.params.id, { columns: 'id' })) return;
    const r = await db.query('DELETE FROM sales_quotations WHERE id = $1', [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'not found' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

/* ══════════════════════════════════════════════════════════════════════
   ACCEPT OR DECLINE ONLINE

   "How do you know a quotation was accepted?" Until now: somebody was told
   on the phone and changed the status by hand, or nobody did. A quotation
   can now carry a private link the customer opens without an account,
   reads, and accepts or declines with their name and a note. The answer is
   recorded once, with when and by whom, and the business is told.

   The link is the credential, as an invitation link is: 24 random bytes,
   so it cannot be guessed or counted towards. The public side only ever
   looks a quotation up by that token, and answers with what the customer
   needs to read — the business's name, GSTIN and address, the lines, the
   totals, the terms and the delivery — and nothing internal.
   ══════════════════════════════════════════════════════════════════════ */

const TOKEN = /^[A-Za-z0-9_-]{20,64}$/;
const NOT_FOUND = 'This quotation link is not valid. It may have been mistyped, or the quotation may have been withdrawn.';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/* "2026-10-08", or a timestamp read in India's calendar, as "8 Oct 2026". */
const onDate = (v) => {
  if (!v) return '';
  const ymd = v instanceof Date
    ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(v)
    : String(v).slice(0, 10);
  const [y, m, d] = ymd.split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
};

// POST /sales-quotations/:id/share-link — the link to send the customer.
exports.shareLink = async (req, res) => {
  try {
    const q = await assertOwned(db, req, res, 'sales_quotations', req.params.id, { columns: 'id, owner_id' });
    if (!q) return;
    /* One link per quotation, made the first time it is shared and the
       same every time after — a customer who has the first message must
       not find it dead because it was sent again on WhatsApp. COALESCE
       rather than read-then-write, so two people sharing at once still end
       up with one token. Sharing a Draft sends it: from here the customer
       holds the offer, and a Sent quotation's rates no longer change. */
    const { rows: [r] } = await db.query(
      `UPDATE sales_quotations
          SET accept_token = COALESCE(accept_token, $1),
              link_sent_at = NOW(),
              status = CASE WHEN status = 'Draft' THEN 'Sent' ELSE status END
        WHERE id = $2
        RETURNING accept_token, status, link_sent_at, quote_number, net_amount, valid_until, customer_id`,
      [crypto.randomBytes(24).toString('base64url'), q.id]);
    const customer = r.customer_id
      ? (await db.query('SELECT name, phone, email FROM customers WHERE id = $1 AND owner_id = $2', [r.customer_id, q.owner_id])).rows[0] || null
      : null;
    const co = await profileFor(db, q.owner_id, 'name').catch(() => null);
    /* A path, as invitations return one; the page that asked knows its own
       address (window.location.origin), which is how the catalogue link is
       built too. `url` is filled from PUBLIC_APP_URL when that is set, or
       from the asking page's Origin — handed back to the same signed-in
       caller, never sent anywhere by the server. */
    const path = `/q/${r.accept_token}`;
    const base = String(process.env.PUBLIC_APP_URL || req.get('origin') || '').replace(/\/+$/, '');
    res.json({
      token: r.accept_token, path, url: base ? `${base}${path}` : path,
      status: r.status, linkSentAt: r.link_sent_at,
      quoteNumber: r.quote_number, net: Number(r.net_amount) || 0, validUntil: r.valid_until,
      customer, company: { name: co?.name || null },
    });
  } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
};

/* What the customer sees. Named field by field, never a spread of the row:
   sales_quotations also carries the owner, the customer's id, the order it
   became and the token itself, and this answers a stranger. */
async function publicView(exec, token) {
  const { rows: [q] } = await exec.query(
    `SELECT sq.id, sq.owner_id, sq.quote_number, sq.quote_date, sq.valid_until, sq.status,
            sq.sub_total, sq.discount, sq.gst_rate, sq.interstate, sq.cgst, sq.sgst, sq.igst,
            sq.gst_total, sq.round_off, sq.net_amount, sq.amount_in_words, sq.terms,
            sq.payment_terms_days, sq.delivery_days, sq.delivery_note,
            sq.responded_at, sq.response_name, sq.response_note,
            (sq.valid_until IS NOT NULL AND sq.valid_until < ${TODAY_IST}) AS expired,
            c.name AS customer_name
       FROM sales_quotations sq
       LEFT JOIN customers c ON c.id = sq.customer_id AND c.owner_id = sq.owner_id
      WHERE sq.accept_token = $1`, [token]);
  if (!q) return null;
  const { rows: lines } = await exec.query(
    `SELECT description, hsn, uom, quantity, rate, amount FROM sales_quotation_items
      WHERE sales_quotation_id = $1 ORDER BY sort_order, id`, [q.id]);
  /* Narrow on purpose: company_profile also holds the bank account. */
  const co = (await profileFor(exec, q.owner_id,
    'name, "tradeName", gstin, address, phone, email, invoice_terms').catch(() => null)) || {};
  const answered = !!q.responded_at;
  return {
    company: {
      name: co.name || null, tradeName: co.tradeName || null, gstin: co.gstin || null,
      address: co.address || null, phone: co.phone || null, email: co.email || null,
    },
    customer: { name: q.customer_name || null },
    quotation: {
      number: q.quote_number, date: q.quote_date, validUntil: q.valid_until,
      status: q.status, expired: !!q.expired,
      subTotal: Number(q.sub_total) || 0, discount: Number(q.discount) || 0,
      taxable: r2(Number(q.sub_total) - Number(q.discount || 0)),
      gstRate: Number(q.gst_rate) || 0, interstate: !!q.interstate,
      cgst: Number(q.cgst) || 0, sgst: Number(q.sgst) || 0, igst: Number(q.igst) || 0,
      gstTotal: Number(q.gst_total) || 0, roundOff: Number(q.round_off) || 0,
      total: Number(q.net_amount) || 0, amountInWords: q.amount_in_words || null,
      terms: q.terms || co.invoice_terms || null,
      paymentTermsDays: q.payment_terms_days ?? null,
      deliveryDays: q.delivery_days ?? null, deliveryNote: q.delivery_note || null,
    },
    lines: lines.map(l => ({
      description: l.description, hsn: l.hsn || null, quantity: Number(l.quantity) || 0,
      unit: l.uom || 'nos', rate: Number(l.rate) || 0, amount: Number(l.amount) || 0,
    })),
    /* The status records which way they answered: setStatus clears the
       answer whenever somebody moves the status on by hand. */
    response: answered ? {
      decision: q.status === 'Rejected' ? 'declined' : 'accepted',
      name: q.response_name, note: q.response_note || null, at: q.responded_at,
    } : null,
    canRespond: !answered && ['Draft', 'Sent'].includes(q.status) && !q.expired,
  };
}

/* How to reach the business, for the refusals that send the customer back
   to them. */
const reach = (co) => [co.phone && `on ${co.phone}`, co.email && `at ${co.email}`].filter(Boolean).join(' or ');

// GET /public/quotations/:token — no session; the token is the credential.
exports.publicQuote = async (req, res) => {
  try {
    const token = String(req.params.token || '');
    const view = TOKEN.test(token) ? await publicView(db, token) : null;
    if (!view) return res.status(404).json({ error: NOT_FOUND });
    /* Whoever holds the link, and nobody else: no shared cache keeps a
       copy, and no search engine lists it. */
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Robots-Tag', 'noindex');
    res.json(view);
  } catch (e) {
    console.error('public quotation:', e.message);
    res.status(500).json({ error: 'Something went wrong on our side. Please try again in a minute.' });
  }
};

// POST /public/quotations/:token/respond — { decision, name, note }
exports.publicRespond = async (req, res) => {
  try {
    const token = String(req.params.token || '');
    if (!TOKEN.test(token)) return res.status(404).json({ error: NOT_FOUND });
    const b = req.body || {};
    if (!['accept', 'decline'].includes(b.decision)) {
      return res.status(400).json({ error: 'Choose whether to accept or decline the quotation.' });
    }
    const name = String(b.name ?? '').trim().replace(/\s+/g, ' ');
    if (!name) return res.status(400).json({ error: 'Please type your name, so they know who answered.' });
    if (name.length > 120) return res.status(400).json({ error: 'Please keep your name under 120 characters.' });
    const note = String(b.note ?? '').trim();
    if (note.length > 1000) return res.status(400).json({ error: 'Please keep the note under 1,000 characters.' });

    /* One statement decides it, so two answers sent at once cannot both
       land: only a quotation that is unanswered, still open (Draft or
       Sent) and not past its validity in India today takes the answer. */
    const status = b.decision === 'accept' ? 'Accepted' : 'Rejected';
    const { rows: [done] } = await db.query(
      `UPDATE sales_quotations
          SET status = $2, responded_at = NOW(), response_name = $3, response_note = $4
        WHERE accept_token = $1 AND responded_at IS NULL AND status IN ('Draft', 'Sent')
          AND (valid_until IS NULL OR valid_until >= ${TODAY_IST})
        RETURNING id, owner_id, quote_number, customer_id`,
      [token, status, name, note || null]);

    if (!done) {
      /* Say why, in the customer's terms. */
      const view = await publicView(db, token);
      if (!view) return res.status(404).json({ error: NOT_FOUND });
      const seller = view.company.name || 'The seller';
      const contact = reach(view.company);
      if (view.response) {
        return res.status(409).json({
          error: `This quotation was already ${view.response.decision} by ${view.response.name} on ${onDate(view.response.at)}.`
            + ` If that needs to change, please contact ${seller}${contact ? ` ${contact}` : ''}.`,
          response: view.response,
        });
      }
      if (view.quotation.expired) {
        return res.status(410).json({
          error: `This quotation expired on ${onDate(view.quotation.validUntil)}, so it can no longer be accepted online.`
            + ` Please contact ${seller}${contact ? ` ${contact}` : ''} for a fresh quotation.`,
          expired: true,
        });
      }
      const already = {
        Converted: 'confirmed this quotation as an order',
        Accepted: 'recorded this quotation as accepted',
        Rejected: 'recorded this quotation as declined',
      };
      return res.status(409).json({
        error: `${seller} has already ${already[view.quotation.status] || 'closed this quotation'}.`
          + ` If that is not right, please contact them${contact ? ` ${contact}` : ''}.`,
      });
    }

    const view = await publicView(db, token);
    const verb = status === 'Accepted' ? 'accepted' : 'declined';
    const who = `${name}${view.customer.name && view.customer.name !== name ? ` (${view.customer.name})` : ''}`;
    await db.query(
      `INSERT INTO activities ("projectId", type, description, timestamp, owner_id) VALUES (NULL, $1, $2, NOW(), $3)`,
      [status === 'Accepted' ? 'QUOTE_ACCEPTED' : 'QUOTE_DECLINED',
       `Quotation ${done.quote_number} ${verb} online by ${who}${note ? ` — “${note.slice(0, 200)}”` : ''}`, done.owner_id],
    ).catch((e) => console.error('activity:', e.message));
    /* Awaited: notify never throws, and the business should be told before
       the customer is told they have been. */
    await notify({ org: done.owner_id }, {
      type: status === 'Accepted' ? 'QUOTE_ACCEPTED' : 'QUOTE_DECLINED',
      title: `Quotation ${done.quote_number} ${verb}`,
      message: `${who} ${verb} it online${note ? `: “${note.slice(0, 140)}”` : '.'}`,
      entityType: 'sales_quotation', entityId: done.id, link: '/sales-quotations',
    });
    res.json(view);
  } catch (e) {
    console.error('public quotation response:', e.message);
    res.status(500).json({ error: 'Something went wrong on our side, and your answer was not saved. Please try again in a minute.' });
  }
};
