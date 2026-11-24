/* ══════════════════════════════════════════════════════════
   SearchController — one search for everything.

   Finding INV-0007, Apollo's order or a PO number meant knowing which
   screen it lived on, opening it, and searching there. This answers one
   query across every kind of record the person may read, a few of each,
   grouped by kind, each with where it opens.

   The same matching as the lists (shared/listQuery): the query is split
   into words and a row matches when every word appears somewhere in it,
   in any order, ignoring case — "apollo 0007" finds Apollo's INV-0007.

   Only this company's records, and only the kinds the person's role may
   read: a Sales user sees no purchase orders here either. The route is
   left out of the path-based guard (index.js UNGATED) because it spans
   resources; each kind is checked below instead.
   ══════════════════════════════════════════════════════════ */
const db = require('../db');
const { can } = require('../shared/roles');

const PER_KIND = 5;
const MAX_WORDS = 6;

/* Each kind: the permission that reads it, the rows, the text a match is
   looked for in, and how a row is shown. `t` is the row's own table alias. */
const KINDS = [
  { kind: 'customer_order', label: 'Orders', resource: 'customer-orders',
    from: `customer_orders t LEFT JOIN customers c ON c.id = t.customer_id`,
    text: `concat_ws(' ', t.order_number, t.customer_po_ref, c.name, t.status)`,
    select: `t.id, t.order_number AS title, c.name AS party, t.status, t.total AS amount, t.order_date AS on_date`,
    href: (r) => `/customer-orders?open=${r.id}` },
  { kind: 'sales_invoice', label: 'Invoices', resource: 'sales-invoices',
    from: `sales_invoices t LEFT JOIN customers c ON c.id = t.customer_id`,
    text: `concat_ws(' ', t.invoice_number, c.name, t.status)`,
    select: `t.id, t.invoice_number AS title, c.name AS party, t.status, t.net_amount AS amount, t.invoice_date AS on_date`,
    href: (r) => `/sales-invoices/${r.id}` },
  { kind: 'sales_quotation', label: 'Quotations', resource: 'sales-quotations',
    from: `sales_quotations t LEFT JOIN customers c ON c.id = t.customer_id`,
    text: `concat_ws(' ', t.quote_number, c.name, t.status)`,
    select: `t.id, t.quote_number AS title, c.name AS party, t.status, t.net_amount AS amount, t.quote_date AS on_date`,
    href: (r) => `/sales-quotations/${r.id}` },
  { kind: 'delivery_challan', label: 'Delivery challans', resource: 'delivery-challans',
    from: `delivery_challans t LEFT JOIN customers c ON c.id = t.customer_id`,
    text: `concat_ws(' ', t.challan_number, c.name, t.status, t.vehicle_no)`,
    select: `t.id, t.challan_number AS title, c.name AS party, t.status, t.total_value AS amount, t.challan_date AS on_date`,
    href: (r) => `/delivery-challans/${r.id}` },
  { kind: 'customer', label: 'Customers', resource: 'customers',
    from: `customers t`,
    text: `concat_ws(' ', t.name, t.gstin, t.phone, t.email, t.contact_name, t.state)`,
    select: `t.id, t.name AS title, t.state AS party, NULL::text AS status, NULL::numeric AS amount, NULL::date AS on_date`,
    href: (r) => `/customers/${r.id}` },
  { kind: 'purchase_order', label: 'Purchase orders', resource: 'po',
    from: `purchase_orders t LEFT JOIN vendors v ON v.id = t."vendorId"`,
    text: `concat_ws(' ', t."poNumber", v.name, t."itemName", t.status)`,
    select: `t.id, COALESCE(t."poNumber", 'PO #' || t.id) AS title, v.name AS party, t.status, NULL::numeric AS amount, t."createdAt"::date AS on_date`,
    href: (r) => `/po/${r.id}` },
  { kind: 'vendor_bill', label: 'Vendor bills', resource: 'grn-bills',
    from: `grn_bills t LEFT JOIN vendors v ON v.id = t.vendor_id`,
    text: `concat_ws(' ', t.bill_number, t.vendor_bill_ref, v.name, t.payment_status)`,
    select: `t.id, t.bill_number AS title, v.name AS party, t.payment_status AS status, t.net_amount AS amount, t.bill_date AS on_date`,
    href: (r) => `/grn-bills/${r.id}` },
  { kind: 'vendor', label: 'Vendors', resource: 'vendors',
    from: `vendors t`,
    text: `concat_ws(' ', t.name, t.gstin, t."contactPhone", t."contactEmail", t.city, t.state)`,
    select: `t.id, t.name AS title, COALESCE(t.city, t.state) AS party, t.status, NULL::numeric AS amount, NULL::date AS on_date`,
    href: (r) => `/vendors/${r.id}/edit` },
  { kind: 'production_order', label: 'Production', resource: 'production',
    from: `production_orders t`,
    text: `concat_ws(' ', t.prod_number, t.product_name, t.status)`,
    select: `t.id, t.prod_number AS title, t.product_name AS party, t.status, NULL::numeric AS amount, t.created_at::date AS on_date`,
    href: (r) => `/production/${r.id}` },
  { kind: 'product', label: 'Products', resource: 'skus',
    from: `skus t`,
    text: `concat_ws(' ', t.name, t.sku_code, t.hsn)`,
    select: `t.id, t.name AS title, t.sku_code AS party, NULL::text AS status, t.price AS amount, NULL::date AS on_date`,
    href: (r) => `/skus?q=${encodeURIComponent(r.title || '')}` },
  { kind: 'material', label: 'Raw materials', resource: 'raw-materials',
    from: `raw_materials t`,
    text: `concat_ws(' ', t.name, t.material_code, t.grade, t.hsn)`,
    select: `t.id, t.name AS title, t.material_code AS party, NULL::text AS status, t.standard_rate AS amount, NULL::date AS on_date`,
    href: (r) => `/raw-materials?q=${encodeURIComponent(r.title || '')}` },
  { kind: 'note', label: 'Credit & debit notes', resource: 'credit-debit-notes',
    from: `credit_debit_notes t LEFT JOIN customers c ON c.id = t.party_id AND t.party_type = 'customer'
                               LEFT JOIN vendors v ON v.id = t.party_id AND t.party_type = 'vendor'`,
    text: `concat_ws(' ', t.note_number, t.ref_number, c.name, v.name)`,
    select: `t.id, t.note_number AS title, COALESCE(c.name, v.name) AS party, t.note_type AS status, t.total AS amount, t.note_date AS on_date`,
    href: (r) => `/credit-debit-notes/${r.id}` },
  { kind: 'enquiry', label: 'Enquiries', resource: 'enquiries',
    from: `enquiries t`,
    text: `concat_ws(' ', t.ref, t.name, t.company, t.phone, t.email)`,
    select: `t.id, COALESCE(t.company, t.name) AS title, t.ref AS party, t.status, NULL::numeric AS amount, t.created_at::date AS on_date`,
    href: () => '/enquiries' },
];

