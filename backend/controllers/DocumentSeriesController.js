/* ══════════════════════════════════════════════════════════════════════
   Settings → Document numbering.

   One row per sales document type: how its numbers are written and what
   the next one will be. Changing either never touches a number already on
   a document — it only decides the next.
   ══════════════════════════════════════════════════════════════════════ */
const db = require('../db');
const { SERIES, getSeries, peek, setNext, validPrefix } = require('../shared/docSeries');

const ownerOf = (req) => req.user?.orgId ?? req.user?.id ?? null;

async function describe(exec, ownerId, docType) {
  const s = await getSeries(exec, ownerId, docType);
  const next = await peek(exec, { ownerId, docType });
  return {
    docType,
    label: SERIES[docType].label,
    prefix: s.prefix,
    pad: s.pad,
    perYear: /\{FY\}/i.test(s.prefix),
    nextNumber: next.number,
    nextSeq: next.seq,
  };
}

// GET /document-series
exports.list = async (req, res) => {
  const owner = ownerOf(req);
  if (owner == null) return res.status(401).json({ error: 'Not signed in' });
  try {
    const out = [];
    for (const t of Object.keys(SERIES)) out.push(await describe(db, owner, t));
    res.json(out);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// PUT /document-series/:docType   { prefix, pad, nextSeq }
exports.update = async (req, res) => {
  const owner = ownerOf(req);
  if (owner == null) return res.status(401).json({ error: 'Not signed in' });
  const docType = req.params.docType;
  if (!SERIES[docType]) return res.status(404).json({ error: 'No such document series' });

  const { prefix, pad, nextSeq } = req.body || {};
  const current = await getSeries(db, owner, docType);
  const p = prefix === undefined ? current.prefix : String(prefix);
  const bad = validPrefix(p, pad === undefined ? current.pad : parseInt(pad, 10) || 4);
  if (bad) return res.status(400).json({ error: bad });
  const d = pad === undefined ? current.pad : parseInt(pad, 10);
  if (!Number.isInteger(d) || d < 1 || d > 8) return res.status(400).json({ error: 'Digits must be between 1 and 8.' });
  let n = null;
  if (nextSeq !== undefined && nextSeq !== null && nextSeq !== '') {
    const raw = String(nextSeq).trim();
    n = /^\d{1,9}$/.test(raw) ? parseInt(raw, 10) : 0;
    if (n < 1) return res.status(400).json({ error: 'The next number must be a whole number, 1 or more.' });
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO document_series (owner_id, doc_type, prefix, pad, updated_at) VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (owner_id, doc_type) DO UPDATE SET prefix = EXCLUDED.prefix, pad = EXCLUDED.pad, updated_at = now()`,
      [owner, docType, p, d]);
    /* After the prefix: a prefix with {FY} counts per year, so the next
       number has to be set on the counter the new prefix will read. */
    if (n != null) await setNext(client, { ownerId: owner, docType, next: n });
    await client.query('COMMIT');
    const out = await describe(db, owner, docType);
    /* Said, not refused: allocation skips numbers already used, so this is
       safe — but somebody who asked for 148 and will get 151 should know. */
    if (n != null && out.nextSeq !== n) {
      out.warning = `Number ${n} is already used, so the next document will be ${out.nextNumber}.`;
    }
    res.json(out);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
};
