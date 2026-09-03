#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   seed-org — load a whole organisation's operating data.

   Not a demo fixture. This builds the full spine a real business would have
   after months of trading — customers, vendors, materials, products with
   bills of materials, vendor price lists, stock, open orders, production,
   dispatch and invoices — so the product can be exercised at a size where
   things actually break.

   Parameterised by organisation, because the product is not one company's.
   `--org` picks a profile from ORGS below; add another and it works the
   same. The point is that nothing about the code assumes which one.

   Usage:
     node scripts/seed-org.js --org=ikea --scale=1     (~3k rows)
     node scripts/seed-org.js --org=ikea --scale=4     (~12k rows)
     node scripts/seed-org.js --list
     node scripts/seed-org.js --org=ikea --clean       (remove what it made)

   Everything it writes is tagged with a seed marker so --clean can remove
   exactly its own rows and nothing else.
   ══════════════════════════════════════════════════════════════════════ */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../db');
const fs = require('fs');
const path = require('path');

/* ── organisations ────────────────────────────────────────────────────
   Each is a plausible business of a different shape. IKEA-style flat-pack
   furniture manufacturing is deliberately NOT the same shape as steel
   fabrication: different units, different BOM depth, different vendors. */
const ORGS = {
  ikea: {
    key: 'IKEA',
    /* The state the business supplies FROM. Anything else is inter-state and
       attracts IGST rather than CGST+SGST, so this decides the tax on every
       order the seeder writes — worth stating once rather than deriving it
       from an address string. */
    homeState: 'Tamil Nadu',
    /* Units this business trades in that the stock UOM master does not
       already carry. A board mill sells by the sheet; the shipped master was
       built for a metal fabricator and has kg, mt, m and sqm. */
    uoms: {
      sheet: { name: 'Sheet', dimension: 'count', factor: 1 },
      metre: { name: 'Metre (run)', dimension: 'length', factor: 1 },
    },
    profile: {
      name: 'Nordic Flatpack Manufacturing Pvt Ltd',
      tradeName: 'Nordic Flatpack',
      doc_prefix: 'NFM',
      address: 'Plot 44, Industrial Estate, Hosur, Tamil Nadu 635109',
      phone: '+91 80 4000 1200', email: 'ops@nordicflatpack.example',
      gstin: '33AABCN1234M1Z7', pan: 'AABCN1234M', stateCode: '33',
      employee_count: '51–200',
    },
    customers: [
      ['Apollo Retail Ltd', '29AACCA1111B1Z1', 'Karnataka', '29'],
      ['Meridian Homes LLP', '33AACCM2222C1Z2', 'Tamil Nadu', '33'],
      ['Northgate Interiors', '27AACCN3333D1Z3', 'Maharashtra', '27'],
      ['Cityline Hospitality', '36AACCC4444E1Z4', 'Telangana', '36'],
      ['Harbour Living Pvt Ltd', '32AACCH5555F1Z5', 'Kerala', '32'],
      ['Vista Contract Furnishing', '33AACCV6666G1Z6', 'Tamil Nadu', '33'],
    ],
    vendors: [
      ['Kalinga Particle Board Co', 'Board & Panel', '21AAACK1111A1Z1'],
      ['Deccan Laminates Pvt Ltd', 'Surface', '36AAACD2222B1Z2'],
      ['Sundaram Fasteners Supply', 'Hardware', '33AAACS3333C1Z3'],
      ['Everest Adhesives', 'Consumable', '27AAACE4444D1Z4'],
      ['Coastal Timber Traders', 'Solid wood', '32AAACC5555E1Z5'],
      ['Precision Hinge Works', 'Hardware', '29AAACP6666F1Z6'],
      ['Meghna Packaging', 'Packaging', '19AAACM7777G1Z7'],
      ['Tirupati Edge Banding', 'Surface', '33AAACT8888H1Z8'],
    ],
    materials: [
      // name, category, uom, rate/unit, moq, lead days
      ['Particle Board 18mm 8x4', 'Board', 'sheet', 1240, 50, 7],
      ['Particle Board 12mm 8x4', 'Board', 'sheet', 890, 50, 7],
      ['MDF 16mm 8x4', 'Board', 'sheet', 1480, 40, 10],
      ['Laminate Sheet Oak 1mm', 'Surface', 'sheet', 720, 30, 5],
      ['Laminate Sheet White 1mm', 'Surface', 'sheet', 690, 30, 5],
      ['Edge Band Tape 22mm', 'Surface', 'metre', 9, 500, 4],
      ['Cam Lock Fitting 15mm', 'Hardware', 'nos', 6.5, 2000, 6],
      ['Dowel Pin 8x30mm', 'Hardware', 'nos', 1.2, 5000, 6],
      ['Concealed Hinge 35mm', 'Hardware', 'nos', 38, 500, 9],
      ['Drawer Slide 450mm', 'Hardware', 'pair', 165, 200, 9],
      ['Wood Screw 4x30mm', 'Hardware', 'nos', 0.9, 10000, 3],
      ['PVA Adhesive', 'Consumable', 'kg', 118, 50, 4],
      ['Carton 1200x600x120', 'Packaging', 'nos', 46, 300, 5],
      ['Corner Protector', 'Packaging', 'nos', 3.2, 2000, 5],
      ['Pine Batten 45x20mm', 'Solid wood', 'metre', 62, 200, 8],
    ],
    products: [
      // name, uom, price, bom: [[material index, qty per unit], ...]
      ['Billy Bookcase 80x202', 'nos', 6490, [[0, 2.4], [5, 11], [7, 24], [10, 32], [11, 0.35], [12, 1], [13, 4]]],
      ['Malm Chest 4-Drawer', 'nos', 11900, [[0, 3.1], [2, 1.2], [4, 2.0], [9, 4], [7, 30], [10, 44], [12, 2]]],
      ['Kallax Shelf 4x4', 'nos', 8750, [[0, 3.8], [5, 18], [6, 24], [7, 36], [10, 40], [12, 2]]],
      ['Pax Wardrobe Door 50x229', 'nos', 4980, [[2, 1.6], [3, 1.1], [5, 9], [8, 3], [10, 14], [12, 1]]],
      ['Lack Side Table 55x55', 'nos', 1790, [[1, 0.9], [4, 0.6], [5, 5], [10, 12], [13, 4]]],
      ['Hemnes Nightstand', 'nos', 7250, [[14, 6.2], [0, 1.1], [9, 1], [10, 26], [11, 0.2], [12, 1]]],
      ['Besta Frame 60x64', 'nos', 5390, [[0, 2.2], [5, 10], [6, 16], [7, 20], [10, 28], [12, 1]]],
      ['Micke Desk 105x50', 'nos', 9100, [[0, 2.9], [2, 0.8], [4, 1.4], [9, 2], [10, 34], [12, 2]]],
    ],
  },
};

