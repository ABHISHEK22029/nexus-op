/* ══════════════════════════════════════════════════════════════════════
   Reading a vendor's quotation out of the file they sent.

   No model is called here. A quotation is a table of items with quantities
   and rates, and in a spreadsheet that table is already structured data —
   handing it to a language model to "extract" would spend tokens to make a
   certain answer uncertain. PDFs and Word documents get the same treatment
   through their text and their tables.

   The design rule throughout: never invent a number. Where a value cannot
   be read, the field is left null and the row is marked for review, because
   a confident wrong rate is far worse than an obvious gap — it wins an
   order it should have lost.

   Every row carries a confidence:
     high    straight out of a table cell (spreadsheet, CSV, Word table)
     medium  a text line whose quantity × rate agrees with its amount
     low     a text line where something had to be guessed at
     checked a person has reviewed it (set by the review screen, not here)

   Tested against real-shaped files — letterhead rows above the table, an
   "Item Code" column before the description, "Unit Price" next to "Unit",
   "Add: GST @ 18%" rows under the items, a Word table, a PDF whose lines
   run "… 7219 180 kg 260.00 46,800.00" — because each of those broke the
   first version (see scripts/test-vendor-quotes.js).
   ══════════════════════════════════════════════════════════════════════ */

/* What a header cell can say, per column. Order inside a list does not
   matter; scoring (below) decides between columns. */
const HEADER_WORDS = {
  description: ['description', 'item description', 'description of goods', 'particulars', 'item', 'material', 'product', 'goods', 'scope', 'work', 'item name', 'name of item', 'specification'],
  hsn: ['hsn', 'sac', 'hsn code', 'hsn/sac', 'hsn sac', 'hsncode'],
  uom: ['uom', 'unit', 'units', 'u.o.m', 'uqc', 'unit of measure'],
  quantity: ['qty', 'quantity', 'qnty', 'nos', 'no. of units'],
  rate: ['rate', 'unit rate', 'price', 'unit price', 'rate/unit', 'basic rate', 'rate per unit', 'unit cost'],
  amount: ['amount', 'value', 'total', 'line total', 'taxable', 'taxable value', 'net amount', 'total amount'],
};

/* Words that disqualify a header cell from a field even though it starts
   with one of that field's words: "Item Code" is not the description,
   "Unit Price" is not the unit, "Total Qty" is not the amount. */
