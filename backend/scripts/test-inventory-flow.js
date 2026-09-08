#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   The whole stock flow, end to end, with the balance checked at each hop.

   Stock can enter and leave five ways. Four of them go through
   shared/stock.js, which writes a stock_movements row and moves the
   balance in the same transaction:

     opening            you record what you already hold
     receipt (GRN)      goods arrive against a purchase order
     production_output  something is made
     dispatch           a delivery challan ships it
     adjustment         a stock take, or damage written off

   The fifth — GRN — does NOT. routes/grn.js writes to the inventory table
   with a raw UPDATE/INSERT and never calls stock.move. Three consequences
   this test is built to expose:

     · no ledger entry, so the item's history does not show the receipt and
       the balance stops being explained by its own movements (`drift`)
     · no owner_id on the INSERT, so after list endpoints became
       owner-scoped, newly received stock is invisible to the person who
       received it
     · the row lookup matches on "projectId" = $2. Stock is company-level
       and 97 of 105 rows have projectId NULL — and in SQL `NULL = NULL` is
       not true, so the lookup always misses and every receipt INSERTS a
       fresh row instead of adding to the balance. That is the six-rows-per
       -item duplication seen on this database.

   Everything created is tagged and removed at the end.
   ══════════════════════════════════════════════════════════════════════ */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../db');

const API = process.env.API_BASE || 'http://localhost:5099';
const EMAIL = process.env.UI_EMAIL, PASSWORD = process.env.UI_PASSWORD;
if (!EMAIL || !PASSWORD) { console.error('set UI_EMAIL and UI_PASSWORD'); process.exit(1); }
if (/^https:|onrender\.com|vercel\.app/.test(API)) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}

const TAG = `FLOW-${Date.now().toString(36).toUpperCase()}`;
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };

let auth;
const call = async (path, opts = {}) => {
  const res = await fetch(`${API}${path}`, {
    ...opts, headers: { 'Content-Type': 'application/json', ...auth, ...(opts.headers || {}) },
  });
  const txt = await res.text();
  let body; try { body = JSON.parse(txt); } catch { body = { raw: txt.slice(0, 140) }; }
  return { status: res.status, ok: res.ok, body };
};

/* The balance, and what the ledger says it should be. They must agree. */
const state = async (invId) => {
  const { rows: [i] } = await db.query('SELECT quantity, owner_id FROM inventory WHERE id = $1', [invId]);
  const { rows: [m] } = await db.query(
    'SELECT COALESCE(SUM(quantity),0) s, COUNT(*) n FROM stock_movements WHERE inventory_id = $1', [invId]);
  return {
    balance: Number(i?.quantity ?? NaN),
    ownerId: i?.owner_id ?? null,
    ledger: Number(m.s),
    entries: Number(m.n),
  };
};

