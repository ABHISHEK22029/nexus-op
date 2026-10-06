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
     medium  a PDF table row rebuilt from the positions of its words, or
             a text line whose quantity × rate agrees with its amount
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
  description: ['description', 'item description', 'description of goods', 'particulars', 'particular', 'item', 'items', 'material', 'material description', 'description of material', 'product', 'product name', 'goods', 'scope', 'work', 'item name', 'name of item', 'name of the item', 'specification', 'task description', 'services', 'service', 'equipment', 'equipments', 'nomenclature'],
  hsn: ['hsn', 'sac', 'hsn code', 'hsn/sac', 'hsn sac', 'hsncode'],
  uom: ['uom', 'unit', 'units', 'u.o.m', 'uqc', 'unit of measure', 'per'],
  quantity: ['qty', 'quantity', 'qnty', 'nos', 'no. of units', 'hours', 'hrs'],
  rate: ['rate', 'unit rate', 'price', 'unit price', 'rate/unit', 'price/unit', 'price/quantity', 'basic rate', 'rate per unit', 'unit cost', 'list price', 'mrp'],
  discount: ['discount', 'disc', 'disc %', 'discount %', 'disc.'],
  taxrate: ['gst %', 'gst (%)', 'gst rate', 'tax %', 'tax rate', 'igst %', 'gst'],
  amount: ['amount', 'value', 'total', 'line total', 'taxable', 'taxable value', 'net amount', 'total amount', 'amt', 'amount (rs.)', 'taxable amt', 'total price', 'estimated cost', 'cost', 'line amount', 'net value'],
};

/* Words that disqualify a header cell from a field even though it starts
   with one of that field's words: "Item Code" is not the description,
   "Unit Price" is not the unit, "Total Qty" is not the amount, "TAXABLE?"
   (a yes/no column) is not the amount, and "Amt. Before" is the second of
   two amount columns, not the one to take. */
