import { ROLES } from './roles.snapshot.js';

/* What a role may do, the way the app's PermissionContext answers it: a
   resource is readable or writable when the role's permission list says so.
   The lists are the backend's own (roles.snapshot.js, generated). */
export const canFor = (role) => (resource, action = 'read') => {
  const actions = ROLES[role]?.permissions?.[resource];
  return Array.isArray(actions) && actions.includes(action);
};

/* The custom role the team chapter creates: "Store Keeper", started from
   Procurement, with purchase orders turned down to read-only — a person who
   receives goods and keeps stock, but does not buy. Built by the same rule
   the Configurator uses (copy, then change). */
export const STORE_KEEPER = (() => {
  const base = ROLES.Procurement?.permissions || {};
  const permissions = { ...base, po: (base.po || []).filter((a) => a === 'read') };
  return { label: 'Store Keeper', permissions };
})();
export const canStoreKeeper = (resource, action = 'read') => {
  const actions = STORE_KEEPER.permissions[resource];
  return Array.isArray(actions) && actions.includes(action);
};

export const ROLE_ORDER = ['Owner', 'Sales', 'Procurement', 'Production', 'Finance'];
