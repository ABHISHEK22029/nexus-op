#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════
   check-jsx-undefined — find JSX components that are used but never defined.

   This bug class has now bitten three times in this project:

     · <OrderReadiness/> used in CustomerOrders.jsx with no import
     · <Link2/> and <Layers/> in the Sidebar nav array with no import

   Every one of them built cleanly. Vite compiles `<Foo/>` to
   `jsx(Foo, ...)` without caring whether `Foo` resolves — it is an ordinary
   identifier reference, and an unresolved one is a runtime ReferenceError,
   not a build error. So `npm run build` passing says nothing at all here.

   The Sidebar case is the instructive one: those icons sat inside the nav
   array that every render rebuilds, so the crash took out the entire
   navigation, on every page, for every user. A green build the whole time.

   Run: node scripts/check-jsx-undefined.js     (exit 1 on any finding)
   ══════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');

/* Lowercase tags are HTML. Capitalised ones must resolve to something in
   scope: an import, a local declaration, or a destructured binding. */
const JSX_USE = /<([A-Z][A-Za-z0-9_]*)/g;

/* Anything that could bring a name into scope. Deliberately generous —
   a false negative here is a missed bug, a false positive is noise. */
const DEFINES = [
  /import\s+([A-Z][A-Za-z0-9_]*)\s*(?:,|from)/g,           // default import
  /import\s+\*\s+as\s+([A-Z][A-Za-z0-9_]*)/g,              // namespace
  /(?:const|let|var|function|class)\s+([A-Z][A-Za-z0-9_]*)/g,
  /const\s*\{([^}]+)\}\s*=/g,                              // destructured const

  /* Named imports, INCLUDING the `import Default, { A, B } from` form and
     multi-line lists. The first version required `{` immediately after
     `import`, so ProcessFlow's
         import ReactFlow, {
           Background, Controls, MiniMap,
         } from 'reactflow';
     reported four phantom findings. */
  /import\s+(?:[A-Za-z0-9_$]+\s*,\s*)?\{([^}]+)\}/g,

  /* Renames anywhere — `{ icon: Icon }` in a function parameter is how
     every list component in this codebase takes its icon, and the original
     pattern only looked at `const {...} =`, so each one looked undefined.
     Matching renames generally is the fix: a component bound by ANY
     `something: Capitalised` is in scope. */
  /[A-Za-z0-9_$]+\s*:\s*([A-Z][A-Za-z0-9_]*)/g,

  /* Destructuring in an arrow parameter, array or object form. Catches
     SmartKnowledge's
         [['grid', Grid2x2], ['list', LayoutList]].map(([v, Icon]) => …)
     where Icon is bound positionally and never imported under that name. */
  /[[{]([^\]}]+)[\]}]\s*\)?\s*=>/g,
];

const findings = [];

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); }
    else if (/\.(jsx|tsx)$/.test(e.name)) scan(p);
  }
}

function scan(file) {
  const src = fs.readFileSync(file, 'utf8');

  const defined = new Set(['React', 'Fragment']);
  for (const re of DEFINES) {
    for (const m of src.matchAll(re)) {
      for (const part of m[1].split(',')) {
        // handles `Foo as Bar` and `foo: Bar`
        const name = part.split(/\s+as\s+|:/).pop().trim().replace(/[^A-Za-z0-9_]/g, '');
        if (name) defined.add(name);
      }
    }
  }

  const used = new Map();   // name -> first line number
  const lines = src.split('\n');
  lines.forEach((line, i) => {
    for (const m of line.matchAll(JSX_USE)) {
      const name = m[1];
      // <Foo.Bar/> only needs Foo
      const root = name.split('.')[0];
      if (!used.has(root)) used.set(root, i + 1);
    }
  });

  for (const [name, line] of used) {
    if (!defined.has(name)) {
      findings.push({ file: path.relative(path.join(SRC, '..'), file), line, name });
    }
  }
}

walk(SRC);

if (findings.length) {
  console.error(`\n❌ ${findings.length} JSX component(s) used but never defined:\n`);
  for (const f of findings) {
    console.error(`   ${f.file}:${f.line}  <${f.name} />`);
  }
  console.error('\n   These compile fine and throw ReferenceError at render time.');
  console.error('   Add the missing import.\n');
  process.exit(1);
}

console.log('✅ JSX components: every capitalised tag resolves to something in scope');
