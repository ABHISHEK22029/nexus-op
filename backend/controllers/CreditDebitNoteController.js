/* ══════════════════════════════════════════════════════════
   CreditDebitNoteController — GST credit/debit notes (Wave 1D)
   Credit note → customer (returns / short-supply / rate correction).
   Debit note → vendor. GST + amount-in-words; optional link to the
   source invoice / bill. Documents (statements/exports net them).
   ══════════════════════════════════════════════════════════ */
const db = require('../db');
const { isInterstate } = require('../shared/gstStates');
const { profileFor } = require('../shared/companyProfile');
const { allocate } = require('../shared/docSeries');
const { isCrossTenant } = require('../shared/roles');
const { scopedById, assertOwned } = require('../shared/ownerScope');
const { runList } = require('../shared/listQuery');
const { assertRefs } = require('../shared/ownedRefs');
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const isAdmin = (req) => isCrossTenant(req.user?.role);

/* Words for amounts: one shared function (shared/amountInWords), which
   spells a crore count of any size. This file had its own copy, which
   printed "undefined Hundred … Crore" from 1,000 crore up. */
const { amountInWords } = require('../shared/amountInWords');

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
      party = (await db.query(`SELECT * FROM ${tbl} WHERE id = $1 AND (owner_id = $2 OR owner_id IS NULL)`, [n.party_id, n.owner_id])).rows[0];
    }
    let company = null;
    /* The document's own company — an Administrator viewing another
       company's document saw their own letterhead and bank on it. */
    try { company = await profileFor(db, n.owner_id ?? req.user?.orgId); } catch { /* optional */ }
    res.json({ ...n, items, party, company });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// POST /credit-debit-notes
exports.create = async (req, res) => {
  const { noteType, partyType, partyId, refType, refId, refNumber, refDate, noteDate, reason, gstRate, items, notes } = req.body;
  if (!['credit', 'debit'].includes(noteType)) return res.status(400).json({ error: 'noteType must be credit or debit' });
  if (!['customer', 'vendor'].includes(partyType)) return res.status(400).json({ error: 'partyType must be customer or vendor' });
  if (!partyId) return res.status(400).json({ error: `Pick a ${partyType}` });
  if (!items || !items.length) return res.status(400).json({ error: 'Add at least one line' });
  /* The party is this company's customer or vendor. Another company's id
     was read for the tax and shown on the note as the party. */
  if (!await assertRefs(db, req, res, { [partyType === 'vendor' ? 'vendors' : 'customers']: [partyId] })) return;
  /* Each line: what, how many (above zero), at what rate (0 or more). A
     line of −100 × ₹500 went in and turned a credit note into a debit. */
  for (const [n, it] of items.entries()) {
    if (!String(it?.description || '').trim()) return res.status(400).json({ error: `Line ${n + 1} needs a description.` });
    const q = Number(it.quantity), r = Number(it.rate);
    if (!Number.isFinite(q) || q <= 0) return res.status(400).json({ error: `Line ${n + 1}: the quantity must be more than zero.` });
    if (!Number.isFinite(r) || r < 0) return res.status(400).json({ error: `Line ${n + 1}: the rate must be a number, 0 or more.` });
  }
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    /* The original's number AND date (Section 34). There was nowhere to give
       the date, so every note counted as "missing invoice ref" for good.
       Now it is asked for; and when the number is one of this company's own
       invoices or vendor bills, its date and link are filled in from it.
       Found by its id as well as its number — a note raised from the
       invoice itself named it by id and still printed "not referenced" —
       and only when it is THIS party's: a note to one customer could name
       another customer's invoice. */
    let ref = { type: refType || null, id: refId || null, date: refDate || null };
    let refNo = String(refNumber || '').trim();
    let original = null;
    const own = req.user?.orgId ?? null;
    if (refNo || ref.id) {
      const byId = Number(ref.id) > 0 ? Number(ref.id) : null;
      original = partyType === 'customer'
        ? (await client.query(
            `SELECT id, invoice_number AS number, COALESCE(invoice_date, created_at::date) AS d, customer_id AS party_id,
                    net_amount, gst_rate, interstate, status
               FROM sales_invoices
              WHERE owner_id IS NOT DISTINCT FROM $1 AND ${byId ? 'id = $2' : 'LOWER(invoice_number) = LOWER($2)'}
              ORDER BY id DESC LIMIT 1`, [own, byId || refNo])).rows[0]
        : (await client.query(
            `SELECT id, bill_number AS number, vendor_bill_ref AS vref, bill_date AS d, vendor_id AS party_id, net_amount, gst_rate, interstate, NULL AS status
               FROM grn_bills
              WHERE owner_id IS NOT DISTINCT FROM $1 AND ${byId ? 'id = $2' : '(LOWER(bill_number) = LOWER($2) OR LOWER(vendor_bill_ref) = LOWER($2))'}
              ORDER BY id DESC LIMIT 1`, [own, byId || refNo])).rows[0];
      if (!original && byId) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `That ${partyType === 'customer' ? 'invoice' : 'bill'} is not one of yours.` });
      }
      if (original && Number(original.party_id) !== Number(partyId)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `${original.number} is for a different ${partyType}. A note adjusts the ${partyType === 'customer' ? 'invoice' : 'bill'} of the same ${partyType}.` });
      }
      if (original) {
        ref = { type: ref.type || (partyType === 'customer' ? 'sales_invoice' : 'grn_bill'), id: original.id, date: ref.date || original.d };
        /* A note to a vendor names THEIR invoice — the number their books and
           GSTR-1 know — not our internal bill number (GB-…). */
        refNo = (partyType !== 'customer' && original.vref) || original.number || refNo;
      }
    }
    /* Taxed the way the original was: a note reverses that supply, so its
       IGST or CGST + SGST and its rate are the original's, not whatever the
       customer's record says today. */
    const interstate = original && original.interstate != null
      ? !!original.interstate
      : await deriveInterstate(client, partyType, partyId, req.user?.orgId);
    const rate = original && original.gst_rate != null ? Number(original.gst_rate) || 0 : Number(gstRate) || 0;
    const lines = items.map(it => ({ ...it, amount: r2((Number(it.quantity) || 0) * (Number(it.rate) || 0)) }));
    const subTotal = r2(lines.reduce((s, l) => s + l.amount, 0));
    const gstTotal = r2(subTotal * rate / 100);
    /* A credit note can give back at most what the invoice charged, less
       notes already raised against it. A ₹59,000 note against a ₹2,360
       invoice went through. */
    if (original && noteType === (partyType === 'customer' ? 'credit' : 'debit')) {
      const before = Number((await client.query(
        `SELECT COALESCE(SUM(total), 0) AS t FROM credit_debit_notes
          WHERE owner_id IS NOT DISTINCT FROM $1 AND ref_id = $2 AND party_type = $3 AND note_type = $4`,
        [own, original.id, partyType, noteType])).rows[0].t) || 0;
      const room = r2((Number(original.net_amount) || 0) - before);
      if (r2(subTotal + gstTotal) > room + 0.5) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: `This note is ₹${r2(subTotal + gstTotal).toLocaleString('en-IN')}, more than is left on ${original.number}: `
            + `₹${(Number(original.net_amount) || 0).toLocaleString('en-IN')}${before ? `, less ₹${before.toLocaleString('en-IN')} already credited` : ''}, leaves ₹${Math.max(0, room).toLocaleString('en-IN')}.`,
        });
      }
    }
    const cgst = interstate ? 0 : r2(gstTotal / 2);
    const sgst = interstate ? 0 : r2(gstTotal - cgst);
    const igst = interstate ? gstTotal : 0;
    const total = r2(subTotal + gstTotal);
    /* Credit and debit notes run separate series (CN-, DN- unless the
       business set its own), so the document type carries the note type. */
    const num = await allocate(client, { ownerId: req.user?.orgId, docType: `note_${noteType}`, date: noteDate });
    const { rows } = await client.query(
      `INSERT INTO credit_debit_notes (owner_id, note_type, party_type, party_id, ref_type, ref_id, ref_number, note_number, note_date, reason,
         sub_total, gst_rate, interstate, cgst, sgst, igst, gst_total, total, amount_in_words, notes, ref_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9::date, CURRENT_DATE),$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21::date) RETURNING id`,
      [req.user?.orgId || null, noteType, partyType, partyId, ref.type, ref.id, refNo || null, num, noteDate || null, reason || null,
       subTotal, rate, interstate, cgst, sgst, igst, gstTotal, total, amountInWords(total), notes || null, ref.date || null]);
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
/* PATCH /credit-debit-notes/:id — change a note on its own page.
 *
 * A note is issued the moment it is made (Rule 53), so its lines, amounts
 * and tax stay as they are: a note in error is corrected with another
 * note, as an invoice is. What can still be put right is what explains it:
 * the reason, the notes, and the original document's date (the page flags
 * a missing one in red — without it the note cannot be reported against
 * the right period). The original's number too, when it was typed in by
 * hand rather than linked to a document here. */
