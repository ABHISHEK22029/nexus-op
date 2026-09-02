#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   load-ikea — insert at IKEA scale, then time every level.

   The behavioural simulation found linkage breaks with three products. This
   finds the ones that only exist at volume: quadratic joins, N+1 queries,
   missing indexes, aggregates that walk the whole table, endpoints that load
   everything into memory before answering.

   Those are invisible with eleven demo rows and fatal with a real catalogue,
   and they are a different class of bug from "this screen doesn't link to
   that one" — nothing about the code looks wrong, it just stops returning.

   SCALE (a mid-size furniture supplier, not a toy):
     2,000 raw materials      500 products with 3–6 BOM lines each
        60 vendors          4,000 vendor supply links
       300 customer orders  ~1,200 order lines
     2,500 inventory rows      800 purchase orders

   Everything is prefixed LOAD- and removed at the end. Inserts go through
   COPY-style batched statements rather than the API, because the point is to
   measure the READ path, not to spend an hour on writes.
   ══════════════════════════════════════════════════════════════════════ */

const db = require('../db');

const BASE = process.env.LOAD_BASE || 'http://localhost:5099';
const EMAIL = process.env.LOAD_EMAIL;
const PASSWORD = process.env.LOAD_PASSWORD;
if (!EMAIL || !PASSWORD) { console.error('set LOAD_EMAIL and LOAD_PASSWORD'); process.exit(1); }
if (/onrender|vercel|^https:/.test(BASE)) { console.error('refusing to run against a deployed host'); process.exit(1); }

const TAG = 'LOAD-';
const SCALE = {
  materials: Number(process.env.LOAD_MATERIALS || 2000),
  skus: Number(process.env.LOAD_SKUS || 500),
  vendors: Number(process.env.LOAD_VENDORS || 60),
  orders: Number(process.env.LOAD_ORDERS || 300),
  inventory: Number(process.env.LOAD_INVENTORY || 2500),
  pos: Number(process.env.LOAD_POS || 800),
};

let TOKEN = '';
const findings = [];
const finding = (sev, area, what, detail) => findings.push({ sev, area, what, detail });

const sql = (q, p = []) => db.query(q, p);
const ms = (t) => `${t.toFixed(0)}ms`;

async function api(method, path) {
  const t0 = performance.now();
  const res = await fetch(`${BASE}${path}`, {
    method, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  });
  const text = await res.text();
  const dt = performance.now() - t0;
  let data; try { data = JSON.parse(text); } catch { data = { _raw: text.slice(0, 120) }; }
  return { ok: res.ok, status: res.status, data, dt };
}

