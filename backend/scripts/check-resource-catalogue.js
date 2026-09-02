#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   check-resource-catalogue — a screen no role can open.

   /expenses and /grn had routes, controllers and data (177 expense rows,
   4 goods receipts). What they did not have was an entry in the RESOURCES
   catalogue in shared/roles.js. permissionsFor() builds the map the UI
   gates on by walking that object, so a resource missing from it is absent
   from every role's map — and RoleRoute reads the map, not the server.

   The result was a screen locked to EVERYONE, the Administrator included,
   who was told in as many words that the Administrator role "doesn't cover
   viewing expenses" while the API served the rows without complaint.

   Nothing else catches this:
     · the build compiles — nothing is undefined
     · check-route-coverage passes — the route exists and is registered
     · the browser smoke test passes — the denial page renders beautifully
     · server-side can() is correct — this is a lockout, never a leak

   It is only visible if you compare the two lists, which is all this does.
   ══════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const NAV = path.join(ROOT, '..', 'frontend', 'src', 'lib', 'navigation.js');

if (!fs.existsSync(NAV)) {
  console.log('⚠  navigation.js not found — skipping catalogue check');
  process.exit(0);
}

const roles = require('../shared/roles');
const catalogue = new Set(Object.keys(roles.RESOURCES || {}));
const commonRead = new Set(roles.COMMON_READ || []);

const nav = fs.readFileSync(NAV, 'utf8');

/* Every `resource: 'x'` in the nav declaration, plus the extra path→resource
   entries appended to PATH_RESOURCES. Both feed resourceForPath(), which is
   what RoleRoute gates on. */
const referenced = new Map();   // resource -> where it was seen
for (const m of nav.matchAll(/(?:^|\n)\s*\{[^}\n]*?label:\s*'([^']+)'[^}\n]*?resource:\s*'([^']+)'/g)) {
  if (!referenced.has(m[2])) referenced.set(m[2], m[1]);
}
/* Only the Object.assign inside PATH_RESOURCES. navigation.js holds a
   second path→MODULE map with the same literal shape ('/skus': 'stock'),
   and scanning the whole file reported the module keys as uncatalogued
   resources — a checker that cries wolf gets switched off. */
const assign = nav.match(/Object\.assign\(map,\s*\{([\s\S]*?)\}\);/);
if (assign) {
  for (const m of assign[1].matchAll(/'(\/[a-z0-9-]+)':\s*'([a-z0-9-]+)'/g)) {
    if (!referenced.has(m[2])) referenced.set(m[2], m[1]);
  }
}

const missing = [...referenced].filter(([r]) => !catalogue.has(r) && !commonRead.has(r));
const unused = [...catalogue].filter(r => !referenced.has(r));

let bad = false;

if (missing.length) {
  bad = true;
  console.error(`\n❌ ${missing.length} resource(s) the UI gates on but the permission catalogue does not list:\n`);
  for (const [res, where] of missing) {
    console.error(`   '${res}'   (${where})`);
  }
  console.error(`
   permissionsFor() walks RESOURCES, so these are absent from every role's
   permission map. RoleRoute reads that map — so the screen is denied to
   every role, Administrator included, while the API serves it normally.

   Fix: add the resource to RESOURCES in backend/shared/roles.js, put it in
   the right role group, and add a migration granting it to existing roles
   (seedRolePermissions() deliberately skips roles that already have rows,
   so it will not backfill a new resource on its own).\n`);
}

/* Not a failure. A catalogued resource with no screen is usually a route
   guarded by the API but reached from elsewhere — po-approval is granted as
   an action, not navigated to. Worth printing, not worth blocking on. */
if (unused.length) {
  console.log(`\nℹ  ${unused.length} catalogued resource(s) with no nav entry (expected for API-only permissions):`);
  console.log('   ' + unused.join(', '));
}

if (!bad) console.log(`\n✅ resource catalogue: all ${referenced.size} nav resources are catalogued and reachable`);
process.exit(bad ? 1 : 0);
