#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   audit-depth — the levels the load test doesn't reach.

   The load test measures how long things take. This asks different
   questions: how much is being SENT, what is unbounded, what integrity the
   database does not enforce, and what data is already inconsistent.

   Runs against whatever is in the database — no seeding, no cleanup.
   ══════════════════════════════════════════════════════════════════════ */
const db = require('../db');
const fs = require('fs');
const path = require('path');

const BASE = process.env.AUDIT_BASE || 'http://localhost:5099';
const EMAIL = process.env.AUDIT_EMAIL, PASSWORD = process.env.AUDIT_PASSWORD;
if (!EMAIL || !PASSWORD) { console.error('set AUDIT_EMAIL / AUDIT_PASSWORD'); process.exit(1); }

let TOKEN = '';
const findings = [];
const finding = (sev, area, what, detail) => findings.push({ sev, area, what, detail });
const sql = (q, p = []) => db.query(q, p).then(r => r.rows);
const kb = (n) => `${(n / 1024).toFixed(1)}KB`;

async function get(path) {
  const t0 = performance.now();
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  const text = await res.text();
  return { ok: res.ok, status: res.status, bytes: Buffer.byteLength(text), dt: performance.now() - t0, text };
}

/* ── 1. Payload size: what is actually going down the wire ── */
async function payloads() {
  console.log('\n━━ 1. RESPONSE SIZE ━━\n');
  const probes = [
    ['material-requirements', '/material-requirements'],
    ['purchase plan', '/material-requirements/purchase-plan'],
    ['inventory reconcile', '/inventory/reconcile'],
    ['raw-materials (no limit)', '/raw-materials'],
    ['vendor-items (no limit)', '/vendor-items'],
    ['customer-orders (no limit)', '/customer-orders'],
    ['inventory (no limit)', '/inventory'],
    ['po (no limit)', '/po'],
  ];
  for (const [label, p] of probes) {
    const r = await get(p);
    if (!r.ok) { console.log(`  ⚠ ${label.padEnd(30)} HTTP ${r.status}`); continue; }
    let count = '—';
    try { const d = JSON.parse(r.text); count = Array.isArray(d) ? d.length : (d.items?.length ?? d.total ?? '—'); } catch {}
    const flag = r.bytes > 2_000_000 ? '🔴' : r.bytes > 500_000 ? '🟠' : '✅';
    console.log(`  ${flag} ${label.padEnd(30)} ${kb(r.bytes).padStart(10)}  ${String(count).padStart(6)} rows`);
    if (r.bytes > 2_000_000) {
      finding('HIGH', 'Payload', `${label} sends ${kb(r.bytes)}`,
        'a single response of this size stalls a phone on site and is mostly rows nobody scrolled to');
    } else if (r.bytes > 500_000) {
      finding('MED', 'Payload', `${label} sends ${kb(r.bytes)}`, 'large enough to feel on a slow connection');
    }
  }
}

