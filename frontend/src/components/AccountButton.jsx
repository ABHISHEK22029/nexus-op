/* ══════════════════════════════════════════════════════════
   AccountButton — the whole top bar, reduced to one round avatar.

   What was here was a full-width bar carrying a gradient "Quick Create"
   button, a bordered "Context:" project pill, a role badge, a notification
   bell, a 62px switch with the word LIGHT printed inside it, and a boxed
   avatar with a name and a Sign out button. Six controls, permanently on
   screen, above every page.

   Almost none of it earned that space:

     · Quick Create duplicated the "+ Add …" button every list page already
       has, in the place you are already looking when you want one.
     · Context: was a project selector for a business that may have no
       projects — it now lives in the left rail, where navigation lives.
     · The theme switch is set once and never touched again.
     · Sign out is a once-a-day action that was as prominent as the primary
       one.

   So: an avatar, top right. Clicking it opens the account card — the shape
   people already know from Gmail, because that is where they learned it:
   who am I, which organisation, and the two or three things I might change.
   ══════════════════════════════════════════════════════════ */
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Sun, Moon, Settings, Building2, Bell, ChevronLeft } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../context/PermissionContext';
import { getToken } from '../lib/apiAuth';
import { NotificationList } from './NotificationBell';
import useNotifications from '../hooks/useNotifications';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function AccountButton() {
  const { isDark, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const { roleLabel } = usePermissions();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [org, setOrg] = useState(null);
  /* 'menu', or 'notifications' when the list is open inside the card. */
  const [view, setView] = useState('menu');
  const { items, unread, load: reloadNotes, openItem, readAll } = useNotifications();
  const ref = useRef(null);

  useEffect(() => {
    const t = getToken();
    if (!t) return;
    const h = { Authorization: `Bearer ${t}` };
    fetch(`${API}/company-profile`, { headers: h })
      .then(r => (r.ok ? r.json() : null)).then(setOrg).catch(() => {});
  }, []);

  /* The bell went with the bar, but notifications still have to be readable
     from anywhere: the count rides on the avatar, and the list opens inside
     the account card. It used to link to Activity — the audit log — so the
     count pointed at a page that did not show what it was counting. */
  const toggleOpen = () => {
    setOpen(o => {
      if (!o) { setView('menu'); reloadNotes(); }
      return !o;
    });
  };

  useEffect(() => {
    if (!open) return;
    const away = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  const name = user?.name || user?.email || 'User';
  const email = user?.email || '';
  const initial = String(name).charAt(0).toUpperCase();
  const orgName = org?.tradeName || org?.name || null;

  const row = {
    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
    background: 'none', border: 'none', borderRadius: 9, padding: '10px 12px',
    cursor: 'pointer', textAlign: 'left', color: 'var(--text-primary)',
    fontSize: '0.85rem', fontWeight: 500,
  };
  const hoverIn = e => { e.currentTarget.style.background = 'var(--bg-elevated)'; };
  const hoverOut = e => { e.currentTarget.style.background = 'transparent'; };

  return (
    <div ref={ref} style={{ position: 'fixed', top: 14, right: 20, zIndex: 120 }}>
      <button
        onClick={toggleOpen}
        aria-label={`Account — ${name}${unread > 0 ? `, ${unread} unread notification${unread === 1 ? '' : 's'}` : ''}`}
        title={name}
        style={{
          position: 'relative', width: 36, height: 36, borderRadius: '50%',
          border: '2px solid var(--bg-surface)', cursor: 'pointer', padding: 0,
          background: 'linear-gradient(135deg, var(--brand-amber), hsl(20,90%,50%))',
          color: '#fff', fontSize: '0.9rem', fontWeight: 800,
          boxShadow: '0 2px 10px rgba(0,0,0,0.18)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {initial}
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: -3, right: -3, minWidth: 17, height: 17,
            padding: '0 4px', borderRadius: 999, background: '#ef4444', color: '#fff',
            fontSize: '0.62rem', fontWeight: 800, lineHeight: '17px',
            border: '2px solid var(--bg-base)',
          }}>{unread > 9 ? '9+' : unread}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 10px)', right: 0, width: 320,
          background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
          borderRadius: 16, boxShadow: '0 16px 48px rgba(0,0,0,0.22)', padding: 8,
          animation: 'dropdownFade 140ms ease-out',
        }}>
          {view === 'notifications' ? (
            <>
              <button style={{ ...row, fontWeight: 700 }} onMouseEnter={hoverIn} onMouseLeave={hoverOut} onClick={() => setView('menu')}>
                <ChevronLeft size={15} style={{ color: 'var(--text-muted)' }} /> Back
              </button>
              <NotificationList items={items} unread={unread} maxHeight={420}
                onOpen={(n) => { setOpen(false); openItem(n); }} onReadAll={readAll} />
            </>
          ) : (<>
          {/* Identity, in the order it is asked: who, which company, what may I do */}
          <div style={{ textAlign: 'center', padding: '16px 12px 14px' }}>
            <div style={{
              width: 62, height: 62, borderRadius: '50%', margin: '0 auto 10px',
              background: 'linear-gradient(135deg, var(--brand-amber), hsl(20,90%,50%))',
              color: '#fff', fontSize: '1.5rem', fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{initial}</div>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>{name}</div>
            {email && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>{email}</div>}
            <div style={{
              display: 'inline-block', marginTop: 8, padding: '3px 11px', borderRadius: 999,
              background: 'hsl(28,100%,54%,0.12)', color: 'var(--brand-amber)',
              fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em',
            }}>{roleLabel || 'Member'}</div>
          </div>

          {orgName && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 9,
              padding: '10px 12px', margin: '0 4px 6px', borderRadius: 10,
              background: 'var(--bg-elevated)',
            }}>
              <Building2 size={15} style={{ color: 'var(--brand-amber)', flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>Organisation</div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{orgName}</div>
              </div>
            </div>
          )}

          <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 10px 6px' }} />

          <button style={row} onMouseEnter={hoverIn} onMouseLeave={hoverOut} data-open-notifications
            onClick={() => setView('notifications')}>
            <Bell size={15} style={{ color: 'var(--text-muted)' }} />
            <span style={{ flex: 1 }}>Notifications</span>
            {unread > 0 && (
              <span style={{
                minWidth: 18, height: 18, borderRadius: 999, background: '#ef4444', color: '#fff',
                fontSize: '0.66rem', fontWeight: 800, lineHeight: '18px', textAlign: 'center', padding: '0 5px',
              }}>{unread}</span>
            )}
          </button>

          <button style={row} onMouseEnter={hoverIn} onMouseLeave={hoverOut}
            onClick={() => { setOpen(false); navigate('/company-profile'); }}>
            <Settings size={15} style={{ color: 'var(--text-muted)' }} /> Company settings
          </button>

          <button style={row} onMouseEnter={hoverIn} onMouseLeave={hoverOut} onClick={toggleTheme}>
            {isDark ? <Sun size={15} style={{ color: 'var(--text-muted)' }} /> : <Moon size={15} style={{ color: 'var(--text-muted)' }} />}
            {isDark ? 'Light theme' : 'Dark theme'}
          </button>

          <div style={{ height: 1, background: 'var(--border-subtle)', margin: '6px 10px' }} />

          <button
            style={{ ...row, color: 'var(--accent-red, #ef4444)' }}
            onMouseEnter={hoverIn} onMouseLeave={hoverOut}
            onClick={() => { logout(); window.location.assign('/login'); }}
          >
            <LogOut size={15} /> Sign out
          </button>
          </>)}
        </div>
      )}
    </div>
  );
}