const NOTE_FIELDS = ['reason', 'notes', 'ref_date', 'ref_number'];

exports.update = async (req, res) => {
  const b = req.body || {};
  try {
    const s = scopedById(req, req.params.id);
    const note = (await db.query(`SELECT * FROM credit_debit_notes WHERE ${s.where}`, s.params)).rows[0];
    if (!note) return res.status(404).json({ error: 'Note not found' });
    const refused = Object.keys(b).filter(k => !NOTE_FIELDS.includes(k) || (k === 'ref_number' && note.ref_id));
    if (refused.length) {
      return res.status(409).json({
        error: refused.includes('ref_number') && note.ref_id
          ? 'This note is linked to its original document, so that number comes from the document.'
          : `A note is issued when it is made, so ${refused.join(', ')} can't be changed. Raise another note to correct the amounts.`,
        editable: NOTE_FIELDS.filter(k => k !== 'ref_number' || !note.ref_id),
      });
    }
    const set = {};
    for (const k of NOTE_FIELDS) if (k in b) set[k] = k === 'ref_date' ? (b[k] || null) : (String(b[k] ?? '').trim().slice(0, k === 'notes' ? 2000 : 500) || null);
    if (set.ref_date && note.note_date && String(set.ref_date).slice(0, 10) > String(note.note_date instanceof Date ? note.note_date.toISOString() : note.note_date).slice(0, 10)) {
      return res.status(400).json({ error: 'The original document cannot be dated after this note.' });
    }
    const cols = Object.keys(set);
    if (!cols.length) return res.status(400).json({ error: 'Nothing to update' });
    const { rows } = await db.query(
      `UPDATE credit_debit_notes SET ${cols.map((c, i) => `"${c}" = $${i + 1}`).join(', ')} WHERE id = $${cols.length + 1} RETURNING *`,
      [...cols.map(c => set[c]), note.id]);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.remove = async (req, res) => {
  try {
    if (!await assertOwned(db, req, res, 'credit_debit_notes', req.params.id, { columns: 'id' })) return;
    const r = await db.query('DELETE FROM credit_debit_notes WHERE id = $1', [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'not found' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
};