/* ══════════════ SEED ══════════════ */
async function seed() {
  console.log('\n━━ SEEDING ━━\n');
  const t0 = performance.now();

  // Vendors
  await sql(`
    INSERT INTO vendors (name, type, city, state, owner_id)
    SELECT ${lit(TAG)} || 'Vendor ' || g, 'Material Supply',
           (ARRAY['Bengaluru','Pune','Chennai','Rajkot'])[1 + (g % 4)],
           (ARRAY['Karnataka','Maharashtra','Tamil Nadu','Gujarat'])[1 + (g % 4)], 1
    FROM generate_series(1, $1) g`, [SCALE.vendors]);

  // Raw materials
  await sql(`
    INSERT INTO raw_materials (name, category, base_uom, purchase_uom, standard_rate, moq, lead_time_days, owner_id)
    SELECT ${lit(TAG)} || 'Material ' || g,
           (ARRAY['Plate','Angle','Pipe','Fastener','Coating'])[1 + (g % 5)],
           (ARRAY['kg','kg','kg','nos','ltr'])[1 + (g % 5)],
           (ARRAY['kg','kg','kg','nos','ltr'])[1 + (g % 5)],
           40 + (g % 120), 100 * (1 + (g % 5)), 3 + (g % 20), 1
    FROM generate_series(1, $1) g`, [SCALE.materials]);

  // Products
  await sql(`
    INSERT INTO skus (name, unit, owner_id)
    SELECT ${lit(TAG)} || 'Product ' || g, 'nos', 1
    FROM generate_series(1, $1) g`, [SCALE.skus]);

  // BOM: each product uses 3–6 materials
  await sql(`
    INSERT INTO sku_bom (sku_id, raw_material_id, component_name, qty_per_unit, uom)
    SELECT s.id, m.id, m.name, 0.5 + ((s.id + m.id) % 8), m.base_uom
    FROM skus s
    JOIN LATERAL (
      SELECT id, name, base_uom FROM raw_materials
      WHERE name LIKE ${lit(TAG)} || '%'
      ORDER BY (id * 7919 + s.id) % ${SCALE.materials}
      LIMIT 3 + (s.id % 4)
    ) m ON TRUE
    WHERE s.name LIKE ${lit(TAG)} || '%'`);

  // Vendor supply links
  await sql(`
    INSERT INTO vendor_items (vendor_id, raw_material_id, price, price_uom, moq, lead_time_days, is_preferred, owner_id)
    SELECT v.id, m.id, 40 + ((v.id + m.id) % 90), m.base_uom,
           100 * (1 + ((v.id + m.id) % 6)), 3 + ((v.id + m.id) % 21),
           ((v.id + m.id) % 7 = 0), 1
    FROM vendors v
    JOIN LATERAL (
      SELECT id, base_uom FROM raw_materials
      WHERE name LIKE ${lit(TAG)} || '%'
      ORDER BY (id * 104729 + v.id) % ${SCALE.materials}
      LIMIT 70
    ) m ON TRUE
    WHERE v.name LIKE ${lit(TAG)} || '%'
    ON CONFLICT DO NOTHING`);

  // Customers
  await sql(`
    INSERT INTO customers (name, gstin, state, shipping_state, payment_terms_days, owner_id)
    SELECT ${lit(TAG)} || 'Customer ' || g, '29AABCI' || LPAD(g::text, 4, '0') || 'M1Z5',
           'Karnataka', 'Karnataka', 30 + (g % 30), 1
    FROM generate_series(1, 40) g`);

  // Orders + lines
  await sql(`
    INSERT INTO customer_orders (customer_id, order_number, order_date, status, sub_total, total, gst_rate, owner_id)
    SELECT c.id, ${lit(TAG)} || 'CO-' || LPAD(g::text, 5, '0'),
           DATE '2026-01-01' + (g % 240),
           (ARRAY['Open','In Procurement','Open','Delivered'])[1 + (g % 4)],
           0, 0, 18, 1
    FROM generate_series(1, $1) g
    JOIN LATERAL (SELECT id FROM customers WHERE name LIKE ${lit(TAG)} || '%' ORDER BY (id + g) % 40 LIMIT 1) c ON TRUE`,
    [SCALE.orders]);

  await sql(`
    INSERT INTO customer_order_items (customer_order_id, sku_id, description, quantity, unit, rate, amount)
    SELECT o.id, s.id, s.name, 10 + (o.id % 400), 'nos', 200 + (s.id % 900),
           (10 + (o.id % 400)) * (200 + (s.id % 900))
    FROM customer_orders o
    JOIN LATERAL (
      SELECT id, name FROM skus WHERE name LIKE ${lit(TAG)} || '%'
      ORDER BY (id * 31 + o.id) % ${SCALE.skus} LIMIT 4
    ) s ON TRUE
    WHERE o.order_number LIKE ${lit(TAG)} || '%'`);

  // Inventory
  await sql(`
    INSERT INTO inventory ("itemName", quantity, uom, raw_material_id, item_type, unit_cost, min_stock_level, owner_id)
    SELECT m.name, (m.id % 900), m.base_uom, m.id, 'raw', m.standard_rate, 200, 1
    FROM raw_materials m
    WHERE m.name LIKE ${lit(TAG)} || '%' AND m.id % 2 = 0
    LIMIT $1`, [SCALE.inventory]);

  // Purchase orders (header-only, as the real ones are)
  await sql(`
    INSERT INTO purchase_orders ("vendorId", "poNumber", "itemName", quantity, "unitPrice", status, owner_id)
    SELECT v.id, ${lit(TAG)} || 'PO-' || LPAD(g::text, 5, '0'),
           m.name, 100 + (g % 900), 50 + (g % 80),
           (ARRAY['Pending','Approved','Dispatched','Delivered'])[1 + (g % 4)], 1
    FROM generate_series(1, $1) g
    JOIN LATERAL (SELECT id FROM vendors WHERE name LIKE ${lit(TAG)} || '%' ORDER BY (id + g) % ${SCALE.vendors} LIMIT 1) v ON TRUE
    JOIN LATERAL (SELECT name FROM raw_materials WHERE name LIKE ${lit(TAG)} || '%' ORDER BY (id + g) % ${SCALE.materials} LIMIT 1) m ON TRUE`,
    [SCALE.pos]);

  const counts = {};
  for (const [label, q] of [
    ['materials', `SELECT COUNT(*)::int n FROM raw_materials WHERE name LIKE '${TAG}%'`],
    ['products', `SELECT COUNT(*)::int n FROM skus WHERE name LIKE '${TAG}%'`],
    ['bom lines', `SELECT COUNT(*)::int n FROM sku_bom b JOIN skus s ON s.id=b.sku_id WHERE s.name LIKE '${TAG}%'`],
    ['vendors', `SELECT COUNT(*)::int n FROM vendors WHERE name LIKE '${TAG}%'`],
    ['supply links', `SELECT COUNT(*)::int n FROM vendor_items vi JOIN vendors v ON v.id=vi.vendor_id WHERE v.name LIKE '${TAG}%'`],
    ['orders', `SELECT COUNT(*)::int n FROM customer_orders WHERE order_number LIKE '${TAG}%'`],
    ['order lines', `SELECT COUNT(*)::int n FROM customer_order_items i JOIN customer_orders o ON o.id=i.customer_order_id WHERE o.order_number LIKE '${TAG}%'`],
    ['inventory', `SELECT COUNT(*)::int n FROM inventory WHERE "itemName" LIKE '${TAG}%'`],
    ['purchase orders', `SELECT COUNT(*)::int n FROM purchase_orders WHERE "poNumber" LIKE '${TAG}%'`],
  ]) counts[label] = (await sql(q)).rows[0].n;

  console.log(`  seeded in ${ms(performance.now() - t0)}`);
  for (const [k, v] of Object.entries(counts)) console.log(`    ${k.padEnd(16)} ${v.toLocaleString('en-IN')}`);
  return counts;
}
const lit = (s) => `'${s.replace(/'/g, "''")}'`;

