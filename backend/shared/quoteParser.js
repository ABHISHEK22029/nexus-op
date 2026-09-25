/* ══════════════════════════════════════════════════════════════════════
   Reading a vendor's quotation out of the file they sent.

   No model is called here. A quotation is a table of items with quantities
   and rates, and in a spreadsheet that table is already structured data —
   handing it to a language model to "extract" would spend tokens to make a
   certain answer uncertain. PDFs and Word documents get the same treatment
   through their text layer.

   The design rule throughout: never invent a number. Where a value cannot
   be read, the field is left null and the row is marked for review, because
   a confident wrong rate is far worse than an obvious gap — it wins an
   order it should have lost.

   Three confidences travel with every row:
     high    straight out of a spreadsheet cell
     medium  a text line that matched the full description/qty/rate shape
     low     a text line where something had to be guessed at

   The caller keeps the original file either way, so any figure can be
   checked against the page it came from.
   ══════════════════════════════════════════════════════════════════════ */

const HEADER_WORDS = {
  description: ['description', 'item', 'particulars', 'material', 'product', 'goods', 'scope', 'work'],
  hsn: ['hsn', 'sac', 'hsncode', 'hsn code', 'hsn/sac'],
  uom: ['uom', 'unit', 'units', 'u.o.m', 'uqc'],
  quantity: ['qty', 'quantity', 'nos', 'no.', 'qnty'],
  rate: ['rate', 'unit rate', 'price', 'unit price', 'rate/unit', 'basic rate'],
  amount: ['amount', 'value', 'total', 'line total', 'taxable', 'taxable value'],
};

const TOTAL_WORDS = ['grand total', 'total amount', 'net amount', 'net payable', 'total'];
const TAX_WORDS = ['gst', 'igst', 'cgst', 'sgst', 'tax'];
const SUBTOTAL_WORDS = ['sub total', 'subtotal', 'taxable value', 'total before tax', 'basic value'];

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const lower = (s) => norm(s).toLowerCase();

