/* ══════════════════════════════════════════════════════════
   stockSheet — read a stock sheet the way a person would.

   Nobody's stock sheet has our column names. It says "Particulars" or
   "Item Description", "Closing Qty" or "Stock", "Rate (₹)", and it often
   starts with a title, a company name and a date before the table. This
   finds the table, guesses which column is which from its label, and turns
   each row into an item — with the reason, in words, for any row it can't
   use. The guess is only a guess: the screen shows it and the person can
   change it before anything is saved.
   ══════════════════════════════════════════════════════════ */

const MAX_ROWS = 5000;

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/* What each field is usually called. Earlier in a list = a stronger match,
   so "Item name" beats "Description" when a sheet has both. */
const FIELDS = {
  itemName: {
    label: 'Item name', required: true,
    words: ['item name', 'name of item', 'item', 'name', 'particulars', 'item description', 'description', 'material name',
      'material', 'material description', 'product name', 'product', 'stock item', 'item details', 'article'],
  },
  code: {
    label: 'Item code',
    words: ['item code', 'code', 'sku', 'sku code', 'material code', 'product code', 'part no', 'part number', 'item no',
      'item id', 'article no', 'article code', 'stock code', 'catalogue no', 'cat no'],
  },
  quantity: {
    label: 'Quantity', required: true,
    words: ['quantity', 'qty', 'closing stock', 'closing qty', 'closing quantity', 'closing balance', 'stock', 'stock qty',
      'balance', 'balance qty', 'on hand', 'qty on hand', 'in stock', 'available', 'available qty', 'current stock',
      'physical stock', 'physical count', 'counted', 'count'],
  },
  uom: { label: 'Unit', words: ['unit', 'uom', 'units', 'unit of measure', 'unit of measurement', 'measure', 'per'] },
  unitCost: {
    label: 'Rate / unit cost',
    words: ['rate', 'unit cost', 'cost', 'unit price', 'price', 'purchase rate', 'purchase price', 'valuation rate',
      'avg cost', 'average cost', 'cost price', 'rate per unit', 'landed cost'],
  },
  value: { label: 'Stock value', words: ['value', 'stock value', 'closing value', 'total value', 'amount', 'total amount'] },
  minStockLevel: {
    label: 'Reorder level',
    words: ['reorder level', 're order level', 'reorder', 'min stock', 'minimum stock', 'min qty', 'minimum qty',
      'min level', 'safety stock', 'minimum'],
  },
  category: { label: 'Category', words: ['category', 'item group', 'stock group', 'group', 'item type', 'type', 'class', 'sub group'] },
  location: { label: 'Bin / location', words: ['location', 'bin', 'bin location', 'rack', 'shelf', 'store location', 'place'] },
  /* Read so that "HSN Code" is not taken for the item code; not stored. */
  hsn: { label: 'HSN', words: ['hsn', 'hsn code', 'hsn sac', 'hsn/sac', 'sac', 'hsn no'] },
};
const FIELD_KEYS = Object.keys(FIELDS);

/* "Rate (₹)", "Qty. (Nos)", "CLOSING  STOCK:" → "rate", "qty nos", "closing stock" */
const headerKey = (h) => norm(h).toLowerCase()
  .replace(/[₹]|\brs\.?|\binr\b|\bin rs\b/g, ' ')
  .replace(/[^a-z0-9/ ]+/g, ' ')
  .replace(/\s+/g, ' ').trim();

/* A unit written in a heading: "Qty (Nos)", "Weight in kg". */
const unitInHeader = (h) => {
  const m = String(h || '').match(/\(([^)]+)\)|\bin\s+([a-z.]+)\s*$/i);
  return m ? normUnit(m[1] || m[2]).code : null;
};

function scoreHeader(h, field) {
  const k = headerKey(h);
  if (!k) return 0;
  const words = FIELDS[field].words;
  let best = 0;
  words.forEach((w, i) => {
    if (k === w) best = Math.max(best, 200 - i);
    else if (new RegExp(`(^| )${w.replace(/[/]/g, '\\/')}( |$)`).test(k)) best = Math.max(best, 100 - i + w.length / 10);
  });
  return best;
}

/** Which column is which: { field: columnIndex } — each column used once,
 *  strongest matches first. */
function guessMapping(headers) {
  const pairs = [];
  headers.forEach((h, col) => FIELD_KEYS.forEach((f) => {
    const s = scoreHeader(h, f);
    if (s > 0) pairs.push({ f, col, s });
  }));
  pairs.sort((a, b) => b.s - a.s);
  const mapping = {};
  const used = new Set();
  for (const p of pairs) {
    if (mapping[p.f] != null || used.has(p.col)) continue;
    mapping[p.f] = p.col; used.add(p.col);
  }
  return mapping;
}

