/* ══════════════════════════════════════════════════════════════════════
   docSeries — how a business numbers its documents, and the next number.

   Every sales document used to be numbered from a literal (`INV-${seq}`),
   so a business already on invoice 147 in Tally could not carry on from
   148, and renaming one invoice by hand left the counter behind — the next
   one still came out as INV-0002. That is the complaint this answers.

   A series is a PREFIX and a number of DIGITS, set per document type in
   Settings → Document numbering. The prefix may contain {FY}, written as
   the financial year (2026-27); a series that carries the year restarts at
   1 each year, one that does not runs on for ever. The counter is still
   document_sequences, row-locked, so two people creating at once queue
   rather than collide.

   Three promises:
     · a number is never issued twice — allocation skips any number already
       on a document (typed by hand, imported), and the database has a
       unique index behind it
     · a number typed by hand that fits the series moves the counter on,
       so the next document follows it instead of reusing it
     · nothing here changes a number already issued
   ══════════════════════════════════════════════════════════════════════ */
const { financialYear } = require('./docNumber');

const SERIES = {
  sales_invoice:    { label: 'Tax invoice',      prefix: 'INV-', pad: 4, table: 'sales_invoices',     column: 'invoice_number' },
  quotation:        { label: 'Quotation',        prefix: 'QT-',  pad: 4, table: 'sales_quotations',   column: 'quote_number' },
  customer_order:   { label: 'Customer order',   prefix: 'CO-',  pad: 4, table: 'customer_orders',    column: 'order_number' },
  delivery_challan: { label: 'Delivery challan', prefix: 'DC-',  pad: 4, table: 'delivery_challans',  column: 'challan_number' },
  note_credit:      { label: 'Credit note',      prefix: 'CN-',  pad: 4, table: 'credit_debit_notes', column: 'note_number' },
  note_debit:       { label: 'Debit note',       prefix: 'DN-',  pad: 4, table: 'credit_debit_notes', column: 'note_number' },
};

const HAS_FY = /\{FY\}/i;
const ALL_FY = /\{FY\}/gi;
const MAX_SKIP = 200;

/* "FY2026-27" → "2026-27": the prefix already says what it is. */
const fyLabel = (date, fyStart) => financialYear(date, fyStart).replace(/^FY/, '');

function render(prefix, seq, pad, date = new Date(), fyStart = 'April') {
  return String(prefix || '').replace(ALL_FY, fyLabel(date, fyStart)) + String(seq).padStart(pad, '0');
}

/* Which counter a number comes from: one per financial year when the year
   is part of the number, otherwise one for ever. */
const counterKey = (prefix, date, fyStart) => (HAS_FY.test(prefix || '') ? financialYear(date, fyStart) : 'ALL');

function spec(docType) {
  const s = SERIES[docType];
  if (!s) throw new Error(`Unknown document series: ${docType}`);
  return s;
}

async function fyStartOf(exec, ownerId) {
  try {
    const { rows } = await exec.query('SELECT "fyStart" FROM company_profile WHERE owner_id = $1 LIMIT 1', [ownerId]);
    return rows[0]?.fyStart || 'April';
  } catch { return 'April'; }
}

/** The way this business writes this series — its own, or the default. */
async function getSeries(exec, ownerId, docType) {
  const d = spec(docType);
  try {
    const { rows } = await exec.query(
      'SELECT prefix, pad FROM document_series WHERE owner_id = $1 AND doc_type = $2', [ownerId, docType]);
    if (rows[0]) return { prefix: rows[0].prefix, pad: Number(rows[0].pad) || d.pad };
  } catch { /* table not migrated yet: the defaults are the old behaviour */ }
  return { prefix: d.prefix, pad: d.pad };
}

async function taken(exec, ownerId, docType, number) {
  const { table, column } = spec(docType);
  const { rows } = await exec.query(
    `SELECT 1 FROM ${table} WHERE owner_id = $1 AND ${column} = $2 LIMIT 1`, [ownerId, number]);
  return rows.length > 0;
}

async function context(exec, ownerId, docType, date) {
  const s = await getSeries(exec, ownerId, docType);
  const fyStart = await fyStartOf(exec, ownerId);
  return { ...s, fyStart, key: counterKey(s.prefix, date, fyStart) };
}