/** "1,23,456.78" / "₹ 1234" / "(1234)" → number, or null when it is not one. */
function num(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).replace(/[₹$,\s]/g, '').replace(/^\((.*)\)$/, '-$1');
  if (!s || !/^-?\d*\.?\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** What two vendors quoting the same thing have in common.
 *
 * Description first, HSN only as a fallback — and that order matters more
 * than it looks. Keying on HSN when present meant a spreadsheet (which has
 * an HSN column) and a PDF (which rarely does) produced different keys for
 * the same item, so the two vendors' rows never lined up and every row came
 * out "quoted by 1". The description is the one thing every quotation
 * carries, whatever the format.
 *
 * Reduced to the words that carry meaning and then sorted, so word order
 * and filler do not matter: sizes and materials survive, "supply of" and
 * "as per annexure" do not.
 */
const FILLER = ['the', 'and', 'for', 'with', 'per', 'supply', 'supplying', 'item',
  'nos', 'no', 'as', 'of', 'complete', 'set', 'make', 'type'];
function matchKey(description, hsn) {
  const words = lower(description)
    .replace(/[^a-z0-9. ]+/g, ' ')
    .split(' ')
    .filter(w => w && w.length > 2 && !FILLER.includes(w));
  if (words.length) return `d:${words.slice(0, 6).sort().join('-')}`;
  const h = norm(hsn).replace(/\D/g, '');
  return h.length >= 4 ? `hsn:${h.slice(0, 8)}` : null;
}

/* ── spreadsheets ─────────────────────────────────────────────────────── */
async function parseExcel(buffer) {
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const out = { lines: [], totals: {}, note: null, text: '' };
  const textRows = [];

  for (const ws of wb.worksheets) {
    const rows = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const cells = [];
      row.eachCell({ includeEmpty: true }, (cell) => {
        const v = cell.value;
        cells.push(v && typeof v === 'object'
          ? (v.result ?? v.text ?? v.richText?.map(r => r.text).join('') ?? '')
          : v);
      });
      rows.push(cells);
    });
    if (!rows.length) continue;
    rows.forEach(r => textRows.push(r.map(norm).filter(Boolean).join(' | ')));

    /* Find the header row: the one that names the most of our columns. */
    let best = { score: 0, index: -1, map: {} };
    rows.slice(0, 30).forEach((cells, i) => {
      const map = {};
      let score = 0;
      cells.forEach((c, ci) => {
        const t = lower(c);
        if (!t) return;
        for (const [field, words] of Object.entries(HEADER_WORDS)) {
          if (map[field] !== undefined) continue;
          if (words.some(w => t === w || t.startsWith(w) || t.replace(/[^a-z]/g, '') === w.replace(/[^a-z]/g, ''))) {
            map[field] = ci; score++; break;
          }
        }
      });
      if (score > best.score) best = { score, index: i, map };
    });

    /* Description plus one of rate/amount is the least that can be called a
       quotation table. Anything looser starts reading addresses as items. */
    if (best.score < 2 || best.map.description === undefined
        || (best.map.rate === undefined && best.map.amount === undefined)) continue;

    for (let i = best.index + 1; i < rows.length; i++) {
      const cells = rows[i];
      const pick = (f) => (best.map[f] === undefined ? null : cells[best.map[f]]);
      const description = norm(pick('description'));
      const rate = num(pick('rate'));
      const amount = num(pick('amount'));
      const quantity = num(pick('quantity'));

      if (!description) continue;
      const asTotal = lower(description);
      if (TOTAL_WORDS.some(w => asTotal.startsWith(w)) || SUBTOTAL_WORDS.some(w => asTotal.startsWith(w))
          || TAX_WORDS.some(w => asTotal.startsWith(w))) {
        const v = amount ?? rate ?? num(cells[cells.length - 1]);
        if (v != null) {
          if (SUBTOTAL_WORDS.some(w => asTotal.startsWith(w))) out.totals.subtotal = v;
          else if (TAX_WORDS.some(w => asTotal.startsWith(w))) out.totals.tax = (out.totals.tax || 0) + v;
          else out.totals.grand = v;
        }
        continue;
      }
      if (rate == null && amount == null) continue;   // a note, not a line

      out.lines.push({
        description,
        hsn: norm(pick('hsn')) || null,
        uom: norm(pick('uom')) || null,
        quantity, rate,
        amount: amount ?? (quantity != null && rate != null ? Math.round(quantity * rate * 100) / 100 : null),
        confidence: 'high',
      });
    }
    if (out.lines.length) break;   // first sheet that reads as a quotation wins
  }

  out.text = textRows.join('\n');
  if (!out.lines.length) out.note = 'No item table was recognised in this spreadsheet.';
  return out;
}

/* ── text (PDF and Word) ──────────────────────────────────────────────── */
/* A quotation line in running text nearly always ends with numbers: some
   description, then quantity, rate and amount. Anchor on that tail rather
   than trying to understand the layout. */
const TAIL = /^(.*?)\s+(\d[\d,]*\.?\d*)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s*$/;
const TAIL2 = /^(.*?)\s+([\d,]+\.?\d*)\s*$/;