/* ── args ── */
const args = process.argv.slice(2);
const arg = (k, d = null) => {
  const a = args.find(x => x.startsWith(`--${k}=`));
  return a ? a.split('=').slice(1).join('=') : (args.includes(`--${k}`) ? true : d);
};
if (arg('list')) {
  console.log('\norganisations:\n' + Object.entries(ORGS)
    .map(([k, o]) => `  ${k.padEnd(10)} ${o.profile.name}`).join('\n') + '\n');
  process.exit(0);
}
const orgKey = String(arg('org', 'ikea')).toLowerCase();
const ORG = ORGS[orgKey];
if (!ORG) { console.error(`unknown --org=${orgKey}; try --list`); process.exit(1); }
const SCALE = Math.max(1, Number(arg('scale', 1)) || 1);
const CLEAN = !!arg('clean');
const MARK = `[${ORG.key}]`;          // tag on every row this writes

/* Deterministic pseudo-random, so two runs at the same scale produce the
   same dataset and a number that looks wrong can be chased. */
let _s = 20260903;
const rnd = () => ((_s = (_s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const between = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const r2 = (n) => Math.round(n * 100) / 100;

const log = (...m) => console.log('  ', ...m);

async function clean(ownerId) {
  log(`removing rows tagged ${MARK} …`);
  const steps = [
    ['sales_invoice_items',   `DELETE FROM sales_invoice_items WHERE sales_invoice_id IN (SELECT id FROM sales_invoices WHERE notes LIKE $1)`],
    ['sales_invoices',        `DELETE FROM sales_invoices WHERE notes LIKE $1`],
    ['delivery_challan_items',`DELETE FROM delivery_challan_items WHERE delivery_challan_id IN (SELECT id FROM delivery_challans WHERE notes LIKE $1)`],
    ['delivery_challans',     `DELETE FROM delivery_challans WHERE notes LIKE $1`],
    ['production_output',     `DELETE FROM production_output WHERE production_order_id IN (SELECT id FROM production_orders WHERE notes LIKE $1)`],
    ['production_consumption',`DELETE FROM production_consumption WHERE production_order_id IN (SELECT id FROM production_orders WHERE notes LIKE $1)`],
    ['production_orders',     `DELETE FROM production_orders WHERE notes LIKE $1`],
    ['customer_order_items',  `DELETE FROM customer_order_items WHERE customer_order_id IN (SELECT id FROM customer_orders WHERE notes LIKE $1)`],
    ['customer_orders',       `DELETE FROM customer_orders WHERE notes LIKE $1`],
    ['sku_bom',               `DELETE FROM sku_bom WHERE sku_id IN (SELECT id FROM skus WHERE description LIKE $1)`],
    ['vendor_items',          `DELETE FROM vendor_items WHERE notes LIKE $1`],
    ['stock_movements',       `DELETE FROM stock_movements WHERE item_name LIKE $1`],
    ['inventory',             `DELETE FROM inventory WHERE "itemName" LIKE $1`],
    ['skus',                  `DELETE FROM skus WHERE description LIKE $1`],
    /* Each table's marker lives wherever it has a free text column:
       raw_materials has no notes, so material_code carries it; customers
       use tags. Matching on the wrong column silently deletes nothing,
       which reads as "already clean". */
    ['raw_materials',         `DELETE FROM raw_materials WHERE material_code LIKE $1`],
    ['vendors',               `DELETE FROM vendors WHERE address LIKE $1`],
    ['customers',             `DELETE FROM customers WHERE tags LIKE $1`],
  ];
  for (const [label, sql] of steps) {
    try {
      const r = await db.query(sql, [`%${MARK}%`]);
      if (r.rowCount) log(`  ${label}: ${r.rowCount}`);
    } catch (e) { log(`  ${label}: ${e.message.slice(0, 70)}`); }
  }
}

(async () => {
  const t0 = Date.now();
  console.log(`\n╔═══ seed-org · ${ORG.profile.name} · scale ${SCALE} ═══╗\n`);

  const { rows: admin } = await db.query(
    `SELECT id FROM users WHERE role IN ('Administrator','Admin') AND is_active ORDER BY id LIMIT 1`);
  const ownerId = admin[0]?.id;
  if (!ownerId) { console.error('no active administrator to own the data'); process.exit(1); }
  log(`owner: user ${ownerId}`);

  if (CLEAN) { await clean(ownerId); console.log('\n  done\n'); process.exit(0); }

  /* ── 0. the organisation itself ─────────────────────────────────── */
  const p = ORG.profile;
  const cols = Object.keys(p);
  const { rows: existing } = await db.query('SELECT id FROM company_profile ORDER BY id LIMIT 1');

  /* This REPLACES the company profile — name, GSTIN, PAN, address, the lot.
     On a database that already belongs to a real business that is
     destructive, so the previous profile is written to disk first. Without
     this the first run of the seeder would have overwritten a live
     organisation's tax identity with no way back. */
  if (existing[0]) {
    const backup = path.join(__dirname, '..', `.company_profile.backup.json`);
    /* Never overwrite an existing backup. The second run of this seeder
       saved the profile it had itself just written, which threw away the
       only copy of the real business's identity — the backup was there to
       protect against exactly this and destroyed it instead. The FIRST
       backup is the one worth keeping. */
    if (fs.existsSync(backup)) {
      const held = JSON.parse(fs.readFileSync(backup, 'utf8'));
      log(`backup already holds "${held.name || '(unset)'}" — left untouched`);
    } else {
      const { rows: prev } = await db.query('SELECT * FROM company_profile WHERE id = $1', [existing[0].id]);
      fs.writeFileSync(backup, JSON.stringify(prev[0], null, 2));
      log(`previous profile "${prev[0].name || '(unset)'}" saved to ${path.basename(backup)}`);
    }
    log(`  restore it with: node scripts/restore-profile.js`);
  }
  if (existing[0]) {
    await db.query(
      `UPDATE company_profile SET ${cols.map((c, i) => `"${c}" = $${i + 1}`).join(', ')},
       setup_completed_at = NOW() WHERE id = $${cols.length + 1}`,
      [...cols.map(c => p[c]), existing[0].id]);
  } else {
    await db.query(
      `INSERT INTO company_profile (${cols.map(c => `"${c}"`).join(',')}, setup_completed_at)
       VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')}, NOW())`,
      cols.map(c => p[c]));
  }
  log(`organisation: ${p.name} (${p.gstin})`);

  /* ── 0.5 units of measure ───────────────────────────────────────────
     raw_materials.base_uom is a foreign key into the `uom` master, which
     ships with the units a metal fabricator needs — kg, mt, m, sqm. A
     furniture manufacturer buys board by the SHEET, which was not in it, so
     seeding failed on a foreign key.

     That is the product working correctly: units are configurable master
     data, not a hardcoded list. Each organisation registers what it trades
     in. Anything already present is left alone. */
  const neededUoms = [...new Set(ORG.materials.map(m => m[2]).concat(ORG.products.map(p2 => p2[1])))];
  let uomAdded = 0;
  for (const code of neededUoms) {
    const { rows } = await db.query('SELECT code FROM uom WHERE code = $1', [code]);
    if (rows[0]) continue;
    const meta = (ORG.uoms || {})[code];
    if (!meta) { log(`  ⚠ no definition for unit "${code}" — add it to ORG.uoms`); continue; }
    await db.query(
      `INSERT INTO uom (code, name, dimension, factor_to_base, is_base) VALUES ($1,$2,$3,$4,$5)`,
      [code, meta.name, meta.dimension, meta.factor ?? 1, !!meta.isBase]);
    uomAdded++;
  }
  log(`units of measure: ${neededUoms.length} needed, ${uomAdded} newly registered`);

  /* ── 1. customers ───────────────────────────────────────────────── */
  const customerIds = [];
  for (let c = 0; c < ORG.customers.length * SCALE; c++) {
    const [base, gstin, state, code] = ORG.customers[c % ORG.customers.length];
    const name = c < ORG.customers.length ? base : `${base} — Unit ${Math.floor(c / ORG.customers.length) + 1}`;
    const { rows } = await db.query(
      `INSERT INTO customers (owner_id, name, gstin, state, billing_address, tags)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [ownerId, name, gstin, state, `${between(1, 90)} Industrial Road, ${state}`, MARK]);
    customerIds.push(rows[0].id);
  }
  log(`customers: ${customerIds.length}`);

  /* ── 2. vendors ─────────────────────────────────────────────────── */
  const vendorIds = [];
  for (let v = 0; v < ORG.vendors.length * SCALE; v++) {
    const [base, type, gstin] = ORG.vendors[v % ORG.vendors.length];
    const name = v < ORG.vendors.length ? base : `${base} — Depot ${Math.floor(v / ORG.vendors.length) + 1}`;
    const { rows } = await db.query(
      `INSERT INTO vendors (owner_id, name, type, gstin, status, rating, address, "contactName", "contactPhone")
       VALUES ($1,$2,$3,$4,'Active',$5,$6,$7,$8) RETURNING id`,
      [ownerId, name, type, gstin, between(70, 98),
       `${between(1, 200)} Supply Lane ${MARK}`, `Contact ${v + 1}`, `+91 9${between(100000000, 999999999)}`]);
    vendorIds.push(rows[0].id);
  }
  log(`vendors: ${vendorIds.length}`);

  /* ── 3. raw materials ───────────────────────────────────────────── */
  const materialIds = [];
  for (let m = 0; m < ORG.materials.length * SCALE; m++) {
    const [base, category, uom, rate, moq, lead] = ORG.materials[m % ORG.materials.length];
    const name = m < ORG.materials.length ? base : `${base} (v${Math.floor(m / ORG.materials.length) + 1})`;
    const { rows } = await db.query(
      `INSERT INTO raw_materials (owner_id, material_code, name, category, unit, base_uom, purchase_uom, standard_rate, moq, lead_time_days)
       VALUES ($1,$2,$3,$4,$5,$5,$5,$6,$7,$8) RETURNING id`,
      /* raw_materials has no notes column, so the seed marker rides on
         material_code — which every seeded row needs anyway. */
      [ownerId, `${MARK}-RM${String(m + 1).padStart(4, '0')}`, name, category, uom, rate, moq, lead]);
    materialIds.push(rows[0].id);
  }
  log(`raw materials: ${materialIds.length}`);

  /* ── 4. vendor price lists — who can supply what, at what price ─── */
  let priceRows = 0;
  for (let i = 0; i < materialIds.length; i++) {
    const suppliers = between(1, 3);
    for (let s = 0; s < suppliers; s++) {
      const vId = vendorIds[(i * 3 + s) % vendorIds.length];
      const base = ORG.materials[i % ORG.materials.length][3];
      try {
        await db.query(
          `INSERT INTO vendor_items (owner_id, vendor_id, raw_material_id, price, price_uom, moq, lead_time_days, is_preferred, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [ownerId, vId, materialIds[i], r2(base * (0.92 + rnd() * 0.18)),
           ORG.materials[i % ORG.materials.length][2],
           ORG.materials[i % ORG.materials.length][4], between(3, 14), s === 0, MARK]);
        priceRows++;
      } catch { /* duplicate vendor+material pair — fine */ }
    }
  }
  log(`vendor price list: ${priceRows} rows`);

  /* ── 5. products and their bills of materials ───────────────────── */
  const productIds = [];
  let bomRows = 0;
  for (let s = 0; s < ORG.products.length * SCALE; s++) {
    const [base, uom, price, bom] = ORG.products[s % ORG.products.length];
    const name = s < ORG.products.length ? base : `${base} — Mk${Math.floor(s / ORG.products.length) + 1}`;
    const { rows } = await db.query(
      `INSERT INTO skus (owner_id, sku_code, name, unit, price, description)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [ownerId, `${MARK}-SK${String(s + 1).padStart(4, '0')}`, name, uom, price, `${MARK} flat-pack furniture`]);
    const skuId = rows[0].id;
    productIds.push({ id: skuId, name, price, bom });
    for (const [mi, qty] of bom) {
      const rmId = materialIds[mi % materialIds.length];
      const rm = ORG.materials[mi % ORG.materials.length];
      await db.query(
        `INSERT INTO sku_bom (sku_id, raw_material_id, component_name, qty_per_unit, uom, uom_code)
         VALUES ($1,$2,$3,$4,$5,$5)`,
        [skuId, rmId, rm[0], qty, rm[2]]);
      bomRows++;
    }
  }
  log(`products: ${productIds.length}  ·  BOM lines: ${bomRows}`);

  /* ── 6. stock on hand, THROUGH the ledger ───────────────────────────
     The first version inserted inventory balances directly. The balances
     looked right on screen, but stock_movements had nothing behind them, so
     /inventory/reconcile correctly reported drift on all 90 rows and the
     stock-loop suite went from 10/10 to 6/10.

     That was the product doing its job. A balance with no movement explaining
     it is exactly what a ledger exists to catch, and opening stock is not an
     exception — it is a movement like any other, which is how a real import
     of opening balances has to work too. */
  let stockRows = 0;
  for (let i = 0; i < materialIds.length; i++) {
    const rm = ORG.materials[i % ORG.materials.length];
    const qty = between(0, rm[4] * 3);
    const { rows: invRow } = await db.query(
      `INSERT INTO inventory (owner_id, "itemName", quantity, raw_material_id, base_uom)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [ownerId, `${rm[0]} ${MARK}`, qty, materialIds[i], rm[2]]);

    // The movement that explains the balance. Zero-quantity rows get none,
    // because nothing happened to them.
    if (qty > 0) {
      await db.query(
        /* movement_type is constrained to the ledger's own vocabulary —
           grn, production_*, dispatch, dispatch_reversal, adjustment,
           opening. 'opening' is the right one here; passing 'in' with
           ref_type 'opening' had those two the wrong way round. */
        `INSERT INTO stock_movements
           (inventory_id, raw_material_id, item_name, quantity, uom, movement_type, ref_type, note, created_by)
         VALUES ($1,$2,$3,$4,$5,'opening','seed',$6,$7)`,
        [invRow[0].id, materialIds[i], `${rm[0]} ${MARK}`, qty, rm[2],
         `Opening stock loaded by seed-org ${MARK}`, ownerId]);
    }
    stockRows++;
  }
  log(`stock rows: ${stockRows} (each with an opening movement behind it)`);

  /* ── 7-9. orders, production, dispatch, invoices ────────────────────
     Written in batches on one pooled client rather than a query per row.

     The first version issued a separate INSERT for every order, every line,
     every production record and every invoice — several thousand sequential
     round trips to a hosted database. It was slow and, at scale 1, the
     connection was dropped part-way through ("Connection terminated
     unexpectedly") leaving half a dataset behind. Multi-row inserts on a
     held client make it both fast and atomic. */
  const client = await db.getClient();
  let orders = [], prodCount = 0, outputCount = 0, dcCount = 0, invCount = 0, lineCount = 0;

  /* Insert many rows in one statement, chunked so the parameter count stays
     under Postgres's 65535 limit. */
  async function insertMany(table, columns, rows, { returning = null } = {}) {
    if (!rows.length) return [];
    const perRow = columns.length;
    const chunkSize = Math.max(1, Math.floor(60000 / perRow));
    const out = [];
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const params = [];
      const tuples = chunk.map(r => {
        const slots = r.map(v => {
          if (v && v.__raw) return v.__raw;          // literal SQL, e.g. CURRENT_DATE - 5
          params.push(v);
          return `$${params.length}`;
        });
        return `(${slots.join(',')})`;
      });
      const sql = `INSERT INTO ${table} (${columns.map(c => `"${c}"`).join(',')})
                   VALUES ${tuples.join(',')}${returning ? ` RETURNING ${returning}` : ''}`;
      const r = await client.query(sql, params);
      out.push(...(r.rows || []));
    }
    return out;
  }
  const raw = (sql) => ({ __raw: sql });

  try {
    await client.query('BEGIN');

    /* ── 7. customer orders ── */
    const orderCount = 24 * SCALE;
    const orderRows = [], planned = [];
    const custState = new Map();
    for (const id of customerIds) {
      const { rows } = await client.query('SELECT state FROM customers WHERE id = $1', [id]);
      custState.set(id, rows[0]?.state || '');
    }

    for (let o = 0; o < orderCount; o++) {
      const custId = pick(customerIds);
      const interstate = custState.get(custId) !== ORG.homeState;
      const lines = [];
      for (let l = 0; l < between(1, 4); l++) lines.push({ prod: pick(productIds), qty: between(20, 400) });

      const sub = r2(lines.reduce((s, l) => s + l.qty * l.prod.price, 0));
      const disc = r2(sub * (rnd() < 0.4 ? 0.03 : 0));
      const taxable = r2(sub - disc);
      const gst = r2(taxable * 0.18);
      const status = pick(['Open', 'Open', 'In Procurement', 'Partially Delivered', 'Delivered']);

      orderRows.push([ownerId, custId, `SO-${String(o + 1).padStart(5, '0')}`,
        raw(`CURRENT_DATE - ${between(0, 240)}`), status, MARK,
        sub, disc, 'flat', 18, interstate,
        interstate ? 0 : r2(gst / 2), interstate ? 0 : r2(gst / 2), interstate ? gst : 0,
        gst, r2(taxable + gst)]);
      planned.push({ lines, status, custId });
    }

    const inserted = await insertMany('customer_orders',
      ['owner_id', 'customer_id', 'order_number', 'order_date', 'status', 'notes',
       'sub_total', 'discount', 'discount_type', 'gst_rate', 'interstate',
       'cgst', 'sgst', 'igst', 'gst_total', 'total'],
      orderRows, { returning: 'id' });

    orders = inserted.map((r, i) => ({ id: r.id, ...planned[i] }));

    const itemRows = [];
    for (const o of orders) {
      for (const l of o.lines) {
        itemRows.push([o.id, l.prod.id, l.prod.name, l.qty, 'nos',
          l.prod.price, l.prod.price, r2(l.qty * l.prod.price)]);
      }
    }
    await insertMany('customer_order_items',
      ['customer_order_id', 'sku_id', 'description', 'quantity', 'unit', 'target_price', 'rate', 'amount'],
      itemRows);
    lineCount = itemRows.length;
    log(`customer orders: ${orders.length}  ·  lines: ${lineCount}`);

    /* ── 8. production ── */
    const prodRows = [], prodMeta = [];
    for (const o of orders) {
      if (rnd() > 0.55) continue;
      for (const l of o.lines) {
        prodRows.push([ownerId, `PR-${String(++prodCount).padStart(5, '0')}`, l.prod.name, l.qty, 'nos',
          o.id, l.prod.id, pick(['Planned', 'In Progress', 'In Progress', 'Completed']), MARK]);
        prodMeta.push({ name: l.prod.name, qty: l.qty, booked: rnd() < 0.6 });
      }
    }
    const prods = await insertMany('production_orders',
      ['owner_id', 'prod_number', 'product_name', 'planned_qty', 'output_uom',
       'customer_order_id', 'sku_id', 'status', 'notes'],
      prodRows, { returning: 'id' });

    const outRows = [];
    prods.forEach((p2, i) => {
      const m = prodMeta[i];
      if (!m.booked) return;
      outRows.push([p2.id, m.name, Math.floor(m.qty * (0.3 + rnd() * 0.7)), 'nos']);
      outputCount++;
    });
    await insertMany('production_output',
      ['production_order_id', 'item_name', 'output_qty', 'uom'], outRows);
    log(`production orders: ${prods.length}  ·  with output booked: ${outputCount}`);

    /* ── 9. dispatch and invoices ── */
    const shipped = orders.filter(o => /Delivered/.test(o.status));
    const dcRows = shipped.map(o => [ownerId, o.custId, o.id,
      `DC-${String(++dcCount).padStart(5, '0')}`, raw(`CURRENT_DATE - ${between(0, 60)}`),
      'Dispatched', r2(o.lines.reduce((s, l) => s + l.qty * l.prod.price, 0)), MARK]);
    const dcs = await insertMany('delivery_challans',
      ['owner_id', 'customer_id', 'customer_order_id', 'challan_number', 'challan_date',
       'status', 'total_value', 'notes'], dcRows, { returning: 'id' });

    const dcItemRows = [];
    dcs.forEach((d, i) => {
      for (const l of shipped[i].lines) {
        dcItemRows.push([d.id, l.prod.name, 'nos', l.qty, l.prod.price, r2(l.qty * l.prod.price)]);
      }
    });
    await insertMany('delivery_challan_items',
      ['delivery_challan_id', 'description', 'uom', 'quantity', 'rate', 'amount'], dcItemRows);

    /* Invoices carry the order's own tax split, so the invoice and the order
       it came from cannot disagree about CGST/SGST vs IGST. */
    const billed = shipped.filter(() => rnd() < 0.8);
    const invRows = [];
    for (const o of billed) {
      const { rows: co } = await client.query('SELECT * FROM customer_orders WHERE id = $1', [o.id]);
      const c = co[0];
      invRows.push([ownerId, c.customer_id, o.id, `IN-${String(++invCount).padStart(5, '0')}`,
        raw(`CURRENT_DATE - ${between(0, 55)}`), c.sub_total, c.discount, 18, c.interstate,
        c.cgst, c.sgst, c.igst, c.gst_total, c.total,
        pick(['Sent', 'Sent', 'Part paid', 'Paid']), MARK]);
    }
    const invs = await insertMany('sales_invoices',
      ['owner_id', 'customer_id', 'customer_order_id', 'invoice_number', 'invoice_date',
       'sub_total', 'discount', 'gst_rate', 'interstate', 'cgst', 'sgst', 'igst',
       'gst_total', 'net_amount', 'status', 'notes'], invRows, { returning: 'id' });

    const invItemRows = [];
    invs.forEach((iv, i) => {
      for (const l of billed[i].lines) {
        invItemRows.push([iv.id, l.prod.name, 'nos', l.qty, l.prod.price, r2(l.qty * l.prod.price)]);
      }
    });
    await insertMany('sales_invoice_items',
      ['sales_invoice_id', 'description', 'uom', 'quantity', 'rate', 'amount'], invItemRows);

    log(`delivery challans: ${dcs.length}  ·  invoices: ${invs.length}`);

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  console.log(`\n  seeded in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`  remove with: node scripts/seed-org.js --org=${orgKey} --clean\n`);
  process.exit(0);
})().catch(e => { console.error('\nseed failed:', e.message); process.exit(1); });
