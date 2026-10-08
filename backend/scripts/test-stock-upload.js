#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   Stock from a spreadsheet, stock lists — and every flow that reads stock.

   1. A sheet in the business's own columns is understood: headings found
      below a title, labels matched, units and Indian numbers read, totals
      and blank rows ignored, bad rows explained.
   2. Items are recognised by code first, then name, and linked to the
      material or product they are — never across a unit mismatch.
   3. Uploading applies through the ledger; the same upload twice is refused.
   4. A re-upload recounts (set) or tops up (add) what is held, or goes into
      a separate stock list without touching the main stock.
   5. The connected flows still hold: shortfalls count every list; goods
      receipts land on the main stock; a dispatch takes stock from the list
      that holds it, and a reversal puts it back there; the ledger reconciles.
   6. Another company sees and changes none of it.

   Runs against a local backend (SCHEDULER=off) with throwaway accounts it
   deletes again. Refuses to run against a deployed host.
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
const db = () => new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const q1 = async (sql, params) => { const c = db(); await c.connect(); try { return (await c.query(sql, params)).rows; } finally { await c.end(); } };

async function cleanup() {
  const c = db(); await c.connect();
  try {
    const { rows } = await c.query(`SELECT id, org_id FROM users WHERE email LIKE 'su-%@example.test'`);
    const ids = [...new Set(rows.flatMap((r) => [r.id, r.org_id]).filter(Boolean))];
    if (!ids.length) return 0;
    for (let i = 0; i < 4; i++) { const r = await purgeOrg(c, ids); if (!r.deleted) break; }
    await c.query('DELETE FROM document_sequences WHERE owner_id = ANY($1)', [ids]).catch(() => {});
    await c.query('DELETE FROM notifications WHERE user_id = ANY($1)', [rows.map((r) => r.id)]).catch(() => {});
    const members = (await c.query(`DELETE FROM users WHERE email LIKE 'su-%@example.test' AND id <> org_id`)).rowCount;
    return members + (await c.query(`DELETE FROM users WHERE email LIKE 'su-%@example.test'`)).rowCount;
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
  body: JSON.stringify({ name: `SU ${tag}`, email: `su-${tag}-${stamp}@example.test`, password: PASS }),
})).json();
const member = async (owner, tag, role) => {
  const email = `su-${tag}-${stamp}@example.test`;
  const made = await call(owner, 'POST', '/admin/users', { name: `${role} person`, email, password: PASS, role });
  if (![200, 201].includes(made.status)) throw new Error(`could not add a ${role}: ${made.status} ${made.body.error || ''}`);
  return (await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASS }) })).json();
};

/* The upload calls, multipart like the browser sends them. */
const sheetCall = async (who, path, { file, name = 'stock.csv', fields = {} }) => {
  const fd = new FormData();
  if (file != null) fd.append('file', new Blob([file]), name);
  Object.entries(fields).forEach(([k, v]) => fd.append(k, typeof v === 'string' ? v : JSON.stringify(v)));
  const r = await fetch(`${API}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${who.token}` }, body: fd });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const plan = (who, opts) => sheetCall(who, '/inventory/import/plan', opts);
let refN = 0;
const commit = (who, opts) => sheetCall(who, '/inventory/import/commit', {
  ...opts, fields: { uploadId: `test-${stamp}-${++refN}`, ...opts.fields },
});
const byName = (items, n) => items.find((i) => i.itemName === n);
const held = async (who, qs = '') => {
  const r = await call(who, 'GET', `/inventory${qs}`);
  return Array.isArray(r.body) ? r.body : r.body.items || [];
};