const NOT_FOR = {
  description: /\b(code|no\.?|number|#|sl|s\.no|sr)\b/,
  uom: /\b(price|rate|cost|value)\b/,
  amount: /\b(qty|quantity)\b/,
  quantity: /\b(price|rate|amount)\b/,
};

const UOM_WORDS = new Set(['nos', 'no', "no's", 'kg', 'kgs', 'kilo', 'mt', 'mts', 'ton', 'tons', 'tonne', 'tonnes',
  'set', 'sets', 'sqm', 'sq.m', 'sqft', 'sft', 'rmt', 'rm', 'mtr', 'mtrs', 'meter', 'metre', 'm', 'ltr', 'ltrs',
  'litre', 'pcs', 'pc', 'piece', 'pieces', 'each', 'ea', 'lot', 'pair', 'pairs', 'bag', 'bags', 'unit', 'units',
  'box', 'roll', 'rolls', 'sheet', 'sheets', 'length', 'lengths', 'job', 'ls', 'l.s']);

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const lower = (s) => norm(s).toLowerCase();

/** "1,23,456.78" / "₹ 1234" / "Rs. 1,234" / "(1234)" → number, or null when it is not one. */
function num(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).replace(/(rs\.?|inr|₹|\$)/gi, '').replace(/[,\s]/g, '').replace(/^\((.*)\)$/, '-$1');
  if (!s || !/^-?\d*\.?\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const r2 = (n) => Math.round(n * 100) / 100;
const close = (a, b, tol = 0.01) => a != null && b != null && Math.abs(a - b) <= Math.max(0.51, Math.abs(b) * tol);

/* ── the rows under a table that are not items ────────────────────────
   "Sub Total", "Add: GST @ 18%", "Less: Discount", "Grand Total" — said in
   a dozen ways. A bare "Total" is the pre-tax total until tax has been
   seen, and the grand total after. */
function summaryKind(text, taxSeen) {
  const t = lower(text).replace(/^(add|less)\s*[:\-]?\s*/, '');
  if (/^(grand\s*total|net\s*(amount|payable|total|value)|total\s*(amount\s*)?payable|amount\s*payable|invoice\s*(total|value)|total\s*(amount|value)\s*(incl|with|including)|total\s*incl)/.test(t)) return 'grand';
  if (/^(sub\s*-?\s*total|taxable\s*(value|amount)|total\s*(before|excl|excluding|without)\s*(tax|gst)|basic\s*(value|amount|total)|total\s*taxable)/.test(t)) return 'subtotal';
  if (/^(i|c|s|u)?gst\b|^tax\b|^vat\b|^gst\s*@|^(i|c|s)gst\s*@/.test(t)) return 'tax';
  if (/^discount\b|^disc\.?\b|^trade\s*discount/.test(t)) return 'discount';
  if (/^round(ing)?\s*-?\s*off\b|^round\s*off/.test(t)) return 'roundoff';
  if (/^total\b/.test(t)) return taxSeen ? 'grand' : 'total';
  if (/^(amount|rupees)\s+in\s+words|^in\s+words|^rupees\b/.test(t)) return 'words';
  return null;
}

function addSummary(totals, kind, value, state) {
  if (value == null) return;
  if (kind === 'tax') { totals.tax = r2((totals.tax || 0) + value); state.taxSeen = true; }
  else if (kind === 'subtotal') totals.subtotal = value;
  else if (kind === 'total') totals.subtotal = totals.subtotal ?? value;
  else if (kind === 'grand') totals.grand = value;
  else if (kind === 'discount') totals.discount = Math.abs(value);
  else if (kind === 'roundoff') totals.roundOff = value;
}

/** What the comparison keys on. Kept for the stored column; the
 *  comparison itself now matches more loosely (see itemSignature). */
function matchKey(description, hsn) {
  const sig = itemSignature(description);
  if (sig.words.length || sig.numbers.length) {
    return `d:${[...sig.words].sort().join('-')}|${[...sig.numbers].sort().join('-')}`.slice(0, 120);
  }
  const h = norm(hsn).replace(/\D/g, '');
  return h.length >= 4 ? `hsn:${h.slice(0, 8)}` : null;
}

/* ── what an item IS, independent of how a vendor wrote it ──────────────
   "SS304 Sheet 2mm 1250x2500", "Stainless Steel Sheet 304, 2 mm thk,
   1250 x 2500" and "SS 304 sheet - 2.0 mm (1250x2500)" are one item. Their
   words reduce to {ss, sheet} and their numbers to {304, 2, 1250, 2500}.
   Numbers must agree exactly — a 2 mm sheet is not a 3 mm sheet — while
   words only need to overlap enough. */
const SYNONYMS = [
  [/stainless\s*steel/g, 'ss'], [/mild\s*steel/g, 'ms'], [/\bm\.\s*s\.?/g, 'ms'], [/\bs\.\s*s\.?/g, 'ss'],
  [/galvani[sz]ed|galvanised|hot\s*dip(ped)?|hdg/g, 'gi'], [/\bg\.\s*i\.?/g, 'gi'],
  [/aluminium|aluminum/g, 'al'], [/hexagonal/g, 'hex'], [/\bpcs?\b|\bpieces?\b/g, ' '],
];
const SIG_FILLER = new Set(['the', 'and', 'for', 'with', 'per', 'supply', 'supplying', 'item', 'of', 'as', 'complete',
  'make', 'type', 'size', 'grade', 'thk', 'thick', 'thickness', 'mm', 'cm', 'mtr', 'kg', 'kgs', 'nos', 'no', 'dia',
  'length', 'long', 'x', 'finish', 'quality', 'std', 'standard', 'is', 'to', 'in']);

function itemSignature(description) {
  let s = lower(description);
  for (const [re, to] of SYNONYMS) s = s.replace(re, ` ${to} `);
  s = s.replace(/(\d)\s*[x×*]\s*(?=\d)/g, '$1 ')           // 1250x2500 → 1250 2500
    .replace(/([a-z])(?=\d)|(\d)(?=[a-z])/g, '$1$2 ')       // ss304 → ss 304, 2mm → 2 mm
    .replace(/[^a-z0-9. ]+/g, ' ');
  const words = [], numbers = [];
  for (const tok of s.split(/\s+/)) {
    if (!tok) continue;
    if (/^\d+(\.\d+)?$/.test(tok)) numbers.push(String(Number(tok)));
    else {
      const w = tok.replace(/\./g, '');
      if (w.length > 1 && !SIG_FILLER.has(w)) words.push(w);
    }
  }
  return { words: [...new Set(words)], numbers };
}

/** 0..1 — how surely two descriptions name the same item. */
function similarity(a, b) {
  const A = typeof a === 'string' ? itemSignature(a) : a;
  const B = typeof b === 'string' ? itemSignature(b) : b;
  if (A.numbers.length || B.numbers.length) {
    const na = [...A.numbers].sort().join(' '), nb = [...B.numbers].sort().join(' ');
    if (na !== nb) {
      /* One vendor gave the size and another did not: possible, but it is
         a weaker match than both agreeing. Different sizes: never. */
      const sa = new Set(A.numbers), sb = new Set(B.numbers);
      const sub = [...sa].every(x => sb.has(x)) || [...sb].every(x => sa.has(x));
      if (!sub || !A.numbers.length || !B.numbers.length) return 0;
      return jaccard(A.words, B.words) * 0.7;
    }
  }
  return jaccard(A.words, B.words);
}
function jaccard(a, b) {
  if (!a.length && !b.length) return 0;
  const sa = new Set(a), sb = new Set(b);
  const inter = [...sa].filter(x => sb.has(x)).length;
  return inter / new Set([...sa, ...sb]).size;
}

/* ── tables: spreadsheets, CSV, Word ─────────────────────────────────── */

/* Score each header cell against each field and assign the best pairs
   first. The first version took the first cell that started with a field
   word, so "Item Code" became the description and "Unit Price" the unit. */
function findHeader(rows) {
  let best = { score: 0, index: -1, map: {} };
  rows.slice(0, 40).forEach((cells, i) => {
    const cand = [];
    cells.forEach((c, ci) => {
      const t = lower(c).replace(/\(.*?\)/g, '').replace(/[:.]+$/, '').trim();
      if (!t || t.length > 40) return;
      for (const [field, words] of Object.entries(HEADER_WORDS)) {
        if (NOT_FOR[field] && NOT_FOR[field].test(t)) continue;
        let s = 0;
        for (const w of words) {
          if (t === w) s = Math.max(s, 3 + w.length / 100);
          else if (t.startsWith(w + ' ') || t.startsWith(w + '/') || t.startsWith(w)) s = Math.max(s, 2 + w.length / 100);
          else if (t.includes(w)) s = Math.max(s, 1);
        }
        if (s > 0) cand.push({ field, ci, s });
      }
    });
    cand.sort((a, b) => b.s - a.s);
    const map = {}, usedCells = new Set();
    for (const c of cand) {
      if (map[c.field] !== undefined || usedCells.has(c.ci)) continue;
      map[c.field] = c.ci; usedCells.add(c.ci);
    }
    const score = Object.keys(map).length;
    if (score > best.score) best = { score, index: i, map };
  });
  return best;
}

function parseGrid(rows) {
  const out = { lines: [], totals: {}, header: null };
  const h = findHeader(rows);
  /* Description plus one of rate/amount is the least that can be called a
     quotation table. Anything looser starts reading addresses as items. */
  if (h.score < 2 || h.map.description === undefined || (h.map.rate === undefined && h.map.amount === undefined)) return out;
  out.header = h;
  const state = { taxSeen: false };

  for (let i = h.index + 1; i < rows.length; i++) {
    const cells = rows[i] || [];
    const pick = (f) => (h.map[f] === undefined ? null : cells[h.map[f]]);
    const description = norm(pick('description'));
    let rate = num(pick('rate'));
    let amount = num(pick('amount'));
    let quantity = num(pick('quantity'));

    /* A summary row's label can sit in any column — often the description
       column, but "Grand Total" under the rate column is common too. */
    const labels = cells.map(norm).filter(v => v && num(v) == null);
    const kind = labels.map(l => summaryKind(l, state.taxSeen)).find(Boolean);
    if (kind) {
      const nums = cells.map(num).filter(v => v != null);
      addSummary(out.totals, kind, amount ?? nums[nums.length - 1] ?? null, state);
      continue;
    }
    if (!description) continue;
    if (rate == null && amount == null) continue;   // a note or a sub-heading, not a line

    let confidence = 'high';
    if (amount == null && quantity != null && rate != null) amount = r2(quantity * rate);
    if (rate == null && quantity && amount != null) { rate = r2(amount / quantity); confidence = 'medium'; }
    /* A row whose own arithmetic does not add up is read, but flagged. */
    if (quantity != null && rate != null && amount != null && !close(quantity * rate, amount, 0.02)) confidence = 'low';

    out.lines.push({
      description,
      hsn: norm(pick('hsn')).replace(/\.0+$/, '') || null,
      uom: norm(pick('uom')) || null,
      quantity, rate, amount, confidence,
    });
  }
  return out;
}

const cellValue = (v) => (v && typeof v === 'object'
  ? (v.result ?? v.text ?? v.richText?.map(r => r.text).join('') ?? (v instanceof Date ? v.toISOString().slice(0, 10) : ''))
  : v);

async function parseExcel(buffer) {
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const textRows = [];
  let best = { lines: [], totals: {} };
  for (const ws of wb.worksheets) {
    const rows = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const cells = [];
      row.eachCell({ includeEmpty: true }, (cell, col) => { cells[col - 1] = cellValue(cell.value); });
      rows.push(Array.from(cells, v => (v === undefined ? null : v)));
    });
    rows.forEach(r => textRows.push(r.map(norm).filter(Boolean).join(' | ')));
    const g = parseGrid(rows);
    if (g.lines.length > best.lines.length) best = g;
  }
  return { lines: best.lines, totals: best.totals, text: textRows.join('\n'),
    note: best.lines.length ? null : 'No item table was recognised in this spreadsheet.' };
}

