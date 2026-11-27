/* ══════════════════════════════════════════════════════════
   ItemImportController — products, raw materials and recipes from a sheet.

   Setting up a manufacturer meant typing every product, every material and
   every recipe line by hand, one form at a time. The readiness check and
   the shortfall board work only once all three are in, so the first week of
   a new client was data entry. This takes the sheets they already keep.

   Same shape as the stock upload (StockImportController):
     GET  …/import/template   a workbook to fill in, with an example and help
     POST …/import/plan       read the file, say row by row what would happen
                              and what is wrong — nothing is saved
     POST …/import/commit     read the file again and do exactly that
   The file is sent twice rather than the parsed rows once: the JSON body
   limit is 100 kB and a product list is not.

   Rows with a problem are left out and listed; the rest go in. A recipe is
   all or nothing per product — half a bill of materials would tell the
   readiness check a product needs less than it does.

   Everything is the caller's company's: products and materials are matched
   only against its own, and written with its owner_id.
   ══════════════════════════════════════════════════════════ */
const db = require('../db');
const S = require('../shared/itemSheet');
const { convert, loadUoms } = require('../shared/uom');

const orgOf = (req) => req.user?.orgId ?? req.user?.id;
const r6 = (n) => Math.round(Number(n) * 1e6) / 1e6;

class InputError extends Error {
  constructor(message, extra) { super(message); this.status = 400; this.extra = extra; }
}
const fail = (res, e) => res.status(e.status || 500).json({ error: e.message, ...(e.extra || {}) });

const EXAMPLE_HEADINGS = {
  products: 'Product code, Product name, Unit, Price',
  materials: 'Material code, Material name, Unit, Standard rate',
  recipes: 'Product code, Material code, Qty per unit, Unit',
};

/* The file, its headings, and which column is which. */
async function readUpload(req, kind) {
  if (!req.file) throw new InputError('Choose a file to import — an Excel workbook (.xlsx) or a CSV file.');
  const read = await S.read(req.file.buffer, req.file.originalname, kind);
  if (!read.located) {
    throw new InputError(`No column headings were found. The sheet needs a heading row near the top that names its columns — for example ${EXAMPLE_HEADINGS[kind]}. Download the template to start from one.`);
  }
  const { headers, bodyStart, headerRow } = read.located;
  const mapping = S.readMapping(req.body?.mapping, headers, kind) || S.guessMapping(headers, kind);
  return {
    read,
    view: {
      kind,
      file: { name: req.file.originalname, sheet: read.sheet, headerRow },
      headers,
      sample: read.rows.slice(bodyStart, bodyStart + 3).map((r) => headers.map((_, c) => S.norm(r.cells[c]))),
      mapping,
      fields: S.fieldList(mapping, kind),
      missing: S.missingFields(mapping, kind),
    },
  };
}

/* Indexes of what is on file, by code and by name. */
function indexOf(list, codeCol) {
  const byCode = new Map();
  const byName = new Map();
  for (const e of list) {
    if (S.norm(e[codeCol])) byCode.set(S.codeKey(e[codeCol]), e);
    const k = S.nameKey(e.name);
    byName.set(k, [...(byName.get(k) || []), e]);
  }
  return { byCode, byName };
}

const activity = (q, owner, type, description) => q(
  `INSERT INTO activities ("projectId", type, description, timestamp, owner_id) VALUES (NULL, $1, $2, NOW(), $3)`,
  [type, description.slice(0, 500), owner]);

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/* ══ Products and raw materials ═══════════════════════════ */

