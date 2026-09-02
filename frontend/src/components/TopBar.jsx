/* ══════════════════════════════════════════════════════════
   TopBar — who you are, what you are looking at, and one place to act.

   What was here had six competing clusters strung along the right edge:
   a gradient "Quick Create" button, a bordered "Context:" project pill, a
   role badge, a notification bell, a 62px theme switch with the word DARK or
   LIGHT printed inside it, and a boxed avatar-plus-name-plus-Sign-out. Six
   boxes, four border styles, two gradients, no hierarchy — and nothing
   saying which business you were signed into.

   Three groups now, in the order the questions actually get asked:

     left    WHERE AM I     the organisation, then the scope being viewed
     right   WHAT CAN I DO  New, then alerts
     far     WHO AM I       one account menu holding role, theme and sign out

   The theme switch moved into that menu on purpose. It is set once and never
   touched again; it does not deserve the widest control in the header.

   The scope selector defaults to All work and hides itself entirely when the
   business has no projects — an empty dropdown labelled "Context" is worse
   than no dropdown, and for a fabricator there is nothing to put in it.
   ══════════════════════════════════════════════════════════ */
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, ChevronDown, LogOut, Sun, Moon, Check,
  Building2, Layers, Settings,
} from 'lucide-react';
import { useProject } from '../context/ProjectContext';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../context/PermissionContext';
import { getToken } from '../lib/apiAuth';
import QuickCreateModal from './QuickCreateModal';
import NotificationBell from './NotificationBell';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const CREATE_ITEMS = [
  { label: 'Vendor', value: 'vendor', info: 'Someone you buy from' },
  { label: 'Indent', value: 'indent', info: 'Material the floor needs' },
  { label: 'Purchase order', value: 'po', info: 'Order from a vendor' },
  { label: 'Project', value: 'project', info: 'Group a long contract' },
];

/* Closes a popover on outside click or Escape. Written once because three
   menus in this bar need it and each hand-rolled version behaved slightly
   differently — one closed on its own clicks, one ignored Escape. */
function useDismiss(open, close) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) close(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey); };
  }, [open, close]);
  return ref;
}

const menuPanel = {
  position: 'absolute', top: 'calc(100% + 8px)', right: 0, minWidth: 232,
  background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
  borderRadius: 12, boxShadow: 'var(--shadow-md)', padding: 6, zIndex: 200,
};
const menuItem = {
  display: 'flex', alignItems: 'center', gap: 9, width: '100%',
  background: 'none', border: 'none', borderRadius: 8, padding: '9px 10px',
  cursor: 'pointer', textAlign: 'left', color: 'var(--text-primary)',
  fontSize: '0.83rem', fontWeight: 600,
};
const hoverIn = e => { e.currentTarget.style.background = 'var(--bg-elevated)'; };
const hoverOut = e => { e.currentTarget.style.background = 'transparent'; };

