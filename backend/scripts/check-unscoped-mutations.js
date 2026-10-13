#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════
   check-unscoped-mutations — find UPDATE/DELETE by id with no owner check.

   Read leaks expose data. WRITE leaks let another tenant change or destroy
   yours, which is strictly worse, and they are easier to miss because
   nothing looks wrong until a row is already gone.

   The first hand-written grep for this missed
       UPDATE customer_orders SET status = $1 WHERE id = $2
   because it searched for the literal `WHERE id = $` on the same line as
   the UPDATE keyword, and the pipeline that filtered out owner_id lines
   silently swallowed the rest. Hence a real parser rather than a one-liner:
   it walks each exported handler, finds the statements inside it, and asks
   whether an id-addressed write is accompanied by an owner condition
   ANYWHERE in that handler — which is what actually makes it safe.

   It used to read controllers/ only. index.js and routes/ register their
   handlers inline, and that is exactly where the unchecked ones were: RA
   bill approve/pay/reject/delete, indent status, milestones, the BOM — all
   writes by id alone, none of them seen by this check.
   ══════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIRS = ['controllers'];
/* Files whose handlers are registered inline (app.patch(...), router.post(...))
   rather than exported. */
const ROUTE_FILES = [
  'index.js',
  ...fs.readdirSync(path.join(ROOT, 'routes')).filter(f => f.endsWith('.js')).map(f => path.join('routes', f)),
];

/* Tables that are genuinely global or admin-administered. A write here is
   guarded by role (deny-by-default puts /admin behind Administrator), not
   by owner_id, and listing them keeps the report free of noise. */
const NOT_OWNED = new Set([
  'users', 'role_definitions', 'role_permissions', 'role_change_log',
  'company_profile', 'kb_articles', 'notifications', 'activities',
  'automation_settings', 'uom', 'item_uom', 'metal_prices',
  /* A person's own reset codes, keyed on the user like notifications. */
  'password_reset_codes',
]);

/* What counts as establishing ownership. ownerClause and ownsPo are
   index.js's own spellings of the same check. */
const GUARD = /owner_id|scopedById|andOwner|assertOwned|isCrossTenant|projScope|ownerClause|ownsPo/;

const findings = [];

/* Comments are blanked (line numbers kept). A handler whose comment says
   "owner_id was never checked here" is not thereby checked — and in the
   inline route files the comment above one handler would otherwise count
   for the handler before it. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + ' '.repeat(Math.max(m.length - p.length, 0)));
}

function handlersOf(src) {
  const out = [];
  const re = /^exports\.([a-zA-Z0-9_]+)\s*=\s*async[\s\S]*?^};/gm;
  for (const m of src.matchAll(re)) out.push({ name: m[1], body: m[0], index: m.index });
  return out;
}

/* Inline handlers: each top-level statement — a line starting in column 0
   — up to the next one. `app.patch('/x/:id', async (req, res) => { … })`
   is one statement; so is `function billTransition(action) { … }`, which
   returns the handler several routes share. */
function statementsOf(src) {
  const out = [];
  const lines = src.split('\n');
  let start = null;
  const flush = (end) => {
    if (start === null) return;
    const body = lines.slice(start, end).join('\n');
    const head = lines[start].trim();
    const route = head.match(/^(?:app|router)\.(get|post|put|patch|delete|use)\(\s*['"`]([^'"`]*)/);
    const fn = head.match(/^(?:async\s+)?function\s+([A-Za-z0-9_$]+)|^const\s+([A-Za-z0-9_$]+)/);
    const name = route ? `${route[1].toUpperCase()} ${route[2]}` : fn ? (fn[1] || fn[2]) : head.slice(0, 50);
    out.push({ name, body });
  };
  lines.forEach((l, i) => {
    if (/^[A-Za-z_$]/.test(l)) { flush(i); start = i; }
  });
  flush(lines.length);
  return out;
}

function check(rel, h) {
  // Does this handler establish ownership at all, anywhere?
  /* assertOwned() is the guard added for write handlers: it verifies
     ownership up front and 404s, so the writes below it are safe without
     each carrying its own owner_id condition. */
  const guarded = GUARD.test(h.body);

  /* A write to a row this handler CREATED needs no ownership check —
     nobody else can own a row that did not exist a moment ago. Both
     remaining reports were this: BillController writes bill_number back
     to the bill it just inserted, and StockController updates the
     inventory row resolveInventoryRow just returned.

     Recognised by the handler containing an INSERT … RETURNING id (or a
     resolve helper) BEFORE the write. Narrow on purpose — a blanket
     exemption would hide the real thing this checker exists to find. It
     was blanket for a while: any RETURNING id anywhere, so
     `UPDATE milestones … WHERE id = $3 RETURNING id` exempted itself. */
  const creations = [...h.body.matchAll(/INSERT\s+INTO[\s\S]{0,800}?RETURNING\s+id|resolveInventoryRow\(/gi)].map(m => m.index);
  const createsItsOwnRow = (at) => creations.some(i => i < at);

  const writes = [
    ...h.body.matchAll(/UPDATE\s+([a-z_]+)\s+SET[\s\S]{0,400}?WHERE\s+([^`;]*)/gi),
    ...h.body.matchAll(/DELETE\s+FROM\s+([a-z_]+)\s*[\s\S]{0,200}?WHERE\s+([^`;]*)/gi),
  ];

  for (const w of writes) {
    const table = w[1].toLowerCase();
    const where = w[2];
    if (NOT_OWNED.has(table)) continue;
    // Only id-addressed writes are the risk: a write keyed on a parent id
    // that was itself checked is fine, but we cannot tell, so we require
    // the handler to mention ownership somewhere.
    /* A child row addressed by its parent's id — `DELETE FROM sku_bom
       WHERE sku_id = $1` — is the same risk one level down: the BOM route
       deleted another company's recipe that way. */
    if (!/\b(?:[a-z]+_)*id\s*=\s*\$/.test(where)) continue;
    if (guarded || createsItsOwnRow(w.index)) continue;
    findings.push({ file: rel, handler: h.name, table, where: where.trim().slice(0, 60) });
  }
}

for (const d of DIRS) {
  const dir = path.join(ROOT, d);
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.js')) continue;
    const file = path.join(dir, f);
    const src = stripComments(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'));
    for (const h of handlersOf(src)) check(path.relative(ROOT, file), h);
  }
}
for (const rel of ROUTE_FILES) {
  const src = stripComments(fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n'));
  for (const h of statementsOf(src)) check(rel, h);
}

if (findings.length) {
  console.error(`\n❌ ${findings.length} write(s) addressed by id with no ownership check:\n`);
  for (const f of findings) {
    console.error(`   ${f.file} :: ${f.handler}()`);
    console.error(`      ${f.table}  WHERE ${f.where}`);
  }
  console.error('\n   Another tenant can change or delete these rows by guessing an id.');
  console.error('   Scope the handler with scopedById() or an owner_id condition.\n');
  process.exit(1);
}
console.log('✅ mutations: every id-addressed write establishes ownership');