const MASTER = {
  products: {
    table: 'skus', codeCol: 'sku_code', noun: 'product', nouns: 'products',
    cols: { code: 'sku_code', name: 'name', description: 'description', unit: 'unit', price: 'price', hsn: 'hsn' },
    labels: { code: 'Code', name: 'Name', description: 'Description', unit: 'Unit', price: 'Price', hsn: 'HSN' },
  },
  materials: {
    table: 'raw_materials', codeCol: 'material_code', noun: 'raw material', nouns: 'raw materials',
    cols: { code: 'material_code', name: 'name', grade: 'grade', category: 'category', unit: 'unit', rate: 'standard_rate', hsn: 'hsn', moq: 'moq', leadTime: 'lead_time_days' },
    labels: { code: 'Code', name: 'Name', grade: 'Grade', category: 'Category', unit: 'Unit', rate: 'Standard rate', hsn: 'HSN', moq: 'Minimum order', leadTime: 'Lead time (days)' },
  },
};
const NUMERIC = new Set(['price', 'rate', 'moq', 'leadTime']);
const MONEY = new Set(['price', 'rate']);

/* One row's values, read and checked on their own. A blank cell is no
   value: on an item already on file it leaves that field as it is. */
function readMasterRow(cells, kind, uoms) {
  const v = {};
  const problems = [];
  const warnings = [];
  const text = (k, max) => { if (cells[k]) v[k] = cells[k].slice(0, max); };
  text('code', 60);
  text('name', 200);
  if (kind === 'products') text('description', 1000);
  else { text('grade', 80); text('category', 80); }

  if (cells.unit) {
    const u = S.normUnit(cells.unit);
    v.unit = u.code;
    if (!u.known || !uoms.has(u.code)) {
      warnings.push(`Unit “${cells.unit}” isn't one of the standard units — kept as written${kind === 'materials' ? '. A recipe in another unit can’t be converted to it.' : '.'}`);
    }
  }
  const num = (k, label, { whole = false } = {}) => {
    if (!cells[k]) return;
    const n = S.readNumber(cells[k]);
    if (!n) { problems.push(`${label} “${cells[k]}” is not a number`); return; }
    if (n.n < 0) { problems.push(`${label} can't be negative (${n.n})`); return; }
    if (whole && !Number.isInteger(n.n)) { v[k] = Math.round(n.n); warnings.push(`${label} rounded to ${v[k]}`); return; }
    v[k] = r6(n.n);
  };
  if (kind === 'products') num('price', 'Price');
  else { num('rate', 'Standard rate'); num('moq', 'Minimum order'); num('leadTime', 'Lead time (days)', { whole: true }); }

  if (cells.hsn) {
    const h = cells.hsn.replace(/[\s.]/g, '');
    if (/^\d{4,8}$/.test(h)) v.hsn = h;
    else warnings.push(`HSN “${cells.hsn}” should be 4 to 8 digits — left out`);
  }
  return { v, problems, warnings };
}

