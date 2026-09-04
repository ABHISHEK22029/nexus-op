/* ══════════════════════════════════════════════════════════
   navigation — the whole information architecture, in one file.

   WHAT WAS WRONG. Thirty-five links in one flat sidebar, eight groups deep,
   all visible at once. Two of them were "Vendors" and "Vendor Supplies" —
   the same subject, split across two clicks, for no reason a user would
   recognise. A menu that long stops being navigation and becomes a list you
   scan every time.

   THE SHAPE NOW (Zoho's, and it earns it):

     RAIL     seven modules, icons + short labels, always visible.
              Answers "which part of the business am I in".
     PANEL    appears for the selected module, listing only its screens.
              Answers "what can I do here".
     CONTENT  the work itself.

   You see seven things instead of thirty-five, and the seven map to how
   somebody actually describes their day — I'm doing sales, I'm buying, I'm
   on the floor.

   CONSOLIDATION IS THE POINT, not just nesting. Screens that answer one
   question became one screen with tabs:
     · Vendors + Vendor Supplies  -> Vendors (Directory | What they supply)
     · SKUs + Raw Materials       -> Items   (Products | Raw materials)
     · Inventory + Requirements + Movements -> Stock (three tabs)
   Moving a thirty-five-item menu into folders would have hidden the problem
   rather than fixed it.

   This file is also the ONE source for path -> permission, which the route
   guard and the panel both read. Two lists of that drift, and the nav ends
   up advertising a page the server refuses.
   ══════════════════════════════════════════════════════════ */

/* Resource names must match backend/shared/roles.js exactly — the server is
   the authority, and a name that doesn't match there grants nothing. */
