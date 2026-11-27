#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   Products, raw materials and recipes from a sheet (28 Nov 2026).

   1. Templates download as workbooks with the right headings; the recipes
      one lists the company's own products and materials.
   2. A sheet in the business's own column names is understood — title rows
      above the table, Indian numbers, unit spellings — and every problem is
      named, by row, before anything is saved.
   3. Importing adds what is new; importing the same file again changes
      nothing; a second sheet updates what changed, or leaves it alone.
   4. Recipes are matched to products and materials by code or name, are
      all-or-nothing per product, and replace only the products in the sheet.
   5. End to end: imported materials + imported recipe + uploaded stock give
      an order its readiness answer.
   6. Another company matches none of it; a role that can't edit products
      can't import them; two imports at once don't add anything twice.

   Local only:  API_BASE=http://localhost:5097 node scripts/test-item-import.js
   Throwaway @example.test accounts, removed at the end.
   ══════════════════════════════════════════════════════════════════════ */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Client } = require('pg');
const ExcelJS = require('exceljs');
const { purgeOrg } = require('./lib/purgeOrg');

const API = process.env.API_BASE || 'http://localhost:5099';
if (/^https:|onrender\.com|vercel\.app|maksops\.co\.in/.test(API)) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}
const stamp = Date.now().toString(36);
const PASS = 'testpassword123';
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };
const section = (t) => console.log(`\n  ── ${t}`);
const db = () => new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const q1 = async (sql, params) => { const c = db(); await c.connect(); try { return (await c.query(sql, params)).rows; } finally { await c.end(); } };

async function cleanup() {
  const c = db(); await c.connect();
  try {
    const { rows } = await c.query(`SELECT id, org_id FROM users WHERE email LIKE 'ii-%@example.test'`);
    const ids = [...new Set(rows.flatMap((r) => [r.id, r.org_id]).filter(Boolean))];
    if (!ids.length) return 0;
    for (let i = 0; i < 4; i++) { const r = await purgeOrg(c, ids); if (!r.deleted) break; }
    await c.query('DELETE FROM document_sequences WHERE owner_id = ANY($1)', [ids]).catch(() => {});
    await c.query('DELETE FROM notifications WHERE user_id = ANY($1)', [rows.map((r) => r.id)]).catch(() => {});
    const members = (await c.query(`DELETE FROM users WHERE email LIKE 'ii-%@example.test' AND id <> org_id`)).rowCount;
    return members + (await c.query(`DELETE FROM users WHERE email LIKE 'ii-%@example.test'`)).rowCount;
  } finally { await c.end(); }
}