/**
 * Take the next number. Must run inside the caller's transaction, so a
 * document that is rolled back does not use one up.
 */
async function allocate(client, { ownerId, docType, date = new Date() }) {
  const c = await context(client, ownerId, docType, date);
  for (let i = 0; i < MAX_SKIP; i++) {
    const { rows } = await client.query(
      `INSERT INTO document_sequences (owner_id, doc_type, fy, last_seq) VALUES ($1, $2, $3, 1)
       ON CONFLICT (owner_id, doc_type, fy) DO UPDATE SET last_seq = document_sequences.last_seq + 1
       RETURNING last_seq`,
      [ownerId ?? 0, docType, c.key]);
    const number = render(c.prefix, rows[0].last_seq, c.pad, date, c.fyStart);
    if (!(await taken(client, ownerId, docType, number))) return number;
  }
  throw new Error('Every number near the counter is already in use — set the next number in Settings → Document numbering.');
}

/** What the next document would be numbered, without taking it. */
async function peek(exec, { ownerId, docType, date = new Date() }) {
  const c = await context(exec, ownerId, docType, date);
  let last = 0;
  try {
    const { rows } = await exec.query(
      'SELECT last_seq FROM document_sequences WHERE owner_id = $1 AND doc_type = $2 AND fy = $3',
      [ownerId ?? 0, docType, c.key]);
    last = Number(rows[0]?.last_seq) || 0;
  } catch { /* nothing allocated yet */ }
  for (let n = last + 1, i = 0; i < MAX_SKIP; n++, i++) {
    const number = render(c.prefix, n, c.pad, date, c.fyStart);
    if (!(await taken(exec, ownerId, docType, number))) return { number, seq: n };
  }
  return { number: null, seq: null };
}

/**
 * A number typed by hand. If it reads as this series (same prefix, then
 * digits), the counter moves up to it, so the next document carries on
 * from here. A number in some other shape is left alone — it is the
 * business's to use, and guessing at it would be worse.
 */
async function noteUsed(client, { ownerId, docType, number, date = new Date() }) {
  const c = await context(client, ownerId, docType, date);
  const head = String(c.prefix || '').replace(ALL_FY, fyLabel(date, c.fyStart));
  const s = String(number || '');
  if (!s.startsWith(head)) return false;
  const tail = s.slice(head.length);
  if (!/^\d{1,9}$/.test(tail)) return false;
  await client.query(
    `INSERT INTO document_sequences (owner_id, doc_type, fy, last_seq) VALUES ($1, $2, $3, $4)
     ON CONFLICT (owner_id, doc_type, fy)
     DO UPDATE SET last_seq = GREATEST(document_sequences.last_seq, EXCLUDED.last_seq)`,
    [ownerId ?? 0, docType, c.key, Number(tail)]);
  return true;
}

/** Settings: the next document will be numbered `next`. */
async function setNext(client, { ownerId, docType, next, date = new Date() }) {
  const c = await context(client, ownerId, docType, date);
  await client.query(
    `INSERT INTO document_sequences (owner_id, doc_type, fy, last_seq) VALUES ($1, $2, $3, $4)
     ON CONFLICT (owner_id, doc_type, fy) DO UPDATE SET last_seq = EXCLUDED.last_seq`,
    [ownerId ?? 0, docType, c.key, Number(next) - 1]);
}

/* GST's rule for invoices (46(b)), delivery challans (55) and credit and
   debit notes (53) alike: a serial number of at most 16 characters, made of
   letters, digits, "-" and "/". Checked on the number as it will be
   written — with the year filled in and the digits counted — because a
   prefix that looks short can still produce a 17-character number. */
function validPrefix(p, pad = 4) {
  const s = String(p ?? '');
  if (/[{}]/.test(s.replace(ALL_FY, ''))) return 'The only placeholder is {FY}, for the financial year.';
  if (!/^[A-Za-z0-9/-]*$/.test(s.replace(ALL_FY, ''))) return 'GST allows only letters, digits, "-" and "/" in a document number.';
  const longest = render(s, '9'.repeat(Math.max(pad, 1)), pad, new Date(), 'April');
  if (longest.length > 16) return `That makes numbers like ${longest} — ${longest.length} characters. GST allows at most 16.`;
  return null;
}

module.exports = { SERIES, render, getSeries, allocate, peek, noteUsed, setNext, validPrefix, taken };
