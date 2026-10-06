/* ══════════════════════════════════════════════════════════════════════
   Vendor quotations that arrive as files.

   Three vendors quote the same enquiry. One sends a spreadsheet, one a PDF,
   one a Word document, and each lays the table out their own way. Comparing
   them meant opening all three and retyping the numbers — and the retyping
   is where the comparison actually went wrong.

   So: upload the file, read what can be read, and keep the original next to
   it. Every figure the comparison shows can be checked against the page it
   came from, which is the difference between a tool somebody trusts with a
   purchase decision and one they quietly stop using.

   Nothing here calls a model. See shared/quoteParser.js for why.
   ══════════════════════════════════════════════════════════════════════ */
const db = require('../db');
const { parseQuotation, matchKey, itemSignature, similarity } = require('../shared/quoteParser');
const { scopedById, assertOwned } = require('../shared/ownerScope');
const { isCrossTenant } = require('../shared/roles');
const { runList } = require('../shared/listQuery');

const ownerOf = (req) => req.user?.orgId ?? req.user?.id ?? null;
const isAdmin = (req) => isCrossTenant(req.user?.role);
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// POST /vendor-quotations   (multipart: file, + vendorId / vendorName / rfqRef)
exports.upload = async (req, res) => {
  const owner = ownerOf(req);
  if (owner == null) return res.status(401).json({ error: 'Not signed in' });
  if (!req.file) return res.status(400).json({ error: 'Attach the vendor’s quotation file.' });

  /* A vendor picked from the list must be one of this business's own. */
  let vendorId = null, vendorName = req.body.vendorName || null;
  if (req.body.vendorId) {
    const v = (await db.query('SELECT id, name, owner_id FROM vendors WHERE id = $1', [req.body.vendorId])).rows[0];
    if (!v || (!isAdmin(req) && String(v.owner_id) !== String(owner))) return res.status(400).json({ error: 'That vendor was not found.' });
    vendorId = v.id; vendorName = vendorName || v.name;
  }

  const parsed = await parseQuotation(req.file.buffer, req.file.mimetype, req.file.originalname);
  if (parsed.status === 'failed' && !parsed.lines.length && parsed.kind === null) {
    return res.status(400).json({ error: parsed.note });
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    /* The original always goes in, even when parsing failed — especially
       then, because somebody is about to key those lines in by hand and
       will want the file in front of them. */
    const { rows: [att] } = await client.query(
      `INSERT INTO attachments (owner_id, entity_type, entity_id, filename, mime, size_bytes, data)
       VALUES ($1,'vendor_quotation',0,$2,$3,$4,$5) RETURNING id`,
      [owner, req.file.originalname, req.file.mimetype, req.file.size, req.file.buffer]);

    const t = parsed.totals || {};
    const summed = r2(parsed.lines.reduce((s, l) => s + (Number(l.amount) || 0), 0));
    const { rows: [q] } = await client.query(
      `INSERT INTO vendor_quotations
         (owner_id, vendor_id, vendor_name, rfq_ref, attachment_id, filename, mime, source_kind,
          quote_ref, quote_date, subtotal, tax_total, grand_total, parse_status, parse_note, raw_text)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [owner, vendorId, vendorName, req.body.rfqRef || null,
       att.id, req.file.originalname, req.file.mimetype, parsed.kind,
       req.body.quoteRef || null, req.body.quoteDate || null,
       t.subtotal ?? summed ?? null, t.tax ?? null, t.grand ?? null,
       parsed.status, parsed.note, (parsed.text || '').slice(0, 200000)]);

    await client.query('UPDATE attachments SET entity_id = $1 WHERE id = $2', [q.id, att.id]);

    let n = 0;
    for (const l of parsed.lines) {
      await client.query(
        `INSERT INTO vendor_quotation_lines
           (vendor_quotation_id, owner_id, line_no, description, hsn, uom, quantity, rate, amount, match_key, confidence)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [q.id, owner, ++n, l.description, l.hsn, l.uom, l.quantity, l.rate, l.amount, l.match_key, l.confidence]);
    }
    await client.query('COMMIT');
    res.json({ ...q, lineCount: n });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
};

