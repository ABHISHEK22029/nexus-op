/* ══════════════════════════════════════════════════════════
   ScopeBar — the organisation, and which slice of it you are looking at.

   Both of these used to sit in the top bar. They belong here instead: they
   answer "where am I", which is the same question the navigation beside them
   answers, and putting them in a strip across the top of every page cost the
   whole width to say two things.

   The project selector hides itself entirely when the business has no
   projects — which is most fabricators, and all of them on day one. An empty
   dropdown labelled "Context" is worse than no dropdown.
   ══════════════════════════════════════════════════════════ */
import React, { useState, useEffect, useRef } from 'react';
import { Building2, Layers, ChevronDown, Check, Globe } from 'lucide-react';
import { useProject } from '../context/ProjectContext';
import { usePermissions } from '../context/PermissionContext';
import { getToken } from '../lib/apiAuth';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function ScopeBar() {
  const { projects, activeProject, setActiveProject, usesProjects } = useProject();
  const { user } = usePermissions();
  const crossTenant = user?.crossTenant === true;
  const [org, setOrg] = useState(null);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const t = getToken();
    if (!t) return;
    fetch(`${API}/company-profile`, { headers: { Authorization: `Bearer ${t}` } })
      .then(r => (r.ok ? r.json() : null)).then(setOrg).catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) return;
    const away = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  const orgName = org?.tradeName || org?.name || 'Your organisation';

  return (
    <div ref={ref} className="nav-scope">
      <div className="nav-scope-org" title={org?.name || orgName}>
        <Building2 size={13} />
        <span>{orgName}</span>
      </div>

      {/* A cross-tenant role sees every organisation's customers, quotations
          and invoices — by design, but indistinguishable from a leak unless
          it is said out loud. Whoever is in this mode needs to know before
          they read a number and act on it.

          The flag comes from the server: a workspace can define its own
          roles, so the browser cannot decide this from the role's name. */}
      {crossTenant && (
        <div
          title="This role reads across every organisation on this installation. Figures you see may belong to another business."
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '2px 8px', borderRadius: 999,
            background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)',
            color: '#dc2626', fontSize: '0.68rem', fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '.04em', whiteSpace: 'nowrap',
          }}
        >
          <Globe size={11} /> All organisations
        </div>
      )}

      {usesProjects && (
        <div style={{ position: 'relative' }}>
          <button
            className="topbar-scope nav-scope-picker"
            onClick={() => setOpen(o => !o)}
            title="What you are looking at"
          >
            <Layers size={12} />
            <span>{activeProject ? activeProject.name : 'All work'}</span>
            <ChevronDown size={12} style={{ opacity: 0.7 }} />
          </button>

          {open && (
            <div className="nav-scope-menu">
              <div className="nav-scope-menu-head">Showing</div>
              <button onClick={() => { setActiveProject(null); setOpen(false); }}>
                <Check size={13} style={{ opacity: activeProject ? 0 : 1 }} />
                <span>All work</span>
              </button>
              {projects.length > 0 && <div className="nav-scope-menu-head">Or one project</div>}
              <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                {projects.map(p => (
                  <button key={p.id} onClick={() => { setActiveProject(p); setOpen(false); }}>
                    <Check size={13} style={{ opacity: activeProject?.id === p.id ? 1 : 0 }} />
                    <span>{p.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