export const MODULES = [
  {
    key: 'home',
    label: 'Home',
    icon: 'LayoutDashboard',
    // No panel: a dashboard with a sub-menu is a dashboard that failed.
    landing: '/dashboard',
    items: [
      { label: 'Dashboard', path: '/dashboard' },
      { label: 'Knowledge base', path: '/knowledge' },
      { label: 'Activity', path: '/activity' },
    ],
  },
  {
    key: 'sales',
    label: 'Sales',
    icon: 'ShoppingBag',
    landing: '/customers',
    /* Grouped in the order the work actually happens: win it, ship it, bill
       it. A flat list of six gives no clue that a quotation becomes an order
       becomes a challan becomes an invoice. The menu can show the flow
       rather than merely listing the screens.

       `badge` points at a field the list endpoint's summary already
       computes, so the menu can say where work is waiting without inventing
       a second source for the number. */
    items: [
      { group: 'Sell' },
      { label: 'Customers', path: '/customers', resource: 'customers' },
      { label: 'Quotations', path: '/sales-quotations', resource: 'sales-quotations',
        badge: { endpoint: 'sales-quotations', field: 'expired', tone: 'warn', title: 'expired' } },
      { label: 'Orders', path: '/customer-orders', resource: 'customer-orders',
        badge: { endpoint: 'customer-orders', field: 'open', tone: 'info', title: 'still open' } },
      { group: 'Ship' },
      { label: 'Delivery challans', path: '/delivery-challans', resource: 'delivery-challans',
        badge: { endpoint: 'delivery-challans', field: 'eway_missing', tone: 'danger', title: 'missing an e-way bill' } },
      { group: 'Bill' },
      { label: 'Invoices', path: '/sales-invoices', resource: 'sales-invoices' },
      { label: 'Credit & debit notes', path: '/credit-debit-notes', resource: 'credit-debit-notes',
        badge: { endpoint: 'credit-debit-notes', field: 'unreferenced', tone: 'danger', title: 'missing an invoice reference' } },
    ],
  },
  {
    key: 'purchases',
    label: 'Purchases',
    icon: 'ShoppingCart',
    landing: '/vendors',
    items: [
      { group: 'Source' },
      /* Was two menu entries. A vendor and what that vendor supplies are the
         same subject, and splitting them meant answering "who sells us
         plate" from a different screen than "who are our vendors". */
      { label: 'Vendors', path: '/vendors', resource: 'vendors',
        hint: 'Directory and what each one supplies' },
      { label: 'Indents', path: '/indent', resource: 'indent' },
      { label: 'Vendor quotes', path: '/quotations', resource: 'quotations',
        badge: { endpoint: 'quotations', field: 'awaiting_quotes', tone: 'info', title: 'still short of three quotes' } },
      { group: 'Buy & receive' },
      { label: 'Purchase orders', path: '/purchase-orders', resource: 'po',
        badge: { endpoint: 'po', field: 'awaiting_approval', tone: 'warn', title: 'awaiting approval' } },
      { label: 'Goods received', path: '/grn', resource: 'grn' },
      { group: 'Pay' },
      { label: 'Vendor bills', path: '/bills', resource: 'bills',
        badge: { endpoint: 'bills', field: 'pending_approval', tone: 'warn', title: 'pending approval' } },
      { label: 'Payables', path: '/payables', resource: 'payables' },
    ],
  },
  {
    key: 'stock',
    label: 'Stock',
    icon: 'Package',
    landing: '/inventory',
    items: [
      { label: 'Stock on hand', path: '/inventory', resource: 'inventory',
        hint: 'Balances, movements and what to reorder' },
      { label: 'Items', path: '/items', resource: 'skus',
        hint: 'Products and raw materials' },
      { label: 'Requirements', path: '/material-requirements', resource: 'material-requirements' },
    ],
  },
  {
    key: 'production',
    label: 'Production',
    icon: 'Factory',
    landing: '/production',
    items: [
      { group: 'Make' },
      { label: 'Production orders', path: '/production', resource: 'production',
        badge: { endpoint: 'production', field: 'no_output', tone: 'warn', title: 'with nothing produced yet' } },
      { label: 'Work orders', path: '/workorders', resource: 'work-orders' },
      { group: 'Plan' },
      { label: 'Projects', path: '/projects', resource: 'projects' },
      { label: 'Milestones', path: '/milestones', resource: 'milestones',
        badge: { endpoint: 'milestones', field: 'behind_plan', tone: 'danger', title: 'behind plan' } },
      { group: 'Measure' },
      { label: 'Bill of quantities', path: '/boq', resource: 'boq' },
      { label: 'Measurement book', path: '/mb', resource: 'mb' },
    ],
  },
  {
    key: 'money',
    label: 'Money',
    icon: 'Wallet',
    landing: '/expenses',
    items: [
      { label: 'Expenses', path: '/expenses', resource: 'expenses' },
      { label: 'RA bills', path: '/bills', resource: 'bills' },
      { label: 'Reports', path: '/reports' },
    ],
  },
  {
    key: 'settings',
    label: 'Settings',
    icon: 'Settings',
    landing: '/company-profile',
    items: [
      { group: 'Company' },
      { label: 'Company profile', path: '/company-profile', resource: 'company-profile' },
      { label: 'Automation', path: '/automation', resource: 'automation-settings' },
      { group: 'People' },
      { label: 'Team', path: '/users', resource: 'users' },
      { group: 'Data' },
      { label: 'Import data', path: '/import' },
      { label: 'Process flow', path: '/flow' },
    ],
  },
  /* The Configurator is its own rail entry, not a line inside Settings.

     It was one link among ten under a gear icon, which put "change what every
     role in the business is allowed to do" at the same weight as "import a
     CSV". It is the administrator's control panel and it earns its own icon.

     Every item is adminOnly, and visibleModules() drops a module with no
     reachable links — so this whole entry is simply absent for anyone who is
     not an Administrator, rather than showing an icon that refuses them. */
  {
    key: 'configurator',
    label: 'Configure',
    icon: 'SlidersHorizontal',
    landing: '/configurator',
    items: [
      { label: 'All settings', path: '/configurator', adminOnly: true,
        hint: 'Everything you can configure' },
      { group: 'Access' },
      { label: 'Users & roles', path: '/configurator/people', adminOnly: true,
        hint: 'Who has a login, and how much they can reach' },
      { label: 'Roles & permissions', path: '/configurator/roles', adminOnly: true,
        hint: 'What each role may open and change' },
      { group: 'Business' },
      { label: 'Categories', path: '/configurator/categories', adminOnly: true,
        hint: 'Your words for what you buy and sell' },
      { label: 'Change history', path: '/configurator/history', adminOnly: true,
        hint: 'Who widened access, and when' },
    ],
  },
];

/* Paths reachable but not listed — detail screens, document views, builders.
   They belong to a module for highlighting purposes without cluttering its
   panel with things you never navigate to directly. */
