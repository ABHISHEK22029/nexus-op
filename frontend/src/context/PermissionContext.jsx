/* ══════════════════════════════════════════════════════════
   PermissionContext — what the signed-in user may actually do.

   The permission map is FETCHED from /auth/me, never defined here. The UI
   deliberately has no copy of the rules: a second copy is a copy that
   drifts, and a drifted permission table is worse than none because people
   trust it. Here the UI can only ever offer what the server already agreed
   to.

   And hiding a button is courtesy, not security. Every check below has a
   twin on the server; this exists so the product doesn't dangle actions
   that are going to come back 403.
   ══════════════════════════════════════════════════════════ */
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const PermissionContext = createContext(null);

export function PermissionProvider({ children }) {
  const [state, setState] = useState({ loading: true, user: null, permissions: {}, role: null });

  const load = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) { setState({ loading: false, user: null, permissions: {}, role: null }); return; }
    try {
      const res = await fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('session');
      const u = await res.json();
      setState({
        loading: false,
        user: u,
        role: u.role,
        roleLabel: u.roleLabel || u.role,
        permissions: u.permissions || {},
      });
    } catch {
      /* No permissions rather than all permissions. If we can't establish
         what someone may do, the safe reading is "nothing" — the server
         will refuse anyway, and guessing generous here just produces
         buttons that fail. */
      setState({ loading: false, user: null, permissions: {}, role: null });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const can = useCallback((resource, action = 'read') => {
    const actions = state.permissions?.[resource];
    return Array.isArray(actions) && actions.includes(action);
  }, [state.permissions]);

  return (
    <PermissionContext.Provider value={{ ...state, can, reload: load }}>
      {children}
    </PermissionContext.Provider>
  );
}

export function usePermissions() {
  const ctx = useContext(PermissionContext);
  if (!ctx) {
    // Fail closed rather than crashing a page that forgot the provider.
    return { loading: false, user: null, role: null, permissions: {}, can: () => false, reload: () => {} };
  }
  return ctx;
}

/** Convenience for the common "can I change this?" question. */
export function useCan(resource, action = 'read') {
  const { can } = usePermissions();
  return can(resource, action);
}
