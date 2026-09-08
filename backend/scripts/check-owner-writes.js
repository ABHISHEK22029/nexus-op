#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   Every INSERT into an owned table must write owner_id.

   The failure this catches is quiet and nasty. A table grows an owner_id
   column, the lists learn to filter on it, and one create is missed. The
   row is written with owner_id NULL, and from that moment it belongs to
   nobody: the organisation that created it cannot see it in its own list,
   and neither can anyone else. Nothing errors. The record is simply gone.

   That is exactly what happened to POST /vendors, and then again to
   /boq, /mb, /indent and /work-orders — five times, in the same shape,
   because each was found by hand.

   Reading the column list of an INSERT is mechanical, so a script should
   be doing it. The table list comes from the live database rather than a
   hardcoded array, so a table that grows owner_id tomorrow is covered
   tomorrow without anyone remembering to add it here.
   ══════════════════════════════════════════════════════════════════════ */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ROOT = path.join(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'migrations', 'scripts']);

/* Tables an INSERT may legitimately leave unowned. Keep this short and
   keep the reason next to it — an entry here is a claim that the rows
   are not any one organisation's, which is rarely true. */
const UNOWNED_OK = {
  users: 'a person is placed in an org by org_id, not owner_id',
  document_sequences: 'keyed by (owner_id, doc_type, fy) in an upsert, checked separately',
};

function sourceFiles(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) sourceFiles(path.join(dir, e.name), out);
    } else if (e.name.endsWith('.js')) out.push(path.join(dir, e.name));
  }
  return out;
}

(async () => {
  const c = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const { rows } = await c.query(
    `SELECT table_name FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'owner_id'`
  );
  await c.end();
  const owned = new Set(rows.map(r => r.table_name));

  const problems = [];
  for (const file of sourceFiles(ROOT)) {
    const src = fs.readFileSync(file, 'utf8');

    /* INSERT INTO <table> ( ... )  — the column list runs to the matching
       close paren before VALUES. Quoted identifiers are stripped so
       "projectId" and projectId compare the same. */
    const re = /INSERT\s+INTO\s+"?([a-z_][a-z0-9_]*)"?\s*\(([^)]*)\)/gis;
    let m;
    while ((m = re.exec(src)) !== null) {
      const table = m[1].toLowerCase();
      if (!owned.has(table) || UNOWNED_OK[table]) continue;
      const cols = m[2].replace(/"/g, '').toLowerCase();
      if (/\bowner_id\b/.test(cols)) continue;

      /* Some inserts build their column list at runtime — `INSERT INTO
         vendors (${quoted})` — and put the owner in the parameter array.
         The column list cannot answer the question there, so look at the
         statement's neighbourhood instead. Reporting those as failures
         made the check cry wolf on two handlers that were already correct,
         and a check people learn to ignore is worse than no check. */
      const line = src.slice(0, m.index).split('\n').length;
      if (cols.includes('${')) {
        const near = src.split('\n').slice(Math.max(0, line - 12), line + 12).join('\n');
        if (/owner_?[iI]d|orgId/.test(near)) continue;
      }

      problems.push({ file: path.relative(ROOT, file), line, table });
    }
  }

  /* The demo seeders write unowned rows too, but they are hand-run
     development scripts, not request handlers, and failing the build on
     them would mean the check is permanently red and therefore ignored.
     They are still reported — an unowned seeded row is invisible to every
     organisation, which is where orphaned demo data comes from. */
  const isSeeder = p => /^seed[_-]/.test(path.basename(p.file));
  const seeded = problems.filter(isSeeder);
  const shipped = problems.filter(p => !isSeeder(p));

  if (seeded.length) {
    console.log(`\n⚠️  ${seeded.length} INSERT(s) in demo seeders leave owner_id null —`);
    console.log(`   those rows belong to no organisation and show up in nobody's list:`);
    for (const p of seeded) console.log(`   ${p.file}:${p.line}  → ${p.table}`);
    console.log('');
  }

  if (shipped.length) {
    console.error(`\n❌ ${shipped.length} INSERT(s) into an owned table without owner_id:\n`);
    for (const p of shipped) {
      console.error(`   ${p.file}:${p.line}  → ${p.table}`);
    }
    console.error(`\n   A row written this way has owner_id NULL and is invisible to`);
    console.error(`   the organisation that created it the moment the list is scoped.\n`);
    process.exit(1);
  }
  console.log(`✅ owner writes: every INSERT into an owned table sets owner_id (${owned.size} owned tables)`);
})().catch(e => { console.error('threw:', e.message); process.exit(1); });
