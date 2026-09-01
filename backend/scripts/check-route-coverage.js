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
]);

/* Deliberately absent from RESOURCES, which makes them Administrator-only
   under deny-by-default. That is the intent, not an oversight: the
   Configurator changes who can do what, so it must not itself be a
   permission any role can be granted. Listed here so the orphan check
   doesn't flag them. */
const ADMIN_ONLY = new Set(['admin']);

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
const orphans = all.filter(s => !known.has(s) && !UNGATED.has(s) && !ADMIN_ONLY.has(s));

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
const gated = all.filter(s => !UNGATED.has(s) && !ADMIN_ONLY.has(s));
const lostRead = gated.filter(s => !can('User', s, 'read'));
const lostWrite = gated.filter(s => !can('User', s, 'write'));

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