/* ══════════════ MEASURE ══════════════ */
const SLOW = 1000;      // anything over a second is a problem a user feels
const VERY_SLOW = 4000; // over four seconds is a broken screen

async function timeEndpoint(label, path, opts = {}) {
  const r = await api('GET', path);
  const n = Array.isArray(r.data) ? r.data.length : (r.data?.items?.length ?? r.data?.total ?? '—');
  const flag = !r.ok ? '💥' : r.dt > VERY_SLOW ? '🔴' : r.dt > SLOW ? '🟠' : '✅';
  console.log(`  ${flag} ${label.padEnd(38)} ${ms(r.dt).padStart(8)}   ${r.ok ? `${n} row(s)` : `HTTP ${r.status}`}`);
  if (!r.ok) finding('HIGH', 'Scale', `${label} fails at scale`, `HTTP ${r.status}: ${JSON.stringify(r.data).slice(0, 140)}`);
  else if (r.dt > VERY_SLOW) finding('HIGH', 'Performance', `${label} takes ${ms(r.dt)}`, opts.why || 'unusable at this volume');
  else if (r.dt > SLOW) finding('MED', 'Performance', `${label} takes ${ms(r.dt)}`, opts.why || 'noticeably slow');
  return r;
}

async function run(counts) {
  console.log('\n━━ LIST ENDPOINTS (first page of 25) ━━\n');
  for (const [label, path] of [
    ['raw-materials', '/raw-materials?limit=25'],
    ['skus', '/skus?limit=25'],
    ['vendors', '/vendors?limit=25'],
    ['vendor-items', '/vendor-items?limit=25'],
    ['customers', '/customers?limit=25'],
    ['customer-orders', '/customer-orders?limit=25'],
    ['inventory', '/inventory?limit=25'],
    ['po', '/po?limit=25'],
  ]) await timeEndpoint(label, path);

  console.log('\n━━ SEARCH (the thing people actually do) ━━\n');
  await timeEndpoint('raw-materials search', '/raw-materials?limit=25&search=Material%201234');
  await timeEndpoint('customer-orders search', '/customer-orders?limit=25&search=LOAD-CO-00150');
  await timeEndpoint('vendor-items search', '/vendor-items?limit=25&search=Vendor%2030');

  console.log('\n━━ DEEP PAGINATION (page 40 vs page 1) ━━\n');
  await timeEndpoint('raw-materials page 1', '/raw-materials?limit=25&offset=0');
  await timeEndpoint('raw-materials page 40', '/raw-materials?limit=25&offset=1000');

  console.log('\n━━ THE HEAVY ONES ━━\n');
  await timeEndpoint('material-requirements (ALL orders)', '/material-requirements',
    { why: 'explodes every open order through its BOM in application memory' });
  const oneOrder = (await sql(`SELECT id FROM customer_orders WHERE order_number LIKE '${TAG}%' LIMIT 1`)).rows[0];
  if (oneOrder) await timeEndpoint('order readiness (one order)', `/customer-orders/${oneOrder.id}/readiness`);
  await timeEndpoint('purchase plan', '/material-requirements/purchase-plan',
    { why: 'runs the whole deficiency engine, then groups by vendor' });
  await timeEndpoint('inventory reconcile', '/inventory/reconcile');
  await timeEndpoint('inventory movements', '/inventory/movements?limit=25');
  await timeEndpoint('dashboard', '/dashboard?projectId=1');

  /* ── N+1 detection: does one list issue one query, or one per row? ── */
  console.log('\n━━ N+1 QUERY DETECTION ━━\n');
  await detectNPlusOne();

  /* ── The quadratic join behind on_order ── */
  console.log('\n━━ THE on_order JOIN (regex across two tables) ━━\n');
  const t0 = performance.now();
  const oo = await sql(`
    SELECT rm.id, SUM(po.quantity)::numeric AS qty
    FROM purchase_orders po
    JOIN raw_materials rm
      ON btrim(regexp_replace(lower(translate(rm.name, '×X', 'xx')), '[^a-z0-9]+', ' ', 'g'))
       = btrim(regexp_replace(lower(translate(po."itemName", '×X', 'xx')), '[^a-z0-9]+', ' ', 'g'))
    WHERE po.status IN ('Pending','Approved','Dispatched')
    GROUP BY rm.id`);
  const dt = performance.now() - t0;
  console.log(`  ${dt > SLOW ? '🔴' : '✅'} regex join over ${counts['purchase orders']} POs x ${counts.materials} materials  ${ms(dt)}  -> ${oo.rows.length} matched`);
  if (dt > SLOW) {
    finding('HIGH', 'Performance', `on_order regex join takes ${ms(dt)}`,
      'it regex-normalises BOTH sides of every row pair, so no index can help — it is a cross product with string work on each cell');
  }
  if (oo.rows.length === 0 && counts['purchase orders'] > 0) {
    finding('HIGH', 'Correctness', 'on_order matched nothing at scale',
      `${counts['purchase orders']} POs, ${counts.materials} materials, zero matched — confirms material identity should not be a string comparison`);
  }

  /* ── Missing indexes on the foreign keys everything joins on ── */
  console.log('\n━━ INDEX COVERAGE ON HOT FOREIGN KEYS ━━\n');
  await checkIndexes();

  /* ── Aggregate honesty at scale ── */
  console.log('\n━━ DO AGGREGATES STILL MATCH THE DATA? ━━\n');
  const listed = await api('GET', '/customer-orders?limit=25');
  const realCount = (await sql(`SELECT COUNT(*)::int n FROM customer_orders WHERE owner_id = 1`)).rows[0].n;
  const shown = listed.data?.total;
  console.log(`  orders: endpoint total ${shown}  vs  table count ${realCount}  ${shown === realCount ? '✅' : '❌'}`);
  if (shown !== realCount) finding('HIGH', 'Correctness', 'list total disagrees with the table at scale', `endpoint ${shown}, actual ${realCount}`);
}

