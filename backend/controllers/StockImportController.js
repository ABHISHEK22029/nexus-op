/* ══════════════════════════════════════════════════════════
   StockImportController — stock from a spreadsheet, and stock lists.

   Typing a business's stock in one item at a time is the job nobody
   finishes. This takes the sheet they already keep (Excel or CSV, their
   own column names), shows what it understood, and applies it through the
   stock ledger, so every quantity it sets can still be traced to the
   upload that set it.

   Uploading the same sheet again a month later is the normal case, not an
   edge case. Items already held are then either recounted (set to the
   sheet's quantity), topped up (the sheet's quantity added), or the whole
   sheet goes into a separate stock list — the site store, a second godown —
   so one place's count never overwrites another's.

   Two calls, both with the file: /plan reads it and says what would happen;
   /commit does exactly that. The file is sent twice rather than the parsed
   rows once, because the JSON body limit is 100 kB and a stock sheet is not.
   ══════════════════════════════════════════════════════════ */
const db = require('../db');
const stock = require('../shared/stock');
const sheet = require('../shared/stockSheet');

const r4 = (n) => Math.round((Number(n) || 0) * 10000) / 10000;
const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const orgOf = (req) => req.user?.orgId ?? req.user?.id;
const MAIN = 'Main stock';

class InputError extends Error {
  constructor(message, extra) { super(message); this.status = 400; this.extra = extra; }
}
const fail = (res, e) => res.status(e.status || 500).json({ error: e.message, ...(e.extra || {}) });

/* ── stock lists ─────────────────────────────────────────── */

const listName = (v) => {
  const name = norm(v);
  if (!name) throw new InputError('Give the stock list a name — where the stock is, e.g. “Site store” or “Godown 2”.');
  if (name.length > 60) throw new InputError('Keep the stock list name under 60 characters.');
  if (/^main( stock)?$/i.test(name)) throw new InputError('“Main stock” is the stock you already have. Choose another name for a separate list.');
  return name;
};

/* A list id from the URL; anything that is not one matches nothing (404). */
const listId = (req) => (/^\d+$/.test(String(req.params.id)) ? Number(req.params.id) : -1);

// GET /inventory/lists
exports.lists = async (req, res) => {
  try {
    const owner = orgOf(req);
    const { rows } = await db.query(
      `SELECT l.id, l.name, l.created_at,
              COUNT(i.id)::int AS items,
              COALESCE(SUM(i.quantity * COALESCE(i.unit_cost, 0)), 0)::numeric AS stock_value
         FROM stock_lists l LEFT JOIN inventory i ON i.stock_list_id = l.id
        WHERE l.owner_id = $1
        GROUP BY l.id ORDER BY LOWER(l.name)`, [owner]);
    const main = (await db.query(
      'SELECT COUNT(*)::int AS items FROM inventory WHERE owner_id = $1 AND stock_list_id IS NULL', [owner])).rows[0];
    res.json({ main: { name: MAIN, items: main.items }, lists: rows });
  } catch (e) { fail(res, e); }
};

// POST /inventory/lists { name }
exports.createList = async (req, res) => {
  try {
    const name = listName(req.body?.name);
    const { rows } = await db.query(
      `INSERT INTO stock_lists (owner_id, name, created_by) VALUES ($1, $2, $3)
       ON CONFLICT (owner_id, LOWER(btrim(name))) DO NOTHING RETURNING *`,
      [orgOf(req), name, req.user?.id || null]);
    if (!rows[0]) return res.status(409).json({ error: `There is already a stock list called “${name}”.` });
    res.status(201).json(rows[0]);
  } catch (e) { fail(res, e); }
};