const NOT_FOR = {
  description: /\b(code|no\.?|number|#|sl|s\.no|sr)\b|^items?\s*(code|no)/,
  uom: /\b(price|rate|cost|value)\b/,
  amount: /\b(qty|quantity|before)\b|\?$|tax\s*amt|gst\s*amt/,
  quantity: /\b(price|rate|amount)\b/,
  rate: /\b(tax|gst|vat)\b/,
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
/* A label cell in a PDF often carries the end of a long line of terms
   beside it — "of this quote Tax rate", "and goods Tax due" — or a stray
   field code — "[42] Subtotal". So a cell that is not itself a label is
   searched for one, from the last keyword backwards. Only ever applied to
   cells OUTSIDE the description column: an item called "Total station"
   stays an item. */
const LABEL_WORD = /(sub\s*-?\s*total|grand\s*total|net\s*amount|taxable|tax\s*(rate|due|amount)?|[csi]gst|gst|vat|discount|round\s*-?\s*off|final\s*amount|total)\b/gi;
function labelKind(text, taxSeen) {
  const k = summaryKind(text, taxSeen);
  if (k) return k;
  const s = String(text || '');
  const hits = [...s.matchAll(LABEL_WORD)].map(m => m.index).reverse();
  for (const at of hits) {
    const k2 = summaryKind(s.slice(at), taxSeen);
    if (k2) return k2;
  }
  return null;
}

function summaryKind(text, taxSeen) {
  const t = lower(text).replace(/^\[\d+\]\s*/, '').replace(/^(add|less)\s*[:\-]?\s*/, '').replace(/^[:\-\s]+/, '');
  /* A RATE is not an amount: "TAX RATE 0.086", "Tax/VAT Rate 10%" must not
     be added to the tax. Nor is money already paid, or the balance left. */
  if (/^(tax|gst|vat|igst|cgst|sgst)\s*(\/\s*vat\s*)?(rate|%)|^rate\s+of\s+tax/.test(t)) return 'ignore';
  if (/^(amount\s*)?(paid|received)\b|^advance\b|^balance\b|^due\s*amount|^previous\s*balance/.test(t)) return 'ignore';
  /* A page total carried over to the next page, or brought forward from
     the last: the document's own total comes at the end. */
  if (/^totals?\s*(c\s*\/\s*[ofd]|b\s*\/\s*[fd]|carried|brought)|^(c\/[ofd]|b\/[fd])\b/.test(t)) return 'ignore';
  if (/^(grand\s*total|net\s*(amount|payable|total|value)|total\s*(amount\s*)?payable|amount\s*payable|invoice\s*(total|value)|total\s*(amount|value)\s*(incl|with|including)|total\s*incl|amount\s*(with|incl|including)\s*(gst|tax)|total\s*(with|incl)\s*(gst|tax)|final\s*amount|total\s*quot(e|ation)|quot(e|ation)\s*total|gross\s*total|estimated\s*cost|total\s*cost)/.test(t)) return 'grand';
  if (/^(sub\s*-?\s*total|taxable\s*(value|amount|amt)|total\s*(before|excl|excluding|without)\s*(tax|gst)|basic\s*(value|amount|total)|total\s*taxable|amount\s*before\s*tax)/.test(t)) return 'subtotal';
  if (/^taxable\b/.test(t)) return 'ignore';     // "Taxable 345": the taxable PART, not an item
  if (/^(i|c|s|u)?gst\b|^tax\b|^vat\b|^sales\s*tax|^tax\s*(amount|due)|^total\s*(tax|gst)|^gst\s*amount|^(i|c|s)gst\s*@/.test(t)) return 'tax';
  if (/^discount\b|^disc\.?\b|^trade\s*discount|^less\s*discount|^special\s*discount|^client\s*discount|discount$/.test(t)) return 'discount';
  if (/^round(ing)?\s*-?\s*off\b|^round\s*off/.test(t)) return 'roundoff';
  if (/^(other|others|other\s*charges)$/.test(t)) return 'ignore';
  if (/^total\b/.test(t)) return 'total';   // addSummary decides which total it is
  if (/^(amount|rupees)\s+in\s+words|^in\s+words|^rupees\b/.test(t)) return 'words';
  return null;
}

/* Lines that can end in a number without being an item: a phone, a PIN
   code, a bank account, a GSTIN. Read from real vendor PDFs, where every
   one of these turned up as a "line" before. */
const JUNK = /\b(tel|telephone|phone|mob(ile)?|cell|fax|whats\s*app|e-?mail|website|www\.|a\/c|account|ifsc|bank|branch|gstin|gst\s*no|pan\b|cin\b|pin\s*code|pincode|plot|road|street|nagar|area|sector|floor|building|dist(rict)?|state\s*code|po\s*box|page\s*\d|quotation\s*(no|date)|dated?\b|ref(erence)?\s*no|valid(ity)?|delivery\s*(period|time)|payment\s*terms?|must|shall|should|please|subject\s+to)\b|^\s*[•·▪*]\s/i;

function addSummary(totals, kind, value, state) {
  if (value == null) return;
  /* An unfilled template's "$0.00" is not a total. */
  if (value === 0 && kind !== 'tax' && kind !== 'roundoff') return;
  if (kind === 'tax') { totals.tax = r2((totals.tax || 0) + value); state.taxSeen = true; }
  else if (kind === 'subtotal') totals.subtotal = r2(value);
  /* A bare "Total" is the pre-tax total until tax has been seen, and the
     grand total after — unless a "Grand Total" was already stated: the GST
     summary table printed under it ends in a bare "Total" of the TAX, and
     that must not replace it. */
  else if (kind === 'total') {
    if (!state.taxSeen) totals.subtotal = totals.subtotal ?? r2(value);
    else if (!state.grandStated) totals.grand = r2(value);
  } else if (kind === 'grand') { totals.grand = r2(value); state.grandStated = true; }
  else if (kind === 'discount') totals.discount = r2((totals.discount || 0) + Math.abs(value));
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
/* How strongly one header cell names each field: 3 for an exact match,
   2 for a cell that starts with the word, 1 for one that contains it. */
function cellScores(c) {
  const t = lower(c).replace(/\(.*?\)/g, '').replace(/[:.]+$/, '').trim();
  const out = [];
  if (!t || t.length > 40) return out;
  for (const [field, words] of Object.entries(HEADER_WORDS)) {
    if (NOT_FOR[field] && NOT_FOR[field].test(t)) continue;
    let s = 0;
    for (const w of words) {
      if (t === w) s = Math.max(s, 3 + w.length / 100);
      else if (t.startsWith(w + ' ') || t.startsWith(w + '/') || t.startsWith(w)) s = Math.max(s, 2 + w.length / 100);
      else if (t.includes(w)) s = Math.max(s, 1);
    }
    if (s > 0) out.push({ field, s });
  }
  return out.sort((a, b) => b.s - a.s);
}

function findHeader(rows) {
  let best = { score: 0, index: -1, map: {} };
  rows.slice(0, 40).forEach((cells, i) => {
    const cand = [];
    cells.forEach((c, ci) => {
      for (const x of cellScores(c)) cand.push({ field: x.field, ci, s: x.s });
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

/* "6 Pcs." → 6 and "Pcs." — a quantity and its unit sharing one cell. */
function numUnit(v) {
  const n = num(v);
  if (n != null) return { n, unit: null };
  const m = norm(v).match(/^(\d[\d,]*\.?\d*)\s*([A-Za-z][A-Za-z.' ]{0,8})$/);
  return m ? { n: num(m[1]), unit: m[2].trim() } : { n: null, unit: null };
}

/* "18%", "18", "0.18" → 18. A percentage column holds any of the three. */
function pct(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw);
  let v = num(s.replace(/%/g, ''));
  if (v == null) return null;
  if (!/%/.test(s) && v > 0 && v < 1) v *= 100;
  return v;
}

const CHARGE = /\b(freight|transport(ation)?|packing|forwarding|p\s*&\s*f|shipping|cartage|loading|unloading|installation|insurance|delivery\s*charges?|handling)\b/i;

function parseGrid(rows, { base = 'high' } = {}) {
  const out = { lines: [], totals: {}, header: null, writtenSum: 0 };
  const h = findHeader(rows);
  /* Description plus one of rate/amount is the least that can be called a
     quotation table. Anything looser starts reading addresses as items. */
  if (h.score < 2 || h.map.description === undefined || (h.map.rate === undefined && h.map.amount === undefined)) return out;
  out.header = h;
  const state = { taxSeen: false };

  /* Two headings can claim the same field — Vyapar's own template heads
     a column of units "UNIT PRICE" and the real prices "Price/unit". The
     data settles it: a price column holds numbers. If the column chosen
     holds none under the heading and another candidate does, take that
     one, and the unit-filled column becomes the unit. */
  const body = rows.slice(h.index + 1, h.index + 60);
  const numericShare = (ci) => {
    const vals = body.map(r => r?.[ci]).filter(v => v != null && norm(v) !== '');
    return vals.length ? vals.filter(v => num(v) != null).length / vals.length : 0;
  };
  for (const field of ['rate', 'amount', 'quantity']) {
    const cur = h.map[field];
    if (cur === undefined || numericShare(cur) > 0) continue;
    const taken = new Set(Object.entries(h.map).filter(([f]) => f !== field).map(([, ci]) => ci));
    const alt = (rows[h.index] || []).map((c, ci) => ({ ci, s: (cellScores(c).find(x => x.field === field) || {}).s || 0 }))
      .filter(x => x.s >= 2 && x.ci !== cur && !taken.has(x.ci) && numericShare(x.ci) > 0)
      .sort((a, b) => numericShare(b.ci) - numericShare(a.ci))[0];
    if (alt) {
      if (h.map.uom === undefined && body.some(r => UOM_WORDS.has(lower(r?.[cur]).replace(/[.,]$/, '')))) h.map.uom = cur;
      h.map[field] = alt.ci;
    }
  }

  for (let i = h.index + 1; i < rows.length; i++) {
    const cells = rows[i] || [];
    const pick = (f) => (h.map[f] === undefined ? null : cells[h.map[f]]);
    const description = norm(pick('description'));
    const q = numUnit(pick('quantity'));
    let quantity = q.n;
    let rate = num(pick('rate'));
    let amount = num(pick('amount'));
    const disc = pct(pick('discount'));
    const gst = pct(pick('taxrate'));
    const uom = norm(pick('uom')) || q.unit || null;

    /* A summary row's label can sit in any column. Take the one nearest
       the figure (reading right to left), so "Amount in Words: … |
       Discount | 100" is a discount, not words. A row with a quantity AND
       a rate is an item whatever its description says — "Total station"
       is a surveying instrument, not a total. */
    const texts = cells.map((v, ci) => ({ v: norm(v), ci }))
      .filter(x => x.v && num(x.v) == null && !/^-?\d[\d,.]*\s*%$/.test(x.v));
    const itemShaped = quantity != null && rate != null && description;
    let kind = null;
    for (const x of [...texts].reverse()) {
      if (itemShaped && x.ci === h.map.description) continue;
      const k = x.ci === h.map.description ? summaryKind(x.v, state.taxSeen) : labelKind(x.v, state.taxSeen);
      if (k && k !== 'words') { kind = k; break; }
    }
    if (!kind && !itemShaped && texts.some(x => summaryKind(x.v, state.taxSeen) === 'words')) kind = 'words';
    const nums = cells.map((v, ci) => ({ n: num(v), ci, v }))
      .filter(x => x.n != null && x.ci !== h.map.taxrate && x.ci !== h.map.discount && !/%/.test(String(x.v)));
    const figure = amount ?? (nums.length ? nums[nums.length - 1].n : null);
    if (kind) {
      if (kind !== 'ignore' && kind !== 'words') addSummary(out.totals, kind, figure, state);
      continue;
    }

    /* Freight, packing and the like, written under the items with only a
       label and an amount: part of the price, so a line — not lost. */
    if (!description && figure != null) {
      const label = texts.find(x => CHARGE.test(x.v));
      if (label && figure > 0) {
        out.lines.push({ description: label.v, hsn: null, uom: null, quantity: null, rate: null, amount: r2(figure), confidence: base === 'high' ? 'high' : 'medium' });
        out.writtenSum += figure;
      }
      continue;
    }
    if (!description) continue;
    /* "18%" or "8,857.02" as a description is a tax-summary row, not an
       item — an item is named with at least one letter. */
    if (!/[a-z]/i.test(description)) continue;
    if (quantity == null && JUNK.test(description)) continue;
    /* "New client discount (50.00)" written as a line is the discount. */
    if (/discount/i.test(description) && (figure ?? 0) < 0 && quantity == null) {
      addSummary(out.totals, 'discount', figure, state);
      continue;
    }
    if (rate == null && amount == null) continue;   // a note or a sub-heading, not a line

    let confidence = base;
    /* A rate with no quantity and no amount is a price list, not an
       order line: worth having, but somebody should confirm it. */
    if (quantity == null && amount == null && confidence === 'high') confidence = 'medium';
    const written = amount;
    if (amount == null && quantity != null && rate != null) amount = quantity * rate * (1 - (disc || 0) / 100);
    if (rate == null && quantity && amount != null) { rate = amount / quantity; confidence = 'medium'; }
    if (quantity != null && rate != null && amount != null && !close(quantity * rate, amount, 0.02)) {
      const gross = quantity * rate;
      const net = gross * (1 - (disc || 0) / 100);
      /* The vendor's own discount column: what is being offered is the
         NET rate, and that is what has to be compared. */
      if (disc != null && close(net, amount, 0.02)) rate = rate * (1 - disc / 100);
      else {
        /* The amount already includes GST — a "GST %" column, or one of
           the standard rates fitting exactly. The comparison is before
           tax, so the tax is taken back out. */
        const g = gst != null && gst <= 28 && close(net * (1 + gst / 100), amount, 0.02) ? gst
          : [5, 12, 18, 28].find(x => close(net * (1 + x / 100), amount, 0.005));
        if (g != null) {
          if (disc) rate = rate * (1 - disc / 100);
          amount = quantity * rate;
        } else confidence = 'low';
      }
    }
    out.writtenSum += written ?? amount ?? 0;
    out.lines.push({
      description,
      hsn: norm(pick('hsn')).replace(/\.0+$/, '') || null,
      uom,
      quantity: quantity == null ? null : Math.round(quantity * 1000) / 1000,
      rate: rate == null ? null : r2(rate),
      amount: amount == null ? null : r2(amount),
      confidence,
    });
  }
  out.writtenSum = r2(out.writtenSum);
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
  let sawTable = false;
  for (const ws of wb.worksheets) {
    const rows = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const cells = [];
      row.eachCell({ includeEmpty: true }, (cell, col) => { cells[col - 1] = cellValue(cell.value); });
      rows.push(Array.from(cells, v => (v === undefined ? null : v)));
    });
    rows.forEach(r => textRows.push(r.map(norm).filter(Boolean).join(' | ')));
    const g = parseGrid(rows);
    if (g.header) sawTable = true;
    if (g.lines.length > best.lines.length) best = g;
  }
  return { lines: best.lines, totals: best.totals, writtenSum: best.writtenSum, text: textRows.join('\n'),
    note: best.lines.length ? null
      : sawTable ? 'The item table in this spreadsheet is empty — no priced lines were found under its headings.'
        : 'No item table was recognised in this spreadsheet.' };
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
  /* A phone number, PIN code or account number is not a price. */
  if (desc.length > 3 && amount > 0 && amount < 1e8 && !/^[\d.\s]+$/.test(desc) && !JUNK.test(desc)) {
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

  /* Where the text has an item header, nothing above it is an item —
     that is the letterhead, the addresses and the reference numbers. */
  const firstHeader = rows.findIndex(r => HEADERISH.test(r));
  for (const [ri, row] of rows.entries()) {
    if (ri < firstHeader) continue;
    if (HEADERISH.test(row)) { pending = null; last = null; continue; }
    if (STOP.test(row) && out.lines.length) break;
    if (JUNK.test(row) && !/\d+\s*(nos|pcs|kg|mt|set)\b/i.test(row)) { pending = null; last = null; continue; }
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
  /* Lines read on a guess, with nothing properly read beside them, are
     not a quotation — they are a spec sheet's figures or a letterhead's
     phone numbers. Better an honest empty result than invented items. */
  if (out.lines.length && !out.lines.some(l => l.confidence !== 'low')) out.lines = [];
  if (!out.lines.length) out.note = 'No item lines could be read from this document.';
  return out;
}

/* ── PDF tables, read by position ────────────────────────────────────────
   A PDF has no table in it, only words at coordinates. Its text layer
   comes out in drawing order, which for invoices from accounting software
   is often not reading order — quantity first, description last — and a
   line reader then sees "30.00 PCS 1 1 48203000 SPRING FILE". So the
   table is rebuilt the way a person reads it:

     1. every word, with its x and y (a run like "6 Pcs." is split into
        words, each given its share of the run's width)
     2. words grouped into lines by y
     3. the header line found by its words (Description, Qty, Rate…),
        merged with a second header line ("Amt." / "Before")
     4. every word below it assigned to the column whose heading it sits
        under; a line with only description text is the wrapped part of
        the nearest item
     5. the rebuilt rows go through the same parseGrid as a spreadsheet

   Stops at the end of the item block — the amount in words, the bank
   details, the signature — so an account number is never an "item". */
const STOP = /^(total\s*)?(amount\s*(chargeable\s*)?\(?in\s*words|rupees\b.*\bonly\b|in\s*words|declaration|terms\s*(&|and)\s*conditions|bank\s*(name|details)|our\s*bank|account\s*(no|number|details)|authori[sz]ed\s*signatory|e\.?\s*&\s*o\.?\s*e|this\s+is\s+a\s+computer)/i;

async function pdfPages(buffer, maxPages = 30) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), verbosity: 0, isEvalSupported: false, disableFontFace: true }).promise;
  const pages = [];
  try {
    for (let p = 1; p <= Math.min(doc.numPages, maxPages); p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      const toks = [];
      for (const it of tc.items) {
        const s = it.str;
        if (!s || !s.trim()) continue;
        const x = it.transform[4], y = it.transform[5];
        const w = it.width || 0;
        const fs = Math.abs(it.transform[3]) || Math.abs(it.transform[0]) || 8;
        const re = /\S+/g; let m;
        while ((m = re.exec(s))) {
          toks.push({ t: m[0], x0: x + w * (m.index / s.length), x1: x + w * ((m.index + m[0].length) / s.length), y, fs });
        }
      }
      toks.sort((a, b) => b.y - a.y || a.x0 - b.x0);
      const lines = [];
      for (const t of toks) {
        const L = lines[lines.length - 1];
        if (L && Math.abs(L.y - t.y) <= Math.max(2, Math.max(L.fs, t.fs) * 0.45)) { L.toks.push(t); L.fs = Math.max(L.fs, t.fs); }
        else lines.push({ y: t.y, fs: t.fs, toks: [t] });
      }
      for (const L of lines) {
        L.toks.sort((a, b) => a.x0 - b.x0);
        L.text = L.toks.map(t => t.t).join(' ');
      }
      pages.push(lines);
    }
  } finally { await doc.destroy().catch(() => {}); }
  return pages;
}

/* Words that are close together are one phrase ("Description of Goods");
   a wider gap is a column boundary. */
function phrases(toks) {
  const out = [];
  for (const t of toks) {
    const P = out[out.length - 1];
    if (P && t.x0 - P.x1 < Math.max(2.5, t.fs * 0.6)) { P.text += ' ' + t.t; P.x1 = t.x1; P.toks.push(t); }
    else out.push({ text: t.t, x0: t.x0, x1: t.x1, toks: [t] });
  }
  return out;
}

/* Two headings set close together read as one phrase — "Qty. Unit",
   "Price Discount %" — and the columns under them merge. A phrase is split
   when it is not itself a heading but each half exactly is, and they name
   different fields. "Unit Price" is itself a heading, so it stays whole. */
function splitHeadings(ph) {
  const out = [];
  for (const p of ph) {
    const whole = cellScores(p.text)[0];
    let done = false;
    if (p.toks.length > 1 && !(whole && whole.s >= 3)) {
      for (let k = 1; k < p.toks.length && !done; k++) {
        const L = p.toks.slice(0, k), R = p.toks.slice(k);
        const a = cellScores(L.map(t => t.t).join(' '))[0], b = cellScores(R.map(t => t.t).join(' '))[0];
        if (a && b && a.s >= 3 && b.s >= 3 && a.field !== b.field) {
          out.push({ text: L.map(t => t.t).join(' '), x0: L[0].x0, x1: L[L.length - 1].x1, toks: L });
          out.push({ text: R.map(t => t.t).join(' '), x0: R[0].x0, x1: R[R.length - 1].x1, toks: R });
          done = true;
        }
      }
    }
    if (!done) out.push(p);
  }
  return out;
}

const hasNumber = (s) => /\d/.test(s) && /^[\d,.\s%()-]+$/.test(s);

const NUMERIC_FIELDS = new Set(['hsn', 'quantity', 'rate', 'discount', 'taxrate', 'amount']);
const SERIAL = /^(s\.?\s*n\.?o?\.?|sr\.?\s*(no\.?)?|sl\.?\s*(no\.?)?|#|no\.?|sno\.?)$/i;
const isWordy = (t) => /[a-z]/i.test(t) && !/^(rs\.?|₹|inr|`)$/i.test(t);

function tableFromPage(lines) {
  /* The header: the line whose phrases name the most columns, with a
     description and a price among them. A header cell is often two or
     three lines tall — "Price" over "/Unit", "HSN/SAC" over "Code", and
     single-line headings centred between them — so the lines just above
     and below join it when they are close and carry no figures. */
  const near = (A, B) => Math.abs(A.y - B.y) < Math.max(A.fs, B.fs) * 1.6;
  const plain = (L) => L && !L.toks.some(t => /\d/.test(t.t)) && !JUNK.test(L.text);
  let best = null;
  lines.forEach((L, i) => {
    const ph = splitHeadings(phrases(L.toks)).map(p => ({ ...p }));
    const merged = [];
    for (const j of [i - 1, i + 1, i + 2]) {
      const M = lines[j];
      if (!M || !plain(M) || !near(j < i ? M : lines[j - 1], j < i ? L : M)) continue;
      if (j === i + 2 && !merged.includes(i + 1)) continue;
      for (const p2 of phrases(M.toks)) {
        const over = ph.find(p => p2.x0 < p.x1 + 2 && p2.x1 > p.x0 - 2);
        if (over) {
          over.text = j < i ? `${p2.text} ${over.text}` : `${over.text} ${p2.text}`;
          over.x0 = Math.min(over.x0, p2.x0); over.x1 = Math.max(over.x1, p2.x1);
        } else ph.push({ ...p2 });
      }
      merged.push(j);
    }
    ph.sort((a, b) => a.x0 - b.x0);
    /* A heading word that names no column on its own — "Code" after
       "HSN", "of Goods" after "Description" — is the rest of its
       neighbour's heading, not a column of its own. */
    for (let k = 1; k < ph.length; k++) {
      const p = ph[k], left = ph[k - 1];
      /* only a stray word with no column vocabulary in it at all ("Code",
         "Before") — never a serial heading, and never "Amt. Before", which
         names an amount even though it is not the one to take */
      const vocab = Object.values(HEADER_WORDS).some(ws => ws.some(w => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}\\b`, 'i').test(p.text)));
      if (vocab || SERIAL.test(p.text.trim()) || SERIAL.test(left.text.trim()) || p.text.split(/\s+/).length > 2) continue;
      if (p.x0 - left.x1 > L.fs * 0.8 || !cellScores(left.text).length) continue;
      left.text = `${left.text} ${p.text}`;
      left.x1 = Math.max(left.x1, p.x1);
      ph.splice(k, 1); k--;
    }
    const h = findHeader([ph.map(p => p.text)]);
    if (h.score >= 2 && h.map.description !== undefined && (h.map.rate !== undefined || h.map.amount !== undefined)
        && (!best || h.score > best.h.score)) {
      best = { i, ph, h, below: merged.filter(j => j > i) };
    }
  });
  if (!best) return null;

  const cols = best.ph;
  const fieldOf = cols.map((_, k) => Object.keys(best.h.map).find(f => best.h.map[f] === k) || null);
  const numericCol = cols.map((c, k) => NUMERIC_FIELDS.has(fieldOf[k]) || SERIAL.test(c.text.trim()));
  const descCol = best.h.map.description;
  const uomCol = best.h.map.uom;
  const bounds = cols.slice(0, -1).map((c, k) => (c.x1 + cols[k + 1].x0) / 2);
  const centre = (c) => (c.x0 + c.x1) / 2;
  const colOf = (t) => {
    const c = (t.x0 + t.x1) / 2;
    let k = 0;
    while (k < bounds.length && c >= bounds[k]) k++;
    /* A word under a numbers-only column is overflow from a text column —
       a heading centred over a wide description column leaves the first
       word of every item under "Sr. No." otherwise. A unit word goes to
       the unit column; anything else to the nearest text column. */
    if (numericCol[k] && isWordy(t.t)) {
      if (fieldOf[k] === 'quantity' && uomCol === undefined) return k;
      let bestK = descCol, bestD = Infinity;
      cols.forEach((col, j) => {
        if (numericCol[j]) return;
        const d = Math.abs(centre(col) - c);
        if (d < bestD) { bestD = d; bestK = j; }
      });
      /* "SHEET" in "SHEET PROTECTOR" is a unit word too; it goes to the
         unit column only if that column is the nearer one. */
      return bestK;
    }
    return k;
  };
  const serialCols = cols.map((col, k) => SERIAL.test(col.text.trim()) ? k : -1).filter(k => k >= 0);

  const header = cols.map(c => c.text);
  const skip = new Set(best.below);
  const body = [];
  let pendingLabel = null;
  for (let i = best.i + 1; i < lines.length; i++) {
    if (skip.has(i)) continue;
    const L = lines[i];
    const cellToks = cols.map(() => []);
    for (const t of L.toks) cellToks[colOf(t)].push(t);
    /* A serial column holds the item number and nothing else. A heading
       centred over a wide description column leaves the start of every
       description — "POSTIT 3 COLOUR", "UNI UB 157" — under "Sr. No.";
       all of it but the leading number belongs to the description. */
    for (const sk of serialCols) {
      if (descCol === undefined || sk === descCol) continue;
      const ts = cellToks[sk].sort((a, b) => a.x0 - b.x0);
      const keep = ts.length && /^\d{1,4}[.)]?$/.test(ts[0].t) ? [ts[0]] : [];
      const move = ts.filter(t => !keep.includes(t));
      cellToks[sk] = keep;
      cellToks[descCol].push(...move);
    }
    /* A long description runs past its column: "… 1250 x 2500" leaves
       "2500" beside the HSN. A numbers column holds one figure, so any
       extra figures at the front of the column just right of the
       description are the description's. */
    const nextCol = descCol + 1;
    if (nextCol < cols.length && numericCol[nextCol]) {
      const nums = cellToks[nextCol].filter(t => /\d/.test(t.t));
      while (nums.length > 1 && cellToks[descCol].length) {
        const t = nums.shift();
        cellToks[nextCol].splice(cellToks[nextCol].indexOf(t), 1);
        cellToks[descCol].push(t);
      }
    }
    const cells = cellToks.map(ts => ts.sort((a, b) => a.x0 - b.x0).map(t => t.t).join(' '));
    /* The bank details, the terms, the amount in words and the signature
       are not items — but the totals are often printed on the SAME lines,
       to their right. So such a line is dropped only when nothing on it
       is a total. */
    const labelled = cells.some(c => c && !hasNumber(c) && summaryKind(c, true));
    if (STOP.test(L.text) && !labelled) continue;
    const numeric = cells.some((c, k) => k !== descCol && /\d/.test(c));
    const onlyText = !numeric;
    /* "Add : CGST" on one line and "@ 9.00 % 797.13" on the next. */
    if (onlyText && summaryKind(L.text, true)) { pendingLabel = L.text; continue; }
    if (pendingLabel && numeric && !cells[descCol]) {
      const k = cells.findIndex(c => c && !hasNumber(c));
      cells[k >= 0 ? k : 0] = `${pendingLabel} ${cells[k >= 0 ? k : 0]}`.trim();
      pendingLabel = null;
    }
    body.push({ y: L.y, fs: L.fs, cells, numeric, descOnly: onlyText && cells.some(Boolean) });
  }

  /* Wrapped description lines join the nearest item — above or below,
     because some programs centre a tall cell's figures vertically. A tie
     goes to the item above, the usual top-aligned layout. */
  const items = body.filter(r => r.numeric);
  for (const r of body.filter(b => b.descOnly)) {
    const text = r.cells.filter(Boolean).join(' ');
    if (!text || JUNK.test(text) || summaryKind(text, true) || STOP.test(text)) continue;
    let nearest = null, dist = Infinity;
    for (const it of items) {
      /* only onto an item — never onto a totals row, which would hide
         its label ("Amount Total" + "Taxable amount"). An item whose
         description is entirely on the lines around its figures has an
         empty description cell, and is exactly what this is for. */
      if (it.cells[descCol] ? summaryKind(it.cells[descCol], true) : it.cells.some(c => c && !hasNumber(c) && summaryKind(c, true))) continue;
      const d = Math.abs(it.y - r.y);
      if (d < dist || (d === dist && it.y > r.y)) { nearest = it; dist = d; }
    }
    if (!nearest || dist > (r.fs || 8) * 2.6) continue;
    (nearest.extra = nearest.extra || []).push({ y: r.y, text: r.cells[descCol] || text });
  }
  const rows = [header];
  for (const it of items) {
    if (it.extra) {
      const parts = [...it.extra, { y: it.y, text: it.cells[descCol] }].filter(p => p.text).sort((a, b) => b.y - a.y);
      it.cells[descCol] = parts.map(p => p.text).join(' ');
    }
    rows.push(it.cells);
  }
  return rows;
}

async function parsePdfTables(buffer) {
  const pages = await pdfPages(buffer);
  const all = { lines: [], totals: {}, writtenSum: 0, found: false };
  for (const lines of pages) {
    const rows = tableFromPage(lines);
    if (!rows) continue;
    /* medium, not high: a table rebuilt from positions is still a
       reconstruction, so its rows keep the "check the original" mark even
       when their arithmetic agrees. Only real cells are high. */
    const g = parseGrid(rows, { base: 'medium' });
    if (!g.header) continue;
    all.found = true;
    all.lines.push(...g.lines);
    Object.assign(all.totals, g.totals);
    all.writtenSum = r2(all.writtenSum + g.writtenSum);
  }
  return all;
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
  if (!norm(text)) {
    return { lines: [], totals: {}, text,
      note: 'This PDF has no text layer — it is probably a scan. Ask the vendor for the original file, or enter the lines by hand.' };
  }

  /* The table, read by position, first. The line reader is the fallback
     for a PDF with no recognisable item table at all. */
  let tables = null;
  try { tables = await parsePdfTables(buffer); } catch { tables = null; }
  if (tables && tables.found && tables.lines.length) {
    return { lines: tables.lines, totals: tables.totals, writtenSum: tables.writtenSum, text, note: null };
  }
  const out = parseText(text);
  if (tables && tables.found && !out.lines.length) out.note = 'The item table in this PDF is empty — no priced lines were found under its headings.';
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
  let sawTable = false;
  for (const t of html.match(/<table[\s\S]*?<\/table>/g) || []) {
    /* A merged cell (colspan) stands for several columns; without
       spreading it out, every cell after it shifts one column left. */
    const rows = (t.match(/<tr[\s\S]*?<\/tr>/g) || []).map(tr => {
      const cells = [];
      for (const td of tr.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/g) || []) {
        const span = Number((td.match(/colspan="(\d+)"/) || [])[1]) || 1;
        cells.push(norm(decode(td)));
        for (let k = 1; k < span; k++) cells.push('');
      }
      return cells;
    });
    const g = parseGrid(rows);
    if (g.header) sawTable = true;
    if (g.lines.length > best.lines.length) best = g;
  }
  const { value: raw } = await mammoth.extractRawText({ buffer });
  if (!best.lines.length) {
    const out = parseText(raw || '');
    if (!out.lines.length && sawTable) out.note = 'The item table in this document is empty — no priced lines were found under its headings.';
    return out;
  }
  /* Paragraph ends become line ends BEFORE the tags are stripped, or the
     whole document reads as one line and "CGST 9%: …" is never seen. */
  const outside = parseText(decode(html.replace(/<table[\s\S]*?<\/table>/g, '\n').replace(/<\/(p|h\d|li)>/g, '\n')));
  return { lines: best.lines, writtenSum: best.writtenSum, text: raw, note: null,
    totals: { ...outside.totals, ...best.totals, tax: best.totals.tax ?? outside.totals.tax, grand: best.totals.grand ?? outside.totals.grand } };
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
  /* writtenSum is the lines as the document wrote them — with GST still
     inside, where its Amount column included it — which is what its own
     "Sub Total" adds up. */
  const written = out.writtenSum || summed;
  const fits = (x) => x && (close(x, target, 0.02) || close(x - (t.discount || 0), target, 0.02));
  let mismatch = false;
  if (summed && target != null) mismatch = !fits(summed) && !fits(written);
  else if (summed && t.grand != null) {
    mismatch = ![0, 5, 12, 18, 28].some(g => close((summed - (t.discount || 0)) * (1 + g / 100), t.grand, 0.02)
      || close(summed * (1 + g / 100) - (t.discount || 0), t.grand, 0.02))
      && !close(written - (t.discount || 0), t.grand, 0.02) && !close(written, t.grand, 0.02);
  }
  if (mismatch) {
    out.note = (out.note ? out.note + ' ' : '')
      + `The lines read add up to ${summed.toFixed(2)}, but the document says ${Number(target ?? t.grand).toFixed(2)} — `
      + 'a row was probably missed. Check against the original.';
  }

  const status = !out.lines.length ? 'failed'
    : (mismatch || out.lines.some(l => l.confidence === 'low' || l.amount == null)) ? 'partial'
      : 'parsed';

  return { kind, lines: out.lines, totals: out.totals, text: out.text, note: out.note || null, status };
}

module.exports = { parseQuotation, matchKey, num, itemSignature, similarity, parseText, parseGrid };
