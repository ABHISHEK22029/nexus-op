/* ══════════════════════════════════════════════════════════
   SetupReadiness — why a screen is empty, said out loud.

   The deficiency engine returns nothing on a fresh install, and every
   feature above it therefore does nothing. Not because any of it is broken:
   because its inputs are empty. From the screens that is close to
   undiagnosable — you open Material Requirements, see an empty table, and
   conclude the feature does not work.

   Deliberately NOT a progress percentage. "82% set up" tells nobody what to
   do next. Each row says what is missing, what it costs you, and where to
   go — because "add BOMs" is a chore and "without this an order produces no
   material demand at all" is a reason.

   It disappears entirely once everything is in place. A permanent setup
   banner is one people stop seeing.
   ══════════════════════════════════════════════════════════ */
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ChevronDown, ChevronUp, CheckCircle2 } from 'lucide-react';
import { getToken } from '../lib/apiAuth';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

/* Where each check's fix actually lives, so the row is a link rather than
   an instruction to go and find something. */
const FIX_PATH = {
  company: '/company-profile',
  stock_links: '/inventory',
  boms: '/items',
  vendor_links: '/vendors?tab=supplies',
  open_orders: '/customer-orders',
  parties: '/customers',
};

export default function SetupReadiness({ compact = false }) {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(!compact);

  useEffect(() => {
    const token = getToken();
    fetch(`${API}/setup/readiness`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => {});
  }, []);

  if (!data || data.ready) return null;   // nothing to say once it's set up

  const blocking = data.checks.filter(c => !c.ok);

  return (
    <div style={{
      background: 'rgba(245,158,11,0.08)',
      border: '1px solid rgba(245,158,11,0.35)',
      borderRadius: 12, padding: '14px 16px', marginBottom: 18,
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 9, width: '100%',
          background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left',
        }}
      >
        <AlertTriangle size={17} style={{ color: '#b45309', flexShrink: 0 }} />
        <span style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-primary)' }}>
          {data.headline}
        </span>
        <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', display: 'flex' }}>
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </span>
      </button>

      {open && (
        <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
          {blocking.map(c => (
            <div key={c.key} style={{
              display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 10,
              alignItems: 'start', paddingTop: 10, borderTop: '1px solid rgba(245,158,11,0.2)',
            }}>
              <span style={{
                fontSize: '0.72rem', fontWeight: 800, color: '#b45309',
                background: 'rgba(245,158,11,0.15)', padding: '2px 8px', borderRadius: 6,
                whiteSpace: 'nowrap', marginTop: 1,
              }}>{c.have}</span>

              <div>
                <div style={{ fontWeight: 600, fontSize: '0.87rem', color: 'var(--text-primary)' }}>{c.label}</div>
                {/* The cost, not the chore — this is what makes it worth doing. */}
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.45 }}>
                  {c.cost}
                </div>
              </div>

              {FIX_PATH[c.key] && (
                <Link to={FIX_PATH[c.key]} className="btn-secondary"
                  style={{ textDecoration: 'none', fontSize: '0.78rem', padding: '4px 11px', whiteSpace: 'nowrap' }}>
                  Fix this
                </Link>
              )}
            </div>
          ))}

          {data.checks.some(c => c.ok) && (
            <div style={{ paddingTop: 8, borderTop: '1px solid rgba(245,158,11,0.2)', fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <CheckCircle2 size={13} style={{ color: '#10b981' }} />
              Already done: {data.checks.filter(c => c.ok).map(c => c.label.toLowerCase()).join(' · ')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
