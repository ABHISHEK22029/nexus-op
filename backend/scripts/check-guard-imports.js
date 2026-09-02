#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════
   check-guard-imports — a security helper that isn't imported is a 500,
   not a guard.

   Three hand-written assertOwned() calls went into SalesInvoiceController
   without the import. The handler then threw a ReferenceError, which came
   back as HTTP 500 — so the write was blocked, but by accident, and the
   endpoint was broken for its legitimate owner too. The tenant probe read
   500 and reported "WRITE ALLOWED", which was wrong in the other direction.

   Neither the syntax check nor `require()` catches it: the reference only
   evaluates when the handler runs. Same class as the JSX and hook checks on
   the frontend — code that is fine until the line executes.
   ══════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/* helper -> the module it must come from */
const HELPERS = {
  assertOwned: 'shared/ownerScope',
  scopedById: 'shared/ownerScope',
  andOwner: 'shared/ownerScope',
  isCrossTenant: 'shared/roles',
  can: 'shared/roles',
  permissionsFor: 'shared/roles',
  runList: 'shared/listQuery',
  computeOrder: 'shared/orderTotals',
  amountInWords: 'shared/amountInWords',
};

const findings = [];

/* Comments mention these helpers by name — AdminController's header explains
   that "can() short-circuits Administrator in code". Scanning raw text
   reported that as a missing import, which is the kind of false positive
   that gets a checker switched off. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))  // keep line numbers
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + ' '.repeat(Math.max(m.length - p.length, 0)));
}

function scan(file, rel) {
  const raw = fs.readFileSync(file, 'utf8');
  const src = stripComments(raw);
  for (const [helper, mod] of Object.entries(HELPERS)) {
    // Called somewhere?
    const called = new RegExp(`\\b${helper}\\s*\\(`).test(src);
    if (!called) continue;
    // Declared locally? (a file may define its own amountInWords)
    if (new RegExp(`function\\s+${helper}\\b|const\\s+${helper}\\s*=`).test(src)) continue;
    // Imported from the right module?
    const importRe = new RegExp(
      `require\\(['"][^'"]*${mod.replace('/', '\\/')}['"]\\)`);
    const importLines = src.split('\n').filter(l => importRe.test(l)).join('\n');
    if (importLines.includes(helper)) continue;

    const line = src.split('\n').findIndex(l => new RegExp(`\\b${helper}\\s*\\(`).test(l)) + 1;
    findings.push({ file: rel, line, helper, mod });
  }
}

for (const dir of ['controllers', 'routes']) {
  const d = path.join(ROOT, dir);
  if (!fs.existsSync(d)) continue;
  for (const f of fs.readdirSync(d)) {
    if (f.endsWith('.js')) scan(path.join(d, f), `${dir}/${f}`);
  }
}

if (findings.length) {
  console.error(`\n❌ ${findings.length} helper(s) called but never imported:\n`);
  for (const f of findings) {
    console.error(`   ${f.file}:${f.line}  ${f.helper}()  — needs require('../${f.mod}')`);
  }
  console.error('\n   These throw ReferenceError at request time and surface as HTTP 500.');
  console.error('   For a security helper that means the guard is not running.\n');
  process.exit(1);
}
console.log('✅ guard imports: every security helper called is imported');