const DETAIL_ROUTES = {
  '/customers/': 'sales',
  '/sales-quotations/': 'sales',
  '/sales-invoices/': 'sales',
  '/delivery-challans/': 'sales',
  '/credit-debit-notes/': 'sales',
  '/vendor-supplies': 'purchases',      // kept as a redirect into the Vendors tab
  '/po/': 'purchases',
  '/grn-bills/': 'purchases',
  '/skus': 'stock',
  '/raw-materials': 'stock',
  '/production/': 'production',
  '/knowledge/': 'home',
};

/* ── path -> permission ───────────────────────────────────── */
export const PATH_RESOURCES = (() => {
  const map = {};
  // Group rows are headings, not destinations — they have no path.
  for (const m of MODULES) for (const i of m.items) if (i.path && i.resource) map[i.path] = i.resource;
  // Detail and legacy paths that still need guarding.
  Object.assign(map, {
    '/vendor-supplies': 'vendor-items',
    '/skus': 'skus',
    '/raw-materials': 'raw-materials',
    '/po': 'po',
    '/items': 'skus',
  });
  return map;
})();

export const UNGATED_PATHS = [
  '/dashboard', '/knowledge', '/activity', '/flow', '/reports', '/import',
  '/onboarding', '/beta-welcome', '/beta-onboarding', '/get-started',
];

export const ADMIN_ONLY_PATHS = ['/configurator'];

const SORTED = Object.keys(PATH_RESOURCES).sort((a, b) => b.length - a.length);

/** The resource governing a path, or null if deliberately ungated. */
export function resourceForPath(pathname = '') {
  const p = String(pathname);
  if (UNGATED_PATHS.some(u => p === u || p.startsWith(u + '/'))) return null;
  for (const prefix of SORTED) {
    if (p === prefix || p.startsWith(prefix + '/')) return PATH_RESOURCES[prefix];
  }
  return null;
}

export function isAdminOnlyPath(pathname = '') {
  const p = String(pathname);
  return ADMIN_ONLY_PATHS.some(a => p === a || p.startsWith(a + '/'));
}

/** Which rail module a path belongs to, so the rail highlights correctly
    even on a detail screen that isn't in any panel. */
export function moduleForPath(pathname = '') {
  const p = String(pathname);
  // Exact panel entries win.
  for (const m of MODULES) for (const i of m.items) if (i.path && p === i.path) return m.key;
  // Then longest prefix among panel entries.
  let best = null, bestLen = 0;
  for (const m of MODULES) {
    for (const i of m.items) {
      if (i.path && p.startsWith(i.path + '/') && i.path.length > bestLen) { best = m.key; bestLen = i.path.length; }
    }
  }
  if (best) return best;
  for (const [prefix, key] of Object.entries(DETAIL_ROUTES)) {
    if (p.startsWith(prefix)) return key;
  }
  return 'home';
}

/** Panel entries this user may actually open, group headings included. */
export function visibleItems(moduleKey, can, role) {
  const m = MODULES.find(x => x.key === moduleKey);
  if (!m) return [];

  const allowed = m.items.filter(i => {
    if (i.group) return true;                       // decided below
    if (i.adminOnly) return role === 'Administrator';
    return !i.resource || can(i.resource, 'read');
  });

  /* Drop a heading whose whole group was filtered away by permissions —
     otherwise a Sales user sees "Buy & receive" with nothing under it, which
     reads as a broken menu rather than a restricted one. */
  return allowed.filter((item, idx) => {
    if (!item.group) return true;
    const next = allowed.slice(idx + 1).find(x => !x.group || x.group);
    return Boolean(next && !next.group);
  });
}

/** Just the navigable entries — no headings. */
export function visibleLinks(moduleKey, can, role) {
  return visibleItems(moduleKey, can, role).filter(i => i.path);
}

/** Modules with at least one reachable screen. */
export function visibleModules(can, role) {
  return MODULES.filter(m => visibleLinks(m.key, can, role).length > 0);
}

/** Every badge declared across the nav, deduped by endpoint so the panel
    fetches each summary once rather than once per entry. */
export function badgeEndpoints() {
  const out = new Map();
  for (const m of MODULES) {
    for (const i of m.items) {
      if (!i.badge) continue;
      if (!out.has(i.badge.endpoint)) out.set(i.badge.endpoint, []);
      out.get(i.badge.endpoint).push({ path: i.path, ...i.badge });
    }
  }
  return out;
}
