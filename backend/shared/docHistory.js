/* ══════════════════════════════════════════════════════════
   Document history — every change to an invoice, quotation, delivery
   challan, purchase order, vendor bill or credit/debit note is kept.

   A document can be changed on its page (terms, dates, notes, a draft's
   lines), reopened as a draft, sent, signed off, cancelled. Each of those
   used to overwrite what was there. Now the route that makes the change is
   wrapped (track): the document is copied just before it runs and again
   just after it answers, and if anything differs the pair is kept in
   document_versions with who and when. The History panel on the page
   lists them and can show any earlier copy.

   Wrapping the route, not editing each controller, keeps one rule in one
   place and means the controllers' own checks are untouched: a change
   they refuse answers 4xx and nothing is written.

   The table is optional to the rest of the app. If it isn't there yet
   (code deployed before the migration), copying fails quietly and the
   change itself goes through as before.
   ══════════════════════════════════════════════════════════ */
const db = require('../db');
const { isCrossTenant } = require('./roles');

/* What a copy holds: the document's row, its lines, and who it is for. */
const DOCS = {
  sales_invoice: {
    table: 'sales_invoices', items: 'sales_invoice_items', fk: 'sales_invoice_id', order: 'sort_order, id',
    party: { key: 'customer', table: 'customers', col: 'customer_id' }, number: 'invoice_number', label: 'Invoice',
  },
  sales_quotation: {
    table: 'sales_quotations', items: 'sales_quotation_items', fk: 'sales_quotation_id', order: 'sort_order, id',
    party: { key: 'customer', table: 'customers', col: 'customer_id' }, number: 'quote_number', label: 'Quotation',
  },
  delivery_challan: {
    table: 'delivery_challans', items: 'delivery_challan_items', fk: 'delivery_challan_id', order: 'sort_order, id',
    party: { key: 'customer', table: 'customers', col: 'customer_id' }, number: 'challan_number', label: 'Delivery challan',
  },
  purchase_order: {
    table: 'purchase_orders', items: 'po_line_items', fk: '"poId"', order: 'sno, id',
    party: { key: 'vendor', table: 'vendors', col: 'vendorId' }, number: 'poNumber', label: 'Purchase order',
  },
  grn_bill: {
    table: 'grn_bills', items: 'grn_bill_items', fk: 'grn_bill_id', order: 'sort_order, id',
    party: { key: 'vendor', table: 'vendors', col: 'vendor_id' }, number: 'bill_number', label: 'Vendor bill',
  },
  credit_debit_note: {
    table: 'credit_debit_notes', items: 'credit_debit_note_items', fk: 'note_id', order: 'sort_order, id',
    party: { key: 'party', col: 'party_id', tableFrom: (d) => (d.party_type === 'vendor' ? 'vendors' : 'customers') },
    number: 'note_number', label: 'Note',
  },
};


async function snapshot(type, id) {
  const d = DOCS[type];
  if (!d || !/^\d+$/.test(String(id))) return null;
  const [docR, itemsR] = await Promise.all([
    db.query(`SELECT * FROM ${d.table} WHERE id = $1`, [id]),
    db.query(`SELECT * FROM ${d.items} WHERE ${d.fk} = $1 ORDER BY ${d.order}`, [id]),
  ]);
  const doc = docR.rows[0];
  if (!doc) return null;
  const snap = { ...doc, items: itemsR.rows };
  const pid = doc[d.party.col];
  if (pid) {
    const tbl = d.party.tableFrom ? d.party.tableFrom(doc) : d.party.table;
    const p = (await db.query(`SELECT * FROM ${tbl} WHERE id = $1`, [pid])).rows[0];
    /* whole, as the page prints from it: name, GSTIN, billing and
       shipping addresses, contact */
    if (p) snap[d.party.key] = p;
  }
  return JSON.parse(JSON.stringify(snap));   // dates as text, as the API sends them
}

/* Columns that move without anyone changing the document, or that only
   restate another column — left out when deciding whether it changed and
   from the list of what changed. */
const QUIET = new Set([
  'id', 'owner_id', 'created_at', 'createdAt', 'updated_at', 'updatedAt',
  'amount_paid', 'payment_status', 'reminder_stage', 'amount_in_words', 'amountInWords',
  'sub_total', 'cgst', 'sgst', 'igst', 'gst_total', 'place_of_supply_code',
  'accept_token', 'link_sent_at', 'responded_at', 'stock_applied', 'stock_applied_at',
  'irn_qr_payload', 'received_quantity', 'converted_order_id',
  'items', 'customer', 'vendor', 'party',
]);

