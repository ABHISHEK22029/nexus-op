/* ══════════════════════════════════════════════════════════
   AppNav — a narrow module rail plus a contextual panel.

   Replaces a 35-link sidebar. The rail carries seven modules; the panel
   shows only the screens belonging to whichever is selected. You read seven
   things to decide where to go instead of thirty-five.

   The panel is collapsible because some screens — the deficiency engine,
   the permission grid — want the width more than they want the menu. It is
   NOT collapsible on the rail: hiding which module you're in to save 64px
   trades orientation for very little.

   Both tiers are filtered by permission from the same map the route guard
   uses, so the nav can never advertise a page the server will refuse.
   ══════════════════════════════════════════════════════════ */
import React, { useState, useEffect, useSyncExternalStore } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import ScopeBar from './ScopeBar';
import {
  Zap, ChevronLeft, ChevronRight, Sun, Moon, Home,
} from 'lucide-react';
import { NAV_ICONS as ICONS } from '../lib/navIcons';
import { usePermissions } from '../context/PermissionContext';
import { useTheme } from '../context/ThemeContext';
import { getToken } from '../lib/apiAuth';
import {
  MODULES, moduleForPath, visibleItems, visibleLinks, visibleModules,
} from '../lib/navigation';

/* Module icons live in lib/navIcons, shared with the product film. */
const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const PANEL_KEY = 'maks_nav_panel_open';

/* ══════════════════════════════════════════════════════════
   Badge counts — where work is waiting, in the menu itself.

   Every number here comes from the list endpoint's OWN summary aggregate,
   the same one the page header renders. That matters: a menu that counts
   things a different way than the page it links to will eventually disagree
   with it, and the person looking at both has no way to know which is
   right.

   Only the module currently open is fetched, and only once per endpoint —
   seven modules' worth of counts on every page load would be a lot of
   requests to tell someone something they may not be looking at.
   ══════════════════════════════════════════════════════════ */