/* CSV: quoted fields, commas inside quotes, "" for a quote. */
function parseCsvText(text) {
  const rows = []; let row = [], cur = '', q = false;
  const s = String(text).replace(/^﻿/, '');
  const sep = (s.split('\n')[0].match(/;/g) || []).length > (s.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"' && s[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(cur); rows.push(row); row = []; cur = '';
    } else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(c => norm(c)));
}

function parseCsv(buffer) {
  const text = buffer.toString('utf8');
  const g = parseGrid(parseCsvText(text));
  return { lines: g.lines, totals: g.totals, text, note: g.lines.length ? null : 'No item table was recognised in this file.' };
}

/* ── text: PDF, and Word paragraphs ──────────────────────────────────────
   A quotation line in running text ends with numbers — and, in real files,
   with a unit or a GST percentage among them: "… 7219 180 kg 260.00
   46,800.00". The first version needed three bare numbers at the very end,
   so the unit broke every line and the whole row became the description.

   Now the tail of the line is read token by token: numbers, units and
   percentages are collected until the first ordinary word. Amount is the
   last number, rate the one before, quantity the one before that — and the
   reading is kept only if quantity × rate comes to the amount. A 4–8 digit
   number just before the quantity is the HSN. */
const NUM_TOKEN = /^\(?-?[\d,]*\.?\d+\)?$/;
function readLine(row) {
  const toks = row.replace(/\t/g, ' ').split(/\s+/).filter(Boolean);
  if (toks.length < 2) return null;
  const tail = [];
  let i = toks.length - 1;
  for (; i >= 0; i--) {
    const t = toks[i];
    const lt = t.toLowerCase().replace(/[.,:]$/, '');
    if (NUM_TOKEN.test(t) && num(t) != null) tail.unshift({ k: 'n', v: num(t), raw: t });
    else if (/^\d+(\.\d+)?%$/.test(t)) tail.unshift({ k: 'pct', v: parseFloat(t) });
    else if (UOM_WORDS.has(lt)) tail.unshift({ k: 'uom', v: t });
    else if (/^(rs\.?|₹|inr)$/i.test(t)) continue;
    else break;
  }
  const nums = tail.filter(x => x.k === 'n');
  if (!nums.length) return null;
  const uom = tail.find(x => x.k === 'uom')?.v || null;
  const descToks = toks.slice(0, i + 1);
  /* Serial number in front: "1", "1.", "1)" */
  if (descToks.length > 1 && /^\d{1,3}[.)]?$/.test(descToks[0])) descToks.shift();

  if (nums.length >= 3) {
    const [q, r, a] = nums.slice(-3).map(x => x.v);
    const fits = close(q * r, a, 0.01);
    /* The amount sometimes already includes GST: still the same line. */
    const withTax = !fits && [5, 12, 18, 28].find(g => close(q * r * (1 + g / 100), a, 0.01));
    if (fits || withTax) {
      const before = nums.slice(0, -3);
      let hsn = null;
      const lastBefore = before[before.length - 1];
      if (lastBefore && /^\d{4}(\d{2}){0,2}$/.test(lastBefore.raw)) { hsn = lastBefore.raw; before.pop(); }
      /* Numbers before the quantity that are not the HSN belong to the
         description ("1250 x 2500"); put them back where they were. */
      const desc = norm([...descToks, ...before.map(x => x.raw)].join(' '));
      if (desc.length < 2) return null;
      return { description: desc, hsn, uom, quantity: q, rate: r, amount: withTax ? r2(q * r) : a, confidence: 'medium' };
    }
  }
  /* Description and one figure: usable, but somebody should look at it. */
  const amount = nums[nums.length - 1].v;
  const desc = norm(descToks.join(' '));
  if (desc.length > 3 && amount > 0 && !/^[\d.\s]+$/.test(desc)) {
    return { description: desc, hsn: null, uom, quantity: null, rate: null, amount, confidence: 'low' };
  }
  return null;
}

