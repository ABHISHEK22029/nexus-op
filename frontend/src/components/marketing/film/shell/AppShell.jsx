import React from 'react';
import { ChevronRight, Home } from 'lucide-react';
import { moduleForPath, visibleItems, visibleModules, MODULES } from '../../../../lib/navigation';
import { NAV_ICONS } from '../../../../lib/navIcons';

/* ══════════════════════════════════════════════════════════════════════
   Maks Ops, as the film shows it: the app's window, rail and panel.

   The menu is not drawn by hand. It is the app's own navigation
   (lib/navigation.js), filtered the way the app filters it — by what the
   role may read, with the contracting module switched off as a fabricator
   would have it. Add a screen to the app's menu and it appears here; take
   one away and it goes. The team-and-roles chapter passes another role's
   permissions and the same menu narrows, exactly as it does for that
   person.

   `path` is the screen on show: it picks the module and highlights the
   item. `badges` puts a count beside an item, as the menu's own badges do.
   ══════════════════════════════════════════════════════════════════════ */
const FABRICATOR = { contracting: false };
const everything = () => true;

export default function AppShell({ path, role = 'Owner', can = everything, badges = {}, layout = 'wide', children }) {
  const modules = visibleModules(can, role, FABRICATOR);
  const active = moduleForPath(path);
  const mod = MODULES.find((m) => m.key === active);
  const items = visibleItems(active, can, role, FABRICATOR);
  const here = items
    .filter((i) => i.path && (path === i.path || path.startsWith(`${i.path}/`)))
    .sort((a, b) => b.path.length - a.path.length)[0];
  const ModIcon = NAV_ICONS[mod?.icon] || Home;

  return (
    <div className={`fm-app is-${layout}`} data-role-view={role}>
      <div className="fm-chrome">
        <span className="fl-lights" aria-hidden="true"><i /><i /><i /></span>
        <span className="fm-url">maksops.co.in<b>{path}</b></span>
        <span className="fm-who"><i>{role.charAt(0)}</i>{role}</span>
      </div>
      <div className="fm-app-body">
        {layout === 'wide' ? (
          <>
            <nav className="fm-rail">
              {modules.map((m) => {
                const Icon = NAV_ICONS[m.icon] || Home;
                return (
                  <span key={m.key} data-nav-module={m.key} className={`fm-rail-item${m.key === active ? ' is-on' : ''}`}>
                    <Icon size={17} />
                    <small>{m.label}</small>
                  </span>
                );
              })}
            </nav>
            <aside className="fm-panel">
              <b className="fm-panel-h">{mod?.label}</b>
              {items.map((i, k) => (i.group ? (
                <small key={`g${k}`} className="fm-panel-group">{i.group}</small>
              ) : (
                <span key={i.path} data-nav-item={i.path} className={`fm-panel-item${i === here ? ' is-on' : ''}`}>
                  <span>{i.label}</span>
                  {badges[i.path] ? <em className={`fm-badge tone-${i.badge?.tone || 'info'}`}>{badges[i.path]}</em> : null}
                </span>
              )))}
            </aside>
          </>
        ) : (
          <div className="fm-appbar">
            <ModIcon size={15} /> {mod?.label}
            {here && <><ChevronRight size={13} className="fm-appbar-sep" /> <b>{here.label}</b></>}
          </div>
        )}
        <main className="fm-content">{children}</main>
      </div>
    </div>
  );
}