/* A word as an ILIKE pattern, its own % and _ taken literally. */
const like = (w) => `%${w.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;

// GET /search?q=…&kinds=customer_order,sales_invoice
exports.search = async (req, res) => {
  const q = String(req.query.q || '').trim();
  const words = q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, MAX_WORDS);
  if (!words.length) return res.json({ q, groups: [], total: 0 });
  const orgId = req.user?.orgId ?? req.user?.id;
  const only = req.query.kinds ? new Set(String(req.query.kinds).split(',')) : null;
  const kinds = KINDS.filter(k => (!only || only.has(k.kind)) && can(req.user?.role, k.resource, 'read', req.user?.orgId));
  if (!kinds.length) return res.json({ q, groups: [], total: 0 });
  try {
    const patterns = words.map(like);
    /* Every kind in one statement: a search runs on every pause in typing,
       and thirteen queries at once would take every pooled connection and
       leave the rest of the app waiting behind it. Per kind, the count and
       the few newest that match; the outer casts make the branches line up. */
    const sql = kinds.map((k, i) => `
      SELECT ${i} AS k, s.id::bigint AS id, s.title::text AS title, s.party::text AS party, s.status::text AS status,
             s.amount::numeric AS amount, s.on_date::date AS on_date, s.n
        FROM (SELECT ${k.select}, COUNT(*) OVER()::int AS n
                FROM ${k.from}
               WHERE t.owner_id = $1 AND ${k.text} ILIKE ALL($2::text[])
               ORDER BY t.id DESC
               LIMIT ${PER_KIND}) s`).join('\n      UNION ALL');
    const { rows } = await db.query(sql, [orgId, patterns]);
    const groups = kinds.map((k, i) => {
      const mine = rows.filter(r => r.k === i).sort((a, b) => Number(b.id) - Number(a.id));
      if (!mine.length) return null;
      return {
        kind: k.kind, label: k.label, total: mine[0].n,
        items: mine.map(r => ({
          id: Number(r.id), title: r.title, party: r.party || null, status: r.status || null,
          amount: r.amount != null ? Number(r.amount) : null, date: r.on_date || null, href: k.href(r),
        })),
      };
    }).filter(Boolean);
    res.json({ q, groups, total: groups.reduce((s, g) => s + g.total, 0) });
  } catch (e) {
    console.error('search failed:', e.message);
    res.status(500).json({ error: "Search didn't work just now. Try again in a moment." });
  }
};

exports.KINDS = KINDS.map(k => k.kind);