/* The heading row is the one, near the top, whose cells read most like
   headings. Title rows ("Stock Summary", "1-Apr-26 to 8-Oct-26") don't. */
function findHeaderRow(rows) {
  let best = { idx: -1, score: 0 };
  rows.slice(0, 20).forEach((r, idx) => {
    const m = guessMapping(r.cells);
    const hits = Object.keys(m).length;
    const score = hits + (m.itemName != null ? 1 : 0) + (m.quantity != null ? 1 : 0);
    if (hits >= 2 && score > best.score) best = { idx, score };
  });
  return best.idx;
}

/** The headings, and where the items start. A heading split over two rows —
 *  Tally's "Particulars | Closing Balance" above "Quantity | Rate | Value" —
 *  is read as one, the lower row's label winning where both have one. */
function locateHeader(rows) {
  const idx = findHeaderRow(rows);
  if (idx < 0) return null;
  const cur = rows[idx].cells;
  const next = rows[idx + 1]?.cells;
  if (next && Object.keys(guessMapping(next)).length >= 2) {
    const width = Math.max(cur.length, next.length);
    const headers = Array.from({ length: width }, (_, c) => norm(next[c]) || norm(cur[c]));
    return { headerRow: rows[idx].n, headers, bodyStart: idx + 2 };
  }
  return { headerRow: rows[idx].n, headers: cur.map(norm), bodyStart: idx + 1 };
}

/* ── units ──────────────────────────────────────────────── */
/* The standard codes are the database's `uom` table (migration 029), the
   same list the forms offer. A sheet's spelling of them varies a lot. */
const UNIT_ALIASES = {
  nos: ['nos', 'no', 'number', 'numbers', 'pcs', 'pc', 'piece', 'pieces', 'ea', 'each', 'unit', 'units'],
  set: ['set', 'sets'], pair: ['pair', 'pairs', 'pr'], dozen: ['dozen', 'doz', 'dz'],
  box: ['box', 'boxes', 'bx'], sheet: ['sheet', 'sheets', 'sht', 'shts'],
  kg: ['kg', 'kgs', 'kilogram', 'kilograms', 'kilo', 'kilos'], g: ['g', 'gm', 'gms', 'gram', 'grams', 'gr'],
  mt: ['mt', 'mts', 'tonne', 'tonnes', 'ton', 'tons', 'metric ton', 'metric tonne'], quintal: ['quintal', 'quintals', 'qtl'],
  m: ['m', 'mtr', 'mtrs', 'meter', 'meters', 'metre', 'metres', 'rmt', 'rm'], mm: ['mm'], cm: ['cm'],
  ft: ['ft', 'feet', 'foot', 'rft'], inch: ['inch', 'inches'],
  sqm: ['sqm', 'sq m', 'square metre', 'square meter', 'm2'], sqft: ['sqft', 'sq ft', 'sft', 'square feet', 'square foot'],
  m3: ['m3', 'cubic metre', 'cubic meter', 'cbm'], cum: ['cum'], ltr: ['ltr', 'ltrs', 'l', 'litre', 'litres', 'liter', 'liters', 'lit'],
};
const UNIT_LOOKUP = new Map();
Object.entries(UNIT_ALIASES).forEach(([code, list]) => list.forEach((a) => UNIT_LOOKUP.set(a, code)));

/** { code, known } — a recognised unit becomes its standard code; anything
 *  else is kept as written (lower case), and `known` says so. */
function normUnit(v) {
  const raw = norm(v).toLowerCase().replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
  if (!raw) return { code: null, known: false };
  const hit = UNIT_LOOKUP.get(raw) || UNIT_LOOKUP.get(raw.replace(/ /g, ''));
  return hit ? { code: hit, known: true } : { code: raw.slice(0, 15), known: false };
}

/* ── numbers ────────────────────────────────────────────── */
/** A quantity or an amount, as a sheet writes it: 1,20,000.50 · (45) · ₹ 380
 *  · "120 Nos". Returns { n, unit } or null when the cell is not a number. */
