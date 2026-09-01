/* ══════════════════════════════════════════════════════════
   navResources — the one map from a URL to the permission that governs it.

   Used by BOTH the sidebar (which links to show) and the route guard (which
   pages to open). They were about to be two lists, and two lists of the same
   thing drift: the nav hides a link while the route still opens, or the
   route blocks a page the nav is still advertising. Either way the person
   using it concludes the product is broken.

   Deriving the guard from the path also means no route can be added without
   one. Wrapping 60 routes by hand guarantees that the 61st is forgotten;
   this way an unlisted path is simply ungated, deliberately and visibly, in
   this file.

   Resource names must match backend/shared/roles.js exactly — the server is
   the authority, and a name that doesn't match there grants nothing here.
   ══════════════════════════════════════════════════════════ */

/* Longest prefix wins, so '/sales-invoices/new' resolves before '/sales'.
   Order in this object is irrelevant; the lookup sorts by length. */
export const PATH_RESOURCES = {
  // Sales
  '/customers': 'customers',
  '/sales-quotations': 'sales-quotations',
  '/customer-orders': 'customer-orders',
  '/delivery-challans': 'delivery-challans',
  '/sales-invoices': 'sales-invoices',

  // Catalogue
  '/skus': 'skus',
  '/raw-materials': 'raw-materials',

  // Procurement
  '/vendors': 'vendors',
  '/vendor-supplies': 'vendor-items',
  '/quotations': 'quotations',
  '/purchase-orders': 'po',
  '/po': 'po',
  '/grn': 'grn',
  '/inventory': 'inventory',
  '/indent': 'indent',

  // Billing / finance
  '/bills': 'bills',
  '/payables': 'payables',
  '/credit-debit-notes': 'credit-debit-notes',
  '/expenses': 'expenses',

  // Projects & production
  '/projects': 'projects',
  '/workorders': 'work-orders',
  '/milestones': 'milestones',
  '/boq': 'boq',
  '/mb': 'mb',
  '/material-requirements': 'material-requirements',
  '/production': 'production',

  // Administration
  '/company-profile': 'company-profile',
  '/automation': 'automation-settings',
  '/users': 'users',
};

/* Paths every signed-in user may open. Mirrors UNGATED in backend/index.js —
   these carry no business authority and gating them only makes the product
   hostile. */
export const UNGATED_PATHS = [
  '/dashboard', '/knowledge', '/activity', '/flow', '/reports', '/import',
  '/onboarding', '/beta-welcome', '/beta-onboarding', '/get-started',
];

/* The Configurator is Administrator-only and deliberately NOT a grantable
   resource — a screen that changes who can do what must not itself be a
   permission that can be handed out. Enforced server-side the same way:
   'admin' is absent from RESOURCES, so deny-by-default covers it. */
export const ADMIN_ONLY_PATHS = ['/configurator'];

const SORTED = Object.keys(PATH_RESOURCES).sort((a, b) => b.length - a.length);

/** The resource governing a path, or null if the path is ungated. */
export function resourceForPath(pathname = '') {
  const p = String(pathname);
  if (UNGATED_PATHS.some(u => p === u || p.startsWith(u + '/'))) return null;
  for (const prefix of SORTED) {
    if (p === prefix || p.startsWith(prefix + '/')) return PATH_RESOURCES[prefix];
  }
  return null;
}

/** Is this path restricted to Administrator regardless of grants? */
export function isAdminOnlyPath(pathname = '') {
  const p = String(pathname);
  return ADMIN_ONLY_PATHS.some(a => p === a || p.startsWith(a + '/'));
}