const call = async (who, method, url, body) => {
  const r = await fetch(`${API}${url}`, {
    method, headers: { Authorization: `Bearer ${who.token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const register = async (tag) => (await fetch(`${API}/auth/register`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: `II ${tag}`, email: `ii-${tag}-${stamp}@example.test`, password: PASS }),
})).json();
const member = async (owner, tag, role) => {
  const email = `ii-${tag}-${stamp}@example.test`;
  const made = await call(owner, 'POST', '/admin/users', { name: `${role} person`, email, password: PASS, role });
  if (![200, 201].includes(made.status)) throw new Error(`could not add a ${role}: ${made.status} ${made.body.error || ''}`);
  return (await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASS }) })).json();
};

/* Multipart, as the browser sends it. */
const send = async (who, path, { file, name = 'sheet.csv', fields = {} }) => {
  const fd = new FormData();
  if (file != null) fd.append('file', new Blob([file]), name);
  Object.entries(fields).forEach(([k, v]) => fd.append(k, typeof v === 'string' ? v : JSON.stringify(v)));
  const r = await fetch(`${API}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${who.token}` }, body: fd });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const BASE = { products: '/skus/import', materials: '/raw-materials/import', recipes: '/skus/recipes/import' };
const plan = (who, kind, opts) => send(who, `${BASE[kind]}/plan`, opts);
const commit = (who, kind, opts) => send(who, `${BASE[kind]}/commit`, opts);
const template = async (who, kind) => {
  const r = await fetch(`${API}${BASE[kind]}/template`, { headers: { Authorization: `Bearer ${who.token}` } });
  const buf = Buffer.from(await r.arrayBuffer());
  return { status: r.status, type: r.headers.get('content-type') || '', disposition: r.headers.get('content-disposition') || '', buf };
};
const workbook = async (buf) => { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf); return wb; };
const rowValues = (ws, n) => (ws.getRow(n).values || []).slice(1).map((v) => (v == null ? '' : String(v)));

const csv = (rows) => rows.map((r) => r.map((v) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}).join(',')).join('\r\n');
const xlsx = async (sheets) => {
  const wb = new ExcelJS.Workbook();
  for (const s of sheets) { const ws = wb.addWorksheet(s.name); s.rows.forEach((r) => ws.addRow(r)); }
  return Buffer.from(await wb.xlsx.writeBuffer());
};
const byRow = (p) => Object.fromEntries((p.rows || []).map((r) => [r.row, r]));
const short = (s) => String(s || '').slice(0, 140);

(async () => {
  const leftover = await cleanup().catch(() => 0);
  if (leftover) console.log(`   (removed ${leftover} leftover test account${leftover > 1 ? 's' : ''})`);
  try {
    const A = await register('a');
    const B = await register('b');
    if (!A.token || !B.token) throw new Error('could not register test accounts');
    const orgA = (await q1('SELECT org_id FROM users WHERE email = $1', [`ii-a-${stamp}@example.test`]))[0]?.org_id;

    /* ── 1 ─────────────────────────────────────────────── */
    section('templates');
    const tp = await template(A, 'products');
    ok(tp.status === 200 && /spreadsheetml/.test(tp.type) && /maksops-products-template\.xlsx/.test(tp.disposition), `products template downloads as a workbook (${tp.status}, ${tp.type.split(';')[0]})`);
    const tpw = await workbook(tp.buf);
    ok(tpw.worksheets[0].name === 'Products' && rowValues(tpw.worksheets[0], 1).join('|') === 'Product code|Product name|Unit|Price|HSN code|Description',
      `its first sheet is “Products” with the six headings (${rowValues(tpw.worksheets[0], 1).join(', ')})`);
    ok(!!tpw.getWorksheet('How to fill'), 'and a “How to fill” sheet explains each column');
    const tm = await template(A, 'materials');
    const tmw = await workbook(tm.buf);
    ok(tm.status === 200 && tmw.worksheets[0].name === 'Raw materials' && rowValues(tmw.worksheets[0], 1).includes('Lead time (days)'),
      `raw-materials template has its headings (${rowValues(tmw.worksheets[0], 1).join(', ')})`);
    /* The template, filled in and sent back as it is, imports its rows and skips the examples. */
    const filled = await workbook(tp.buf);
    filled.worksheets[0].addRow(['TPL-1', 'From the template', 'nos', 100, '7308', '']);
    const tplPlan = await plan(A, 'products', { file: Buffer.from(await filled.xlsx.writeBuffer()), name: 'products.xlsx' });
    ok(tplPlan.status === 200 && tplPlan.body.counts?.new === 1 && tplPlan.body.counts?.skipped === 2,
      `a filled-in template reads its own row and skips the two EXAMPLE rows (${tplPlan.body.counts?.new} new, ${tplPlan.body.counts?.skipped} skipped)`);

    /* ── 2 ─────────────────────────────────────────────── */
    section('raw materials, in the business’s own column names');
    const matSheet = csv([
      ['Item Code', 'Material', 'UOM', 'Rate (₹)', 'Grade', 'MOQ', 'Lead time'],
      ['RM-ANG', 'MS angle 50x50x6', 'Kgs', '62.50', 'IS 2062', '500', '7'],
      ['RM-BLT', 'Hex bolt M12', 'Nos', '8', '', '100', '3'],
      ['RM-PNT', 'Paint black', 'Ltr', '₹ 450', '', '', ''],
      ['RM-ANG', 'Duplicate angle', 'kg', '60', '', '', ''],
      ['', 'No unit material', '', '10', '', '', ''],
      ['RM-BAD', 'Bad rate', 'kg', 'abc', '', '', ''],
      ['RM-NEG', 'Negative minimum', 'kg', '5', '', '-3', ''],
      ['', '', '', '', '', '', ''],
      ['EXAMPLE-1', 'Example: something', 'kg', '1', '', '', ''],
      ['RM-BAG', 'Cement', 'bag', '380', '', '', ''],
    ]);
    const mp = await plan(A, 'materials', { file: matSheet, name: 'materials.csv' });
    const mm = mp.body.mapping || {};
    ok(mp.status === 200 && mm.code === 0 && mm.name === 1 && mm.unit === 2 && mm.rate === 3 && mm.grade === 4 && mm.moq === 5 && mm.leadTime === 6,
      `every column recognised from its heading (${JSON.stringify(mm)})`);
    const mr = byRow(mp.body);
    ok(mr[2]?.status === 'new' && mr[2].values.unit === 'kg' && mr[2].values.rate === 62.5, `“Kgs” is read as kg, 62.50 as 62.5 (${mr[2]?.values?.unit}, ${mr[2]?.values?.rate})`);
    ok(mr[4]?.values?.rate === 450, `“₹ 450” is read as 450 (${mr[4]?.values?.rate})`);
    ok(mr[5]?.status === 'error' && /Same code as row 2/.test(mr[5].problems.join()), `a repeated code is named with the row it repeats: “${short(mr[5]?.problems?.[0])}”`);
    ok(mr[6]?.status === 'error' && /needs a unit/.test(mr[6].problems.join()), `a new material with no unit is stopped: “${short(mr[6]?.problems?.[0])}”`);
    ok(mr[7]?.status === 'error' && /not a number/.test(mr[7].problems.join()), `a rate that isn't a number: “${short(mr[7]?.problems?.[0])}”`);
    ok(mr[8]?.status === 'error' && /negative/.test(mr[8].problems.join()), `a negative minimum order: “${short(mr[8]?.problems?.[0])}”`);
    ok(mr[11]?.status === 'new' && /isn't one of the standard units/.test(mr[11].warnings.join()), 'an unknown unit (bag) goes in, with a warning');
    ok(mp.body.counts?.new === 4 && mp.body.counts?.problems === 4 && mp.body.counts?.skipped === 1,
      `counts: ${mp.body.counts?.new} new, ${mp.body.counts?.problems} problems, ${mp.body.counts?.skipped} example skipped (blank rows never reach it)`);
    ok(Array.isArray(mp.body.problems) && mp.body.problems.length === 4 && mp.body.problems.every((p) => p.row && p.message),
      `the problem list names a row and a reason for each (${mp.body.problems?.map((p) => p.row).join(', ')})`);
    const nothingYet = await q1('SELECT COUNT(*)::int AS n FROM raw_materials WHERE owner_id = $1', [orgA]);
    ok(nothingYet[0].n === 0, 'the preview saved nothing');
    const mc = await commit(A, 'materials', { file: matSheet, name: 'materials.csv' });
    ok(mc.status === 200 && mc.body.created === 4 && mc.body.leftOut === 4, `import adds the 4 good rows and leaves out the 4 bad (${mc.status} ${JSON.stringify(mc.body)})`);
    const ang = (await q1(`SELECT * FROM raw_materials WHERE owner_id = $1 AND material_code = 'RM-ANG'`, [orgA]))[0];
    ok(ang && ang.unit === 'kg' && ang.base_uom === 'kg' && Number(ang.standard_rate) === 62.5 && Number(ang.moq) === 500 && ang.lead_time_days === 7 && ang.grade === 'IS 2062',
      `RM-ANG saved with unit, stock unit, rate, minimum order, lead time and grade (${ang?.unit}/${ang?.base_uom}, ₹${ang?.standard_rate}, moq ${ang?.moq}, ${ang?.lead_time_days} d)`);
    const bag = (await q1(`SELECT unit, base_uom FROM raw_materials WHERE owner_id = $1 AND material_code = 'RM-BAG'`, [orgA]))[0];
    ok(bag && bag.unit === 'bag' && bag.base_uom === null, `the unknown unit is kept as written (unit ${bag?.unit}, stock unit ${bag?.base_uom})`);
    const mc2 = await commit(A, 'materials', { file: matSheet, name: 'materials.csv' });
    ok(mc2.status === 200 && mc2.body.created === 0 && mc2.body.updated === 0 && mc2.body.unchanged === 4, `the same file again changes nothing (${JSON.stringify(mc2.body)})`);

    /* ── 3 ─────────────────────────────────────────────── */
    section('products, from a workbook with a title above the table');
    const prodFile = await xlsx([{ name: 'Price list', rows: [
      ['Product list'], ['As on 28 Nov 2026'],
      ['SKU', 'Item Name', 'Unit', 'Selling Price', 'HSN/SAC', 'Specification'],
      ['FG-ARM', 'Cross arm V type', 'nos', 850, 7308, 'Galvanised'],
      ['FG-TRAY', 'Cable tray 300', 'm', '1,200.50', '73.08', ''],
      ['', 'Clamp plain', 'nos', 45, '12AB', ''],
      ['FG-ARM', 'Again', 'nos', 1, '', ''],
      ['FG-X', '', 'nos', 5, '', ''],
      ['', '', '', 99, '', ''],
      ['FG-UNIT', 'Wire bundle', 'bundle', 10, '', ''],
      ['FG-NOUNIT', 'No unit product', '', 10, '', ''],
    ] }]);
    const pp = await plan(A, 'products', { file: prodFile, name: 'price-list.xlsx' });
    const pm = pp.body.mapping || {};
    ok(pp.status === 200 && pp.body.file?.headerRow === 3, `the headings are found on row 3, under the title (${pp.body.file?.headerRow})`);
    ok(pm.code === 0 && pm.name === 1 && pm.unit === 2 && pm.price === 3 && pm.hsn === 4 && pm.description === 5, `SKU, Item Name, Selling Price, HSN/SAC, Specification recognised (${JSON.stringify(pm)})`);
    const pr = byRow(pp.body);
    ok(pr[5]?.values?.price === 1200.5 && pr[5]?.values?.hsn === '7308', `“1,200.50” → 1200.5 and HSN “73.08” → 7308 (${pr[5]?.values?.price}, ${pr[5]?.values?.hsn})`);
    ok(pr[6]?.status === 'new' && !pr[6].values.hsn && /4 to 8 digits/.test(pr[6].warnings.join()), 'a bad HSN is left out with a warning, the product still goes in');
    ok(pr[7]?.status === 'error' && /Same code as row 4/.test(pr[7].problems.join()), `a repeated code: “${short(pr[7]?.problems?.[0])}”`);
    ok(pr[8]?.status === 'error' && /needs a name/.test(pr[8].problems.join()), `a new code with no name: “${short(pr[8]?.problems?.[0])}”`);
    ok(pr[9]?.status === 'error' && /No product name or code/.test(pr[9].problems.join()), `a row with only a price: “${short(pr[9]?.problems?.[0])}”`);
    ok(pr[11]?.status === 'new' && pr[11].values.unit === 'nos' && /saved as nos/.test(pr[11].warnings.join()), 'no unit → nos, and it says so');
    const pc = await commit(A, 'products', { file: prodFile, name: 'price-list.xlsx' });
    ok(pc.status === 200 && pc.body.created === 5 && pc.body.leftOut === 3, `import adds 5 and leaves out 3 (${JSON.stringify(pc.body)})`);
    const tray = (await q1(`SELECT * FROM skus WHERE owner_id = $1 AND sku_code = 'FG-TRAY'`, [orgA]))[0];
    ok(tray && Number(tray.price) === 1200.5 && tray.hsn === '7308' && tray.unit === 'm', `FG-TRAY saved (₹${tray?.price}, HSN ${tray?.hsn}, ${tray?.unit})`);
    const pc2 = await commit(A, 'products', { file: prodFile, name: 'price-list.xlsx' });
    ok(pc2.body.created === 0 && pc2.body.updated === 0, `the same workbook again adds nothing (${JSON.stringify(pc2.body)})`);

    section('a second sheet updates what changed — or leaves it alone');
    const upd = csv([
      ['Product code', 'Product name', 'Price'],
      ['FG-ARM', 'Cross arm V type', '900'],
      ['FG-CLAMP', 'Clamp plain', '45'],
      ['FG-TRAY', 'Cable tray 300', '1200.5'],
    ]);
    const up = await plan(A, 'products', { file: upd, name: 'update.csv' });
    const ur = byRow(up.body);
    const priceChange = ur[2]?.changes?.find((c) => c.field === 'price');
    ok(ur[2]?.status === 'update' && priceChange?.from === 850 && priceChange?.to === 900, `FG-ARM: price 850 → 900 shown before saving (${JSON.stringify(priceChange)})`);
    ok(ur[3]?.status === 'update' && ur[3].changes.some((c) => c.field === 'code' && c.from === null && c.to === 'FG-CLAMP'),
      'the clamp typed in without a code is found by its name and given the code');
    ok(ur[4]?.status === 'unchanged', `FG-TRAY with the same values is unchanged (${ur[4]?.status})`);
    const keep = await commit(A, 'products', { file: upd, name: 'update.csv', fields: { existing: 'skip' } });
    const armAfterKeep = (await q1(`SELECT price FROM skus WHERE owner_id = $1 AND sku_code = 'FG-ARM'`, [orgA]))[0];
    ok(keep.body.updated === 0 && keep.body.keptAsIs === 2 && Number(armAfterKeep.price) === 850, `“leave existing as they are” changes nothing (${JSON.stringify(keep.body)}, price ${armAfterKeep.price})`);
    const apply = await commit(A, 'products', { file: upd, name: 'update.csv' });
    const armAfter = (await q1(`SELECT price FROM skus WHERE owner_id = $1 AND sku_code = 'FG-ARM'`, [orgA]))[0];
    const clamp = (await q1(`SELECT sku_code FROM skus WHERE owner_id = $1 AND name = 'Clamp plain'`, [orgA]))[0];
    ok(apply.body.updated === 2 && Number(armAfter.price) === 900 && clamp?.sku_code === 'FG-CLAMP', `update applies both (${JSON.stringify(apply.body)}; price ${armAfter.price}, clamp code ${clamp?.sku_code})`);

    section('when a sheet is unclear');
    await call(A, 'POST', '/skus', { name: 'Twin product', unit: 'nos' });
    await call(A, 'POST', '/skus', { name: 'Twin product', unit: 'nos' });
    const twin = await plan(A, 'products', { file: csv([['Product name', 'Price'], ['Twin product', '5']]), name: 'twin.csv' });
    ok(byRow(twin.body)[2]?.status === 'error' && /2 products are already named/.test(byRow(twin.body)[2].problems.join()), `two products with that name — asks for the code: “${short(byRow(twin.body)[2]?.problems?.[0])}”`);
    const odd = csv([['Code', 'Title', 'Cost'], ['FG-NEW', 'New thing', '10']]);
    const oddPlan = await plan(A, 'products', { file: odd, name: 'odd.csv' });
    ok(byRow(oddPlan.body)[2]?.status === 'error', 'a “Title” column isn’t guessed as the name, so the row has no name');
    const remapped = await plan(A, 'products', { file: odd, name: 'odd.csv', fields: { mapping: { code: 0, name: 1, price: 2 } } });
    ok(byRow(remapped.body)[2]?.status === 'new' && byRow(remapped.body)[2].values.price === 10, 'choosing the columns by hand fixes it');
    const unknownHeads = await plan(A, 'products', { file: csv([['Colour', 'Weight'], ['red', '5']]), name: 'x.csv' });
    ok(unknownHeads.status === 200 && unknownHeads.body.headers?.join() === 'Colour,Weight' && unknownHeads.body.missing?.includes('name'),
      `headings it doesn't recognise are still offered, to choose by hand (${unknownHeads.status}, missing ${JSON.stringify(unknownHeads.body.missing)})`);
    const noHead = await plan(A, 'products', { file: csv([['5', '10'], ['6', '11']]), name: 'x.csv' });
    ok(noHead.status === 400 && /No column headings/.test(noHead.body.error || ''), `a sheet that starts with numbers is refused, saying what it needs (${noHead.status})`);
    const namesOnly = await plan(A, 'products', { file: csv([['Product name'], ['Hinge'], ['Latch']]), name: 'names.csv' });
    ok(namesOnly.status === 200 && namesOnly.body.counts?.new === 2, `a plain list of product names is a sheet too (${namesOnly.status}, ${namesOnly.body.counts?.new} new)`);
    const missing = await plan(A, 'products', { file: csv([['Unit', 'Price'], ['nos', '5']]), name: 'x.csv' });
    ok(missing.status === 200 && missing.body.missing?.includes('name'), `headings without a name or code column say which is missing (${JSON.stringify(missing.body.missing)})`);
    const missingCommit = await commit(A, 'products', { file: csv([['Unit', 'Price'], ['nos', '5']]), name: 'x.csv' });
    ok(missingCommit.status === 400, `and importing it is refused (${missingCommit.status} ${short(missingCommit.body.error)})`);
    const oldXls = await plan(A, 'products', { file: Buffer.from('not really excel'), name: 'old.xls' });
    ok(oldXls.status === 400 && /\.xls/.test(oldXls.body.error || ''), `an old .xls file is explained, not crashed on (${oldXls.status})`);

    /* ── 4 ─────────────────────────────────────────────── */
    section('recipes');
    const tr = await template(A, 'recipes');
    const trw = await workbook(tr.buf);
    const yourProducts = trw.getWorksheet('Your products');
    const listed = []; yourProducts?.eachRow((r, n) => { if (n > 1) listed.push(String(r.getCell(1).value || '')); });
    ok(tr.status === 200 && trw.worksheets[0].name === 'Recipes' && listed.includes('FG-ARM') && !!trw.getWorksheet('Your raw materials'),
      `recipes template: “Recipes” first, then your products (${listed.filter(Boolean).length} codes) and raw materials to copy from`);
    const recSheet = csv([
      ['Product code', 'Product name', 'Material code', 'Material name', 'Qty per unit', 'Unit'],
      ['FG-ARM', '', 'RM-ANG', '', '4.2', 'kg'],
      ['FG-ARM', '', 'RM-BLT', '', '4', 'nos'],
      ['FG-ARM', '', 'RM-PNT', '', '0.05', 'ltr'],
      ['', 'Clamp plain', '', 'MS angle 50x50x6', '800', 'g'],
      ['', 'Clamp plain', 'RM-BLT', '', '1', 'kg'],
      ['FG-TRAY', '', 'RM-ANG', '', '1.1', 'kg'],
      ['FG-TRAY', '', 'RM-NOPE', '', '1', 'kg'],
      ['FG-GHOST', '', 'RM-ANG', '', '1', 'kg'],
      ['FG-UNIT', '', 'RM-BLT', '', '1', 'nos'],
      ['FG-UNIT', '', 'RM-BLT', '', '2', 'nos'],
      ['FG-NOUNIT', '', 'RM-ANG', '', '0', 'kg'],
      ['EXAMPLE-1', 'Example', 'EXAMPLE-RM1', 'Example', '1', 'kg'],
    ]);
    const rp = await plan(A, 'recipes', { file: recSheet, name: 'recipes.csv' });
    const g = Object.fromEntries((rp.body.groups || []).map((x) => [x.code || x.name, x]));
    ok(rp.status === 200 && rp.body.counts?.products === 6 && rp.body.counts?.new === 2 && rp.body.counts?.problems === 4 && rp.body.counts?.skipped === 1,
      `6 products: 2 recipes ready, 4 left out, the example skipped (${JSON.stringify(rp.body.counts)})`);
    ok(g['FG-ARM']?.status === 'new' && g['FG-ARM'].lines.length === 3 && g['FG-ARM'].lines.every((l) => l.materialId), 'FG-ARM: three lines, each linked to its raw material by code');
    const clampG = g['FG-CLAMP'];
    ok(clampG?.status === 'new' && clampG.lines[0].materialId && !clampG.lines[0].warnings.length,
      'the clamp, by product name and material name — 800 g of a kg material converts without a warning');
    ok(/can't be converted/.test(clampG?.lines?.[1]?.warnings?.join() || ''), `a bolt (held in nos) given in kg is flagged — readiness couldn't count it: “${short(clampG?.lines?.[1]?.warnings?.[0])}”`);
    ok(g['FG-TRAY']?.status === 'error' && /No raw material has the code RM-NOPE/.test(g['FG-TRAY'].lines[1].problems.join()) && /Left out/.test(g['FG-TRAY'].problems.join()),
      'FG-TRAY: one unknown material leaves the whole recipe out — the good line too');
    ok(g['FG-GHOST']?.status === 'error' && /No product has the code FG-GHOST/.test(g['FG-GHOST'].lines[0].problems.join()), 'an unknown product is named');
    ok(g['FG-UNIT']?.status === 'error' && /already on row 10/.test(g['FG-UNIT'].lines[1].problems.join()), `the same material twice for one product: “${short(g['FG-UNIT']?.lines?.[1]?.problems?.[0])}”`);
    ok(g['FG-NOUNIT']?.status === 'error' && /more than zero/.test(g['FG-NOUNIT'].lines[0].problems.join()), 'a quantity of zero is refused');
    ok(rp.body.problems?.map((p) => p.row).sort((a, b) => a - b).join(',') === '8,9,11,12', `problem list: rows ${rp.body.problems?.map((p) => p.row).join(', ')}`);
    const rc = await commit(A, 'recipes', { file: recSheet, name: 'recipes.csv' });
    ok(rc.status === 200 && rc.body.created === 2 && rc.body.lines === 5 && rc.body.leftOut === 4, `saves 2 recipes, 5 lines, leaves 4 out (${JSON.stringify(rc.body)})`);
    const armId = (await q1(`SELECT id FROM skus WHERE owner_id = $1 AND sku_code = 'FG-ARM'`, [orgA]))[0].id;
    const trayId = tray.id;
    const armBom = await call(A, 'GET', `/skus/${armId}/bom`);
    const armLines = Array.isArray(armBom.body) ? armBom.body : (armBom.body.lines || armBom.body.items || []);
    ok(armBom.status === 200 && armLines.length === 3, `the Recipe button on FG-ARM now shows 3 lines (${armLines.length})`);
    const trayBom = await call(A, 'GET', `/skus/${trayId}/bom`);
    const trayLines = Array.isArray(trayBom.body) ? trayBom.body : (trayBom.body.lines || trayBom.body.items || []);
    ok(trayLines.length === 0, 'FG-TRAY, left out, has no recipe');
    const again = await plan(A, 'recipes', { file: recSheet, name: 'recipes.csv' });
    ok(again.body.counts?.unchanged === 2 && again.body.counts?.new === 0, `the same sheet again: both recipes unchanged (${JSON.stringify(again.body.counts)})`);
    const replaceSheet = csv([
      ['Product code', 'Material code', 'Qty per unit', 'Unit'],
      ['FG-ARM', 'RM-ANG', '4.5', 'kg'],
      ['FG-ARM', 'RM-BLT', '4', 'nos'],
    ]);
    const repl = await plan(A, 'recipes', { file: replaceSheet, name: 'arm.csv' });
    const armG = repl.body.groups?.[0];
    ok(armG?.status === 'replace' && armG.current.length === 3 && armG.lines.length === 2, `a changed recipe shows “replaces” with the 3 current lines beside the 2 new (${armG?.status})`);
    const replC = await commit(A, 'recipes', { file: replaceSheet, name: 'arm.csv' });
    const armRows = await q1('SELECT qty_per_unit FROM sku_bom WHERE sku_id = $1 ORDER BY qty_per_unit', [armId]);
    const clampId = (await q1(`SELECT id FROM skus WHERE owner_id = $1 AND sku_code = 'FG-CLAMP'`, [orgA]))[0].id;
    const clampRows = await q1('SELECT COUNT(*)::int AS n FROM sku_bom WHERE sku_id = $1', [clampId]);
    ok(replC.body.replaced === 1 && armRows.length === 2 && Number(armRows[1].qty_per_unit) === 4.5 && clampRows[0].n === 2,
      `FG-ARM replaced (${armRows.map((r) => Number(r.qty_per_unit)).join(', ')}); the clamp, not in the sheet, keeps its 2 lines`);

    /* ── 5 ─────────────────────────────────────────────── */
    section('end to end: imported recipe + uploaded stock → readiness');
    const stockSheet = csv([['Item code', 'Item name', 'Quantity', 'Unit'], ['RM-ANG', 'MS angle 50x50x6', '90', 'kg'], ['RM-BLT', 'Hex bolt M12', '100', 'nos']]);
    const sp = await send(A, '/inventory/import/plan', { file: stockSheet, name: 'stock.csv' });
    const linked = (sp.body.items || []).filter((i) => i.link?.kind === 'material').length;
    const sc = await send(A, '/inventory/import/commit', { file: stockSheet, name: 'stock.csv', fields: { uploadId: `ii-test-${stamp}-1`, mode: 'set', newItemsAs: 'material' } });
    ok([200, 201].includes(sc.status) && linked === 2, `stock upload links both rows to the imported materials by code (${linked} linked, ${sc.status})`);
    const cust = (await call(A, 'POST', '/customers', { name: `Readiness Test ${stamp}`, state: 'Telangana' })).body;
    const order = await call(A, 'POST', '/customer-orders', { customerId: cust.id, items: [{ skuId: armId, quantity: 30, unit: 'nos', rate: 900 }] });
    const ready = await call(A, 'GET', `/customer-orders/${order.body.id}/readiness`);
    ok(ready.status === 200 && ready.body.buildable === 20 && ready.body.ordered === 30 && /MS angle/.test(ready.body.blocking || ''),
      `“${ready.body.summary}” — 90 kg ÷ 4.5 kg = 20, the angle named as the blocker`);
    const unitChange = await plan(A, 'materials', { file: csv([['Material code', 'Material name', 'Unit'], ['RM-ANG', 'MS angle 50x50x6', 'nos']]), name: 'u.csv' });
    ok(byRow(unitChange.body)[2]?.status === 'error' && /Held in stock in kg/.test(byRow(unitChange.body)[2].problems.join()),
      `a material held in stock keeps its unit: “${short(byRow(unitChange.body)[2]?.problems?.[0])}”`);

    /* ── 6 ─────────────────────────────────────────────── */
    section('another company, permissions, two imports at once');
    const bRec = await plan(B, 'recipes', { file: csv([['Product code', 'Material code', 'Qty per unit'], ['FG-ARM', 'RM-ANG', '1']]), name: 'b.csv' });
    ok(bRec.body.groups?.[0]?.status === 'error' && /No product has the code FG-ARM/.test(bRec.body.groups[0].lines[0].problems.join()),
      'company B can’t reach company A’s product codes');
    const bProd = await plan(B, 'products', { file: csv([['Product code', 'Product name'], ['FG-ARM', 'Cross arm V type']]), name: 'b.csv' });
    ok(byRow(bProd.body)[2]?.status === 'new', 'for B, A’s code is a new product of its own — not an update to A’s');
    const bTpl = await workbook((await template(B, 'recipes')).buf);
    ok(bTpl.getWorksheet('Your products').rowCount === 1, 'B’s recipes template lists none of A’s products');
    const sales = await member(A, 'sales', 'Sales');
    const salesTpl = await template(sales, 'products');
    const salesPlan = await plan(sales, 'products', { file: csv([['Product name'], ['X']]), name: 's.csv' });
    ok(salesTpl.status === 200 && salesPlan.status === 403, `Sales (reads products, can't edit them) may download the template but not import (${salesTpl.status}, ${salesPlan.status})`);
    const race = csv([['Product code', 'Product name'], ['FG-C1', 'Race one'], ['FG-C2', 'Race two'], ['FG-C3', 'Race three']]);
    const [x, y] = await Promise.all([commit(A, 'products', { file: race, name: 'race.csv' }), commit(A, 'products', { file: race, name: 'race.csv' })]);
    const raced = await q1(`SELECT COUNT(*)::int AS n FROM skus WHERE owner_id = $1 AND sku_code IN ('FG-C1', 'FG-C2', 'FG-C3')`, [orgA]);
    ok((x.body.created || 0) + (y.body.created || 0) === 3 && raced[0].n === 3, `two imports at once add each product once (${x.body.created} + ${y.body.created}, ${raced[0].n} on file)`);
    const acts = await q1(`SELECT type, description FROM activities WHERE owner_id = $1 AND type IN ('ITEMS_IMPORTED', 'RECIPES_IMPORTED') ORDER BY id`, [orgA]);
    ok(acts.length >= 4 && acts.some((a) => /Recipes imported from recipes\.csv: 2 new/.test(a.description)), `each import is in the activity feed (${acts.length}: “${short(acts.find((a) => a.type === 'RECIPES_IMPORTED')?.description)}”)`);
  } catch (e) {
    fail++; console.log(`   ❌ crashed: ${e.stack || e.message}`);
  } finally {
    const removed = await cleanup().catch((e) => { console.log('   cleanup failed:', e.message); return 0; });
    console.log(`\n   ✅ test accounts removed (${removed})`);
    console.log(`\n  ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
})();