// PATCH /inventory/lists/:id { name }
exports.renameList = async (req, res) => {
  try {
    const name = listName(req.body?.name);
    const { rows } = await db.query(
      'UPDATE stock_lists SET name = $1 WHERE id = $2 AND owner_id = $3 RETURNING *',
      [name, listId(req), orgOf(req)]);
    if (!rows[0]) return res.status(404).json({ error: 'Stock list not found' });
    res.json(rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'There is already a stock list with that name.' });
    fail(res, e);
  }
};

// DELETE /inventory/lists/:id — only an empty list; stock is never deleted with it
exports.deleteList = async (req, res) => {
  try {
    const owner = orgOf(req);
    const list = (await db.query('SELECT id, name FROM stock_lists WHERE id = $1 AND owner_id = $2', [listId(req), owner])).rows[0];
    if (!list) return res.status(404).json({ error: 'Stock list not found' });
    const n = (await db.query('SELECT COUNT(*)::int AS n FROM inventory WHERE stock_list_id = $1', [list.id])).rows[0].n;
    if (n) return res.status(409).json({ error: `“${list.name}” still holds ${n} item${n > 1 ? 's' : ''}. A stock list can only be removed once it is empty.` });
    await db.query('UPDATE stock_uploads SET stock_list_id = NULL WHERE stock_list_id = $1', [list.id]);
    await db.query('DELETE FROM stock_lists WHERE id = $1', [list.id]);
    res.json({ success: true });
  } catch (e) { fail(res, e); }
};