function readNumber(v, { decimalComma = false } = {}) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? { n: v, unit: null } : null;
  let s = norm(v).replace(/₹|\brs\.?|\binr\b/gi, '').trim();
  if (!s || s === '-' || s === '—') return null;
  let neg = false;
  const paren = s.match(/^\(([^)]*)\)\s*(.*)$/);           // (12) or (12) Nos
  if (paren) { neg = true; s = `${paren[1].trim()} ${paren[2]}`.trim(); }
  /* A semicolon-separated file comes from a comma-decimal locale: 12,5 is 12.5. */
  if (decimalComma && /^-?\d+,\d+(\s|$)/.test(s) && !s.includes('.')) s = s.replace(',', '.');
  const m = s.match(/^(-?[\d,]*\.?\d+)(-)?\s*([A-Za-z][A-Za-z.\s]{0,20})?$/i);
  if (!m) return null;
  let n = Number(m[1].replace(/,/g, ''));
  if (!Number.isFinite(n)) return null;
  if (neg || m[2] === '-') n = -Math.abs(n);
  return { n, unit: m[3] ? normUnit(m[3]).code : null };
}

/* Rows that summarise the table rather than belong to it. */
const TOTAL_ROW = /^(grand\s*)?(sub\s*-?\s*)?total\b|^closing balance$|^opening balance$|^total value$/i;

/** Name used to recognise the same item twice: case, spacing and the
 *  multiplication sign don't make it a different item. */
const nameKey = (s) => norm(s).toLowerCase().replace(/×/g, 'x').replace(/\s*([x*/-])\s*/g, '$1').replace(/[.,;:]+$/, '');
const codeKey = (s) => norm(s).toLowerCase().replace(/\s+/g, '');

/* ── reading the file ───────────────────────────────────── */
const cellText = (v) => {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if (v.result !== undefined) return cellText(v.result);
    if (v.richText) return v.richText.map((r) => r.text).join('');
    if (v.text !== undefined) return cellText(v.text);
    if (v.error) return '';
    return '';
  }
  return v;
};

function parseCsv(text) {
  const s = String(text).replace(/^﻿/, '');          // Excel's CSV starts with a BOM
  const first = s.split(/\r?\n/).find((l) => l.trim()) || '';
  const count = (ch) => first.split(ch).length - 1;
  const sep = [',', ';', '\t'].sort((a, b) => count(b) - count(a))[0];
  const rows = []; let row = [], cur = '', q = false;
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
  return {
    sep,
    rows: rows.map((cells, i) => ({ n: i + 1, cells })).filter((r) => r.cells.some((c) => norm(c))),
  };
}

class SheetError extends Error {
  constructor(message) { super(message); this.status = 400; }
}

/** Reads .xlsx or .csv into [{ n: sheet row number, cells: [...] }].
 *  With several worksheets, the one that looks most like a stock table. */
async function readSheet(buffer, filename = '') {
  const name = String(filename).toLowerCase();
  const isZip = buffer && buffer.length > 3 && buffer[0] === 0x50 && buffer[1] === 0x4b;
  if (/\.xls$/.test(name) && !isZip) {
    throw new SheetError('This is an old-style .xls file. Open it in Excel and use Save As → Excel Workbook (.xlsx), or CSV, then upload that.');
  }
  if (isZip || /\.xlsx$/.test(name)) {
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    try { await wb.xlsx.load(buffer); } catch {
      throw new SheetError('This file could not be opened as an Excel workbook. Save it again as .xlsx or CSV and upload that.');
    }
    let best = null;
    for (const ws of wb.worksheets) {
      const rows = [];
      ws.eachRow({ includeEmpty: false }, (row) => {
        const cells = [];
        row.eachCell({ includeEmpty: true }, (cell, col) => { cells[col - 1] = cellText(cell.value); });
        const filled = Array.from(cells, (v) => (v === undefined ? '' : v));
        if (filled.some((c) => norm(c))) rows.push({ n: row.number, cells: filled });
      });
      const h = findHeaderRow(rows);
      const score = h >= 0 ? rows.length + 1000 : rows.length;
      if (!best || score > best.score) best = { sheet: ws.name, rows, score };
    }
    if (!best || !best.rows.length) throw new SheetError('The workbook is empty.');
    return { sheet: best.sheet, rows: best.rows };
  }
  if (/\.(csv|txt|tsv)$/.test(name) || !name) {
    const { rows, sep } = parseCsv(buffer.toString('utf8'));
    if (!rows.length) throw new SheetError('The file is empty.');
    return { sheet: null, rows, decimalComma: sep === ';' };
  }
  throw new SheetError('Upload an Excel workbook (.xlsx) or a CSV file.');
}