(async () => {
  const swept = await cleanup();
  if (swept) console.log(`   (swept ${swept} account(s) left by an earlier failed run)`);
  try {
    const A = await register('a');
    const B = await register('b');
    if (!A.token || !B.token) throw new Error('could not register test accounts');

    /* The item master A already keeps. */
    const plate = (await call(A, 'POST', '/raw-materials', { material_code: `MS-10-${stamp}`, name: `MS Plate 10mm ${stamp}`, unit: 'kg', base_uom: 'kg' })).body;
    const bracket = (await call(A, 'POST', '/skus', { sku_code: `BR-${stamp}`, name: `SS Bracket ${stamp}`, unit: 'nos', price: 2320 })).body;
    const bMat = (await call(B, 'POST', '/raw-materials', { material_code: `B-${stamp}`, name: `B steel ${stamp}`, unit: 'kg', base_uom: 'kg' })).body;

    /* ── 1. reading a sheet ───────────────────────────────────────── */
    console.log('\n  ── 1. a sheet in the business\'s own columns');
    const sheet1 = [
      'Precision Fab Works',
      'Stock as on 8 Oct 2026',
      '',
      'Item Code,Item Name,HSN Code,Closing Qty,UOM,Rate (₹),Reorder Level,Category',
      `MS-10-${stamp},Plate (coded),7208,"1,200",Kgs,62.5,300,Steel`,
      `,Hex bolt M12 x 50 ${stamp},7318,450,pcs,8,100,Fasteners`,
      `BR-${stamp},,,30,Nos,,,`,
      `,Washer ${stamp},,abc,nos,,,`,
      `,Gasket ${stamp},,(5),nos,,,`,
      ',Total,,1680,,,,',
    ].join('\r\n');
    const p1 = await plan(A, { file: sheet1 });
    const m = p1.body.mapping || {};
    const h = (f) => p1.body.headers?.[m[f]];
    ok(p1.status === 200 && p1.body.file?.headerRow === 4, `the headings are found under the title, on row ${p1.body.file?.headerRow}`);
    ok(h('code') === 'Item Code' && h('itemName') === 'Item Name' && h('quantity') === 'Closing Qty' && h('uom') === 'UOM'
      && h('unitCost') === 'Rate (₹)' && h('minStockLevel') === 'Reorder Level' && h('category') === 'Category',
    `each column is recognised by its label (${['code', 'itemName', 'quantity', 'uom', 'unitCost'].map(h).join(' / ')})`);
    ok(h('hsn') === 'HSN Code' && h('code') === 'Item Code', '“HSN Code” is not taken for the item code');
    const it1 = p1.body.items || [];
    const plateRow = it1.find((i) => i.code === `MS-10-${stamp}`);
    ok(plateRow?.status === 'new' && plateRow.quantity === 1200 && plateRow.uom === 'kg' && plateRow.link?.kind === 'material' && plateRow.link.id === plate.id,
      `“1,200 Kgs” by code → linked to the material, 1200 kg (${JSON.stringify([plateRow?.quantity, plateRow?.uom, plateRow?.link?.kind])})`);
    const bolt = byName(it1, `Hex bolt M12 x 50 ${stamp}`);
    ok(bolt?.status === 'new' && bolt.uom === 'nos' && !bolt.link, `“pcs” is read as nos; an item not in the master is new and unlinked (${bolt?.uom})`);
    const brRow = it1.find((i) => i.code === `BR-${stamp}`);
    ok(brRow?.status === 'new' && brRow.link?.kind === 'product' && brRow.itemName === `SS Bracket ${stamp}`,
      `a row with only a product code takes the product's name (${brRow?.itemName})`);
    const washer = byName(it1, `Washer ${stamp}`);
    const gasket = byName(it1, `Gasket ${stamp}`);
    ok(washer?.status === 'error' && /not a number/.test(washer.problems.join()), `a quantity of “abc” is a problem, said so: ${washer?.problems?.[0]}`);
    ok(gasket?.status === 'error' && /negative/.test(gasket.problems.join()), `“(5)” is read as negative and refused: ${gasket?.problems?.[0]}`);
    ok(p1.body.counts?.skipped >= 1 && !it1.some((i) => /^total$/i.test(i.itemName)), 'the Total row is ignored, not imported as an item');
    ok(p1.body.counts?.new === 3 && p1.body.counts?.problems === 2 && p1.body.counts?.unlinked === 1,
      `counts: ${JSON.stringify(p1.body.counts)}`);

    const wrongUnit = await plan(A, { file: `Item,Qty,Unit\r\nMS Plate 10mm ${stamp},40,nos\r\n` });
    ok(wrongUnit.body.items?.[0]?.status === 'error' && /measured in kg/.test(wrongUnit.body.items[0].problems.join()),
      `a kg material counted in nos is refused, not added as kilos: ${wrongUnit.body.items?.[0]?.problems?.[0]}`);
    const xls = await plan(A, { file: 'xx', name: 'old.xls' });
    ok(xls.status === 400 && /\.xlsx/.test(xls.body.error || ''), `an old .xls is refused with what to do (${xls.status})`);
    const noHead = await plan(A, { file: '1,2,3\r\n4,5,6\r\n' });
    ok(noHead.status === 400 && /heading/i.test(noHead.body.error || ''), 'a sheet with no headings says so');
    const missingQty = await plan(A, { file: 'Item,Code\r\nBolt,B1\r\n' });
    ok(missingQty.status === 200 && missingQty.body.missing?.includes('quantity'), 'a sheet with no quantity column asks which column it is');
    const remap = await plan(A, { file: 'Item,Count on shelf\r\nBolt,7\r\n', fields: { mapping: { itemName: 0, quantity: 1 } } });
    ok(remap.body.items?.[0]?.quantity === 7, 'a column the guess missed can be chosen by hand');
    const twice = await plan(A, { file: 'Item,Qty\r\nBolt,7\r\n', fields: { mapping: { itemName: 0, quantity: 0 } } });
    ok(twice.status === 400 && /used once/.test(twice.body.error || ''), 'one column cannot be two fields');

    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Closing stock');
    ws.addRow(['Stock summary']); ws.addRow([]);
    ws.addRow(['Material Code', 'Material Description', 'Closing Stock', 'Unit', 'Valuation Rate']);
    ws.addRow([`RM-1-${stamp}`, `MS Pipe 25 NB ${stamp}`, 36, 'mtr', 145]);
    ws.addRow([`RM-2-${stamp}`, `Primer ${stamp}`, { formula: '2*5', result: 10 }, 'Ltrs', 310]);
    const xlsx = await plan(A, { file: Buffer.from(await wb.xlsx.writeBuffer()), name: 'stock.xlsx' });
    ok(xlsx.status === 200 && xlsx.body.items?.length === 2 && xlsx.body.items[1].quantity === 10 && xlsx.body.items[0].uom === 'm' && xlsx.body.items[1].uom === 'ltr',
      `an .xlsx with a title row and a formula reads (${JSON.stringify(xlsx.body.items?.map((i) => [i.quantity, i.uom]))})`);
    const tally = await plan(A, { file: `Particulars,Closing Balance,,\r\n,Quantity,Rate,Value\r\nCopper wire ${stamp},12 Kgs,,"9,600.00"\r\nGrand Total,,,"9,600.00"\r\n` });
    ok(tally.body.items?.length === 1 && tally.body.items[0].quantity === 12 && tally.body.items[0].unitCost === 800,
      `a Tally two-row heading reads, and the rate comes from value ÷ quantity (${tally.body.items?.[0]?.unitCost})`);

    /* ── 2. saving it ─────────────────────────────────────────────── */
    console.log('\n  ── 2. saving the sheet, through the ledger');
    const c1 = await commit(A, { file: sheet1, fields: { newItemsAs: 'material' } });
    ok(c1.status === 201 && c1.body.created === 3 && c1.body.mastersCreated === 1 && c1.body.problems === 2,
      `3 saved, the new bolt added to raw materials, 2 rows left out (${JSON.stringify([c1.status, c1.body.created, c1.body.mastersCreated, c1.body.problems, c1.body.error])})`);
    let rowsA = await held(A);
    const plateInv = rowsA.find((r) => r.raw_material_id === plate.id);
    const boltInv = rowsA.find((r) => r.itemName === `Hex bolt M12 x 50 ${stamp}`);
    const brInv = rowsA.find((r) => r.sku_id === bracket.id);
    ok(Number(plateInv?.quantity) === 1200 && Number(plateInv?.unit_cost) === 62.5 && Number(plateInv?.min_stock_level) === 300 && plateInv?.item_code === `MS-10-${stamp}`,
      'the plate is held: 1200 kg at ₹62.50, reorder at 300, with its code');
    ok(boltInv?.raw_material_id && brInv?.item_type === 'finished', 'the bolt is linked to its new material; the bracket is a finished good');
    const [mv] = await q1(`SELECT COUNT(*)::int n, MIN(ref_type) rt, MIN(movement_type) mt FROM stock_movements WHERE inventory_id = ANY($1)`, [[plateInv.id, boltInv.id, brInv.id]]);
    ok(mv.n === 3 && mv.rt === 'stock_upload' && mv.mt === 'opening', 'each quantity is an opening entry in the ledger, pointing at the upload');
    const again = await sheetCall(A, '/inventory/import/commit', { file: sheet1, fields: { uploadId: `test-${stamp}-1`, newItemsAs: 'material' } });
    const [{ n: plateRows }] = await q1('SELECT COUNT(*)::int n FROM inventory WHERE raw_material_id = $1', [plate.id]);
    ok(again.status === 409 && plateRows === 1, `the same upload sent twice is refused, nothing doubled (${again.status})`);

    /* ── 3. uploading again ──────────────────────────────────────── */
    console.log('\n  ── 3. the next month\'s sheet: recount, top up, or a separate list');
    const sheet2 = `Item Code,Item Name,Qty,Unit\r\nMS-10-${stamp},,1000,kg\r\n,Hex bolt M12 x 50 ${stamp},450,nos\r\n,Spring washer ${stamp},200,nos\r\n`;
    const p2 = await plan(A, { file: sheet2 });
    const c = p2.body.counts || {};
    ok(c.matched === 2 && c.changed === 1 && c.unchanged === 1 && c.new === 1, `it knows what is already held: ${JSON.stringify({ matched: c.matched, changed: c.changed, unchanged: c.unchanged, new: c.new })}`);
    const plateP2 = p2.body.items.find((i) => i.code === `MS-10-${stamp}`);
    ok(plateP2?.current === 1200 && plateP2?.change === -200, `and shows the change: ${plateP2?.current} → ${plateP2?.quantity}`);
    const noMode = await commit(A, { file: sheet2 });
    ok(noMode.status === 400 && noMode.body.needsMode, 'it will not guess: recount or top up must be chosen');
    const setIt = await commit(A, { file: sheet2, fields: { mode: 'set', newItemsAs: 'stock' } });
    rowsA = await held(A, '?stockList=main');
    ok(setIt.status === 201 && setIt.body.updated === 1 && setIt.body.unchanged === 1 && setIt.body.created === 1
      && Number(rowsA.find((r) => r.id === plateInv.id)?.quantity) === 1000,
    `recount: the plate is now 1000; the bolt untouched; the washer added (${JSON.stringify([setIt.body.updated, setIt.body.unchanged, setIt.body.created])})`);
    const [adj] = await q1(`SELECT quantity, note FROM stock_movements WHERE inventory_id = $1 AND movement_type = 'adjustment'`, [plateInv.id]);
    ok(Number(adj?.quantity) === -200 && /counted 1000 \(was 1200\)/.test(adj?.note || ''), `the difference is on the ledger: ${adj?.quantity}, “${adj?.note}”`);
    const washerInv = rowsA.find((r) => r.itemName === `Spring washer ${stamp}`);
    ok(washerInv && !washerInv.raw_material_id, '“stock only” keeps a new item out of the item master, as chosen');
    const addIt = await commit(A, { file: `Item Code,Qty,Unit\r\nMS-10-${stamp},50,kg\r\n`, fields: { mode: 'add' } });
    const [{ quantity: after50 }] = await q1('SELECT quantity FROM inventory WHERE id = $1', [plateInv.id]);
    ok(addIt.status === 201 && Number(after50) === 1050, `top up: 50 kg received → ${after50} ${addIt.body.error || ""}`);

    const site = await commit(A, { file: `Item Code,Qty,Unit\r\nMS-10-${stamp},300,kg\r\n`, fields: { newList: 'Site store' } });
    const siteId = site.body.list?.id;
    const siteRows = await held(A, `?stockList=${siteId}`);
    const mainRows = await held(A, '?stockList=main');
    ok(site.status === 201 && site.body.created === 1 && siteRows.length === 1 && Number(siteRows[0].quantity) === 300 && siteRows[0].raw_material_id === plate.id,
      `a separate list: the site store holds 300 kg of the same material ${site.body.error || ''}`);
    ok(Number(mainRows.find((r) => r.id === plateInv.id)?.quantity) === 1050 && !mainRows.some((r) => r.stock_list_id), 'the main stock is untouched: still 1050');
    const all = await held(A);
    ok(all.find((r) => r.stock_list_id === siteId)?.stock_list_name === 'Site store', 'each row says which list it is in');
    const lists = await call(A, 'GET', '/inventory/lists');
    ok(lists.body.lists?.length === 1 && lists.body.lists[0].items === 1 && lists.body.main?.items >= 4, `the lists: ${JSON.stringify(lists.body.lists?.map((l) => [l.name, l.items]))}, main ${lists.body.main?.items}`);
    const dupList = await call(A, 'POST', '/inventory/lists', { name: ' site STORE ' });
    const mainName = await call(A, 'POST', '/inventory/lists', { name: 'Main stock' });
    ok(dupList.status === 409 && mainName.status === 400, `a second “Site store” (${dupList.status}) and a list called “Main stock” (${mainName.status}) are refused`);
    const delFull = await call(A, 'DELETE', `/inventory/lists/${siteId}`);
    ok(delFull.status === 409, `a list that holds stock cannot be removed (${delFull.status})`);
    const empty = await call(A, 'POST', '/inventory/lists', { name: `Spare ${stamp}` });
    const ren = await call(A, 'PATCH', `/inventory/lists/${empty.body.id}`, { name: `Spare yard ${stamp}` });
    const delEmpty = await call(A, 'DELETE', `/inventory/lists/${empty.body.id}`);
    ok(empty.status === 201 && ren.status === 200 && delEmpty.status === 200, 'an empty list can be renamed and removed');
    const uploads = await call(A, 'GET', '/inventory/uploads');
    ok(uploads.body.length === 4 && uploads.body.some((u) => u.list_name === 'Site store') && uploads.body.every((u) => u.uploaded_by),
      `every upload is on record, with where it went and who did it (${uploads.body.length})`);

    /* ── 4. the flows that read stock ────────────────────────────── */
    console.log('\n  ── 4. the connected flows');
    /* Shortfalls: 1000 brackets × 2 kg = 2000 kg needed; 1050 main + 300 site held. */
    const bom = await call(A, 'PUT', `/skus/${bracket.id}/bom`, { lines: [{ rawMaterialId: plate.id, componentName: `MS Plate 10mm ${stamp}`, qtyPerUnit: 2, uom: 'kg' }] });
    const cust = (await call(A, 'POST', '/customers', { name: `SU customer ${stamp}`, state: 'Telangana' })).body;
    const order = await call(A, 'POST', '/customer-orders', { customerId: cust.id, items: [{ skuId: bracket.id, description: `SS Bracket ${stamp}`, quantity: 1000, unit: 'nos', rate: 2320 }] });
    const reqs = await call(A, "GET", "/material-requirements");
    const plateNeed = (reqs.body.items || []).find((x) => x.raw_material_id === plate.id);
    ok(order.status < 300 && Number(plateNeed?.available) === 1350,
      `shortfalls count every list: ${plateNeed?.available} kg available (1050 main + 300 site) against ${plateNeed?.required ?? plateNeed?.need} needed${plateNeed ? '' : ` — bom ${bom.status}, order ${order.status}, requirements ${reqs.status}`}`);

    /* Goods in land on the main stock, never on a list row with a lower id. */
    const c2 = db(); await c2.connect();
    try {
      const stock = require('../shared/stock');
      await c2.query('BEGIN');
      const inRow = await stock.resolveInventoryRow(c2, { ownerId: A.user.id, rawMaterialId: plate.id, itemName: `MS Plate 10mm ${stamp}` });
      ok(inRow.id === plateInv.id, 'a receipt or production output finds the main-stock row');
      await c2.query('ROLLBACK');
    } finally { await c2.end(); }

    /* A dispatch takes finished goods from the list that holds them. */
    const godown = await commit(A, { file: `Item Name,Qty,Unit\r\nCrate ${stamp},40,nos\r\n`, fields: { newList: `Godown ${stamp}`, newItemsAs: 'product' } });
    const crate = (await held(A, `?stockList=${godown.body.list?.id}`))[0];
    const dc = (await call(A, 'POST', '/delivery-challans', { customerId: cust.id, items: [{ description: `Crate ${stamp}`, quantity: 15, uom: 'nos', rate: 100 }] })).body;
    const sent = await call(A, 'PATCH', `/delivery-challans/${dc.id}/status`, { status: 'Dispatched' });
    const [crateAfter] = await q1('SELECT quantity FROM inventory WHERE id = $1', [crate.id]);
    const [{ n: phantom }] = await q1(`SELECT COUNT(*)::int n FROM inventory WHERE owner_id = $1 AND LOWER("itemName") = LOWER($2) AND stock_list_id IS NULL`, [A.user.id, `Crate ${stamp}`]);
    ok(sent.status === 200 && Number(crateAfter.quantity) === 25 && phantom === 0,
      `dispatching 15 crates takes them from the godown (40 → ${crateAfter.quantity}), with no empty main-stock row driven below zero (${phantom})`);
    await call(A, 'PATCH', `/delivery-challans/${dc.id}/status`, { status: 'Draft' });
    const [crateBack] = await q1('SELECT quantity FROM inventory WHERE id = $1', [crate.id]);
    ok(Number(crateBack.quantity) === 40, `pulled back to Draft, the 15 return to the same list (${crateBack.quantity})`);

    const rec = await call(A, 'GET', '/inventory/reconcile');
    const drift = (rec.body.drifted || []).filter((r) => [plateInv.id, boltInv.id, brInv.id, crate.id, siteRows[0].id].includes(r.id || r.inventory_id));
    ok(rec.status === 200 && drift.length === 0, 'the ledger and the balances still agree for every uploaded row');

    /* ── 5. other companies, other roles ─────────────────────────── */
    console.log('\n  ── 5. another company, and who may upload');
    const bLists = await call(B, 'GET', '/inventory/lists');
    const bInv = await held(B);
    ok(!(bLists.body.lists || []).length && !bInv.some((r) => r.owner_id === A.user.id), 'B sees none of A\'s lists or stock');
    const bIntoA = await plan(B, { file: 'Item,Qty\r\nX,1\r\n', fields: { target: String(siteId) } });
    ok(bIntoA.status === 404, `B cannot upload into A's list (${bIntoA.status})`);
    const bPatch = await call(B, 'PATCH', `/inventory/${plateInv.id}`, { min_stock_level: 1 });
    const bRen = await call(B, 'PATCH', `/inventory/lists/${siteId}`, { name: 'Mine now' });
    const bDel = await call(B, 'DELETE', `/inventory/lists/${siteId}`);
    ok(bPatch.status === 404 && bRen.status === 404 && bDel.status === 404, `B cannot change A's stock or lists (${[bPatch.status, bRen.status, bDel.status].join(', ')})`);
    const aLinkB = await call(A, 'PATCH', `/inventory/${washerInv.id}`, { raw_material_id: bMat.id });
    const aAddB = await call(A, 'POST', '/inventory', { rawMaterialId: bMat.id, quantity: 1 });
    ok(aLinkB.status === 400 && aAddB.status === 400, `A cannot link its stock to B's material (${aLinkB.status}, ${aAddB.status})`);
    const bUnmatched = await call(B, 'GET', '/inventory/unmatched');
    ok(!(bUnmatched.body.items || []).some((r) => r.id === washerInv.id) && !(bUnmatched.body.candidates || []).some((x) => x.id === plate.id),
      'the “link your stock” worklist shows B only B\'s rows and materials');
    const bByCode = await plan(B, { file: `Item Code,Qty,Unit\r\nMS-10-${stamp},5,kg\r\n` });
    ok(bByCode.body.items?.[0]?.status === 'error' && !bByCode.body.items[0].link && /not one of your items/.test(bByCode.body.items[0].problems.join()), 'B\'s sheet with A\'s item code is not linked to A\'s material');
    const SALES = await member(A, 'sales', 'Sales');
    const salesUp = await plan(SALES, { file: 'Item,Qty\r\nX,1\r\n' });
    ok(salesUp.status === 403, `a role without stock write access cannot upload (${salesUp.status})`);
  } catch (e) {
    fail++; console.log(`   ❌ crashed: ${e.stack || e.message}`);
  } finally {
    const removed = await cleanup().catch((e) => { console.log('   cleanup failed:', e.message); return 0; });
    console.log(`\n   ✅ test organisations removed (${removed} account(s))`);
    console.log(`\n  ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
})();
