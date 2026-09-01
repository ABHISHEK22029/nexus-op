/* ══════════════════════════════════════════════════════════
   roles — the one place that decides who may do what.

   Before this there were THREE role vocabularies that never agreed:
     · the database held        Admin, User
     · the backend checked for  Admin, Manager, Viewer
     · the UI offered           Admin, Engineer, Finance, Vendor

   So requireRole('Admin','Manager') could never match anyone — no user has
   ever had the role Manager — and the UI's dropdown was pure theatre: it
   set a local variable and never touched the token, so picking "Finance"
   changed nothing a server would ever see.

   Design notes:

   · DENY BY DEFAULT. A resource absent from a role's grant is forbidden.
     Adding a new route without thinking about permissions makes it
     admin-only, which fails safe rather than open.

   · THE SERVER IS THE ONLY AUTHORITY. The UI never keeps its own copy of
     this table — it asks /auth/me what the current user may do. A UI copy
     is a copy that drifts, and a permission table that drifts is worse than
     none because it is trusted.

   · Hiding a button is courtesy, not security. Every grant here is
     enforced server-side; the UI reads the same answer only so it doesn't
     offer actions that will be refused.
   ══════════════════════════════════════════════════════════ */

/* Actions, coarse on purpose. Finer grains (approve, post, void) are
   modelled as their own resources rather than extra verbs, because that is
   how people actually talk about them: "who can approve a PO". */
const READ = 'read';
const WRITE = 'write';     // create + update
const DELETE = 'delete';
const ALL = [READ, WRITE, DELETE];

/* Resources map to the route prefixes in index.js. Keep this list and the
   routes in step — anything missing is denied to everyone but Admin. */
const RESOURCES = {
  // Sales
  customers: 'Customers',
  'customer-orders': 'Customer orders',
  'sales-quotations': 'Quotations',
  'sales-invoices': 'Sales invoices',
  'delivery-challans': 'Delivery challans',
  // Procurement
  vendors: 'Vendors',
  'vendor-items': 'Vendor supplies',
  po: 'Purchase orders',
  'po-approval': 'Purchase order approval',
  indent: 'Indents',
  quotations: 'Vendor quotations',
  'raw-materials': 'Raw materials',
  // Inventory
  inventory: 'Inventory',
  skus: 'SKUs',
  'material-requirements': 'Material requirements',
  // Production
  production: 'Production orders',
  'work-orders': 'Work orders',
  projects: 'Projects',
  milestones: 'Milestones',
  boq: 'Bill of quantities',
  mb: 'Measurement book',
  // Finance
  bills: 'Vendor bills',
  'grn-bills': 'GRN bills',
  payables: 'Accounts payable',
  'credit-debit-notes': 'Credit / debit notes',
  recurring: 'Recurring billing',
  // Administration
  users: 'Users',
  'company-profile': 'Company profile',
  'automation-settings': 'Automation settings',
};

/* Everyone signed in gets these — they carry no business authority and
   locking them down only makes the product hostile.

   `users` is read-only here on purpose: every "assign to" and "raised by"
   dropdown in the product needs the list of colleagues, so withholding it
   breaks ordinary screens to protect nothing. Creating, editing and
   deactivating accounts stays with Administrator. */
const COMMON_READ = ['dashboard', 'activities', 'notifications', 'attachments', 'kb', 'ai', 'users'];

const g = (resources, actions) => Object.fromEntries(resources.map(r => [r, actions]));

const SALES = ['customers', 'customer-orders', 'sales-quotations', 'sales-invoices', 'delivery-challans'];
const PROCUREMENT = ['vendors', 'vendor-items', 'po', 'indent', 'quotations', 'raw-materials'];
const INVENTORY = ['inventory', 'skus', 'material-requirements'];
const PRODUCTION = ['production', 'work-orders', 'projects', 'milestones', 'boq', 'mb'];
const FINANCE = ['bills', 'grn-bills', 'payables', 'credit-debit-notes', 'recurring'];
const ADMIN = ['users', 'company-profile', 'automation-settings'];