/**
 * Turn the rows under the heading into items.
 * @returns {{ items, skipped, warnings }}
 *   items:   [{ row, itemName, code, quantity, uom, unitKnown, unitCost, minStockLevel, category, location, problems[], warnings[] }]
 *   skipped: [{ row, reason }] — blank rows and total rows, said so
 */
function buildItems(rows, bodyStart, mapping, headers, { decimalComma = false } = {}) {
  const at = (cells, f) => (mapping[f] == null || mapping[f] < 0 ? '' : cells[mapping[f]]);
  const headerUnit = mapping.quantity != null ? unitInHeader(headers[mapping.quantity]) : null;
  const items = [];
  const skipped = [];
  const warnings = [];
  const body = rows.slice(bodyStart);
  if (body.length > MAX_ROWS) throw new SheetError(`This sheet has ${body.length.toLocaleString('en-IN')} rows. Upload at most ${MAX_ROWS.toLocaleString('en-IN')} at a time — split the sheet into parts.`);

  for (const r of body) {
    const itemName = norm(at(r.cells, 'itemName'));
    const code = norm(at(r.cells, 'code'));
    const qtyCell = at(r.cells, 'quantity');
    const problems = [];
    const notes = [];

    if (!itemName && !code) {
      if (norm(qtyCell)) problems.push('No item name or code');
      else { skipped.push({ row: r.n, reason: 'Blank row' }); continue; }
    }
    if (TOTAL_ROW.test(itemName)) { skipped.push({ row: r.n, reason: `“${itemName}” is a total, not an item` }); continue; }

    const q = readNumber(qtyCell, { decimalComma });
    let quantity = null;
    if (!norm(qtyCell)) problems.push('No quantity');
    else if (!q) problems.push(`Quantity “${norm(qtyCell)}” is not a number`);
    else if (q.n < 0) problems.push(`Quantity is negative (${q.n}) — stock can't be below zero`);
    else quantity = Math.round(q.n * 10000) / 10000;

    let uom = null; let unitKnown = true;
    const unitCell = norm(at(r.cells, 'uom'));
    if (unitCell) { const u = normUnit(unitCell); uom = u.code; unitKnown = u.known; }
    else if (q?.unit) uom = q.unit;
    else if (headerUnit) uom = headerUnit;
    if (uom && !unitKnown) notes.push(`Unit “${unitCell}” isn't one of the standard units — kept as written`);

    const num = (f, label) => {
      const raw = at(r.cells, f);
      if (!norm(raw)) return null;
      const v = readNumber(raw, { decimalComma });
      if (!v) { notes.push(`${label} “${norm(raw)}” is not a number — left out`); return null; }
      if (v.n < 0) { notes.push(`${label} is negative — left out`); return null; }
      return v.n;
    };
    let unitCost = num('unitCost', 'Rate');
    const value = num('value', 'Value');
    /* Tally's stock summary gives quantity and value; the rate is theirs. */
    if (unitCost == null && value != null && quantity > 0) unitCost = Math.round((value / quantity) * 100) / 100;
    const minStockLevel = num('minStockLevel', 'Reorder level');

    items.push({
      row: r.n,
      itemName: itemName.slice(0, 200),
      code: code.slice(0, 60) || null,
      quantity, uom, unitKnown, unitCost, minStockLevel,
      category: norm(at(r.cells, 'category')).slice(0, 80) || null,
      location: norm(at(r.cells, 'location')).slice(0, 80) || null,
      problems, warnings: notes,
    });
  }

  /* The same item twice in one sheet — counted in two places, usually.
     Added together, and said so, rather than the second silently winning. */
  const seen = new Map();
  const kept = [];
  for (const it of items) {
    if (it.problems.length) { kept.push(it); continue; }
    const key = it.code ? `c:${codeKey(it.code)}` : `n:${nameKey(it.itemName)}`;
    const first = seen.get(key);
    if (!first) { seen.set(key, it); kept.push(it); continue; }
    if (first.uom && it.uom && first.uom !== it.uom) {
      it.problems.push(`Same item as row ${first.row}, but in ${it.uom} instead of ${first.uom}`);
      kept.push(it); continue;
    }
    first.quantity = Math.round((first.quantity + it.quantity) * 10000) / 10000;
    first.warnings.push(`Also on row ${it.row} — the two quantities were added together`);
    first.mergedRows = [...(first.mergedRows || []), it.row];
  }
  return { items: kept, skipped, warnings };
}

module.exports = {
  FIELDS, FIELD_KEYS, MAX_ROWS, SheetError,
  readSheet, findHeaderRow, locateHeader, guessMapping, buildItems,
  normUnit, readNumber, nameKey, codeKey, headerKey,
};