async function planMasters(q, req, kind) {
  const owner = orgOf(req);
  const M = MASTER[kind];
  const { read, view } = await readUpload(req, kind);
  if (view.missing.length) {
    return { ...view, rows: [], problems: [], skipped: [], counts: { rows: 0, new: 0, update: 0, unchanged: 0, problems: 0, skipped: 0 } };
  }
  const { rows, skipped } = S.rowsOf(read, view.mapping);
  const uoms = await loadUoms(db);
  const existing = (await q(`SELECT * FROM ${M.table} WHERE owner_id = $1 ORDER BY id`, [owner])).rows;
  const { byCode, byName } = indexOf(existing, M.codeCol);
  /* A material held in stock keeps its unit — the same rule as editing it. */
  const stocked = kind !== 'materials' ? new Set() : new Set((await q(
    `SELECT DISTINCT rm.id FROM raw_materials rm
       JOIN inventory i ON i.raw_material_id = rm.id
       JOIN stock_movements m ON m.inventory_id = i.id
      WHERE rm.owner_id = $1`, [owner])).rows.map((x) => x.id));
  const nowOf = (e, k) => (kind === 'materials' && k === 'unit' ? (e.base_uom || e.unit) : e[M.cols[k]]);

  const seen = new Map();      // code / name key -> first row
  const claimed = new Map();   // existing id -> row that changes it
  const out = [];
  for (const r of rows) {
    const { v, problems, warnings } = readMasterRow(r.cells, kind, uoms);
    if (!v.name && !v.code) problems.push(`No ${M.noun} name or code`);

    /* The same item twice in this sheet. */
    const key = v.code ? `c:${S.codeKey(v.code)}` : v.name ? `n:${S.nameKey(v.name)}` : null;
    if (key && seen.has(key)) {
      problems.push(v.code ? `Same code as row ${seen.get(key)} — list each ${M.noun} once`
        : `Same name as row ${seen.get(key)} — list each ${M.noun} once, or give them codes`);
    } else if (key) seen.set(key, r.row);

    /* Already on file? By code first; a product typed in without a code is
       found by its name, and the sheet then gives it its code. */
    let match = null;
    if (v.code) {
      match = byCode.get(S.codeKey(v.code)) || null;
      if (!match && v.name) {
        const named = byName.get(S.nameKey(v.name)) || [];
        const uncoded = named.filter((e) => !S.norm(e[M.codeCol]));
        if (uncoded.length === 1) match = uncoded[0];
        else if (named.length && !uncoded.length) {
          warnings.push(`A ${M.noun} named “${named[0].name}” already has the code ${named[0][M.codeCol]} — this row adds another one with the code ${v.code}`);
        }
      }
    } else if (v.name) {
      const named = byName.get(S.nameKey(v.name)) || [];
      if (named.length > 1) problems.push(`${named.length} ${M.nouns} are already named “${named[0].name}” — add the code to say which one`);
      else match = named[0] || null;
    }
    if (match) {
      const first = claimed.get(match.id);
      if (first) problems.push(`Row ${first} already changes this ${M.noun} (“${match.name}”)`);
      else claimed.set(match.id, r.row);
    }

    const changes = [];
    if (match) {
      for (const k of Object.keys(M.cols)) {
        if (v[k] == null) continue;
        const now = nowOf(match, k);
        const blank = now == null || now === '';
        /* "p1" and "P1" are one code; "Mtr" and "m" one unit. */
        const textKey = (s) => (k === 'code' ? S.codeKey(s) : k === 'unit' ? String(S.normUnit(s).code || '') : S.norm(s));
        const differs = NUMERIC.has(k)
          ? (blank ? true : r6(now) !== r6(v[k]))
          : (blank ? true : textKey(now) !== textKey(v[k]));
        if (differs) changes.push({ field: k, label: M.labels[k], money: MONEY.has(k), from: blank ? null : (NUMERIC.has(k) ? Number(now) : now), to: v[k] });
      }
      if (changes.some((c) => c.field === 'code')) {
        const holder = byCode.get(S.codeKey(v.code));
        if (holder && holder.id !== match.id) problems.push(`The code ${v.code} is already used by “${holder.name}”`);
      }
      if (kind === 'materials' && changes.some((c) => c.field === 'unit') && stocked.has(match.id)) {
        problems.push(`Held in stock in ${match.base_uom || match.unit}, so its unit can't change to ${v.unit}. Add a new raw material in the other unit instead.`);
      }
    } else {
      if (!v.name && v.code) problems.push(`No ${M.noun} has the code ${v.code}, and a new one needs a name`);
      if (!v.unit) {
        if (kind === 'materials') problems.push('A new raw material needs a unit — kg, nos, m, sheet… Stock and recipes are counted in it.');
        else { v.unit = 'nos'; warnings.push('No unit given — saved as nos'); }
      }
    }

    const status = problems.length ? 'error' : !match ? 'new' : changes.length ? 'update' : 'unchanged';
    out.push({
      row: r.row, status,
      code: v.code || (match ? match[M.codeCol] : null) || null,
      name: v.name || match?.name || null,
      values: v, matchId: match?.id || null, matchedName: match?.name || null,
      changes, problems, warnings,
    });
  }

  const n = (s) => out.filter((x) => x.status === s).length;
  return {
    ...view,
    rows: out,
    problems: out.filter((x) => x.status === 'error').flatMap((x) => x.problems.map((message) => ({ row: x.row, name: x.name || x.code, message }))),
    skipped,
    counts: { rows: out.length, new: n('new'), update: n('update'), unchanged: n('unchanged'), problems: n('error'), skipped: skipped.length },
  };
}