/* Two orthogonal things were tangled together under the name "Admin":

     TENANCY   — whose rows do you see (owner_id scoping)
     CAPABILITY— which actions may you perform

   `role === 'Admin'` meant both, which is why there was no way to express
   the most common case in this product: someone who runs their own
   workspace completely but has no business seeing another company's data.

   So Administrator stays the cross-tenant platform role, and Owner is full
   business capability within your own workspace. Only Administrator is
   treated as cross-tenant by the owner-scoping code. */
const ROLES = {
  Administrator: {
    label: 'Administrator',
    description: 'Full access across every workspace, including user management. The platform role.',
    // Short-circuited in can(); listed for the UI.
    grants: 'all',
    crossTenant: true,
  },

  Owner: {
    label: 'Owner',
    description: 'Runs their own workspace end to end — sales, buying, production, money. Cannot see other workspaces or manage platform users.',
    grants: {
      ...g([...SALES, ...PROCUREMENT, ...INVENTORY, ...PRODUCTION, ...FINANCE], ALL),
      ...g(['po-approval'], [WRITE]),
      ...g(['company-profile', 'automation-settings'], [READ, WRITE]),
      // Not `users`: adding people to the platform stays with Administrator.
    },
  },

  Sales: {
    label: 'Sales',
    description: 'Quotes customers, takes orders, raises invoices. Reads stock and production to answer "when can you deliver".',
    grants: {
      ...g(SALES, ALL),
      ...g([...INVENTORY, ...PRODUCTION], [READ]),
      ...g(['vendors'], [READ]),
    },
  },

  Procurement: {
    label: 'Procurement',
    description: 'Buys material — vendors, purchase orders, indents, goods receipt. Reads what production and sales have committed to.',
    grants: {
      ...g(PROCUREMENT, ALL),
      ...g(INVENTORY, ALL),
      ...g(['grn-bills'], [READ, WRITE]),
      ...g([...SALES, ...PRODUCTION], [READ]),
      // Deliberately NOT po-approval: raising a PO and approving it must be
      // two different people, or the control is not a control.
    },
  },

  Production: {
    label: 'Production',
    description: 'Runs the shop floor — work orders, production, projects. Reads material availability; cannot buy.',
    grants: {
      ...g(PRODUCTION, ALL),
      ...g(INVENTORY, [READ, WRITE]),   // may consume/issue stock
      ...g([...SALES, ...PROCUREMENT], [READ]),
    },
  },

  Finance: {
    label: 'Finance',
    description: 'Invoices, bills, payments and credit notes. Reads the operational trail behind every number.',
    grants: {
      ...g(FINANCE, ALL),
      ...g(['sales-invoices', 'credit-debit-notes'], ALL),
      ...g(['po-approval'], [WRITE]),
      ...g([...SALES, ...PROCUREMENT, ...INVENTORY, ...PRODUCTION], [READ]),
      ...g(['company-profile'], [READ]),
    },
  },

  Viewer: {
    label: 'Viewer',
    description: 'Reads everything, changes nothing. For auditors, consultants and the bank.',
    grants: g(Object.keys(RESOURCES), [READ]),
  },
};

/* Legacy values still sitting in the users table, mapped forward so nobody
   is locked out by the rename. */
const LEGACY = {
  Admin: 'Administrator',
  admin: 'Administrator',
  Manager: 'Finance',   // the only routes Manager ever guarded were finance/settings
  // User -> Owner, NOT Viewer. Only ten of 129 routes were ever guarded, so
  // in practice a "User" could already do everything inside their own
  // workspace. Mapping them to Viewer would look like a tightened default
  // but would actually be a silent, breaking downgrade of accounts that
  // work today. Owner is what they already had.
  User: 'Owner',
  Engineer: 'Production',
  Vendor: 'Viewer',
};

