#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   A component declared inside another component, wrapped around an input.

   This is the bug behind "I type one letter and the cursor disappears".

   A component defined in the body of another is rebuilt on every render.
   React compares the new function to the old one, finds a different
   component TYPE, and does the only thing it can: unmount the old subtree
   and mount a fresh one. The DOM input is destroyed and recreated, so the
   caret, the selection and focus all go with it. Every keystroke.

   The vendor form had exactly this — a collapsible <Section> declared in
   the component body. Only the fields inside a Section were affected, so
   it looked like a glitch specific to PAN and the bank details, while the
   name and GSTIN above them behaved perfectly.

   The check is deliberately narrow. A nested component that renders only
   text — a metric tile, a status badge — remounts too, which is wasteful
   but harmless: there is no caret to lose. Failing the build on those
   would make this noise, and a check people learn to ignore is worse than
   no check. So it fails only when the nested component contains something
   a person can type into.
   ══════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.jsx?$/.test(e.name)) files.push(p);
  }
})(SRC);

/* Two ways a nested component can cost someone their caret.
 *
   It renders a form control itself — obvious.
 *
   Or it renders {children}, which is the case that actually bit us and the
   one an "is there an <input> in here" check walks straight past. <Section>
   contained no input at all; the fields were handed to it as children by
   the parent, and remounting Section remounted every one of them. A
   wrapper is MORE dangerous than a leaf, not less, because it can hold
   anything. */
const FORM_CONTROL = /<(input|textarea|select)\b/;
const RENDERS_CHILDREN = /\{\s*children\s*\}/;
const problems = [];
const benign = [];

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const lines = src.split('\n');
  let topLevelAt = null;

  lines.forEach((line, i) => {
    /* A component declared at column 0 — the file's own component(s). */
    if (/^(export default )?function [A-Z]/.test(line) ||
        /^const [A-Z][A-Za-z0-9]* = /.test(line)) topLevelAt = i;

    /* An indented `const Xyz = (...) => (` that renders markup: a component
       declared inside whatever is above it. */
    /* The parameter list can itself contain "=" — a default such as
       `filled = 0`. An earlier version of this pattern used [^=]* for the
       parameters, which could not span that, so the very component this
       check was written for slipped straight through it. Match anything up
       to the arrow instead. */
    const m = line.match(/^\s{2,}const ([A-Z][A-Za-z0-9]*)\s*=\s*.*=>\s*\(\s*$/);
    if (!m || topLevelAt === null || i <= topLevelAt) return;
    const head = lines.slice(i, i + 3).join('');
    if (!/<[a-zA-Z]/.test(head)) return;

    /* Read to the end of the arrow body to see what it renders. Crude, but
       a component definition ends at a line that closes it at its own
       indent, and over-reading only risks a false positive we then check. */
    const indent = line.match(/^\s*/)[0].length;
    let end = i + 1;
    while (end < lines.length && end < i + 120) {
      if (lines[end].length && lines[end].search(/\S/) <= indent && /^\s*\);/.test(lines[end])) break;
      end++;
    }
    const body = lines.slice(i, end + 1).join('\n');
    const entry = { file: path.relative(SRC, file), line: i + 1, name: m[1] };
    if (FORM_CONTROL.test(body) || RENDERS_CHILDREN.test(body)) {
      entry.why = FORM_CONTROL.test(body) ? 'renders a form control' : 'renders {children} — anything can be passed in';
      problems.push(entry);
    } else benign.push(entry);
  });
}

if (benign.length) {
  console.log(`   ${benign.length} display-only nested component(s) — wasteful, but nothing to lose:`);
  for (const b of benign) console.log(`     ${b.file}:${b.line}  <${b.name}>`);
  console.log('');
}

if (problems.length) {
  console.error(`❌ ${problems.length} component(s) declared inside another component can hold an input:\n`);
  for (const p of problems) console.error(`   ${p.file}:${p.line}  <${p.name}>  — ${p.why}`);
  console.error(`\n   These remount on every render, so typing into them loses the caret`);
  console.error(`   after a single character. Move them to module scope.\n`);
  process.exit(1);
}

console.log('✅ nested components: nothing that holds an input is declared inside another component');