/* ── 2. Which endpoints have no upper bound at all ── */
async function unbounded() {
  console.log('\n━━ 2. UNBOUNDED RESPONSES ━━\n');
  const index = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
  const ctrlDir = path.join(__dirname, '..', 'controllers');
  const ctrl = fs.readdirSync(ctrlDir).map(f => fs.readFileSync(path.join(ctrlDir, f), 'utf8')).join('\n');
  const all = index + ctrl;

  /* runList caps everything at HARD_CAP even with no ?limit. Anything that
     builds its own SELECT and returns rows directly does not. */
  const selectsWithoutLimit = [...all.matchAll(/db\.query\(\s*`\s*SELECT[\s\S]{0,700}?`/g)]
    .map(m => m[0])
    .filter(q => !/LIMIT/i.test(q) && !/COUNT\(|SUM\(|EXISTS|information_schema|pg_/i.test(q));
  console.log(`  raw SELECTs with no LIMIT and no aggregate: ${selectsWithoutLimit.length}`);
  if (selectsWithoutLimit.length > 8) {
    finding('MED', 'Scale', `${selectsWithoutLimit.length} queries return rows with no LIMIT`,
      'these grow with the table; runList-backed endpoints are capped, hand-written ones are not');
  }

  // material-requirements returns EVERY material with no paging parameter.
  const mr = await get('/material-requirements?limit=5');
  try {
    const d = JSON.parse(mr.text);
    const n = d.items?.length ?? 0;
    console.log(`  material-requirements?limit=5 returned ${n} rows  ${n > 5 ? '🔴 limit ignored' : '✅'}`);
    if (n > 5) finding('HIGH', 'Scale', 'material-requirements ignores ?limit',
      `asked for 5, got ${n} — the deficiency engine has no paging, so the whole catalogue ships every time`);
  } catch {}
}

/* ── 3. What the database does NOT enforce ── */
async function integrity() {
  console.log('\n━━ 3. REFERENTIAL INTEGRITY ━━\n');
  const fkChecks = [
    ['customer_order_items.customer_order_id', 'customer_order_items', 'customer_order_id', 'customer_orders'],
    ['customer_order_items.sku_id', 'customer_order_items', 'sku_id', 'skus'],
    ['sku_bom.raw_material_id', 'sku_bom', 'raw_material_id', 'raw_materials'],
    ['vendor_items.vendor_id', 'vendor_items', 'vendor_id', 'vendors'],
    ['inventory.raw_material_id', 'inventory', 'raw_material_id', 'raw_materials'],
    ['sales_invoices.customer_id', 'sales_invoices', 'customer_id', 'customers'],
    ['purchase_orders.vendorId', 'purchase_orders', '"vendorId"', 'vendors'],
    ['delivery_challans.customer_id', 'delivery_challans', 'customer_id', 'customers'],
  ];
  const noFk = [];
  const orphaned = [];
  for (const [label, table, col, ref] of fkChecks) {
    const c = col.replace(/"/g, '');
    const has = await sql(`
      SELECT 1 FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
      WHERE tc.table_name = $1 AND tc.constraint_type = 'FOREIGN KEY' AND kcu.column_name = $2 LIMIT 1`,
      [table, c]);
    if (!has.length) noFk.push(label);
    // Orphans regardless of whether a constraint exists.
    try {
      const o = await sql(
        `SELECT COUNT(*)::int n FROM ${table} t WHERE t.${col} IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM ${ref} r WHERE r.id = t.${col})`);
      if (o[0].n > 0) orphaned.push(`${label}: ${o[0].n} orphan(s)`);
    } catch { /* column shape differs */ }
  }
  console.log(`  columns with NO foreign key constraint: ${noFk.length}/${fkChecks.length}`);
  noFk.forEach(n => console.log(`     ${n}`));
  if (noFk.length) {
    finding('MED', 'Integrity', `${noFk.length} key relationships are not enforced by the database`,
      noFk.join(', ') + ' — a deleted customer leaves invoices pointing at nothing, and nothing stops it');
  }
  if (orphaned.length) {
    console.log(`  🔴 orphaned rows already present:`);
    orphaned.forEach(o => console.log(`     ${o}`));
    finding('HIGH', 'Integrity', 'orphaned rows already exist', orphaned.join('; '));
  } else console.log('  ✅ no orphaned rows found');
}

/* ── 4. Data already inconsistent ── */
async function consistency() {
  console.log('\n━━ 4. EXISTING DATA CONSISTENCY ━━\n');
  const checks = [
    ['orders whose total ≠ sum of their lines',
     `SELECT COUNT(*)::int n FROM customer_orders o
      WHERE COALESCE(o.sub_total,0) > 0
        AND ABS(COALESCE(o.sub_total,0) - COALESCE((SELECT SUM(amount) FROM customer_order_items WHERE customer_order_id=o.id),0)) > 1`],
    ['invoices whose amount_paid exceeds net_amount',
     `SELECT COUNT(*)::int n FROM sales_invoices WHERE COALESCE(amount_paid,0) > COALESCE(net_amount,0) + 0.01`],
    ['invoices marked Paid with a balance outstanding',
     `SELECT COUNT(*)::int n FROM sales_invoices WHERE status='Paid' AND COALESCE(net_amount,0) - COALESCE(amount_paid,0) > 1`],
    ['negative stock',
     `SELECT COUNT(*)::int n FROM inventory WHERE quantity < 0`],
    ['stock rows with no material or product link',
     `SELECT COUNT(*)::int n FROM inventory WHERE raw_material_id IS NULL AND sku_id IS NULL`],
    ['products with no bill of materials',
     `SELECT COUNT(*)::int n FROM skus s WHERE NOT EXISTS (SELECT 1 FROM sku_bom b WHERE b.sku_id=s.id)`],
    ['materials nobody supplies',
     `SELECT COUNT(*)::int n FROM raw_materials m WHERE NOT EXISTS (SELECT 1 FROM vendor_items v WHERE v.raw_material_id=m.id)`],
    ['order lines not linked to a product',
     `SELECT COUNT(*)::int n FROM customer_order_items WHERE sku_id IS NULL`],
    ['challans dispatched but stock never applied',
     `SELECT COUNT(*)::int n FROM delivery_challans WHERE status IN ('Dispatched','Delivered') AND stock_applied = FALSE`],
  ];
  for (const [label, q] of checks) {
    try {
      const n = (await sql(q))[0].n;
      const bad = n > 0;
      console.log(`  ${bad ? '🟠' : '✅'} ${label.padEnd(48)} ${n}`);
      if (bad) {
        const sev = /exceeds|marked Paid|negative|never applied/.test(label) ? 'HIGH' : 'MED';
        finding(sev, 'Data', `${n} × ${label}`, sev === 'HIGH'
          ? 'this corrupts money or stock and will not fix itself'
          : 'blocks features that depend on the link being present');
      }
    } catch (e) { console.log(`  ⚠ ${label} — ${e.message.slice(0, 50)}`); }
  }
}

/* ── 5. Feature parity across list endpoints ── */
async function parity() {
  console.log('\n━━ 5. FEATURE PARITY ACROSS LISTS ━━\n');
  const eps = ['raw-materials', 'skus', 'vendors', 'customers', 'customer-orders',
    'sales-invoices', 'sales-quotations', 'delivery-challans', 'credit-debit-notes',
    'po', 'bills', 'grn-bills', 'vendor-items', 'quotations', 'milestones', 'inventory'];
  const missingSummary = [], ignoresLimit = [];
  for (const ep of eps) {
    const r = await get(`/${ep}?limit=3`);
    if (!r.ok) continue;
    let d; try { d = JSON.parse(r.text); } catch { continue; }
    if (Array.isArray(d)) { ignoresLimit.push(ep); continue; }
    if (d.summary === undefined) missingSummary.push(ep);
    if ((d.items?.length ?? 0) > 3) ignoresLimit.push(ep);
  }
  console.log(`  endpoints with no summary aggregate: ${missingSummary.length ? missingSummary.join(', ') : 'none'}`);
  console.log(`  endpoints ignoring ?limit:           ${ignoresLimit.length ? ignoresLimit.join(', ') : 'none'}`);
  if (missingSummary.length) {
    finding('MED', 'Parity', `${missingSummary.length} list(s) have no summary aggregate`,
      missingSummary.join(', ') + ' — their pages must either show no totals or sum the visible page, which is wrong after page 1');
  }
  if (ignoresLimit.length) {
    finding('HIGH', 'Parity', `${ignoresLimit.length} list(s) ignore ?limit`, ignoresLimit.join(', '));
  }
}

(async () => {
  const login = await fetch(`${BASE}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  }).then(r => r.json());
  TOKEN = login.token;
  if (!TOKEN) { console.error('no token'); process.exit(1); }

  await payloads();
  await unbounded();
  await integrity();
  await consistency();
  await parity();

  console.log('\n\n══════════════ FINDINGS ══════════════\n');
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
