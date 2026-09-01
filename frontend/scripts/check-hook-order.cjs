#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════
   check-hook-order — find hooks called after an early return.

   React requires every hook to run in the same order on every render, so a
   hook placed BELOW an `if (x) return …` inside a component is a bug that
   fires the moment that condition flips: "rendered more hooks than during
   the previous render", and the screen white-screens.

   Written after doing exactly that in AppNav — useBadges() sat below
   `if (loading) return`, which meant it would have crashed on the first
   paint of every page, since `loading` always starts true and then flips.
   The build was perfectly happy with it, as it is with every other runtime
   error in this codebase.

   Deliberately conservative: only flags a hook call that appears after a
   top-level early return within the same component function, which is the
   shape that actually breaks.
   ══════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const HOOK = /\b(use[A-Z][A-Za-z0-9_]*)\s*\(/;
const EARLY_RETURN = /^\s{2}if\s*\(.*\)\s*return\b/;
const COMPONENT_START = /^(?:export\s+default\s+)?(?:export\s+)?function\s+[A-Z]/;
const ARROW_COMPONENT = /^(?:export\s+default\s+)?const\s+[A-Z][A-Za-z0-9_]*\s*=\s*\(/;

const findings = [];

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); }
    else if (/\.(jsx|tsx)$/.test(e.name)) scan(p);
  }
}

function scan(file) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  let inComponent = false;
  let sawEarlyReturn = 0;

  lines.forEach((line, i) => {
    if (COMPONENT_START.test(line) || ARROW_COMPONENT.test(line)) {
      inComponent = true; sawEarlyReturn = 0; return;
    }
    // A line with no indentation ends the component body.
    if (inComponent && /^\}/.test(line)) { inComponent = false; sawEarlyReturn = 0; return; }
    if (!inComponent) return;

    if (EARLY_RETURN.test(line)) { sawEarlyReturn = i + 1; return; }

    if (sawEarlyReturn && HOOK.test(line)) {
      const name = line.match(HOOK)[1];
      // Setter calls inside callbacks are fine; only top-level (2-space) hooks matter.
      if (!/^\s{2}(?:const|let|var)?\s*[\w{[\s,:}\]]*=?\s*use[A-Z]/.test(line)) return;
      findings.push({
        file: path.relative(path.join(SRC, '..'), file),
        line: i + 1, name, afterLine: sawEarlyReturn,
      });
    }
  });
}

walk(SRC);

if (findings.length) {
  console.error(`\n❌ ${findings.length} hook(s) called after an early return:\n`);
  for (const f of findings) {
    console.error(`   ${f.file}:${f.line}  ${f.name}()  — early return on line ${f.afterLine}`);
  }
  console.error('\n   React throws "rendered more hooks than during the previous');
  console.error('   render" when that condition flips. Move the hook above it.\n');
  process.exit(1);
}
console.log('✅ hook order: no hooks called after an early return');