const LABELS = {
  invoice_number: 'Invoice number', invoice_date: 'Invoice date', due_date: 'Due date',
  quote_number: 'Quotation number', quote_date: 'Quotation date', valid_until: 'Valid until',
  challan_number: 'Challan number', challan_date: 'Challan date',
  bill_number: 'Bill number', vendor_bill_ref: 'Vendor’s bill no.', bill_date: 'Bill date',
  note_number: 'Note number', note_date: 'Note date', ref_number: 'Against invoice', ref_date: 'Invoice date',
  poNumber: 'PO number', quoteRef: 'Vendor quotation ref', paymentTerms: 'Payment terms',
  priceBasis: 'Price basis', pnfInsurance: 'P&F and insurance', loadingScope: 'Loading',
  warranty: 'Warranty', approval_status: 'Sign-off', approval_remark: 'Sign-off remark',
  itemName: 'Item', quantity: 'Quantity', unitPrice: 'Unit price',
  customer_id: 'Customer', vendor_id: 'Vendor', vendorId: 'Vendor', party_id: 'Party',
  discount: 'Discount', gst_rate: 'GST rate', round_off: 'Round off', interstate: 'Tax',
  freight: 'Freight', other_charges: 'Other charges', reverse_charge: 'Reverse charge',
  net_amount: 'Total', total: 'Total', total_value: 'Total value',
  notes: 'Notes', terms: 'Terms', reason: 'Reason', status: 'Status',
  payment_terms_days: 'Payment terms (days)', delivery_days: 'Delivery (days)', delivery_note: 'Delivery note',
  place_of_supply: 'Place of supply',
  bill_to_name: 'Bill to', bill_to_address: 'Bill-to address', bill_to_gstin: 'Bill-to GSTIN', bill_to_state: 'Bill-to state',
  ship_to_name: 'Ship to', ship_to_address: 'Ship-to address', ship_to_gstin: 'Ship-to GSTIN', ship_to_state: 'Ship-to state',
  dispatch_through: 'Dispatched through', transporter_name: 'Transporter', transporter_gstin: 'Transporter GSTIN',
  vehicle_no: 'Vehicle no.', lr_no: 'LR no.', driver_name: 'Driver', driver_phone: 'Driver’s phone',
  eway_bill_no: 'E-way bill no.', eway_bill_date: 'E-way bill date',
  irn: 'IRN', irn_ack_no: 'IRN acknowledgement no.', irn_ack_date: 'IRN acknowledgement date', einvoice_status: 'E-invoice',
};
const MONEY = new Set(['rate', 'unitPrice', 'amount', 'net_amount', 'total', 'total_value', 'discount',
  'freight', 'other_charges', 'round_off']);
const humanize = (k) => k.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase());

function show(key, v, snap) {
  if (v === null || v === undefined || v === '') return '—';
  if (key === 'interstate') return v ? 'IGST' : 'CGST + SGST';
  if (key === 'reverse_charge') return v ? 'Yes' : 'No';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (['customer_id', 'vendor_id', 'vendorId', 'party_id'].includes(key)) {
    const p = snap?.customer || snap?.vendor || snap?.party;
    return p && String(p.id) === String(v) && p.name ? p.name : `#${v}`;
  }
  if (key === 'gst_rate') return `${Number(v)}%`;
  if (MONEY.has(key) && v !== '' && Number.isFinite(Number(v))) {
    return '₹' + Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split('-').map(Number);
    return `${d} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${y}`;
  }
  if (typeof v === 'object') return JSON.stringify(v);
  const s = String(v);
  /* 120.0000 and 120 are the same number */
  if (/^-?\d+\.\d+$/.test(s)) return String(Number(s));
  return s;
}
const same = (a, b) => {
  const n = (x) => (x === null || x === undefined || x === '' ? null
    : (typeof x === 'string' && /^-?\d+(\.\d+)?$/.test(x)) || typeof x === 'number' ? Number(x) : x);
  return JSON.stringify(n(a)) === JSON.stringify(n(b));
};

const LINE_FIELDS = [['description', 'Description'], ['hsn', 'HSN'], ['quantity', 'Quantity'],
  ['uom', 'Unit'], ['rate', 'Rate'], ['unitPrice', 'Rate']];
const lineKey = (l) => LINE_FIELDS.map(([k]) => String(l[k] ?? '')).join('|');
const lineName = (l) => String(l.description || '').trim() || 'a line';

/* What changed between two copies, in words: header fields first, then
   lines. Lines are matched as a person would read them — the same line
   unchanged, then the same description, then by position — because a
   draft's lines are rewritten (new ids) every time they are saved. */
