#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   check-project-optional — activeProject can be null now.

   "All work" is a real state: activeProject === null means the user is
   looking at the whole business, which is the DEFAULT. Any `activeProject.x`
   that is not guarded is a TypeError on the first paint for most users.

   This is the same class as check-jsx-undefined and check-hook-order: code
   that compiles, and that a build cannot fault, because the reference is
   only evaluated when the component renders in that state.

   A dereference counts as guarded when it is optional-chained, or sits
   inside a `activeProject && …` / `activeProject ? … :` expression on the
   same line, or the file bails out earlier with `if (!activeProject) return`.
   ══════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const findings = [];

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.jsx?$/.test(e.name)) scan(p);
  }
}

function scan(file) {
  const raw = fs.readFileSync(file, 'utf8');
  if (!raw.includes('activeProject')) return;
  const rel = path.relative(path.join(__dirname, '..'), file).replace(/\\/g, '/');
  const lines = raw.split('\n');

  /* A file that returns early when there is no project may dereference
     freely afterwards — the correct pattern for the construction screens,
     where a project genuinely is required.

     `!activeProject ||` counts: Bills bails with
     `if (!activeProject || !newWOId) return;` and requiring the closing
     paren immediately after reported it as unguarded. A checker that flags
     correct code is one people switch off. */
  const bailsOut = /if\s*\(\s*!activeProject\s*(\)|\|\|)/.test(raw);

  lines.forEach((line, i) => {
    // Every `activeProject.` that is not `activeProject?.`
    const re = /activeProject\.(?!\?)/g;
    let m;
    while ((m = re.exec(line))) {
      if (bailsOut) continue;
      const before = line.slice(0, m.index);
      // Guarded on this line?
      if (/activeProject\s*(&&|\?)[^.]*$/.test(before)) continue;
      /* Guarded on a preceding line — a ternary spanning several lines is
         the common shape here:
             const url = activeProject
               ? `…?projectId=${activeProject.id}`
               : `…`;
         Looking only at the current line called that a crash. */
      const lookBack = lines.slice(Math.max(0, i - 3), i).join(' ');
      if (/activeProject\s*(&&|\?)\s*$/.test(lookBack.trimEnd())) continue;
      if (/\bactiveProject\s*$/.test(lookBack.trimEnd())) continue;

      findings.push({ file: rel, line: i + 1, text: line.trim().slice(0, 96) });
    }
  });
}

walk(SRC);

if (findings.length) {
  console.error(`\n❌ ${findings.length} unguarded activeProject dereference(s):\n`);
  for (const f of findings) console.error(`   ${f.file}:${f.line}\n      ${f.text}\n`);
  console.error(`   activeProject is null in "All work" mode, which is the default.
   Use activeProject?.x, guard with activeProject && …, or return early if
   the screen genuinely requires a project.\n`);
  process.exit(1);
}
console.log('✅ project-optional: every activeProject dereference is guarded or behind an early return');
