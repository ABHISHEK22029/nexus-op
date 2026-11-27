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
  /* 26 Nov: arranged by how often things are used — what is done every day
     first (sell, buy, stock), what is touched once last (settings) — and
     ten rail icons became seven and a small Help:
       · Marketing (Enquiries, Catalogue) folded into Sales as its first
         step: an enquiry is where a sale starts, and "Marketing" read as the
         public website rather than part of the work
       · Money gathers money in and out — what customers owe (To collect)
         and what is owed to vendors (To pay, was under Purchases)
       · Configure folded into Settings as its Admin group
       · Knowledge base moved to Help, at the foot of the rail
     A module opens on its `landing` screen when the user may open it — the
     one most often wanted (Sales on Orders, Purchases on Purchase orders) —
     else on its first. Every screen keeps its address. */
  {
    key: 'home',
    label: 'Home',
    icon: 'LayoutDashboard',
    // No panel: a dashboard with a sub-menu is a dashboard that failed.
    landing: '/dashboard',
    items: [
      { label: 'Dashboard', path: '/dashboard' },
      { label: 'Activity', path: '/activity' },
    ],
  },
  {
    key: 'sales',
    label: 'Sales',
    icon: 'ShoppingBag',
    landing: '/customer-orders',
    /* In the order the work happens: someone asks, you quote, they order,
       you ship, you bill. Enquiries lead the panel: an enquiry is somebody
       waiting for a call back, and it goes cold faster than anything else.

       `badge` points at a field the list endpoint's summary already
       computes, so the menu can say where work is waiting without inventing
       a second source for the number. */
    items: [
      { group: 'Win' },
      { label: 'Enquiries', path: '/enquiries', resource: 'enquiries',
        badge: { endpoint: 'enquiries', field: 'new', tone: 'info', title: 'not yet read' } },
      /* The products on the public page — something a business works ON
         (what to list, the copy, sharing the link). The page's settings stay
         under Settings > Admin > Catalogue. */
      { label: 'Catalogue', path: '/catalogue', resource: 'catalogue' },
      { label: 'Customers', path: '/customers', resource: 'customers' },
      { label: 'Quotations', path: '/sales-quotations', resource: 'sales-quotations',
        badge: { endpoint: 'sales-quotations', field: 'expired', tone: 'warn', title: 'expired' } },
      { group: 'Order' },
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
    landing: '/purchase-orders',
    items: [
      { group: 'Buy & receive' },
      { label: 'Purchase orders', path: '/purchase-orders', resource: 'po',
        badge: { endpoint: 'po', field: 'awaiting_approval', tone: 'warn', title: 'awaiting approval' } },
      { label: 'Goods received', path: '/grn', resource: 'grn' },
      { group: 'Source' },
      /* A vendor and what that vendor supplies are one subject: one entry. */
      { label: 'Vendors', path: '/vendors', resource: 'vendors',
        hint: 'Directory and what each one supplies' },
      /* Quotations that arrived as files. Same resource as Ask for quotes —
         the same people raise and decide on both. */
      { label: 'Vendor quotations', path: '/vendor-quotations', resource: 'quotations',
        hint: 'Upload the quotes vendors sent and compare them' },
      { label: 'Ask for quotes', path: '/quotations', resource: 'quotations',
        hint: 'Ask up to three vendors to price one item',
        badge: { endpoint: 'quotations', field: 'awaiting_quotes', tone: 'info', title: 'still short of three quotes' } },
      { label: 'Indents', path: '/indent', resource: 'indent', module: 'contracting' },
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
      { label: 'Work orders', path: '/workorders', resource: 'work-orders', module: 'contracting' },
      { group: 'Plan' },
      { label: 'Projects', path: '/projects', resource: 'projects', module: 'contracting' },
      { label: 'Milestones', path: '/milestones', resource: 'milestones', module: 'contracting',
        badge: { endpoint: 'milestones', field: 'behind_plan', tone: 'danger', title: 'behind plan' } },
      { group: 'Measure' },
      { label: 'Bill of quantities', path: '/boq', resource: 'boq', module: 'contracting' },
      { label: 'Measurement book', path: '/mb', resource: 'mb', module: 'contracting' },
    ],
  },
  {
    /* Money in and out, in one place. "To collect" is the invoices still
       owed (the Unpaid view, at an address of its own so this rail icon
       stays lit); "To pay" is Payables — the vendor bills, and how overdue. */
    key: 'money',
    label: 'Money',
    icon: 'Wallet',
    landing: '/receivables',
    items: [
      { group: 'In and out' },
      { label: 'To collect', path: '/receivables', resource: 'sales-invoices',
        hint: 'Invoices still owed by customers' },
      { label: 'To pay', path: '/payables', resource: 'payables',
        hint: 'What you owe suppliers, and how overdue it is' },
      { group: 'Records' },
      { label: 'Expenses', path: '/expenses', resource: 'expenses' },
      { label: 'RA bills', path: '/bills', resource: 'bills', module: 'contracting' },
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
      { label: 'Document numbering', path: '/document-numbering', resource: 'company-profile' },
      { label: 'Automation', path: '/automation', resource: 'recurring' },
      { group: 'People' },
      { label: 'Team', path: '/users', resource: 'users' },
      { group: 'Data' },
      { label: 'Import data', path: '/import' },
      { label: 'Process flow', path: '/flow', module: 'contracting' },
      /* What was the Configure rail entry: the administrator's controls.
         Every item is adminOnly, so the group — heading and all — is simply
         absent for anyone who is not an owner or Administrator. */
      { group: 'Admin' },
      { label: 'All settings', path: '/configurator', adminOnly: true,
        hint: 'Everything you can configure' },
      { label: 'Users & roles', path: '/configurator/people', adminOnly: true,
        hint: 'Who has a login, and how much they can reach' },
      { label: 'Roles & permissions', path: '/configurator/roles', adminOnly: true,
        hint: 'What each role may open and change' },
      { label: 'Categories', path: '/configurator/categories', adminOnly: true,
        hint: 'Your words for what you buy and sell' },
      { label: 'Modules', path: '/configurator/modules', adminOnly: true,
        hint: 'Which parts of the product this business uses' },
      { label: 'Catalogue', path: '/configurator/catalogue', adminOnly: true,
        hint: 'Your public page and what appears on it' },
      { label: 'Change history', path: '/configurator/history', adminOnly: true,
        hint: 'Who widened access, and when' },
    ],
  },
  {
    /* At the foot of the rail, small: where to look things up. The Guide
       (getting-started tutorial) is switched off for now (lib/features); the
       Knowledge base offers it again when it is switched on. */
    key: 'help',
    label: 'Help',
    icon: 'LifeBuoy',
    landing: '/knowledge',
    bottom: true,
    items: [
      { label: 'Knowledge base', path: '/knowledge' },
    ],
  },
];