/* ── Runtime overlay ──────────────────────────────────────────
   Roles are administered from the Configurator, so the grants above are
   DEFAULTS, not the last word. Migration 033 stores the live set, and this
   module holds it in memory.

   can() STAYS SYNCHRONOUS. It is called from middleware on every request
   and from permissionsFor() in a loop; making it async would turn a pure
   predicate into something every call site has to await, and one missed
   await would silently evaluate a Promise as truthy — which is to say,
   grant everything. A cache refreshed on write is the safer shape.

   When the overlay is empty — migration not yet run, table unreachable —
   every lookup falls through to the compiled-in defaults. A failed
   migration therefore degrades to the previous behaviour rather than to an
   installation where nobody can do anything. */
let OVERLAY = null;         // { role: { label, crossTenant, isSystem, grants } }

/** Replace the in-memory role set. Called at boot and after any edit. */
function setOverlay(roles) {
  OVERLAY = (roles && Object.keys(roles).length) ? roles : null;
}
function getOverlay() { return OVERLAY; }
function overlayLoaded() { return OVERLAY !== null; }

/** The effective definition for a role — DB if present, else code. */
function roleDef(name) {
  return (OVERLAY && OVERLAY[name]) || ROLES[name] || null;
}

/** Every role name currently in effect. */
function effectiveRoleNames() {
  return OVERLAY ? Object.keys(OVERLAY) : Object.keys(ROLES);
}

/** Does this role see across workspaces? Only the platform role should. */
function isCrossTenant(role) {
  return roleDef(normaliseRole(role))?.crossTenant === true;
}

/**
 * Every stored role STRING that resolves to `target` — the canonical name
 * plus any legacy alias mapping to it.
 *
 * Needed because normaliseRole() lives in JavaScript while the questions
 * that matter ("how many administrators are there?") are asked in SQL.
 * Counting `WHERE role = 'Administrator'` misses the account stored as the
 * legacy 'Admin', which is how the health check came to report "no active
 * Administrator" on an installation whose only administrator was signed in
 * and looking at the warning. A safety check that cries wolf is worse than
 * no check, because it teaches people to scroll past the real one.
 */
function rolesResolvingTo(target) {
  const out = new Set();
  for (const name of effectiveRoleNames()) if (normaliseRole(name) === target) out.add(name);
  for (const alias of Object.keys(LEGACY)) if (normaliseRole(alias) === target) out.add(alias);
  if (roleDef(target)) out.add(target);
  return [...out];
}

function normaliseRole(role) {
  if (!role) return 'Viewer';
  if (roleDef(role)) return role;
  return LEGACY[role] || 'Viewer';
}

/** Core check. Deny by default. */
function can(role, resource, action = READ) {
  const r = normaliseRole(role);
  /* Administrator is short-circuited in code, not read from the overlay.
     It is the recovery path: if a permission edit goes wrong, someone must
     still be able to get in and undo it. An Administrator whose access
     depends on an editable row is an Administrator who can be edited out of
     existence. */
  if (r === 'Administrator') return true;
  const def = roleDef(r);
  const grants = def?.grants;
  if (!grants || grants === 'all') return grants === 'all';
  if (COMMON_READ.includes(resource) && action === READ) return true;
  const allowed = grants[resource];
  return Array.isArray(allowed) && allowed.includes(action);
}

/** The whole answer for one user, for /auth/me — so the UI never guesses. */
function permissionsFor(role) {
  const r = normaliseRole(role);
  const out = {};
  /* Resource list comes from the catalogue, which is code — a role may only
     ever be granted a resource the product actually routes. An admin cannot
     invent a permission for something that does not exist. */
  for (const resource of Object.keys(RESOURCES)) {
    const actions = ALL.filter(a => can(r, resource, a));
    if (actions.length) out[resource] = actions;
  }
  /* Grant read, don't REPLACE what was computed. This loop used to assign
     `[READ]` outright, which was harmless while COMMON_READ held only
     non-resources — then `users` joined the list and silently stripped
     Administrator's write on it. Server-side can() was still correct, so
     enforcement never broke; the UI just stopped offering a button the API
     would have accepted. Exactly the drift that having one source of truth
     is supposed to prevent, so it gets fixed at the source. */
  for (const resource of COMMON_READ) {
    /* Ask can() rather than hardcoding [READ], so the map is exactly what
       the server would answer — Administrator's blanket grant included.
       READ is unioned in because that is what membership of this list
       means. */
    const actions = ALL.filter(a => can(r, resource, a));
    out[resource] = actions.includes(READ) ? actions : [READ, ...actions];
  }
  return { role: r, label: ROLES[r]?.label || r, permissions: out };
}

