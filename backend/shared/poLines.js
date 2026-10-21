/* A purchase order's lines, and the approval gate that depends on their
   value. Shared by every way a PO is raised — the PO screen, a vendor's
   quotation, the shortfall planner, the RFQ comparison — so they all write
   lines the same way and all hold a large PO for sign-off. */
const { notify } = require('../notify');

/* Written inside the caller's transaction. Replaces any lines already on
   the PO, then sets its approval status from the owner's threshold. */
async function writePoLines(client, poId, items, orgId) {
  await client.query('DELETE FROM po_line_items WHERE "poId" = $1', [poId]);
  /* Which material or product a line is (migration 075), when the caller
     knows: the PO screen's picker, the shortage planner. Kept only when it
     is this company's own — another company's id is dropped, not linked. */
  const idsOf = (a, b) => [...new Set(items.map(i => Number(i?.[a] ?? i?.[b])).filter(n => Number.isInteger(n) && n > 0))];
  const owned = async (table, ids) => (ids.length ? new Set((await client.query(
    `SELECT id FROM ${table} WHERE id = ANY($1::int[]) AND owner_id IS NOT DISTINCT FROM $2`, [ids, orgId ?? null])).rows.map(r => r.id)) : new Set());
  const mats = await owned('raw_materials', idsOf('rawMaterialId', 'raw_material_id'));
  const skus = await owned('skus', idsOf('skuId', 'sku_id'));
  let subtotal = 0;
  for (const item of items) {
    subtotal += (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
    const mat = Number(item.rawMaterialId ?? item.raw_material_id);
    const sku = Number(item.skuId ?? item.sku_id);
    await client.query(
      `INSERT INTO po_line_items ("poId", sno, description, uom, hsn, quantity, "unitPrice", raw_material_id, sku_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [poId, item.sno, item.description, item.uom || "No's", item.hsn || null, item.quantity, item.unitPrice,
       mats.has(mat) ? mat : null, mats.has(mat) ? null : (skus.has(sku) ? sku : null)]
    );
  }
  return gatePo(client, poId, subtotal, orgId);
}

/* Approval gate: if the PO value exceeds the owner's threshold, hold it for
   sign-off. Its own function for a PO raised without a line list, whose
   value is its quantity × unit price — that one was never gated at all, so
   its approval status stayed empty and it could be approved at any value. */
async function gatePo(client, poId, subtotal, orgId) {
  const thr = Number((await client.query('SELECT po_approval_threshold FROM automation_settings WHERE owner_id = $1', [orgId || 0])).rows[0]?.po_approval_threshold) || 0;
  const needsApproval = thr > 0 && subtotal > thr;
  await client.query(`UPDATE purchase_orders SET approval_status = $1 WHERE id = $2`, [needsApproval ? 'Pending Approval' : 'Not Required', poId]);
  return { needsApproval, subtotal, thr };
}

/* Said before the database is touched, so a bad line is a clear 400 and
   not a half-written PO or a raw SQL error. */
function poLinesProblem(items) {
  for (const [i, it] of (items || []).entries()) {
    if (!String(it?.description || '').trim()) return `Line ${i + 1} needs a description.`;
    const q = Number(it.quantity), p = Number(it.unitPrice);
    if (!Number.isFinite(q) || q <= 0) return `Line ${i + 1}: the quantity must be a number above 0.`;
    if (!Number.isFinite(p) || p < 0) return `Line ${i + 1}: the unit price must be a number, 0 or more.`;
  }
  return null;
}

/* Tells the people who may sign it off — in the PO's own organisation. */
function notifyApproval(poId, poNumber, gate, ownerId) {
  if (!gate || !gate.needsApproval) return;
  notify({ org: ownerId, can: ['po-approval'] }, { type: 'APPROVAL_NEEDED', title: `Approval needed · ${poNumber}`, message: `PO value ₹${gate.subtotal.toLocaleString('en-IN')} exceeds the ₹${Number(gate.thr).toLocaleString('en-IN')} limit`, entityType: 'po', entityId: Number(poId), link: `/po/${poId}` });
}

module.exports = { writePoLines, gatePo, poLinesProblem, notifyApproval };
