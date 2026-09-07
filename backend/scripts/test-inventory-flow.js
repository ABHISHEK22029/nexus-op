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

    const grn = await call('/grn', {
      method: 'POST',
      body: JSON.stringify({ poId, receivedQuantity: 40, batchNumber: TAG }),
    });
    ok(grn.ok, `goods receipt recorded (${grn.status})` +
      (grn.ok ? '' : ` — ${grn.body.error || JSON.stringify(grn.body).slice(0, 90)}`));
    if (grn.body?.id) created.grn.push(grn.body.id);

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