/* Count queries a request causes, by sampling pg_stat_statements if
   available, else by timing shape. Simpler and more reliable: compare the
   time of a 1-row page against a 25-row page. A flat curve means one query;
   a 25x curve means one per row. */
async function detectNPlusOne() {
  const probes = [
    ['production', '/production?projectId=1&limit=%N%'],
    ['customer-orders', '/customer-orders?limit=%N%'],
    ['vendor-items', '/vendor-items?limit=%N%'],
    ['inventory', '/inventory?limit=%N%'],
  ];
  for (const [label, tmpl] of probes) {
    const one = await api('GET', tmpl.replace('%N%', '1'));
    const many = await api('GET', tmpl.replace('%N%', '50'));
    if (!one.ok || !many.ok) { console.log(`  ⚠ ${label.padEnd(20)} skipped (HTTP ${one.status}/${many.status})`); continue; }
    const ratio = many.dt / Math.max(one.dt, 1);
    const suspect = ratio > 8 && many.dt > 300;
    console.log(`  ${suspect ? '🔴' : '✅'} ${label.padEnd(20)} 1 row ${ms(one.dt).padStart(7)}   50 rows ${ms(many.dt).padStart(8)}   x${ratio.toFixed(1)}`);
    if (suspect) finding('HIGH', 'Performance', `${label} looks like N+1`,
      `50 rows costs ${ratio.toFixed(1)}x one row (${ms(one.dt)} -> ${ms(many.dt)}) — the work scales with row count, not page count`);
  }
}