function parseText(text) {
  const out = { lines: [], totals: {}, note: null, text };
  const rows = text.split(/\r?\n/).map(norm).filter(Boolean);

  for (const row of rows) {
    const low = lower(row);

    const totalHit = TOTAL_WORDS.find(w => low.startsWith(w) || low.includes(w + ' :') || low.includes(w + ':'));
    const subHit = SUBTOTAL_WORDS.find(w => low.startsWith(w));
    const taxHit = TAX_WORDS.find(w => low.startsWith(w) || new RegExp(`^add[: ]+${w}`).test(low));
    if (subHit || taxHit || totalHit) {
      const m = row.match(/([\d,]+\.?\d{0,2})\s*$/);
      const v = m ? num(m[1]) : null;
      if (v != null) {
        if (subHit) out.totals.subtotal = v;
        else if (taxHit) out.totals.tax = (out.totals.tax || 0) + v;
        else out.totals.grand = v;
      }
      continue;
    }

    let m = row.match(TAIL);
    if (m) {
      const [, desc, q, r, a] = m;
      const description = norm(desc).replace(/^\d+[.)]\s*/, '');
      if (description.length < 3) continue;
      out.lines.push({
        description,
        hsn: (description.match(/\b(\d{6,8})\b/) || [])[1] || null,
        uom: (description.match(/\b(nos|kg|kgs|mt|ton|tonne|set|sqm|rmt|ltr|pcs)\b/i) || [])[1] || null,
        quantity: num(q), rate: num(r), amount: num(a),
        confidence: 'medium',
      });
      continue;
    }

    /* Description + one number: usable, but somebody should look at it. */
    m = row.match(TAIL2);
    if (m && norm(m[1]).length > 8 && !/^[\d.\s]+$/.test(m[1])) {
      const amount = num(m[2]);
      if (amount != null && amount > 0) {
        out.lines.push({
          description: norm(m[1]).replace(/^\d+[.)]\s*/, ''),
          hsn: null, uom: null, quantity: null, rate: null, amount,
          confidence: 'low',
        });
      }
    }
  }

  if (!out.lines.length) out.note = 'No item lines could be read from this document.';
  return out;
}

async function parsePdf(buffer) {
  /* pdf-parse v2 exports a class, not the callable of v1. Calling it the
     old way throws, which the caller catches — so the failure looked like
     "this PDF cannot be read" for every PDF, including perfectly good ones. */
  const { PDFParse } = require('pdf-parse');
  const parser = new PDFParse({ data: buffer });
  let text = '';
  try {
    ({ text } = await parser.getText());
  } finally {
    await parser.destroy?.().catch?.(() => {});
  }
  /* Its page separators are not part of the quotation. */
  text = String(text || '').replace(/^\s*--\s*\d+\s+of\s+\d+\s*--\s*$/gm, '');

  const out = parseText(text);
  if (!out.lines.length && !norm(text)) {
    out.note = 'This PDF has no text layer — it is probably a scan. Ask the vendor for the original file, or enter the lines by hand.';
  }
  return out;
}

async function parseWord(buffer) {
  const mammoth = require('mammoth');
  const { value } = await mammoth.extractRawText({ buffer });
  return parseText(value || '');
}

/**
 * @returns {{kind, lines, totals, note, text, status}}
 */
async function parseQuotation(buffer, mime = '', filename = '') {
  const name = lower(filename);
  const kind =
    /sheet|excel|xlsx|xls/.test(lower(mime)) || /\.xlsx?$/.test(name) ? 'excel'
      : /pdf/.test(lower(mime)) || /\.pdf$/.test(name) ? 'pdf'
        : /word|document/.test(lower(mime)) || /\.docx?$/.test(name) ? 'word'
          : null;

  if (!kind) {
    return { kind: null, lines: [], totals: {}, text: '', status: 'failed',
      note: 'Only Excel, PDF and Word files can be read.' };
  }

  let out;
  try {
    out = kind === 'excel' ? await parseExcel(buffer)
      : kind === 'pdf' ? await parsePdf(buffer)
        : await parseWord(buffer);
  } catch (e) {
    return { kind, lines: [], totals: {}, text: '', status: 'failed',
      note: `The file could not be read (${e.message}).` };
  }

  for (const l of out.lines) l.match_key = matchKey(l.description, l.hsn);

  /* If the file states a grand total, check the lines add up to it. When
     they do not, say so — rather than letting a comparison be won by a
     quotation half of whose rows were missed. */
  const summed = out.lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  if (out.totals.grand && summed && Math.abs(summed - out.totals.grand) / out.totals.grand > 0.02) {
    out.note = (out.note ? out.note + ' ' : '')
      + `The lines read add up to ${summed.toFixed(2)}, but the document's total is `
      + `${Number(out.totals.grand).toFixed(2)} — some rows were probably missed. Check against the original.`;
  }

  const status = !out.lines.length ? 'failed'
    : (out.note || out.lines.some(l => l.confidence === 'low')) ? 'partial'
      : 'parsed';

  return { kind, lines: out.lines, totals: out.totals, text: out.text, note: out.note || null, status };
}

module.exports = { parseQuotation, matchKey, num };