// GET /vendor-quotations
exports.list = async (req, res) => {
  try {
    const where = [], params = [];
    if (!isAdmin(req)) { params.push(ownerOf(req)); where.push(`owner_id = $${params.length}`); }
    const result = await runList(db, {
      table: `(SELECT vq.*, v.name AS vendor_record_name,
                      (SELECT COUNT(*)::int FROM vendor_quotation_lines l WHERE l.vendor_quotation_id = vq.id) AS line_count
                 FROM vendor_quotations vq
                 LEFT JOIN vendors v ON v.id = vq.vendor_id) AS vq`,
      query: req.query,
      searchColumns: ['vendor_name', 'vendor_record_name', 'filename', 'rfq_ref', 'quote_ref'],
      filterColumns: ['vendor_id', 'rfq_ref', 'parse_status'],
      allowedSort: ['id', 'created_at', 'grand_total', 'vendor_name'],
      defaultSort: 'id', defaultDir: 'DESC',
      where, params,
      summary: `COUNT(*)::int AS count,
                COUNT(*) FILTER (WHERE parse_status NOT IN ('parsed', 'reviewed'))::int AS needs_review,
                COALESCE(MIN(grand_total) FILTER (WHERE grand_total > 0),0)::numeric AS lowest`,
    });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// GET /vendor-quotations/:id
exports.getById = async (req, res) => {
  try {
    const s = scopedById(req, req.params.id);
    const q = (await db.query(`SELECT * FROM vendor_quotations WHERE ${s.where}`, s.params)).rows[0];
    if (!q) return res.status(404).json({ error: 'Not found' });
    const lines = (await db.query(
      'SELECT * FROM vendor_quotation_lines WHERE vendor_quotation_id = $1 ORDER BY line_no', [q.id])).rows;
    res.json({ ...q, lines });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

/* GET /vendor-quotations/:id/file — the eye icon.
   The vendor's own document, exactly as they sent it, so any parsed figure
   can be read back against its source. */
exports.file = async (req, res) => {
  try {
    const s = scopedById(req, req.params.id);
    const q = (await db.query(
      `SELECT attachment_id, filename FROM vendor_quotations WHERE ${s.where}`, s.params)).rows[0];
    if (!q || !q.attachment_id) return res.status(404).json({ error: 'Not found' });
    const owner = ownerOf(req);
    const { rows: [a] } = await db.query(
      isAdmin(req)
        ? 'SELECT mime, data, filename FROM attachments WHERE id = $1'
        : 'SELECT mime, data, filename FROM attachments WHERE id = $1 AND owner_id = $2',
      isAdmin(req) ? [q.attachment_id] : [q.attachment_id, owner]);
    if (!a) return res.status(404).json({ error: 'Not found' });
    res.setHeader('Content-Type', a.mime || 'application/octet-stream');
    /* inline: a PDF opens in the browser next to the parsed figures rather
       than landing in Downloads. A spreadsheet will still download, which
       is the browser's decision, not ours. */
    res.setHeader('Content-Disposition', `inline; filename="${(a.filename || 'quotation').replace(/"/g, '')}"`);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(a.data);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.remove = async (req, res) => {
  try {
    const q = await assertOwned(db, req, res, 'vendor_quotations', req.params.id, { columns: 'id, attachment_id' });
    if (!q) return;
    await db.query('DELETE FROM vendor_quotations WHERE id = $1', [q.id]);
    if (q.attachment_id) await db.query('DELETE FROM attachments WHERE id = $1', [q.attachment_id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

/* GET /vendor-quotations/compare?ids=1,2,3
 *
 * Lines up the same item across several quotations and says which vendor is
 * cheapest on each — and, as importantly, which vendor did not quote a line
 * at all. A total is only comparable when everyone quoted the same scope;
 * the cheapest bottom line is very often just the most incomplete one, and
 * that is exactly the mistake this screen exists to prevent.
 */
exports.compare = async (req, res) => {
  try {
    const ids = String(req.query.ids || '').split(',').map(n => parseInt(n, 10)).filter(Boolean);
    if (ids.length < 2) return res.status(400).json({ error: 'Pick at least two quotations to compare.' });
    if (ids.length > 6) return res.status(400).json({ error: 'Six quotations at a time is the limit.' });

    const params = [ids];
    let scope = '';
    if (!isAdmin(req)) { params.push(ownerOf(req)); scope = ` AND owner_id = $${params.length}`; }
    const quotes = (await db.query(
      `SELECT * FROM vendor_quotations WHERE id = ANY($1)${scope} ORDER BY id`, params)).rows;
    if (quotes.length !== ids.length) {
      return res.status(404).json({ error: 'One or more of those quotations could not be found.' });
    }
    const lines = (await db.query(
      `SELECT * FROM vendor_quotation_lines WHERE vendor_quotation_id = ANY($1) ORDER BY vendor_quotation_id, line_no`,
      [quotes.map(q => q.id)])).rows;

    /* "The same item" by meaning, not spelling. Three vendors write
       "SS304 Sheet 2mm 1250x2500", "Stainless Steel Sheet 304, 2 mm thk"
       and "SS 304 sheet - 2.0 mm (1250x2500)"; the exact key this used put
       them on three rows, each "quoted by 1 of 3", and the like-for-like
       total came to nothing. Now their words must overlap and their sizes
       must agree exactly — a 6 mm angle never matches a 5 mm one.

       Each line joins the closest group with nothing from its own
       quotation yet, if close enough; otherwise it starts a group. */
    const groups = [];
    for (const q of quotes) {
      for (const l of lines.filter(x => x.vendor_quotation_id === q.id)) {
        const sig = itemSignature(l.description);
        let best = null, bestScore = 0;
        for (const g of groups) {
          if (g.by[q.id]) continue;
          let sc = Math.max(...g.sigs.map(gs => similarity(gs, sig)));
          if (l.hsn && g.hsn && String(l.hsn).slice(0, 4) === String(g.hsn).slice(0, 4)) sc += 0.15;
          if (sc > bestScore) { bestScore = sc; best = g; }
        }
        let g = best && bestScore >= 0.5 ? best : null;
        if (!g) { g = { key: `g${groups.length + 1}`, description: l.description, hsn: l.hsn, uom: l.uom, sigs: [], by: {} }; groups.push(g); }
        g.sigs.push(sig);
        /* Keep the longest description seen: vendors abbreviate differently
           and the fuller wording is the more useful label. */
        if ((l.description || '').length > (g.description || '').length) g.description = l.description;
        g.hsn = g.hsn || l.hsn;
        g.uom = g.uom || l.uom;
        g.by[q.id] = {
          description: l.description,
          quantity: l.quantity == null ? null : Number(l.quantity),
          uom: l.uom,
          rate: l.rate == null ? null : Number(l.rate),
          amount: l.amount == null ? null : Number(l.amount),
          confidence: l.confidence,
        };
      }
    }

    const out = groups.map(({ sigs, ...row }) => {
      const cells = Object.entries(row.by);
      /* The quantity everybody is pricing: the one most of them quoted.
         Like for like is each vendor's RATE at that same quantity — a vendor
         who quoted 150 kg instead of 180 does not get to look cheaper. */
      const qtys = cells.map(([, v]) => v.quantity).filter(v => v != null);
      const counts = new Map();
      qtys.forEach(v => counts.set(v, (counts.get(v) || 0) + 1));
      const qty = qtys.length ? [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0] : null;
      const units = new Set(cells.map(([, v]) => unitOf(v.uom)).filter(Boolean));
      const unitsDiffer = units.size > 1;
      for (const [, v] of cells) v.comparable = v.rate != null && qty != null ? r2(v.rate * qty) : v.amount;
      const priced = cells
        .filter(([, v]) => v.rate != null || v.amount != null)
        .map(([qid, v]) => ({ qid: Number(qid), value: v.rate ?? v.amount }));
      /* Rates in different units are not comparable — per kg against per
         tonne would crown the wrong vendor a thousand times over — so such
         a row names no winner, and the caveat says why. */
      const best = !unitsDiffer && priced.length ? Math.min(...priced.map(p => p.value)) : null;
      return {
        ...row,
        quantity: qty,
        qtyDiffers: new Set(qtys).size > 1,
        unitsDiffer,
        quotedBy: priced.length,
        missingFrom: quotes.filter(q => !row.by[q.id]).map(q => q.id),
        bestValue: best,
        bestQuotationIds: best == null ? [] : priced.filter(p => p.value === best).map(p => p.qid),
        spreadPct: best && priced.length > 1
          ? r2((Math.max(...priced.map(p => p.value)) - best) / best * 100) : null,
      };
    }).sort((a, b) => (b.quotedBy - a.quotedBy) || String(a.description).localeCompare(String(b.description)));

    const everyoneQuoted = out.filter(r => r.quotedBy === quotes.length && !r.unitsDiffer);
    const totals = quotes.map(q => {
      const own = out.reduce((s, r) => s + (r.by[q.id]?.amount || 0), 0);
      /* Like for like: the same rows every vendor quoted, at the same
         quantity, so the totals are actually comparable. */
      const common = everyoneQuoted.reduce((s, r) => s + (r.by[q.id]?.comparable || 0), 0);
      return {
        id: q.id,
        vendor: q.vendor_name || `Quotation #${q.id}`,
        filename: q.filename,
        parseStatus: q.parse_status,
        parseNote: q.parse_note,
        statedTotal: q.grand_total == null ? null : Number(q.grand_total),
        linesTotal: r2(own),
        comparableTotal: r2(common),
        linesQuoted: out.filter(r => r.by[q.id]).length,
        linesMissing: out.length - out.filter(r => r.by[q.id]).length,
      };
    });

    const cheapest = totals.filter(t => t.comparableTotal > 0)
      .sort((a, b) => a.comparableTotal - b.comparableTotal)[0] || null;
    const highest = Math.max(0, ...totals.map(t => t.comparableTotal));

    /* Said plainly, because it is the trap: a smaller bottom line on a
       shorter scope is not a better price. */
    const caveats = [];
    if (everyoneQuoted.length < out.length) {
      caveats.push(`Only ${everyoneQuoted.length} of ${out.length} items were quoted by every vendor in the same unit. `
        + 'The like-for-like total covers those items only — the rest are priced by some vendors and not others.');
    }
    if (out.some(r => r.unitsDiffer)) caveats.push('Some items are quoted in different units (kg against MT, say) — compare those by hand.');
    if (out.some(r => r.qtyDiffers)) caveats.push('Vendors quoted different quantities on some items, so like for like prices them all at the same quantity.');

    res.json({
      quotations: totals,
      rows: out,
      comparableRowCount: everyoneQuoted.length,
      totalRowCount: out.length,
      cheapestOnLikeForLike: cheapest ? cheapest.id : null,
      savingsVsHighest: cheapest && totals.length > 1 ? r2(highest - cheapest.comparableTotal) : null,
      caveat: caveats.length ? caveats.join(' ') : null,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

const unitOf = (u) => String(u || '').toLowerCase().replace(/[.']/g, '').replace(/s$/, '').trim() || null;

/* PUT /vendor-quotations/:id — a person checks what was read.
 *
 * The parser never invents a number, so a partly-read file arrives with
 * gaps — and until now there was no way to fill them, name the vendor or
 * fix a misread rate. A quotation that came in wrong stayed wrong in every
 * comparison. Lines saved here are marked "checked": somebody has looked at
 * them against the original, and the comparison says so.
 */
exports.update = async (req, res) => {
  try {
    const q = await assertOwned(db, req, res, 'vendor_quotations', req.params.id, { columns: 'id, owner_id' });
    if (!q) return;
    const b = req.body || {};
    const set = {};
    const text = (v, n) => String(v ?? '').trim().slice(0, n) || null;
    if ('vendorName' in b) set.vendor_name = text(b.vendorName, 200);
    if ('rfqRef' in b) set.rfq_ref = text(b.rfqRef, 120);
    if ('quoteRef' in b) set.quote_ref = text(b.quoteRef, 120);
    if ('quoteDate' in b) set.quote_date = b.quoteDate || null;
    if ('vendorId' in b) {
      if (b.vendorId) {
        const v = (await db.query('SELECT id, name, owner_id FROM vendors WHERE id = $1', [b.vendorId])).rows[0];
        if (!v || (!isAdmin(req) && String(v.owner_id) !== String(q.owner_id))) {
          return res.status(400).json({ error: 'That vendor was not found.' });
        }
        set.vendor_id = v.id;
        if (!set.vendor_name) set.vendor_name = v.name;
      } else set.vendor_id = null;
    }
    for (const [k, col] of [['taxTotal', 'tax_total'], ['grandTotal', 'grand_total']]) {
      if (!(k in b)) continue;
      const n = b[k] === '' || b[k] == null ? null : Number(b[k]);
      if (n != null && !Number.isFinite(n)) return res.status(400).json({ error: `${k} must be a number` });
      set[col] = n;
    }

    let lines = null;
    if ('lines' in b) {
      if (!Array.isArray(b.lines) || b.lines.length > 500) return res.status(400).json({ error: 'lines must be a list of at most 500 items' });
      lines = [];
      for (const [i, l] of b.lines.entries()) {
        const description = String(l.description || '').trim();
        if (!description) continue;
        const n = (v) => (v === '' || v == null ? null : Number(v));
        const quantity = n(l.quantity), rate = n(l.rate);
        let amount = n(l.amount);
        if ([quantity, rate, amount].some(v => v != null && !Number.isFinite(v))) {
          return res.status(400).json({ error: `Line ${i + 1}: quantity, rate and amount must be numbers` });
        }
        if (amount == null && quantity != null && rate != null) amount = r2(quantity * rate);
        lines.push({ description: description.slice(0, 500), hsn: text(l.hsn, 12), uom: text(l.uom, 20), quantity, rate, amount });
      }
      set.subtotal = r2(lines.reduce((s, l) => s + (l.amount || 0), 0));
      set.parse_status = 'reviewed';
      set.parse_note = null;
    }

    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const cols = Object.keys(set);
      if (cols.length) {
        await client.query(
          `UPDATE vendor_quotations SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(', ')} WHERE id = $${cols.length + 1}`,
          [...cols.map(c => set[c]), q.id]);
      }
      if (lines) {
        await client.query('DELETE FROM vendor_quotation_lines WHERE vendor_quotation_id = $1', [q.id]);
        let n = 0;
        for (const l of lines) {
          await client.query(
            `INSERT INTO vendor_quotation_lines
               (vendor_quotation_id, owner_id, line_no, description, hsn, uom, quantity, rate, amount, match_key, confidence)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'checked')`,
            [q.id, q.owner_id, ++n, l.description, l.hsn, l.uom, l.quantity, l.rate, l.amount, matchKey(l.description, l.hsn)]);
        }
      }
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; }
    finally { client.release(); }

    const row = (await db.query('SELECT * FROM vendor_quotations WHERE id = $1', [q.id])).rows[0];
    const ls = (await db.query('SELECT * FROM vendor_quotation_lines WHERE vendor_quotation_id = $1 ORDER BY line_no', [q.id])).rows;
    res.json({ ...row, lines: ls });
  } catch (e) { res.status(500).json({ error: e.message }); }
};
