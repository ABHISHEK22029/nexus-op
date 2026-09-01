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
import React, { useState, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, ShoppingBag, ShoppingCart, Package, Factory, Wallet,
  Settings, Zap, ChevronLeft, ChevronRight, Sun, Moon, Home,
} from 'lucide-react';
import { usePermissions } from '../context/PermissionContext';
import { useTheme } from '../context/ThemeContext';
import { MODULES, moduleForPath, visibleItems, visibleModules } from '../lib/navigation';

const ICONS = { LayoutDashboard, ShoppingBag, ShoppingCart, Package, Factory, Wallet, Settings };

const PANEL_KEY = 'maks_nav_panel_open';

export default function AppNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { can, role, loading } = usePermissions();
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

  if (loading) return <div className="nav-rail" aria-hidden />;

  const modules = visibleModules(can, role);
  const items = visibleItems(activeModule, can, role);
  const current = MODULES.find(m => m.key === activeModule);

  /* Clicking a rail module goes to its first screen the user can actually
     open — not a hardcoded landing page they may not have access to. */
  const goToModule = (m) => {
    const allowed = visibleItems(m.key, can, role);
    if (allowed.length) navigate(allowed[0].path);
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

      {panelOpen && items.length > 0 && (
        <aside className="nav-panel" aria-label={`${current?.label} screens`}>
          <div className="nav-panel-head">
            <span>{current?.label}</span>
            <button onClick={() => setPanelOpen(false)} title="Collapse menu" aria-label="Collapse menu">
              <ChevronLeft size={15} />
            </button>
          </div>
          <div className="nav-panel-items">
            {items.map(i => (
              <NavLink
                key={i.path}
                to={i.path}
                className={({ isActive }) => `nav-panel-item${isActive ? ' is-active' : ''}`}
                end={i.path === '/dashboard'}
              >
                <span className="nav-panel-label">{i.label}</span>
                {/* The hint says what a consolidated screen now contains, so
                    someone hunting for "Vendor Supplies" can see where it went
                    rather than concluding it was removed. */}
                {i.hint && <span className="nav-panel-hint">{i.hint}</span>}
              </NavLink>
            ))}
          </div>
        </aside>
      )}

      {!panelOpen && (
        <button className="nav-panel-reopen" onClick={() => setPanelOpen(true)}
          title="Show menu" aria-label="Show menu">
          <ChevronRight size={15} />
        </button>
      )}
    </>
  );
}