async function commitMasters(req, res, kind) {
  const owner = orgOf(req);
  const M = MASTER[kind];
  const keepExisting = req.body?.existing === 'skip';
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    /* Two clicks, or two people, importing at once would both see a row as
       new and add it twice. One import per company and kind at a time. */
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`item-import:${kind}:${owner}`]);
    const q = (sql, p) => client.query(sql, p);
    const plan = await planMasters(q, req, kind);
    if (plan.missing.length) throw new InputError(`Choose which column holds the ${M.noun} name (or code).`);
    const add = plan.rows.filter((r) => r.status === 'new');
    const update = keepExisting ? [] : plan.rows.filter((r) => r.status === 'update');
    const result = {
      created: 0, updated: 0, unchanged: plan.counts.unchanged,
      keptAsIs: keepExisting ? plan.counts.update : 0, leftOut: plan.counts.problems,
    };
    if (!add.length && !update.length) {
      await client.query('ROLLBACK');
      if (plan.counts.problems && !plan.counts.unchanged && !plan.counts.update) {
        throw new InputError('Nothing in this sheet can be imported — every row has a problem. Fix the rows shown and choose the file again.');
      }
      return res.json(result);
    }

    for (const r of add) {
      const v = r.values;
      if (kind === 'products') {
        await q(`INSERT INTO skus (owner_id, sku_code, name, description, unit, price, hsn) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [owner, v.code || null, v.name, v.description || null, v.unit, v.price ?? null, v.hsn || null]);
      } else {
        await q(`INSERT INTO raw_materials (owner_id, material_code, name, grade, category, unit, base_uom, standard_rate, hsn, moq, lead_time_days)
                 VALUES ($1, $2, $3, $4, $5, $6, (SELECT code FROM uom WHERE code = $6), $7, $8, $9, $10)`,
          [owner, v.code || null, v.name, v.grade || null, v.category || null, v.unit, v.rate ?? null, v.hsn || null, v.moq ?? null, v.leadTime ?? null]);
      }
      result.created++;
    }
    for (const r of update) {
      const sets = [];
      const params = [r.matchId, owner];
      for (const c of r.changes) {
        params.push(r.values[c.field]);
        sets.push(`"${M.cols[c.field]}" = $${params.length}`);
        /* A material's unit and its stock unit move together, as on the form. */
        if (kind === 'materials' && c.field === 'unit') sets.push(`base_uom = (SELECT code FROM uom WHERE code = $${params.length})`);
      }
      await q(`UPDATE ${M.table} SET ${sets.join(', ')} WHERE id = $1 AND owner_id = $2`, params);
      result.updated++;
    }
    await activity(q, owner, 'ITEMS_IMPORTED',
      `${kind === 'products' ? 'Products' : 'Raw materials'} imported from ${plan.file.name}: ${result.created} added, ${result.updated} updated${result.leftOut ? `, ${result.leftOut} left out` : ''}`);
    await client.query('COMMIT');
    res.json(result);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    fail(res, e);
  } finally { client.release(); }
}

/* ══ Recipes (bills of materials) ═════════════════════════ */

async function planRecipes(q, req) {
  const owner = orgOf(req);
  const { read, view } = await readUpload(req, 'recipes');
  const zero = { rows: 0, products: 0, new: 0, replace: 0, unchanged: 0, problems: 0, skipped: 0 };
  if (view.missing.length) return { ...view, groups: [], problems: [], skipped: [], counts: zero };
  const { rows, skipped } = S.rowsOf(read, view.mapping);
  const uoms = await loadUoms(db);
  const products = (await q('SELECT id, sku_code, name FROM skus WHERE owner_id = $1 ORDER BY id', [owner])).rows;
  const materials = (await q(
    `SELECT id, material_code, name, unit, base_uom, weight_per_piece_kg, length_mm, width_mm, thickness_mm, density_kg_m3
       FROM raw_materials WHERE owner_id = $1 ORDER BY id`, [owner])).rows;
  const conversions = new Map();
  for (const c of (await q(
    `SELECT iu.raw_material_id, iu.uom_code, iu.qty_in_base FROM item_uom iu
       JOIN raw_materials rm ON rm.id = iu.raw_material_id WHERE rm.owner_id = $1`, [owner])).rows) {
    conversions.set(c.raw_material_id, [...(conversions.get(c.raw_material_id) || []), c]);
  }
  const current = new Map();
  for (const b of (await q(
    `SELECT b.sku_id, b.raw_material_id, b.component_name, b.qty_per_unit, COALESCE(b.uom_code, b.uom) AS uom
       FROM sku_bom b JOIN skus s ON s.id = b.sku_id WHERE s.owner_id = $1 ORDER BY b.id`, [owner])).rows) {
    current.set(b.sku_id, [...(current.get(b.sku_id) || []), b]);
  }
  const P = indexOf(products, 'sku_code');
  const R = indexOf(materials, 'material_code');

  /* Find a product or material by code, then by name. A code that isn't on
     file but a name that is — products typed in without codes — is matched
     by the name, and said so. */
  const find = (ix, code, name, { noun, nouns, where }) => {
    const named = name ? (ix.byName.get(S.nameKey(name)) || []) : [];
    if (code) {
      const hit = ix.byCode.get(S.codeKey(code));
      if (hit) {
        return { hit, note: name && S.nameKey(name) !== S.nameKey(hit.name) ? `The code ${code} is “${hit.name}” — the name “${name}” in the sheet was not used` : null };
      }
      if (named.length === 1) return { hit: named[0], note: `No ${noun} has the code ${code} — matched “${named[0].name}” by its name` };
      return { problem: `No ${noun} has the code ${code}. Add it under Items → ${where} (or import ${nouns}) first.` };
    }
    if (named.length === 1) return { hit: named[0] };
    if (named.length > 1) return { problem: `${named.length} ${nouns} are named “${named[0].name}” — add the code to say which one` };
    if (name) return { problem: `No ${noun} is named “${name}”. Check the spelling, or add it under Items → ${where} first.` };
    return { problem: `No ${noun} code or name` };
  };
  const PRODUCT = { noun: 'product', nouns: 'products', where: 'Products' };
  const MATERIAL = { noun: 'raw material', nouns: 'raw materials', where: 'Raw materials' };

  const groups = new Map();
  for (const r of rows) {
    const c = r.cells;
    const problems = [];
    const warnings = [];
    const p = find(P, c.productCode, c.productName, PRODUCT);
    const m = find(R, c.materialCode, c.materialName, MATERIAL);
    for (const x of [p, m]) { if (x.problem) problems.push(x.problem); if (x.note) warnings.push(x.note); }

    let qty = null;
    let unitInQty = null;
    if (!c.qty) problems.push('No quantity per unit');
    else {
      const n = S.readNumber(c.qty);
      if (!n) problems.push(`Quantity “${c.qty}” is not a number`);
      else if (!(n.n > 0)) problems.push('Quantity per unit must be more than zero');
      else { qty = r6(n.n); unitInQty = n.unit; }
    }

    const mat = m.hit || null;
    const stockUnit = mat ? String(mat.base_uom || mat.unit || '').toLowerCase() || null : null;
    let unit = null;
    if (c.unit) {
      unit = S.normUnit(c.unit).code;
      if (!uoms.has(unit)) warnings.push(`Unit “${c.unit}” isn't one of the standard units`);
    } else unit = unitInQty || stockUnit;
    if (!unit && mat) problems.push(`No unit — say which unit the quantity is in (${mat.name} has no unit of its own)`);
    if (mat && unit && stockUnit && unit !== stockUnit) {
      const conv = convert(1, unit, stockUnit, { uoms, item: mat, itemUoms: conversions.get(mat.id) || [] });
      if (!conv.ok) {
        warnings.push(`${mat.name} is held in ${stockUnit}; ${unit} can't be converted to it, so readiness can't count this line. Use ${stockUnit}, or give the material a weight per piece or a unit conversion.`);
      }
    }

    const key = p.hit ? `p:${p.hit.id}` : `u:${S.codeKey(c.productCode || '') || S.nameKey(c.productName || '') || `row${r.row}`}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key, productId: p.hit?.id || null,
        code: p.hit ? (p.hit.sku_code || null) : (c.productCode || null),
        name: p.hit ? p.hit.name : (c.productName || c.productCode || ''),
        lines: [], problems: [], current: [],
      });
    }
    const g = groups.get(key);
    if (mat) {
      const dup = g.lines.find((l) => l.materialId === mat.id);
      if (dup) problems.push(`${mat.name} is already on row ${dup.row} for this product — put the total on one row`);
    }
    g.lines.push({
      row: r.row, materialId: mat?.id || null,
      material: mat ? mat.name : (c.materialName || c.materialCode || ''),
      materialCode: mat ? (mat.material_code || null) : (c.materialCode || null),
      qty, unit, problems, warnings,
    });
  }

  const sig = (materialId, qty, unit) => `${materialId}|${r6(qty)}|${String(unit || '').toLowerCase()}`;
  const list = [...groups.values()];
  for (const g of list) {
    const bad = g.lines.filter((l) => l.problems.length);
    if (g.productId) {
      g.current = (current.get(g.productId) || []).map((b) => ({ material: b.component_name, materialId: b.raw_material_id, qty: Number(b.qty_per_unit), unit: b.uom }));
    }
    if (!g.productId || bad.length) {
      g.status = 'error';
      if (g.productId) {
        g.problems.push(`Left out — ${bad.length === 1 ? `row ${bad[0].row} has a problem` : `rows ${bad.map((l) => l.row).join(', ')} have problems`}. A recipe is saved only when every row for it is right.`);
      }
      continue;
    }
    const was = g.current.map((b) => sig(b.materialId, b.qty, b.unit)).sort().join(';');
    const now = g.lines.map((l) => sig(l.materialId, l.qty, l.unit)).sort().join(';');
    g.status = !g.current.length ? 'new' : was === now ? 'unchanged' : 'replace';
  }

  const n = (s) => list.filter((g) => g.status === s).length;
  return {
    ...view,
    groups: list,
    problems: list.flatMap((g) => g.lines.flatMap((l) => l.problems.map((message) => ({ row: l.row, name: g.name, message })))),
    skipped,
    counts: { rows: rows.length, products: list.length, new: n('new'), replace: n('replace'), unchanged: n('unchanged'), problems: n('error'), skipped: skipped.length },
  };
}

async function commitRecipes(req, res) {
  const owner = orgOf(req);
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`item-import:recipes:${owner}`]);
    const q = (sql, p) => client.query(sql, p);
    const plan = await planRecipes(q, req);
    if (plan.missing.length) throw new InputError('Choose which columns hold the product, the material and the quantity per unit.');
    const apply = plan.groups.filter((g) => g.status === 'new' || g.status === 'replace');
    const result = { created: 0, replaced: 0, unchanged: plan.counts.unchanged, leftOut: plan.counts.problems, lines: 0 };
    if (!apply.length) {
      await client.query('ROLLBACK');
      if (plan.counts.problems && !plan.counts.unchanged) {
        throw new InputError('No recipe in this sheet can be saved — every product has a problem row. Fix the rows shown and choose the file again.');
      }
      return res.json(result);
    }
    for (const g of apply) {
      await q(`DELETE FROM sku_bom WHERE sku_id = $1 AND sku_id IN (SELECT id FROM skus WHERE owner_id = $2)`, [g.productId, owner]);
      for (const l of g.lines) {
        await q(`INSERT INTO sku_bom (sku_id, raw_material_id, component_name, qty_per_unit, uom) VALUES ($1, $2, $3, $4, $5)`,
          [g.productId, l.materialId, l.material, l.qty, l.unit]);
        result.lines++;
      }
      if (g.status === 'new') result.created++; else result.replaced++;
    }
    await activity(q, owner, 'RECIPES_IMPORTED',
      `Recipes imported from ${plan.file.name}: ${result.created} new, ${result.replaced} replaced${result.leftOut ? `, ${result.leftOut} left out` : ''}`);
    await client.query('COMMIT');
    res.json(result);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    fail(res, e);
  } finally { client.release(); }
}

/* ══ Templates ════════════════════════════════════════════ */

const TEMPLATES = {
  products: {
    file: 'maksops-products-template.xlsx',
    headers: ['Product code', 'Product name', 'Unit', 'Price', 'HSN code', 'Description'],
    widths: [16, 34, 10, 12, 12, 40],
    examples: [
      ['EXAMPLE-1', 'Example: V-type cross arm', 'nos', 850, '7308', 'Rows whose code starts with EXAMPLE are skipped'],
      ['EXAMPLE-2', 'Example: Cable tray 300 mm', 'm', 420, '7308', ''],
    ],
    help: [
      ['Product code', 'Recommended', 'Your own code for the product. Products are matched on it, so a second import updates instead of adding again.'],
      ['Product name', 'Yes, for a new product', 'The name printed on quotations and invoices.'],
      ['Unit', 'Recommended', 'How you sell it: nos, kg, m, set, sheet… Left blank, a new product is saved as nos.'],
      ['Price', 'No', 'Selling price per unit, in rupees. 1,200.50 and ₹1200.50 both work.'],
      ['HSN code', 'No', '4 to 8 digits.'],
      ['Description', 'No', 'Details or specification.'],
      ['', '', ''],
      ['Products already on file', '', 'Matched by code (or by name when there is no code). Filled cells update them; blank cells leave them as they are. You can also choose to leave existing products untouched.'],
    ],
  },
  materials: {
    file: 'maksops-raw-materials-template.xlsx',
    headers: ['Material code', 'Material name', 'Grade', 'Category', 'Unit', 'Standard rate', 'HSN code', 'Minimum order', 'Lead time (days)'],
    widths: [16, 34, 12, 14, 9, 14, 11, 14, 16],
    examples: [
      ['EXAMPLE-1', 'Example: MS angle 50x50x6', 'IS 2062', 'Steel', 'kg', 62, '7216', 500, 7],
      ['EXAMPLE-2', 'Example: Hex bolt M12 x 50', '8.8', 'Fasteners', 'nos', 8, '7318', 100, 3],
    ],
    help: [
      ['Material code', 'Recommended', 'Your own code. Materials are matched on it, so a second import updates instead of adding again.'],
      ['Material name', 'Yes, for a new material', 'The name used on purchase orders and in recipes.'],
      ['Grade', 'No', 'For example IS 2062, SS 304.'],
      ['Category', 'No', 'For example Steel, Fasteners, Paint.'],
      ['Unit', 'Yes, for a new material', 'The unit stock is counted in: kg, nos, m, sheet, ltr… It can’t change later once stock is held.'],
      ['Standard rate', 'No', 'Usual purchase price per unit, in rupees.'],
      ['HSN code', 'No', '4 to 8 digits.'],
      ['Minimum order', 'No', 'The smallest quantity you usually order.'],
      ['Lead time (days)', 'No', 'Usual days from order to delivery.'],
    ],
  },
  recipes: {
    file: 'maksops-recipes-template.xlsx',
    headers: ['Product code', 'Product name', 'Material code', 'Material name', 'Qty per unit', 'Unit'],
    widths: [16, 32, 16, 32, 13, 9],
    examples: [
      ['EXAMPLE-1', 'Example: V-type cross arm', 'EXAMPLE-RM1', 'Example: MS angle 50x50x6', 4.2, 'kg'],
      ['EXAMPLE-1', 'Example: V-type cross arm', 'EXAMPLE-RM2', 'Example: Hex bolt M12 x 50', 4, 'nos'],
    ],
    help: [
      ['One row per material', '', 'A product made of three materials takes three rows, each with the same product.'],
      ['Product code / name', 'One of them', 'The product the recipe is for. It must already be in Items → Products — the “Your products” sheet lists them.'],
      ['Material code / name', 'One of them', 'A raw material it is made from. It must already be in Items → Raw materials — see “Your raw materials”.'],
      ['Qty per unit', 'Yes', 'How much of the material ONE unit of the product takes. For a product sold in kg, that is per kg.'],
      ['Unit', 'Recommended', 'The unit of that quantity. Left blank, the material’s own unit is used. A different unit (g for a material held in kg) is converted.'],
      ['', '', ''],
      ['Saving', '', 'Each product in the sheet gets exactly the recipe in the sheet; products not in the sheet keep theirs. If any row for a product has a problem, that product is left out until it is fixed.'],
    ],
  },
};

function styleHeader(ws) {
  const row = ws.getRow(1);
  row.font = { bold: true };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFBE3C8' } };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

async function template(req, res, kind) {
  try {
    const owner = orgOf(req);
    const T = TEMPLATES[kind];
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    wb.creator = 'MaksOps';

    const fill = wb.addWorksheet(S.KINDS[kind].sheetName);
    fill.addRow(T.headers);
    T.examples.forEach((r) => fill.addRow(r));
    T.widths.forEach((w, i) => { fill.getColumn(i + 1).width = w; });
    styleHeader(fill);
    for (let r = 2; r <= T.examples.length + 1; r++) fill.getRow(r).font = { italic: true, color: { argb: 'FF8A8A8A' } };

    const help = wb.addWorksheet('How to fill');
    help.addRow(['Column', 'Needed', 'What to put']);
    T.help.forEach((r) => help.addRow(r));
    help.addRow([]);
    const units = [...(await loadUoms(db)).keys()].sort();
    help.addRow(['Units MaksOps knows', '', units.join(', ')]);
    help.addRow(['Example rows', '', `Rows whose code starts with EXAMPLE are skipped, so you can leave them in or delete them. Fill in the first sheet (“${S.KINDS[kind].sheetName}”).`]);
    help.getColumn(1).width = 26; help.getColumn(2).width = 22; help.getColumn(3).width = 90;
    help.getColumn(3).alignment = { wrapText: true, vertical: 'top' };
    styleHeader(help);

    /* A recipe names products and materials that already exist; listing
       them saves looking each code up. */
    if (kind === 'recipes') {
      const products = (await db.query('SELECT sku_code, name, unit FROM skus WHERE owner_id = $1 ORDER BY name LIMIT 5000', [owner])).rows;
      const materials = (await db.query('SELECT material_code, name, COALESCE(base_uom, unit) AS unit FROM raw_materials WHERE owner_id = $1 ORDER BY name LIMIT 5000', [owner])).rows;
      const ps = wb.addWorksheet('Your products');
      ps.addRow(['Product code', 'Product name', 'Unit']);
      products.forEach((p) => ps.addRow([p.sku_code || '', p.name, p.unit || '']));
      [16, 40, 10].forEach((w, i) => { ps.getColumn(i + 1).width = w; });
      styleHeader(ps);
      const ms = wb.addWorksheet('Your raw materials');
      ms.addRow(['Material code', 'Material name', 'Unit']);
      materials.forEach((m) => ms.addRow([m.material_code || '', m.name, m.unit || '']));
      [16, 40, 10].forEach((w, i) => { ms.getColumn(i + 1).width = w; });
      styleHeader(ms);
    }

    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${T.file}"`,
      'Cache-Control': 'no-store',
    });
    res.send(buf);
  } catch (e) { fail(res, e); }
}

/* ══ Routes ═══════════════════════════════════════════════ */

exports.plan = (kind) => async (req, res) => {
  try {
    const q = (sql, p) => db.query(sql, p);
    res.json(kind === 'recipes' ? await planRecipes(q, req) : await planMasters(q, req, kind));
  } catch (e) { fail(res, e); }
};
exports.commit = (kind) => (req, res) => (kind === 'recipes' ? commitRecipes(req, res) : commitMasters(req, res, kind));
exports.template = (kind) => (req, res) => template(req, res, kind);
