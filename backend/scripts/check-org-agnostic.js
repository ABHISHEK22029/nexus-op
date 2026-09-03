#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   check-org-agnostic — this is a product, not one company's install.

   One customer's identity had leaked into the code in four different ways,
   each invisible until somebody else used the product:

     · company_profile DEFAULTs carried their name, address, GSTIN and PAN,
       so a fresh row inherited another company's tax identity
     · GET /company-profile INSERTed a row named after them
     · purchase orders were numbered `Kirashi/FY2026-27/007` by string
       literal, in two files, on documents sent to vendors
     · printed documents fell back to their name when the profile was empty

   A build catches none of it. It only shows up when a second organisation
   uses the product, and by then it is on their invoices.

   This fails on a real company name appearing in shipped code. Comments are
   exempt — the fixes above are explained in comments that name the company,
   and a checker that cannot tell an explanation from a value is one people
   delete.
   ══════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

/* Names that must never appear as a VALUE in shipped code. Add a customer
   here when you onboard them, not after they complain. */
const CUSTOMER_NAMES = ['kirashi', 'hi-mak', 'himak'];

/* Marketing copy is a separate argument — it is allowed to name customers,
   though a fabricated testimonial is its own problem. Tests and seeds need
   real-looking data. */
const SKIP = [
  'node_modules', '.git', 'dist', 'build', 'target', 'migrations',
  'Welcome.jsx', 'MarketingNav.jsx', 'PlatformCapabilities.jsx', 'HowItWorks.jsx',
  'scripts', 'seed_demo.cjs', 'e2e_test.cjs',
];

const findings = [];

/* Blank out comments and keep line numbers, so a line reported is a line you
   can go and look at. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + ' '.repeat(Math.max(m.length - p.length, 0)));
}

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.some(s => e.name === s)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(js|jsx|cjs|sql)$/.test(e.name)) scan(p);
  }
}

function scan(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const lower = raw.toLowerCase();
  if (!CUSTOMER_NAMES.some(n => lower.includes(n))) return;

  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const src = stripComments(raw);
  src.split('\n').forEach((line, i) => {
    const l = line.toLowerCase();
    for (const name of CUSTOMER_NAMES) {
      if (!l.includes(name)) continue;
      findings.push({ file: rel, line: i + 1, name, text: line.trim().slice(0, 100) });
      break;
    }
  });
}

for (const d of ['backend', 'frontend/src']) {
  const p = path.join(ROOT, d);
  if (fs.existsSync(p)) walk(p);
}

if (findings.length) {
  console.error(`\n❌ ${findings.length} customer-specific value(s) in shipped code:\n`);
  for (const f of findings) console.error(`   ${f.file}:${f.line}\n      ${f.text}\n`);
  console.error(`   These reach every organisation that uses this product. A company
   name in a document number goes to their vendors; a GSTIN or PAN goes on
   their tax invoices. Take the value from company_profile instead — see
   shared/docNumber.js.\n`);
  process.exit(1);
}
console.log('✅ org-agnostic: no customer-specific values in shipped code');
