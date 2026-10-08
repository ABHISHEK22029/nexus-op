#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   Every internal link goes somewhere.

   Collects the routes declared in App.jsx, then every internal target in
   the source — <Link to>, <NavLink to>, navigate(), href="/…", and the
   menu's paths in lib/navigation.js — and reports any that no route
   matches. A link to a route that was renamed or never built lands on the
   catch-all, which reads as a broken product rather than a typo.

   Static: no browser, no server. Template-literal targets are checked by
   their fixed prefix (`/customers/${id}` must match /customers/:id).
   ══════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
const files = [];
(function walk(d) {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) walk(p);
    else if (/\.(jsx?|tsx?)$/.test(f.name)) files.push(p);
  }
})(SRC);

/* routes */
const app = fs.readFileSync(path.join(SRC, 'App.jsx'), 'utf8');
const routes = [...app.matchAll(/path=["'`]([^"'`]+)["'`]/g)].map((m) => m[1]).filter((r) => r !== '*');
const toRe = (r) => new RegExp(`^${r.replace(/\/:[^/]+\?/g, '(?:/[^/]+)?').replace(/:[^/]+/g, '[^/]+').replace(/\*$/, '.*')}/?$`);
const routeRes = routes.map((r) => [r, toRe(r)]);
const matches = (p) => routeRes.some(([, re]) => re.test(p));

/* targets */
const found = [];
const add = (file, line, raw) => found.push({ file: path.relative(SRC, file), line, raw });
for (const f of files) {
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  lines.forEach((l, i) => {
    const pats = [
      /\bto=\{?["'`](\/[^"'`]*)["'`]\}?/g,
      /\bnavigate\(\s*["'`](\/[^"'`]*)["'`]/g,
      /\bhref=\{?["'`](\/[^"'`#]*)["'`]\}?/g,
      /\b(?:path|landing|link|to):\s*["'`](\/[^"'`]*)["'`]/g,
      /window\.location(?:\.href)?\s*=\s*["'`](\/[^"'`]*)["'`]/g,
      /location\.assign\(\s*["'`](\/[^"'`]*)["'`]/g,
    ];
    for (const re of pats) for (const m of l.matchAll(re)) add(f, i + 1, m[1]);
  });
}

/* A template target is checked by what it is with each ${…} as one segment. */
const normal = (raw) => {
  let p = raw.split('?')[0].split('#')[0];
  p = p.replace(/\$\{[^}]*\}/g, 'X');
  /* An expression with quotes in it is cut off where the quote is: the
     path is what came before it (`/login${email ? `?email=…` : ''}`). */
  p = p.replace(/\$\{[^}]*$/, '');
  if (p.length > 1) p = p.replace(/\/$/, '');
  return p;
};
/* Not app routes: API calls, static files, and the backend's public paths. */
const skip = (p) => /^\/(api|assets|voice|media|uploads|public|auth|favicon|robots|sitemap|og-|fonts)\b/.test(p) || /\.[a-z0-9]{2,4}$/i.test(p);

/* Targets that look like links but are API paths, checked by hand. */
const NOT_LINKS = [
  { file: 'pages/Reports.jsx', raw: '/grn-bills', why: 'the CSV register is fetched from GET /grn-bills; bills open at /grn-bills/:id' },
];
const known = (t) => NOT_LINKS.some((n) => t.file.replace(/\\/g, '/') === n.file && t.raw === n.raw);

const broken = found.filter((t) => { const p = normal(t.raw); return !skip(p) && !matches(p) && !known(t); });
const uniq = [...new Set(found.map((t) => normal(t.raw)))].filter((p) => !skip(p));
console.log(`${routes.length} routes · ${found.length} internal link targets (${uniq.length} distinct) in ${files.length} files`);
if (!broken.length) { console.log('✅ every internal link matches a route'); process.exit(0); }
console.log(`❌ ${broken.length} link(s) go nowhere:`);
for (const b of broken) console.log(`   ${b.file}:${b.line}  ${b.raw}`);
process.exit(1);
