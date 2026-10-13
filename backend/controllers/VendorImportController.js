/* ══════════════════════════════════════════════════════════════════════
   Vendors from a spreadsheet.

   The Vendors page had an Import button that sent no file to a route that
   did not exist and then said "Import queued". Nothing was ever imported.

   This reads the sheet with the same reader as the stock upload (.xlsx or
   CSV, the heading row found wherever it is), recognises the usual column
   names, checks every row with the same rules as the vendor form, and adds
   the good rows in one go. A row is skipped, with its reason, when it has
   no name, fails a check, or is a vendor this company already has (same
   GSTIN, or same name when there is no GSTIN). Nothing is overwritten.
   ══════════════════════════════════════════════════════════════════════ */
const db = require('../db');
const sheet = require('../shared/stockSheet');
const { firstProblem, VENDOR_SPEC } = require('../shared/validators');

const orgOf = (req) => req.user?.orgId ?? req.user?.id;
const MAX_ROWS = 2000;

/* Column → the headings people actually use for it. Matched on the same
   normalised key as the stock upload ("GSTIN No.", "Mobile No" …). */
const COLUMNS = {
  name: ['vendor name', 'vendor', 'supplier name', 'supplier', 'name', 'company name', 'party name', 'party', 'firm name', 'ledger name'],
  type: ['vendor type', 'supplier type', 'type'],
  supplies: ['supplies', 'what they supply', 'items', 'material', 'materials', 'products', 'category', 'supply category'],
  gstin: ['gstin', 'gst no', 'gst number', 'gstin no', 'gst', 'gstin uin', 'gstin/uin'],
  pan: ['pan', 'pan no', 'pan number'],
  contactName: ['contact person', 'contact name', 'contact', 'person'],
  contactPhone: ['phone', 'mobile', 'mobile no', 'phone no', 'phone number', 'mobile number', 'contact no', 'contact number', 'whatsapp'],
  contactEmail: ['email', 'email id', 'e mail', 'mail', 'email address'],
  address: ['address', 'full address', 'billing address'],
  city: ['city', 'town'],
  state: ['state'],
  pincode: ['pincode', 'pin', 'pin code', 'postal code', 'zip'],
  payment_terms: ['payment terms', 'terms', 'credit terms'],
  lead_time_days: ['lead time', 'lead time days', 'lead days'],
  bank_name: ['bank', 'bank name'],
  account_number: ['account number', 'account no', 'a c no', 'ac no', 'bank account', 'bank account no'],
  ifsc_code: ['ifsc', 'ifsc code'],
  notes: ['notes', 'remarks', 'comments'],
};
const lookup = new Map();
for (const [col, words] of Object.entries(COLUMNS)) for (const w of words) lookup.set(w, col);

/* The best heading row in the first 20: the one naming the most columns,
   and it must name the vendor. */
function headerOf(rows) {
  let best = null;
  rows.slice(0, 20).forEach((r, idx) => {
    const map = {};
    r.cells.forEach((c, i) => {
      const col = lookup.get(sheet.headerKey(c));
      if (col && map[col] == null) map[col] = i;
    });
    const hits = Object.keys(map).length;
    if (map.name != null && hits >= 2 && (!best || hits > best.hits)) best = { idx, map, hits };
  });
  return best;
}

const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const key = (s) => clean(s).toLowerCase();

exports.importVendors = async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose an Excel (.xlsx) or CSV file to import' });
  let parsed;
  try { parsed = await sheet.readSheet(req.file.buffer, req.file.originalname); }
  catch (e) { return res.status(e instanceof sheet.SheetError ? 400 : 500).json({ error: e.message }); }

  const head = headerOf(parsed.rows || []);
  if (!head) {
    return res.status(400).json({ error: 'No heading row found. The sheet needs a "Vendor name" column and at least one more, such as GSTIN, Phone or Email.' });
  }
  const body = parsed.rows.slice(head.idx + 1);
  if (body.length > MAX_ROWS) return res.status(400).json({ error: `At most ${MAX_ROWS} vendors at a time; this sheet has ${body.length} rows` });

  const org = orgOf(req);
  const existing = (await db.query('SELECT name, gstin FROM vendors WHERE owner_id = $1', [org])).rows;
  const haveGstin = new Set(existing.map((v) => key(v.gstin)).filter(Boolean));
  const haveName = new Set(existing.map((v) => key(v.name)));

  const toAdd = [], skipped = [];
  for (const r of body) {
    const v = {};
    for (const [col, i] of Object.entries(head.map)) { const x = clean(r.cells[i]); if (x) v[col] = x; }
    if (!Object.keys(v).length) continue;
    if (!v.name) { skipped.push({ row: r.n, reason: 'No vendor name' }); continue; }
    if (v.gstin) v.gstin = v.gstin.toUpperCase();
    if (v.pan) v.pan = v.pan.toUpperCase();
    if (v.ifsc_code) v.ifsc_code = v.ifsc_code.toUpperCase();
    if (v.lead_time_days != null) {
      const n = Number(String(v.lead_time_days).replace(/[^0-9.]/g, ''));
      if (Number.isFinite(n) && n >= 0) v.lead_time_days = Math.round(n); else delete v.lead_time_days;
    }
    const problem = firstProblem(v, VENDOR_SPEC, { pair: ['gstin', 'pan'] });
    if (problem) { skipped.push({ row: r.n, name: v.name, reason: problem.error }); continue; }
    if (v.gstin && haveGstin.has(key(v.gstin))) { skipped.push({ row: r.n, name: v.name, reason: `Already a vendor with GSTIN ${v.gstin}` }); continue; }
    if (!v.gstin && haveName.has(key(v.name))) { skipped.push({ row: r.n, name: v.name, reason: 'Already a vendor by this name' }); continue; }
    if (v.gstin) haveGstin.add(key(v.gstin));
    haveName.add(key(v.name));
    v.type = v.type || 'Material Supplier';
    v.capability_tags = v.supplies || null;
    toAdd.push(v);
  }

  if (!toAdd.length) return res.json({ added: 0, skipped });

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    for (const v of toAdd) {
      const cols = Object.keys(v);
      await client.query(
        `INSERT INTO vendors (owner_id, ${cols.map((c) => `"${c}"`).join(', ')})
         VALUES ($1, ${cols.map((_, i) => `$${i + 2}`).join(', ')})`,
        [org, ...cols.map((c) => v[c])]);
    }
    await client.query('COMMIT');
    res.json({ added: toAdd.length, skipped });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ error: `Nothing was imported: ${e.message}` });
  } finally { client.release(); }
};
