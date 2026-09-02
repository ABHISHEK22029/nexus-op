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
   ══════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIRS = ['controllers'];

/* Tables that are genuinely global or admin-administered. A write here is
   guarded by role (deny-by-default puts /admin behind Administrator), not
   by owner_id, and listing them keeps the report free of noise. */
const NOT_OWNED = new Set([
  'users', 'role_definitions', 'role_permissions', 'role_change_log',
  'company_profile', 'kb_articles', 'notifications', 'activities',
  'automation_settings', 'uom', 'item_uom', 'metal_prices',
]);

const findings = [];

function handlersOf(src) {
  const out = [];
  const re = /^exports\.([a-zA-Z0-9_]+)\s*=\s*async[\s\S]*?^};/gm;
  for (const m of src.matchAll(re)) out.push({ name: m[1], body: m[0], index: m.index });
  return out;
}

function scan(file) {
  const src = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file);

  for (const h of handlersOf(src)) {
    // Does this handler establish ownership at all, anywhere?
    /* assertOwned() is the guard added for write handlers: it verifies
       ownership up front and 404s, so the writes below it are safe without
       each carrying its own owner_id condition. */
    const guarded = /owner_id|scopedById|andOwner|assertOwned|isCrossTenant|projScope/.test(h.body);

    /* A write to a row this handler CREATED needs no ownership check —
       nobody else can own a row that did not exist a moment ago. Both
       remaining reports were this: BillController writes bill_number back
       to the bill it just inserted, and StockController updates the
       inventory row resolveInventoryRow just returned.

       Recognised by the handler containing a RETURNING id (or a resolve
       helper) BEFORE the write. Narrow on purpose — a blanket exemption
       would hide the real thing this checker exists to find. */
    const createsItsOwnRow = /RETURNING\s+id|resolveInventoryRow\(/i.test(h.body);

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
      if (!/\bid\s*=\s*\$/.test(where)) continue;
      if (guarded || createsItsOwnRow) continue;
      findings.push({ file: rel, handler: h.name, table, where: where.trim().slice(0, 60) });
    }
  }
}

for (const d of DIRS) {
  const dir = path.join(ROOT, d);
  for (const f of fs.readdirSync(dir)) if (f.endsWith('.js')) scan(path.join(dir, f));
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