export default function TopBar() {
  const { projects, activeProject, setActiveProject, usesProjects } = useProject();
  const { isDark, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const { roleLabel } = usePermissions();
  const navigate = useNavigate();

  const [org, setOrg] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [acctOpen, setAcctOpen] = useState(false);
  const [modal, setModal] = useState(null);

  const createRef = useDismiss(createOpen, () => setCreateOpen(false));
  const scopeRef = useDismiss(scopeOpen, () => setScopeOpen(false));
  const acctRef = useDismiss(acctOpen, () => setAcctOpen(false));

  /* The organisation's own name, so the bar says whose books these are. It
     was nowhere on screen before — you could not tell Steelco from a demo
     tenant without opening Settings. */
  useEffect(() => {
    const t = getToken();
    fetch(`${API}/company-profile`, { headers: t ? { Authorization: `Bearer ${t}` } : {} })
      .then(r => (r.ok ? r.json() : null))
      .then(setOrg)
      .catch(() => {});
  }, []);

  const orgName = org?.tradeName || org?.name || 'Your organisation';
  const scopeLabel = activeProject ? activeProject.name : 'All work';

  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 50, minHeight: 58, boxSizing: 'border-box',
      padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 12,
      background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)',
    }}>

      {/* ── WHERE AM I ─────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8, flexShrink: 0,
          background: 'linear-gradient(135deg, var(--brand-amber), hsl(20,90%,50%))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Building2 size={15} color="#fff" />
        </div>
        <span style={{
          fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220,
        }}>{orgName}</span>

        {/* The scope lens. Absent entirely for a business with no projects —
            which is most fabricators, and all of them on day one. */}
        {usesProjects && (
          <div ref={scopeRef} style={{ position: 'relative', marginLeft: 4 }}>
            <button
              onClick={() => setScopeOpen(o => !o)}
              className="topbar-scope"
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                background: activeProject ? 'hsl(28,100%,54%,0.10)' : 'transparent',
                border: `1px solid ${activeProject ? 'hsl(28,100%,54%,0.35)' : 'var(--border-default)'}`,
                borderRadius: 8, padding: '5px 10px', cursor: 'pointer',
                fontSize: '0.79rem', fontWeight: 600,
                color: activeProject ? 'var(--brand-amber)' : 'var(--text-secondary)',
                maxWidth: 240,
              }}
            >
              <Layers size={13} style={{ flexShrink: 0 }} />
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{scopeLabel}</span>
              <ChevronDown size={13} style={{ flexShrink: 0, opacity: 0.7 }} />
            </button>

            {scopeOpen && (
              <div style={{ ...menuPanel, left: 0, right: 'auto', minWidth: 268 }}>
                <div style={{ padding: '7px 10px 5px', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                  Showing
                </div>
                <button
                  style={menuItem} onMouseEnter={hoverIn} onMouseLeave={hoverOut}
                  onClick={() => { setActiveProject(null); setScopeOpen(false); }}
                >
                  <Check size={14} style={{ opacity: activeProject ? 0 : 1, color: 'var(--brand-amber)', flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>All work</span>
                </button>
                <div style={{ height: 1, background: 'var(--border-subtle)', margin: '5px 8px' }} />
                <div style={{ padding: '4px 10px 5px', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                  Or one project
                </div>
                <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                  {projects.map(p => (
                    <button
                      key={p.id} style={menuItem} onMouseEnter={hoverIn} onMouseLeave={hoverOut}
                      onClick={() => { setActiveProject(p); setScopeOpen(false); }}
                    >
                      <Check size={14} style={{ opacity: activeProject?.id === p.id ? 1 : 0, color: 'var(--brand-amber)', flexShrink: 0 }} />
                      <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ flex: 1 }} />

      {/* ── WHAT CAN I DO ──────────────────────────────────── */}
      <div ref={createRef} style={{ position: 'relative' }}>
        <button
          onClick={() => setCreateOpen(o => !o)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'var(--brand-amber)', color: '#fff',
            border: 'none', borderRadius: 8, padding: '7px 13px',
            fontSize: '0.81rem', fontWeight: 700, cursor: 'pointer',
          }}
        >
          <Plus size={14} strokeWidth={3} /> New
        </button>
        {createOpen && (
          <div style={menuPanel}>
            {CREATE_ITEMS.map(item => (
              <button
                key={item.value} style={{ ...menuItem, flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}
                onMouseEnter={hoverIn} onMouseLeave={hoverOut}
                onClick={() => { setModal(item.value); setCreateOpen(false); }}
              >
                <span>{item.label}</span>
                <span style={{ fontSize: '0.7rem', fontWeight: 500, color: 'var(--text-muted)' }}>{item.info}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <NotificationBell />

      {/* ── WHO AM I ───────────────────────────────────────── */}
      <div ref={acctRef} style={{ position: 'relative' }}>
        <button
          onClick={() => setAcctOpen(o => !o)}
          title={user?.name || user?.email || 'Account'}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'transparent', border: '1px solid var(--border-default)',
            borderRadius: 8, padding: '4px 8px 4px 5px', cursor: 'pointer',
          }}
        >
          <div style={{
            width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
            background: 'linear-gradient(135deg, var(--brand-amber), hsl(20,90%,50%))',
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase',
          }}>
            {(user?.name || user?.email || 'U').charAt(0)}
          </div>
          <ChevronDown size={13} style={{ color: 'var(--text-muted)' }} />
        </button>

        {acctOpen && (
          <div style={menuPanel}>
            <div style={{ padding: '8px 10px 10px', borderBottom: '1px solid var(--border-subtle)', marginBottom: 5 }}>
              <div style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user?.name || user?.email || 'User'}
              </div>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--brand-amber)', textTransform: 'uppercase', letterSpacing: '.04em', marginTop: 2 }}>
                {roleLabel || 'Member'}
              </div>
            </div>

            <button style={menuItem} onMouseEnter={hoverIn} onMouseLeave={hoverOut}
              onClick={() => { setAcctOpen(false); navigate('/company-profile'); }}>
              <Settings size={14} style={{ color: 'var(--text-muted)' }} /> Company settings
            </button>

            <button style={menuItem} onMouseEnter={hoverIn} onMouseLeave={hoverOut}
              onClick={toggleTheme}>
              {isDark ? <Sun size={14} style={{ color: 'var(--text-muted)' }} /> : <Moon size={14} style={{ color: 'var(--text-muted)' }} />}
              {isDark ? 'Light theme' : 'Dark theme'}
            </button>

            <div style={{ height: 1, background: 'var(--border-subtle)', margin: '5px 8px' }} />

            <button
              style={{ ...menuItem, color: 'var(--accent-red, #ef4444)' }}
              onMouseEnter={hoverIn} onMouseLeave={hoverOut}
              onClick={() => { logout(); window.location.assign('/login'); }}
            >
              <LogOut size={14} /> Sign out
            </button>
          </div>
        )}
      </div>

      <QuickCreateModal
        type={modal}
        isOpen={modal !== null}
        onClose={() => setModal(null)}
        onSuccess={() => window.location.reload()}
      />
    </div>
  );
}