function changes(before, after) {
  const out = [];
  const keys = [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])];
  for (const k of keys) {
    if (QUIET.has(k) || k.startsWith('_')) continue;
    const a = before?.[k], b = after?.[k];
    if (typeof a === 'object' && a !== null) continue;
    if (typeof b === 'object' && b !== null) continue;
    if (same(a, b)) continue;
    out.push({ field: LABELS[k] || humanize(k), from: show(k, a, before), to: show(k, b, after) });
  }
  const A = [...(before?.items || [])], B = [...(after?.items || [])];
  const ia = A.map((l, i) => ({ l, i })), ib = B.map((l, i) => ({ l, i }));
  const pairs = [];
  const take = (match) => {
    for (const x of [...ia]) {
      const j = ib.findIndex(y => match(x, y));
      if (j < 0) continue;
      pairs.push([x, ib[j]]); ia.splice(ia.indexOf(x), 1); ib.splice(j, 1);
    }
  };
  take((x, y) => lineKey(x.l) === lineKey(y.l));
  take((x, y) => String(x.l.description || '').trim() && String(x.l.description).trim() === String(y.l.description || '').trim());
  /* A line whose wording was corrected keeps its quantity and rate; one
     that shares none of description, quantity and rate was replaced. */
  const alike = (x, y) => ['description', 'quantity', 'rate', 'unitPrice']
    .filter(k => (k in x.l || k in y.l) && same(x.l[k], y.l[k])).length >= 2;
  take(alike);
  pairs.sort((p, q) => p[1].i - q[1].i);
  for (const [x, y] of pairs) {
    for (const [k, label] of LINE_FIELDS) {
      if (!(k in x.l) && !(k in y.l)) continue;
      if (same(x.l[k], y.l[k])) continue;
      out.push({ field: `${label}, line ${y.i + 1}`, from: show(k, x.l[k]), to: show(k, y.l[k]), line: y.i + 1 });
    }
  }
  for (const y of ib) out.push({ field: `Line ${y.i + 1} added`, from: '', to: `${lineName(y.l)} · ${show('quantity', y.l.quantity)} × ${show('rate', y.l.rate ?? y.l.unitPrice)}`, line: y.i + 1 });
  for (const x of ia) out.push({ field: 'Line removed', from: `${lineName(x.l)} · ${show('quantity', x.l.quantity)} × ${show('rate', x.l.rate ?? x.l.unitPrice)}`, to: '' });
  return out;
}

async function record(req, type, id, action, before) {
  const after = await snapshot(type, id);
  if (!after || !changes(before, after).length) return null;
  const { rows } = await db.query(
    `INSERT INTO document_versions (owner_id, doc_type, doc_id, action, before, after, changed_by, changed_by_name)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8) RETURNING id`,
    [after.owner_id ?? before.owner_id ?? null, type, Number(id), action,
      JSON.stringify(before), JSON.stringify(after),
      Number(req.user?.id) || null, req.user?.name || req.user?.email || null]);
  return rows[0]?.id ?? null;
}

/* Wrap a handler that changes a document. The copy before is taken first;
   the copy after once the handler has answered with success, so the
   person isn't kept waiting for it. Works for a real response and for
   the in-process one shared/bulk.callRoute hands a bulk action. */
function track(type, action, handler) {
  return async (req, res, next) => {
    const id = req.params?.id;
    let before = null;
    try { before = await snapshot(type, id); } catch { before = null; }
    if (!before) return handler(req, res, next);
    let code = 200;
    const status = res.status.bind(res);
    res.status = (c) => { code = c; return status(c); };
    const json = res.json.bind(res);
    let done = false;
    res.json = (body) => {
      const out = json(body);
      if (!done && code < 400) {
        done = true;
        record(req, type, id, action, before)
          .catch(e => { if (!/document_versions/.test(e.message)) console.error('[history]', type, id, e.message); });
      }
      return out;
    };
    return handler(req, res, next);
  };
}

/* The same, as route middleware, for a handler written inline. */
const trackMw = (type, action) => track(type, action, (req, res, next) => next());

/* GET /<documents>/:id/history — the changes, newest first. The route's
   own resource permission (read) has already been checked by the general
   guard; here, only that the document is this company's. */
function historyRoute(type) {
  return async (req, res) => {
    const d = DOCS[type];
    try {
      const id = req.params.id;
      if (!/^\d+$/.test(String(id))) return res.status(404).json({ error: `${d.label} not found` });
      const doc = (await db.query(`SELECT id, owner_id FROM ${d.table} WHERE id = $1`, [id])).rows[0];
      const mine = doc && (isCrossTenant(req.user?.role)
        || String(doc.owner_id ?? '') === String(req.user?.orgId ?? req.user?.id ?? ''));
      if (!mine) return res.status(404).json({ error: `${d.label} not found` });
      let rows = [];
      try {
        rows = (await db.query(
          `SELECT id, action, before, after, changed_by_name, created_at
             FROM document_versions WHERE doc_type = $1 AND doc_id = $2
            ORDER BY id DESC LIMIT 200`, [type, id])).rows;
      } catch (e) {
        if (!/document_versions/.test(e.message)) throw e;
      }
      res.json({
        versions: rows.map(r => ({
          id: Number(r.id), action: r.action, at: r.created_at, by: r.changed_by_name || null,
          changes: changes(r.before, r.after), before: r.before, after: r.after,
        })),
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  };
}

module.exports = { track, trackMw, historyRoute, snapshot, changes, DOCS };
