/* ══════════════════════════════════════════════════════════
   CreditDebitNoteController — GST credit/debit notes (Wave 1D)
   Credit note → customer (returns / short-supply / rate correction).
   Debit note → vendor. GST + amount-in-words; optional link to the
   source invoice / bill. Documents (statements/exports net them).
   ══════════════════════════════════════════════════════════ */
const db = require('../db');
const { isInterstate } = require('../shared/gstStates');
const { profileFor } = require('../shared/companyProfile');
const { nextSeq } = require('../shared/docNumber');
const { isCrossTenant } = require('../shared/roles');
const { scopedById, assertOwned } = require('../shared/ownerScope');
const { runList } = require('../shared/listQuery');
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const isAdmin = (req) => isCrossTenant(req.user?.role);

function amountInWords(num) {
  num = Math.round(Number(num) || 0);
  if (num === 0) return 'Rupees Zero Only';
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = (n) => n < 20 ? a[n] : b[Math.floor(n / 10)] + (n % 10 ? ' ' + a[n % 10] : '');
  const three = (n) => (Math.floor(n / 100) ? a[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' : '') : '') + (n % 100 ? two(n % 100) : '');
  let out = '', crore = Math.floor(num / 10000000); num %= 10000000;
  let lakh = Math.floor(num / 100000); num %= 100000;
  let thousand = Math.floor(num / 1000); num %= 1000;
  if (crore) out += three(crore) + ' Crore ';
  if (lakh) out += two(lakh) + ' Lakh ';
  if (thousand) out += two(thousand) + ' Thousand ';
  if (num) out += three(num);
  return 'Rupees ' + out.trim().replace(/\s+/g, ' ') + ' Only';
}

/* Takes the executor — see the note on the same function in
   SalesQuotationController. Called from inside a transaction, reaching for
   the pool here means one request needs two clients at once, which
   deadlocks a pool of four under four concurrent callers. */
async function deriveInterstate(exec, partyType, partyId, ownerId = null) {
  let company = null, party = null;
  try { company = await profileFor(exec, ownerId, '*'); } catch { /* optional */ }
  if (partyId) {
    const tbl = partyType === 'vendor' ? 'vendors' : 'customers';
    party = (await exec.query(`SELECT * FROM ${tbl} WHERE id = $1`, [partyId])).rows[0];
  }
  /* Place of supply — see the note in SalesQuotationController.
   *
   * A credit note reverses a supply, so it must be taxed the same way that
   * supply was. Reading only the party's GSTIN meant a note against an
   * interstate sale could come out as CGST+SGST, which does not reverse
   * anything: the original IGST stays claimed and the return does not
   * balance.
   *
   * A vendor has no ship-to on this system, so for the debit-note side the
   * GSTIN is the whole answer and the fallbacks simply do not apply. */
  const supplier = company?.stateCode || company?.gstin || null;
  const placeOfSupply =
    party?.shipping_state || party?.state || party?.gstin || null;
  return isInterstate(supplier, placeOfSupply) === true;
}

// GET /credit-debit-notes
exports.list = async (req, res) => {
  try {
    const admin = isAdmin(req);
    const where = [], params = [];
    if (!admin) { params.push(req.user.orgId); where.push(`owner_id = $${params.length}`); }
    // Joined in a subquery so the customer/party name is searchable too —
    // people look for "Apollo", not for an invoice number they don't have.
    const result = await runList(db, {
      table: `(SELECT n.*, CASE WHEN n.party_type = 'vendor' THEN v.name ELSE c.name END AS party_name FROM credit_debit_notes n LEFT JOIN customers c ON c.id = n.party_id AND n.party_type = 'customer' LEFT JOIN vendors v ON v.id = n.party_id AND n.party_type = 'vendor') AS n`,
      query: req.query,
      searchColumns: ["note_number","party_name","reason","ref_number"],
      filterColumns: ["note_type","party_type","status"],
      allowedSort: ["id","note_number","note_date","net_amount"],
      defaultSort: 'id', defaultDir: 'DESC',
      where, params,
      /* Credit and debit are opposite signs and must never be summed
         together into one "total" — that figure would mean nothing.
         `unreferenced` counts notes missing the original invoice number or
         date, which Section 34 requires and which block GSTR-1 reporting. */
      summary: `COUNT(*)::int AS count,
                COALESCE(SUM(total) FILTER (WHERE note_type = 'credit'),0)::numeric AS credit_total,
                COALESCE(SUM(total) FILTER (WHERE note_type = 'debit'),0)::numeric AS debit_total,
                COUNT(*) FILTER (WHERE ref_number IS NULL OR ref_number = ''
                                    OR ref_date IS NULL)::int AS unreferenced`,
    });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// GET /credit-debit-notes/:id
exports.getById = async (req, res) => {
  try {
    const s = scopedById(req, req.params.id);
    const n = (await db.query(`SELECT * FROM credit_debit_notes WHERE ${s.where}`, s.params)).rows[0];
    if (!n) return res.status(404).json({ error: 'Note not found' });
    const items = (await db.query('SELECT * FROM credit_debit_note_items WHERE note_id = $1 ORDER BY sort_order', [req.params.id])).rows;
    let party = null;
    if (n.party_id) {
      const tbl = n.party_type === 'vendor' ? 'vendors' : 'customers';
      party = (await db.query(`SELECT * FROM ${tbl} WHERE id = $1`, [n.party_id])).rows[0];
    }
    let company = null;
    try { company = await profileFor(db, req.user?.orgId); } catch { /* optional */ }
    res.json({ ...n, items, party, company });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// POST /credit-debit-notes
exports.create = async (req, res) => {
  const { noteType, partyType, partyId, refType, refId, refNumber, noteDate, reason, gstRate, items, notes } = req.body;
  if (!['credit', 'debit'].includes(noteType)) return res.status(400).json({ error: 'noteType must be credit or debit' });
  if (!['customer', 'vendor'].includes(partyType)) return res.status(400).json({ error: 'partyType must be customer or vendor' });
  if (!partyId) return res.status(400).json({ error: `Pick a ${partyType}` });
  if (!items || !items.length) return res.status(400).json({ error: 'Add at least one line' });
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const interstate = await deriveInterstate(client, partyType, partyId, req.user?.orgId);
    const lines = items.map(it => ({ ...it, amount: r2((Number(it.quantity) || 0) * (Number(it.rate) || 0)) }));
    const subTotal = r2(lines.reduce((s, l) => s + l.amount, 0));
    const gstTotal = r2(subTotal * (Number(gstRate) || 0) / 100);
    const cgst = interstate ? 0 : r2(gstTotal / 2);
    const sgst = interstate ? 0 : r2(gstTotal - cgst);
    const igst = interstate ? gstTotal : 0;
    const total = r2(subTotal + gstTotal);
    const prefix = noteType === 'credit' ? 'CN' : 'DN';
    /* Credit and debit notes run separate series, so the document type
       carries the note type with it. */
    const num = `${prefix}-${String(await nextSeq(client, {
      ownerId: req.user?.orgId, docType: `note_${noteType}`,
    })).padStart(4, '0')}`;
    const { rows } = await client.query(
      `INSERT INTO credit_debit_notes (owner_id, note_type, party_type, party_id, ref_type, ref_id, ref_number, note_number, note_date, reason,
         sub_total, gst_rate, interstate, cgst, sgst, igst, gst_total, total, amount_in_words, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING id`,
      [req.user?.orgId || null, noteType, partyType, partyId, refType || null, refId || null, refNumber || null, num, noteDate || null, reason || null,
       subTotal, gstRate || 0, interstate, cgst, sgst, igst, gstTotal, total, amountInWords(total), notes || null]);
    const nid = rows[0].id;
    let so = 0;
    for (const l of lines) {
      await client.query(
        `INSERT INTO credit_debit_note_items (note_id, description, hsn, uom, quantity, rate, amount, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [nid, l.description, l.hsn || null, l.uom || 'nos', l.quantity || 0, l.rate || 0, l.amount || 0, so++]);
    }
    await client.query('COMMIT');
    res.json({ id: nid, noteNumber: num, total });
  } catch (e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); }
  finally { client.release(); }
};

// DELETE /credit-debit-notes/:id
exports.remove = async (req, res) => {
  try {
    if (!await assertOwned(db, req, res, 'credit_debit_notes', req.params.id, { columns: 'id' })) return;
    const r = await db.query('DELETE FROM credit_debit_notes WHERE id = $1', [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'not found' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
};