(async () => {
  auth = { Authorization: `Bearer ${await (await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })).json().then(d => d.token)}` };

  const { rows: [me] } = await db.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [EMAIL]);
  const created = { inventory: [], po: [], grn: [], material: [] };

  /* ══ 1. OPENING STOCK ══════════════════════════════════════ */
  console.log('\n  ── 1. opening stock');
  const open = await call('/inventory', {
    method: 'POST',
    body: JSON.stringify({ itemName: `${TAG} Plate 10mm`, quantity: 100, uom: 'nos', unitCost: 250 }),
  });
  ok(open.ok, `opening stock accepted (${open.status})`);
  const invId = open.body.item?.id ?? open.body.id;
  created.inventory.push(invId);

  let s = await state(invId);
  ok(s.balance === 100, `balance is 100 → ${s.balance}`);
  ok(s.ledger === 100, `the ledger explains it → ${s.ledger}`);
  ok(s.ownerId != null, `owner_id is set, so the row is visible to its owner → ${s.ownerId}`);

  /* ══ 2. RECEIPT AGAINST A PURCHASE ORDER ═══════════════════ */
  console.log('\n  ── 2. goods received against a PO');
  const vend = (await call('/vendors?limit=1')).body;
  const vendorId = ((vend.items || vend)[0] || {}).id;

  /* A purchase order still requires a projectId even though stock itself is
     company-level — the contractor lineage again. Any project will do. */
  const projs = (await call('/projects?limit=1')).body;
  const projectId = ((projs.items || projs)[0] || {}).id;

  const po = await call('/po', {
    method: 'POST',
    body: JSON.stringify({
      projectId, vendorId, itemName: `${TAG} Plate 10mm`, quantity: 40, unitPrice: 250,
    }),
  });
  ok(po.ok, `purchase order raised (${po.status})`);
  const poId = po.body.id ?? po.body.po?.id;
  if (poId) created.po.push(poId);

  if (poId) {
    /* A PO must be Approved then Dispatched before anything can be received
       against it. That is right — you cannot receive goods nobody sent —
       and the first version of this test skipped both hops and read the
       resulting 400 as a broken GRN. */
    const appr = await call(`/po/${poId}/approve`, { method: 'PATCH', body: '{}' });
    ok(appr.ok, `purchase order approved (${appr.status})`);
    const disp = await call(`/po/${poId}/dispatch`, { method: 'PATCH', body: '{}' });
    ok(disp.ok, `purchase order dispatched (${disp.status})`);

    /* ── the vendor sends it in three loads ──────────────────
       Before migration 048 this was impossible: the first receipt set the
       order to Delivered and the guard above refused every one after it, so
       the outstanding 25 simply disappeared. */
    const poStatus = async () => (await db.query(
      'SELECT status, received_quantity FROM purchase_orders WHERE id = $1', [poId])).rows[0];

    const load1 = await call('/grn', {
      method: 'POST', body: JSON.stringify({ poId, receivedQuantity: 15, batchNumber: `${TAG}-1` }),
    });
    ok(load1.ok, `first part-load of 15 accepted (${load1.status})` +
      (load1.ok ? '' : ` — ${load1.body.error || ''}`));
    if (load1.body?.grnId) created.grn.push(load1.body.grnId);
    let ps = await poStatus();
    ok(ps.status === 'Partially Received',
      `the order is Partially Received, not closed → ${ps.status}`);
    ok(Number(ps.received_quantity) === 15, `15 of 40 recorded → ${ps.received_quantity}`);

    const load2 = await call('/grn', {
      method: 'POST', body: JSON.stringify({ poId, receivedQuantity: 15, batchNumber: `${TAG}-2` }),
    });
    ok(load2.ok, `SECOND part-load accepted — impossible before 048 (${load2.status})` +
      (load2.ok ? '' : ` — ${load2.body.error || ''}`));
    if (load2.body?.grnId) created.grn.push(load2.body.grnId);
    ps = await poStatus();
    ok(Number(ps.received_quantity) === 30, `30 of 40 now recorded → ${ps.received_quantity}`);
    ok(ps.status === 'Partially Received', `still Partially Received → ${ps.status}`);

    const load3 = await call('/grn', {
      method: 'POST', body: JSON.stringify({ poId, receivedQuantity: 10, batchNumber: `${TAG}-3` }),
    });
    ok(load3.ok, `final load of 10 accepted (${load3.status})`);
    if (load3.body?.grnId) created.grn.push(load3.body.grnId);
    ps = await poStatus();
    ok(ps.status === 'Delivered', `the order closes only when it is full → ${ps.status}`);
    ok(load3.body?.outstanding === 0, `the response says nothing is outstanding → ${load3.body?.outstanding}`);

    /* ── and then refuses more ── */
    const extra = await call('/grn', {
      method: 'POST', body: JSON.stringify({ poId, receivedQuantity: 5, batchNumber: `${TAG}-x` }),
    });
    ok(!extra.ok, `a fourth receipt against a full order is refused (${extra.status})`);

    const grn = load3;   // for the assertions below
    ok(grn.ok, 'the three loads together completed the order');

    /* Did it add to the row we already have, or make a second one? */
    const { rows: sameName } = await db.query(
      'SELECT id, quantity, owner_id FROM inventory WHERE "itemName" = $1 ORDER BY id',
      [`${TAG} Plate 10mm`]);
    sameName.forEach(r => { if (!created.inventory.includes(r.id)) created.inventory.push(r.id); });

    ok(sameName.length === 1,
      `the receipt adds to the existing stock row rather than creating a second (${sameName.length} rows named "${TAG} Plate 10mm")`);

    const receipt = sameName.find(r => r.id === invId) || sameName[0];
    ok(Number(receipt.quantity) === 140 || sameName.reduce((a, r) => a + Number(r.quantity), 0) === 140,
      `100 held + 40 received = 140 → ${sameName.map(r => r.quantity).join(' + ')}`);

    ok(sameName.every(r => r.owner_id != null),
      `every row the receipt touched has an owner_id → ${sameName.map(r => r.owner_id).join(', ')}`);

    s = await state(invId);
    ok(s.ledger === s.balance,
      `the ledger still explains the balance → ledger ${s.ledger} vs balance ${s.balance}`);
    ok(s.entries === 4, `one ledger entry per movement — opening + three loads → ${s.entries}`);
  }

  /* ══ 2b. OVER-RECEIPT ══════════════════════════════════════
     PO 20 on this database holds 1250 against an order for 150 and nothing
     objected. Checked before anything is written, so a refusal leaves no
     GRN row, no status change and no stock. */
  console.log('\n  ── 2b. over-receipt');
  const po2 = await call('/po', {
    method: 'POST',
    body: JSON.stringify({
      projectId, vendorId, itemName: `${TAG} Angle 50mm`, quantity: 40, unitPrice: 100,
    }),
  });
  const po2Id = po2.body.id ?? po2.body.po?.id;
  if (po2Id) {
    created.po.push(po2Id);
    await call(`/po/${po2Id}/approve`,  { method: 'PATCH', body: '{}' });
    await call(`/po/${po2Id}/dispatch`, { method: 'PATCH', body: '{}' });

    const before2 = (await db.query(
      `SELECT COUNT(*) c FROM inventory WHERE "itemName" = $1`, [`${TAG} Angle 50mm`])).rows[0].c;

    const huge = await call('/grn', {
      method: 'POST', body: JSON.stringify({ poId: po2Id, receivedQuantity: 500 }),
    });
    ok(!huge.ok, `500 against an order for 40 is refused (${huge.status})`);
    ok(/more than the order/i.test(huge.body?.error || ''),
      `and says why → ${(huge.body?.error || '').slice(0, 76)}…`);

    const after2 = (await db.query(
      `SELECT COUNT(*) c FROM inventory WHERE "itemName" = $1`, [`${TAG} Angle 50mm`])).rows[0].c;
    ok(after2 === before2, 'the refusal moved no stock');

    const { rows: [g2] } = await db.query('SELECT COUNT(*) c FROM grn WHERE "poId" = $1', [po2Id]);
    ok(Number(g2.c) === 0, 'and wrote no receipt record');

    /* 10% is allowed — steel is rolled to a coil, not to an order. */
    const within = await call('/grn', {
      method: 'POST', body: JSON.stringify({ poId: po2Id, receivedQuantity: 43 }),
    });
    ok(within.ok, `43 against 40 is inside the 10% tolerance and accepted (${within.status})`);
    if (within.body?.grnId) created.grn.push(within.body.grnId);
    const { rows: inv2 } = await db.query(
      `SELECT id FROM inventory WHERE "itemName" = $1`, [`${TAG} Angle 50mm`]);
    inv2.forEach(r => created.inventory.push(r.id));
  }

  /* ══ 2c. A MULTI-LINE PURCHASE ORDER ══════════════════════
     GRN read po.itemName — the header — so an order for three materials
     received one quantity of whatever the header said and the other two
     never entered stock. PO 9 on this database has two lines, both still
     showing received 0 while the header claims 5000 arrived. */
  console.log('\n  ── 2c. a purchase order with three lines');
  /* Lines are a second call — POST /po creates the header, POST /po/:id/items
     replaces its lines with an array. The first version of this passed
     lineItems to POST /po, which ignores it, so the order came back with a
     single synthetic line and the test read that as the bug it was hunting. */
  const po3 = await call('/po', {
    method: 'POST',
    body: JSON.stringify({
      projectId, vendorId, itemName: `${TAG} Assembly kit`, quantity: 60, unitPrice: 100,
    }),
  });
  const po3Id = po3.body.id ?? po3.body.po?.id;
  if (po3Id) {
    created.po.push(po3Id);
    const addLines = await call(`/po/${po3Id}/items`, {
      method: 'POST',
      body: JSON.stringify([
        { sno: 1, description: `${TAG} Plate 6mm`,  quantity: 30, unitPrice: 100, uom: 'nos' },
        { sno: 2, description: `${TAG} Angle 40mm`, quantity: 20, unitPrice: 100, uom: 'nos' },
        { sno: 3, description: `${TAG} Bolt M12`,   quantity: 10, unitPrice: 100, uom: 'nos' },
      ]),
    });
    ok(addLines.ok, `three lines added to the order (${addLines.status})`);
    await call(`/po/${po3Id}/approve`,  { method: 'PATCH', body: '{}' });
    await call(`/po/${po3Id}/dispatch`, { method: 'PATCH', body: '{}' });

    const out = await call(`/grn/outstanding/${po3Id}`);
    ok(out.ok, `the outstanding endpoint answers (${out.status})`);
    ok((out.body.lines || []).length === 3,
      `it reports all three lines, not just the header (${(out.body.lines || []).length})`);

    /* Receiving without saying which line must be refused, not guessed. */
    const guess = await call('/grn', {
      method: 'POST', body: JSON.stringify({ poId: po3Id, receivedQuantity: 30 }),
    });
    ok(!guess.ok, `a receipt that does not name a line is refused (${guess.status})`);
    ok(/say which one/i.test(guess.body?.error || ''), 'and it says why');

    /* Book against the second line only. */
    const angle = (out.body.lines || []).find(l => /Angle/.test(l.description));
    const r2 = await call('/grn', {
      method: 'POST',
      body: JSON.stringify({ poId: po3Id, poLineItemId: angle.id, receivedQuantity: 20 }),
    });
    ok(r2.ok, `the angle line can be received on its own (${r2.status})`);
    if (r2.body?.grnId) created.grn.push(r2.body.grnId);

    const after = (await call(`/grn/outstanding/${po3Id}`)).body;
    const byName = (n) => (after.lines || []).find(l => new RegExp(n).test(l.description)) || {};
    ok(byName('Angle').received === 20, `the angle line shows 20 received → ${byName('Angle').received}`);
    ok(byName('Plate').received === 0,  `the plate line is untouched → ${byName('Plate').received}`);
    ok(byName('Bolt').outstanding === 10, `the bolt line still owes 10 → ${byName('Bolt').outstanding}`);

    /* Stock must be created under the LINE's name, not the header's. */
    const { rows: invRows } = await db.query(
      `SELECT "itemName", quantity FROM inventory WHERE "itemName" LIKE $1`, [`${TAG}%`]);
    invRows.forEach(r => {});
    /* By exact name. `/Angle/` also matched "Angle 50mm" from section 2b,
       which holds 43 — so the assertion read another test's stock and
       reported this one as wrong. */
    const angleStock = invRows.find(r => r.itemName === `${TAG} Angle 40mm`);
    ok(!!angleStock, `stock was created under the line's name, not the header's (${invRows.map(r => r.itemName).join(', ') || 'none'})`);
    ok(Number(angleStock?.quantity) === 20, `with the received quantity → ${angleStock?.quantity}`);

    const { rows: ids } = await db.query(`SELECT id FROM inventory WHERE "itemName" LIKE $1`, [`${TAG}%`]);
    ids.forEach(r => { if (!created.inventory.includes(r.id)) created.inventory.push(r.id); });

    /* The order is Partially Received while two lines are outstanding. */
    const { rows: [st] } = await db.query('SELECT status FROM purchase_orders WHERE id = $1', [po3Id]);
    ok(st.status === 'Partially Received',
      `the order is Partially Received while two lines are owed → ${st.status}`);
  }

  /* ══ 3. STOCK TAKE ═════════════════════════════════════════ */
  console.log('\n  ── 3. stock take');
  const before = (await state(invId)).balance;
  const adj = await call(`/inventory/${invId}/adjust`, {
    method: 'POST', body: JSON.stringify({ countedQuantity: before - 3, reason: `${TAG} damaged in handling` }),
  });
  ok(adj.ok, `count recorded (${adj.status})`);
  s = await state(invId);
  ok(s.balance === before - 3, `balance follows the count → ${s.balance}`);
  ok(s.ledger === s.balance, `and the ledger agrees → ${s.ledger}`);

  /* ══ 4. RECONCILE ══════════════════════════════════════════ */
  console.log('\n  ── 4. reconciliation across the whole database');
  const rec = await call('/inventory/reconcile');
  ok(rec.ok, `GET /inventory/reconcile answers (${rec.status})`);
  const drifting = Array.isArray(rec.body) ? rec.body : (rec.body.items || rec.body.drift || []);
  ok(drifting.length === 0,
    `no stock row disagrees with its own ledger (${drifting.length} drifting)` +
    (drifting.length ? ` — e.g. ${JSON.stringify(drifting[0]).slice(0, 110)}` : ''));

  /* ══ clean up ══════════════════════════════════════════════ */
  for (const id of created.grn)   await db.query('DELETE FROM grn WHERE id = $1', [id]).catch(() => {});
  for (const id of created.po)    await db.query('DELETE FROM po_line_items WHERE "poId" = $1', [id]).catch(() => {});
  for (const id of created.po)    await db.query('DELETE FROM purchase_orders WHERE id = $1', [id]).catch(() => {});
  for (const id of created.inventory) {
    await db.query('DELETE FROM stock_movements WHERE inventory_id = $1', [id]).catch(() => {});
    await db.query('DELETE FROM inventory WHERE id = $1', [id]).catch(() => {});
  }
  const { rows: [left] } = await db.query(
    `SELECT COUNT(*) c FROM inventory WHERE "itemName" LIKE $1`, [`${TAG}%`]);
  ok(Number(left.c) === 0, 'test stock removed — database left as found');

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('threw:', e.message); process.exit(1); });