function useBadges(moduleKey, items) {
  /* Counts are kept with the module they were fetched for, so moving to a
     module with no badges shows none without clearing state in the effect. */
  const [fetched, setFetched] = useState({ module: null, counts: {} });

  useEffect(() => {
    const wanted = items.filter(i => i.badge);
    if (!wanted.length) return undefined;

    let cancelled = false;
    const byEndpoint = new Map();
    for (const i of wanted) {
      if (!byEndpoint.has(i.badge.endpoint)) byEndpoint.set(i.badge.endpoint, []);
      byEndpoint.get(i.badge.endpoint).push(i);
    }

    (async () => {
      const token = getToken();
      const next = {};
      await Promise.all([...byEndpoint.entries()].map(async ([endpoint, entries]) => {
        try {
          // limit=1: we want the summary, not the rows.
          const res = await fetch(`${API}/${endpoint}?limit=1`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          if (!res.ok) return;
          const d = await res.json();
          const s = d?.summary;
          if (!s) return;
          for (const e of entries) {
            const v = Number(s[e.badge.field]);
            if (Number.isFinite(v) && v > 0) next[e.path] = v;
          }
        } catch { /* a badge is a nicety; never break the nav for one */ }
      }));
      if (!cancelled) setFetched({ module: moduleKey, counts: next });
    })();

    return () => { cancelled = true; };
    /* Once per module: `items` is rebuilt on every render, and following it
       would refetch the counts each time the page re-renders. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleKey]);

  return fetched.module === moduleKey ? fetched.counts : {};
}

/* Phones and small tablets, where the menu floats over the page (index.css,
   max-width 900px) rather than sitting beside it. */
const NARROW = '(max-width: 900px)';
const onNarrowChange = (cb) => {
  const m = window.matchMedia(NARROW);
  m.addEventListener('change', cb);
  return () => m.removeEventListener('change', cb);
};
const useNarrow = () => useSyncExternalStore(onNarrowChange, () => window.matchMedia(NARROW).matches, () => false);

export default function AppNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { can, role, modules: orgModules, loading } = usePermissions();
  const { isDark, toggleTheme } = useTheme();

  /* The module the URL is in, not one the user picked — so a deep link or a
     browser Back lands with the correct panel already open. Clicking the
     rail navigates; it does not set a separate piece of state that could
     then disagree with the address bar. */
  const activeModule = moduleForPath(location.pathname);

  const [panelOpen, setPanelOpen] = useState(() => {
    try { return localStorage.getItem(PANEL_KEY) !== 'closed'; } catch { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem(PANEL_KEY, panelOpen ? 'open' : 'closed'); } catch { /* private mode */ }
  }, [panelOpen]);

  /* On a phone the menu floats OVER the page, and it opened on every screen
     and stayed open after a choice — so every page arrived hidden behind it.
     There it is a menu you open: it is open only on the page it was opened
     on, so choosing a screen closes it by itself, and a tap outside or
     Escape closes it too. The desktop keeps the remembered choice. */
  const narrow = useNarrow();
  const [openOn, setOpenOn] = useState(null);
  const shown = narrow ? openOn === location.pathname : panelOpen;
  const openPanel = () => (narrow ? setOpenOn(location.pathname) : setPanelOpen(true));
  const closePanel = () => (narrow ? setOpenOn(null) : setPanelOpen(false));
  useEffect(() => {
    if (!narrow) return undefined;
    const esc = (e) => { if (e.key === 'Escape') setOpenOn(null); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [narrow]);

  /* Every hook runs BEFORE the loading early-return. useBadges was below it
     for a few minutes, which is a conditional hook call — React throws
     "rendered more hooks than during the previous render" the moment
     `loading` flips from true to false, i.e. on every first paint. */
  const modules = visibleModules(can, role, orgModules);
  const items = visibleItems(activeModule, can, role, orgModules);
  const badges = useBadges(activeModule, items);
  const current = MODULES.find(m => m.key === activeModule);

  if (loading) return <div className="nav-rail" aria-hidden />;

  /* Clicking a rail module goes to its first screen the user can actually
     open — not a hardcoded landing page they may not have access to. */
  const goToModule = (m) => {
    const allowed = visibleLinks(m.key, can, role, orgModules);
    if (!allowed.length) return;
    navigate(allowed[0].path);
    /* On a phone, tapping a module also shows its screens to choose from. */
    if (narrow) setOpenOn(allowed[0].path);
  };

  return (
    <>
      <nav className="nav-rail" aria-label="Modules">
        <button className="nav-rail-logo" onClick={() => navigate('/dashboard')} title="Maks Ops">
          <Zap size={17} color="#fff" fill="#fff" />
        </button>

        <div className="nav-rail-items">
          {modules.map(m => {
            const Icon = ICONS[m.icon] || Home;
            const active = m.key === activeModule;
            return (
              <button
                key={m.key}
                onClick={() => goToModule(m)}
                className={`nav-rail-item${active ? ' is-active' : ''}`}
                aria-current={active ? 'page' : undefined}
                title={m.label}
              >
                <Icon size={19} />
                <span>{m.label}</span>
              </button>
            );
          })}
        </div>

        <button className="nav-rail-theme" onClick={toggleTheme}
          title={isDark ? 'Switch to light' : 'Switch to dark'}>
          {isDark ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </nav>

      {narrow && shown && <div className="nav-panel-backdrop" onClick={closePanel} aria-hidden="true" />}
      {shown && items.some(i => i.path) && (
        <aside className="nav-panel" aria-label={`${current?.label} screens`}>
          {/* The organisation and the scope being viewed. Moved out of the
              top bar: they answer "where am I", which is what the navigation
              beside them is for. */}
          <ScopeBar />
          <div className="nav-panel-head">
            <span>{current?.label}</span>
            <button onClick={closePanel} title="Collapse menu" aria-label="Collapse menu">
              <ChevronLeft size={15} />
            </button>
          </div>
          <div className="nav-panel-items">
            {items.map((i, idx) => {
              /* A heading, not a destination. Grouped by the order the work
                 happens — Source, Buy & receive, Pay — so the menu shows the
                 flow rather than just listing seven screens. */
              if (i.group) {
                return <div key={`g${idx}`} className="nav-panel-group">{i.group}</div>;
              }
              const count = badges[i.path];
              return (
                <NavLink
                  key={i.path}
                  to={i.path}
                  className={({ isActive }) => `nav-panel-item${isActive ? ' is-active' : ''}`}
                  end={i.path === '/dashboard'}
                  title={count ? `${count} ${i.badge?.title || 'need attention'}` : undefined}
                >
                  <span className="nav-panel-row">
                    <span className="nav-panel-label">{i.label}</span>
                    {/* The count comes from the list endpoint's own summary,
                        so the menu and the page can never disagree about how
                        many things need attention. Zero is not shown — a
                        badge reading "0" is noise pretending to be signal. */}
                    {count > 0 && (
                      <span className={`nav-badge nav-badge-${i.badge.tone || 'info'}`}>{count}</span>
                    )}
                  </span>
                  {/* The hint says what a consolidated screen now contains, so
                      someone hunting for "Vendor Supplies" can see where it went
                      rather than concluding it was removed. */}
                  {i.hint && <span className="nav-panel-hint">{i.hint}</span>}
                </NavLink>
              );
            })}
          </div>
        </aside>
      )}

      {!shown && (
        <button className="nav-panel-reopen" onClick={openPanel}
          title="Show menu" aria-label="Show menu">
          <ChevronRight size={15} />
        </button>
      )}
    </>
  );
}