const HEADERISH = /^(s\.?\s*no|sl\.?\s*no|sr\.?\s*no|sl|#|no\.?)?\s*(description|particulars|item|material)\b.*\b(qty|quantity|rate|amount|price)\b/i;

function parseText(text) {
  const out = { lines: [], totals: {}, note: null, text };
  const rows = String(text || '').split(/\r?\n/).map(r => r.replace(/\t/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
  const state = { taxSeen: false };
  let pending = null;     // a text-only line that may be the start of the next item's description
  let last = null;        // the item just read, which a wrapped line may continue

  for (const row of rows) {
    if (HEADERISH.test(row)) { pending = null; last = null; continue; }
    const label = row.replace(/[\s:₹]*[\d,]+\.?\d*\s*$/, '');
    const kind = summaryKind(label, state.taxSeen);
    if (kind) {
      const m = row.match(/([\d,]+\.?\d{0,2})\s*$/);
      addSummary(out.totals, kind, m ? num(m[1]) : null, state);
      pending = null; last = null;
      continue;
    }
    const line = readLine(row);
    if (line) {
      if (pending && (line.description.length < 3 || /^\d+$/.test(line.description))) line.description = pending;
      out.lines.push(line);
      last = line; pending = null;
      continue;
    }
    /* No figures on this line. Either a wrapped continuation of the item
       above ("(1250 x 2500), mill finish") or the start of the next one. */
    if (last && /^[a-z(,&-]/.test(row) && row.length < 80) { last.description = norm(`${last.description} ${row}`); continue; }
    pending = row.length < 120 ? row : null;
    last = null;
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

/* Word: tables first — a Word quotation is nearly always a table, and its
   raw text puts every cell on a line of its own, which no line reader can
   put back together. The paragraphs around the table still carry the GST
   and grand total, so they are read as text for those. */
async function parseWord(buffer) {
  const mammoth = require('mammoth');
  const { value: html } = await mammoth.convertToHtml({ buffer });
  const decode = (s) => String(s).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  let best = { lines: [], totals: {} };
  for (const t of html.match(/<table[\s\S]*?<\/table>/g) || []) {
    const rows = (t.match(/<tr[\s\S]*?<\/tr>/g) || []).map(tr =>
      (tr.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/g) || []).map(td => norm(decode(td))));
    const g = parseGrid(rows);
    if (g.lines.length > best.lines.length) best = g;
  }
  const { value: raw } = await mammoth.extractRawText({ buffer });
  if (!best.lines.length) return parseText(raw || '');
  /* Paragraph ends become line ends BEFORE the tags are stripped, or the
     whole document reads as one line and "CGST 9%: …" is never seen. */
  const outside = parseText(decode(html.replace(/<table[\s\S]*?<\/table>/g, '\n').replace(/<\/(p|h\d|li)>/g, '\n')));
  return { lines: best.lines, totals: { ...outside.totals, ...best.totals, tax: best.totals.tax ?? outside.totals.tax, grand: best.totals.grand ?? outside.totals.grand }, text: raw, note: null };
}

/**
 * @returns {{kind, lines, totals, note, text, status}}
 */
async function parseQuotation(buffer, mime = '', filename = '') {
  const name = lower(filename);
  const m = lower(mime);
  if (/\.xls$/.test(name) || m === 'application/vnd.ms-excel' && !/\.xlsx$/.test(name) && !/\.csv$/.test(name)) {
    return { kind: null, lines: [], totals: {}, text: '', status: 'failed',
      note: 'This is the old Excel format (.xls). Open it in Excel and "Save As" .xlsx — or upload it as CSV or PDF.' };
  }
  if (/\.doc$/.test(name) || m === 'application/msword') {
    return { kind: null, lines: [], totals: {}, text: '', status: 'failed',
      note: 'This is the old Word format (.doc). Open it in Word and "Save As" .docx — or upload it as PDF.' };
  }
  const kind =
    /\.csv$/.test(name) || /text\/csv|comma-separated/.test(m) ? 'csv'
      : /sheet|excel|xlsx/.test(m) || /\.xlsx$/.test(name) ? 'excel'
        : /pdf/.test(m) || /\.pdf$/.test(name) ? 'pdf'
          : /word|document/.test(m) || /\.docx$/.test(name) ? 'word'
            : null;

  if (!kind) {
    return { kind: null, lines: [], totals: {}, text: '', status: 'failed',
      note: 'Only Excel (.xlsx), CSV, PDF and Word (.docx) files can be read.' };
  }

  let out;
  try {
    out = kind === 'excel' ? await parseExcel(buffer)
      : kind === 'csv' ? parseCsv(buffer)
        : kind === 'pdf' ? await parsePdf(buffer)
          : await parseWord(buffer);
  } catch (e) {
    return { kind, lines: [], totals: {}, text: '', status: 'failed',
      note: `The file could not be read (${e.message}).` };
  }

  for (const l of out.lines) l.match_key = matchKey(l.description, l.hsn);

  /* Check the lines against what the document says they come to. Compare
     like with like: the lines are before tax, so they are checked against
     the subtotal — or the grand total less the tax — and only against the
     grand total itself when the file states nothing else. Comparing a
     pre-tax sum with a GST-inclusive total told every vendor with a tax
     row that "rows were probably missed". */
  const summed = r2(out.lines.reduce((s, l) => s + (Number(l.amount) || 0), 0));
  const t = out.totals || {};
  const target = t.subtotal ?? (t.grand != null && t.tax != null ? r2(t.grand - t.tax - (t.roundOff || 0)) : null);
  let mismatch = false;
  if (summed && target != null) mismatch = !close(summed, target, 0.02) && !close(summed - (t.discount || 0), target, 0.02);
  else if (summed && t.grand != null) mismatch = ![0, 5, 12, 18, 28].some(g => close(summed * (1 + g / 100), t.grand, 0.02));
  if (mismatch) {
    out.note = (out.note ? out.note + ' ' : '')
      + `The lines read add up to ${summed.toFixed(2)}, but the document says ${Number(target ?? t.grand).toFixed(2)} — `
      + 'a row was probably missed. Check against the original.';
  }

  const status = !out.lines.length ? 'failed'
    : (mismatch || out.lines.some(l => l.confidence === 'low')) ? 'partial'
      : 'parsed';

  return { kind, lines: out.lines, totals: out.totals, text: out.text, note: out.note || null, status };
}

module.exports = { parseQuotation, matchKey, num, itemSignature, similarity, parseText, parseGrid };
