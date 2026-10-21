/* ══════════════════════════════════════════════════════════════════════
   The getting-started tutorial's state, shared by the panel and coach card
   (components/Tutorial) and the ▶ button at the top of the menu rail
   (components/AppNav).

   When it opens by itself: once, on a person's first sign-in — right after
   sign-up, or after accepting an invitation. Both set `nexus_tour_pending`;
   it is read and cleared here, so the next sign-in starts as usual. After
   that it opens only from the ▶ button.

   Progress is the company's real data (GET /setup/first-steps), so it is the
   same on every device and ticks off steps done anywhere. The step being
   followed lives in sessionStorage: it carries across screens, and a new
   sign-in starts without it.
   ══════════════════════════════════════════════════════════════════════ */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { usePermissions } from './PermissionContext';
import { getToken } from '../lib/apiAuth';
import { STEPS, CORE } from '../lib/tutorial';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const PENDING = 'nexus_tour_pending';
const Ctx = createContext(null);

const pendingNow = () => { try { return localStorage.getItem(PENDING) === '1'; } catch { return false; } };

const session = {
  get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch { /* storage blocked */ } },
};

export function TutorialProvider({ children }) {
  const { user } = useAuth();
  const { can, loading: permsLoading } = usePermissions();
  const { pathname } = useLocation();
  const activeKey = `maks.tutorial.active.${user?.id ?? 'me'}`;

  /* First sign-in: open once (the flag is cleared below), then never by itself again. */
  const [open, setOpen] = useState(pendingNow);
  const [intro, setIntro] = useState(pendingNow);
  const [counts, setCounts] = useState(null);
  const [active, setActiveState] = useState(() => session.get(activeKey));

  /* Only the steps this person's role can do. */
  const steps = useMemo(() => STEPS
    .filter(s => !s.resource || can(s.resource, 'write'))
    .map(s => ({ ...s, isDone: !!counts && s.done(counts), href: (counts && s.to?.(counts)) || s.path })), [can, counts]);
  const doneCount = steps.filter(s => s.isDone).length;
  const next = steps.find(s => !s.isDone) || null;
  /* The first sale is what the tutorial asks of everyone; the rest waits.
     A role with no selling steps (a buyer, a store keeper) has its own
     steps as its first chapter instead. */
  const coreSteps = steps.filter(s => CORE.has(s.chapter));
  const core = coreSteps.length
    ? { total: coreSteps.length, done: coreSteps.filter(s => s.isDone).length }
    : { total: steps.length, done: doneCount };
  const coreComplete = core.total > 0 && core.done === core.total;

  const refresh = useCallback(async () => {
    try {
      const t = getToken();
      const r = await fetch(`${API}/setup/first-steps`, { headers: t ? { Authorization: `Bearer ${t}` } : {} });
      if (r.ok) setCounts(await r.json());
    } catch { /* the tutorial waits; nothing else depends on it */ }
  }, []);

  useEffect(() => { try { localStorage.removeItem(PENDING); } catch { /* storage blocked */ } }, []);

  /* Progress: on every screen change and whenever the panel opens; and
     every few seconds while a step is being followed, since a customer is
     added without leaving the Customers screen. */
  useEffect(() => {
    const id = setTimeout(refresh, 250);
    return () => clearTimeout(id);
  }, [pathname, open, refresh]);
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(refresh, 3000);
    return () => clearInterval(id);
  }, [active, refresh]);

  const setActive = useCallback((key) => { setActiveState(key); session.set(activeKey, key); }, [activeKey]);

  /* Ready once both are in: the progress, and the role that decides which
     steps there are (before it loads, every step is filtered out). */
  const ready = !!counts && !permsLoading;
  const value = useMemo(() => ({
    open, setOpen, intro, setIntro, steps, doneCount, total: steps.length, next,
    core, coreComplete, hasSale: coreSteps.length > 0,
    active, setActive, refresh, ready,
  }), [open, intro, steps, doneCount, next, core.done, core.total, coreComplete, coreSteps.length, active, setActive, refresh, ready]);   // eslint-disable-line react-hooks/exhaustive-deps
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/* null outside the app shell (marketing pages have no tutorial). */
export const useTutorial = () => useContext(Ctx);