// GET /inventory/uploads — what was uploaded, when, by whom, and what it did
exports.uploads = async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT u.id, u.file_name, u.mode, u.created_items, u.updated_items, u.unchanged_items, u.skipped_rows,
              u.created_at, COALESCE(l.name, $2) AS list_name, us.name AS uploaded_by
         FROM stock_uploads u
         LEFT JOIN stock_lists l ON l.id = u.stock_list_id
         LEFT JOIN users us ON us.id = u.created_by
        WHERE u.owner_id = $1 ORDER BY u.id DESC LIMIT 50`, [orgOf(req), MAIN]);
    res.json(rows);
  } catch (e) { fail(res, e); }
};

/* ── reading and planning ───────────────────────────────── */

function readMapping(raw, headers) {
  if (raw == null || raw === '') return null;
  let m;
  try { m = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { throw new InputError('The column choices could not be read. Choose the columns again.'); }
  const out = {};
  const used = new Map();
  for (const [field, col] of Object.entries(m || {})) {
    if (!sheet.FIELD_KEYS.includes(field)) continue;
    if (col === null || col === '' || Number(col) < 0) continue;
    const c = Number(col);
    if (!Number.isInteger(c) || c >= headers.length) throw new InputError('A chosen column is not in this sheet. Choose the columns again.');
    if (used.has(c)) {
      throw new InputError(`“${headers[c] || `Column ${c + 1}`}” is chosen for both ${sheet.FIELDS[used.get(c)].label} and ${sheet.FIELDS[field].label}. Each column can be used once.`);
    }
    used.set(c, field);
    out[field] = c;
  }
  return out;
}

async function resolveTarget(q, owner, body) {
  if (norm(body.newList)) {
    const name = listName(body.newList);
    const found = (await q(
      'SELECT id, name FROM stock_lists WHERE owner_id = $1 AND LOWER(btrim(name)) = LOWER(btrim($2))', [owner, name])).rows[0];
    return found ? { id: found.id, name: found.name, isNew: false } : { id: null, name, isNew: true };
  }
  const t = norm(body.target);
  if (!t || t === 'main') return { id: null, name: MAIN, isNew: false, main: true };
  const id = Number(t);
  const found = Number.isInteger(id)
    ? (await q('SELECT id, name FROM stock_lists WHERE id = $1 AND owner_id = $2', [id, owner])).rows[0] : null;
  if (!found) { const e = new InputError('That stock list was not found.'); e.status = 404; throw e; }
  return { id: found.id, name: found.name, isNew: false };
}

/**
 * Read the upload and decide, row by row, what would happen.
 * `q` is db.query or a transaction client's query, so /commit plans with
 * exactly the rows it then changes.
 */
async function buildPlan(q, req) {
  if (!req.file) throw new InputError('Choose a stock sheet to upload — Excel (.xlsx) or CSV.');
  const owner = orgOf(req);
  const read = await sheet.readSheet(req.file.buffer, req.file.originalname);
  const located = sheet.locateHeader(read.rows);
  if (!located) {
    throw new InputError('No column headings were found. The sheet needs a heading row near the top that names the columns — for example Item name, Quantity, Unit.');
  }
  const { headers } = located;
  const mapping = readMapping(req.body?.mapping, headers) || sheet.guessMapping(headers);
  /* An item is identified by its name or its code — a sheet of codes and
     counts is enough when the codes are already known. */
  const missing = [];
  if (mapping.itemName == null && mapping.code == null) missing.push('itemName');
  if (mapping.quantity == null) missing.push('quantity');
  const target = await resolveTarget(q, owner, req.body || {});

  const base = {
    file: { name: req.file.originalname, sheet: read.sheet, headerRow: located.headerRow },
    headers,
    sample: read.rows.slice(located.bodyStart, located.bodyStart + 3).map((r) => headers.map((_, c) => norm(r.cells[c]))),
    mapping,
    fields: Object.entries(sheet.FIELDS).filter(([k]) => k !== 'hsn').map(([key, f]) => ({
      key, label: f.label,
      required: key === 'quantity' || (key === 'itemName' && mapping.code == null),
    })),
    missing,
    target,
  };
  if (missing.length) {
    return { ...base, items: [], skipped: [], counts: { rows: 0, new: 0, matched: 0, changed: 0, unchanged: 0, problems: 0, skipped: 0 } };
  }

  const { items, skipped } = sheet.buildItems(read.rows, located.bodyStart, mapping, headers, read);

  /* What is already held in the chosen list, and the item master, so a row
     can be recognised by its code first and its name second. */
  const held = target.isNew ? [] : (await q(
    `SELECT id, "itemName", item_code, quantity, uom, raw_material_id, sku_id
       FROM inventory WHERE owner_id = $1 AND stock_list_id IS NOT DISTINCT FROM $2`, [owner, target.id])).rows;
  const materials = (await q(
    'SELECT id, name, material_code AS code, COALESCE(base_uom, unit) AS uom FROM raw_materials WHERE owner_id = $1', [owner])).rows;
  const products = (await q('SELECT id, name, sku_code AS code, unit AS uom FROM skus WHERE owner_id = $1', [owner])).rows;

  const index = (list, keyOf) => {
    const m = new Map();
    for (const x of list) { const k = keyOf(x); if (k && !m.has(k)) m.set(k, x); }
    return m;
  };
  const heldByCode = index(held, (x) => x.item_code && sheet.codeKey(x.item_code));
  const heldByName = index(held, (x) => sheet.nameKey(x.itemName));
  const heldByMat = index(held, (x) => x.raw_material_id);
  const heldBySku = index(held, (x) => x.sku_id);
  const matByCode = index(materials, (x) => x.code && sheet.codeKey(x.code));
  const matByName = index(materials, (x) => sheet.nameKey(x.name));
  const prodByCode = index(products, (x) => x.code && sheet.codeKey(x.code));
  const prodByName = index(products, (x) => sheet.nameKey(x.name));

  const claimed = new Map();   // inventory id → sheet row, so two rows can't both set one item
  const out = items.map((it) => {
    const row = { ...it, status: 'error', inventoryId: null, current: null, change: null, link: null };
    if (it.problems.length) return row;
    const ck = it.code && sheet.codeKey(it.code);
    const nk = sheet.nameKey(it.itemName);

    let link = null;
    const m = (ck && matByCode.get(ck)) || null;
    const p = !m && ck ? prodByCode.get(ck) : null;
    if (m) link = { kind: 'material', id: m.id, name: m.name, uom: m.uom };
    else if (p) link = { kind: 'product', id: p.id, name: p.name, uom: p.uom };
    else if (nk && matByName.get(nk)) { const x = matByName.get(nk); link = { kind: 'material', id: x.id, name: x.name, uom: x.uom }; }
    else if (nk && prodByName.get(nk)) { const x = prodByName.get(nk); link = { kind: 'product', id: x.id, name: x.name, uom: x.uom }; }
    if (!row.itemName && link) row.itemName = link.name;
    if (!row.itemName) { row.problems.push('No item name, and the code is not one of your items'); return row; }

    const hit = (ck && heldByCode.get(ck))
      || (link?.kind === 'material' && heldByMat.get(link.id))
      || (link?.kind === 'product' && heldBySku.get(link.id))
      || heldByName.get(nk) || null;

    if (hit) {
      if (claimed.has(hit.id)) { row.problems.push(`Same stock item as row ${claimed.get(hit.id)}`); return row; }
      const heldUnit = sheet.normUnit(hit.uom).code;
      if (row.uom && heldUnit && row.uom !== heldUnit) {
        row.problems.push(`The sheet counts this in ${row.uom}, but it is kept in ${heldUnit}. Convert the count to ${heldUnit} first.`);
        return row;
      }
      claimed.set(hit.id, it.row);
      row.uom = row.uom || hit.uom || 'nos';
      row.status = 'match';
      row.inventoryId = hit.id;
      row.heldName = hit.itemName;
      row.current = r4(hit.quantity);
      row.change = r4(row.quantity - row.current);
      row.link = link;
      return row;
    }

    /* Shortfalls read a material's stock in the material's own unit. A sheet
       counting a kg material in nos would be added to it as if it were kg. */
    const linkUnit = link ? sheet.normUnit(link.uom).code : null;
    if (row.uom && linkUnit && row.uom !== linkUnit) {
      row.problems.push(`The sheet counts this in ${row.uom}, but ${link.kind === 'product' ? 'the product' : 'the material'} “${link.name}” is measured in ${linkUnit}. Convert the count to ${linkUnit} first.`);
      return row;
    }
    if (link) {
      const key = `${link.kind}:${link.id}`;
      if (claimed.has(key)) { row.problems.push(`Same ${link.kind} as row ${claimed.get(key)} (“${link.name}”)`); return row; }
      claimed.set(key, it.row);
    }
    if (!row.uom) {
      row.uom = linkUnit || 'nos';
      if (!linkUnit) row.warnings.push('No unit given — counted in nos');
    }
    row.status = 'new';
    row.link = link;
    return row;
  });

  const count = (fn) => out.filter(fn).length;
  return {
    ...base,
    items: out,
    skipped,
    counts: {
      rows: out.length + skipped.length,
      new: count((x) => x.status === 'new'),
      matched: count((x) => x.status === 'match'),
      changed: count((x) => x.status === 'match' && Math.abs(x.change) >= 0.0001),
      unchanged: count((x) => x.status === 'match' && Math.abs(x.change) < 0.0001),
      problems: count((x) => x.status === 'error'),
      skipped: skipped.length,
      unlinked: count((x) => x.status === 'new' && !x.link),
    },
  };
}

// POST /inventory/import/plan  (multipart: file, mapping?, target?, newList?)
exports.plan = async (req, res) => {
  try {
    res.json(await buildPlan((sql, p) => db.query(sql, p), req));
  } catch (e) { fail(res, e); }
};

/* POST /inventory/import/commit
   multipart: file, mapping, target | newList, mode ('set' | 'add'),
              newItemsAs ('material' | 'product' | 'stock'), uploadId */
exports.commit = async (req, res) => {
  const owner = orgOf(req);
  const body = req.body || {};
  const uploadId = norm(body.uploadId);
  if (!/^[A-Za-z0-9-]{8,64}$/.test(uploadId)) return res.status(400).json({ error: 'Upload reference missing. Reload the page and upload the sheet again.' });
  const mode = body.mode === 'add' ? 'add' : body.mode === 'set' ? 'set' : null;
  const newItemsAs = ['material', 'product', 'stock'].includes(body.newItemsAs) ? body.newItemsAs : 'material';

  /* Already applied? Said first — a resend of a sheet that was saved would
     otherwise be answered with "choose recount or top up", as its items are
     now held. The unique key below still settles two clicks racing. */
  const done = (await db.query('SELECT 1 FROM stock_uploads WHERE owner_id = $1 AND upload_ref = $2', [owner, uploadId])).rows[0];
  if (done) return res.status(409).json({ error: 'This upload has already been applied. Refresh Stock on hand to see it.' });

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const q = (sql, p) => client.query(sql, p);
    const plan = await buildPlan(q, req);
    if (plan.missing.length) {
      const what = plan.missing.map((k) => (k === 'itemName' ? 'the item name (or item code)' : sheet.FIELDS[k].label.toLowerCase()));
      throw new InputError(`Choose which column holds ${what.join(' and ')}.`);
    }
    const usable = plan.items.filter((x) => x.status !== 'error');
    if (!usable.length) throw new InputError('Nothing in this sheet can be uploaded — every row has a problem. Fix the rows shown and upload again.');
    if (plan.counts.matched && !mode) {
      throw new InputError('Some of these items are already in stock. Choose whether to update their counts or add to them.', { needsMode: true });
    }

    /* The list first, so the upload record can point at it. */
    let listId = plan.target.id;
    if (plan.target.isNew) {
      const made = (await q(
        `INSERT INTO stock_lists (owner_id, name, created_by) VALUES ($1, $2, $3)
         ON CONFLICT (owner_id, LOWER(btrim(name))) DO NOTHING RETURNING id`,
        [owner, plan.target.name, req.user?.id || null])).rows[0];
      listId = made ? made.id : (await q(
        'SELECT id FROM stock_lists WHERE owner_id = $1 AND LOWER(btrim(name)) = LOWER(btrim($2))', [owner, plan.target.name])).rows[0].id;
    }

    /* Claimed before anything moves: a second click with the same reference
       waits on the unique key, then finds it taken. */
    const up = (await q(
      `INSERT INTO stock_uploads (owner_id, upload_ref, file_name, stock_list_id, mode, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (owner_id, upload_ref) DO NOTHING RETURNING id`,
      [owner, uploadId, plan.file.name, listId, plan.counts.matched ? mode : null, req.user?.id || null])).rows[0];
    if (!up) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'This upload has already been applied. Refresh Stock on hand to see it.' });
    }
    const ref = { refType: 'stock_upload', refId: up.id, refNumber: `SU-${up.id}`, userId: req.user?.id };
    const fileNote = `Stock upload SU-${up.id} (${plan.file.name})`;

    let created = 0, updated = 0, unchanged = 0, mastersCreated = 0;

    for (const it of usable) {
      if (it.status === 'new') {
        let link = it.link;
        /* An item the business has never defined becomes one, so the
           shortfall engine can count it — unless they chose plain stock. */
        if (!link && newItemsAs === 'material') {
          const id = (await q(
            `INSERT INTO raw_materials (owner_id, material_code, name, unit, base_uom, standard_rate, category)
             VALUES ($1, $2, $3, $4, (SELECT code FROM uom WHERE code = $4), $5, $6) RETURNING id`,
            [owner, it.code, it.itemName, it.uom, it.unitCost ?? 0, it.category])).rows[0].id;
          link = { kind: 'material', id }; mastersCreated++;
        } else if (!link && newItemsAs === 'product') {
          const id = (await q(
            'INSERT INTO skus (owner_id, sku_code, name, unit) VALUES ($1, $2, $3, $4) RETURNING id',
            [owner, it.code, it.itemName, it.uom])).rows[0].id;
          link = { kind: 'product', id }; mastersCreated++;
        }
        const skuId = link?.kind === 'product' ? link.id : null;
        const materialId = link?.kind === 'material' ? link.id : null;
        const row = (await q(
          `INSERT INTO inventory ("projectId", "itemName", quantity, uom, item_type, unit_cost, sku_id, raw_material_id,
                                  owner_id, stock_list_id, item_code, min_stock_level, category, location)
           VALUES (NULL, $1, 0, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, 0), $11, $12) RETURNING id`,
          [it.itemName, it.uom, skuId ? 'finished' : 'raw', it.unitCost, skuId, materialId,
           owner, listId, it.code, it.minStockLevel, it.category, it.location])).rows[0];
        if (it.quantity) {
          await stock.move(client, {
            ownerId: owner, inventoryId: row.id, skuId, rawMaterialId: materialId,
            itemName: it.itemName, quantity: it.quantity, uom: it.uom, unitCost: it.unitCost,
            movementType: 'opening', note: fileNote, ...ref,
          });
        }
        created++;
        continue;
      }

      /* Already held. Locked and re-read, so a receipt that landed between
         the review and this click is counted rather than overwritten. */
      const held = (await q('SELECT * FROM inventory WHERE id = $1 AND owner_id = $2 FOR UPDATE', [it.inventoryId, owner])).rows[0];
      if (!held) continue;
      const now = r4(held.quantity);
      const delta = mode === 'add' ? it.quantity : r4(it.quantity - now);
      if (Math.abs(delta) >= 0.0001) {
        await stock.move(client, {
          ownerId: owner, inventoryId: held.id, skuId: held.sku_id, rawMaterialId: held.raw_material_id,
          itemName: held.itemName, quantity: delta, uom: held.uom, unitCost: it.unitCost ?? held.unit_cost,
          movementType: 'adjustment',
          note: mode === 'add'
            ? `${fileNote}: added ${it.quantity}`
            : `${fileNote}: counted ${it.quantity} (was ${now})`,
          ...ref,
        });
        updated++;
      } else unchanged++;
      await q(
        `UPDATE inventory SET unit_cost = COALESCE($2, unit_cost), min_stock_level = COALESCE($3, min_stock_level),
                category = COALESCE($4, category), location = COALESCE($5, location),
                item_code = COALESCE(item_code, $6),
                sku_id = COALESCE(sku_id, $7), raw_material_id = COALESCE(raw_material_id, $8)
          WHERE id = $1`,
        [held.id, it.unitCost, it.minStockLevel, it.category, it.location, it.code,
         it.link?.kind === 'product' ? it.link.id : null, it.link?.kind === 'material' ? it.link.id : null]);
    }

    const skippedRows = plan.counts.problems + plan.counts.skipped;
    await q(
      `UPDATE stock_uploads SET created_items = $2, updated_items = $3, unchanged_items = $4, skipped_rows = $5 WHERE id = $1`,
      [up.id, created, updated, unchanged, skippedRows]);
    await q(
      `INSERT INTO activities ("projectId", type, description, timestamp, owner_id) VALUES (NULL, 'STOCK_UPLOADED', $1, NOW(), $2)`,
      [`${plan.file.name} uploaded to ${plan.target.name}: ${created} new, ${updated} ${mode === 'add' ? 'added to' : 'recounted'}, ${unchanged} unchanged`, owner]);
    await client.query('COMMIT');

    res.status(201).json({
      upload: { id: up.id, ref: `SU-${up.id}` },
      list: { id: listId, name: plan.target.name },
      created, updated, unchanged, mastersCreated,
      problems: plan.counts.problems, skipped: plan.counts.skipped,
      mode: plan.counts.matched ? mode : null,
    });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    fail(res, e);
  } finally { client.release(); }
};
