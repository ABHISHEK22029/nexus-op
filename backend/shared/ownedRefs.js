/* ══════════════════════════════════════════════════════════
   ownedRefs — the ids a request CARRIES must be yours too.

   ownerScope guards the record a route is about: the invoice in
   /sales-invoices/:id, the order being deleted. It says nothing about the
   other ids that ride along in the body. Those were simply trusted, and
   ids are small integers, so a second company could raise an invoice
   against another's customerId and read that customer's name, GSTIN and
   address back off its own invoice; or send a challan against another's
   order and mark that order Delivered.

   So every create or edit that stores a reference checks it here first:

       if (!await assertRefs(db, req, res, {
         customers: [customerId], customer_orders: [customerOrderId],
       })) return;

   Empty values (null, '', 0) are skipped — "no customer order" is a normal
   answer. Anything else must be a row this organisation owns, or the
   request is refused with 400 and the kind of record that was not found.
   Not 404: the document being created does exist (or is about to); it is
   the thing it points at that is wrong, and saying "Customer not found"
   reads the same whether the id is another company's or nobody's.

   A cross-tenant Administrator is exempt, as everywhere else.
   ══════════════════════════════════════════════════════════ */
const { isCrossTenant } = require('./roles');

/* What each kind of reference is checked against, and what to say. Lines
   that hang off a parent have no owner of their own, so they are checked
   through it. */
const KINDS = {
  customers:            { table: 'customers',       error: 'Customer not found' },
  vendors:              { table: 'vendors',         error: 'Vendor not found' },
  skus:                 { table: 'skus',            error: 'Product not found' },
  customer_orders:      { table: 'customer_orders', error: 'Customer order not found' },
  raw_materials:        { table: 'raw_materials',   error: 'Raw material not found' },
  projects:             { table: 'projects',        error: 'Project not found' },
  purchase_orders:      { table: 'purchase_orders', error: 'Purchase order not found' },
  grn:                  { table: 'grn',             error: 'Goods receipt not found' },
  work_orders:          { table: 'work_orders',     error: 'Work order not found' },
  boq_items:            { table: 'boq_items',       error: 'BOQ item not found' },
  customer_order_items: {
    sql: `SELECT coi.id FROM customer_order_items coi
            JOIN customer_orders co ON co.id = coi.customer_order_id
           WHERE coi.id = ANY($1::bigint[]) AND co.owner_id = $2`,
    error: 'Customer order line not found',
  },
};

const isEmpty = (v) => v === undefined || v === null || v === '' || v === false || Number(v) === 0;

/**
 * The first reference that is not this organisation's, as an error
 * message — or null when every one checks out.
 */
async function refsProblem(db, req, refs = {}) {
  if (isCrossTenant(req.user?.role)) return null;
  const org = req.user?.orgId ?? req.user?.id ?? -1;
  for (const [kind, values] of Object.entries(refs)) {
    const k = KINDS[kind];
    if (!k) throw new Error(`ownedRefs: unknown kind "${kind}"`);
    const ids = [...new Set((Array.isArray(values) ? values : [values]).filter(v => !isEmpty(v)).map(String))];
    if (!ids.length) continue;
    /* A value that is not a whole number cannot be anyone's row. Refused
       here rather than handed to Postgres, which would answer with a 500. */
    if (!ids.every(v => /^\d{1,15}$/.test(v))) return k.error;
    const sql = k.sql || `SELECT id FROM ${k.table} WHERE id = ANY($1::bigint[]) AND owner_id = $2`;
    const { rows } = await db.query(sql, [ids, org]);
    if (rows.length !== ids.length) return k.error;
  }
  return null;
}

/** Check the references, or send 400 and return false. */
async function assertRefs(db, req, res, refs) {
  const problem = await refsProblem(db, req, refs);
  if (!problem) return true;
  res.status(400).json({ error: problem });
  return false;
}

/** Product ids on a list of lines, whichever spelling the caller used. */
const skuIdsOf = (items) => (Array.isArray(items) ? items : []).map(l => l?.skuId ?? l?.sku_id);

module.exports = { assertRefs, refsProblem, skuIdsOf };