async function checkIndexes() {
  const hot = [
    ['customer_order_items', 'customer_order_id'],
    ['sku_bom', 'sku_id'],
    ['sku_bom', 'raw_material_id'],
    ['vendor_items', 'raw_material_id'],
    ['vendor_items', 'vendor_id'],
    ['inventory', 'raw_material_id'],
    ['po_line_items', 'poId'],
    ['sales_invoice_items', 'sales_invoice_id'],
    ['delivery_challan_items', 'delivery_challan_id'],
    ['sales_payments', 'sales_invoice_id'],
    ['production_output', 'production_order_id'],
    ['production_consumption', 'production_order_id'],
  ];
  const missing = [];
  for (const [table, col] of hot) {
    const r = await sql(`
      SELECT 1 FROM pg_indexes
      WHERE tablename = $1 AND (indexdef ILIKE '%(' || $2 || ')%' OR indexdef ILIKE '%(' || $2 || ',%' OR indexdef ILIKE '%"' || $2 || '"%')
      LIMIT 1`, [table, col]);
    if (!r.rowCount) missing.push(`${table}.${col}`);
  }
  if (missing.length) {
    console.log(`  🔴 ${missing.length} of ${hot.length} hot foreign keys have NO index:`);
    missing.forEach(m => console.log(`       ${m}`));
    finding('HIGH', 'Performance', `${missing.length} hot foreign keys are unindexed`,
      missing.join(', ') + ' — every join through these is a sequential scan, which is invisible at 11 rows and quadratic at 10,000');
  } else console.log(`  ✅ all ${hot.length} hot foreign keys are indexed`);
}


/* ── Concurrency: does it hold up with people actually using it? ── */
async function concurrency() {
  console.log('\n━━ CONCURRENCY (20 simultaneous requests) ━━\n');
  for (const [label, path] of [
    ['customer-orders', '/customer-orders?limit=25'],
    ['material-requirements', '/material-requirements'],
    ['dashboard', '/dashboard?projectId=1'],
  ]) {
    const t0 = performance.now();
    const rs = await Promise.all(Array.from({ length: 20 }, () => api('GET', path)));
    const wall = performance.now() - t0;
    const failed = rs.filter(r => !r.ok).length;
    const slowest = Math.max(...rs.map(r => r.dt));
    const flag = failed ? '💥' : slowest > VERY_SLOW ? '🔴' : slowest > SLOW ? '🟠' : '✅';
    console.log(`  ${flag} ${label.padEnd(26)} wall ${ms(wall).padStart(8)}   slowest ${ms(slowest).padStart(8)}   ${failed} failed`);
    if (failed) finding('HIGH', 'Concurrency', `${label} fails under 20 concurrent requests`, `${failed}/20 errored`);
    else if (slowest > VERY_SLOW) finding('HIGH', 'Concurrency', `${label} degrades badly under load`, `slowest request ${ms(slowest)}`);
  }
}

/* ── Sorting on columns that may have no index ── */
async function sorting() {
  console.log('\n━━ SORTING ━━\n');
  for (const [label, path] of [
    ['raw-materials by name', '/raw-materials?limit=25&sort=name&dir=asc'],
    ['customer-orders by date', '/customer-orders?limit=25&sort=order_date&dir=desc'],
    ['po by quantity', '/po?limit=25&sort=quantity&dir=desc'],
  ]) await timeEndpoint(label, path);
}

