import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, ShoppingCart, Truck, IndianRupee, FileText } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const ICON = { PO_CREATED: ShoppingCart, GRN_RECEIVED: Truck, PAYMENT_RECEIVED: IndianRupee, APPROVAL_NEEDED: FileText };
const ago = (ts) => {
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

export default function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef(null);

  const load = async () => {
    try {
      const r = await fetch(`${API}/notifications`);
      if (!r.ok) return;
      const d = await r.json();
      setItems(d.items || []); setUnread(d.unread || 0);
    } catch { /* ignore */ }
  };
  useEffect(() => {
    if (!localStorage.getItem('nexus_token')) return;
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const openItem = async (n) => {
    if (!n.is_read) { fetch(`${API}/notifications/${n.id}/read`, { method: 'PATCH' }); }
    setOpen(false);
    if (n.link) navigate(n.link);
    setTimeout(load, 300);
  };
  const readAll = async () => { await fetch(`${API}/notifications/read-all`, { method: 'POST' }); load(); };

  return (
    <div ref={ref} style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
      <button onClick={() => setOpen(!open)} title="Notifications" style={{
        position: 'relative', width: 36, height: 36, borderRadius: 8, cursor: 'pointer',
        background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)',
      }}>
        <Bell size={17} />
        {unread > 0 && (
          <span style={{ position: 'absolute', top: -5, right: -5, minWidth: 17, height: 17, padding: '0 4px', borderRadius: 99, background: 'var(--brand-amber)', color: '#fff', fontSize: '0.62rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 2px var(--bg-surface)' }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 10px)', right: 0, width: 340, maxHeight: 440, overflowY: 'auto', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 12, boxShadow: 'var(--shadow-md)', zIndex: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid var(--border-subtle)', position: 'sticky', top: 0, background: 'var(--bg-surface)' }}>
            <span style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: '0.9rem' }}>Notifications</span>
            {unread > 0 && <button onClick={readAll} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--brand-amber)', fontSize: '0.75rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Check size={13} /> Mark all read</button>}
          </div>
          {items.length === 0 ? (
            <div style={{ padding: 28, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              <Bell size={26} style={{ opacity: 0.35, marginBottom: 8 }} /><div>You're all caught up.</div>
            </div>
          ) : items.map(n => {
            const Icon = ICON[n.type] || Bell;
            return (
              <button key={n.id} onClick={() => openItem(n)} style={{ display: 'flex', gap: 11, width: '100%', textAlign: 'left', padding: '11px 14px', border: 'none', borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer', background: n.is_read ? 'transparent' : 'var(--brand-amber-muted)' }}>
                <span style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 8, background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand-amber)' }}><Icon size={15} /></span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.83rem', color: 'var(--text-primary)' }}>{n.title}</div>
                  {n.message && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 1 }}>{n.message}</div>}
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-disabled)', marginTop: 3, fontFamily: 'var(--font-mono)' }}>{ago(n.created_at)}</div>
                </span>
                {!n.is_read && <span style={{ flexShrink: 0, width: 7, height: 7, borderRadius: 99, background: 'var(--brand-amber)', marginTop: 6 }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