/* Paths reachable but not listed — detail screens, document views, builders.
   They belong to a module for highlighting purposes without cluttering its
   panel with things you never navigate to directly. */
const DETAIL_ROUTES = {
  '/customers/': 'sales',
  /* Enquiries and the Catalogue are Sales' first step since 26 Nov. */
  '/enquiries': 'sales',
  '/catalogue': 'sales',
  '/sales-quotations/': 'sales',
  '/sales-invoices/': 'sales',
  '/delivery-challans/': 'sales',
  '/credit-debit-notes/': 'sales',
  '/vendor-supplies': 'purchases',      // kept as a redirect into the Vendors tab
  '/po/': 'purchases',
  /* a vendor bill is money owed: it opens from Money > To pay */
  '/grn-bills/': 'money',
  '/skus': 'stock',
  '/raw-materials': 'stock',
  '/production/': 'production',
  '/knowledge/': 'help',
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
    '/grn-bills': 'grn-bills',
  });
  return map;
})();

export const UNGATED_PATHS = [
  '/dashboard', '/knowledge', '/activity', '/flow', '/reports', '/import',
  '/onboarding', '/beta-welcome', '/beta-onboarding', '/get-started',
];

export const ADMIN_ONLY_PATHS = ['/configurator'];

/** Which optional feature area a path belongs to, or null if always on. */
export const PATH_MODULES = Object.fromEntries(
  MODULES.flatMap(m => m.items.filter(i => i.path && i.module).map(i => [i.path, i.module]))
);
/* Named apart from moduleForPath below, which answers a different question:
   that one says which RAIL module to highlight. Two exported functions with
   one name is how a menu highlight ends up deciding what you may open. */
export function optionalModuleForPath(pathname = '') {
  const p = String(pathname);
  const hit = Object.keys(PATH_MODULES).find(k => p === k || p.startsWith(k + '/'));
  return hit ? PATH_MODULES[hit] : null;
}

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
export function visibleItems(moduleKey, can, role, modules = null) {
  const m = MODULES.find(x => x.key === moduleKey);
  if (!m) return [];

  /* An item belonging to an optional module is hidden when the organisation
     has not switched that module on. Distinct from a permission: a screen
     you lack the role for is refused, a module you have not enabled simply
     is not part of your product. Absent settings mean everything is on, so
     an install that predates the switch behaves exactly as before. */
  const moduleOn = (key) => !key || !modules || modules[key] !== false;

  const allowed = m.items.filter(i => {
    if (i.group) return true;                       // decided below
    if (!moduleOn(i.module)) return false;
    /* Owner is the person who created the organisation. Restricting this to
       the literal 'Administrator' — the cross-tenant platform role — meant a
       founder could not see the Configure menu at all, so they could not add
       their own staff or give anyone a role in their own company. */
    if (i.adminOnly) return role === 'Administrator' || role === 'Owner';
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
export function visibleLinks(moduleKey, can, role, modules = null) {
  return visibleItems(moduleKey, can, role, modules).filter(i => i.path);
}

/** Modules with at least one reachable screen. */
export function visibleModules(can, role, modules = null) {
  return MODULES.filter(m => visibleLinks(m.key, can, role, modules).length > 0);
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
