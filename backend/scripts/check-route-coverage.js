#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════
   check-route-coverage — prove the deny-by-default guard locks nobody out.

   The RBAC middleware refuses any request whose first path segment is not
   granted to the caller's role. That fails safe, which is right, but it
   also means a route whose segment nobody thought to add to RESOURCES
   becomes silently unreachable for every role except Administrator.

   This walks the routes actually mounted in index.js and checks each one
   against the roles table, so an orphan is a build failure rather than a
   bug report from whoever's job depended on that screen.
   ══════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const { RESOURCES, can, roleNames, normaliseRole } = require('../shared/roles');

const src = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');

/* Mirrors the UNGATED set in index.js. Kept in step by the assertion below. */
const UNGATED = new Set([
  'auth', 'health', 'public', 'dashboard', 'activities', 'notifications',
  'attachments', 'kb', 'ai', 'uploads', 'metal-prices',
  // Setup readiness: every role benefits from knowing why a screen is empty.
  'setup',
]);

/* Deliberately absent from RESOURCES, which makes them Administrator-only
   under deny-by-default. That is the intent, not an oversight: the
   Configurator changes who can do what, so it must not itself be a
   permission any role can be granted. Listed here so the orphan check
   doesn't flag them. */
const ADMIN_ONLY = new Set(['admin']);

/* Segments the guard REMAPS to another resource before checking permission.
   index.js does this so a new route can reuse permissions that already
   exist, instead of adding a resource name — which is not merely a code
   change, because role_permissions lives in a database overlay that
   REPLACES the built-in table, so a new name is a migration for every
   installation.

   This set has to mirror those remaps, and it did not: /vendor-quotations
   has been reported as an orphan — and `npm run check` red — ever since
   that feature landed, because the checker had no idea the alias existed.
   A route-coverage check that cries wolf is worse than none, since the
   next genuinely unmapped route looks like the same known noise.

   The assertion below verifies each alias really is remapped in index.js,
   so this cannot drift into hiding a real orphan. */
const ALIASES = new Map([
  ['vendor-quotations', 'quotations'],
]);

for (const [from, to] of ALIASES) {
  const remapped = new RegExp(
    `segment\\s*===\\s*['"\`]${from}['"\`]\\s*\\)\\s*segment\\s*=\\s*['"\`]${to}['"\`]`,
  ).test(src);
  if (!remapped) {
    console.error(`\n❌ ALIAS DRIFT: this script claims /${from} is checked as "${to}",`);
    console.error(`   but index.js has no such remap. Either the remap was removed —`);
    console.error(`   in which case /${from} is now Administrator-only — or it changed shape.\n`);
    process.exit(1);
  }
  if (!Object.keys(RESOURCES).includes(to)) {
    console.error(`\n❌ /${from} is remapped to "${to}", which is not in RESOURCES.\n`);
    process.exit(1);
  }
}

/* Pull every mounted route: app.get('/foo/:id' ...) -> foo */
const segments = new Map();   // segment -> Set(methods)
const ROUTE_RE = /app\.(get|post|put|patch|delete)\(\s*['"`]\/([a-zA-Z0-9_-]*)/g;
for (const m of src.matchAll(ROUTE_RE)) {
  const [, method, seg] = m;
  if (!seg) continue;
  if (!segments.has(seg)) segments.set(seg, new Set());
  segments.get(seg).add(method.toUpperCase());
}

const known = new Set(Object.keys(RESOURCES));
const all = [...segments.keys()].sort();
const orphans = all.filter(s => !known.has(s) && !UNGATED.has(s) && !ADMIN_ONLY.has(s) && !ALIASES.has(s));

console.log(`mounted route segments : ${all.length}`);
console.log(`  mapped to a resource : ${all.filter(s => known.has(s)).length}`);
console.log(`  intentionally ungated: ${all.filter(s => UNGATED.has(s)).length}`);
console.log('');

let failed = false;

if (orphans.length) {
  failed = true;
  console.error('❌ ORPHAN ROUTES — reachable, but denied to every role except Administrator:');
  for (const o of orphans) {
    console.error(`     /${o}   (${[...segments.get(o)].join(', ')})`);
  }
  console.error('   Add each to RESOURCES in shared/roles.js, or to UNGATED in index.js.');
  console.error('');
} else {
  console.log('✅ no orphans — every mounted route maps to a resource or is ungated');
  console.log('');
}

/* The migration promise: nobody who works today stops working tomorrow.
   Legacy "User" accounts become Owner, which must keep full access. */
/* A remapped segment must be asked about under the resource it is actually
   checked as. Asking can('User', 'vendor-quotations', …) answers about a
   resource that does not exist, which reads as "every role loses access" —
   the second half of the false alarm this script was raising. */
const resourceOf = (s) => ALIASES.get(s) || s;

const gated = all.filter(s => !UNGATED.has(s) && !ADMIN_ONLY.has(s));
const lostRead = gated.filter(s => !can('User', resourceOf(s), 'read'));
const lostWrite = gated.filter(s => !can('User', resourceOf(s), 'write'));

console.log(`legacy "User" -> ${normaliseRole('User')}`);
if (lostRead.length) {
  failed = true;
  console.error(`  ❌ would LOSE read on: ${lostRead.join(', ')}`);
} else {
  console.log('  ✅ keeps read on every mounted route');
}
if (lostWrite.length) {
  // Users is deliberately withheld from Owner, so it is expected here.
  const unexpected = lostWrite.filter(s => s !== 'users');
  if (unexpected.length) {
    failed = true;
    console.error(`  ❌ would LOSE write on: ${unexpected.join(', ')}`);
  } else {
    console.log('  ✅ keeps write everywhere except /users (deliberate — platform admin only)');
  }
}

console.log('');
console.log('access matrix (write) by role:');
const header = roleNames();
console.log('  ' + 'resource'.padEnd(24) + header.map(r => r.slice(0, 6).padEnd(7)).join(''));
for (const s of gated) {
  const row = header.map(r => (can(r, s, 'write') ? '  ✓    ' : '  ·    ')).join('');
  console.log('  ' + s.padEnd(24) + row);
}

process.exit(failed ? 1 : 0);
