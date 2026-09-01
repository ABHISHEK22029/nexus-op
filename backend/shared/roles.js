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

/** Does this role see across workspaces? Only the platform role does. */
function isCrossTenant(role) {
  return ROLES[normaliseRole(role)]?.crossTenant === true;
}

function normaliseRole(role) {
  if (!role) return 'Viewer';
  if (ROLES[role]) return role;
  return LEGACY[role] || 'Viewer';
}

/** Core check. Deny by default. */
function can(role, resource, action = READ) {
  const r = normaliseRole(role);
  if (r === 'Administrator') return true;
  const grants = ROLES[r]?.grants;
  if (!grants || grants === 'all') return grants === 'all';
  if (COMMON_READ.includes(resource) && action === READ) return true;
  const allowed = grants[resource];
  return Array.isArray(allowed) && allowed.includes(action);
}

/** The whole answer for one user, for /auth/me — so the UI never guesses. */
function permissionsFor(role) {
  const r = normaliseRole(role);
  const out = {};
  for (const resource of Object.keys(RESOURCES)) {
    const actions = ALL.filter(a => can(r, resource, a));
    if (actions.length) out[resource] = actions;
  }
  for (const resource of COMMON_READ) out[resource] = [READ];
  return { role: r, label: ROLES[r]?.label || r, permissions: out };
}

module.exports = {
  READ, WRITE, DELETE, ALL,
  RESOURCES, ROLES, COMMON_READ,
  can, normaliseRole, permissionsFor, isCrossTenant,
  roleNames: () => Object.keys(ROLES),
};