/* ── Persistence ──────────────────────────────────────────────
   Kept in this module so the seed can never disagree with the defaults it
   is seeded from — they are literally the same object.
   ══════════════════════════════════════════════════════════ */

/** Expand a role's grants into flat (resource, actions) rows. */
function grantRows(name) {
  const def = ROLES[name];
  if (!def) return [];
  if (def.grants === 'all') {
    // Administrator is short-circuited in can(); store the full matrix
    // anyway so the Configurator can display it truthfully.
    return Object.keys(RESOURCES).map(r => [r, ALL]);
  }
  return Object.entries(def.grants).map(([r, a]) => [r, a]);
}

/**
 * Seed role_permissions from the code defaults for any role that has no
 * rows yet. Never overwrites an existing role's grants — an admin's edits
 * must survive every deploy, or the Configurator is a lie.
 */
async function seedRolePermissions(db) {
  const existing = await db.query('SELECT DISTINCT role FROM role_permissions');
  const have = new Set(existing.rows.map(r => r.role));
  let seeded = 0;
  for (const name of Object.keys(ROLES)) {
    if (have.has(name)) continue;
    for (const [resource, actions] of grantRows(name)) {
      await db.query(
        `INSERT INTO role_permissions (role, resource, actions)
         VALUES ($1,$2,$3) ON CONFLICT (role, resource) DO NOTHING`,
        [name, resource, actions]
      );
    }
    seeded++;
  }
  return seeded;
}

/** Read the live role set into memory. Safe to call repeatedly. */
async function loadRoles(db) {
  const defs = await db.query(
    'SELECT role, label, description, is_system, cross_tenant FROM role_definitions ORDER BY sort_order, role'
  );
  if (!defs.rows.length) { setOverlay(null); return 0; }

  const perms = await db.query('SELECT role, resource, actions FROM role_permissions');
  const byRole = {};
  for (const d of defs.rows) {
    byRole[d.role] = {
      label: d.label,
      description: d.description,
      isSystem: d.is_system,
      crossTenant: d.cross_tenant,
      grants: {},
    };
  }
  for (const p of perms.rows) {
    if (!byRole[p.role]) continue;               // orphan row, ignore
    byRole[p.role].grants[p.resource] = p.actions || [];
  }
  setOverlay(byRole);
  return Object.keys(byRole).length;
}

/**
 * Boot-time initialisation. Deliberately never throws: if the migration has
 * not run, or the database is briefly unreachable, the server must still
 * start on the compiled-in defaults rather than refuse to serve.
 */
async function initRoles(db) {
  try {
    await seedRolePermissions(db);
    const n = await loadRoles(db);
    return { ok: true, roles: n, source: n ? 'database' : 'code defaults' };
  } catch (e) {
    setOverlay(null);
    return { ok: false, source: 'code defaults', error: e.message };
  }
}

module.exports = {
  READ, WRITE, DELETE, ALL,
  RESOURCES, ROLES, COMMON_READ, LEGACY,
  can, normaliseRole, permissionsFor, isCrossTenant, rolesResolvingTo,
  roleNames: () => effectiveRoleNames(),
  codeRoleNames: () => Object.keys(ROLES),
  roleDef, effectiveRoleNames, overlayLoaded, getOverlay, setOverlay,
  seedRolePermissions, loadRoles, initRoles, grantRows,
};
