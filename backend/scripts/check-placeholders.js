#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════
   check-placeholders — catch SQL placeholders built without their `$`.

   Written after shipping this bug twice. Both times a scripted edit dropped
   a `$` from a template literal, turning

       `owner_id = $${params.length}`   (placeholder, correct)
   into
       `owner_id = ${params.length}`    (the LITERAL integer 1)

   The first time it produced `WHERE id = 2` and Postgres complained about
   the parameter count, so it surfaced immediately. The second time it
   produced `WHERE owner_id = 1`, which is valid SQL that runs happily and
   silently returns another tenant's rows — no error, no crash, just a data
   leak that a passing test suite would never notice.

   Valid SQL that means the wrong thing is the dangerous kind. Hence a
   linter rather than a unit test.

   Run: node scripts/check-placeholders.js     (exit 1 on any finding)
   ══════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SKIP = new Set(['node_modules', '.git', 'migrations', 'scripts']);

/* A comparison or IN against an interpolated .length that is NOT preceded by
   `$`. The negative lookbehind on `$` is the whole point of the check. */
const BAD = /(?<![$])\$\{\s*\w+\.length\s*\}/g;

/* Only flag when it sits where a placeholder belongs — after a comparison
   operator or inside a VALUES/IN list — so ordinary string building
   (`found ${rows.length} items`) doesn't trip it. */
const SQLISH = /(?:=|<|>|<=|>=|<>|!=|\bIN\b|\bVALUES\b|,)\s*$/i;

let findings = [];

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.js')) scan(p);
  }
}

function scan(file) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    for (const m of line.matchAll(BAD)) {
      const before = line.slice(0, m.index);
      if (SQLISH.test(before)) {
        findings.push({
          file: path.relative(ROOT, file),
          line: i + 1,
          text: line.trim().slice(0, 110),
        });
      }
    }
  });
}

walk(ROOT);

if (findings.length) {
  console.error(`\n❌ ${findings.length} SQL placeholder(s) missing their "$":\n`);
  for (const f of findings) {
    console.error(`   ${f.file}:${f.line}`);
    console.error(`      ${f.text}`);
  }
  console.error('\n   This produces a LITERAL integer instead of a bind parameter.');
  console.error('   `owner_id = ${params.length}` becomes `owner_id = 1` — valid SQL');
  console.error('   that silently returns the wrong tenant\'s rows.');
  console.error('   Write `owner_id = $${params.length}` instead.\n');
  process.exit(1);
}

console.log('✅ SQL placeholders: all interpolated params carry their "$"');
