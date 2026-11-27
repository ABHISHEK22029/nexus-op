/* ══════════════════════════════════════════════════════════
   itemSheet — read a products, raw-materials or recipes sheet.

   The stock upload taught the shape of this: nobody's sheet has our column
   names, so each column is recognised from its heading ("Item Code",
   "Rate (₹)", "Qty / unit"), the guess is shown, and the person can change
   it before anything is saved. The file itself — .xlsx or CSV, a title
   above the table, Indian number formats, unit spellings — is read by
   shared/stockSheet, the same reader the stock upload uses.

   This file knows only what each kind of sheet holds. Matching rows to the
   products and materials already on file is the controller's job.
   ══════════════════════════════════════════════════════════ */
const base = require('./stockSheet');

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

const UNIT_WORDS = ['unit', 'uom', 'units', 'unit of measure', 'unit of measurement'];
const HSN_WORDS = ['hsn', 'hsn code', 'hsn/sac', 'hsn sac', 'sac', 'hsn no'];

/* What each column is usually called, strongest first. `needs` lists the
   groups of which at least one column must be present. */
const KINDS = {
  products: {
    noun: 'product', nouns: 'products', sheetName: 'Products',
    fields: {
      code: { label: 'Product code', words: ['product code', 'sku code', 'sku', 'item code', 'code', 'part no', 'part number', 'part code', 'item no', 'article code', 'article no', 'catalogue no', 'cat no'] },
      name: { label: 'Product name', words: ['product name', 'name', 'item name', 'sku name', 'product', 'item', 'particulars', 'name of item', 'item description', 'description of goods'] },
      description: { label: 'Description', words: ['description', 'specification', 'specifications', 'spec', 'details', 'remarks', 'notes'] },
      unit: { label: 'Unit', words: [...UNIT_WORDS, 'selling unit', 'sales unit'] },
      price: { label: 'Price', words: ['price', 'selling price', 'sale price', 'sales price', 'rate', 'unit price', 'price per unit', 'list price', 'mrp', 'selling rate'] },
      hsn: { label: 'HSN code', words: HSN_WORDS },
    },
    needs: [['name', 'code']],
  },
  materials: {
    noun: 'raw material', nouns: 'raw materials', sheetName: 'Raw materials',
    fields: {
      code: { label: 'Material code', words: ['material code', 'raw material code', 'rm code', 'item code', 'code', 'part no', 'part number', 'part code', 'item no', 'sku'] },
      name: { label: 'Material name', words: ['material name', 'raw material name', 'name', 'item name', 'material', 'raw material', 'item', 'particulars', 'material description', 'item description', 'description'] },
      grade: { label: 'Grade', words: ['grade', 'specification', 'spec', 'standard', 'quality'] },
      category: { label: 'Category', words: ['category', 'group', 'item group', 'material group', 'stock group', 'type', 'class'] },
      unit: { label: 'Unit', words: [...UNIT_WORDS, 'stock unit', 'base unit'] },
      rate: { label: 'Standard rate', words: ['standard rate', 'rate', 'price', 'unit price', 'purchase rate', 'purchase price', 'cost', 'unit cost', 'cost price', 'rate per unit'] },
      hsn: { label: 'HSN code', words: HSN_WORDS },
      moq: { label: 'Minimum order', words: ['moq', 'minimum order', 'minimum order quantity', 'min order qty', 'min order quantity', 'min order'] },
      leadTime: { label: 'Lead time (days)', words: ['lead time days', 'lead time', 'lead days', 'delivery days', 'lead time in days'] },
    },
    needs: [['name', 'code']],
  },
  recipes: {
    noun: 'recipe', nouns: 'recipes', sheetName: 'Recipes',
    fields: {
      productCode: { label: 'Product code', words: ['product code', 'sku code', 'sku', 'fg code', 'finished good code', 'product sku', 'parent code', 'item code'] },
      productName: { label: 'Product name', words: ['product name', 'product', 'finished good', 'finished goods', 'fg name', 'fg', 'sku name', 'parent', 'parent item', 'assembly', 'item name'] },
      materialCode: { label: 'Material code', words: ['material code', 'raw material code', 'rm code', 'component code', 'part code', 'child code', 'input code'] },
      materialName: { label: 'Material name', words: ['material name', 'raw material name', 'raw material', 'material', 'component name', 'component', 'rm name', 'rm', 'part name', 'child item', 'input'] },
      qty: { label: 'Quantity per unit', words: ['qty per unit', 'quantity per unit', 'qty/unit', 'qty / unit', 'qty per', 'per unit', 'consumption per unit', 'usage per unit', 'quantity', 'qty', 'consumption', 'usage', 'required qty', 'qty required', 'required quantity'] },
      unit: { label: 'Unit', words: UNIT_WORDS },
    },
    needs: [['productCode', 'productName'], ['materialCode', 'materialName'], ['qty']],
  },
};