/* ── A document with many lines, and a customer with much history ── */
async function fatRecords() {
  console.log('\n━━ FAT RECORDS ━━\n');
  const ord = (await sql(`SELECT id FROM customer_orders WHERE order_number LIKE '${TAG}%' LIMIT 1`)).rows[0];
  if (ord) {
    await timeEndpoint('one order (with its lines)', `/customer-orders/${ord.id}`);
    await timeEndpoint('challan prefill from order', `/delivery-challans/prefill/${ord.id}`);
    await timeEndpoint('invoice prefill from order', `/sales-invoices/prefill/${ord.id}`);
  }
  const cust = (await sql(`SELECT id FROM customers WHERE name LIKE '${TAG}%' LIMIT 1`)).rows[0];
  if (cust) await timeEndpoint('customer 360 summary', `/customers/${cust.id}/summary`);
}

/* ══════════════ CLEANUP ══════════════ */
async function cleanup() {
  console.log('\n━━ CLEANUP ━━');
  const t0 = performance.now();
  const stmts = [
    `DELETE FROM customer_order_items i USING customer_orders o WHERE o.id=i.customer_order_id AND o.order_number LIKE '${TAG}%'`,
    `DELETE FROM customer_orders WHERE order_number LIKE '${TAG}%'`,
    `DELETE FROM sku_bom b USING skus s WHERE s.id=b.sku_id AND s.name LIKE '${TAG}%'`,
    `DELETE FROM vendor_items vi USING vendors v WHERE v.id=vi.vendor_id AND v.name LIKE '${TAG}%'`,
    `DELETE FROM vendor_items vi USING raw_materials m WHERE m.id=vi.raw_material_id AND m.name LIKE '${TAG}%'`,
    `DELETE FROM po_line_items l USING purchase_orders p WHERE p.id=l."poId" AND p."poNumber" LIKE '${TAG}%'`,
    `DELETE FROM purchase_orders WHERE "poNumber" LIKE '${TAG}%'`,
    `DELETE FROM stock_movements WHERE item_name LIKE '${TAG}%'`,
    `DELETE FROM inventory WHERE "itemName" LIKE '${TAG}%'`,
    `DELETE FROM skus WHERE name LIKE '${TAG}%'`,
    `DELETE FROM raw_materials WHERE name LIKE '${TAG}%'`,
    `DELETE FROM vendors WHERE name LIKE '${TAG}%'`,
    `DELETE FROM customers WHERE name LIKE '${TAG}%'`,
  ];
  for (const q of stmts) { try { await sql(q); } catch (e) { console.error('  cleanup:', e.message.slice(0, 90)); } }
  const left = (await sql(`SELECT
      (SELECT COUNT(*) FROM raw_materials WHERE name LIKE '${TAG}%')
    + (SELECT COUNT(*) FROM skus WHERE name LIKE '${TAG}%')
    + (SELECT COUNT(*) FROM customer_orders WHERE order_number LIKE '${TAG}%')
    + (SELECT COUNT(*) FROM purchase_orders WHERE "poNumber" LIKE '${TAG}%')
    + (SELECT COUNT(*) FROM inventory WHERE "itemName" LIKE '${TAG}%') AS n`)).rows[0].n;
  console.log(`  removed in ${ms(performance.now() - t0)}; ${left} LOAD- rows remain ${Number(left) === 0 ? '✅' : '⚠'}`);
}

/* ══════════════ MAIN ══════════════ */
(async () => {
  const login = await fetch(`${BASE}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  }).then(r => r.json());
  TOKEN = login.token;
  if (!TOKEN) { console.error('no token'); process.exit(1); }

  let counts = {};
  try {
    counts = await seed();
    await run(counts);
    await sorting();
    await fatRecords();
    await concurrency();
  } catch (e) {
    console.error('\n💥', e.message);
    finding('HIGH', 'Runtime', 'load test threw', e.message);
  } finally {
    await cleanup();
  }

  console.log('\n\n══════════════ FINDINGS ══════════════\n');
  if (!findings.length) console.log('  ✅ nothing surfaced at this scale');
  for (const sev of ['HIGH', 'MED']) {
    const list = findings.filter(f => f.sev === sev);
    if (!list.length) continue;
    console.log(`  ${sev === 'HIGH' ? '🔴' : '🟡'} ${sev}\n`);
    list.forEach((f, i) => {
      console.log(`     ${i + 1}. [${f.area}] ${f.what}`);
      console.log(`        ${f.detail}\n`);
    });
  }
  console.log(`  ${findings.length} finding(s)\n`);
  process.exit(0);
})();