function scoreHeader(h, words) {
  const k = base.headerKey(h);
  if (!k) return 0;
  let best = 0;
  words.forEach((w, i) => {
    if (k === w) best = Math.max(best, 200 - i);
    else if (new RegExp(`(^| )${w.replace(/[/]/g, '\\/')}( |$)`).test(k)) best = Math.max(best, 100 - i + w.length / 10);
  });
  return best;
}

/** { field: columnIndex } — each column used once, strongest matches first. */
function guessMapping(headers, kind) {
  const fields = KINDS[kind].fields;
  const pairs = [];
  headers.forEach((h, col) => Object.entries(fields).forEach(([f, def]) => {
    const s = scoreHeader(h, def.words);
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

/* A row of labels rather than data: text in at least `min` cells, none of
   them a number. */
const looksLikeHeadings = (cells, min) => {
  const filled = (cells || []).map(norm).filter(Boolean);
  return filled.length >= min && filled.every((c) => !base.readNumber(c));
};

/* The heading row: near the top, reading most like this kind's headings.
   Two recognised headings is a heading row; failing that, a row of labels
   with one recognised — a plain list of product names is a sheet too. */
const headerFinder = (kind) => (rows) => {
  let best = { idx: -1, score: 0 };
  let single = -1;
  rows.slice(0, 20).forEach((r, idx) => {
    const hits = Object.keys(guessMapping(r.cells, kind)).length;
    if (hits >= 2 && hits > best.score) best = { idx, score: hits };
    else if (hits === 1 && single < 0 && looksLikeHeadings(r.cells, 1)) single = idx;
  });
  return best.idx >= 0 ? best.idx : single;
};

/** Reads the upload; the first worksheet with headings is the one filled in. */
async function read(buffer, filename, kind) {
  const find = headerFinder(kind);
  const got = await base.readSheet(buffer, filename, { findHeader: find, firstMatch: true });
  let idx = find(got.rows);
  /* Headings none of which we recognise are still headings. Taking the first
     row as them lets the person choose each column by hand, instead of being
     told the sheet has none. */
  if (idx < 0 && looksLikeHeadings(got.rows[0]?.cells, 2)) idx = 0;
  if (idx < 0) return { ...got, located: null };
  return { ...got, located: { headerRow: got.rows[idx].n, headers: got.rows[idx].cells.map(norm), bodyStart: idx + 1 } };
}

/** A column choice sent back by the screen: { field: index }, unknown keys
 *  and out-of-range columns dropped. Null when nothing usable was sent. */
function readMapping(raw, headers, kind) {
  if (!raw) return null;
  let m = raw;
  if (typeof raw === 'string') { try { m = JSON.parse(raw); } catch { return null; } }
  if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
  const out = {};
  const used = new Set();
  for (const [k, v] of Object.entries(m)) {
    if (!KINDS[kind].fields[k]) continue;
    const col = Number(v);
    if (!Number.isInteger(col) || col < 0 || col >= headers.length || used.has(col)) continue;
    out[k] = col; used.add(col);
  }
  return out;
}

/** Which of the needed columns are not in the sheet — the first of each
 *  group that has none, so the screen can mark it. */
function missingFields(mapping, kind) {
  return KINDS[kind].needs.filter((g) => !g.some((f) => mapping[f] != null)).map((g) => g[0]);
}

/** The field list the screen shows, each marked required when the sheet
 *  has nothing else that can stand in for it. */
function fieldList(mapping, kind) {
  const { fields, needs } = KINDS[kind];
  return Object.entries(fields).map(([key, f]) => {
    const group = needs.find((g) => g.includes(key));
    const required = !!group && !group.some((o) => o !== key && mapping[o] != null);
    return { key, label: f.label, required };
  });
}

/* A template's example rows say EXAMPLE in their code. Left in the sheet,
   they are recognised and skipped rather than imported. */
const EXAMPLE = /^example\b/i;

/** The rows under the heading, as { row, cells: { field: text } }, with the
 *  blank and example rows set aside and said so. */
function rowsOf(read, mapping) {
  const { rows, located } = read;
  const body = rows.slice(located.bodyStart);
  if (body.length > base.MAX_ROWS) {
    throw new base.SheetError(`This sheet has ${body.length.toLocaleString('en-IN')} rows. Import at most ${base.MAX_ROWS.toLocaleString('en-IN')} at a time — split it into parts.`);
  }
  const out = [];
  const skipped = [];
  for (const r of body) {
    const cells = {};
    for (const [f, col] of Object.entries(mapping)) cells[f] = norm(r.cells[col]);
    if (!Object.values(cells).some(Boolean)) { skipped.push({ row: r.n, reason: 'Blank row' }); continue; }
    const code = cells.code || cells.productCode || '';
    if (EXAMPLE.test(code)) { skipped.push({ row: r.n, reason: 'Example row from the template' }); continue; }
    out.push({ row: r.n, cells });
  }
  return { rows: out, skipped };
}

module.exports = {
  KINDS, guessMapping, headerFinder, read, readMapping, missingFields, fieldList, rowsOf, norm,
  normUnit: base.normUnit, readNumber: base.readNumber, nameKey: base.nameKey, codeKey: base.codeKey,
  SheetError: base.SheetError,
};
